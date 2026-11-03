let docRailWidth = Number(localStorage.getItem("docRailWidth") || 380);
if (!Number.isFinite(docRailWidth)) docRailWidth = 380;
docRailWidth = Math.min(1000, Math.max(280, docRailWidth));

export function getDocRailWidth() {
  return docRailWidth;
}

export function initDocResizeHandle() {
  const handle = document.getElementById("doc-rail-resize");
  const rail = document.getElementById("action-rail");
  if (!handle || !rail) return;

  handle.addEventListener("mousedown", (event) => {
    // Don't allow resize when rail is collapsed
    if (rail.classList.contains("collapsed")) return;
    event.preventDefault();
    handle.classList.add("dragging");
    // 关键：拖拽期间必须关掉 #action-rail 的 width 过渡（0.2s ease）。
    // 否则每个 mousemove 写入的新宽度都会重新启动一段动画，动画永远追不上光标，
    // 手感就是“拖动半拍之后才跟上”。
    document.body.classList.add("doc-rail-resizing");
    const railRight = rail.getBoundingClientRect().right;
    const onMove = (moveEvent) => {
      docRailWidth = Math.min(1000, Math.max(280, railRight - moveEvent.clientX));
      rail.style.width = `${docRailWidth}px`;
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      document.body.classList.remove("doc-rail-resizing");
      localStorage.setItem("docRailWidth", String(docRailWidth));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

/* ---- 左侧栏：会话列表与文件树的高度分割 ---- */

const TREE_PANEL_MIN_HEIGHT = 96;
const SESSION_LIST_MIN_HEIGHT = 100;
const TREE_PANEL_HEIGHT_KEY = "fileTreePanelHeight";
// 会话列表的最小展示高度之外，再给底部设置/状态栏预留的空间
const SIDEBAR_BOTTOM_RESERVE = 120;

function clampTreeHeight(height, maxHeight) {
  return Math.min(maxHeight, Math.max(TREE_PANEL_MIN_HEIGHT, height));
}

export function initSidebarTreeResize() {
  const sidebar = document.getElementById("sidebar");
  // “文件”标题行作为拖拽手柄
  const handle = document.getElementById("file-tree-header");
  const panel = document.getElementById("file-tree-panel");
  const sessionList = document.getElementById("session-list");
  if (!sidebar || !handle || !panel) return;

  // 恢复上次保存的高度
  const saved = Number(localStorage.getItem(TREE_PANEL_HEIGHT_KEY) || 240);
  if (Number.isFinite(saved)) {
    panel.style.height = `${clampTreeHeight(saved, sidebar.clientHeight - SESSION_LIST_MIN_HEIGHT - SIDEBAR_BOTTOM_RESERVE)}px`;
  }

  handle.addEventListener("mousedown", (event) => {
    // 在刷新按钮上按下时不触发拖拽
    if (event.target && typeof event.target.closest === "function" && event.target.closest("button")) return;
    event.preventDefault();
    handle.classList.add("dragging");
    document.body.classList.add("sidebar-tree-resizing");
    const startY = event.clientY;
    const startHeight = panel.getBoundingClientRect().height;
    const maxHeight = Math.max(
      TREE_PANEL_MIN_HEIGHT + 1,
      sidebar.clientHeight - SESSION_LIST_MIN_HEIGHT - SIDEBAR_BOTTOM_RESERVE,
    );
    const onMove = (moveEvent) => {
      // 拖拽手柄在文件树顶部：向上拖增大面板高度，向后兼容存储负增量
      const height = clampTreeHeight(startHeight - (moveEvent.clientY - startY), maxHeight);
      panel.style.height = `${height}px`;
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      document.body.classList.remove("sidebar-tree-resizing");
      localStorage.setItem(TREE_PANEL_HEIGHT_KEY, String(panel.getBoundingClientRect().height));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  // 会话列表至少保留最小高度：高度不足时压缩文件树面板
  if (sessionList && "ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      const maxHeight = Math.max(
        TREE_PANEL_MIN_HEIGHT + 1,
        sidebar.clientHeight - SESSION_LIST_MIN_HEIGHT - SIDEBAR_BOTTOM_RESERVE,
      );
      const current = panel.getBoundingClientRect().height;
      if (current > maxHeight) {
        panel.style.height = `${maxHeight}px`;
      }
    });
    observer.observe(sessionList);
  }
}
