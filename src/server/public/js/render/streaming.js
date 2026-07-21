import { renderContent } from "../markdown.js";

export function createStreamingRenderer({ state, scrollToBottom }) {
  function setBubbleContent(bubble, content) {
    const contentDiv = bubble.querySelector(".message-content");
    if (!contentDiv) return;
    contentDiv.dataset.raw = content || "";
    contentDiv.classList.add("markdown-body");
    renderContent(contentDiv, content);
  }

  function appendReasoningBlock(bubble) {
    const details = document.createElement("details");
    details.className = "reasoning-block";
    const summary = document.createElement("summary");
    const dot = document.createElement("span");
    dot.className = "bullet-dot";
    summary.appendChild(dot);
    const label = document.createElement("span");
    label.style.fontSize = "12px";
    label.style.letterSpacing = "0.03em";
    label.textContent = "Thinking";
    summary.appendChild(label);
    const caret = document.createElement("span");
    caret.className = "details-caret";
    caret.textContent = "›";
    summary.appendChild(caret);
    details.appendChild(summary);
    const content = document.createElement("div");
    content.className = "reasoning-content";
    details.appendChild(content);
    markLatestProcessStep(bubble, details);
    insertBeforeMessageContent(bubble, details);
    return details;
  }

  function appendToolCallBlock(bubble, name, input, opts = {}) {
    const details = document.createElement("details");
    details.className = "tool-block";
    const summary = document.createElement("summary");
    const dot = document.createElement("span");
    dot.className = "bullet-dot";
    summary.appendChild(dot);
    const nameSpan = document.createElement("span");
    nameSpan.className = "tool-name-badge";
    nameSpan.textContent = formatToolTitle(name);
    summary.appendChild(nameSpan);
    if (input.query || input.pattern) {
      const query = document.createElement("span");
      query.className = "tool-query-badge";
      query.textContent = input.query || input.pattern;
      summary.appendChild(query);
    }
    if (input.path) {
      const path = document.createElement("span");
      path.className = "tool-path-badge";
      path.textContent = input.path;
      summary.appendChild(path);
    }
    const caret = document.createElement("span");
    caret.className = "details-caret";
    caret.textContent = "›";
    summary.appendChild(caret);
    details.appendChild(summary);
    markLatestProcessStep(bubble, details);
    if (opts.after) {
      bubble.appendChild(details);
    } else {
      insertBeforeMessageContent(bubble, details);
    }
    scrollToBottom();
    return details;
  }

  function appendTypingDots(bubble) {
    const content = bubble.querySelector(".message-content");
    if (!content) return null;
    const dots = document.createElement("div");
    dots.className = "typing-dots";
    dots.setAttribute("role", "status");
    dots.setAttribute("aria-label", "Working");
    dots.innerHTML = "<span></span><span></span><span></span>";
    content.appendChild(dots);
    scrollToBottom();
    return dots;
  }

  function removeTypingDots() {
    state.typingPlaceholder?.remove();
    state.typingPlaceholder = null;
  }

  function appendChunk(bubble, chunk) {
    bubble.closest(".message")?.classList.add("has-response");
    // Create or reuse a text segment element placed in chronological order
    // (before .message-content, just like reasoning/tool blocks)
    let segment = state.currentTextSegment;
    if (!segment) {
      segment = document.createElement("div");
      segment.className = "text-segment";
      segment.dataset.raw = "";
      segment.dataset.blanks = "0";
      const contentDiv = bubble.querySelector(".message-content");
      if (contentDiv) bubble.insertBefore(segment, contentDiv);
      else bubble.appendChild(segment);
      state.currentTextSegment = segment;
    }
    // Accumulate raw text
    const prevBlanks = parseInt(segment.dataset.blanks || "0", 10);
    segment.dataset.raw += chunk;
    const newBlanks = countBlankLines(segment.dataset.raw);
    segment.dataset.blanks = String(newBlanks);
    // Only re-render markdown when a new blank line (paragraph separator) appears.
    // Blank lines signal a completed block, so markdown constructs won't be
    // half-finished and look broken mid-stream.
    if (newBlanks > prevBlanks) {
      segment.classList.add("markdown-body");
      renderContent(segment, segment.dataset.raw);
    } else {
      segment.appendChild(document.createTextNode(chunk));
    }
    scrollToBottom();
  }

  function countBlankLines(text) {
    let count = 0;
    for (let i = 1; i < text.length; i++) {
      if (text[i] === "\n" && text[i - 1] === "\n") count++;
    }
    return count;
  }

  function finishStreaming(bubble) {
    state.currentTextSegment = null;
    bubble.closest(".message")?.classList.remove("is-streaming");
    // Render final markdown on each complete text segment
    const segments = bubble.querySelectorAll(".text-segment");
    for (const segment of segments) {
      if (segment.dataset.raw) {
        segment.classList.add("markdown-body");
        renderContent(segment, segment.dataset.raw);
      }
    }
    // Hide .message-content — text lives in chronologically-ordered text-segments now
    const content = bubble.querySelector(".message-content");
    if (content) {
      content.style.display = "none";
    }
  }

  return {
    appendChunk,
    appendReasoningBlock,
    appendReasoningChunk,
    appendToolCallBlock,
    appendTypingDots,
    fillToolResult,
    finishStreaming,
    removeTypingDots,
    setBubbleContent,
  };
}

function markLatestProcessStep(bubble, step) {
  // Content emitted before a later reasoning/tool event belongs to that
  // intermediate round, not to the final reply.
  const segments = bubble.querySelectorAll(".text-segment");
  segments[segments.length - 1]?.classList.add("process-step");
  bubble.closest(".message")?.classList.remove("has-response");
  bubble.querySelector(".process-latest")?.classList.remove("process-latest");
  step.classList.add("process-step", "process-latest");
}

function insertBeforeMessageContent(bubble, node) {
  const content = bubble.querySelector(".message-content");
  if (content) bubble.insertBefore(node, content);
  else bubble.appendChild(node);
}

function appendReasoningChunk(details, chunk) {
  details.querySelector(".reasoning-content")?.appendChild(document.createTextNode(chunk));
}

function fillToolResult(details, content, isError) {
  details.classList.toggle("done", !isError);
  details.classList.toggle("error", Boolean(isError));
  if (isError) details.open = true;
  const result = document.createElement("div");
  result.className = "tool-block-result";
  result.textContent = content;
  details.appendChild(result);
}

function formatToolTitle(name) {
  if (!name) return "Tool";
  const displayMap = { web_search: "Web Search", web_fetch: "Web Fetch" };
  return displayMap[name] || name.charAt(0).toUpperCase() + name.slice(1);
}
