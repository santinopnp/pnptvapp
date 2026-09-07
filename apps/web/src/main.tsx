import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./styles/globals.css";

// crypto.randomUUID polyfill — iOS Safari <15.4 and some in-app browsers lack it.
// Without this, App.tsx / MainStageProvider crash on first render.
if (typeof crypto !== "undefined" && typeof (crypto as Crypto).randomUUID !== "function") {
  (crypto as Crypto & { randomUUID: () => `${string}-${string}-${string}-${string}-${string}` }).randomUUID = function randomUUID() {
    const bytes = new Uint8Array(16);
    (crypto.getRandomValues || ((b: Uint8Array) => { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); return b; }))(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };
}

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.05,
  });
}

const REALTIME_SESSION_KEY = "pnptv:active-realtime-session";
const SW_UPDATE_PENDING_KEY = "pnptv:sw-update-pending";

async function clearClientCaches() {
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

function hasActiveRealtimeSession(): boolean {
  try {
    return !!sessionStorage.getItem(REALTIME_SESSION_KEY);
  } catch {
    return false;
  }
}

function markSwUpdatePending(): void {
  try {
    sessionStorage.setItem(SW_UPDATE_PENDING_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

function clearSwUpdatePending(): void {
  try {
    sessionStorage.removeItem(SW_UPDATE_PENDING_KEY);
  } catch {
    // ignore storage failures
  }
}

function dispatchSwUpdateStatus(status: string): void {
  try {
    window.dispatchEvent(new CustomEvent("pnptv:sw-update-status", { detail: { status } }));
  } catch {
    // ignore event dispatch failures
  }
}

const url = new URL(window.location.href);
const resetInProgress = url.searchParams.get("update") === "1" || url.searchParams.get("reset") === "1";
if (resetInProgress) {
  let redirectFired = false;
  const doRedirect = () => {
    if (redirectFired) return;
    redirectFired = true;
    try { sessionStorage.removeItem("pnptv:stale-chunk-reload"); } catch {}
    url.searchParams.delete("update");
    url.searchParams.delete("reset");
    window.location.replace(url.toString());
  };
  // 3-second hard ceiling — if clearClientCaches hangs (some WebViews block
  // getRegistrations()), we redirect anyway rather than leaving a blank page.
  const safetyTimer = window.setTimeout(doRedirect, 3000);
  clearClientCaches()
    .catch(() => undefined)
    .finally(() => {
      window.clearTimeout(safetyTimer);
      doRedirect();
    });
  document.documentElement.style.background = "#0a0a14";
  document.body.innerHTML = "";
}

// Vite 4.4+ emits this when a dynamic import chunk fails to load (stale build hash).
// Silently reload once — the new build's chunks will be fetched fresh.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("pnptv:stale-chunk-reload") === "1") return;
  sessionStorage.setItem("pnptv:stale-chunk-reload", "1");
  clearClientCaches()
    .catch(() => undefined)
    .finally(() => {
      const retryUrl = new URL(window.location.href);
      retryUrl.searchParams.set("update", "1");
      window.location.replace(retryUrl.toString());
    });
});

window.addEventListener("error", (event) => {
  const message = String(event.error?.message || event.message || "");
  const file = String(event.filename || "");
  const isStaleChunk =
    file.includes("/assets/") &&
    (message.includes("Failed to fetch dynamically imported module") ||
     message.includes("Importing a module script failed") ||
     (file.includes("/assets/Chat-") && (message.includes("before initialization") || message.includes("is not defined"))));
  if (!isStaleChunk || sessionStorage.getItem("pnptv:stale-chunk-reload") === "1") return;

  sessionStorage.setItem("pnptv:stale-chunk-reload", "1");
  clearClientCaches()
    .catch(() => undefined)
    .finally(() => {
      const retryUrl = new URL(window.location.href);
      retryUrl.searchParams.set("update", "1");
      window.location.replace(retryUrl.toString());
    });
});

// ── Patch DOM to prevent "removeChild" / "insertBefore" crashes ──────────────
// Browser extensions (Google Translate, ad blockers, etc.) and PWA chrome can
// mutate the DOM outside of React. When React later tries to reconcile, it
// calls removeChild/insertBefore on a node whose children have shifted, causing
// "NotFoundError: The node to be removed is not a child of this node."
// This patch makes those calls no-ops when the child doesn't belong to the parent.
if (typeof Node !== "undefined") {
  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn("[DOM patch] removeChild: node is not a child, skipping", child);
      return child;
    }
    return origRemoveChild.call(this, child) as T;
  };

  const origInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== this) {
      console.warn("[DOM patch] insertBefore: ref node is not a child, appending instead", refNode);
      return origInsertBefore.call(this, newNode, null) as T;
    }
    return origInsertBefore.call(this, newNode, refNode) as T;
  };
}

// Lock orientation to portrait (works for installed PWAs)
try { (screen.orientation as any)?.lock?.("portrait").catch(() => {}); } catch {}

if (!resetInProgress) {
  try {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    const w = window as unknown as { __pnptvShowBootError?: (r: string) => void };
    if (typeof w.__pnptvShowBootError === "function") w.__pnptvShowBootError("render-throw");
    throw err;
  }
}

// Hide splash screen after React mounts
if (!resetInProgress) {
  requestAnimationFrame(() => {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 500);
    }
  });
}

// ── Service Worker update detection (forced-update modal) ──
// When a new SW finishes installing, dispatch pnptv:update-available so the
// non-dismissible UpdateAvailableModal renders and forces the user to reload.
// The modal itself posts SKIP_WAITING when the user taps "Update now"; the
// controllerchange handler below then reloads the page.

// Keys shared with UpdateAvailableModal for once-daily low-traffic gating
const UPDATE_FIRST_SEEN_KEY = "pnptv:update-first-seen";
const UPDATE_DISMISSED_DATE_KEY = "pnptv:update-dismissed-date";

function shouldShowUpdateNow(): boolean {
  try {
    // Suppress if user already dismissed today
    if (localStorage.getItem(UPDATE_DISMISSED_DATE_KEY) === new Date().toDateString()) return false;
    // Force after 3 days of pending (prevents indefinite deferral)
    const firstSeen = localStorage.getItem(UPDATE_FIRST_SEEN_KEY);
    if (firstSeen && Date.now() - parseInt(firstSeen, 10) >= 3 * 86_400_000) return true;
    // Only prompt during low-traffic window: 3am–6am local time
    const h = new Date().getHours();
    return h >= 3 && h < 6;
  } catch {
    return true; // storage unavailable → fail open
  }
}

if (!resetInProgress && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((reg) => {
    let announced = false;

    const announceWaitingWorker = (origin: string) => {
      if (!reg.waiting) return;
      if (announced) return;
      // Record when we first detected this pending update
      try {
        if (!localStorage.getItem(UPDATE_FIRST_SEEN_KEY)) {
          localStorage.setItem(UPDATE_FIRST_SEEN_KEY, String(Date.now()));
        }
      } catch { /* ignore */ }
      if (!shouldShowUpdateNow()) return; // defer until low-traffic window
      announced = true;
      markSwUpdatePending();
      dispatchSwUpdateStatus(`${origin}-prompt`);
      window.dispatchEvent(new Event("pnptv:update-available"));
    };

    // Poll for updates every 10 min while the tab is open
    setInterval(() => {
      reg.update();
      if (reg.waiting) announceWaitingWorker("poll");
    }, 600_000);

    // Check for updates immediately when the user returns to the tab
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        reg.update().then(() => {
          if (reg.waiting) announceWaitingWorker("visibility");
        }).catch(() => {});
      }
    });

    const watchInstalling = (sw: ServiceWorker) => {
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          announceWaitingWorker("installed");
        }
      });
    };

    if (reg.waiting) announceWaitingWorker("initial");
    if (reg.installing) watchInstalling(reg.installing);
    reg.addEventListener("updatefound", () => {
      if (reg.installing) watchInstalling(reg.installing);
    });
  });

  // controllerchange fires after SKIP_WAITING — always reload to activate new SW.
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      clearSwUpdatePending();
      dispatchSwUpdateStatus("controllerchange-reload");
      window.location.reload();
    }
  });
}
