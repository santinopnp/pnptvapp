/**
 * Observes API responses on ANY request — JSON calls, multipart fetch uploads
 * and XHR uploads with progress — and raises app-wide events:
 *
 *   - FACE_MATCH_CONSENT_REQUIRED (403) → FaceMatchConsentHost shows the opt-in
 *   - content held for pre-publication review (2xx on an upload/publish
 *     endpoint) → ContentReviewNotice tells the creator it's in review
 *
 * Responses are observed via clones / load listeners and never modified, so
 * each caller's own handling keeps working unchanged.
 */

import { FACE_MATCH_CONSENT_REQUIRED } from "@/lib/api";

const CONSENT_EVENT = "pnptv:face-match-consent-required";
const REVIEW_EVENT = "pnptv:content-pending-review";

// Endpoints whose success response can say the content is waiting for review.
const REVIEW_PATHS = [
  /\/api\/webapp\/social\/posts\/with-(multi-)?media$/,
  /\/api\/webapp\/channels\/\d+\/videos\/\d+\/publish$/,
  /\/api\/webapp\/creator\/media$/,
  /\/api\/webapp\/creators\/media(\/upload(-video(\/complete)?)?)?$/,
];

function emit(name: string) {
  window.dispatchEvent(new Event(name));
}

function pathOf(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function isPendingReview(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const nested = (k: string) => (b[k] && typeof b[k] === "object" ? (b[k] as Record<string, unknown>) : null);
  return b.pendingReview === true
    || nested("video")?.review_status === "pending"
    || nested("item")?.reviewStatus === "pending"
    || nested("media")?.reviewStatus === "pending";
}

function inspect(status: number, url: string, body: unknown) {
  if (status === 403 && (body as { code?: unknown })?.code === FACE_MATCH_CONSENT_REQUIRED) emit(CONSENT_EVENT);
  if (status >= 200 && status < 300 && isPendingReview(body)) emit(REVIEW_EVENT);
}

function shouldInspect(status: number, url: string): boolean {
  if (status === 403) return true;
  return status >= 200 && status < 300 && REVIEW_PATHS.some((rx) => rx.test(pathOf(url)));
}

let installed = false;

export function installApiResponseEvents() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
    if (shouldInspect(res.status, url) && (res.headers.get("content-type") || "").includes("application/json")) {
      res.clone().json().then((body) => inspect(res.status, url, body)).catch(() => {});
    }
    return res;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __pnptvUrl?: string }, ...args: unknown[]) {
    this.__pnptvUrl = String(args[1]);
    return (originalOpen as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __pnptvUrl?: string }, ...args: Parameters<XMLHttpRequest["send"]>) {
    this.addEventListener("load", () => {
      const url = this.__pnptvUrl || "";
      if (!shouldInspect(this.status, url)) return;
      try {
        const body = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
        inspect(this.status, url, body);
      } catch { /* not JSON */ }
    });
    return originalSend.apply(this, args);
  };
}

export function onFaceMatchConsentRequired(cb: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, cb);
  return () => window.removeEventListener(CONSENT_EVENT, cb);
}

export function onContentPendingReview(cb: () => void): () => void {
  window.addEventListener(REVIEW_EVENT, cb);
  return () => window.removeEventListener(REVIEW_EVENT, cb);
}
