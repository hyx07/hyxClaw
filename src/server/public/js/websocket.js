export function createWebSocketClient({ onMessage, onStatus }) {
  let socket = null;
  let reconnectTimer = null;

  function connect() {
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}`);
    socket.addEventListener("open", () => onStatus(true));
    socket.addEventListener("error", () => onStatus(false));
    socket.addEventListener("close", () => {
      onStatus(false);
      reconnectTimer = setTimeout(connect, 3000);
    });
    socket.addEventListener("message", (event) => onMessage(JSON.parse(event.data)));
  }

  function send(data) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  function close() {
    clearTimeout(reconnectTimer);
    socket?.close();
  }

  return { connect, send, close };
}
