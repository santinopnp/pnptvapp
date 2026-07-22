import React, { lazy, useEffect, useState } from "react";
import { createBrowserRouter, Navigate, useParams } from "react-router-dom";

// ── Pre-live consent gate — shown every time a creator navigates to /creators/live ──
function PreLiveConsentGate({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState(false);
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
            <h2 className="text-base font-bold text-white">Before You Go Live</h2>
            <p className="text-xs" style={{ color: "var(--pnp-text-secondary,#8E8E93)" }}>Please read and confirm before starting your show</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#5ED1C4" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm text-white leading-relaxed">I confirm that my show follows <strong>scripted prompts and agreed content only</strong> — no unsolicited personal requests or real-time solicitation.</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#5ED1C4" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm text-white leading-relaxed">I have read and agree to the{" "}<a href="/creators/guidelines" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#7B61FF" }}>PNPtv! Community Guidelines</a>{" "}and will uphold them during my stream.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "linear-gradient(135deg,rgba(123,97,255,0.1),rgba(212,0,122,0.06))", border: "1px solid rgba(123,97,255,0.25)" }}>
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "#7B61FF" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "#A78BFA" }}>You are not alone 💜</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--pnp-text-secondary,#8E8E93)" }}>Our <strong className="text-white">Wellness Center</strong> has resources and community support available right now.{" "}<span style={{ color: "#D4007A" }}>Coming soon:</span> on-demand mental health sessions with licensed professionals — whenever you need them.</p>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={() => window.history.back()} className="flex-1 py-3 rounded-xl text-sm font-medium transition-all" style={{ background: "rgba(255,255,255,0.06)", color: "var(--pnp-text-secondary,#8E8E93)", border: "1px solid rgba(255,255,255,0.08)" }}>Go Back</button>
          <button onClick={() => setAccepted(true)} className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all" style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)", boxShadow: "0 4px 20px rgba(212,0,122,0.35)" }}>I Confirm — Go Live</button>
        </div>
      </div>
    </div>
  );
}
import { joinHangoutByInvite, ApiError } from "@/lib/api";

function HangoutToChatRedirect() {
  const { groupId } = useParams();
  return <Navigate to={`/chat/${groupId}`} replace />;
}

function CreatorUsernameRedirect() {
  const { username } = useParams<{ username: string }>();
  return <Navigate to={`/c/${username}`} replace />;
}

function MessagesToDmRedirect() {
  const { userId } = useParams();
  return <Navigate to={`/dm/${userId}`} replace />;
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
const VideoramaPage = lazy(() => import("@/pages/Channels").then((m) => ({ default: m.Videorama })));
const Chat = lazy(() => import("@/pages/Chat"));
const Social = lazy(() => import("@/pages/Social"));
const Profile = lazy(() => import("@/pages/Profile"));
const CreatorProfilePage = lazy(() => import("@/pages/CreatorProfilePage"));
const Subscribe = lazy(() => import("@/pages/Subscribe"));
const MyAccess = lazy(() => import("@/pages/MyAccess"));
const DirectMessages = lazy(() => import("@/pages/DirectMessages"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Support = lazy(() => import("@/pages/Support"));
const Apply = lazy(() => import("@/pages/Apply"));
const Welcome = lazy(() => import("@/pages/Welcome"));
const Join = lazy(() => import("@/pages/Join"));
const BecomeModel = lazy(() => import("@/pages/BecomeModel"));
const CmsPage = lazy(() => import("@/pages/CmsPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const BlogPage = lazy(() => import("@/pages/BlogPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const CareersPage = lazy(() => import("@/pages/CareersPage"));
const Legal2257Page = lazy(() => import("@/pages/Legal2257Page"));
const CommunityResourcesPage = lazy(() => import("@/pages/CommunityResourcesPage"));
const ShopPage = lazy(() => import("@/pages/ShopPage"));
const DownloadPage = lazy(() => import("@/pages/DownloadPage"));
const DashBankPage = lazy(() => import("@/pages/DashBankPage"));
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
const Mono = lazy(() => import("@/pages/admin/Mono"));
const Gamification = lazy(() => import("@/pages/admin/Gamification"));
const MediaPacks = lazy(() => import("@/pages/admin/MediaPacks"));
const StreamManagement = lazy(() => import("@/pages/admin/StreamManagement"));
const SupportDashboard = lazy(() => import("@/pages/admin/SupportDashboard"));
const AccessMatrix = lazy(() => import("@/pages/admin/AccessMatrix"));
const CreatorSubscriptions = lazy(() => import("@/pages/admin/CreatorSubscriptions"));
const XAutoCampaigns = lazy(() => import("@/pages/admin/XAutoCampaigns"));
const MeruLinks = lazy(() => import("@/pages/admin/MeruLinks"));
const DuplicateAccounts = lazy(() => import("@/pages/admin/DuplicateAccounts"));
const PaymentHealth = lazy(() => import("@/pages/admin/PaymentHealth"));
const CallAnalytics = lazy(() => import("@/pages/admin/CallAnalytics"));
const HangoutTelegramHealth = lazy(() => import("@/pages/admin/HangoutTelegramHealth"));
const Monitoring = lazy(() => import("@/pages/admin/Monitoring"));
const WellnessShell = lazy(() => import("@/pages/WellnessShell"));
const SelfCareCenter = lazy(() => import("@/pages/SelfCareCenter"));
const CristinaPage = lazy(() => import("@/components/CristinaWidget").then((m) => ({ default: m.CristinaWidget })));
const PrimeChannel = lazy(() => import("@/pages/admin/PrimeChannel"));
const Compliance2257 = lazy(() => import("@/pages/admin/Compliance2257"));
const AdminInviteLinks = lazy(() => import("@/pages/admin/InviteLinks"));
const ReferralAdmin = lazy(() => import("@/pages/admin/ReferralAdmin"));
const Lifetime100 = lazy(() => import("@/pages/Lifetime100"));
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
const CreatorChannelsHub = lazy(() => import("@/pages/creators/CreatorChannelsHub").then(m => ({ default: m.CreatorChannelsHub })));
const CreatorGuidelines = lazy(() => import("@/pages/creators/CreatorGuidelines"));
const CreatorStudioWizard = lazy(() => import("@/pages/creator/CreatorStudioWizard"));
const Donate = lazy(() => import("@/pages/Donate"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Models = lazy(() => import("@/pages/Models"));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
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
        element: (
          <ModuleLoader>
            <VerificationGate>
              <VideoramaPage />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "live",
        element: (
          <ModuleLoader>
            <VerificationGate>
              <Live />
            </VerificationGate>
          </ModuleLoader>
        ),
      },
      {
        path: "live/:streamId",
        element: (
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
      { path: "hangouts/:groupId", element: <HangoutToChatRedirect /> },
      // Short shareable alias: pnptv.app/h/123 → chat room
      { path: "h/:groupId", element: <HangoutToChatRedirect /> },
      { path: "pnplive", element: <Navigate to="/live" replace /> },
      { path: "pnptv-haus", element: <Navigate to="/?view=hangouts" replace /> },
      { path: "community-room", element: <Navigate to="/?view=hangouts" replace /> },
      { path: "da-haus", element: <Navigate to="/?view=hangouts" replace /> },
      { path: "portal", element: <Navigate to="/" replace /> },
      { path: "plans", element: <Navigate to="/subscribe" replace /> },
      { path: "memberships", element: <Navigate to="/subscribe" replace /> },
      {
        path: ":username",
        element: (
          <ModuleLoader>
            <Profile />
          </ModuleLoader>
        ),
      },
    ],
  },
  {
    path: "/admin",
    element: <AdminLayout />,
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
        path: "x-campaigns",
        element: (
          <ModuleLoader>
            <XAutoCampaigns />
          </ModuleLoader>
        ),
      },
      {
        path: "meru-links",
        element: (
          <ModuleLoader>
            <MeruLinks />
          </ModuleLoader>
        ),
      },
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
    children: [
      { index: true, element: <ModuleLoader><CreatorOverview /></ModuleLoader> },
      { path: "setup", element: <ModuleLoader><CreatorStudioWizard /></ModuleLoader> },
      { path: "content", element: <Navigate to="/creators/channels-hub" replace /> },
      { path: "earnings", element: <ModuleLoader><CreatorEarnings /></ModuleLoader> },
      { path: "payouts", element: <ModuleLoader><CreatorPayouts /></ModuleLoader> },
      { path: "live", element: <PreLiveConsentGate><ModuleLoader><CreatorLive /></ModuleLoader></PreLiveConsentGate> },
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
      { path: "guidelines", element: <ModuleLoader><CreatorGuidelines /></ModuleLoader> },
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
        <Donate />
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
    path: "/about",
    element: (
      <ModuleLoader>
        <AboutPage />
      </ModuleLoader>
    ),
  },
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
    path: "/bank",
    element: (
      <ModuleLoader>
        <DashBankPage />
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
]);
