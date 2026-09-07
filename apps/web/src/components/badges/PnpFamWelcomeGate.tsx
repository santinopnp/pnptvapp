import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  FEATURED_MODEL_ENABLED,
  ackFeaturedCreator,
  getFeaturedCreatorToday,
  getProfile,
  type FeaturedCreatorToday,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { PnpFamWelcomeModal } from "./PnpFamWelcomeModal";
import { PnpFamBenefitsModal } from "./PnpFamBenefitsModal";
import { PnpFamFeedCustomizer, type Shortcut } from "./PnpFamFeedCustomizer";

/**
 * Sequences the PNP Fam onboarding "one breathtaking moment":
 *
 *   1. Welcome modal  (auto when pnptvFamWelcomePending===true)
 *   2. Benefits modal (auto when pnptvFamBenefitsPending===true, right after
 *      welcome dismisses in the same session for maximum impact)
 *   3. Feed customizer (only if the user tapped "Set up my feed" in the
 *      benefits modal; skipping the benefits modal also skips this step)
 *
 * Preview mode — `?preview=pnp-fam-welcome` — walks Santino through the
 * entire sequence with no persistence. Used for canary approval.
 *
 * After each real dismissal the DB flag is set; the modal never fires again
 * for that user. Feed customizer is optional at any time later via the
 * feed header's "Customize" button.
 */
type Stage = "idle" | "welcome" | "benefits" | "customizer";

export function PnpFamWelcomeGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewParam = searchParams.get("preview") === "pnp-fam-welcome";

  const [stage, setStage] = useState<Stage>("idle");
  const [initialShortcuts, setInitialShortcuts] = useState<Shortcut[]>([]);

  const clearPreviewParam = useCallback(() => {
    if (!previewParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete("preview");
    setSearchParams(next, { replace: true });
  }, [previewParam, searchParams, setSearchParams]);

  // Kick off — one profile GET decides which stage (if any) to enter.
  useEffect(() => {
    if (previewParam) {
      setStage("welcome");
      return;
    }
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    getProfile()
      .then((res) => {
        if (cancelled) return;
        const p = res?.profile as
          | (typeof res.profile & { pnptvFamBenefitsPending?: boolean })
          | undefined;
        if (!p) return;
        if (p.pnptvFamWelcomePending === true) setStage("welcome");
        else if (p.pnptvFamBenefitsPending === true) setStage("benefits");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [previewParam, isAuthenticated, isLoading]);

  const handleWelcomeClose = useCallback(() => {
    // Move straight into benefits — same session, one moment.
    setStage("benefits");
  }, []);

  const handleBenefitsEnter = useCallback(async () => {
    // Fetch existing layout so customizer can hydrate before opening.
    if (!previewParam) {
      try {
        const res = await fetch("/api/pnp-fam/layout", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.layout?.shortcuts)) setInitialShortcuts(json.layout.shortcuts);
        }
      } catch (_) {}
    }
    setStage("customizer");
  }, [previewParam]);

  const handleBenefitsSkip = useCallback(() => {
    setStage("idle");
    clearPreviewParam();
  }, [clearPreviewParam]);

  const handleCustomizerSave = useCallback(
    async (shortcuts: Shortcut[]) => {
      if (!previewParam) {
        try {
          await fetch("/api/pnp-fam/layout", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "fam", shortcuts }),
          });
        } catch (_) {}
      }
      setStage("idle");
      clearPreviewParam();
    },
    [previewParam, clearPreviewParam]
  );

  const handleCustomizerSkip = useCallback(() => {
    setStage("idle");
    clearPreviewParam();
  }, [clearPreviewParam]);

  return (
    <>
      <PnpFamWelcomeModal
        open={stage === "welcome"}
        onClose={handleWelcomeClose}
        previewOnly={previewParam}
      />
      <PnpFamBenefitsModal
        open={stage === "benefits"}
        onEnter={handleBenefitsEnter}
        onSkip={handleBenefitsSkip}
        previewOnly={previewParam}
      />
      <PnpFamFeedCustomizer
        open={stage === "customizer"}
        initialShortcuts={initialShortcuts}
        onSave={handleCustomizerSave}
        onSkip={handleCustomizerSkip}
        previewOnly={previewParam}
      />
    </>
  );
}

export default PnpFamWelcomeGate;

// ── Featured Model of the Day interstitial ────────────────────────────────
// Full-screen editorial cover shown once per authenticated user per UTC
// day, fired on the first pageview after login. Skipped on checkout /
// onboarding / login routes so it never blocks a paying user or a
// pre-consent flow. Dismissing (X or "Skip for today") acks the day.

const FEATURED_SKIP_ROUTES = [
  "/subscribe",
  "/lifetime100",
  "/onboarding",
  "/login",
  "/register",
  "/verify",
  "/main-stage",
  "/chat/",
];

export function FeaturedModelInterstitial() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const t = useI18n();
  const es = t.lang === "es";

  const [featured, setFeatured] = useState<FeaturedCreatorToday | null>(null);
  const [open, setOpen] = useState(false);
  const [beacon, setBeacon] = useState<string | null>(null);

  // Refs so the visibility/focus listeners can read the latest state without
  // being re-registered on every route change or open toggle.
  const openRef = useRef(open);
  const pathRef = useRef(location.pathname);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    if (!FEATURED_MODEL_ENABLED) return;
    if (isLoading || !isAuthenticated) return;
    if (!user?.ageVerified || !user?.termsAccepted) return;

    // Server enforces the once-per-day gate — re-checking on visibility/focus
    // is cheap and lets mobile PWAs / Mini App resumes surface the modal
    // without a full reload.
    let cancelled = false;
    let inflight = false;
    const check = () => {
      if (cancelled || inflight || openRef.current) return;
      if (FEATURED_SKIP_ROUTES.some((r) => pathRef.current.startsWith(r))) return;
      inflight = true;
      getFeaturedCreatorToday()
        .then((res) => {
          if (cancelled || !res.show || !res.featured) return;
          setFeatured(res.featured);
          setOpen(true);
          setBeacon(res.featured.username);
        })
        .catch(() => {})
        .finally(() => { inflight = false; });
    };

    check();

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
    };
    // Intentionally scoped to auth-state changes; visibility/focus handle the
    // "app returned from background" trigger without re-registering listeners
    // per route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, user?.ageVerified, user?.termsAccepted]);

  // Fire-and-forget CRM view beacon once, when the modal first opens.
  useEffect(() => {
    if (!open || !beacon) return;
    fetch("/api/pnp-fam/event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "featured_view", payload: { creator: beacon } }),
    }).catch(() => {});
  }, [open, beacon]);

  const close = useCallback(
    (action: "dismiss" | "cta_profile" | "cta_intro_call") => {
      if (featured?.username) {
        fetch("/api/pnp-fam/event", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: action === "dismiss" ? "featured_dismiss" : "featured_cta_click",
            payload: { creator: featured.username, action },
          }),
        }).catch(() => {});
      }
      setOpen(false);
      ackFeaturedCreator().catch(() => {});
    },
    [featured]
  );

  if (!open || !featured) return null;

  const displayName = featured.firstName || featured.username;
  const pitch = (es ? featured.pitchEs : featured.pitchEn) || "";

  // Build the carousel slide list. Priority:
  //   1. album photos (creator's most-liked social posts, non-exclusive)
  //   2. admin media_url override (still shown first if present)
  //   3. cover, then avatar as last-resort so we never render blank
  const slides: { src: string; kind: "image" | "video" }[] = [];
  if (featured.mediaUrl) {
    slides.push({
      src: featured.mediaUrl,
      kind: /\.(mp4|webm|mov)(\?|$)/i.test(featured.mediaUrl) ? "video" : "image",
    });
  }
  for (const url of featured.albumPhotos || []) {
    if (!slides.find((s) => s.src === url)) slides.push({ src: url, kind: "image" });
  }
  if (slides.length === 0 && featured.coverPhotoUrl) slides.push({ src: featured.coverPhotoUrl, kind: "image" });
  if (slides.length === 0 && featured.photoUrl) slides.push({ src: featured.photoUrl, kind: "image" });

  const goProfile = () => {
    close("cta_profile");
    navigate(`/c/${featured.username}`);
  };
  const goIntroCall = () => {
    close("cta_intro_call");
    navigate(`/c/${featured.username}?action=book&duration=15`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={es ? "Modelo del día" : "Model of the day"}
      className="fixed inset-0 z-[9999] flex items-stretch justify-center"
      style={{ background: "rgba(6,4,12,0.94)" }}
    >
      {/* Full-viewport cover — magazine feel with a single primary CTA. */}
      <div className="relative w-full h-dvh flex flex-col overflow-hidden">
        {/* Carousel of album photos */}
        <FeaturedHeroCarousel slides={slides} />
        {/* Bottom gradient scrim for legibility over any photo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.88) 100%)",
          }}
        />

        {/* Close X */}
        <button
          type="button"
          onClick={() => close("dismiss")}
          aria-label={es ? "Cerrar" : "Close"}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>

        {/* Top badge */}
        <div className="relative z-10 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] px-5">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest"
            style={{
              background: "rgba(255,255,255,0.14)",
              color: "#fff",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 6.9L22 10l-6 4.6L18 22l-6-4-6 4 2-7.4L2 10l7.6-1.1z" />
            </svg>
            {es ? "Modelo del día" : "Model of the day"}
          </span>
        </div>

        {/* Content — name + pitch + CTAs, pinned to bottom */}
        <div className="relative z-10 mt-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] flex flex-col gap-4">
          <div>
            <div className="text-3xl font-black leading-tight text-white drop-shadow">
              {displayName}
            </div>
            <div className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>
              @{featured.username}
            </div>
          </div>
          {pitch && (
            <p className="text-[15px] leading-snug text-white/95 whitespace-pre-wrap max-w-xl">
              {pitch}
            </p>
          )}
          <div className="flex flex-col gap-2 max-w-md w-full">
            <button
              type="button"
              onClick={goProfile}
              className="w-full py-3.5 rounded-full font-bold text-[15px] text-white btn-gradient shadow-lg active:scale-[0.98] transition-transform"
            >
              {es ? `Ir al perfil de ${displayName}` : `Go to ${displayName}'s profile`}
            </button>
            {featured.ctaIntroCall && (
              <button
                type="button"
                onClick={goIntroCall}
                className="w-full py-3 rounded-full font-semibold text-[14px] transition-colors"
                style={{
                  background: "rgba(255,255,255,0.14)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.28)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }}
              >
                {es ? "Reservá una llamada de 15 min gratis" : "Book a free 15-min intro call"}
              </button>
            )}
            <button
              type="button"
              onClick={() => close("dismiss")}
              className="w-full py-2 text-[13px] font-medium text-white/70 hover:text-white transition-colors"
            >
              {es ? "Omitir por hoy" : "Skip for today"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Auto-advancing hero carousel ──────────────────────────────────────────
// 5s per slide, pauses on touch, Ken-Burns subtle zoom on the active slide.
// Renders a solid gradient if no slides exist so the interstitial never
// shows a blank background.
const CAROUSEL_INTERVAL_MS = 5000;

function FeaturedHeroCarousel({ slides }: { slides: { src: string; kind: "image" | "video" }[] }) {
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const touchX = React.useRef<number | null>(null);
  const total = slides.length;

  React.useEffect(() => {
    if (total < 2 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % total), CAROUSEL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [total, paused]);

  if (total === 0) {
    return <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #3c1a4d, #0a0612)" }} />;
  }

  const onTouchStart = (e: React.TouchEvent) => {
    setPaused(true);
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    setPaused(false);
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < 40) return;
    setIdx((i) => (dx < 0 ? (i + 1) % total : (i - 1 + total) % total));
  };

  return (
    <div
      className="absolute inset-0"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((s, i) => (
        <div
          key={`${s.src}-${i}`}
          className="absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === idx ? 1 : 0 }}
          aria-hidden={i !== idx}
        >
          {s.kind === "video" ? (
            <video
              src={s.src}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={s.src}
              alt=""
              className="w-full h-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
              style={{
                animation: i === idx ? "featuredKenBurns 8s ease-in-out infinite alternate" : "none",
                transformOrigin: i % 2 === 0 ? "center center" : "top right",
              }}
            />
          )}
        </div>
      ))}
      {/* Dot indicators — top-center, above the "Model of the day" badge */}
      {total > 1 && (
        <div className="absolute left-0 right-0 top-[calc(env(safe-area-inset-top,0px)+0.6rem)] flex justify-center gap-1.5 z-20 pointer-events-none">
          {slides.map((_, i) => (
            <span
              key={i}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === idx ? 20 : 6,
                background: i === idx ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes featuredKenBurns {
          0%   { transform: scale(1.0); }
          100% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
