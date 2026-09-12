import { io, Socket } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_URL || "https://pnptv.app";

let socket: Socket | null = null;

// iOS Safari aggressively kills WebSocket connections when the page is
// hidden (screen off, tab switched, app backgrounded). Instead of letting
// iOS tear the socket down mid-flight (causing a noisy reconnect loop every
// 20-60s), we proactively pause on hide and resume on show.
// _visibilityHandlerAttached guards against attaching multiple listeners if
// getSocket() is called more than once.
let _visibilityHandlerAttached = false;

function attachVisibilityLifecycle() {
  if (_visibilityHandlerAttached || typeof document === "undefined") return;
  _visibilityHandlerAttached = true;

  document.addEventListener("visibilitychange", () => {
    if (!socket) return;
    if (document.visibilityState === "hidden") {
      // Cleanly pause — prevents iOS from killing the socket mid-ping, which
      // causes a 60s wait before Socket.IO detects the loss and reconnects.
      if (socket.connected) socket.disconnect();
    } else {
      // Page is visible again — reconnect immediately instead of waiting for
      // Socket.IO's reconnectionDelay timer to fire.
      if (!socket.connected) socket.connect();
    }
  });
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      path: "/socket.io",
      withCredentials: true,
      autoConnect: false,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8_000,
      transports: ["websocket", "polling"],
    });
  }
  attachVisibilityLifecycle();
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    if (socket.connected) socket.disconnect();
    socket = null;
  }
  // Reset so the next connectSocket() re-attaches the listener to the new instance
  _visibilityHandlerAttached = false;
}
