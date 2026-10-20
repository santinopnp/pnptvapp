/**
 * Detects the backend's FACE_MATCH_CONSENT_REQUIRED (403) reply on ANY request
 * — JSON calls, multipart fetch uploads and XHR uploads with progress — and
 * notifies the FaceMatchConsentHost so it can show the opt-in prompt.
 *
 * Responses are observed via clones / load listeners and never modified, so
 * each caller's own error handling keeps working unchanged.
 */

import { FACE_MATCH_CONSENT_REQUIRED } from "@/lib/api";

const EVENT = "pnptv:face-match-consent-required";

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

function isConsentRequired(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { code?: unknown }).code === FACE_MATCH_CONSENT_REQUIRED;
}

let installed = false;

export function installFaceMatchConsentInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await originalFetch(...args);
    if (res.status === 403 && (res.headers.get("content-type") || "").includes("application/json")) {
      res.clone().json().then((body) => { if (isConsentRequired(body)) notify(); }).catch(() => {});
    }
    return res;
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args: Parameters<XMLHttpRequest["send"]>) {
    this.addEventListener("load", () => {
      if (this.status !== 403) return;
      try {
        const body = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
        if (isConsentRequired(body)) notify();
      } catch { /* not JSON */ }
    });
    return originalSend.apply(this, args);
  };
}

export function onFaceMatchConsentRequired(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
