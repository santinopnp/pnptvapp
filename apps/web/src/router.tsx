import React, { lazy, useEffect, useState } from "react";
import { createBrowserRouter, Navigate, useLocation, useNavigate, useParams, useRouteError } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { joinHangoutByInvite, ApiError, getEvent, type EventItem } from "@/lib/api";
import { EventDetailModal } from "@/components/events/EventDetailModal";

// ── Pre-live consent gate — shown every time a creator navigates to /creators/live ──
function PreLiveConsentGate({ children }: { children: React.ReactNode }) {
  const t = useI18n().creator;
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const [consentScripted, setConsentScripted] = useState(false);
  const [consentGuidelines, setConsentGuidelines] = useState(false);
  const bothTicked = consentScripted && consentGuidelines;

  if (accepted) return <>{children}</>;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{ background: "var(--pnp-surface, #1C1C1E)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg,#D4007A22,#7B61FF22)", border: "1px solid rgba(212,0,122,0.3)" }}>
            <svg className="w-5 h-5" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M12 12h.01" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{t.preLiveTitle}</h2>
            <p className="text-xs" style={{ color: "var(--pnp-text-secondary,#8E8E93)" }}>{t.preLiveSubtitle}</p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer select-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <input id="pnp-router-1"
              type="checkbox"
              checked={consentScripted}
              onChange={(e) => setConsentScripted(e.target.checked)}
              className="mt-1 w-4 h-4 rounded accent-pnp-accent flex-shrink-0"
            />
            <p className="text-sm text-white leading-relaxed">
              {t.preLiveConsentScriptedPre}
              <strong>{t.preLiveConsentScriptedStrong}</strong>
              {t.preLiveConsentScriptedPost}
            </p>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer select-none" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <input id="pnp-router-2"
              type="checkbox"
              checked={consentGuidelines}
              onChange={(e) => setConsentGuidelines(e.target.checked)}
              className="mt-1 w-4 h-4 rounded accent-pnp-accent flex-shrink-0"
            />
            <p className="text-sm text-white leading-relaxed">
              {t.preLiveConsentGuidelinesPre}
              <a
                href="/creators/guidelines"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="underline"
                style={{ color: "#7B61FF" }}
              >
                {t.preLiveConsentGuidelinesLink}
              </a>
              {t.preLiveConsentGuidelinesPost}
            </p>
          </label>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "linear-gradient(135deg,rgba(123,97,255,0.1),rgba(212,0,122,0.06))", border: "1px solid rgba(123,97,255,0.25)" }}>
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#7B61FF" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "#A78BFA" }}>{t.preLiveWellnessTitle}</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--pnp-text-secondary,#8E8E93)" }}>
              {t.preLiveWellnessBody}{" "}
              <a href="/wellness" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#7B61FF" }}>
                {t.preLiveWellnessLink}
              </a>
            </p>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => navigate("/creators")}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
            style={{ background: "rgba(255,255,255,0.06)", color: "var(--pnp-text-secondary,#8E8E93)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {t.preLiveBack}
          </button>
          <button
            onClick={() => setAccepted(true)}
            disabled={!bothTicked}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)", boxShadow: bothTicked ? "0 4px 20px rgba(212,0,122,0.35)" : "none" }}
          >
            {t.preLiveConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function HangoutToChatRedirect() {
  const { groupId } = useParams();
  // Preserve search + hash: a redirect that rebuilds only the path silently
  // drops deep-link intent such as ?action=book.
  const { search, hash } = useLocation();
  return <Navigate to={`/chat/${groupId}${search}${hash}`} replace />;
}

function CreatorUsernameRedirect() {
  const { username } = useParams<{ username: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/c/${username}${search}${hash}`} replace />;
}

function RouteErrorFallback() {
  const error = useRouteError() as any;
  const is404 = error?.status === 404;
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--pnp-background, #0A0A0F)" }}
    >
      <p className="text-3xl font-bold text-white">{is404 ? "404" : "Oops"}</p>
      <p className="text-sm" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
        {is404 ? "Page not found" : "Something went wrong"}
      </p>
      <button
        type="button"
        onClick={() => { window.location.href = "/"; }}
        className="mt-2 min-h-[44px] px-6 rounded-2xl text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
      >
        Go home
      </button>
    </div>
  );
}

// Guard the `/:username` catch-all against dead top-level routes. Without this
// any unmatched path (e.g. `/tokens`, `/prime`) is treated as a username →
// `/api/webapp/social/profile/tokens` → 404 → "Profile Not Found" screen.
// Reserved segments here are known-dead routes historically hit from stale
// links, plus common typos of real routes. Extend as new dead links appear.
const RESERVED_USERNAME_SEGMENTS = new Set([
  "tokens", "wallet", "coins", "balance",
  "prime", "premium", "pro",
  "home", "index", "feed",
  "login", "logout", "signin", "signup", "register",
  "api", "static", "assets", "public",
  "undefined", "null",
]);

function UsernameProfileGate({ children }: { children: React.ReactNode }) {
  const { username } = useParams<{ username: string }>();
  if (username && RESERVED_USERNAME_SEGMENTS.has(username.toLowerCase())) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function MessagesToDmRedirect() {
  const { userId } = useParams();
  return <Navigate to={`/dm/${userId}`} replace />;
}

// Shareable event page — `/events/:eventId` renders the existing EventDetailModal
// as the page content so any event has a canonical URL that can be pasted anywhere.
// Uses the public `/api/proxy/events/:id` endpoint (no session required).
function EventShareGate() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!eventId) { setError("Missing event id"); return; }
    getEvent(eventId)
      .then((r) => { if (!cancelled) setEvent(r.event); })
      .catch(() => { if (!cancelled) setError("Event not found"); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-lg font-semibold mb-2" style={{ color: "var(--pnp-text-primary, #FFF)" }}>{error}</div>
          <button onClick={() => navigate("/")} className="text-sm underline" style={{ color: "#D4007A" }}>Back to feed</button>
        </div>
      </div>
    );
  }
  if (!event) {
    return <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--pnp-text-secondary, #A1A1A3)" }}>Loading event…</div>;
  }
  return <EventDetailModal event={event} onClose={() => navigate("/")} />;
}

function HangoutInviteRedirect() {
  const { code } = useParams();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!code) {
      setTarget("/?view=hangouts");
      return;
    }
    joinHangoutByInvite(code)
      .then((r) => {
        if (cancelled) return;
        setTarget(r?.groupId ? `/chat/${r.groupId}` : "/?view=hangouts");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setTarget("/login");
          return;
        }
        const msg = err instanceof Error ? err.message : "Invalid invite link";
        try {
          sessionStorage.setItem("pnptv:flash", JSON.stringify({ type: "error", message: msg }));
        } catch {}
        setTarget("/?view=hangouts");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!target) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black text-white">
        <div className="text-sm opacity-70">Joining hangout…</div>
      </div>
    );
  }
  return <Navigate to={target} replace />;
}

// ── Feature flag — set to false to re-enable live streaming ──────────────────
const STREAMS_DEPRECATED = false;

import { Layout } from "@/components/Layout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ModuleLoader } from "@/components/ModuleLoader";
import { VerificationGate } from "@/components/VerificationGate";
import { TierGate } from "@/components/TierGate";

// Main Stage accepts unauthenticated guests when they arrive via a redeemed
// invite (credentials in sessionStorage at `pnptv:ms:guest`). Wrap the page so
// VerificationGate is bypassed in that case — guests already accepted terms +
// confirmed age on the invite form.
//
// IMPORTANT: lock the decision in on initial mount via useState initializer.
// MainStage consumes (deletes) the sessionStorage key when it reads creds, so
// any subsequent re-render of this gate would see an empty sessionStorage and
// fall through to VerificationGate → /login. The useState snapshot prevents that.
function MainStageRouteGate({ children }: { children: React.ReactNode }) {
  const [hasGuestCreds] = useState(() => {
    try {
      const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("pnptv:ms:guest") : null;
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!(parsed?.token && parsed?.livekitUrl && parsed?.roomName);
    } catch { return false; }
  });
  if (hasGuestCreds) return <>{children}</>;
  return <VerificationGate>{children}</VerificationGate>;
}

const Home = lazy(() => import("@/pages/Home"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Live = lazy(() => import("@/pages/Live"));
const Stream = lazy(() => import("@/pages/Stream"));
const Nearby = lazy(() => import("@/pages/Nearby"));
const Channels = lazy(() => import("@/pages/Channels"));
const Chat = lazy(() => import("@/pages/Chat"));
const Social = lazy(() => import("@/pages/Social"));
const Profile = lazy(() => import("@/pages/Profile"));
const CreatorProfilePage = lazy(() => import("@/pages/CreatorProfilePage"));
const Subscribe = lazy(() => import("@/pages/Subscribe"));
const MyAccess = lazy(() => import("@/pages/MyAccess"));
const MySubscriptions = lazy(() => import("@/pages/MySubscriptions"));
const DirectMessages = lazy(() => import("@/pages/DirectMessages"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Support = lazy(() => import("@/pages/Support"));
const Apply = lazy(() => import("@/pages/Apply"));
const Welcome = lazy(() => import("@/pages/Welcome"));
const Join = lazy(() => import("@/pages/Join"));
const BecomeModel = lazy(() => import("@/pages/BecomeModel"));
const CmsPage = lazy(() => import("@/pages/CmsPage"));
const BlockedJurisdictionPage = lazy(() => import("@/pages/BlockedJurisdictionPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const BlogPage = lazy(() => import("@/pages/BlogPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const CareersPage = lazy(() => import("@/pages/CareersPage"));
const Legal2257Page = lazy(() => import("@/pages/Legal2257Page"));
const CommunityResourcesPage = lazy(() => import("@/pages/CommunityResourcesPage"));
const ShopPage = lazy(() => import("@/pages/ShopPage"));
const DownloadPage = lazy(() => import("@/pages/DownloadPage"));
const MainStage = lazy(() => import("@/pages/MainStage"));
const MainStageAdmin = lazy(() => import("@/pages/MainStageAdmin"));
const MainStageGuestJoin = lazy(() => import("@/pages/MainStageGuestJoin"));

const PostDetail = lazy(() => import("@/pages/PostDetail"));
const Settings = lazy(() => import("@/pages/Settings"));
const AccountSettings = lazy(() => import("@/pages/settings/AccountSettings"));
const PreferencesSettings = lazy(() => import("@/pages/settings/PreferencesSettings"));
const NotificationsSettings = lazy(() => import("@/pages/settings/NotificationsSettings"));
const PrivacySettings = lazy(() => import("@/pages/settings/PrivacySettings"));
const PaymentsSettings = lazy(() => import("@/pages/settings/PaymentsSettings"));
const DangerZoneSettings = lazy(() => import("@/pages/settings/DangerZoneSettings"));
const BookingConfirmation = lazy(() => import("@/pages/BookingConfirmation"));
const CallRoom = lazy(() => import("@/pages/CallRoom"));
const CallConfirmPage = lazy(() => import("@/pages/CallConfirmPage"));

// Admin pages
const StatsOverview = lazy(() => import("@/pages/admin/StatsOverview"));
const UserManagement = lazy(() => import("@/pages/admin/UserManagement"));
const UserDetail = lazy(() => import("@/pages/admin/UserDetail"));
const PlanManagement = lazy(() => import("@/pages/admin/PlanManagement"));
const ContentModeration = lazy(() => import("@/pages/admin/ContentModeration"));
const HangoutModeration = lazy(() => import("@/pages/admin/HangoutModeration"));
const AdminReports = lazy(() => import("@/pages/admin/Reports"));
const CreatorApplications = lazy(() => import("@/pages/admin/CreatorApplications"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const ExternalServices = lazy(() => import("@/pages/admin/ExternalServices"));
const NearbyPlaces = lazy(() => import("@/pages/admin/NearbyPlaces"));
const CanvaIntegration = lazy(() => import("@/pages/admin/CanvaIntegration"));
const AdminDemographics = lazy(() => import("@/pages/admin/AdminDemographics"));
const AdminMonetization = lazy(() => import("@/pages/admin/Monetization"));
const Mono = lazy(() => import("@/pages/admin/Mono"));
const Gamification = lazy(() => import("@/pages/admin/Gamification"));
const MediaPacks = lazy(() => import("@/pages/admin/MediaPacks"));
const StreamManagement = lazy(() => import("@/pages/admin/StreamManagement"));
const SupportDashboard = lazy(() => import("@/pages/admin/SupportDashboard"));
const AccessMatrix = lazy(() => import("@/pages/admin/AccessMatrix"));
const CreatorSubscriptions = lazy(() => import("@/pages/admin/CreatorSubscriptions"));
const PnpFamCrm = lazy(() => import("@/pages/admin/PnpFamCrm"));
const XAutoCampaigns = lazy(() => import("@/pages/admin/XAutoCampaigns"));
// MeruLinks removed 2026-08 (Meru retired)
const DuplicateAccounts = lazy(() => import("@/pages/admin/DuplicateAccounts"));
const PaymentHealth = lazy(() => import("@/pages/admin/PaymentHealth"));
const CallAnalytics = lazy(() => import("@/pages/admin/CallAnalytics"));
const CallDiagnostics = lazy(() => import("@/pages/admin/CallDiagnostics"));
const HangoutTelegramHealth = lazy(() => import("@/pages/admin/HangoutTelegramHealth"));
const Monitoring = lazy(() => import("@/pages/admin/Monitoring"));
const WellnessShell = lazy(() => import("@/pages/WellnessShell"));
const SelfCareCenter = lazy(() => import("@/pages/SelfCareCenter"));
const CristinaPage = lazy(() => import("@/components/CristinaWidget").then((m) => ({ default: m.CristinaWidget })));
const PrimeChannel = lazy(() => import("@/pages/admin/PrimeChannel"));
const Compliance2257 = lazy(() => import("@/pages/admin/Compliance2257"));
const AdminInviteLinks = lazy(() => import("@/pages/admin/InviteLinks"));
const AdminManualActivations = lazy(() => import("@/pages/admin/ManualActivations"));
const ReferralAdmin = lazy(() => import("@/pages/admin/ReferralAdmin"));
const Lifetime100 = lazy(() => import("@/pages/Lifetime100"));
const NequiNegociosPage = lazy(() =>
  import("@/pages/Lifetime100").then((m) => ({ default: m.NequiNegociosPage }))
);
const MercadoPagoPage = lazy(() =>
  import("@/pages/Lifetime100").then((m) => ({ default: m.MercadoPagoPage }))
);
const CryptoGuide = lazy(() => import("@/pages/CryptoGuide"));
const GamificationPage = lazy(() => import("@/pages/GamificationPage"));
const ReferralCenter = lazy(() => import("@/pages/ReferralCenter"));
const InvitePage = lazy(() => import("@/pages/InvitePage"));
const ConfirmPayment = lazy(() => import("@/pages/ConfirmPayment"));

// Creator Studio pages
const CreatorLayout = lazy(() => import("@/components/creators/CreatorLayout"));
const CreatorOverview = lazy(() => import("@/pages/creators/CreatorOverview"));
const CreatorEarnings = lazy(() => import("@/pages/creators/CreatorEarnings"));
const CreatorPayouts = lazy(() => import("@/pages/creators/CreatorPayouts"));
const CreatorLive = lazy(() => import("@/pages/creators/CreatorLive"));
const CreatorAvailability = lazy(() => import("@/pages/creators/CreatorAvailability"));
const CreatorAnalytics = lazy(() => import("@/pages/creators/CreatorAnalytics"));
const CreatorSettings = lazy(() => import("@/pages/creators/CreatorSettings"));
const CreatorApply = lazy(() => import("@/pages/creators/CreatorApply"));
const Appeal = lazy(() => import("@/pages/Appeal"));
const CreatorSubscribers = lazy(() => import("@/components/creators/CreatorLayout").then(m => ({ default: m.CreatorSubscribers })));
const CreatorConsents = lazy(() => import("@/components/creators/CreatorLayout").then(m => ({ default: m.CreatorConsents })));
const CreatorXCampaignsPage = lazy(() => import("@/components/creators/CreatorLayout").then(m => ({ default: m.CreatorXCampaigns })));
const CreatorBenefits = lazy(() => import("@/components/creators/CreatorLayout").then(m => ({ default: m.CreatorBenefits })));
const CreatorTools = lazy(() => import("@/components/creators/CreatorLayout").then(m => ({ default: m.CreatorTools })));
const CreatorChannelsHub = lazy(() => import("@/pages/creators/CreatorChannelsHub").then(m => ({ default: m.CreatorChannelsHub })));
const CreatorGuidelines = lazy(() => import("@/pages/creators/CreatorGuidelines"));
const CreatorNotices = lazy(() => import("@/pages/creators/CreatorNotices"));
const CreatorStudioWizard = lazy(() => import("@/pages/creator/CreatorStudioWizard"));
const CrystalServiceBookings = lazy(() => import("@/pages/creator/CrystalServiceBookings"));
const CreatorReplayShows = lazy(() => import("@/pages/creator/CreatorReplayShows"));
const PrivateCall = lazy(() => import("@/pages/PrivateCall"));
const Donate = lazy(() => import("@/pages/Donate"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Models = lazy(() => import("@/pages/Models"));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        index: true,
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Home />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "media",
        element: <Navigate to="/channels" replace />,
      },
      {
        path: "videorama-app",
        element: <Navigate to="/channels" replace />,
      },
      {
        path: "videorama",
        element: <Navigate to="/channels" replace />,
      },
      {
        path: "live",
        element: STREAMS_DEPRECATED ? <Navigate to="/" replace /> : (
          <ModuleLoader>
            <VerificationGate>
              <Live />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "live/:streamId",
        element: STREAMS_DEPRECATED ? <Navigate to="/" replace /> : (
          <ModuleLoader>
            <VerificationGate>
              <Stream />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "nearby",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Nearby />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "models",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Models />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "explore",
        element: <Navigate to="/nearby" replace />,
      },
      {
        path: "channels",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Channels />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "booking/:bookingId/confirm",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <BookingConfirmation />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "call/:bookingId",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <CallRoom />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "chat",
        element: <Navigate to="/?view=hangouts" replace />,
      },
      {
        path: "chat/:groupId",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Chat />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "mainstage",
        element: <Navigate to="/main-stage" replace />,
      },
      {
        path: "main-stage",
        element: (
          <ModuleLoader>
            <MainStageRouteGate>
              <MainStage />
            </MainStageRouteGate>
          </ModuleLoader>
        ),
        // Per-route boundary: if a grid or overlay throws, keep the app shell
        // (header, nav) alive and render a small recoverable error state
        // instead of crashing the entire SPA.
        errorElement: (
          <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
               style={{ background: "var(--pnp-background, #0A0A0F)" }}>
            <p className="text-white/80 text-sm font-semibold">Main Stage hit a snag</p>
            <p className="text-white/40 text-xs max-w-sm">
              Something went wrong rendering the stage. The rest of PNPtv is fine.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[44px] px-5 rounded-2xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="min-h-[44px] px-5 rounded-2xl text-sm font-semibold text-white/60"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                Go back
              </button>
            </div>
          </div>
        ),
      },
      {
        path: "main-stage/admin",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <MainStageAdmin standalone />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "dm",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <DirectMessages />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "dm/:userId",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <DirectMessages />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "social",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Social />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "social/post/:postId",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <PostDetail />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "profile",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Profile />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "profile/:userId",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Profile />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        // Settings: top-level menu + drill-down sub-pages.
        // The Settings component renders both the menu (index) and the right-column
        // shell (with <Outlet /> for sub-pages). Sub-routes render inside Outlet.
        path: "settings",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Settings />
            </VerificationGate>
          </ModuleLoader>
        ),
        children: [
          {
            path: "account",
            element: (
              <ModuleLoader>
                <AccountSettings />
              </ModuleLoader>
            ),
          },
          {
            path: "preferences",
            element: (
              <ModuleLoader>
                <PreferencesSettings />
              </ModuleLoader>
            ),
          },
          {
            path: "notifications",
            element: (
              <ModuleLoader>
                <NotificationsSettings />
              </ModuleLoader>
            ),
          },
          {
            path: "privacy",
            element: (
              <ModuleLoader>
                <PrivacySettings />
              </ModuleLoader>
            ),
          },
          {
            path: "payments",
            element: (
              <ModuleLoader>
                <PaymentsSettings />
              </ModuleLoader>
            ),
          },
          {
            path: "danger",
            element: (
              <ModuleLoader>
                <DangerZoneSettings />
              </ModuleLoader>
            ),
          },
        ],
      },
      {
        // Wellness Mode shell — accessible even when wellness mode is active
        // (the API guard's allowlist permits this route). Renders only the
        // wellness hangouts + Cristina + crisis resources.
        path: "wellness",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <WellnessShell />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        // Self-Care Center — dedicated home for harm-reduction & wellness
        // tools. Hosts the Use Tracker, Wellness Break Mode, Cristina link,
        // crisis resources, and future tools (sleep, mood, accountability).
        path: "self-care",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <SelfCareCenter />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        // Cristina AI page — full-screen mode. Also accessible in wellness mode
        // (the API guard allowlist covers /api/webapp/cristina/*).
        path: "cristina",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <CristinaPage mode="page" />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "welcome",
        element: (
          <ModuleLoader>
            <Welcome />
          </ModuleLoader>
        ),
      },
      {
        path: "subscribe",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Subscribe />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "my-access",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <MyAccess />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "my-subscriptions",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <MySubscriptions />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "badges",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <GamificationPage />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "referrals",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <ReferralCenter />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "support",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Support />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "apply",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Apply />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "creators/apply",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <CreatorApply />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      { path: "creator", element: <Navigate to="/creators" replace /> },
      { path: "creator/:username", element: <CreatorUsernameRedirect /> },
      {
        path: "c/:username",
        element: (
          <ModuleLoader>
            <CreatorProfilePage />
          </ModuleLoader>
        ),
      },
      { path: "messages", element: <Navigate to="/dm" replace /> },
      { path: "messages/:userId", element: <MessagesToDmRedirect /> },
      { path: "hangouts", element: <Navigate to="/?view=hangouts" replace /> },
      { path: "hangouts/invite/:code", element: <HangoutInviteRedirect /> },
      { path: "events/:eventId", element: <EventShareGate /> },
      { path: "hangouts/:groupId", element: <HangoutToChatRedirect /> },
      // Short shareable alias: pnptv.app/h/123 → chat room
      { path: "h/:groupId", element: <HangoutToChatRedirect /> },
      { path: "pnplive", element: <Navigate to="/live" replace /> },
      // Wallet lives inside a global sheet opened by the FAB on Home; deep
      // links from push/email/broadcast (e.g. wallet-launch push) land on
      // Home with a hint the sheet should auto-open on mount.
      { path: "wallet", element: <Navigate to="/?openWallet=1" replace /> },
      { path: "pnptv-haus", element: <Navigate to="/?view=hangouts" replace /> },
      { path: "community-room", element: <Navigate to="/?view=hangouts" replace /> },
      { path: "da-haus", element: <Navigate to="/?view=hangouts" replace /> },
      { path: "portal", element: <Navigate to="/" replace /> },
      { path: "plans", element: <Navigate to="/subscribe" replace /> },
      { path: "memberships", element: <Navigate to="/subscribe" replace /> },
      {
        path: ":username",
        element: (
          <UsernameProfileGate>
            <ModuleLoader>
              <Profile />
            </ModuleLoader>
          </UsernameProfileGate>
        ),
      },
    ],
  },
  {
    path: "/admin",
    element: <AdminLayout />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        index: true,
        element: (
          <ModuleLoader>
            <StatsOverview />
          </ModuleLoader>
        ),
      },
      {
        path: "users",
        element: (
          <ModuleLoader>
            <UserManagement />
          </ModuleLoader>
        ),
      },
      {
        path: "users/:id",
        element: (
          <ModuleLoader>
            <UserDetail />
          </ModuleLoader>
        ),
      },
      {
        path: "plans",
        element: (
          <ModuleLoader>
            <PlanManagement />
          </ModuleLoader>
        ),
      },
      {
        path: "posts",
        element: (
          <ModuleLoader>
            <ContentModeration />
          </ModuleLoader>
        ),
      },
      {
        path: "moderation",
        element: (
          <ModuleLoader>
            <ContentModeration />
          </ModuleLoader>
        ),
      },
      {
        path: "moderation/username-history",
        element: (
          <ModuleLoader>
            <ContentModeration defaultTab="usernames" />
          </ModuleLoader>
        ),
      },
      {
        path: "hangouts",
        element: (
          <ModuleLoader>
            <HangoutModeration />
          </ModuleLoader>
        ),
      },
      {
        path: "reports",
        element: (
          <ModuleLoader>
            <AdminReports />
          </ModuleLoader>
        ),
      },
      {
        path: "creators",
        element: (
          <ModuleLoader>
            <CreatorApplications />
          </ModuleLoader>
        ),
      },
      {
        path: "notifications",
        element: (
          <ModuleLoader>
            <AdminNotifications />
          </ModuleLoader>
        ),
      },
      {
        path: "places",
        element: (
          <ModuleLoader>
            <NearbyPlaces />
          </ModuleLoader>
        ),
      },
      {
        path: "services",
        element: (
          <ModuleLoader>
            <ExternalServices />
          </ModuleLoader>
        ),
      },
      {
        path: "canva",
        element: (
          <ModuleLoader>
            <CanvaIntegration />
          </ModuleLoader>
        ),
      },
      {
        path: "demographics",
        element: (
          <ModuleLoader>
            <AdminDemographics />
          </ModuleLoader>
        ),
      },
      {
        path: "monetization",
        element: (
          <ModuleLoader>
            <AdminMonetization />
          </ModuleLoader>
        ),
      },
      {
        path: "prime",
        element: (
          <ModuleLoader>
            <PrimeChannel />
          </ModuleLoader>
        ),
      },
      {
        path: "mono",
        element: (
          <ModuleLoader>
            <Mono />
          </ModuleLoader>
        ),
      },
      {
        path: "gamification",
        element: (
          <ModuleLoader>
            <Gamification />
          </ModuleLoader>
        ),
      },
      {
        path: "media-packs",
        element: (
          <ModuleLoader>
            <MediaPacks />
          </ModuleLoader>
        ),
      },
      {
        path: "streams",
        element: (
          <ModuleLoader>
            <StreamManagement />
          </ModuleLoader>
        ),
      },
      {
        path: "support",
        element: (
          <ModuleLoader>
            <SupportDashboard />
          </ModuleLoader>
        ),
      },
      {
        path: "access-matrix",
        element: (
          <ModuleLoader>
            <AccessMatrix />
          </ModuleLoader>
        ),
      },
      {
        path: "creator-subscriptions",
        element: (
          <ModuleLoader>
            <CreatorSubscriptions />
          </ModuleLoader>
        ),
      },
      {
        path: "pnp-fam",
        element: (
          <ModuleLoader>
            <PnpFamCrm />
          </ModuleLoader>
        ),
      },
      {
        path: "x-campaigns",
        element: (
          <ModuleLoader>
            <XAutoCampaigns />
          </ModuleLoader>
        ),
      },
      // meru-links route removed 2026-08 (Meru retired)
      {
        path: "duplicate-accounts",
        element: (
          <ModuleLoader>
            <DuplicateAccounts />
          </ModuleLoader>
        ),
      },
      {
        path: "payment-health",
        element: (
          <ModuleLoader>
            <PaymentHealth />
          </ModuleLoader>
        ),
      },
      {
        path: "hangout-telegram-health",
        element: (
          <ModuleLoader>
            <HangoutTelegramHealth />
          </ModuleLoader>
        ),
      },
      {
        path: "monitoring",
        element: (
          <ModuleLoader>
            <Monitoring />
          </ModuleLoader>
        ),
      },
      {
        path: "compliance-2257",
        element: (
          <ModuleLoader>
            <Compliance2257 />
          </ModuleLoader>
        ),
      },
      {
        path: "invite-links",
        element: (
          <ModuleLoader>
            <AdminInviteLinks />
          </ModuleLoader>
        ),
      },
      {
        path: "manual-activations",
        element: (
          <ModuleLoader>
            <AdminManualActivations />
          </ModuleLoader>
        ),
      },
      {
        path: "referrals",
        element: (
          <ModuleLoader>
            <ReferralAdmin />
          </ModuleLoader>
        ),
      },
      {
        path: "calls",
        element: (
          <ModuleLoader>
            <CallAnalytics />
          </ModuleLoader>
        ),
      },
      {
        path: "call-diagnostics",
        element: (
          <ModuleLoader>
            <CallDiagnostics />
          </ModuleLoader>
        ),
      },
      { path: "*", element: <Navigate to="/admin" replace /> },
    ],
  },
  // Creator Studio section
  {
    path: "/creators",
    element: (
      <ModuleLoader>
        <VerificationGate>
          <CreatorLayout />
        </VerificationGate>
      </ModuleLoader>
    ),
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <ModuleLoader><CreatorOverview /></ModuleLoader> },
      { path: "setup", element: <ModuleLoader><CreatorStudioWizard /></ModuleLoader> },
      { path: "content", element: <Navigate to="/creators/channels-hub" replace /> },
      { path: "earnings", element: <ModuleLoader><CreatorEarnings /></ModuleLoader> },
      { path: "payouts", element: <ModuleLoader><CreatorPayouts /></ModuleLoader> },
      { path: "live", element: STREAMS_DEPRECATED ? <Navigate to="/creators" replace /> : <PreLiveConsentGate><ModuleLoader><CreatorLive /></ModuleLoader></PreLiveConsentGate> },
      { path: "availability", element: <ModuleLoader><CreatorAvailability /></ModuleLoader> },
      { path: "analytics", element: <ModuleLoader><CreatorAnalytics /></ModuleLoader> },
      { path: "settings", element: <ModuleLoader><CreatorSettings /></ModuleLoader> },
      { path: "subscribers", element: <ModuleLoader><CreatorSubscribers /></ModuleLoader> },
      { path: "documentation", element: <ModuleLoader><CreatorConsents /></ModuleLoader> },
      { path: "consents", element: <Navigate to="/creators/documentation" replace /> },
      { path: "x-campaigns", element: <ModuleLoader><CreatorXCampaignsPage /></ModuleLoader> },
      { path: "documents", element: <Navigate to="/creators/documentation" replace /> },
      { path: "channels-hub", element: <ModuleLoader><CreatorChannelsHub /></ModuleLoader> },
      { path: "benefits", element: <ModuleLoader><CreatorBenefits /></ModuleLoader> },
      { path: "tools", element: <ModuleLoader><CreatorTools /></ModuleLoader> },
      { path: "guidelines", element: <ModuleLoader><CreatorGuidelines /></ModuleLoader> },
      { path: "services", element: <ModuleLoader><CrystalServiceBookings /></ModuleLoader> },
      { path: "replay-shows", element: <ModuleLoader><CreatorReplayShows /></ModuleLoader> },
      { path: "notices", element: <ModuleLoader><CreatorNotices /></ModuleLoader> },
    ],
  },
  // Main Stage guest join — public, no auth, no Layout shell
  {
    path: "/main-stage/join/:code",
    element: (
      <ModuleLoader>
        <MainStageGuestJoin />
      </ModuleLoader>
    ),
  },
  // Private Crystal Service call — creator + buyer only, gated by booking id.
  // Standalone route (no Layout shell) so the LiveKit video takes full viewport.
  {
    path: "/private-call/:bookingId",
    element: (
      <ModuleLoader>
        <PrivateCall />
      </ModuleLoader>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <ModuleLoader>
        <ResetPassword />
      </ModuleLoader>
    ),
  },
  {
    path: "/appeal",
    element: (
      <ModuleLoader>
        <Appeal />
      </ModuleLoader>
    ),
  },
  {
    path: "/donate",
    element: (
      <ModuleLoader>
        <VerificationGate>
          <Donate />
        </VerificationGate>
      </ModuleLoader>
    ),
  },
  {
    // Onboarding wizard — authenticated but no Layout/VerificationGate wrapper
    // so incomplete users aren't redirected away mid-wizard.
    path: "/onboarding",
    element: (
      <ModuleLoader>
        <Onboarding />
      </ModuleLoader>
    ),
  },
  {
    path: "/login",
    element: (
      <ModuleLoader>
        <LandingPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/auth",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/join",
    element: (
      <ModuleLoader>
        <Join />
      </ModuleLoader>
    ),
  },
  {
    // Geo-block explanation + self-certify page. Standalone top-level route
    // (no Layout wrapper) so it renders even for logged-out/blocked visitors
    // and outranks the "/" Layout tree's ":username" catch-all regardless of
    // declaration order (React Router v6 scores static segments higher than
    // dynamic ones) — without this route it fell through to that catch-all
    // and rendered as a "user not found" profile page.
    path: "/blocked-jurisdiction",
    element: (
      <ModuleLoader>
        <BlockedJurisdictionPage />
      </ModuleLoader>
    ),
  },
  ...[
    "terms",
    "privacy",
    "cookies",
    "community-guidelines",
    "content-policy",
    "refunds",
    "subscriptions",
    "creator-terms",
    "dmca",
    "safety",
    "contact",
  ].map((slug) => ({
    path: `/${slug}`,
    element: (
      <ModuleLoader>
        <CmsPage />
      </ModuleLoader>
    ),
  })),
  {
    path: "/blog",
    element: (
      <ModuleLoader>
        <BlogPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/blog/:slug",
    element: (
      <ModuleLoader>
        <BlogPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/about",
    element: (
      <ModuleLoader>
        <AboutPage />
      </ModuleLoader>
    ),
  },
  { path: "/promise", element: <Navigate to="/about" replace /> },
  { path: "/anti-spam", element: <Navigate to="/about" replace /> },
  {
    path: "/careers",
    element: (
      <ModuleLoader>
        <CareersPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/2257",
    element: (
      <ModuleLoader>
        <Legal2257Page />
      </ModuleLoader>
    ),
  },
  {
    path: "/community-resources",
    element: (
      <ModuleLoader>
        <CommunityResourcesPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/shop",
    element: (
      <ModuleLoader>
        <ShopPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/download",
    element: (
      <ModuleLoader>
        <DownloadPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/landing",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/become-a-model",
    element: (
      <ModuleLoader>
        <BecomeModel />
      </ModuleLoader>
    ),
  },
  {
    path: "/become-model",
    element: <Navigate to="/become-a-model" replace />,
  },
  {
    path: "/book-a-call/confirm",
    element: (
      <ModuleLoader>
        <CallConfirmPage />
      </ModuleLoader>
    ),
  },
  { path: "/lifetime80", element: <Navigate to="/lifetime100" replace /> },
  {
    path: "/lifetime100",
    element: (
      <ModuleLoader>
        <Lifetime100 />
      </ModuleLoader>
    ),
  },
  {
    path: "/lifetime100/activate",
    element: (
      <ModuleLoader>
        <Lifetime100 />
      </ModuleLoader>
    ),
  },
  {
    path: "/crypto-guide",
    element: (
      <ModuleLoader>
        <CryptoGuide />
      </ModuleLoader>
    ),
  },
  {
    path: "/how-to-pay",
    element: (
      <ModuleLoader>
        <CryptoGuide />
      </ModuleLoader>
    ),
  },
  // Invite page — public, no auth required (handles its own auth check inline)
  {
    path: "/invite/:code",
    element: (
      <ModuleLoader>
        <InvitePage />
      </ModuleLoader>
    ),
  },
  // Public alias — /lifetime → /subscribe (offer closed)
  { path: "/lifetime", element: <Navigate to="/subscribe" replace /> },
  { path: "/lifetime100b", element: <Navigate to="/lifetime100" replace /> },
  {
    path: "/nequinegocios",
    element: (
      <ModuleLoader>
        <NequiNegociosPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/mercadopago",
    element: (
      <ModuleLoader>
        <MercadoPagoPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/page/:slug",
    element: (
      <ModuleLoader>
        <CmsPage />
      </ModuleLoader>
    ),
  },
  {
    path: "/auth/callback",
    element: (
      <ModuleLoader>
        <AuthCallback />
      </ModuleLoader>
    ),
  },
  {
    path: "/confirm-payment/:token",
    element: (
      <ModuleLoader>
        <ConfirmPayment />
      </ModuleLoader>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
