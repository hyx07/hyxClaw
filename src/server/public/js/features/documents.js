import { escHtml } from "../format.js";
import { renderContent } from "../markdown.js";
import { openKnowledgeModal } from "./knowledge.js";
import { openUsageModal, setUsageDays, switchUsageTab, toggleUsageMetric } from "./usage.js";
import { getDocRailWidth, initDocColumnResize, initDocResizeHandle, initDocVerticalResize, initSidebarResizeHandle } from "./document-layout.js";
import { getDocSelectionSummary, getLineNumberFromOffset } from "./document-selection.js";

export { initSidebarResizeHandle } from "./document-layout.js";

let reportError = (message) => console.error(message);
export function configureDocuments(options) {
  reportError = options.showError;
}

const DOC_BROWSER_ROOTS = ["knowledge_base", "inputs"];
let docRootPath = null;
let docSecondEntries = [];
let docSecondActivePath = null;
let docThirdEntries = [];
let docThirdDirPath = null;
let docThirdActivePath = null;
let docPreviewPath = "";
let docPreviewContent = "";
let docPreviewSupported = true;
let docPreviewKind = "text";
let docEditMode = false;
let selectedPreviewText = "";
let selectedPreviewSummary = "";
let selectedPreviewStartLine = 0;
let selectedPreviewEndLine = 0;

function getDocSelectionStatusText() {
  if (!selectedPreviewText || !selectedPreviewStartLine || !selectedPreviewEndLine) return "";
  return `已选中第 ${selectedPreviewStartLine} 行到第 ${selectedPreviewEndLine} 行`;
}

function getDocEntryIcon(kind) {
  return kind === "directory"
    ? '<i data-lucide="folder" class="doc-entry-icon"></i>'
    : '<i data-lucide="file" class="doc-entry-icon"></i>';
}

function buildDocColumn(title, entries, activePath, options = {}) {
  const { showBack = false, backDisabled = true } = options;
  return `
    <div class="doc-column">
      <div class="doc-column-header">
        ${showBack ? `<button class="doc-back-btn" id="doc-back-btn" ${backDisabled ? "disabled" : ""}>返回</button>` : ""}
        <span class="doc-column-title">${escHtml(title)}</span>
      </div>
      <div class="doc-column-body">
        ${entries.length ? entries.map((entry) => `
          <button class="doc-entry ${entry.path === activePath ? "active" : ""}" data-doc-path="${escHtml(entry.path)}" data-doc-kind="${entry.kind}" type="button">
            <span>${getDocEntryIcon(entry.kind)}</span>
            <span class="doc-entry-label">${escHtml(entry.name)}</span>
          </button>
        `).join("") : '<div class="doc-empty">暂无内容</div>'}
      </div>
    </div>
  `;
}

export function getRightPanelHTML(opts = {}) {
  const railCollapsed = localStorage.getItem("docRailCollapsed") === "true";
  const width = railCollapsed ? 44 : getDocRailWidth();
  const showToggle = opts.showToggle !== false;
  const toggleHTML = showToggle ? `<button id="doc-rail-toggle" class="icon-button" title="${railCollapsed ? "展开文件浏览器" : "收起文件浏览器"}" aria-label="${railCollapsed ? "展开文件浏览器" : "收起文件浏览器"}" aria-expanded="${!railCollapsed}"><i data-lucide="${railCollapsed ? "panel-right-open" : "panel-right-close"}"></i></button>` : "";
  return `
    <div id="doc-rail-resize" title="拖拽调整右栏宽度"></div>
    <aside id="action-rail" class="${railCollapsed ? "collapsed" : ""}" style="width:${width}px">
      ${toggleHTML}
      <div id="doc-browser">
        <div id="doc-columns"></div>
        <div id="doc-vertical-resizer"></div>
        <section id="doc-preview-panel">
          <div id="doc-preview-toolbar">
            <div id="doc-selection-status">
              <div class="doc-preview-path"></div>
              <div class="doc-selection-lines"></div>
              <div class="doc-selection-summary"></div>
            </div>
            <div class="doc-toolbar-actions">
              <button id="doc-clear-selection-btn" class="icon-button" type="button" title="清除选择" aria-label="清除选择"><i data-lucide="x-circle"></i></button>
              <button id="doc-refresh-btn" class="icon-button" type="button" title="刷新" aria-label="刷新"><i data-lucide="refresh-cw"></i></button>
              <button id="doc-edit-btn" class="icon-button" type="button" title="编辑" aria-label="编辑"><i data-lucide="pencil"></i></button>
            </div>
          </div>
          <div id="doc-preview-content" class="${docPreviewSupported ? "" : "unsupported"}"></div>
        </section>
      </div>
    </aside>
  `;
}

async function fetchDocTree(path) {
  const res = await fetch(`/api/documents/tree?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "读取目录失败");
  return Array.isArray(data.entries) ? data.entries : [];
}

async function fetchDocContent(path) {
  const res = await fetch(`/api/documents/content?path=${encodeURIComponent(path)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "读取文件失败");
  return data;
}

export function clearPreviewSelection() {
  selectedPreviewText = "";
  selectedPreviewSummary = "";
  selectedPreviewStartLine = 0;
  selectedPreviewEndLine = 0;
  updateDocSelectionStatus();
}

function clearDocPreviewContext() {
  docEditMode = false;
  docPreviewPath = "";
  docPreviewContent = "";
  docPreviewSupported = true;
  docPreviewKind = "text";
  clearPreviewSelection();
  updateDocPreviewPanel();
}

async function toggleDocEdit() {
  if (!docPreviewPath || docPreviewKind !== "text") return;
  const container = document.getElementById("doc-preview-content");
  let scrollRatio = 0;
  if (docEditMode) {
    const textarea = container?.querySelector(".doc-edit-textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      const maxScroll = textarea.scrollHeight - textarea.clientHeight;
      scrollRatio = maxScroll > 0 ? textarea.scrollTop / maxScroll : 0;
      const newContent = textarea.value;
      try {
        const res = await fetch("/api/documents/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: docPreviewPath, content: newContent }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "保存失败");
        docPreviewContent = newContent;
      } catch (error) {
        reportError((error && error.message) ? error.message : "保存文件失败");
        return;
      }
    }
    docEditMode = false;
    updateDocPreviewPanel();
    if (container) {
      const maxScroll = container.scrollHeight - container.clientHeight;
      container.scrollTop = Math.min(scrollRatio * maxScroll, maxScroll);
    }
  } else {
    if (container) {
      const maxScroll = container.scrollHeight - container.clientHeight;
      scrollRatio = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
    }
    docEditMode = true;
    clearPreviewSelection();
    updateDocPreviewPanel();
    const textarea = container?.querySelector(".doc-edit-textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      const maxScroll = textarea.scrollHeight - textarea.clientHeight;
      textarea.scrollTop = Math.min(scrollRatio * maxScroll, maxScroll);
    }
  }
  updateDocSelectionStatus();
}

function updateDocSelectionStatus() {
  const pathEl = document.querySelector("#doc-selection-status .doc-preview-path");
  const linesEl = document.querySelector("#doc-selection-status .doc-selection-lines");
  const summaryEl = document.querySelector("#doc-selection-status .doc-selection-summary");
  const clearBtn = document.getElementById("doc-clear-selection-btn");
  const editBtn = document.getElementById("doc-edit-btn");
  if (pathEl) pathEl.textContent = docPreviewPath || "";
  if (linesEl) linesEl.textContent = getDocSelectionStatusText();
  if (summaryEl) summaryEl.textContent = selectedPreviewSummary ? `"${selectedPreviewSummary}"` : "";
  if (clearBtn) clearBtn.disabled = !selectedPreviewText && !docPreviewPath;
  if (editBtn) {
    const editIcon = docEditMode ? "log-out" : "pencil";
    if (editBtn.dataset.icon !== editIcon) {
      editBtn.dataset.icon = editIcon;
      editBtn.innerHTML = `<i data-lucide="${editIcon}"></i>`;
      window.lucide?.createIcons();
    }
    editBtn.disabled = !docPreviewPath || docPreviewKind !== "text";
  }
}

export function getSelectedPreviewPayload() {
  if (!selectedPreviewText) return undefined;
  const header = getDocSelectionStatusText();
  return `${header}：\n${selectedPreviewText}`;
}

export function getPreviewContextPayload() {
  return {
    previewPath: docPreviewPath || undefined,
    selectedPreviewText: getSelectedPreviewPayload(),
  };
}

export function updateSelectedPreviewTextFromSelection() {
  if (docEditMode || docPreviewKind !== "text") return;
  const preview = document.getElementById("doc-preview-content");
  const selection = window.getSelection();
  if (!preview || !selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  if (!common || !preview.contains(common)) {
    return;
  }
  const nextText = selection.toString().trim();
  if (!nextText) return;
  selectedPreviewText = nextText;
  selectedPreviewSummary = getDocSelectionSummary(nextText);
  selectedPreviewStartLine = getLineNumberFromOffset(preview, range.startContainer, range.startOffset);
  selectedPreviewEndLine = getLineNumberFromOffset(preview, range.endContainer, range.endOffset);
  updateDocSelectionStatus();
}

function updateDocPreviewPanel() {
  const content = document.getElementById("doc-preview-content");
  if (!content) return;
  content.classList.toggle("unsupported", !docPreviewSupported);
  content.classList.toggle("image-preview", docPreviewKind === "image");
  if (!docPreviewPath) {
    content.classList.remove("markdown-body");
    content.classList.remove("image-preview");
    content.textContent = "请选择一个文件进行预览";
    return;
  }
  if (!docPreviewSupported) {
    content.classList.remove("markdown-body");
    content.textContent = docPreviewContent || "暂不支持预览";
    return;
  }
  if (docPreviewKind === "image") {
    content.classList.remove("markdown-body");
    content.innerHTML = "";
    const img = document.createElement("img");
    img.className = "doc-preview-image";
    img.src = docPreviewContent || "";
    img.alt = docPreviewPath;
    content.appendChild(img);
    return;
  }
  if (docEditMode) {
    content.classList.remove("markdown-body");
    content.innerHTML = `<textarea class="doc-edit-textarea" spellcheck="false">${escHtml(docPreviewContent || "")}</textarea>`;
    return;
  }
  content.classList.add("markdown-body");
  const basePath = docPreviewPath ? docPreviewPath.replace(/[^/\\]*$/, "") : "";
  renderContent(content, docPreviewContent, basePath);
}

async function openDocPreview(path) {
  try {
    const data = await fetchDocContent(path);
    docPreviewPath = data.path || path;
    docPreviewContent = data.content || "";
    docPreviewSupported = data.supported !== false;
    docPreviewKind = data.kind || (docPreviewSupported ? "text" : "unsupported");
    docEditMode = false;
    clearPreviewSelection();
    updateDocPreviewPanel();
  } catch (error) {
    reportError((error && error.message) ? error.message : "读取文件失败");
  }
}

function renderDocColumns() {
  const container = document.getElementById("doc-columns");
  if (!container) return;
  const scrollTops = Array.from(container.querySelectorAll(".doc-column-body")).map((el) => el.scrollTop);
  container.innerHTML = [
    buildDocColumn("根目录", DOC_BROWSER_ROOTS.map((root) => ({ name: root, path: root, kind: "directory" })), docRootPath),
    '<div class="doc-column-resizer" data-column-resizer="0" title="拖拽调整文件树列宽"></div>',
    buildDocColumn(docRootPath || "", docSecondEntries, docSecondActivePath),
    '<div class="doc-column-resizer" data-column-resizer="1" title="拖拽调整文件树列宽"></div>',
    buildDocColumn(docThirdDirPath ? docThirdDirPath.split("/").pop() || "" : "", docThirdEntries, docThirdActivePath, {
      showBack: true,
      backDisabled: !docThirdDirPath || docThirdDirPath === docSecondActivePath,
    }),
  ].join("");
  container.querySelectorAll(".doc-column-body").forEach((el, index) => {
    el.scrollTop = scrollTops[index] || 0;
  });
  window.lucide?.createIcons();
  initDocColumnResize();

  container.querySelectorAll(".doc-entry").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.docPath;
      const kind = button.dataset.docKind;
      if (!path) return;

      if (path === "knowledge_base" || path === "inputs") {
        docRootPath = path;
        docSecondActivePath = null;
        docThirdDirPath = null;
        docThirdEntries = [];
        docThirdActivePath = null;
        docSecondEntries = await fetchDocTree(path);
        renderDocColumns();
        return;
      }

      const docColumns = container.querySelectorAll(".doc-column");
      const inSecondColumn = button.closest(".doc-column") === docColumns[1];
      if (inSecondColumn) {
        docSecondActivePath = path;
        if (kind === "directory") {
          docThirdDirPath = path;
          docThirdActivePath = null;
          docThirdEntries = await fetchDocTree(path);
        } else {
          docThirdActivePath = path;
          docThirdDirPath = null;
          docThirdEntries = [];
          await openDocPreview(path);
        }
        renderDocColumns();
        return;
      }

      if (kind === "directory") {
        docThirdDirPath = path;
        docThirdActivePath = null;
        docThirdEntries = await fetchDocTree(path);
        renderDocColumns();
        return;
      }

      docThirdActivePath = path;
      await openDocPreview(path);
      renderDocColumns();
    });
  });

  document.getElementById("doc-back-btn")?.addEventListener("click", async () => {
    if (!docThirdDirPath || docThirdDirPath === docSecondActivePath) return;
    const parts = docThirdDirPath.split("/");
    parts.pop();
    const parentPath = parts.join("/");
    if (!parentPath || parentPath === docRootPath) {
      docThirdDirPath = docSecondActivePath;
    } else {
      docThirdDirPath = parentPath;
    }
    if (docThirdDirPath) {
      docThirdEntries = await fetchDocTree(docThirdDirPath);
    } else {
      docThirdEntries = [];
    }
    renderDocColumns();
  });
}

export async function refreshDocBrowser() {
  try {
    clearPreviewSelection();
    if (docRootPath) {
      docSecondEntries = await fetchDocTree(docRootPath);
      if (docSecondActivePath && !docSecondEntries.some((entry) => entry.path === docSecondActivePath)) {
        docSecondActivePath = null;
        docThirdDirPath = null;
        docThirdEntries = [];
      } else if (docSecondActivePath && docThirdDirPath) {
        try {
          docThirdEntries = await fetchDocTree(docThirdDirPath);
        } catch {
          docThirdDirPath = docSecondActivePath;
          docThirdEntries = docThirdDirPath ? await fetchDocTree(docThirdDirPath) : [];
        }
      }
    }

    if (docPreviewPath) {
      try {
        const data = await fetchDocContent(docPreviewPath);
        docPreviewPath = data.path || docPreviewPath;
        docPreviewContent = data.content || "";
        docPreviewSupported = data.supported !== false;
        docPreviewKind = data.kind || (docPreviewSupported ? "text" : "unsupported");
      } catch {
        docPreviewPath = "";
        docPreviewContent = "";
        docPreviewSupported = true;
        docPreviewKind = "text";
        clearPreviewSelection();
      }
    }

    renderDocColumns();
    updateDocPreviewPanel();
    updateDocSelectionStatus();
  } catch (error) {
    reportError((error && error.message) ? error.message : "刷新文档结构失败");
  }
}

function initDocRailToggle() {
  const rail = document.getElementById("action-rail");
  const btn = document.getElementById("doc-rail-toggle");
  if (!rail || !btn || btn.dataset.initialized) return;
  btn.dataset.initialized = "true";

  btn.addEventListener("click", () => {
    const isCollapsed = !rail.classList.contains("collapsed");
    rail.classList.toggle("collapsed", isCollapsed);
    localStorage.setItem("docRailCollapsed", String(isCollapsed));

    // Update icon
    const newIcon = isCollapsed ? "panel-right-open" : "panel-right-close";
    btn.innerHTML = `<i data-lucide="${newIcon}"></i>`;
    btn.title = isCollapsed ? "展开文件浏览器" : "收起文件浏览器";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-expanded", String(!isCollapsed));

    // When collapsing, save current width; when expanding, restore
    if (!isCollapsed) {
      const savedWidth = getDocRailWidth();
      rail.style.width = `${savedWidth}px`;
    }

    window.lucide?.createIcons();
  });
}

export function initRightPanel() {
  initDocVerticalResize();
  initDocRailToggle();
  document.getElementById("usage-btn")?.addEventListener("click", openUsageModal);
  document.querySelectorAll(".usage-tab").forEach((el) => {
    el.addEventListener("click", () => switchUsageTab(el.dataset.tab));
  });
  document.querySelectorAll(".usage-range-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const days = parseInt(el.dataset.days, 10);
      document.querySelectorAll(".usage-range-btn").forEach((b) => b.classList.toggle("active", b === el));
      setUsageDays(days);
    });
  });
  document.querySelectorAll(".usage-metric-toggle").forEach((el) => {
    el.addEventListener("click", () => toggleUsageMetric(el.dataset.metric));
  });
  document.getElementById("knowledge-btn")?.addEventListener("click", openKnowledgeModal);
  document.getElementById("doc-refresh-btn")?.addEventListener("click", refreshDocBrowser);
  document.getElementById("doc-edit-btn")?.addEventListener("click", toggleDocEdit);
  document.getElementById("doc-clear-selection-btn")?.addEventListener("click", clearDocPreviewContext);
  document.getElementById("doc-preview-content")?.addEventListener("click", () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim()) return;
    if (!selectedPreviewText) return;
    clearPreviewSelection();
  });
  initDocResizeHandle();
  renderDocColumns();
  updateDocPreviewPanel();
  updateDocSelectionStatus();
}
