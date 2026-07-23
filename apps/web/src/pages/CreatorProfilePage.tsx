/**
 * CreatorProfilePage — public-facing creator profile at /creator/:username
 *
 * A shareable "mini hub" landing page that creators post on their social bios.
 * Shows profile, CTA strip, social links, availability, call packages,
 * recent posts, exclusive content grid, and a share/QR section.
 * Does NOT require authentication to view (public page), but subscribe action
 * requires login.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import shaka from "shaka-player/dist/shaka-player.compiled";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Lock,
  CheckCircle2,
  X,
  AlertTriangle,
  PhoneCall,
  RefreshCw,
  Heart,
  Calendar,
  Share2,
  Copy,
  Check,
  Clock,
  ChevronDown,
  UserPlus,
  UserCheck,
  MessageCircle,
  MoreVertical,
  Flag,
  Ban,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  getPublicCreatorProfile,
  togglePostLike,
  subscribeToCreator,
  unsubscribeFromCreator,
  prepareUsdcSubscription,
  getCreatorSubscriptionStatus,
  type CreatorSubscriptionStatus,
  getWalletBalance,
  payCreatorSubWithTokens,
  createCreatorTip,
  getCreatorTipStatus,
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  isUserBlocked,
  createUserReport,
  ApiError,
  type CreatorTipPayload,
  type CreatorPublicProfile,
  type PublicCreatorMediaItem,
  type PublicCreatorChannel,
  type PublicCreatorFeaturedVideo,
  type PublicCreatorHangout,
  type PublicCallPackage,
  type CreatorRecentPost,
  type CreatorNextAvailability,
  type CreatorExclusiveTeaser,
  type ReportCategory,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { VideoPlayer } from "@/components/VideoPlayer";
import { BookCallModal } from "@/components/creators/BookCallModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Watermark positions — cycles every 30s for anti-screenshot deterrence
const WM_POSITIONS: Array<{ top?: string; bottom?: string; left?: string; right?: string }> = [
  { bottom: "10%", right: "8%" },
  { top: "10%", left: "8%" },
  { top: "40%", right: "8%" },
  { bottom: "10%", left: "8%" },
];

// ─── DRM-capable video player ─────────────────────────────────────────────────
// Wraps a <video> element with Shaka Player for Widevine/FairPlay DRM when
// VITE_DRM_ENABLED=true and the content has a drmContentId.
// Falls back to a plain <video> for non-DRM content or when DRM is not enabled.

interface DrmVideoPlayerProps {
  src: string;
  drmContentId?: string | null;
  poster?: string | null;
  watermarkLabel?: string;
}

function DrmVideoPlayer({ src, drmContentId, poster, watermarkLabel }: DrmVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shakaRef = useRef<shaka.Player | null>(null);
  const [initError, setInitError] = useState(false);
  const drmEnabled = import.meta.env.VITE_DRM_ENABLED === "true";

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Only initialise Shaka when DRM is enabled AND this content has a drmContentId
    if (!drmEnabled || !drmContentId) {
      // Plain video — just set src via the element directly if not already set
      return;
    }

    let player: shaka.Player | null = null;

    async function initShaka() {
      if (!shaka.Player.isBrowserSupported()) {
        setInitError(true);
        return;
      }

      try {
        player = new shaka.Player(videoEl!);
        shakaRef.current = player;

        // Fetch FairPlay certificate (iOS Safari)
        let fpsCertificate: ArrayBuffer | null = null;
        try {
          const certRes = await fetch("/api/webapp/drm/fairplay-cert", { credentials: "include" });
          if (certRes.ok) {
            fpsCertificate = await certRes.arrayBuffer();
          }
        } catch {
          // FairPlay cert unavailable — FairPlay DRM won't work on iOS but Widevine still will
        }

        player!.configure({
          drm: {
            servers: {
              "com.widevine.alpha": `/api/webapp/drm/widevine-license?contentId=${encodeURIComponent(drmContentId!)}`,
              "com.apple.fps.1_0": `/api/webapp/drm/fairplay-license?contentId=${encodeURIComponent(drmContentId!)}`,
            },
            advanced: fpsCertificate
              ? {
                  "com.apple.fps.1_0": {
                    serverCertificate: new Uint8Array(fpsCertificate),
                  },
                }
              : {},
          },
        });

        await player!.load(src);
      } catch (err) {
        // Shaka init failed — fall back to plain video
        setInitError(true);
        if (player) {
          try { await player.destroy(); } catch { /* ignore */ }
        }
        shakaRef.current = null;
      }
    }

    void initShaka();

    return () => {
      if (shakaRef.current) {
        shakaRef.current.destroy().catch(() => { /* ignore */ });
        shakaRef.current = null;
      }
    };
  }, [src, drmContentId, drmEnabled]);

  // If DRM init failed or DRM not needed, render a plain video element
  const usePlainVideo = initError || !drmEnabled || !drmContentId;

  return (
    <div style={{ position: "relative" }}>
      <video
        ref={videoRef}
        src={usePlainVideo ? src : undefined}
        poster={poster ?? undefined}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        playsInline
        autoPlay
        className="max-w-full max-h-[90dvh] rounded-xl"
        style={{ background: "#000" }}
      />
      {watermarkLabel && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            color: "rgba(255,255,255,0.12)",
            fontSize: 10,
            fontFamily: "monospace",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 20,
            whiteSpace: "nowrap",
            textShadow: "0 1px 3px rgba(0,0,0,0.95)",
          }}
        >
          {watermarkLabel}
        </div>
      )}
    </div>
  );
}

function creatorTierLabel(type: CreatorPublicProfile["creator"]["creator_type"]): string {
  switch (type) {
    case "diamond":
    case "full_time":
      return "Diamond 💎";
    case "ice":
      return "Ice 🧊";
    case "crystal":
      return "Crystal ✨";
    default:
      return "Creator";
  }
}

function formatPrice(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(usd);
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

function formatTimeRange(start: string, end: string): string {
  function fmt(t: string): string {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function availabilityDayLabel(avail: CreatorNextAvailability): string {
  if (avail.days_from_now === 0) return "Hoy";
  if (avail.days_from_now === 1) return "Mañana";
  return DAY_NAMES[avail.day_of_week] ?? "";
}

// ─── Badge row — PRIME / Performer / Creador pills ─────────────────────────────

function CreatorBadgeRow({
  isPrime,
  creatorRole,
  priceUsd,
}: {
  isPrime: boolean;
  creatorRole: "live" | "content_creator" | "both" | null;
  priceUsd: number | null;
}) {
  const isPerformer = creatorRole === "live" || creatorRole === "both";
  return (
    <>
      {isPrime && (
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
          style={{ background: "rgba(255,180,84,.16)", border: "1px solid rgba(255,180,84,.5)", color: "#FFB454" }}
        >
          PRIME
        </span>
      )}
      {isPerformer && (
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold"
          style={{ background: "rgba(94,209,196,.14)", border: "1px solid rgba(94,209,196,.45)", color: "#5ED1C4" }}
        >
          ★ Performer
        </span>
      )}
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold"
        style={{ background: "rgba(212,0,122,.16)", border: "1px solid rgba(212,0,122,.5)", color: "#FF4DA6" }}
      >
        ★ Creador
      </span>
      {priceUsd != null && priceUsd > 0 && (
        <span className="text-[11px] text-pnp-textSecondary">· ${priceUsd.toFixed(0)}/mo</span>
      )}
    </>
  );
}

// ─── Social link icons (inline SVG, no icon library) ─────────────────────────

interface SocialIconProps {
  platform: string;
  size?: number;
}

function SocialIcon({ platform, size = 16 }: SocialIconProps) {
  const s = size;
  switch (platform) {
    case "twitter":
    case "x":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "telegram":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    default:
      return null;
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "X",
  x: "X",
  telegram: "Telegram",
};

const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  harassment: "Acoso o bullying",
  hate: "Discurso de odio o discriminación",
  spam_scam: "Spam o estafa",
  impersonation: "Suplantación de identidad",
  csam: "Seguridad infantil — urgente",
  nudity_nonconsensual: "Contenido íntimo sin consentimiento",
  self_harm: "Autolesión o suicidio",
  other: "Otro",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="min-h-dvh" style={{ background: "var(--pnp-background)" }}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-24 space-y-5">
        {/* Header skeleton */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full animate-pulse" style={{ background: "var(--pnp-surface)" }} />
          <div className="h-6 w-36 rounded-lg animate-pulse" style={{ background: "var(--pnp-surface)" }} />
          <div className="h-4 w-24 rounded-lg animate-pulse" style={{ background: "var(--pnp-surface)" }} />
          <div className="h-3 w-48 rounded-lg animate-pulse" style={{ background: "var(--pnp-surface)" }} />
        </div>
        {/* CTA strip skeleton */}
        <div className="flex gap-2">
          <div className="flex-1 h-12 rounded-2xl animate-pulse" style={{ background: "var(--pnp-surface)" }} />
          <div className="w-32 h-12 rounded-2xl animate-pulse" style={{ background: "var(--pnp-surface)" }} />
        </div>
        {/* Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-xl animate-pulse"
              style={{ background: "var(--pnp-surface)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

interface LightboxProps {
  item: PublicCreatorMediaItem;
  onClose: () => void;
  watermarkLabel?: string;
}

function Lightbox({ item, onClose, watermarkLabel }: LightboxProps) {
  // Rotating watermark position index (cycles every 30s)
  const [wmIdx, setWmIdx] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!watermarkLabel) return;
    const interval = setInterval(() => {
      setWmIdx((i) => (i + 1) % WM_POSITIONS.length);
    }, 30000);
    return () => clearInterval(interval);
  }, [watermarkLabel]);

  // The backend sends camelCase `mediaType`; the interface declares `media_type`.
  // Support both to be resilient against the existing field naming mismatch.
  const mediaType = (item as unknown as { mediaType?: string }).mediaType ?? item.media_type;
  const thumbUrl = (item as unknown as { thumbUrl?: string | null }).thumbUrl ?? item.thumb_url;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
    >
      <button
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
        onClick={onClose}
        aria-label="Close media viewer"
      >
        <X size={18} />
      </button>

      <div
        className="max-w-[90vw] max-h-[90dvh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {mediaType === "video" ? (
          <DrmVideoPlayer
            src={item.url!}
            drmContentId={item.drmContentId}
            poster={thumbUrl}
            watermarkLabel={watermarkLabel}
          />
        ) : (
          <div style={{ position: "relative" }}>
            <img
              src={item.url!}
              alt={item.caption ?? "Creator media"}
              className="max-w-full max-h-[90dvh] rounded-xl object-contain"
            />
            {watermarkLabel && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  color: "rgba(255,255,255,0.12)",
                  fontSize: 10,
                  fontFamily: "monospace",
                  pointerEvents: "none",
                  userSelect: "none",
                  zIndex: 20,
                  whiteSpace: "nowrap",
                  textShadow: "0 1px 3px rgba(0,0,0,0.95)",
                  transition: "top 0.5s, bottom 0.5s, left 0.5s, right 0.5s",
                  ...WM_POSITIONS[wmIdx],
                }}
              >
                {watermarkLabel}
              </div>
            )}
          </div>
        )}
      </div>

      {item.caption && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
          <p className="text-sm text-white/80 text-center max-w-md bg-black/60 px-3 py-1.5 rounded-lg">
            {item.caption}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Channel access badge/subtitle — accordion channel row helper ─────────────

function channelAccessInfo(ch: PublicCreatorChannel): { subtitle: string; badgeLabel: string; badgeColor: string } {
  switch (ch.access_type) {
    case "prime":
      return { subtitle: "Canal PRIME", badgeLabel: "PRIME", badgeColor: "#FFD700" };
    case "subscription":
      return {
        subtitle: ch.price_usd > 0 ? `Canal de pago · $${ch.price_usd.toFixed(0)}/mo` : "Canal de pago",
        badgeLabel: "PAGO",
        badgeColor: "#FBBF24",
      };
    case "paid":
      return {
        subtitle: ch.price_usd > 0 ? `Canal de pago · $${ch.price_usd.toFixed(0)}` : "Canal de pago",
        badgeLabel: "PAGO",
        badgeColor: "#FBBF24",
      };
    default:
      return { subtitle: "Canal gratuito · previews", badgeLabel: "GRATIS", badgeColor: "#34D399" };
  }
}

// ─── Subscribe panel ──────────────────────────────────────────────────────────

interface SubscribePanelProps {
  creatorId: string;
  priceUsd: number;
  videoCount: number;
  photoCount: number;
  onSuccess: () => void;
}

function SubscribePanel({ creatorId, priceUsd, videoCount, photoCount, onSuccess }: SubscribePanelProps) {
  const [loading, setLoading] = useState<"crypto" | "tokens" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentPending, setPaymentPending] = useState(false);
  const [tokenBalance, setTokensBalance] = useState<number | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    getWalletBalance()
      .then((res) => { if (res.success) setTokensBalance(res.balance); })
      .catch(() => {});
  }, []);

  async function handleTokens() {
    if (inFlight.current) return;
    const tokenCost = Math.round(priceUsd * 100);
    if (tokenBalance !== null && tokenBalance < tokenCost) {
      setError(`Tokens insuficientes. Necesitas ${tokenCost.toLocaleString()} F — tienes ${tokenBalance.toLocaleString()} F.`);
      return;
    }
    inFlight.current = true;
    setLoading("tokens");
    setError(null);
    try {
      const result = await payCreatorSubWithTokens(creatorId);
      if (!result.success) {
        if (result.code === "MEMBER_REQUIRED") {
          setError("Necesitas una membresía Basic para suscribirte a un creador.");
        } else if (result.code === "INSUFFICIENT_TOKENS") {
          setError(`Tokens insuficientes. Necesitas ${result.required?.toLocaleString()} F — tienes ${result.current?.toLocaleString()} F.`);
        } else {
          setError(result.error || "No se pudo activar la suscripción.");
        }
        return;
      }
      if (result.newBalance !== undefined) setTokensBalance(result.newBalance);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al pagar con Tokens.");
    } finally {
      setLoading(null);
      inFlight.current = false;
    }
  }

  async function handleCrypto() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading("crypto");
    setError(null);
    try {
      const result = await prepareUsdcSubscription("creator_monthly", undefined, creatorId);
      if (!result.invoiceUrl) throw new Error("No payment URL received");
      setPaymentUrl(result.invoiceUrl);
      window.open(result.invoiceUrl, "_blank", "noopener,noreferrer,width=800,height=700");
      setPaymentPending(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "";
      const cryptoErrors: Record<string, string> = {
        MEMBER_REQUIRED: "Necesitas una membresía Basic para suscribirte con crypto. Usa Pagar con Tarjeta / PSE en su lugar.",
        CREATOR_LOCKED: "Este creador no está aceptando suscripciones por el momento.",
        SUBSCRIPTIONS_PAUSED: "Este creador pausó sus suscripciones temporalmente.",
      };
      setError(cryptoErrors[msg] ?? (msg || "Algo salió mal. Por favor intenta de nuevo."));
    } finally {
      setLoading(null);
      inFlight.current = false;
    }
  }

  if (paymentPending) {
    return (
      <div
        className="rounded-2xl p-4 mt-1 border border-white/10 text-center space-y-3"
        style={{ background: "var(--pnp-surface)" }}
      >
        <p className="text-sm text-pnp-textPrimary font-medium">
          Pago abierto en nueva pestaña
        </p>
        <p className="text-xs text-pnp-textSecondary">
          Completa tu pago y vuelve aquí para verificar tu suscripción.
        </p>
        {paymentUrl && (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-pnp-accent underline decoration-dotted"
          >
            Volver a abrir página de pago
          </a>
        )}
        <button
          disabled={loading === "verify"}
          onClick={async () => {
            setLoading("verify");
            setError(null);
            try {
              const status = await getCreatorSubscriptionStatus(creatorId);
              if (status.subscribed) {
                onSuccess();
              } else {
                setError("Tu pago aún no se ha confirmado. Espera un momento y vuelve a intentarlo.");
              }
            } catch {
              setError("No se pudo verificar. Intenta de nuevo.");
            } finally {
              setLoading(null);
            }
          }}
          className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--pnp-accent)" }}
        >
          <RefreshCw size={14} aria-hidden="true" className={loading === "verify" ? "animate-spin" : ""} />
          {loading === "verify" ? "Verificando…" : "Verificar suscripción"}
        </button>
      </div>
    );
  }

  const hasContent = videoCount > 0 || photoCount > 0;

  return (
    <div
      className="rounded-2xl p-4 mt-1 border border-white/10 space-y-3"
      style={{ background: "var(--pnp-surface)" }}
    >
      <p className="text-sm text-pnp-textSecondary text-center">
        Desbloquea todo el contenido exclusivo por{" "}
        <span className="text-pnp-textPrimary font-semibold">
          {formatPrice(priceUsd)}/mes
        </span>
      </p>

      {hasContent && (
        <div className="flex items-center justify-center gap-4 text-xs text-pnp-textSecondary">
          {videoCount > 0 && (
            <span className="flex items-center gap-1">
              <span aria-hidden="true">🎬</span>
              {videoCount} video{videoCount !== 1 ? "s" : ""}
            </span>
          )}
          {photoCount > 0 && (
            <span className="flex items-center gap-1">
              <span aria-hidden="true">📸</span>
              {photoCount} foto{photoCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
          <AlertTriangle size={13} aria-hidden="true" className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tokenBalance !== null && tokenBalance > 0 && (
        <button
          onClick={handleTokens}
          disabled={loading !== null}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #D4007A, #a0005e)" }}
        >
          {loading === "tokens" ? (
            "Procesando…"
          ) : (
            <>
              <span>🎫</span>
              <span>Pagar con Tokens · {(Math.round(priceUsd * 100)).toLocaleString()} T</span>
              <span className="text-[10px] opacity-70 ml-1">({tokenBalance.toLocaleString()} T disponibles)</span>
            </>
          )}
        </button>
      )}

      <button
        onClick={handleCrypto}
        disabled={loading !== null}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
        style={{ background: "var(--pnp-accent)" }}
      >
        {loading === "crypto" ? "Procesando…" : `Pagar con Crypto · ${formatPrice(priceUsd)}/mes`}
      </button>

      <p className="text-[10px] text-pnp-textSecondary text-center">
        Cancela cuando quieras. El contenido se desbloquea inmediatamente.
      </p>

      <div className="border-t border-white/8 pt-2 space-y-1">
        <p className="text-[10px] text-pnp-textSecondary text-center leading-relaxed">
          <span className="font-medium text-amber-400/80">Compra final.</span>{" "}
          Todas las compras son definitivas y no reembolsables, salvo lo requerido por la ley local aplicable.
        </p>
        <p className="text-[10px] text-pnp-textSecondary text-center leading-relaxed">
          Facturado por <span className="font-medium text-pnp-textPrimary">EasyBots</span> · Aparece como{" "}
          <span className="font-medium text-pnp-textPrimary">EasyBots</span> o{" "}
          <span className="font-medium text-pnp-textPrimary">NowPayments</span> en tu estado de cuenta.
        </p>
      </div>
    </div>
  );
}

// ─── Media section heading — matches design spec (10px, 700, #A1A1A3, .08em) ──

function MediaSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="font-bold uppercase"
      style={{ fontSize: 10, letterSpacing: "0.08em", color: "#A1A1A3", margin: "0 0 8px" }}
    >
      {children}
    </h3>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CreatorProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [data, setData] = useState<CreatorPublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showSubscribePanel, setShowSubscribePanel] = useState(false);
  const [showVideoConfirm, setShowVideoConfirm] = useState(false);
  const [unsubscribeLoading, setUnsubscribeLoading] = useState(false);

  // Membership info banner — dropdown under the "Suscrito" pill (mockup: 💎 tier +
  // Active badge, Plan/Renews/Perks rows, ghost Manage/Cancel)
  const [showMembershipBanner, setShowMembershipBanner] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<CreatorSubscriptionStatus | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);

  const [lightboxItem, setLightboxItem] = useState<PublicCreatorMediaItem | null>(null);
  const [channelsExpanded, setChannelsExpanded] = useState(false);
  const [showBookCall, setShowBookCall] = useState(false);
  const [bookCallDuration, setBookCallDuration] = useState<30 | 60 | undefined>(undefined);

  // Tip state
  const [showTipPanel, setShowTipPanel] = useState(false);
  const [tipAmount, setTipAmount] = useState<number>(10);
  const [tipMessage, setTipMessage] = useState("");
  const [tipPending, setTipPending] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [tipSuccess, setTipSuccess] = useState(false);
  const [tipOrderId, setTipOrderId] = useState<string | null>(null);
  const [tipInvoiceUrl, setTipInvoiceUrl] = useState<string | null>(null);
  const tipPopupRef = React.useRef<Window | null>(null);
  const tipPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Share / QR state
  const [copied, setCopied] = useState(false);

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // ⋮ overflow menu (report / block)
  const [menuOpen, setMenuOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory | "">("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Ver calendario popover
  const [showCalendarPopover, setShowCalendarPopover] = useState(false);

  // Publicaciones / Exclusivo tabs
  const [profileTab, setProfileTab] = useState<"pubs" | "excl">("pubs");

  // Watermark label for lightbox — shown on all unlocked media the viewer opens
  const watermarkLabel = user
    ? `${user.username ? '@' + user.username : user.firstName ?? 'member'} · pnptv.app`
    : undefined;

  // Rotating watermark position index for the lightbox (cycles every 30s)
  const [wmIdx, setWmIdx] = useState(0);
  useEffect(() => {
    if (!lightboxItem) return;
    const interval = setInterval(() => {
      setWmIdx((i) => (i + 1) % WM_POSITIONS.length);
    }, 30000);
    return () => clearInterval(interval);
  }, [lightboxItem]);

  const subscribePanelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!username) return;
    setIsLoading(true);
    setLoadError(null);
    setIsNotFound(false);
    try {
      const result = await getPublicCreatorProfile(username);
      setData(result);
      setIsSubscribed(result.isSubscribed);
      setIsFollowing(result.isFollowing);
      setFollowerCount(result.creator.followerCount);
      setFollowingCount(result.creator.followingCount);
      isUserBlocked(result.creator.id).then((r) => { if (r.success) setIsBlocked(r.isBlocked); }).catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setIsNotFound(true);
      } else {
        setLoadError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar este perfil de creador."
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!data) return;
    const action = searchParams.get("action");
    if (action === "book" && data.callPackages.some((p) => p.is_active)) {
      setShowBookCall(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    } else if (action === "subscribe") {
      // Deep-link from the "Subscribe" CTA on video posts in the feed.
      // Kick off the same confirmation → checkout flow the on-page CTA does.
      handleSubscribeCta();
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchParams, setSearchParams]);

  function handleSubscribeCta() {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    // Show content-count + legal confirmation modal before opening payment panel
    setShowVideoConfirm(true);
  }

  function confirmSubscribe() {
    setShowVideoConfirm(false);
    setShowSubscribePanel(true);
    setTimeout(() => {
      subscribePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function handleSubscribeSuccess() {
    setIsSubscribed(true);
    setShowSubscribePanel(false);
    load();
  }

  async function handleUnsubscribe() {
    if (!data) return;
    setUnsubscribeLoading(true);
    try {
      await unsubscribeFromCreator(data.creator.id);
      setIsSubscribed(false);
      load();
    } catch {
      // silent — subscription status unchanged
    } finally {
      setUnsubscribeLoading(false);
    }
  }

  function handleToggleMembershipBanner() {
    if (!data) return;
    const next = !showMembershipBanner;
    setShowMembershipBanner(next);
    if (next && !membershipStatus) {
      setMembershipLoading(true);
      getCreatorSubscriptionStatus(data.creator.id)
        .then((res) => { if (res.success) setMembershipStatus(res); })
        .catch(() => {})
        .finally(() => setMembershipLoading(false));
    }
  }

  async function handleToggleFollow() {
    if (!data) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    setFollowLoading(true);
    const wasFollowing = isFollowing;
    // Optimistic update
    setIsFollowing(!wasFollowing);
    setFollowerCount((c) => Math.max(0, c + (wasFollowing ? -1 : 1)));
    try {
      const res = wasFollowing
        ? await unfollowUser(data.creator.id)
        : await followUser(data.creator.id);
      if (res.success) {
        setIsFollowing(res.isFollowing);
        setFollowerCount(res.followerCount);
      }
    } catch {
      // Rollback
      setIsFollowing(wasFollowing);
      setFollowerCount((c) => Math.max(0, c + (wasFollowing ? 1 : -1)));
    } finally {
      setFollowLoading(false);
    }
  }

  function handleMessageClick() {
    if (!data) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    const isCreatorDmLocked =
      user?.tier !== "prime" && user?.creator_status !== "active";
    navigate(isCreatorDmLocked ? "/subscribe" : `/dm/${data.creator.id}`);
  }

  async function handleToggleBlock() {
    if (!data) return;
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await unblockUser(data.creator.id);
        setIsBlocked(false);
      } else {
        await blockUser(data.creator.id);
        setIsBlocked(true);
      }
      setShowBlockConfirm(false);
      setMenuOpen(false);
    } catch {
      // silent — block status unchanged
    } finally {
      setBlockLoading(false);
    }
  }

  async function handleSubmitReport() {
    if (!data || !reportCategory || reportSending) return;
    setReportSending(true);
    setReportError(null);
    try {
      const res = await createUserReport({
        reportedUserId: data.creator.id,
        category: reportCategory,
        description: reportDescription.trim() || undefined,
        evidenceType: "profile",
        evidenceId: data.creator.id,
      });
      if (res.success) {
        setReportSent(true);
      } else {
        setReportError(res.error || "No se pudo enviar el reporte.");
      }
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "No se pudo enviar el reporte.");
    } finally {
      setReportSending(false);
    }
  }

  async function handleCopyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  async function handleNativeShare(url: string, creatorName: string) {
    try {
      await navigator.share({
        title: `${creatorName} en PNPtv!`,
        text: `Mira el perfil de ${creatorName} en PNPtv!`,
        url,
      });
    } catch {
      // user cancelled or API unavailable
    }
  }

  const handleSendTip = async () => {
    if (tipAmount < 1 || tipAmount > 500) {
      setTipError("El monto debe estar entre $1 y $500.");
      return;
    }
    setTipPending(true);
    setTipError(null);
    try {
      const creatorRef = creator.username || creator.id;
      const payload: CreatorTipPayload = {
        amount: tipAmount,
        message: tipMessage.trim() || undefined,
      };
      const result = await createCreatorTip(creatorRef, payload);
      setTipOrderId(result.orderId);
      setTipInvoiceUrl(result.invoiceUrl);

      // Open NowPayments popup (centered)
      const w = window.innerWidth, h = window.innerHeight;
      const pw = Math.min(520, w - 40), ph = Math.min(700, h - 40);
      const left = Math.round((w - pw) / 2);
      const top = Math.round((h - ph) / 2);
      tipPopupRef.current = window.open(
        result.invoiceUrl,
        "pnptv_tip",
        `width=${pw},height=${ph},left=${left},top=${top},resizable=yes,scrollbars=yes,noopener,noreferrer`
      );

      // Poll for completion
      tipPollRef.current = setInterval(async () => {
        try {
          const status = await getCreatorTipStatus(creatorRef, result.orderId);
          if (status.status === "completed") {
            clearInterval(tipPollRef.current!);
            tipPopupRef.current?.close();
            setTipSuccess(true);
            setShowTipPanel(false);
          } else if (status.status === "failed" || status.status === "expired") {
            clearInterval(tipPollRef.current!);
            setTipError("El pago falló o venció. Por favor intenta de nuevo.");
            setTipPending(false);
          }
        } catch {
          // non-fatal polling error
        }
      }, 5000);
    } catch (err) {
      setTipError(err instanceof Error ? err.message : "No se pudo crear el pago. Por favor intenta de nuevo.");
      setTipPending(false);
    }
  };

  // Cleanup tip poll on unmount
  useEffect(() => {
    return () => {
      if (tipPollRef.current) clearInterval(tipPollRef.current);
    };
  }, []);

  // ── Loading ──
  if (isLoading) return <PageSkeleton />;

  // ── Not found ──
  if (isNotFound) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6"
        style={{ background: "var(--pnp-background)" }}
      >
        <Helmet>
          <title>Creador no encontrado · PNPtv!</title>
        </Helmet>
        <AlertTriangle size={40} className="text-pnp-textSecondary" aria-hidden="true" />
        <h1 className="text-lg font-bold text-pnp-textPrimary">Creador no encontrado</h1>
        <p className="text-sm text-pnp-textSecondary text-center">
          Este perfil no existe o fue eliminado.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-80 min-h-[44px]"
          style={{ background: "var(--pnp-accent)" }}
        >
          Ir al inicio
        </button>
      </div>
    );
  }

  // ── Network error ──
  if (loadError || !data) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6"
        style={{ background: "var(--pnp-background)" }}
      >
        <Helmet>
          <title>Error · PNPtv!</title>
        </Helmet>
        <AlertTriangle size={40} className="text-pnp-textSecondary" aria-hidden="true" />
        <h1 className="text-lg font-bold text-pnp-textPrimary">Algo salió mal</h1>
        <p className="text-sm text-pnp-textSecondary text-center">
          {loadError ?? "No se pudo cargar este perfil de creador."}
        </p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-80 min-h-[44px]"
          style={{ background: "var(--pnp-accent)" }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Intentar de nuevo
        </button>
      </div>
    );
  }

  const { creator, channels, media, featuredVideos, hangouts, callPackages, recentPosts, exclusivePosts, socialLinks, nextAvailability } = data;
  const activePackages = callPackages.filter((p) => p.is_active);
  // Santino runs a bespoke booking + hangout flow off-platform, so his profile
  // hides the standard "Santino's Subscribers" hangout CTA, the next-availability
  // card, and the private-call packages section.
  const isSantinoProfile = String(creator.id) === "8599671840";
  const hasCallPackages = activePackages.length > 0 && !isSantinoProfile;
  const cheapestPackage = hasCallPackages
    ? activePackages.reduce((a, b) => (a.price_usd < b.price_usd ? a : b))
    : null;

  const ALLOWED_SOCIAL = new Set(["x", "twitter", "telegram"]);
  const filteredSocialLinks = socialLinks
    ? Object.fromEntries(
        Object.entries(socialLinks).filter(
          ([k, v]) =>
            ALLOWED_SOCIAL.has(k) &&
            typeof v === "string" &&
            v.startsWith("https://")
        )
      )
    : {};
  const hasSocialLinks = Object.keys(filteredSocialLinks).length > 0;
  const hasRecentPosts = recentPosts && recentPosts.length > 0;
  const hasExclusivePosts = exclusivePosts && exclusivePosts.length > 0;
  const hasChannels = Array.isArray(channels) && channels.length > 0;
  const hangout = Array.isArray(hangouts) && hangouts.length > 0 ? hangouts[0] : null;
  const hasHangout = !!hangout;

  // Contenido sub-sections
  // Support both snake_case (API) and camelCase (possible transform) field names
  const publicPhotos = (Array.isArray(media) ? media : []).filter((m) => {
    const mt = (m as unknown as { mediaType?: string }).mediaType ?? m.media_type;
    const isPrem = (m as unknown as { isPremium?: boolean }).isPremium ?? m.is_premium;
    return (mt === "photo" || mt === "image") && !isPrem;
  }).slice(0, 10);

  const featuredVideoList: PublicCreatorFeaturedVideo[] = Array.isArray(featuredVideos)
    ? featuredVideos.slice(0, 5)
    : [];

  const hasPhotos = publicPhotos.length > 0;
  const hasFeaturedVideos = featuredVideoList.length > 0;
  const hasContenido = hasPhotos || hasFeaturedVideos || hasChannels || hasHangout;

  const profileUrl = `https://pnptv.app/creator/${creator.username}`;
  const isOwnProfile = !!user && (
    String(user.dbId || user.id) === String(creator.id)
  );

  // Map creator_type to BookCallModal's expected CreatorType
  const mappedCreatorType = (
    creator.creator_type === "creator" ? "full_time" : creator.creator_type
  ) as import("@/components/creators/CreatorCard").CreatorType;

  const bookCallCreator = {
    id: creator.id,
    username: creator.username,
    photo_url: creator.photo_url,
    creator_type: mappedCreatorType,
    creator_price_usd: creator.creator_price_usd,
    bio: creator.bio,
  };

  return (
    <>
      <Helmet>
        <title>
          {creator.first_name} (@{creator.username}) · PNPtv!
        </title>
        <meta
          name="description"
          content={
            creator.bio
              ? creator.bio.slice(0, 155)
              : `Mira el perfil de ${creator.first_name} en PNPtv!`
          }
        />
        <meta property="og:title" content={`${creator.first_name} · PNPtv!`} />
        <meta property="og:description" content={creator.bio?.slice(0, 155) ?? `Contenido exclusivo de ${creator.first_name} en PNPtv!`} />
        {creator.photo_url && <meta property="og:image" content={creator.photo_url} />}
        <meta property="og:url" content={profileUrl} />
      </Helmet>

      <div className="min-h-dvh" style={{ background: "var(--pnp-background)" }}>
        {/* ── Cover band ── */}
        <div className="relative" style={{ height: 140, background: "#1e1e1e", overflow: "hidden" }}>
          {creator.cover_url && (creator.cover_url.startsWith("/") || creator.cover_url.startsWith("http")) ? (
            <>
              <img
                src={creator.cover_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                aria-hidden="true"
              />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0.35) 100%)" }} />
            </>
          ) : creator.photo_url && (creator.photo_url.startsWith("/") || creator.photo_url.startsWith("http")) ? (
            <>
              <img
                src={creator.photo_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "blur(28px) saturate(1.2)", transform: "scale(1.15)" }}
                aria-hidden="true"
              />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0.55) 100%)" }} />
            </>
          ) : (
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,rgba(212,0,122,0.35),rgba(230,145,56,0.25))" }} />
          )}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="absolute top-3 left-3 flex items-center justify-center rounded-full text-white transition-colors"
            style={{ width: 34, height: 34, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.12)" }}
            aria-label="Volver"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          {/* Kebab menu — cover overlay (moved from wide action row to match mockup) */}
          {!isOwnProfile && (
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Más opciones"
                aria-expanded={menuOpen}
                className="flex items-center justify-center rounded-full text-white"
                style={{ width: 34, height: 34, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <MoreVertical size={16} aria-hidden="true" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-xl overflow-hidden border border-white/10 shadow-xl"
                    style={{ background: "#1e1e1e" }}
                  >
                    <button
                      role="menuitem"
                      onClick={handleMessageClick}
                      className="w-full flex items-center gap-2 px-3.5 py-3 text-sm text-white/85 hover:bg-white/5 transition-colors"
                    >
                      <MessageCircle size={14} aria-hidden="true" /> Mensaje
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); setShowReportModal(true); }}
                      className="w-full flex items-center gap-2 px-3.5 py-3 text-sm text-white/85 hover:bg-white/5 transition-colors"
                    >
                      <Flag size={14} aria-hidden="true" /> Reportar
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); setShowBlockConfirm(true); }}
                      className="w-full flex items-center gap-2 px-3.5 py-3 text-sm text-red-400 hover:bg-white/5 transition-colors"
                    >
                      <Ban size={14} aria-hidden="true" /> {isBlocked ? "Desbloquear" : "Bloquear"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="max-w-lg mx-auto px-4 pt-0 pb-5 space-y-5">

          {/* ── 1. HEADER — avatar overlaps cover on the left, right col has Hang CTA ── */}
          <section
            className="relative -mt-[34px] mb-0"
            aria-label="Perfil del creador"
          >
            <div className="flex items-end justify-between gap-3">
              {/* Avatar — 78px, magenta ring, overlaps cover */}
              <div
                className="relative rounded-full flex-none"
                style={{
                  width: 78,
                  height: 78,
                  border: "3px solid #D4007A",
                  boxShadow: "0 0 0 3px #121212",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "#1e1e1e",
                }}
              >
                <UserAvatar
                  userId={creator.id}
                  photoUrl={creator.photo_url}
                  displayName={creator.first_name}
                  size="xl"
                  linkToProfile={false}
                  showOnline={false}
                />
              </div>

              {/* Right col — Hang with X + lock caption (only for other profiles, when a hangout exists) */}
              {!isOwnProfile && hangouts && hangouts.length > 0 && (
                <div className="flex flex-col items-end gap-1 mb-1">
                  <button
                    onClick={() =>
                      isSubscribed || isOwnProfile ? navigate(`/hangouts/${hangouts[0].id}`) : handleSubscribeCta()
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-xs font-semibold transition-colors"
                    style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                  >
                    Hang with {creator.first_name}
                  </button>
                  {!isSubscribed && (
                    <span className="flex items-center gap-1" style={{ fontSize: 9, color: "#A1A1A3" }}>
                      <Lock size={9} aria-hidden="true" /> Paid members only
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Identity — name + verify badge, then @handle · city on one line */}
            <div className="mt-3 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-pnp-textPrimary leading-tight"
                  style={{ fontSize: 20, fontWeight: 400, fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace", letterSpacing: "0.02em", margin: 0 }}
                >
                  {creator.first_name}
                </h1>
                {creator.creator_verified && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#5ED1C4" aria-label="Creador verificado">
                    <path d="M12 2l8 3.5v5.1c0 5-3.4 9.7-8 11.4-4.6-1.7-8-6.4-8-11.4V5.5L12 2z" />
                  </svg>
                )}
                <CreatorBadgeRow
                  isPrime={creator.isPrime}
                  creatorRole={creator.creator_role}
                  priceUsd={creator.creator_price_usd}
                />
              </div>
              <p className="text-pnp-textSecondary mt-1" style={{ fontSize: 12 }}>
                @{creator.username}
              </p>
            </div>

            {/* ── Stats row — flat 3-col (Posts / Fans / Exclusive) — mockup ─── */}
            <div className="flex gap-8 pt-4 pb-1" role="group" aria-label="Estadísticas del creador">
              {[
                { label: "Posts", value: creator.postCount },
                { label: "Fans", value: followerCount },
                { label: "Exclusive", value: creator.exclusiveCount },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-bold text-white leading-none" style={{ fontSize: 16 }}>{stat.value.toLocaleString()}</p>
                  <p className="mt-1" style={{ fontSize: 11, color: "#A1A1A3" }}>{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Bio */}
            {creator.bio && (
              <p className="text-sm text-pnp-textSecondary leading-relaxed line-clamp-3 mt-3">
                {creator.bio}
              </p>
            )}

          </section>

          {/* ── 2. HERO CTA STACK — mockup: Subscribe / Book 30 / Book 60 / Channels ── */}
          <div ref={subscribePanelRef} className="space-y-2">
            {/* State-specific status pill above the actions */}
            {creator.creator_subscription_paused && (
              <div
                className="flex items-center justify-center gap-2 py-3 rounded-[10px] border border-white/10 text-sm font-medium text-pnp-textSecondary min-h-[52px]"
                style={{ background: "var(--pnp-surface)" }}
              >
                Suscripciones pausadas
              </div>
            )}
            {!creator.creator_subscription_paused && isSubscribed && (
              <>
                {/* Two-per-row: Suscrito status (left, tap toggles membership banner)
                    + Entrar al hangout (right). No hangout → Suscrito spans full width. */}
                <div className={`grid gap-2 ${hasHangout && hangout ? "grid-cols-2" : "grid-cols-1"}`}>
                  <button
                    type="button"
                    onClick={handleToggleMembershipBanner}
                    aria-expanded={showMembershipBanner}
                    className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-[10px] text-sm font-semibold text-green-400 bg-green-500/15 border border-green-500/25 min-h-[48px] transition-colors"
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Suscrito
                    <ChevronDown
                      size={13}
                      className={`transition-transform duration-200 ${showMembershipBanner ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  {hasHangout && hangout && (
                    <button
                      onClick={() => navigate(`/hangouts/${hangout.id}`)}
                      className="flex items-center justify-center gap-2 py-3 rounded-[10px] text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] min-h-[48px]"
                      style={{ color: "#5ED1C4", border: "1px solid rgba(94,209,196,.5)", background: "rgba(94,209,196,.12)" }}
                    >
                      Entrar al hangout →
                    </button>
                  )}
                </div>

                {/* Membership info banner — mockup: 💎 tier + Active badge, Plan/Renews/Perks, ghost Manage/Cancel */}
                {showMembershipBanner && (
                  <div
                    className="rounded-[12px] p-3.5 space-y-2.5"
                    style={{ background: "rgba(212,0,122,0.08)", border: "1px solid #D4007A" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-pnp-textPrimary">
                        {creatorTierLabel(creator.creator_type)} membership
                      </span>
                      <span
                        className="rounded-full font-bold text-green-400 bg-green-500/15 border border-green-500/25"
                        style={{ padding: "3px 9px", fontSize: 10 }}
                      >
                        Active
                      </span>
                    </div>
                    {membershipLoading ? (
                      <p className="text-xs text-pnp-textSecondary">Cargando…</p>
                    ) : (
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-pnp-textSecondary">Plan</span>
                          <span className="text-pnp-textPrimary">
                            {formatPrice(membershipStatus?.subscription?.price_usd ?? creator.creator_price_usd)}/mo · {creatorTierLabel(creator.creator_type)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-pnp-textSecondary">Renews</span>
                          <span className="text-pnp-textPrimary">
                            {membershipStatus?.subscription?.expires_at
                              ? new Date(membershipStatus.subscription.expires_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-pnp-textSecondary">Perks</span>
                          <span className="text-pnp-textPrimary">DMs · Content{hasHangout ? " · Afterhours" : ""}{hasCallPackages ? " · Calls" : ""}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => navigate("/creator-subscriptions")}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors border border-white/10"
                      >
                        Manage
                      </button>
                      <button
                        onClick={handleUnsubscribe}
                        disabled={unsubscribeLoading}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors border border-white/10 disabled:opacity-50"
                      >
                        {unsubscribeLoading ? "Cancelando…" : "Cancel"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Subscribe — primary CTA, brand gradient, mockup pattern:
                "Subscribe · $X · [tier emoji]" */}
            {!creator.creator_subscription_paused && !isSubscribed && creator.creator_price_usd > 0 && (
              <button
                onClick={handleSubscribeCta}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[10px] text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] min-h-[52px]"
                style={{ background: "linear-gradient(135deg,#D4007A,#E69138)", color: "#fff", fontSize: 14 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Subscribe · ${creator.creator_price_usd.toFixed(0)}
                {(creator.creator_type === "diamond" || creator.creator_type === "full_time") && " 💎"}
                {creator.creator_type === "ice" && " 🧊"}
                {creator.creator_type === "crystal" && " ✨"}
              </button>
            )}

            {/* Book 30 min / 60 min — two half-width secondary buttons
                (falls back to top-2 packages if creator doesn't offer exactly 30/60).
                Subscribed-only: non-subscribers see a single Subscribe CTA. */}
            {isSubscribed && hasCallPackages && (() => {
              const pkg30 = activePackages.find((p) => p.duration_minutes === 30);
              const pkg60 = activePackages.find((p) => p.duration_minutes === 60);
              // If exact matches missing, show the 2 cheapest packages instead
              const fallback = [...activePackages].sort((a, b) => a.duration_minutes - b.duration_minutes).slice(0, 2);
              const pair: PublicCallPackage[] = pkg30 && pkg60 ? [pkg30, pkg60] : fallback;
              if (pair.length === 0) return null;
              return (
                <div className="flex gap-2">
                  {pair.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => { setBookCallDuration(pkg.duration_minutes as 30 | 60); setShowBookCall(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-[10px] text-xs font-bold transition-all hover:opacity-90 active:scale-[0.98] min-h-[44px]"
                      style={{ border: "1px solid rgba(255,255,255,0.15)", background: "#161616", color: "#fff" }}
                    >
                      <PhoneCall size={13} aria-hidden="true" />
                      Buy {pkg.duration_minutes} min call
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Channels — ghost, full-width, scrolls to Canales section.
                Subscribed-only: non-subscribers see a single Subscribe CTA. */}
            {isSubscribed && hasChannels && (
              <button
                onClick={() => {
                  const el = document.getElementById("creator-channels");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] text-sm font-semibold transition-colors min-h-[44px]"
                style={{ border: "1px solid rgba(255,255,255,0.10)", background: "transparent", color: "rgba(255,255,255,0.75)" }}
              >
                Channels
              </button>
            )}

            {/* Compact Follow chip (only if not own profile) — mockup omits
                it, but we surface as a small pill below to keep the follow
                relationship discoverable. */}
            {!isOwnProfile && (
              <button
                onClick={handleToggleFollow}
                disabled={followLoading}
                className="mx-auto flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)" }}
              >
                {isFollowing ? <UserCheck size={12} aria-hidden="true" /> : <UserPlus size={12} aria-hidden="true" />}
                {isFollowing ? "Siguiendo" : "Seguir"}
              </button>
            )}

            {/* Ver calendario popover — reuses the already-fetched nextAvailability slot */}
            {showCalendarPopover && nextAvailability && (
              <div
                className="rounded-2xl p-4 border border-white/10 space-y-1"
                style={{ background: "var(--pnp-surface)" }}
                role="dialog"
                aria-label="Próxima disponibilidad"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-pnp-textPrimary">Próxima disponibilidad</p>
                  <button onClick={() => setShowCalendarPopover(false)} aria-label="Cerrar" className="text-pnp-textSecondary hover:text-white">
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <p className="text-sm text-pnp-textSecondary">
                  {availabilityDayLabel(nextAvailability)} · {formatTimeRange(nextAvailability.start_time, nextAvailability.end_time)}
                </p>
                <p className="text-xs text-pnp-textSecondary flex items-center gap-1">
                  <Clock size={11} aria-hidden="true" /> Zona horaria: {nextAvailability.timezone}
                </p>
              </div>
            )}

            {/* Subscribe panel renders inline below buttons */}
            {showSubscribePanel && !isSubscribed && (
              <SubscribePanel
                creatorId={creator.id}
                priceUsd={creator.creator_price_usd}
                videoCount={creator.videoCount ?? 0}
                photoCount={creator.photoCount ?? 0}
                onSuccess={handleSubscribeSuccess}
              />
            )}
          </div>

          {/* ── 3. CONTENIDO — Fotos / Videos / Canales / Hangout ───────────── */}
          <section aria-label="Contenido del creador">
            {hasContenido ? (
              <div className="space-y-5">
                {/* ── 3a. FOTOS — 96×120 horizontal scroll strip ──────────────── */}
                {hasPhotos && (
                  <div>
                    <MediaSectionHeading>FOTOS</MediaSectionHeading>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      {publicPhotos.map((photo) => {
                        const thumbSrc =
                          (photo as unknown as { thumbUrl?: string | null }).thumbUrl ??
                          photo.thumb_url ??
                          photo.url;
                        return (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => setLightboxItem(photo)}
                            aria-label={photo.caption ? `Ver foto: ${photo.caption}` : "Ver foto"}
                            className="flex-none rounded-lg overflow-hidden focus:outline-none transition-opacity hover:opacity-85 active:scale-[0.97]"
                            style={{ width: 96, height: 120 }}
                          >
                            {thumbSrc ? (
                              <img
                                src={thumbSrc}
                                alt={photo.caption ?? "Foto del creador"}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-full h-full"
                                style={{ background: "var(--pnp-surface)" }}
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ marginTop: 6, fontSize: 10, color: "#6b6b70" }}>
                      Hasta 10 fotos destacadas elegidas por el creador desde su feed.
                    </p>
                  </div>
                )}

                {/* ── 3b. VIDEOS — 140×88 horizontal scroll strip ─────────────── */}
                {hasFeaturedVideos && (
                  <div>
                    <MediaSectionHeading>VIDEOS</MediaSectionHeading>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      {featuredVideoList.map((vid) => {
                        const duration = formatDuration(vid.duration_seconds);
                        return (
                          <button
                            key={vid.id}
                            type="button"
                            onClick={() =>
                              navigate(
                                `/channels?channel=${encodeURIComponent(vid.channel_slug)}&video=${vid.id}`
                              )
                            }
                            aria-label={`Reproducir: ${vid.title}`}
                            className="group relative flex-none rounded-lg overflow-hidden focus:outline-none transition-transform active:scale-[0.98]"
                            style={{ width: 140, height: 88 }}
                          >
                            {vid.thumb_url ? (
                              <img
                                src={vid.thumb_url}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="absolute inset-0"
                                style={{ background: "var(--pnp-surface)" }}
                                aria-hidden="true"
                              />
                            )}

                            {/* Center play button */}
                            <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                              <span
                                className="flex items-center justify-center rounded-full"
                                style={{ width: 30, height: 30, background: "rgba(0,0,0,.55)" }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                              </span>
                            </div>

                            {/* Duration chip — bottom-right */}
                            {duration && (
                              <span
                                className="absolute"
                                style={{
                                  bottom: 6,
                                  right: 6,
                                  fontSize: 9,
                                  fontWeight: 600,
                                  color: "#fff",
                                  background: "rgba(0,0,0,.6)",
                                  borderRadius: 4,
                                  padding: "1px 5px",
                                }}
                                aria-hidden="true"
                              >
                                {duration}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ marginTop: 6, fontSize: 10, color: "#6b6b70" }}>
                      Hasta 5 videos destacados elegidos por el creador.
                    </p>
                  </div>
                )}

                {/* ── 3c. Canales — collapsible accordion ─────────────────────── */}
                {hasChannels && (
                  <div
                    id="creator-channels"
                    className="rounded-[12px] overflow-hidden"
                    style={{ border: "1px solid #2A2A2A", background: "#161616" }}
                  >
                    <button
                      type="button"
                      onClick={() => setChannelsExpanded((v) => !v)}
                      className="w-full flex items-center gap-2.5 p-3.5 text-left"
                      style={{ padding: 14 }}
                      aria-expanded={channelsExpanded}
                    >
                      {/* TV icon in purple — matches design spec */}
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7B61FF" strokeWidth="2" aria-hidden="true" className="flex-none">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-sm text-white">Canales</span>
                        <span className="block mt-0.5" style={{ fontSize: 10, color: "#A1A1A3" }}>
                          {channels.length} {channels.length === 1 ? "canal" : "canales"} de este creador
                        </span>
                      </span>
                      <ChevronDown
                        size={13}
                        className={`flex-none transition-transform duration-300 ${channelsExpanded ? "rotate-180" : ""}`}
                        style={{ color: "#A1A1A3" }}
                        aria-hidden="true"
                      />
                    </button>

                    {channelsExpanded && (
                      <div className="flex flex-col gap-1.5 p-1.5 pt-0">
                        {channels.map((ch) => {
                          const info = channelAccessInfo(ch);
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() => navigate(`/channels?channel=${encodeURIComponent(ch.slug)}`)}
                              className="w-full flex items-center gap-2.5 text-left hover:bg-white/5 transition-colors rounded-xl"
                              style={{ padding: "12px 14px", border: "1px solid #2A2A2A", background: "#111", borderRadius: 12 }}
                            >
                              <div
                                className="rounded-[10px] overflow-hidden flex-none"
                                style={{ width: 34, height: 34, background: "var(--pnp-background)" }}
                              >
                                {ch.cover_image_url && (
                                  <img
                                    src={ch.cover_image_url}
                                    alt=""
                                    aria-hidden="true"
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white truncate" style={{ fontSize: 12, margin: 0 }}>{ch.name}</p>
                                <p className="truncate" style={{ fontSize: 10, color: "#A1A1A3", margin: "2px 0 0" }}>{info.subtitle}</p>
                              </div>
                              <span
                                className="flex-none rounded-full font-bold"
                                style={{
                                  padding: "3px 9px",
                                  fontSize: 8,
                                  letterSpacing: "0.06em",
                                  background: `${info.badgeColor}22`,
                                  color: info.badgeColor,
                                  border: `1px solid ${info.badgeColor}80`,
                                }}
                              >
                                {info.badgeLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 3d. Hangout — teal-tinted CTA card, always shows PRIVADO.
                       Hidden on Santino's profile (his subscribers-hangout entry
                       lives elsewhere; the standalone card was noise). ── */}
                {hasHangout && hangout && !isSantinoProfile && (
                  <div
                    className="rounded-[12px] p-3.5"
                    style={{ border: "1px solid rgba(94,209,196,.35)", background: "rgba(94,209,196,.06)", padding: 14 }}
                  >
                    <div className="flex items-start gap-2.5">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5ED1C4" strokeWidth="2" aria-hidden="true" className="flex-none mt-0.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white" style={{ fontSize: 13 }}>{hangout.name}</span>
                          {/* PRIVADO badge — always visible on hangout card */}
                          <span
                            className="inline-flex items-center gap-1 rounded-full font-bold"
                            style={{
                              padding: "2px 8px",
                              fontSize: 8,
                              letterSpacing: "0.06em",
                              background: "rgba(212,0,122,.16)",
                              color: "#FF4DA6",
                              border: "none",
                            }}
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            PRIVADO
                          </span>
                        </div>
                        <span className="block mt-1 leading-relaxed" style={{ fontSize: 10, color: "#A1A1A3", lineHeight: 1.5 }}>
                          Exclusivo para miembros de pago activos — del canal de pago del creador o de su perfil.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        isSubscribed || isOwnProfile ? navigate(`/hangouts/${hangout.id}`) : handleSubscribeCta()
                      }
                      className="w-full rounded-[10px] font-bold transition-colors mt-3"
                      style={{ padding: 11, fontSize: 12, color: "#5ED1C4", border: "1px solid rgba(94,209,196,.5)", background: "rgba(94,209,196,.12)" }}
                    >
                      Entrar al hangout →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Section-level empty state — only when ALL categories are empty */
              !isOwnProfile && (
                <div
                  className="rounded-2xl p-6 text-center text-sm text-pnp-textSecondary border border-white/8"
                  style={{ background: "var(--pnp-surface)" }}
                >
                  Este creador aún no ha publicado contenido.
                </div>
              )
            )}
          </section>

          {/* ── 4. SOCIAL LINKS ROW ─────────────────────────────────────────── */}
          {hasSocialLinks && (
            <div
              className="flex gap-2 overflow-x-auto no-scrollbar py-1"
              role="list"
              aria-label="Redes sociales"
            >
              {Object.entries(filteredSocialLinks).map(([platform, url]) => (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="listitem"
                  aria-label={`${PLATFORM_LABELS[platform] ?? platform} del creador`}
                  className="flex-none flex items-center gap-2 bg-gray-800 rounded-full px-3 py-1.5 text-sm text-white hover:bg-gray-700 transition-colors active:scale-[0.97] min-h-[36px]"
                >
                  <SocialIcon platform={platform} size={16} />
                  <span className="whitespace-nowrap">
                    {PLATFORM_LABELS[platform] ?? platform}
                  </span>
                </a>
              ))}
            </div>
          )}

          {/* ── 5. NEXT AVAILABILITY CARD ───────────────────────────────────── */}
          {nextAvailability && hasCallPackages && (
            <div
              className="flex items-start gap-3 rounded-2xl p-4 border border-gray-700"
              style={{ background: "var(--pnp-surface)" }}
              aria-label="Próxima disponibilidad"
            >
              <Calendar size={18} className="text-pnp-textSecondary mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-pnp-textPrimary">
                  Disponible para llamadas
                </p>
                <p className="text-sm text-pnp-textSecondary mt-0.5">
                  {availabilityDayLabel(nextAvailability)} ·{" "}
                  {formatTimeRange(nextAvailability.start_time, nextAvailability.end_time)}
                </p>
                <p className="text-xs text-pnp-textSecondary mt-0.5 flex items-center gap-1">
                  <Clock size={11} aria-hidden="true" />
                  Zona horaria: {nextAvailability.timezone}
                </p>
              </div>
            </div>
          )}

          {/* ── 6. CALL PACKAGES ────────────────────────────────────────────── */}
          {hasCallPackages && (
            <section aria-label="Paquetes de llamadas privadas">
              <SectionHeading>Llamadas Privadas</SectionHeading>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {activePackages.map((pkg) => {
                  const pkgDuration = (pkg.duration_minutes === 30 || pkg.duration_minutes === 60)
                    ? pkg.duration_minutes as 30 | 60
                    : undefined;
                  return (
                    <div
                      key={pkg.id}
                      className="flex-none flex flex-col gap-2 rounded-2xl p-4 min-w-[140px]"
                      style={{ background: "var(--pnp-surface)" }}
                    >
                      <p className="text-sm font-semibold text-pnp-textPrimary">
                        {pkg.label || `${pkg.duration_minutes} min`}
                      </p>
                      <p className="text-lg font-bold text-pnp-textPrimary">
                        {formatPrice(pkg.price_usd)}
                      </p>
                      <button
                        onClick={() => {
                          setBookCallDuration(pkgDuration);
                          setShowBookCall(true);
                        }}
                        className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] min-h-[36px]"
                        style={{ background: "var(--pnp-accent)" }}
                      >
                        Reservar
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── TIP SECTION ──────────────────────────────────────────────────── */}
          {tipSuccess && (
            <div
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.3)" }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#34C759" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: "#34C759" }}>
                ¡Regalo enviado! Gracias por apoyar a {creator.first_name || creator.username}.
              </span>
            </div>
          )}

          {!tipSuccess && (
            <section>
              {!showTipPanel ? (
                <button
                  onClick={() => setShowTipPanel(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "var(--pnp-surface)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--pnp-text-primary)" }}
                >
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Enviar Regalo
                </button>
              ) : (
                <div
                  className="rounded-2xl p-4 space-y-3"
                  style={{ background: "var(--pnp-surface)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-pnp-textPrimary">Enviar Regalo</p>
                    <button
                      onClick={() => { setShowTipPanel(false); setTipError(null); }}
                      className="text-pnp-textSecondary hover:text-white transition-colors"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                      aria-label="Close tip panel"
                    >
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Tip disclosure */}
                  <div
                    className="rounded-xl px-3 py-2 text-xs leading-relaxed"
                    style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)", color: "#34C759" }}
                  >
                    💚 <strong>El 100% de tu regalo va directamente a {creator.first_name || creator.username}</strong> — sin comisión de plataforma. Los regalos están completamente exentos de comisión.
                  </div>

                  {/* Quick amount buttons */}
                  <div>
                    <p className="text-xs mb-2" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Elige el monto (USD):</p>
                    <div className="flex gap-2 flex-wrap">
                      {[5, 10, 20, 50, 100].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setTipAmount(amt)}
                          className="px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
                          style={{
                            background: tipAmount === amt ? "var(--pnp-accent)" : "var(--pnp-surface-hover, #2C2C2E)",
                            color: tipAmount === amt ? "#fff" : "var(--pnp-text-secondary, #8E8E93)",
                            border: "1px solid transparent",
                          }}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm" style={{ color: "var(--pnp-text-secondary)" }}>$</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={tipAmount}
                        onChange={(e) => setTipAmount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                        className="w-24 rounded-xl px-3 py-2 text-sm"
                        style={{
                          background: "var(--pnp-surface-hover, #2C2C2E)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "#EBEBF5",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  {/* Optional message */}
                  <textarea
                    value={tipMessage}
                    onChange={(e) => setTipMessage(e.target.value.slice(0, 500))}
                    placeholder={`Deja un mensaje para ${creator.first_name || creator.username} (opcional)`}
                    rows={2}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{
                      background: "var(--pnp-surface-hover, #2C2C2E)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#EBEBF5",
                      outline: "none",
                    }}
                  />

                  {tipError && (
                    <p className="text-xs" style={{ color: "#FF6B6B" }}>{tipError}</p>
                  )}

                  <button
                    onClick={handleSendTip}
                    disabled={tipPending || tipAmount < 1}
                    className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-opacity disabled:opacity-40 btn-gradient"
                  >
                    {tipPending ? "Abriendo pago…" : `Enviar $${tipAmount} de Regalo en Crypto`}
                  </button>

                  <p className="text-xs text-center" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    Procesado por NowPayments. Paga con Bitcoin, Dash, USDT y más.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── 7. PUBLICACIONES / EXCLUSIVO TABS ───────────────────────────── */}
          {(hasRecentPosts || hasExclusivePosts) && (
            <section aria-label="Publicaciones del creador">
              <div className="flex border-b" style={{ borderColor: "#2A2A2A" }}>
                <button
                  onClick={() => setProfileTab("pubs")}
                  className="flex-1 py-3 text-sm font-semibold transition-colors"
                  style={
                    profileTab === "pubs"
                      ? { color: "#fff", borderBottom: "2px solid #D4007A" }
                      : { color: "var(--pnp-text-secondary, #8E8E93)", borderBottom: "2px solid transparent" }
                  }
                >
                  Publicaciones
                </button>
                <button
                  onClick={() => setProfileTab("excl")}
                  className="flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                  style={
                    profileTab === "excl"
                      ? { color: "#fff", borderBottom: "2px solid #D4007A" }
                      : { color: "var(--pnp-text-secondary, #8E8E93)", borderBottom: "2px solid transparent" }
                  }
                >
                  <Lock size={12} aria-hidden="true" /> Exclusivo
                </button>
              </div>

              {profileTab === "pubs" ? (
                hasRecentPosts ? (
                  <div className="space-y-3 mt-4">
                    {recentPosts.slice(0, 3).map((post) => (
                      <RecentPostCard key={post.id} post={post} creator={creator} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-pnp-textSecondary text-center py-6">
                    Este creador aún no tiene publicaciones.
                  </p>
                )
              ) : hasExclusivePosts ? (
                <div className="space-y-3 mt-4">
                  {exclusivePosts.map((post) => (
                    <ExclusiveTeaserCard
                      key={post.id}
                      post={post}
                      creator={creator}
                      isSubscribed={isSubscribed}
                      onUnlock={handleSubscribeCta}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-pnp-textSecondary text-center py-6">
                  Este creador aún no tiene contenido exclusivo.
                </p>
              )}
            </section>
          )}

          {/* ── 8. SHARE & QR SECTION ───────────────────────────────────────── */}
          <section
            className="rounded-2xl p-5 flex flex-col items-center gap-4 border border-white/8"
            style={{ background: "var(--pnp-surface)" }}
            aria-label="Compartir perfil"
          >
            <p className="text-sm font-semibold text-pnp-textSecondary uppercase tracking-wider">
              {isOwnProfile ? "Comparte tu perfil" : "Comparte este perfil"}
            </p>

            {/* QR code */}
            <div className="bg-white rounded-2xl p-3 shadow-lg">
              <QRCodeSVG
                value={profileUrl}
                size={160}
                bgColor="transparent"
                fgColor="#111111"
                level="M"
              />
            </div>

            <p className="text-xs text-pnp-textSecondary font-mono select-all">
              {profileUrl}
            </p>

            <div className="flex items-center gap-2 w-full max-w-xs">
              <button
                onClick={() => handleCopyLink(profileUrl)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/15 text-sm font-medium text-pnp-textPrimary transition-all hover:bg-white/8 active:scale-[0.97] min-h-[44px]"
                style={{ background: "var(--pnp-surface)" }}
                aria-label="Copiar enlace del perfil"
              >
                {copied ? (
                  <>
                    <Check size={15} className="text-green-400" aria-hidden="true" />
                    <span className="text-green-400">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={15} aria-hidden="true" />
                    Copiar enlace
                  </>
                )}
              </button>

              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={() => handleNativeShare(profileUrl, creator.first_name)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 text-sm font-medium text-pnp-textPrimary transition-all hover:bg-white/8 active:scale-[0.97] min-h-[44px]"
                  style={{ background: "var(--pnp-surface)" }}
                  aria-label="Compartir perfil"
                >
                  <Share2 size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </section>

          {/* Bottom spacer for mobile nav bar */}
          <div className="h-4" aria-hidden="true" />
        </div>
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────────────────── */}
      {lightboxItem && (
        <Lightbox
          item={lightboxItem}
          onClose={() => setLightboxItem(null)}
          watermarkLabel={watermarkLabel}
        />
      )}

      {/* ── Book a Call modal ──────────────────────────────────────────────────── */}
      {showBookCall && (
        <BookCallModal
          creator={bookCallCreator}
          isOnline={false}
          open={showBookCall}
          onClose={() => { setShowBookCall(false); setBookCallDuration(undefined); }}
          initialDuration={bookCallDuration ?? 30}
          skipPackageStep={bookCallDuration !== undefined}
        />
      )}

      {/* ── Purchase confirmation modal ────────────────────────────────────────── */}
      {showVideoConfirm && (() => {
        const vCount = creator.videoCount ?? 0;
        const pCount = creator.photoCount ?? 0;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={() => setShowVideoConfirm(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pcm-title"
              aria-describedby="pcm-desc"
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{ background: "var(--pnp-surface-raised, #1e1e2e)", border: "1px solid rgba(255,255,255,0.08)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="text-center space-y-1">
                <p className="text-2xl" aria-hidden="true">🔓</p>
                <h3 id="pcm-title" className="text-base font-bold text-pnp-textPrimary">
                  Contenido exclusivo de {creator.first_name}
                </h3>
                <p id="pcm-desc" className="text-sm text-pnp-textSecondary">
                  Tu suscripción desbloquea:
                </p>
              </div>

              {/* Content counts */}
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-center gap-6"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div className="text-center">
                  <p className="text-xl font-bold" style={{ color: "var(--pnp-accent)" }}>{vCount}</p>
                  <p className="text-[11px] text-pnp-textSecondary mt-0.5">
                    video{vCount !== 1 ? "s" : ""} <span aria-hidden="true">🎬</span>
                  </p>
                </div>
                {pCount > 0 && (
                  <>
                    <div className="w-px h-8 bg-white/10" aria-hidden="true" />
                    <div className="text-center">
                      <p className="text-xl font-bold" style={{ color: "var(--pnp-accent)" }}>{pCount}</p>
                      <p className="text-[11px] text-pnp-textSecondary mt-0.5">
                        foto{pCount !== 1 ? "s" : ""} <span aria-hidden="true">📸</span>
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Price */}
              <p className="text-sm text-pnp-textSecondary text-center">
                Por{" "}
                <span className="font-bold text-pnp-textPrimary">
                  {formatPrice(creator.creator_price_usd ?? 0)}/mes
                </span>
                {" "}· Cancela cuando quieras
              </p>

              {/* Legal disclosures */}
              <div
                className="rounded-xl px-3 py-2.5 space-y-1.5"
                style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}
              >
                <p className="text-[10px] text-amber-300/80 leading-relaxed">
                  <span className="font-semibold">Compra final.</span> Todas las compras son definitivas y no reembolsables, salvo lo requerido por la ley local aplicable.
                </p>
                <p className="text-[10px] text-pnp-textSecondary leading-relaxed">
                  Facturado por <span className="font-medium text-pnp-textPrimary">EasyBots</span> · En tu estado de cuenta aparecerá como <span className="font-medium text-pnp-textPrimary">EasyBots</span> o <span className="font-medium text-pnp-textPrimary">NowPayments</span>.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowVideoConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmSubscribe}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #8B5CF6, #D946EF)" }}
                >
                  Suscribirme
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Block confirmation ─────────────────────────────────────────────────── */}
      {showBlockConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setShowBlockConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "var(--pnp-surface-raised, #1e1e2e)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-pnp-textPrimary text-center">
              {isBlocked ? `¿Desbloquear a ${creator.first_name}?` : `¿Bloquear a ${creator.first_name}?`}
            </h3>
            {!isBlocked && (
              <p className="text-sm text-pnp-textSecondary text-center">
                No podrán contactarte ni ver tu perfil. Puedes desbloquear en cualquier momento.
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowBlockConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleToggleBlock}
                disabled={blockLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                style={{ background: "#EF4444" }}
              >
                {blockLoading ? "…" : isBlocked ? "Desbloquear" : "Bloquear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report modal ───────────────────────────────────────────────────────── */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => !reportSending && setShowReportModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "var(--pnp-surface-raised, #1e1e2e)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {reportSent ? (
              <div className="text-center space-y-2 py-4">
                <Check size={28} className="text-green-400 mx-auto" aria-hidden="true" />
                <p className="text-sm font-semibold text-pnp-textPrimary">Reporte enviado</p>
                <p className="text-xs text-pnp-textSecondary">Gracias — nuestro equipo lo revisará.</p>
                <button
                  onClick={() => { setShowReportModal(false); setReportSent(false); setReportCategory(""); setReportDescription(""); }}
                  className="mt-2 px-5 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: "var(--pnp-accent)" }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-base font-bold text-pnp-textPrimary text-center">Reportar a {creator.first_name}</h3>
                <div className="space-y-2">
                  {(["harassment", "hate", "spam_scam", "impersonation", "nudity_nonconsensual", "csam", "self_harm", "other"] as ReportCategory[]).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setReportCategory(cat)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm text-left border transition-colors"
                      style={
                        reportCategory === cat
                          ? { borderColor: "#FFB454", background: "rgba(255,180,84,0.08)", color: "#fff" }
                          : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }
                      }
                    >
                      <span
                        className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                        style={{ borderColor: reportCategory === cat ? "#FFB454" : "rgba(255,255,255,0.25)" }}
                      >
                        {reportCategory === cat && <span className="w-2 h-2 rounded-full" style={{ background: "#FFB454" }} />}
                      </span>
                      {REPORT_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value.slice(0, 500))}
                  placeholder="Detalles adicionales (opcional)"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#EBEBF5", outline: "none" }}
                />
                {reportError && <p className="text-xs" style={{ color: "#FF6B6B" }}>{reportError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={!reportCategory || reportSending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                    style={{ background: "#EF4444" }}
                  >
                    {reportSending ? "Enviando…" : "Enviar reporte"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Recent Post Card (extracted to avoid >150-line render block) ─────────────

interface RecentPostCardProps {
  post: CreatorRecentPost;
  creator: CreatorPublicProfile["creator"];
}

function RecentPostCard({ post, creator }: RecentPostCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [likedByMe, setLikedByMe] = useState(post.liked_by_me);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const likeInFlight = useRef(false);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { navigate("/login"); return; }
    if (likeInFlight.current) return;
    likeInFlight.current = true;
    const wasLiked = likedByMe;
    setLikedByMe(!wasLiked);
    setLikesCount((n) => n + (wasLiked ? -1 : 1));
    try {
      await togglePostLike(Number(post.id));
    } catch {
      setLikedByMe(wasLiked);
      setLikesCount((n) => n + (wasLiked ? 1 : -1));
    } finally {
      likeInFlight.current = false;
    }
  };

  const goToPost = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/social/post/${post.id}`);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/social/post/${post.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(`/social/post/${post.id}`); }}
      className="rounded-2xl p-4 space-y-3 cursor-pointer transition-opacity hover:opacity-90 active:scale-[0.99]"
      style={{ background: "var(--pnp-surface)" }}
    >
      {/* Author row */}
      <div className="flex items-center gap-2.5">
        {creator.photo_url ? (
          <img
            src={creator.photo_url}
            alt={creator.first_name}
            className="w-8 h-8 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
            style={{ background: "var(--pnp-accent)" }}
            aria-hidden="true"
          >
            {creator.first_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-pnp-textPrimary leading-none">
            {creator.first_name}
          </p>
          <p className="text-xs text-pnp-textSecondary mt-0.5">
            {relativeTime(post.created_at)}
          </p>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-sm text-pnp-textPrimary leading-relaxed line-clamp-3 break-words">
          {post.content}
        </p>
      )}

      {/* Media */}
      {post.media_url && (
        <div className="aspect-video rounded-xl overflow-hidden">
          {post.media_type === "video" ? (
            <VideoPlayer
              src={post.media_url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={post.media_url}
              alt="Post media"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}

      {/* Actions row — ♡ 💬 ↗ matching design spec */}
      <div className="flex items-center gap-5 text-xs" style={{ color: "#A1A1A3" }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleLike}
          aria-label={likedByMe ? "Unlike" : "Like"}
          className={`flex items-center gap-1.5 transition-colors ${likedByMe ? "" : "hover:opacity-70"}`}
          style={likedByMe ? { color: "#ef4444" } : {}}
        >
          <Heart size={14} fill={likedByMe ? "currentColor" : "none"} aria-hidden="true" />
          <span>{likesCount.toLocaleString()}</span>
        </button>
        <button
          onClick={goToPost}
          aria-label="Comentar"
          className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
        >
          <MessageCircle size={14} aria-hidden="true" />
          <span>{(post.replies_count || 0).toLocaleString()}</span>
        </button>
        <button
          onClick={goToPost}
          aria-label="Compartir"
          className="flex items-center gap-1 hover:opacity-70 transition-opacity"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          </svg>
        </button>
      </div>
    </article>
  );
}

// ─── Exclusive Teaser Card — locked preview shown in the "Exclusivo" tab ───────

interface ExclusiveTeaserCardProps {
  post: CreatorExclusiveTeaser;
  creator: CreatorPublicProfile["creator"];
  isSubscribed: boolean;
  onUnlock: () => void;
}

function ExclusiveTeaserCard({ post, creator, isSubscribed, onUnlock }: ExclusiveTeaserCardProps) {
  const navigate = useNavigate();
  const unlocked = isSubscribed && post.content != null;

  if (unlocked) {
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/social/post/${post.id}`)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(`/social/post/${post.id}`); }}
        className="rounded-2xl p-4 space-y-3 cursor-pointer transition-opacity hover:opacity-90 active:scale-[0.99]"
        style={{ background: "var(--pnp-surface)" }}
      >
        <div className="flex items-center gap-2.5">
          {creator.photo_url ? (
            <img src={creator.photo_url} alt={creator.first_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white" style={{ background: "var(--pnp-accent)" }} aria-hidden="true">
              {creator.first_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-pnp-textPrimary leading-none">{creator.first_name}</p>
            <p className="text-xs text-pnp-textSecondary mt-0.5">{relativeTime(post.created_at)}</p>
          </div>
        </div>
        {post.content && (
          <p className="text-sm text-pnp-textPrimary leading-relaxed line-clamp-3 break-words">{post.content}</p>
        )}
        {post.media_url && (
          <div className="aspect-video rounded-xl overflow-hidden">
            {post.media_type === "video" ? (
              <VideoPlayer src={post.media_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
            ) : (
              <img src={post.media_url} alt="Post media" loading="lazy" className="w-full h-full object-cover" />
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-pnp-textSecondary">
          <Heart size={13} aria-hidden="true" />
          <span>{post.likes_count.toLocaleString()}</span>
        </div>
      </article>
    );
  }

  return (
    <button
      type="button"
      onClick={onUnlock}
      className="relative w-full text-left rounded-2xl p-4 pt-7 mt-3 border transition-opacity hover:opacity-95"
      style={{ background: "var(--pnp-surface)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      {/* Lock medallion overlapping the top edge */}
      <div
        className="absolute -top-[17px] left-1/2 -translate-x-1/2 w-[34px] h-[34px] rounded-full flex items-center justify-center"
        style={{ background: "#D4007A", boxShadow: "0 0 0 4px var(--pnp-background, #0a0a0a)" }}
        aria-hidden="true"
      >
        <Lock size={14} className="text-white" />
      </div>

      {/* Blurred fake author row */}
      <div className="flex items-center gap-2.5 opacity-45" style={{ filter: "blur(1px)" }} aria-hidden="true">
        {creator.photo_url ? (
          <img src={creator.photo_url} alt="" className="rounded-full object-cover shrink-0" style={{ width: 30, height: 30 }} />
        ) : (
          <div className="rounded-full shrink-0" style={{ width: 30, height: 30, background: "var(--pnp-accent)" }} />
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-pnp-textPrimary leading-none">{creator.first_name}</p>
          <p className="text-xs text-pnp-textSecondary mt-1">@{creator.username}</p>
        </div>
      </div>

      <p className="mt-3.5 text-sm font-bold text-pnp-textPrimary text-center">Contenido exclusivo</p>
      <p className="mt-1.5 text-xs text-pnp-textSecondary text-center">
        Suscríbete por {formatPrice(creator.creator_price_usd)}/mes para desbloquear
      </p>

      <div className="flex items-center gap-4 mt-3.5 text-xs" style={{ color: "#5a5a5f" }}>
        <span className="flex items-center gap-1"><Heart size={12} aria-hidden="true" /> {post.likes_count}</span>
      </div>
    </button>
  );
}
