import React, { useEffect, useRef, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { linkPrivyIdentity, getLinkedWallet } from "@/lib/api";
import { PREFERRED_WALLET_KEY } from "@/components/payments/PayInWalletChips";
import * as Sentry from "@sentry/react";
import { base, mainnet } from "viem/chains";
import { AuthProvider } from "@/hooks/useAuth";
import { NotificationProvider } from "@/hooks/useNotifications";
import { MusicPlayerProvider } from "@/hooks/useMusicPlayer";
import { MainStageProvider } from "@/components/mainstage/MainStageProvider";
import { PresenceProvider } from "@/hooks/usePresence";
import { router } from "@/router";
import { useI18n } from "@/lib/i18n";
import ErrorBoundary from "@/components/ErrorBoundary";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { PermissionOnboarding } from "@/components/PermissionOnboarding";
import { InstallPill } from "@/components/InstallPill";
import { PushNotificationPill } from "@/components/PushNotificationPill";
import { UpdateAvailableModal } from "@/components/UpdateAvailableModal";
import { useAuth } from "@/hooks/useAuth";
import { getSocket, connectSocket, disconnectSocket } from "@/lib/socket";
import { redeemReferralCode, checkAuthStatus, attributePartnerGroup, ApiError } from "@/lib/api";

const REFERRAL_STORAGE_KEY = "pnptv:pendingRef";

// Capture a ?ref=<code> from the landing URL on any path (not only /join),
// store it in localStorage, and redeem it as soon as the user is
// authenticated. Idempotent — only fires once per page load.
// Returns { primeGranted } so AppOverlays can surface the success banner.
function useReferralCapture() {
  const { isAuthenticated, refreshUser } = useAuth();
  const redeemedRef = useRef(false);
  const [primeGranted, setPrimeGranted] = useState(false);

  // 1. On first mount, read the URL once and persist any ?ref= for later.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && ref.trim()) {
        localStorage.setItem(REFERRAL_STORAGE_KEY, ref.trim().toUpperCase());
      }
    } catch (_) {
      /* localStorage / URL parse failure — non-critical */
    }
  }, []);

  // 2. When the user is authenticated, redeem any stored code exactly once.
  useEffect(() => {
    if (!isAuthenticated || redeemedRef.current) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem(REFERRAL_STORAGE_KEY);
    } catch (_) {
      return;
    }
    if (!code) return;
    redeemedRef.current = true;
    try {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch (_) { /* ignore */ }
    redeemReferralCode(code).then(
      (result) => {
        // eslint-disable-next-line no-console
        console.info("[referral] redeemed", { code, result });
        if (result?.primeGranted) {
          setPrimeGranted(true);
          // Refresh session so PRIME tier badge appears immediately.
          refreshUser().catch(() => {});
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("[referral] redemption failed", { code, error: err?.message || err });
      }
    );
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return { primeGranted, dismissPrime: () => setPrimeGranted(false) };
}


// Attribute the current user to a partner group once after login.
// The backend sets a short-lived cookie when they land on /join/{slug}.
// This call is completely silent — no UI feedback, no loading state.
function usePartnerGroupAttribution() {
  const { isAuthenticated } = useAuth();
  const attributedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || attributedRef.current) return;
    attributedRef.current = true;
    attributePartnerGroup().catch(() => {});
  }, [isAuthenticated]);
}

function useDocumentDir() {
  const { lang } = useI18n();
  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);
}

function useNavigationDiagnostics() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const dispatchNav = (kind: string, extra: Record<string, unknown> = {}) => {
      window.dispatchEvent(new CustomEvent("pnptv:navigation", {
        detail: {
          kind,
          href: window.location.href,
          pathname: window.location.pathname,
          ...extra,
        },
      }));
    };

    const origPushState = window.history.pushState.bind(window.history);
    const origReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = function (...args) {
      const prevPath = window.location.pathname;
      const ret = origPushState(...args);
      dispatchNav("pushState", { prevPath, nextPath: window.location.pathname });
      return ret;
    };

    window.history.replaceState = function (...args) {
      const prevPath = window.location.pathname;
      const ret = origReplaceState(...args);
      dispatchNav("replaceState", { prevPath, nextPath: window.location.pathname });
      return ret;
    };

    const onPopState = () => {
      dispatchNav("popstate");
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.history.pushState = origPushState;
      window.history.replaceState = origReplaceState;
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
}

// ── Screen capture audit hook ─────────────────────────────────────────────────
// Layer 2: screen-share detection (informational only — never blocks content).
// Uses the Capture Handle API (Chrome 116+) which no-ops silently on other
// browsers, plus a visibilitychange listener that fires a fire-and-forget
// audit POST so the backend can log potential screen-recording sessions.
function useScreenCaptureGuard() {
  useEffect(() => {
    // Capture Handle Config — informs the browser this tab is screen-capture
    // aware. Permitted origins is empty so no other origin can observe the handle.
    try {
      if (
        navigator.mediaDevices &&
        typeof (navigator.mediaDevices as unknown as { setCaptureHandleConfig?: (cfg: unknown) => void }).setCaptureHandleConfig === "function"
      ) {
        (navigator.mediaDevices as unknown as { setCaptureHandleConfig: (cfg: unknown) => void })
          .setCaptureHandleConfig({
            handle: crypto.randomUUID(),
            exposeOrigin: false,
            permittedOrigins: [],
          });
      }
    } catch {
      // No-op — API not available or permission denied.
    }

    // Visibility change: log hide events as an audit trail.
    // Also fires on normal tab switches — that is expected and acceptable.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        const payload = JSON.stringify({ ts: Date.now() });
        // sendBeacon survives page unload without server-side "request aborted" noise.
        try {
          const blob = new Blob([payload], { type: "application/json" });
          if (!navigator.sendBeacon?.("/api/webapp/analytics/visibility-hide", blob)) {
            fetch("/api/webapp/analytics/visibility-hide", {
              method: "POST",
              credentials: "include",
              keepalive: true,
              headers: { "Content-Type": "application/json" },
              body: payload,
            }).catch(() => {});
          }
        } catch {
          // No-op — best-effort audit only.
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}

// SW updates now apply silently after a 5s grace period (see main.tsx).
// No banner — user does not need to take any action.

type IncomingDmCall = {
  callId: string;
  roomName: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callerUsername: string | null;
  callerAvatar: string | null;
};

function useGlobalSocketEvents() {
  const { isAuthenticated, logout, user } = useAuth();
  const [suspendedMsg, setSuspendedMsg] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingDmCall | null>(null);
  const callDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = connectSocket();

    const onSessionExpired = async () => {
      // The socket revalidation loop kicked us — but a transient Redis blip or
      // cookie hiccup can fire this even when the HTTP session is still valid.
      // Double-check with a real API call before yanking the user to /login.
      try {
        const status = await checkAuthStatus();
        if (status.authenticated) {
          // False alarm — reconnect the socket and stay put.
          getSocket().connect();
          return;
        }
      } catch (err) {
        // Network error → don't kick either; only a hard 401 counts.
        if (!(err instanceof ApiError && err.status === 401)) return;
      }
      disconnectSocket();
      window.location.href = "/login?reason=session_expired";
    };

    const onSuspended = (data: { message?: string }) => {
      disconnectSocket();
      setSuspendedMsg(data?.message || "Your account has been suspended.");
      setTimeout(() => {
        if (logout) logout();
        window.location.href = "/login?reason=suspended";
      }, 4000);
    };

    const onDmCallIncoming = (data: IncomingDmCall) => {
      const myId = user?.dbId ?? user?.id ?? "";
      if (myId && String(data.calleeId) !== String(myId)) return;
      setIncomingCall(data);
      if (callDismissTimer.current) clearTimeout(callDismissTimer.current);
      callDismissTimer.current = setTimeout(() => {
        setIncomingCall(null);
        callDismissTimer.current = null;
      }, 45_000);
    };

    const onDmCallMissed = () => {
      setIncomingCall(null);
      if (callDismissTimer.current) { clearTimeout(callDismissTimer.current); callDismissTimer.current = null; }
    };

    socket.on("auth:session_expired", onSessionExpired);
    socket.on("auth:suspended", onSuspended);
    socket.on("dm:call:incoming", onDmCallIncoming);
    socket.on("dm:call:missed", onDmCallMissed);
    return () => {
      socket.off("auth:session_expired", onSessionExpired);
      socket.off("auth:suspended", onSuspended);
      socket.off("dm:call:incoming", onDmCallIncoming);
      socket.off("dm:call:missed", onDmCallMissed);
    };
  }, [isAuthenticated, logout, user?.dbId, user?.id]);

  const dismissIncomingCall = () => {
    setIncomingCall(null);
    if (callDismissTimer.current) { clearTimeout(callDismissTimer.current); callDismissTimer.current = null; }
  };

  return { suspendedMsg, incomingCall, dismissIncomingCall };
}

// Watches usePrivy().ready and reports a breadcrumb + Sentry warning if the
// SDK doesn't initialize within 5s — the fingerprint for a bad VITE_PRIVY_APP_ID,
// a Privy dashboard misconfig, or CORS/CSP blocking privy.io. Renders nothing.
function PrivyReadinessBreadcrumb() {
  const { ready } = usePrivy();
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn("[Privy] SDK not ready after 5s — check VITE_PRIVY_APP_ID + dashboard config");
      Sentry.captureMessage("Privy SDK not ready after 5s", { level: "warning" });
    }, 5000);
    return () => clearTimeout(t);
  }, [ready]);
  return null;
}

// Fires linkPrivyIdentity() once per browser session when Privy authenticates
// and an embedded wallet exists. Backfills users.privy_id + users.wallet_address
// on the pnptv row so support/gas-topup/downstream lookups can find the wallet.
// Runs GLOBALLY (not just in Onboarding step 7) so pre-Privy users who
// authenticate via the wallet FAB, BuyTokensModal, or any Privy entry point
// still get their identity persisted server-side. Guarded by sessionStorage so
// re-renders and route changes don't re-POST.
// Fires once per browser session when PNPtv is logged in but Privy is not.
// Triggers Privy's login modal automatically so users never have to hunt for
// "reconnect wallet" when switching devices — Privy's MPC layer recovers the
// wallet shard on the new device as soon as they authenticate.
function PrivyAutoLogin() {
  const { ready, authenticated, login } = usePrivy();
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) return;   // PNPtv not logged in yet
    if (!ready) return;             // Privy SDK still initializing
    if (authenticated) return;      // Already connected — nothing to do
    const flag = "__pnptv_privy_autologin";
    try { if (sessionStorage.getItem(flag) === "1") return; } catch { /* ignore */ }
    try { sessionStorage.setItem(flag, "1"); } catch { /* ignore */ }
    // Small delay: let any in-flight Privy session restore finish before
    // showing the modal, avoiding a flash on fast connections.
    const t = setTimeout(() => login(), 1800);
    return () => clearTimeout(t);
  }, [isAuthenticated, ready, authenticated, login]);
  return null;
}

function PrivyIdentitySync() {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0] || null;
  useEffect(() => {
    if (!authenticated || !embeddedWallet) return;
    const flag = "__pnptv_privy_linked";
    try { if (sessionStorage.getItem(flag) === "1") return; } catch { /* private mode — retry every mount */ }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;
        await linkPrivyIdentity(token);
        try { sessionStorage.setItem(flag, "1"); } catch { /* ignore */ }
      } catch (err) {
        // Non-fatal — user still has a working Privy session client-side. Log
        // to Sentry so we can measure how often the backend link is failing
        // (missing bug pre-fix). Cleared session flag lets the next mount retry.
        Sentry.addBreadcrumb({
          category: "privy",
          level: "warning",
          message: "linkPrivyIdentity failed",
          data: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, embeddedWallet?.address, getAccessToken]);

  // Cross-device seed for preferred wallet: if this browser has no localStorage
  // preference but the server row has one (set from another device), seed it
  // so this device also honors the choice. Runs once per auth cycle. Uses a
  // sessionStorage flag to avoid re-fetching on every route change.
  useEffect(() => {
    if (!authenticated) return;
    const seedFlag = "__pnptv_pref_wallet_seeded";
    try { if (sessionStorage.getItem(seedFlag) === "1") return; } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      try {
        // Read local first — if the user has already picked on this device,
        // don't overwrite with the server value (local wins for this session).
        const localPref = (() => {
          try { return localStorage.getItem(PREFERRED_WALLET_KEY); } catch { return null; }
        })();
        if (localPref) {
          try { sessionStorage.setItem(seedFlag, "1"); } catch { /* ignore */ }
          return;
        }
        const linked = await getLinkedWallet();
        if (cancelled) return;
        if (linked?.preferredWalletAddress) {
          try { localStorage.setItem(PREFERRED_WALLET_KEY, linked.preferredWalletAddress); } catch { /* ignore */ }
        }
        try { sessionStorage.setItem(seedFlag, "1"); } catch { /* ignore */ }
      } catch {
        // Non-fatal — device just falls back to the P1/P2 default (embedded
        // then first external) if the server call errors.
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated]);
  return null;
}

function AppOverlays() {
  const { isAuthenticated } = useAuth();
  const { suspendedMsg, incomingCall, dismissIncomingCall } = useGlobalSocketEvents();
  const { primeGranted, dismissPrime } = useReferralCapture();
  useDocumentDir();
  useScreenCaptureGuard();
  usePartnerGroupAttribution();
  return (
    <>
      <PermissionOnboarding isAuthenticated={isAuthenticated} />
      <NotificationPermissionPrompt isAuthenticated={isAuthenticated} />
      <InstallPill />
      <PushNotificationPill />
      <UpdateAvailableModal />
      {primeGranted && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9997] w-[calc(100%-2rem)] max-w-sm animate-slide-in-top">
          <div
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-2xl"
            style={{ background: "linear-gradient(135deg, #D4007A, #9B00B0)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            <span className="text-xl flex-shrink-0" aria-hidden="true">🎉</span>
            <p className="flex-1 text-sm font-semibold text-white leading-snug">
              You got 24 hours of PRIME — enjoy!
            </p>
            <button
              onClick={dismissPrime}
              className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {suspendedMsg && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6">
          <div className="bg-[#1C1C1E] border border-red-500/40 rounded-2xl p-6 max-w-sm w-full text-center space-y-3">
            <p className="text-2xl">⛔</p>
            <p className="text-red-400 font-semibold">Account Suspended</p>
            <p className="text-pnp-textSecondary text-sm">{suspendedMsg}</p>
            <p className="text-pnp-textSecondary text-xs">Redirecting to login…</p>
          </div>
        </div>
      )}
      {incomingCall && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] w-[calc(100%-2rem)] max-w-sm">
          <div className="bg-[#0d1f0d] border border-green-500/30 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                Incoming video call
              </p>
              <p className="text-xs text-green-300/80 truncate">{incomingCall.callerName}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  const call = incomingCall;
                  dismissIncomingCall();
                  connectSocket().emit("dm:call:accept", { callId: call.callId });
                  const url = `/dm/${call.callerId}?call=${encodeURIComponent(call.roomName)}&caller=${call.callerId}&callee=${call.calleeId}&callId=${call.callId}`;
                  router.navigate(url);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-green-600 hover:bg-green-500 transition-all active:scale-95"
              >
                Answer
              </button>
              <button
                type="button"
                onClick={() => {
                  const call = incomingCall;
                  dismissIncomingCall();
                  connectSocket().emit("dm:call:decline", { callId: call.callId, roomName: call.roomName });
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white/80 border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-400 transition-all active:scale-95"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  useNavigationDiagnostics();

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <AuthProvider>
          <PresenceProvider>
            <NotificationProvider>
              <MusicPlayerProvider>
                {/*
                  MainStageProvider must sit INSIDE AuthProvider (needs
                  isAuthenticated) and OUTSIDE RouterProvider (must survive
                  route changes). It creates the single LiveKit Room instance
                  and owns the connection lifecycle for persistent cam-across-
                  navigation (Phase 2 of cam-first redesign).
                */}
                <MainStageProvider>
                  <PrivyProvider
                    appId={import.meta.env.VITE_PRIVY_APP_ID as string}
                    config={{
                      defaultChain: base,
                      // Mainnet is included so users can bridge stranded ETH/USDC
                      // out of Ethereum → Base without needing to export the key
                      // or install MetaMask. The wallet UI still defaults to Base.
                      supportedChains: [base, mainnet],
                      loginMethods: ["email", "google", "telegram", "twitter", "wallet"],
                      // "all-users" ensures every user gets a PNPtv embedded wallet
                      // regardless of login method. Previously "users-without-wallets"
                      // meant a user who signed up by connecting Trust/MetaMask via
                      // WalletConnect never got an embedded wallet — leaving them
                      // stuck on the external wallet with no PNPtv rail to switch to.
                      // Existing wallet-only users get an embedded wallet on next login.
                      embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
                      // Own WalletConnect Cloud project id — dedicated rate-limit +
                      // reliable Trust/Rainbow/etc handshake. Falls back to Privy's
                      // shared id if unset (works but with silent throttling).
                      walletConnectCloudProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined,
                      appearance: { theme: "dark", accentColor: "#D4007A" },
                    }}
                  >
                    <PrivyReadinessBreadcrumb />
                    <PrivyIdentitySync />
                    <PrivyAutoLogin />
                    <RouterProvider router={router} />
                    <AppOverlays />
                  </PrivyProvider>
                </MainStageProvider>
              </MusicPlayerProvider>
            </NotificationProvider>
          </PresenceProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
