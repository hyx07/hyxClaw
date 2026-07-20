# 会话切换与消息流架构

本文说明前端多会话 DOM 缓存、WebSocket 消息分发、以及服务端消息发送的设计。

## 1. 核心设计

```
┌─────────────────────────────────────────────────────────┐
│                       Browser                           │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │   sessionCache    │    │   handleServerMessage    │   │
│  │   (Map<id, {     │    │                          │   │
│  │     childNodes,   │    │   msg.sessionId ===     │   │
│  │     isStreaming,  │◄───│   currentSessionId ?    │   │
│  │     streamingBubble│   │                          │   │
│  │     ...           │    │   是 → 渲染到当前 DOM    │   │
│  │   })              │    │   否 → 更新对应缓存      │   │
│  └──────────────────┘    └──────────┬───────────────┘   │
│                                      │                   │
│                              WebSocket                   │
└──────────────────────────────────────┼───────────────────┘
                                       │
┌──────────────────────────────────────┼───────────────────┐
│                       Server         │                   │
│                                      │                   │
│  ┌───────────────────┐    ┌──────────┴──────────────┐   │
│  │  processChatMessage│    │  API routes             │   │
│  │                   │    │  (session CRUD, compact) │   │
│  │  sendToClient()   │    │  broadcast()             │   │
│  │  直发给发起客户端   │    │  发给所有已连接客户端     │   │
│  └───────────────────┘    └─────────────────────────┘   │
│                                                         │
│  服务端不关心用户在看哪个会话，只管把数据扔给前端          │
└─────────────────────────────────────────────────────────┘
```

**职责边界**：

- 服务端：消息属于哪个会话，就标上 `sessionId` 发出去。不管客户端当前在看什么。
- 前端：唯一知道 `currentSessionId` 的地方。收到消息后自己决定渲染还是缓存。

## 2. 服务端：消息发送

### 2.1 sendToClient — 直发

```typescript
function sendToClient(client: Client, data: ServerMessage): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(data));
  }
}
```

`processChatMessage` 里**所有事件**都用它。因为聊天流的所有事件都属于发起请求的这个客户端，直接发给它就行。

### 2.2 broadcast — 广播

```typescript
function broadcast(data: ServerMessage): void {
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }
}
```

API 路由（HTTP 请求）里用。HTTP handler 没有 `client` 引用，但本地单用户永远只有一个 WebSocket 连接，广播等同于直发。

**不检查 `sessionId`**。因为：
1. 本地单用户，不需要"只发给看某个会话的标签页"
2. `client.sessionId` 存在歧义——它实际含义是"用户当前在 UI 里选中了哪个会话"，不是"这个连接属于哪个会话"
3. 过滤交给前端做

### 2.3 client.sessionId 只是元数据

`client.sessionId` 仅在 `joinSession` 时设置，用于服务端日志/调试，**不参与消息路由决策**。

### 2.4 processChatMessage 中的发送表

| 事件 | 发送方式 |
|------|---------|
| `chatStart` | `sendToClient` |
| `chatChunk` | `sendToClient` |
| `chatReasoning` | `sendToClient` |
| `toolCall` | `sendToClient` |
| `toolResult` | `sendToClient` |
| `chatEnd` | `sendToClient` |
| `error` | `sendToClient` |
| `toolPermissionRequest` | `sendToClient` |

全部直发，没有例外，没有兜底逻辑。

## 3. 前端：会话 DOM 缓存机制

### 3.1 切换时保存

```javascript
function selectSession(id) {
  // 1. 保存当前会话的 DOM 和运行时状态
  saveSessionState(currentSessionId);

  // 2. 切换 ID
  currentSessionId = id;

  // 3. 尝试从缓存恢复
  const restored = restoreSessionState(id);
  if (!restored) {
    renderChatArea();  // 首次访问，重建整个 chat 区域
  }
  // 恢复路径下 textarea 是同一个元素，值自然保留

  // 4. 向服务端声明当前会话（用于日志/重连恢复）
  joinSession(id);
}
```

`saveSessionState` 把 `messagesEl` 的所有子节点移入缓存，同时保存：

| 字段 | 说明 |
|------|------|
| `childNodes` | 消息列表 DOM 节点 |
| `isStreaming` | 是否正在生成 |
| `streamingBubble` | 正在流式填充的 assistant 气泡 DOM 引用 |
| `streamingReasoningBlock` | 推理块 DOM 引用 |
| `pendingToolBlocks` | 待完成的工具调用块 |
| `typingPlaceholder` | 打字动画节点 |
| `currentSessionMessageCount` | 消息计数（用于判断是否需要重渲染） |
| `currentMessages` | 消息数据快照 |

### 3.2 切换时恢复

`restoreSessionState` 把缓存的 `childNodes` 塞回 `messagesEl`，恢复所有运行时状态变量。

随后 `joinSession` 触发服务端返回 `sessionLoaded`，前端比较服务端消息数和缓存消息数：

- **相等** → 保留缓存 DOM（流式进行中，消息数未变）
- **不等** → 删除缓存，用服务端数据 `renderMessages` 完整重渲染

### 3.3 输入框

输入框**全局共享**，不按会话保存草稿。切换时：

- 缓存恢复路径：textarea 元素不变，值自然保留
- 首次访问路径（`renderChatArea`）：`innerHTML` 重建，用快照恢复值

## 4. 前端：后台会话事件处理

`handleServerMessage` 是消息分发的**唯一决策点**：

```
收到消息
  │
  ├─ msg.sessionId === currentSessionId
  │   → 正常处理（更新 DOM / 全局状态）
  │
  └─ msg.sessionId !== currentSessionId
      │
      ├─ chatStart → 更新缓存 isStreaming = true
      ├─ chatEnd   → 更新缓存 isStreaming = false, 清空 streaming 引用
      ├─ error     → 同上
      └─ 其他      → 直接丢弃（chatChunk/toolCall/toolResult 操作 DOM，不能跨会话）
```

`chatChunk`/`toolCall`/`toolResult` 直接丢弃，因为它们都操作当前 DOM：

- `chatChunk` → `appendChunk(streamingBubble, chunk)` — 往当前气泡追加文本
- `toolCall` → `appendToolCallBlock(streamingBubble, ...)` — 在当前气泡创建 DOM
- `toolResult` → `fillToolResult(pendingToolBlocks[name], ...)` — 填充当前块的 DOM

对后台会话操作没用，还会污染当前会话状态。

### 4.1 时序竞态：chatStart 丢失

```
User                    Frontend                  Server
 │                         │                         │
 │  发送消息               │                         │
 │ ──────────────────────►│                         │
 │                         │  sendMessage()          │
 │                         │  appendMessage(user)    │
 │                         │  WS: chatMessage ──────►│
 │  立即切到会话 B         │                         │
 │ ──────────────────────►│                         │
 │                         │  saveSessionState(A)    │
 │                         │  isStreaming: false     │  chatStart 还没到
 │                         │  streamingBubble: null   │
 │                         │                         │  processChatMessage()
 │                         │  ◄── sendToClient ───── │  chatStart {sessionId: A}
 │                         │  currentSessionId 是 B  │
 │                         │  → 更新缓存 isStreaming │
 │                         │    = true ✓             │
 │  切回会话 A             │                         │
 │ ──────────────────────►│                         │
 │                         │  restoreSessionState(A) │
 │                         │  isStreaming: true      │
 │                         │  streamingBubble: null  │  chatStart 时无法创建 DOM
 │                         │                         │
 │                         │  isStreaming &&         │
 │                         │  !streamingBubble →     │
 │                         │  补建 assistant 气泡 +   │
 │                         │  打字动画 ✓              │
```

## 5. 消息流完整时序

```
Browser                              Server
  │                                    │
  │  WS: chatMessage {sessionId: A}   │
  │ ─────────────────────────────────►│
  │                                    │  processChatMessage(client)
  │                                    │
  │  WS: chatStart ◄─ sendToClient ───│
  │  (isStreaming = true)             │
  │  WS: chatChunk ◄─ sendToClient ───│
  │  WS: toolCall ◄─ sendToClient ────│
  │  WS: toolResult ◄─ sendToClient ──│
  │  ...                              │
  │                                    │
  │         [用户切到会话 B]           │
  │  selectSession(B)                 │
  │  saveSessionState(A)              │
  │  - childNodes → cache             │
  │  - isStreaming: true → cache      │
  │  WS: joinSession {sessionId: B}   │
  │                                    │
  │         [A 继续生成，事件全部直发] │
  │  WS: chatChunk ◄─ sendToClient ───│  前端收到，sessionId 是 A
  │  msg.sessionId !== currentSessionId│  不是当前会话 → 丢弃
  │                                    │
  │  WS: chatEnd ◄─ sendToClient ─────│
  │  msg.sessionId !== currentSessionId│
  │  → 更新缓存: isStreaming = false  │
  │                                    │
  │         [用户切回会话 A]           │
  │  selectSession(A)                 │
  │  restoreSessionState(A)           │
  │  - isStreaming: false ✓           │
  │  - setSendDisabled(false) ✓       │
  │  WS: joinSession {sessionId: A}   │
  │  WS: sessionLoaded ◄──────────────│
  │  serverCount ≠ cacheCount →       │
  │  renderMessages() 重渲染 ✓        │
```

## 6. 设计要点

- 服务端不判断 `client.sessionId` 来做路由——消息全发，前端自己过滤
- `client.sessionId` 仅作元数据，在 `joinSession` 时更新，用于日志和重连恢复
- `processChatMessage` 全程 `sendToClient`，没有 broadcast，没有兜底
- API 路由用 `broadcast()` 发给所有连接（本地就一个）
- 前端 `handleServerMessage` 是唯一知道"当前显示哪个会话"并据此决策的地方
