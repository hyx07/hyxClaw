import { escHtml } from "./format.js";
import { clearChatElements } from "./state.js";
import { initGitSync } from "./features/git-sync.js";

const WORKSPACE_MODE_STORAGE_KEY = "hyxclaw-workspace-mode";

export function createChatView({ state, documents, pickers, permissions, actions }) {
  let toolbarMenuOutsideClickBound = false;
  let workspaceResizeBound = false;

  function renderChatArea() {
    const main = document.getElementById("main");
    const title = state.sessions.find((session) => session.id === state.currentSessionId)?.title || "";
    if (!state.currentSessionId) {
      main.innerHTML = `<div id="main-shell" data-workspace-mode="${getWorkspaceMode()}"><div id="chat-panel"><div id="chat-content"><div id="no-session"><div class="empty-state"><div class="empty-state-icon"><i data-lucide="message-circle"></i></div><p class="empty-state-title">欢迎回来</p><p class="empty-state-copy">选择一个会话或新建一个开始对话</p></div></div></div><section id="document-stage" aria-label="文档预览"></section></div>${documents.getRightPanelHTML({ showToggle: false })}</div>`;
      clearChatElements(state);
      documents.initRightPanel();
      initWorkspaceMode();
      window.lucide?.createIcons();
      return;
    }

    const railCollapsed = localStorage.getItem("docRailCollapsed") === "true";
    main.innerHTML = `
      <div id="main-shell" data-workspace-mode="${getWorkspaceMode()}">
        <div id="chat-panel">
          <div id="chat-header">
            <div id="chat-meta">
              <div id="chat-title">${escHtml(title)}</div>
            </div>
            <div id="workspace-mode-control" role="group" aria-label="工作区模式">
              <button class="workspace-mode-btn" type="button" data-workspace-mode="chat" title="聊天模式" aria-label="聊天模式" aria-pressed="false">聊天</button>
              <button class="workspace-mode-btn" type="button" data-workspace-mode="document" title="阅读模式" aria-label="阅读模式" aria-pressed="false">阅读</button>
            </div>
            <div id="chat-toolbar">
              <span id="token-display"></span>
              <div id="chat-actions">
                <button class="header-icon-btn" id="usage-btn" title="Token 统计" aria-label="Token 统计"><i data-lucide="bar-chart-3"></i></button>
                <button class="header-icon-btn" id="knowledge-btn" title="知识库" aria-label="知识库"><i data-lucide="book-open"></i></button>
                ${state.gitSyncEnabled ? '<button class="header-icon-btn" id="git-sync-btn" title="同步" aria-label="同步"><i data-lucide="git-compare-arrows"></i></button>' : ""}
                <button class="header-icon-btn" id="doc-rail-toggle" title="${railCollapsed ? "展开文件浏览器" : "收起文件浏览器"}" aria-label="${railCollapsed ? "展开文件浏览器" : "收起文件浏览器"}" aria-expanded="${!railCollapsed}"><i data-lucide="${railCollapsed ? "panel-right-open" : "panel-right-close"}"></i></button>
              </div>
            </div>
          </div>
          <div id="chat-content">
          <div id="messages"><div id="empty-state" class="empty-state"><div class="empty-state-icon"><i data-lucide="message-circle"></i></div><p class="empty-state-title">发送消息开始对话</p></div></div>
          <div id="input-area">
            <div id="composer">
              <div id="tool-permission-dialog" role="dialog" aria-modal="true" aria-label="工具权限确认">
                <div id="tool-permission-title"></div><div id="tool-permission-body"></div>
                <div id="tool-permission-actions"><button id="tool-permission-deny">拒绝</button><button id="tool-permission-allow">允许</button></div>
              </div>
              <div id="file-picker-popover" role="listbox" aria-label="选择文件">
                <div id="file-picker-popover-header"><strong>选择文件</strong></div>
                <div id="file-picker-popover-body"><div id="file-picker-empty">无匹配文件</div><div id="file-picker-list"></div></div>
              </div>
              <div id="command-picker-popover" role="listbox" aria-label="选择命令">
                <div id="command-picker-popover-header"><strong>选择命令</strong></div>
                <div id="command-picker-popover-body"><div id="command-picker-empty">无匹配命令</div><div id="command-picker-list"></div></div>
              </div>
              <div id="pending-images"></div>
              <textarea id="message-input" placeholder="输入消息...(Enter 发送，Shift+Enter 换行)" rows="1"></textarea>
              <div id="composer-toolbar">
                <div class="composer-left">
                  <label class="toggle-wrap" id="write-perm-toggle" title="开启后模型可直接写/删文件、搜索网络，无需确认" aria-label="写入权限">
                    <input type="checkbox" id="write-perm-checkbox">
                    <span class="toggle-track"></span>
                  </label>
                  <button id="compact-btn" class="composer-action-btn" title="压缩会话" aria-label="压缩会话" disabled>
                    <i data-lucide="archive"></i>
                  </button>
                </div>
                <div class="composer-right">
                  <div class="toolbar-menu-control"><select id="provider-select" hidden></select><button id="provider-select-trigger" class="toolbar-select" type="button" title="Provider" aria-label="Provider" aria-haspopup="listbox" aria-expanded="false" aria-controls="provider-select-menu"><span class="toolbar-select-value"></span><i data-lucide="chevron-down"></i></button><div id="provider-select-menu" class="toolbar-select-menu" role="listbox" aria-label="Provider"></div></div>
                  <div class="toolbar-menu-control"><select id="model-select" hidden></select><button id="model-select-trigger" class="toolbar-select" type="button" title="Model" aria-label="Model" aria-haspopup="listbox" aria-expanded="false" aria-controls="model-select-menu"><span class="toolbar-select-value"></span><i data-lucide="chevron-down"></i></button><div id="model-select-menu" class="toolbar-select-menu" role="listbox" aria-label="Model"></div></div>
                  <div class="toolbar-menu-control"><select id="thinking-effort-select" hidden></select><button id="thinking-effort-select-trigger" class="toolbar-select" type="button" title="Thinking" aria-label="Thinking" aria-haspopup="listbox" aria-expanded="false" aria-controls="thinking-effort-select-menu"><span class="toolbar-select-value"></span><i data-lucide="chevron-down"></i></button><div id="thinking-effort-select-menu" class="toolbar-select-menu" role="listbox" aria-label="Thinking"></div></div>
                  <button id="send-btn" title="发送" aria-label="发送" disabled><i data-lucide="arrow-up"></i></button>
                </div>
              </div>
            </div>
          </div>
          </div>
          <section id="document-stage" aria-label="文档预览"></section>
        </div>
        ${documents.getRightPanelHTML({ showToggle: false })}
      </div>`;

    captureElements();
    actions.bindScrollListener();
    bindComposerEvents();
    documents.initRightPanel();
    initGitSync();
    initWorkspaceMode();
    syncModelControls();
    pickers.bindComposer();
    permissions.init();
    actions.syncCompactButton();
    actions.updateTokenDisplay(state.latestUsage);

    // Trigger lucide icon rendering for dynamically added elements
    window.lucide?.createIcons();
  }

  function getWorkspaceMode() {
    const preferred = localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY);
    return preferred === "document" ? "document" : "chat";
  }

  function initWorkspaceMode() {
    document.querySelectorAll(".workspace-mode-btn").forEach((button) => {
      if (button.dataset.initialized) return;
      button.dataset.initialized = "true";
      button.addEventListener("click", () => {
        const mode = button.dataset.workspaceMode;
        if (mode !== "chat" && mode !== "document") return;
        localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, mode);
        applyWorkspaceMode(getWorkspaceMode());
      });
    });

    if (!workspaceResizeBound) {
      workspaceResizeBound = true;
      window.addEventListener("resize", () => applyWorkspaceMode(getWorkspaceMode()));
    }

    applyWorkspaceMode(getWorkspaceMode());
  }

  function applyWorkspaceMode(mode) {
    const shell = document.getElementById("main-shell");
    const chatPanel = document.getElementById("chat-panel");
    const chatHeader = document.getElementById("chat-header");
    const chatContent = document.getElementById("chat-content");
    const documentStage = document.getElementById("document-stage");
    const previewPanel = document.getElementById("doc-preview-panel");
    const previewToolbar = document.getElementById("doc-preview-toolbar");
    const previewContent = document.getElementById("doc-preview-content");
    if (!shell || !chatPanel || !chatContent || !documentStage || !previewPanel || !previewToolbar || !previewContent) return;

    if (mode === "document") {
      documentStage.appendChild(previewContent);
      previewPanel.appendChild(chatContent);
    } else {
      if (chatHeader) chatHeader.after(chatContent);
      else chatPanel.insertBefore(chatContent, documentStage);
      previewToolbar.after(previewContent);
    }

    shell.dataset.workspaceMode = mode;
    syncWorkspaceModeControls(mode);
    window.lucide?.createIcons();
  }

  function syncWorkspaceModeControls(mode) {
    document.querySelectorAll(".workspace-mode-btn").forEach((button) => {
      const active = button.dataset.workspaceMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.title = button.dataset.workspaceMode === "document" ? "阅读模式" : "聊天模式";
    });
  }

  function captureElements() {
    state.messagesEl = document.getElementById("messages");
    state.inputEl = document.getElementById("message-input");
    state.sendBtn = document.getElementById("send-btn");
    state.tokenDisplayEl = document.getElementById("token-display");
    state.compactBtnEl = document.getElementById("compact-btn");
    state.providerSelectEl = document.getElementById("provider-select");
    state.modelSelectEl = document.getElementById("model-select");
    state.thinkingEffortSelectEl = document.getElementById("thinking-effort-select");
    state.pendingImagesEl = document.getElementById("pending-images");
  }

  function bindComposerEvents() {
    if (state.sendBtn) state.sendBtn.addEventListener("click", actions.sendMessage);
    if (state.compactBtnEl) state.compactBtnEl.addEventListener("click", actions.compactCurrentSession);
    bindToolbarMenu(state.providerSelectEl, () => {
      state.currentProvider = state.providerSelectEl.value;
      state.currentModel = getModelsForProvider(state.currentProvider)[0]?.id || state.defaultModel;
      syncModelControls();
    });
    bindToolbarMenu(state.modelSelectEl, () => {
      state.currentModel = state.modelSelectEl.value;
      syncThinkingEffortSelect();
    });
    bindToolbarMenu(state.thinkingEffortSelectEl, () => {
      state.currentThinkingEffort = state.thinkingEffortSelectEl.value || state.defaultThinkingEffort;
    });
    if (state.inputEl) state.inputEl.addEventListener("keydown", (event) => {
      if (document.getElementById("file-picker-popover")?.classList.contains("open")) return;
      if (document.getElementById("command-picker-popover")?.classList.contains("open")) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        actions.sendMessage();
      }
    });
    if (state.inputEl) {
      state.inputEl.addEventListener("input", () => {
        autoResizeInput();
        actions.updateSendAvailability?.();
      });
    }
    autoResizeInput();
    actions.updateSendAvailability?.();
  }

  function syncModelControls() {
    if (!state.providerSelectEl) return;
    syncProviderSelect();
    state.providerSelectEl.value = state.currentProvider;
    renderToolbarMenu(state.providerSelectEl);
    syncModelSelect();
    state.modelSelectEl.value = state.currentModel;
    renderToolbarMenu(state.modelSelectEl);
    syncThinkingEffortSelect();
  }

  function syncProviderSelect() {
    state.providerSelectEl.innerHTML = "";
    const providers = state.availableProviders.length ? state.availableProviders : [state.defaultProvider];
    const normalized = providers.includes(state.currentProvider) ? providers : [...providers, state.currentProvider];
    for (const provider of normalized) {
      const option = document.createElement("option");
      option.value = provider;
      option.textContent = provider;
      state.providerSelectEl.appendChild(option);
    }
  }

  function syncModelSelect() {
    if (!state.modelSelectEl) return;
    state.modelSelectEl.innerHTML = "";
    const models = getModelsForProvider(state.currentProvider);
    const fallback = state.currentModel || state.defaultModel;
    for (const model of (models.length ? models : [{ id: fallback, label: fallback }])) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label || model.name || model.id;
      state.modelSelectEl.appendChild(option);
    }
  }

  function getModelsForProvider(provider) {
    const models = state.providerConfigs?.[provider]?.models;
    return Array.isArray(models) ? models : [];
  }

  function syncThinkingEffortSelect() {
    if (!state.thinkingEffortSelectEl) return;
    const model = getModelsForProvider(state.currentProvider).find((item) => item.id === state.currentModel);
    const levels = [{ id: "none", label: "none" }, ...(Array.isArray(model?.thinking) ? model.thinking : [])];
    if (!levels.some((level) => level.id === state.currentThinkingEffort)) state.currentThinkingEffort = "none";
    state.thinkingEffortSelectEl.innerHTML = "";
    for (const level of levels) {
      const option = document.createElement("option");
      option.value = level.id;
      option.textContent = level.label || level.id;
      state.thinkingEffortSelectEl.appendChild(option);
    }
    state.thinkingEffortSelectEl.value = state.currentThinkingEffort;
    renderToolbarMenu(state.thinkingEffortSelectEl);
  }

  function bindToolbarMenu(selectEl, onChange) {
    if (!selectEl) return;
    const control = selectEl.closest(".toolbar-menu-control");
    const trigger = control?.querySelector(".toolbar-select");
    const menu = control?.querySelector(".toolbar-select-menu");
    if (!control || !trigger || !menu) return;

    trigger.addEventListener("click", () => setToolbarMenuOpen(control, !control.classList.contains("open")));
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      setToolbarMenuOpen(control, true, event.key === "ArrowUp");
    });
    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".toolbar-select-option");
      if (!option) return;
      selectEl.value = option.dataset.value;
      selectEl.dispatchEvent(new Event("change"));
      setToolbarMenuOpen(control, false);
      trigger.focus();
    });
    menu.addEventListener("keydown", (event) => handleToolbarMenuKeydown(event, control));
    selectEl.addEventListener("change", () => {
      renderToolbarMenu(selectEl);
      onChange();
    });

    if (!toolbarMenuOutsideClickBound) {
      document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".toolbar-menu-control")) closeToolbarMenus();
      });
      toolbarMenuOutsideClickBound = true;
    }
  }

  function renderToolbarMenu(selectEl) {
    const control = selectEl?.closest(".toolbar-menu-control");
    const trigger = control?.querySelector(".toolbar-select");
    const valueEl = trigger?.querySelector(".toolbar-select-value");
    const menu = control?.querySelector(".toolbar-select-menu");
    if (!control || !trigger || !valueEl || !menu) return;

    const selected = selectEl.selectedOptions[0];
    valueEl.textContent = selected?.textContent || "";
    menu.replaceChildren(...Array.from(selectEl.options, (option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "toolbar-select-option";
      item.dataset.value = option.value;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.classList.toggle("selected", option.selected);
      item.textContent = option.textContent;
      return item;
    }));
  }

  function setToolbarMenuOpen(control, open, focusLast = false) {
    if (open) {
      document.querySelectorAll(".toolbar-menu-control.open").forEach((openControl) => {
        if (openControl !== control) setToolbarMenuOpen(openControl, false);
      });
    }
    control.classList.toggle("open", open);
    control.querySelector(".toolbar-select")?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const options = control.querySelectorAll(".toolbar-select-option");
    const selected = control.querySelector(".toolbar-select-option.selected");
    (focusLast ? options[options.length - 1] : selected || options[0])?.focus();
  }

  function closeToolbarMenus() {
    document.querySelectorAll(".toolbar-menu-control.open").forEach((control) => setToolbarMenuOpen(control, false));
  }

  function handleToolbarMenuKeydown(event, control) {
    const options = Array.from(control.querySelectorAll(".toolbar-select-option"));
    const index = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setToolbarMenuOpen(control, false);
      control.querySelector(".toolbar-select")?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    options[(index + direction + options.length) % options.length]?.focus();
  }

  function autoResizeInput() {
    if (!state.inputEl) return;
    state.inputEl.style.height = "auto";
    state.inputEl.style.height = Math.min(state.inputEl.scrollHeight, 160) + "px";
  }

  /* ---- Sidebar / Rail Collapse Toggle ---- */

  function initSidebarCollapse() {
    const sidebar = document.getElementById("sidebar");
    const btn = document.getElementById("sidebar-collapse-btn");
    if (!sidebar || !btn) return;

    const collapsed = localStorage.getItem("sidebarCollapsed") === "true";
    if (collapsed) {
      sidebar.classList.add("collapsed");
    }
    updateSidebarCollapseIcon();

    btn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      const isCollapsed = sidebar.classList.contains("collapsed");
      localStorage.setItem("sidebarCollapsed", String(isCollapsed));
      updateSidebarCollapseIcon();
      // Re-render lucide icons since we swapped the icon
      window.lucide?.createIcons();
    });
  }

  function updateSidebarCollapseIcon() {
    const sidebar = document.getElementById("sidebar");
    const button = document.getElementById("sidebar-collapse-btn");
    if (!sidebar || !button) return;

    const isCollapsed = sidebar.classList.contains("collapsed");
    const label = isCollapsed ? "展开侧栏" : "收起侧栏";
    button.innerHTML = `<i data-lucide="${isCollapsed ? "panel-left-open" : "panel-left-close"}"></i>`;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", String(!isCollapsed));
  }

  /* ---- Modal Esc handling ---- */

  function initModalEscHandlers() {
    const modals = [
      { id: "usage-modal", close: () => document.getElementById("usage-modal")?.classList.remove("open") },
      { id: "knowledge-modal", close: () => document.getElementById("knowledge-modal")?.classList.remove("open") },
      { id: "help-modal", close: () => document.getElementById("help-modal")?.classList.remove("open") },
      { id: "compact-modal", close: () => document.getElementById("compact-modal")?.classList.remove("open") },
    ];

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      for (const modal of modals) {
        const el = document.getElementById(modal.id);
        if (el?.classList.contains("open")) {
          event.preventDefault();
          modal.close();
          // Focus management: return focus to the element that opened the modal
          return;
        }
      }
    });
  }

  /* ---- Init ---- */

  initSidebarCollapse();
  initModalEscHandlers();

  return {
    autoResizeInput,
    renderChatArea,
    syncModelControls,
  };
}
