import { escHtml } from "../format.js";
import { renderContent } from "../markdown.js";
import { openKnowledgeModal } from "./knowledge.js";
import { openUsageModal, setUsageDays, switchUsageTab, toggleUsageMetric } from "./usage.js";
import { getDocRailWidth, initDocResizeHandle, initSidebarTreeResize } from "./document-layout.js";
import { getDocSelectionSummary, getSourceLineNumberFromOffset } from "./document-selection.js";

let reportError = (message) => console.error(message);
export function configureDocuments(options) {
  reportError = options.showError;
}

const DOC_BROWSER_ROOTS = ["inputs", "knowledge_base"];
const TREE_EXPANDED_KEY = "fileTreeExpanded";
const DOC_TABS_KEY = "docOpenTabs";
const DOC_RECENT_KEY = "docRecentOpened";
const MAX_RECENT_OPENED = 3;

// 文件树状态：各目录的子项缓存 + 展开的目录集合（跨会话/刷新保留，存于左侧栏）
let treeChildren = new Map();
let expandedPaths = loadExpandedPaths();

// 打开的标签页（跨会话/刷新保留）：{ path, editMode }
let openTabs = loadOpenTabs();
let activeTabPath = openTabs.length ? openTabs[0].path : null;

// 最近打开过的文件路径（最多 3 个，MRU 顺序，跨会话/刷新保留），用于 @ 引用时置顶
let recentOpenedPaths = loadRecentOpened();

// 发送消息时是否附带当前浏览文件路径与选中文本（跨会话保留，默认开启）
let attachDocContext = loadAttachDocContext();

// 当前活动标签的内容状态
let docPreviewContent = "";
let docPreviewSupported = true;
let docPreviewKind = "text";
let selectedPreviewText = "";
let selectedPreviewSummary = "";
let selectedPreviewStartLine = 0;
let selectedPreviewEndLine = 0;

function loadExpandedPaths() {
  try {
    const stored = JSON.parse(localStorage.getItem(TREE_EXPANDED_KEY) || "[]");
    if (!Array.isArray(stored)) return new Set();
    return new Set(stored.filter((path) => typeof path === "string" && path));
  } catch {
    return new Set();
  }
}

function saveExpandedPaths() {
  try {
    localStorage.setItem(TREE_EXPANDED_KEY, JSON.stringify([...expandedPaths]));
  } catch {
    // ignore
  }
}

function loadOpenTabs() {
  try {
    const stored = JSON.parse(localStorage.getItem(DOC_TABS_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((tab) => tab && typeof tab.path === "string" && tab.path)
      .map((tab) => ({
        path: tab.path,
        editMode: tab.editMode === true,
        // 旧数据没有 sticky 字段，视为常驻标签
        sticky: tab.sticky !== false,
      }));
  } catch {
    return [];
  }
}

function saveOpenTabs() {
  try {
    localStorage.setItem(DOC_TABS_KEY, JSON.stringify(openTabs));
  } catch {
    // ignore
  }
}

function loadRecentOpened() {
  try {
    const stored = JSON.parse(localStorage.getItem(DOC_RECENT_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((path) => typeof path === "string" && path).slice(0, MAX_RECENT_OPENED);
  } catch {
    return [];
  }
}

function saveRecentOpened() {
  try {
    localStorage.setItem(DOC_RECENT_KEY, JSON.stringify(recentOpenedPaths));
  } catch {
    // ignore
  }
}

function recordRecentOpened(path) {
  recentOpenedPaths = [path, ...recentOpenedPaths.filter((item) => item !== path)].slice(0, MAX_RECENT_OPENED);
  saveRecentOpened();
}

export function getRecentOpenedPaths() {
  return [...recentOpenedPaths];
}

function getActiveTabEditMode() {
  return openTabs.find((tab) => tab.path === activeTabPath)?.editMode ?? false;
}

function loadAttachDocContext() {
  try {
    return localStorage.getItem("docAttachContext") !== "false";
  } catch {
    return true;
  }
}

function getDocSelectionStatusText() {
  if (!selectedPreviewText || !selectedPreviewStartLine || !selectedPreviewEndLine) return "";
  return `已选中源文件第 ${selectedPreviewStartLine} 行到第 ${selectedPreviewEndLine} 行`;
}

/* ---- 左侧栏文件树：单列可展开树，根目录为 inputs / knowledge_base ---- */

function buildTreeRows() {
  const rows = [];
  for (const root of DOC_BROWSER_ROOTS) {
    rows.push({ path: root, kind: "directory", name: root, depth: 0 });
    if (expandedPaths.has(root)) appendTreeChildren(rows, root, 1);
  }
  return rows;
}

function appendTreeChildren(rows, dirPath, depth) {
  const entries = treeChildren.get(dirPath);
  if (!entries) return;
  for (const entry of entries) {
    rows.push({ ...entry, depth });
    if (entry.kind === "directory" && expandedPaths.has(entry.path)) {
      appendTreeChildren(rows, entry.path, depth + 1);
    }
  }
}

async function ensureTreeChildren(path) {
  if (treeChildren.has(path)) return;
  try {
    treeChildren.set(path, await fetchDocTree(path));
  } catch {
    treeChildren.set(path, []);
  }
}

async function toggleTreeNode(path) {
  if (expandedPaths.has(path)) {
    expandedPaths.delete(path);
    saveExpandedPaths();
    renderFileTree();
    return;
  }
  expandedPaths.add(path);
  saveExpandedPaths();
  await ensureTreeChildren(path);
  renderFileTree();
}

function renderFileTree() {
  const container = document.getElementById("file-tree-body");
  if (!container) return;
  // 重绘会重建 DOM 并丢失焦点，先记住树内被聚焦的行，渲染后恢复。
  // 这样 :focus-within 才能区分“在树内操作”（彩色选中）与“点到其他区域”（灰色选中）。
  const focusedRow =
    document.activeElement && container.contains(document.activeElement)
      ? document.activeElement.closest(".tree-row")
      : null;
  const focusedPath = focusedRow ? focusedRow.dataset.treePath : null;
  const rows = buildTreeRows();
  container.innerHTML = rows.length
    ? rows
        .map((row) => {
          const isDir = row.kind === "directory";
          const expanded = isDir && expandedPaths.has(row.path);
          const active = row.kind === "file" && row.path === activeTabPath;
          return `
      <button class="tree-row ${active ? "active" : ""}" data-tree-path="${escHtml(row.path)}" data-tree-kind="${row.kind}" type="button" style="--tree-depth:${row.depth}" title="${escHtml(row.path)}">
        <span class="tree-caret">${
          isDir
            ? `<i data-lucide="${expanded ? "chevron-down" : "chevron-right"}" class="tree-caret-icon"></i>`
            : `<i data-lucide="file" class="tree-file-icon"></i>`
        }</span>
        <span class="tree-label">${escHtml(row.name)}</span>
      </button>`;
        })
        .join("")
    : '<div class="tree-empty">暂无内容</div>';
  if (focusedPath) {
    const restored = [...container.querySelectorAll(".tree-row")].find((el) => el.dataset.treePath === focusedPath);
    restored?.focus({ preventScroll: true });
  }
  window.lucide?.createIcons();
}

function handleTreeClick(event) {
  const row = event.target.closest(".tree-row");
  if (!row) return;
  const path = row.dataset.treePath;
  const kind = row.dataset.treeKind;
  if (!path) return;
  if (kind === "directory") {
    void toggleTreeNode(path);
    return;
  }
  void openDocPreview(path);
}

export function getRightPanelHTML(opts = {}) {
  const railCollapsed = localStorage.getItem("docRailCollapsed") === "true";
  const width = railCollapsed ? 44 : getDocRailWidth();
  const showToggle = opts.showToggle !== false;
  const toggleHTML = showToggle
    ? `<button id="doc-rail-toggle" class="icon-button" title="${railCollapsed ? "展开文件预览" : "收起文件预览"}" aria-label="${railCollapsed ? "展开文件预览" : "收起文件预览"}" aria-expanded="${!railCollapsed}"><i data-lucide="${railCollapsed ? "panel-right-open" : "panel-right-close"}"></i></button>`
    : "";
  return `
    <div id="doc-rail-resize" title="拖拽调整右栏宽度"></div>
    <aside id="action-rail" class="${railCollapsed ? "collapsed" : ""}" style="width:${width}px">
      ${toggleHTML}
      <button id="doc-rail-edit-btn" class="icon-button" type="button" title="编辑" aria-label="编辑"><i data-lucide="pencil"></i></button>
      <section id="doc-preview-panel">
        <div id="doc-tabs"></div>
        <div id="doc-preview-toolbar">
          <div id="doc-selection-status">
            <div class="doc-selection-lines"></div>
            <div class="doc-selection-summary"></div>
          </div>
          <div class="doc-toolbar-actions">
            <button id="doc-refresh-btn" class="icon-button" type="button" title="刷新" aria-label="刷新"><i data-lucide="refresh-cw"></i></button>
            <button id="doc-edit-btn" class="icon-button" type="button" title="编辑" aria-label="编辑"><i data-lucide="pencil"></i></button>
          </div>
        </div>
        <div id="doc-preview-content" class="${docPreviewSupported ? "" : "unsupported"}"></div>
      </section>
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
  if (!res.ok) {
    const error = new Error(data.error || "读取文件失败");
    // 404 表示文件不存在/已被删除，调用方可据此静默处理而非弹错误提示
    error.notFound = res.status === 404;
    throw error;
  }
  return data;
}

export function saveDocPreviewScrollPosition() {
  saveActiveTabScrollPosition();
}

// 把当前预览区的滚动位置记录到活动标签上（切换标签/重建 DOM 前调用）
function saveActiveTabScrollPosition() {
  const tab = openTabs.find((item) => item.path === activeTabPath);
  const el = document.getElementById("doc-preview-content");
  if (tab && el) tab.scrollTop = el.scrollTop;
}

// 渲染后按标签自身记录的滚动位置恢复；期间若已切走则跳过，避免污染新标签
function restorePreviewScroll(container) {
  const path = activeTabPath;
  requestAnimationFrame(() => {
    if (activeTabPath !== path || !container.isConnected) return;
    const tab = openTabs.find((item) => item.path === path);
    const target = tab?.scrollTop ?? 0;
    const maxScroll = container.scrollHeight - container.clientHeight;
    container.scrollTop = Math.min(target, Math.max(0, maxScroll));
  });
}

export function clearPreviewSelection() {
  selectedPreviewText = "";
  selectedPreviewSummary = "";
  selectedPreviewStartLine = 0;
  selectedPreviewEndLine = 0;
  updateDocSelectionStatus();
}

async function saveCurrentTabEdit() {
  const tab = openTabs.find((item) => item.path === activeTabPath);
  if (!tab || !tab.editMode || docPreviewKind !== "text") return true;
  const container = document.getElementById("doc-preview-content");
  const textarea = container?.querySelector(".doc-edit-textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) return true;
  try {
    const res = await fetch("/api/documents/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: activeTabPath, content: textarea.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "保存失败");
    docPreviewContent = textarea.value;
    return true;
  } catch (error) {
    reportError(error && error.message ? error.message : "保存文件失败");
    return false;
  }
}

async function toggleDocEdit() {
  const tab = openTabs.find((item) => item.path === activeTabPath);
  if (!tab || docPreviewKind !== "text") return;
  const container = document.getElementById("doc-preview-content");
  let scrollRatio = 0;
  if (tab.editMode) {
    if (container) {
      const textarea = container.querySelector(".doc-edit-textarea");
      if (textarea instanceof HTMLTextAreaElement) {
        const maxScroll = textarea.scrollHeight - textarea.clientHeight;
        scrollRatio = maxScroll > 0 ? textarea.scrollTop / maxScroll : 0;
      }
    }
    const ok = await saveCurrentTabEdit();
    if (!ok) return;
    tab.editMode = false;
    saveOpenTabs();
    updateDocPreviewPanel();
    if (container) {
      const maxScroll = container.scrollHeight - container.clientHeight;
      container.scrollTop = Math.min(scrollRatio * maxScroll, maxScroll);
      tab.scrollTop = container.scrollTop;
    }
  } else {
    if (container) {
      const maxScroll = container.scrollHeight - container.clientHeight;
      scrollRatio = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
    }
    tab.editMode = true;
    saveOpenTabs();
    clearPreviewSelection();
    updateDocPreviewPanel();
    const textarea = container?.querySelector(".doc-edit-textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      const maxScroll = textarea.scrollHeight - textarea.clientHeight;
      textarea.scrollTop = Math.min(scrollRatio * maxScroll, maxScroll);
      tab.scrollTop = textarea.scrollTop;
    }
  }
  renderDocTabs();
  updateDocSelectionStatus();
}

function updateDocSelectionStatus() {
  const linesEl = document.querySelector("#doc-selection-status .doc-selection-lines");
  const summaryEl = document.querySelector("#doc-selection-status .doc-selection-summary");
  if (linesEl) linesEl.textContent = getDocSelectionStatusText();
  if (summaryEl) summaryEl.textContent = selectedPreviewSummary ? `"${selectedPreviewSummary}"` : "";
  const editIcon = getActiveTabEditMode() ? "log-out" : "pencil";
  const editDisabled = !activeTabPath || docPreviewKind !== "text";
  // 同步预览工具栏和收起态竖条上的两个编辑按钮
  for (const editBtn of [document.getElementById("doc-edit-btn"), document.getElementById("doc-rail-edit-btn")]) {
    if (!editBtn) continue;
    if (editBtn.dataset.icon !== editIcon) {
      editBtn.dataset.icon = editIcon;
      editBtn.innerHTML = `<i data-lucide="${editIcon}"></i>`;
      window.lucide?.createIcons();
    }
    editBtn.disabled = editDisabled;
  }
}

// 选中文本的行号范围（1-based）；文本缺失或行号算不出来时返回 undefined，
// 由服务端决定要不要写「已选中：」这一行。
function getSelectionRangePayload() {
  if (!selectedPreviewText || !selectedPreviewStartLine || !selectedPreviewEndLine) return undefined;
  return { startLine: selectedPreviewStartLine, endLine: selectedPreviewEndLine };
}

export function getPreviewContextPayload() {
  // 关闭附带时返回空对象，chat.js 展开后不会携带任何文件上下文字段
  if (!attachDocContext) return {};
  const selectedText = selectedPreviewText || undefined;
  return {
    previewPath: activeTabPath || undefined,
    // 只传原始数据：原文与行号分开，如何排版由服务端决定
    selectionRange: selectedText ? getSelectionRangePayload() : undefined,
    selectedText,
  };
}

export function getAttachDocContext() {
  return attachDocContext;
}

export function toggleAttachDocContext() {
  attachDocContext = !attachDocContext;
  try {
    localStorage.setItem("docAttachContext", String(attachDocContext));
  } catch {
    // ignore
  }
  return attachDocContext;
}

export function getOpenTabPaths() {
  return openTabs.map((tab) => tab.path);
}

export function updateSelectedPreviewTextFromSelection() {
  if (getActiveTabEditMode() || docPreviewKind !== "text") return;
  const preview = document.getElementById("doc-preview-content");
  const selection = window.getSelection();
  if (!preview || !selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  const common =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  if (!common || !preview.contains(common)) {
    return;
  }
  const nextText = selection.toString().trim();
  if (!nextText) return;
  selectedPreviewText = nextText;
  selectedPreviewSummary = getDocSelectionSummary(nextText);
  selectedPreviewStartLine = getSourceLineNumberFromOffset(preview, range.startContainer, range.startOffset, "start");
  selectedPreviewEndLine = getSourceLineNumberFromOffset(preview, range.endContainer, range.endOffset, "end");
  updateDocSelectionStatus();
}

function updateDocPreviewPanel() {
  const content = document.getElementById("doc-preview-content");
  if (!content) return;
  content.classList.toggle("unsupported", !docPreviewSupported);
  content.classList.toggle("image-preview", docPreviewKind === "image");
  if (!activeTabPath) {
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
    img.alt = activeTabPath;
    content.appendChild(img);
    return;
  }
  if (getActiveTabEditMode()) {
    content.classList.remove("markdown-body");
    content.innerHTML = `<textarea class="doc-edit-textarea" spellcheck="false">${escHtml(docPreviewContent || "")}</textarea>`;
    const textarea = content.querySelector(".doc-edit-textarea");
    if (textarea) restorePreviewScroll(textarea);
    return;
  }
  content.classList.add("markdown-body");
  const basePath = activeTabPath ? activeTabPath.replace(/[^/\\]*$/, "") : "";
  renderContent(content, docPreviewContent, basePath);
  restorePreviewScroll(content);
}

async function loadActiveTabContent() {
  if (!activeTabPath) {
    docPreviewContent = "";
    docPreviewSupported = true;
    docPreviewKind = "text";
    clearPreviewSelection();
    updateDocPreviewPanel();
    updateDocSelectionStatus();
    return false;
  }
  try {
    const data = await fetchDocContent(activeTabPath);
    docPreviewContent = data.content || "";
    docPreviewSupported = data.supported !== false;
    docPreviewKind = data.kind || (docPreviewSupported ? "text" : "unsupported");
    clearPreviewSelection();
    recordRecentOpened(activeTabPath);
    updateDocPreviewPanel();
    updateDocSelectionStatus();
    // 活动标签变化后同步左栏文件树的选中高亮
    renderFileTree();
    return true;
  } catch (error) {
    if (error && error.notFound) {
      // 文件已被删除（如模型执行 delete 工具后刷新）：静默失效，
      // 由调用方（refreshDocBrowser 等）关闭对应标签，不弹出错误提示。
      docPreviewContent = "";
      docPreviewSupported = false;
      docPreviewKind = "unsupported";
      clearPreviewSelection();
      updateDocPreviewPanel();
      updateDocSelectionStatus();
      return false;
    }
    reportError(error && error.message ? error.message : "读取文件失败");
    return false;
  }
}

async function openDocPreview(path) {
  if (openTabs.some((tab) => tab.path === path)) {
    // 已打开：直接激活（保留其固定/临时状态）
    await activateTab(path);
    return;
  }
  // 存在临时标签（斜体、未固定）时替换它，否则新建临时标签
  const tempIndex = openTabs.findIndex((tab) => !tab.sticky);
  const replacedPath = tempIndex !== -1 ? openTabs[tempIndex].path : null;
  if (tempIndex !== -1) {
    if (openTabs[tempIndex].path === activeTabPath) {
      const ok = await saveCurrentTabEdit();
      if (!ok) return;
    }
    openTabs[tempIndex] = { path, editMode: false, sticky: false };
  } else {
    openTabs.push({ path, editMode: false, sticky: false });
  }
  activeTabPath = path;
  saveOpenTabs();
  renderDocTabs();
  const ok = await loadActiveTabContent();
  if (!ok) {
    if (tempIndex !== -1 && replacedPath) {
      // 打开失败：恢复被替换的临时标签
      openTabs[tempIndex] = { path: replacedPath, editMode: false, sticky: false };
      activeTabPath = replacedPath;
      saveOpenTabs();
      renderDocTabs();
      await loadActiveTabContent();
    } else {
      // 打开失败：回滚刚创建的标签
      await closeTab(path, { saveEdit: false });
    }
  }
}

async function activateTab(path) {
  if (path === activeTabPath) return;
  const ok = await saveCurrentTabEdit();
  if (!ok) return;
  // 切走前记录当前标签的滚动位置，切回时恢复
  saveActiveTabScrollPosition();
  activeTabPath = path;
  saveOpenTabs();
  renderDocTabs();
  await loadActiveTabContent();
}

async function closeTab(path, { saveEdit = true } = {}) {
  const index = openTabs.findIndex((tab) => tab.path === path);
  if (index === -1) return;
  if (path === activeTabPath && saveEdit) {
    const ok = await saveCurrentTabEdit();
    if (!ok) return;
  }
  openTabs.splice(index, 1);
  renderFileTree();
  if (path === activeTabPath) {
    if (openTabs.length) {
      const next = openTabs[Math.min(index, openTabs.length - 1)];
      activeTabPath = next.path;
      saveOpenTabs();
      await loadActiveTabContent();
    } else {
      activeTabPath = null;
      docPreviewContent = "";
      docPreviewSupported = true;
      docPreviewKind = "text";
      clearPreviewSelection();
      saveOpenTabs();
      updateDocPreviewPanel();
      updateDocSelectionStatus();
    }
  } else {
    saveOpenTabs();
  }
  renderDocTabs();
}

function renderDocTabs() {
  const container = document.getElementById("doc-tabs");
  if (!container) return;
  if (!openTabs.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = openTabs
    .map(
      (tab) => `
    <button class="doc-tab ${tab.path === activeTabPath ? "active" : ""} ${tab.editMode ? "editing" : ""} ${tab.sticky ? "" : "temporary"}" data-tab-path="${escHtml(tab.path)}" type="button" title="${escHtml(tab.path)}${tab.sticky ? "" : "（临时标签，双击固定）"}" aria-label="标签 ${escHtml(tab.path)}">
      <i data-lucide="${tab.editMode ? "pencil" : "file-text"}" class="doc-tab-icon"></i>
      <span class="doc-tab-label">${escHtml(tab.path.split("/").pop() || tab.path)}</span>
      <span class="doc-tab-close" data-close-tab-path="${escHtml(tab.path)}" role="button" tabindex="-1" title="关闭标签" aria-label="关闭标签 ${escHtml(tab.path)}"><i data-lucide="x" class="doc-tab-close-icon"></i></span>
    </button>
  `,
    )
    .join("");
  window.lucide?.createIcons();

  container.querySelectorAll(".doc-tab").forEach((button) => {
    button.addEventListener("click", () => {
      void activateTab(button.dataset.tabPath);
    });
    // 双击临时标签 → 固定为常驻标签
    button.addEventListener("dblclick", () => {
      const tab = openTabs.find((item) => item.path === button.dataset.tabPath);
      if (tab && !tab.sticky) {
        tab.sticky = true;
        saveOpenTabs();
        renderDocTabs();
      }
    });
  });
  container.querySelectorAll(".doc-tab-close").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void closeTab(button.dataset.closeTabPath);
    });
  });

  // Scroll the active tab into view (horizontal).
  const active = container.querySelector(".doc-tab.active");
  if (active) {
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.left < containerRect.left) {
      container.scrollLeft -= containerRect.left - activeRect.left;
    } else if (activeRect.right > containerRect.right) {
      container.scrollLeft += activeRect.right - containerRect.right;
    }
  }
}

export async function refreshDocBrowser() {
  try {
    clearPreviewSelection();
    saveActiveTabScrollPosition();

    // 清空缓存后重新拉取所有已展开目录的子项
    treeChildren.clear();
    await Promise.all([...expandedPaths].map((path) => ensureTreeChildren(path)));
    if (activeTabPath) {
      const ok = await loadActiveTabContent();
      if (!ok) {
        // 文件已失效：关闭对应标签
        await closeTab(activeTabPath, { saveEdit: false });
      }
    } else {
      updateDocPreviewPanel();
      updateDocSelectionStatus();
    }

    renderFileTree();
    renderDocTabs();
  } catch (error) {
    reportError(error && error.message ? error.message : "刷新文件树失败");
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
    btn.title = isCollapsed ? "展开文件预览" : "收起文件预览";
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

let fileTreeEventsBound = false;

export function initRightPanel() {
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
  document.getElementById("doc-rail-edit-btn")?.addEventListener("click", toggleDocEdit);
  document.getElementById("doc-preview-content")?.addEventListener("click", () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim()) return;
    if (!selectedPreviewText) return;
    clearPreviewSelection();
  });
  initDocResizeHandle();

  // 左侧栏文件树：事件委托只绑定一次，渲染可重复执行
  if (!fileTreeEventsBound) {
    fileTreeEventsBound = true;
    initSidebarTreeResize();
    document.getElementById("file-tree-body")?.addEventListener("click", handleTreeClick);
    document.getElementById("file-tree-refresh-btn")?.addEventListener("click", refreshDocBrowser);
  }
  renderFileTree();
  renderDocTabs();
  // 刷新/重建后确保已展开目录的子项已加载
  void (async () => {
    await Promise.all([...expandedPaths].map((path) => ensureTreeChildren(path)));
    renderFileTree();
  })();
  if (activeTabPath) {
    // 页面刷新后恢复活动标签的内容
    void loadActiveTabContent();
  } else {
    updateDocPreviewPanel();
    updateDocSelectionStatus();
  }
}
