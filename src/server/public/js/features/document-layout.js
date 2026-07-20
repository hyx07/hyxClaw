let docRailWidth = Number(localStorage.getItem("docRailWidth") || 380);
if (!Number.isFinite(docRailWidth)) docRailWidth = 380;
docRailWidth = Math.min(1000, Math.max(280, docRailWidth));

export function getDocRailWidth() {
  return docRailWidth;
}

// Sidebar resize has been replaced by collapse toggle.  Keep the export
// for backwards compatibility but it's a no-op since #sidebar-resize no
// longer exists in the DOM.
export function initSidebarResizeHandle() {
  // no-op: sidebar now uses collapse toggle instead of resize
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
    const railRight = rail.getBoundingClientRect().right;
    const onMove = (moveEvent) => {
      docRailWidth = Math.min(1000, Math.max(280, railRight - moveEvent.clientX));
      rail.style.width = `${docRailWidth}px`;
    };
    const onUp = () => {
      handle.classList.remove("dragging");
      localStorage.setItem("docRailWidth", String(docRailWidth));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

export function initDocVerticalResize() {
  const resizer = document.getElementById("doc-vertical-resizer");
  const columns = document.getElementById("doc-columns");
  const preview = document.getElementById("doc-preview-panel");
  const browser = document.getElementById("doc-browser");
  if (!resizer || !columns || !preview || !browser) return;
  resizer.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const browserHeight = browser.getBoundingClientRect().height;
    const startHeight = columns.getBoundingClientRect().height;
    const onMove = (moveEvent) => {
      const height = Math.min(browserHeight - 80, Math.max(30, startHeight + moveEvent.clientY - startY));
      columns.style.flex = `0 0 ${height}px`;
      preview.style.flex = "1 1 0";
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

const DOC_COLUMN_MIN_WIDTH = 80;
const DOC_COLUMN_RESIZER_WIDTH = 8;
let docColumnWidths = loadDocColumnWidths();

function loadDocColumnWidths() {
  try {
    const stored = JSON.parse(localStorage.getItem("docColumnWidths") || "{}");
    return {
      first: Number.isFinite(stored.first) ? stored.first : null,
      second: Number.isFinite(stored.second) ? stored.second : null,
    };
  } catch {
    return { first: null, second: null };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyDocColumnWidths(columns) {
  const availableWidth = columns.clientWidth - DOC_COLUMN_RESIZER_WIDTH * 2;
  const minimumWidth = DOC_COLUMN_MIN_WIDTH * 3;
  if (availableWidth < minimumWidth) return;

  const defaultWidth = availableWidth / 3;
  const first = clamp(
    docColumnWidths.first ?? defaultWidth,
    DOC_COLUMN_MIN_WIDTH,
    availableWidth - DOC_COLUMN_MIN_WIDTH * 2,
  );
  const second = clamp(
    docColumnWidths.second ?? defaultWidth,
    DOC_COLUMN_MIN_WIDTH,
    availableWidth - first - DOC_COLUMN_MIN_WIDTH,
  );
  columns.style.setProperty("--doc-column-1-width", `${first}px`);
  columns.style.setProperty("--doc-column-2-width", `${second}px`);
}

function saveDocColumnWidths() {
  localStorage.setItem("docColumnWidths", JSON.stringify(docColumnWidths));
}

export function initDocColumnResize() {
  const columns = document.getElementById("doc-columns");
  if (!columns) return;
  applyDocColumnWidths(columns);

  if (!columns.dataset.resizeObserved && "ResizeObserver" in window) {
    const observer = new ResizeObserver(() => applyDocColumnWidths(columns));
    observer.observe(columns);
    columns.dataset.resizeObserved = "true";
  }

  columns.querySelectorAll(".doc-column-resizer").forEach((resizer) => {
    if (resizer.dataset.initialized) return;
    resizer.dataset.initialized = "true";
    resizer.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const index = Number(resizer.dataset.columnResizer);
      const columnElements = columns.querySelectorAll(".doc-column");
      const widths = Array.from(columnElements, (column) => column.getBoundingClientRect().width);
      if (widths.length !== 3 || !Number.isInteger(index)) return;

      const startX = event.clientX;
      resizer.classList.add("dragging");
      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        if (index === 0) {
          const combinedWidth = widths[0] + widths[1];
          const first = clamp(widths[0] + delta, DOC_COLUMN_MIN_WIDTH, combinedWidth - DOC_COLUMN_MIN_WIDTH);
          docColumnWidths = { first, second: combinedWidth - first };
        } else {
          const combinedWidth = widths[1] + widths[2];
          const second = clamp(widths[1] + delta, DOC_COLUMN_MIN_WIDTH, combinedWidth - DOC_COLUMN_MIN_WIDTH);
          docColumnWidths = { ...docColumnWidths, second };
        }
        applyDocColumnWidths(columns);
      };
      const onUp = () => {
        resizer.classList.remove("dragging");
        saveDocColumnWidths();
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });
}
