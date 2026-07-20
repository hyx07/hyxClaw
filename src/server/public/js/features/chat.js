import { requestJson, jsonRequest } from "../api.js";
import { escHtml, formatK } from "../format.js";
import { buildUserMessageContent, extractUserText } from "../render/messages.js";

export function createChatFeature({
  state,
  socket,
  renderer,
  streaming,
  pickers,
  permissions,
  documents,
  actions,
}) {
  function sendMessage() {
    if (state.isStreaming) { cancelChat(); return; }
    if (!state.inputEl) return;
    const content = state.inputEl.value.trim();
    if ((!content && !state.pendingImages.length) || !state.currentSessionId) return;
    const images = state.pendingImages.map((image) => ({ url: image.url, path: image.path }));
    setSendDisabled(true);
    state.pendingUserBubble = renderer.appendMessage("user", buildUserMessageContent(content, images));
    if (state.pendingUserBubble) {
      const msgEl = state.pendingUserBubble.closest(".message");
      if (msgEl) {
        msgEl.classList.add("message-new");
        msgEl.addEventListener("animationend", () => msgEl.classList.remove("message-new"), { once: true });
      }
    }
    state.currentSessionMessageCount++;
    state.pendingSubmission = { content, images };
    socket.send({
      type: "chatMessage",
      sessionId: state.currentSessionId,
      content,
      images,
      provider: state.currentProvider,
      model: state.currentModel,
      thinkingEffort: state.currentThinkingEffort,
      ...documents.getPreviewContextPayload(),
    });
    documents.clearPreviewSelection();
    state.inputEl.value = "";
    state.inputEl.style.height = "auto";
    state.pendingImages = [];
    pickers.renderPendingImages();
  }

  function cancelChat() {
    if (!state.currentSessionId) return;
    socket.send({ type: "cancelChat", sessionId: state.currentSessionId });
  }

  function updateSendAvailability() {
    if (!state.sendBtn || state.isStreaming) return;
    const hasContent = Boolean(state.inputEl?.value.trim()) || state.pendingImages.length > 0;
    state.sendBtn.disabled = !hasContent || !state.currentSessionId;
  }

  function setSendDisabled(disabled) {
    if (disabled) {
      // Show cancel button while streaming
      if (state.sendBtn) {
        state.sendBtn.disabled = false;
        state.sendBtn.innerHTML = '<i data-lucide="square" class="send-stop-icon"></i>';
        state.sendBtn.title = "取消生成";
        state.sendBtn.setAttribute("aria-label", "取消生成");
        window.lucide?.createIcons();
      }
    } else {
      if (state.sendBtn) {
        state.sendBtn.innerHTML = '<i data-lucide="arrow-up"></i>';
        state.sendBtn.title = "发送";
        state.sendBtn.setAttribute("aria-label", "发送");
        updateSendAvailability();
        window.lucide?.createIcons();
      }
    }
    if (state.inputEl) state.inputEl.disabled = disabled;
  }

  async function restartFromMessage(messageId, text) {
    if (!state.currentSessionId || state.isStreaming || state.isCompacting) return;
    if (!confirm("确定要从这条消息重新开始吗？\n\n这条消息及之后的所有回复将被删除，原文会保留在输入框中供你修改。")) return;
    try {
      const { response, data } = await requestJson(
        `/api/sessions/${state.currentSessionId}/truncate`,
        jsonRequest("POST", { messageId }),
      );
      if (!response.ok) throw new Error(data.error || "Truncation failed");
      await actions.loadSession(state.currentSessionId);
      if (state.inputEl) {
        state.inputEl.value = text;
        state.inputEl.style.height = "auto";
        state.inputEl.style.height = Math.min(state.inputEl.scrollHeight, 200) + "px";
        state.inputEl.focus();
      }
    } catch (error) {
      showError(error?.message || "Restart failed");
    }
  }

  function compactCurrentSession() {
    if (!state.currentSessionId || state.isStreaming || state.isCompacting || state.currentSessionMessageCount < 2) return;
    const select = document.getElementById("compact-keep-rounds");
    const totalRounds = state.currentMessages.filter((message) => message.role === "user").length;
    for (const option of select.options) {
      const keepRounds = Number(option.value);
      option.disabled = keepRounds > 0 && totalRounds <= keepRounds + 1;
    }
    select.value = "0";
    document.getElementById("compact-modal").classList.add("open");
  }

  function closeCompactModal(force = false) {
    if (state.isCompacting && !force) return;
    document.getElementById("compact-modal").classList.remove("open");
  }

  async function doCompact() {
    if (!state.currentSessionId || state.isStreaming || state.isCompacting || state.currentSessionMessageCount < 2) return;
    closeCompactModal(true);
    state.isCompacting = true;
    syncCompactButton();
    document.getElementById("compact-confirm-btn").disabled = true;
    const keepRecentRounds = Number(document.getElementById("compact-keep-rounds")?.value || 0);
    state.compactingBubble = renderer.appendMessage("assistant", "");
    streaming.appendTypingDots(state.compactingBubble);
    try {
      const { response, data } = await requestJson(
        `/api/sessions/${state.currentSessionId}/compact`,
        jsonRequest("POST", { keepRecentRounds }),
      );
      if (!response.ok) throw new Error(data.error || "Compaction failed");
      await actions.loadSession(state.currentSessionId);
      state.sessionCache.delete(state.currentSessionId);
      state.compactingBubble = null;
    } catch (error) {
      state.compactingBubble?.parentElement?.remove();
      state.compactingBubble = null;
      showError(error?.message || "Compaction failed");
    } finally {
      state.isCompacting = false;
      document.getElementById("compact-confirm-btn").disabled = false;
      syncCompactButton();
    }
  }

  function formatContextTokens(value) {
    const number = Number(value || 0);
    return Math.abs(number) <= 100 ? String(Math.round(number)) : formatK(number);
  }

  function updateTokenDisplay(usage) {
    if (!state.tokenDisplayEl || !usage) return;
    const input = usage.inputTokens || 0;
    const cachedRead = usage.cachedReadTokens || 0;
    const output = usage.outputTokens || 0;
    const total = input + output;
    state.tokenDisplayEl.textContent = `In: ${formatContextTokens(input)} CR: ${formatContextTokens(cachedRead)} Out: ${formatContextTokens(output)} All: ${formatContextTokens(total)}`;
    state.tokenDisplayEl.title = "当前上下文估计：最后一次 LLM 请求的输入、缓存命中和最终输出";
    state.tokenDisplayEl.style.display = "inline-block";
    state.tokenDisplayEl.style.background = total > 100000 ? (total > 200000 ? "var(--token-warn-bg)" : "var(--token-caution-bg)") : "";
    state.tokenDisplayEl.style.color = "var(--text2)";
  }

  function syncCompactButton() {
    if (!state.compactBtnEl) return;
    state.compactBtnEl.disabled = !state.currentSessionId || state.currentSessionMessageCount < 2 || state.isStreaming || state.isCompacting;
    if (state.isCompacting) {
      state.compactBtnEl.classList.add("is-loading");
    } else {
      state.compactBtnEl.classList.remove("is-loading");
    }
  }

  function showError(message) {
    if (!state.messagesEl) return;
    const element = document.createElement("div");
    element.className = "error-message";
    element.innerHTML = `<span class="error-message-dot"></span><span class="error-message-text">${escHtml(message || "Unknown error")}</span>`;
    state.messagesEl.appendChild(element);
    scrollToBottom();
  }

  function scrollToBottom() {
    if (state.messagesEl && !state.userScrolledUp) {
      state.messagesEl.scrollTop = state.messagesEl.scrollHeight;
    }
  }

  function bindScrollListener() {
    if (!state.messagesEl) return;
    let lastScrollTop = state.messagesEl.scrollTop;
    state.messagesEl.addEventListener("scroll", () => {
      const el = state.messagesEl;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
      if (atBottom) {
        state.userScrolledUp = false;
      } else if (el.scrollTop < lastScrollTop) {
        // User scrolled up explicitly (scrollTop decreased)
        state.userScrolledUp = true;
      }
      // scrolling down but not at bottom: keep current state
      lastScrollTop = el.scrollTop;
    });
  }

  function bindGlobalEvents() {
    document.getElementById("compact-cancel-btn").addEventListener("click", () => closeCompactModal());
    document.getElementById("compact-confirm-btn").addEventListener("click", () => void doCompact());
    document.getElementById("compact-modal").addEventListener("click", (event) => {
      if (event.target.id === "compact-modal") closeCompactModal();
    });
  }

  function handleServerMessage(message) {
    const scopedTypes = ["chatStart", "chatChunk", "chatReasoning", "chatEnd", "chatCancelled", "toolCall", "toolResult"];
    if (scopedTypes.includes(message.type) && message.sessionId && message.sessionId !== state.currentSessionId) {
      updateBackgroundSession(message);
      return;
    }
    if (message.type === "error" && message.sessionId && message.sessionId !== state.currentSessionId) {
      clearCachedStreaming(message.sessionId);
      return;
    }

    switch (message.type) {
      case "connected":
        if (state.currentSessionId) actions.joinSession(state.currentSessionId);
        break;
      case "sessionLoaded":
        handleSessionLoaded(message.session);
        break;
      case "chatStart":
        handleChatStart(message);
        break;
      case "chatReasoning":
        state.currentTextSegment = null;
        if (state.streamingBubble) {
          state.streamingReasoningBlock ||= streaming.appendReasoningBlock(state.streamingBubble);
          streaming.appendReasoningChunk(state.streamingReasoningBlock, message.chunk);
        }
        break;
      case "toolCall":
        state.currentTextSegment = null;
        if (state.streamingBubble) state.pendingToolBlocks[message.callId] = streaming.appendToolCallBlock(state.streamingBubble, message.name, message.input);
        break;
      case "toolResult":
        handleToolResult(message);
        break;
      case "chatChunk":
        if (state.streamingBubble) streaming.appendChunk(state.streamingBubble, message.chunk);
        break;
      case "chatEnd":
        handleChatEnd(message);
        break;
      case "chatCancelled":
        handleChatCancelled(message);
        break;
      case "toolPermissionRequest":
        permissions.show(message);
        break;
      case "error":
        handleError(message);
        break;
      default:
        console.warn("Unknown WebSocket message", message);
    }
  }

  function handleSessionLoaded(session) {
    if (session.id !== state.currentSessionId) return;
    const local = state.sessions.find((item) => item.id === state.currentSessionId);
    if (local) Object.assign(local, session);
    actions.applySessionRuntimeState(session);
    const cached = state.sessionCache.get(state.currentSessionId);
    const serverCount = session.messages.length;
    const cacheCount = cached ? cached.currentSessionMessageCount : -1;
    if (cached && (cacheCount === serverCount || state.isStreaming)) {
      state.currentSessionMessageCount = serverCount;
      state.currentMessages = session.messages;
      cached.currentMessages = session.messages;
      cached.currentSessionMessageCount = serverCount;
    } else {
      if (cached) state.sessionCache.delete(state.currentSessionId);
      state.currentSessionMessageCount = serverCount;
      state.currentMessages = session.messages;
      renderer.renderMessages(session.messages);
    }
    syncCompactButton();
  }

  function handleChatStart(message) {
    state.isStreaming = true;
    setSendDisabled(true);
    syncCompactButton();
    state.pendingToolBlocks = {};
    state.streamingReasoningBlock = null;
    state.currentTextSegment = null;
    if (state.pendingUserBubble && message.userMessageId) {
      const messageElement = state.pendingUserBubble.parentElement;
      if (messageElement) {
        messageElement.dataset.messageId = message.userMessageId;
        const userText = state.pendingSubmission ? extractUserText(state.pendingSubmission.content) : "";
        const restart = document.createElement("button");
        restart.className = "restart-round-btn";
        restart.title = "从这里重新开始";
        restart.innerHTML = '<i data-lucide="refresh-ccw"></i>';
        restart.addEventListener("click", (event) => {
          event.stopPropagation();
          void restartFromMessage(message.userMessageId, userText);
        });
        messageElement.appendChild(restart);
        window.lucide?.createIcons();
      }
    }
    state.userScrolledUp = false;
    state.streamingBubble = renderer.appendMessage("assistant", "");
    // Add entrance animation for the new assistant message
    if (state.streamingBubble) {
      const msgEl = state.streamingBubble.closest(".message");
      if (msgEl) {
        msgEl.classList.add("message-new");
        msgEl.addEventListener("animationend", () => msgEl.classList.remove("message-new"), { once: true });
      }
    }
    state.typingPlaceholder = streaming.appendTypingDots(state.streamingBubble);
    state.pendingSubmission = null;
    state.pendingUserBubble = null;
  }

  function handleToolResult(message) {
    if (state.pendingToolBlocks[message.callId]) {
      streaming.fillToolResult(state.pendingToolBlocks[message.callId], message.content, message.isError);
      delete state.pendingToolBlocks[message.callId];
    }
    if (!message.isError && ["write", "edit", "move", "delete"].includes(message.name)) documents.refreshDocBrowser();
    state.streamingReasoningBlock = null;
    state.currentTextSegment = null;
    const cached = state.sessionCache.get(state.currentSessionId);
    if (cached) {
      cached.pendingToolBlocks = { ...state.pendingToolBlocks };
      cached.streamingReasoningBlock = null;
    }
  }

  function handleChatCancelled(message) {
    state.isStreaming = false;
    setSendDisabled(false);
    state.inputEl?.focus();
    streaming.removeTypingDots();
    if (state.streamingBubble) streaming.finishStreaming(state.streamingBubble);
    // Append a cancellation marker to the last text segment
    if (state.streamingBubble) {
      const segments = state.streamingBubble.querySelectorAll(".text-segment");
      const last = segments[segments.length - 1];
      if (last) {
        const cancelMark = document.createElement("span");
        cancelMark.className = "cancelled-mark";
        cancelMark.textContent = " (已取消)";
        last.appendChild(cancelMark);
      } else {
        // No text segments — add one with the marker
        const segment = document.createElement("div");
        segment.className = "text-segment markdown-body";
        const cancelMark = document.createElement("span");
        cancelMark.className = "cancelled-mark";
        cancelMark.textContent = "(已取消)";
        segment.appendChild(cancelMark);
        const contentDiv = state.streamingBubble.querySelector(".message-content");
        if (contentDiv) state.streamingBubble.insertBefore(segment, contentDiv);
        else state.streamingBubble.appendChild(segment);
      }
    }
    state.streamingBubble = null;
    state.streamingReasoningBlock = null;
    state.currentTextSegment = null;
    state.pendingToolBlocks = {};
    state.typingPlaceholder = null;
    const session = state.sessions.find((item) => item.id === state.currentSessionId);
    if (session) {
      state.currentSessionMessageCount = session.messages.length + 2;
      session.lastProvider = state.currentProvider;
      session.lastModel = state.currentModel;
      actions.renderSessionList();
    }
    updateCurrentCache();
    syncCompactButton();
  }

  function handleChatEnd(message) {
    state.isStreaming = false;
    setSendDisabled(false);
    state.inputEl?.focus();
    streaming.removeTypingDots();
    if (state.streamingBubble) streaming.finishStreaming(state.streamingBubble);
    state.streamingBubble = null;
    state.streamingReasoningBlock = null;
    state.currentTextSegment = null;
    state.pendingToolBlocks = {};
    state.typingPlaceholder = null;
    if (message.contextUsage || message.usage) state.latestUsage = message.contextUsage || message.usage;
    updateTokenDisplay(state.latestUsage);
    const session = state.sessions.find((item) => item.id === state.currentSessionId);
    if (session) {
      session.messages ||= [];
      session.messages.push({}, {});
      session.lastProvider = state.currentProvider;
      session.lastModel = state.currentModel;
      state.currentSessionMessageCount = session.messages.length;
      actions.renderSessionList();
    }
    updateCurrentCache();
    syncCompactButton();
  }

  function handleError(message) {
    state.isStreaming = false;
    setSendDisabled(false);
    state.inputEl?.focus();
    streaming.removeTypingDots();
    state.streamingBubble = null;
    state.streamingReasoningBlock = null;
    state.typingPlaceholder = null;
    if (state.pendingSubmission) {
      state.inputEl.value = state.pendingSubmission.content || "";
      state.pendingImages = state.pendingSubmission.images || [];
      actions.autoResizeInput();
      pickers.renderPendingImages();
      state.pendingUserBubble?.parentElement?.remove();
      state.pendingSubmission = null;
      state.pendingUserBubble = null;
    }
    showError(message.message);
    updateCurrentCache();
    syncCompactButton();
  }

  function updateBackgroundSession(message) {
    const cached = state.sessionCache.get(message.sessionId);
    if (!cached) return;
    if (message.type === "chatStart") cached.isStreaming = true;
    if (message.type === "chatEnd") clearCachedStreaming(message.sessionId);
    if (message.type === "chatCancelled") clearCachedStreaming(message.sessionId);
  }

  function clearCachedStreaming(sessionId) {
    const cached = state.sessionCache.get(sessionId);
    if (!cached) return;
    cached.isStreaming = false;
    cached.streamingBubble = null;
    cached.streamingReasoningBlock = null;
    cached.pendingToolBlocks = {};
    cached.typingPlaceholder = null;
  }

  function updateCurrentCache() {
    const cached = state.sessionCache.get(state.currentSessionId);
    if (!cached) return;
    clearCachedStreaming(state.currentSessionId);
    cached.currentSessionMessageCount = state.currentSessionMessageCount;
    cached.currentMessages = state.currentMessages;
  }

  return {
    bindGlobalEvents,
    compactCurrentSession,
    bindScrollListener,
    handleServerMessage,
    restartFromMessage,
    scrollToBottom,
    sendMessage,
    setSendDisabled,
    showError,
    syncCompactButton,
    updateSendAvailability,
    updateTokenDisplay,
  };
}
