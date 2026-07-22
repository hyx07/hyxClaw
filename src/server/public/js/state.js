export function createAppState() {
  return {
    currentSessionId: null,
    sessions: [],
    lastActiveSessionId: null,
    sessionCache: new Map(),
    currentSessionMessageCount: 0,
    currentMessages: [],

    availableProviders: [],
    providerConfigs: {},
    defaultProvider: "zai",
    defaultModel: "glm-4.7",
    defaultThinkingEffort: "none",
    currentProvider: "zai",
    currentModel: "glm-4.7",
    currentThinkingEffort: "none",
    gitSyncEnabled: false,

    isStreaming: false,
    streamingBubble: null,
    streamingReasoningBlock: null,
    currentTextSegment: null,
    pendingToolBlocks: {},
    typingPlaceholder: null,
    pendingSubmission: null,
    pendingUserBubble: null,
    latestUsage: null,
    isCompacting: false,
    compactingBubble: null,
    pendingImages: [],
    disconnectNotified: false,
    userScrolledUp: false,

    messagesEl: null,
    inputEl: null,
    sendBtn: null,
    tokenDisplayEl: null,
    compactBtnEl: null,
    providerSelectEl: null,
    modelSelectEl: null,
    thinkingEffortSelectEl: null,
    pendingImagesEl: null,
  };
}

export function clearChatElements(state) {
  state.messagesEl = null;
  state.inputEl = null;
  state.sendBtn = null;
  state.tokenDisplayEl = null;
  state.compactBtnEl = null;
  state.providerSelectEl = null;
  state.modelSelectEl = null;
  state.thinkingEffortSelectEl = null;
  state.pendingImagesEl = null;
}
