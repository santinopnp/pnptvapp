/**
 * FreeTierEntryCard — 4-state entry UX shown to free-tier users on Main Stage
 * when they have no active LiveKit viewer token.
 *
 * States (mutually exclusive, evaluated top-down):
 *   open      — gate enabled + window currently open  → Watch Live Free CTA
 *   upcoming  — gate enabled + window not open yet    → countdown + Skip the wait CTAs
 *   disabled  — gate disabled / gateState null        → PRIME family gate + ad slot
 *
 * State 4 (VIA_AD_UNLOCK) is handled entirely by the parent — this component
 * only renders when there is NO valid viewer token.
 *
 * Design: matches VideoPaywallOverlay dark-glass style.
 * Copy: bilingual inline ternary (lang prop). No t() keys yet — v2 can migrate.
 * Copy principle: desire-first, never hostile (feedback_marketing_copy_desire_first).
 */

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FreeTierGateState {
  enabled: boolean;
  isOpen: boolean;
  currentCloseAt: number | null; // epoch ms
  nextOpenAt: number | null;     // epoch ms
  windows?: { start_utc: string; duration_min: number }[];
}

export interface FreeTierEntryCardProps {
  gateState: FreeTierGateState | null;
  primePlanPriceUsd?: number;
  onWatchLive: () => Promise<void>;
  connecting: boolean;
  lang: "en" | "es";
  /** Optional ad-unlock button rendered by parent in the CTA row. */
  adUnlockSlot?: React.ReactNode;
}

export type FreeTierStateLabel = "open" | "upcoming" | "disabled";

// ── Helper: compute which state to render ─────────────────────────────────────

export function computeFreeTierState(
  gateState: FreeTierGateState | null
): FreeTierStateLabel {
  if (!gateState || !gateState.enabled) return "disabled";
  if (gateState.isOpen) return "open";
  if (gateState.nextOpenAt != null && gateState.nextOpenAt > Date.now()) return "upcoming";
  return "disabled";
}

// ── Countdown hook ─────────────────────────────────────────────────────────────

/**
 * Returns a formatted countdown string that ticks every second.
 * target: epoch ms, or null → returns "-"
 */
function useMainStageCountdown(target: number | null): string {
  const [formatted, setFormatted] = useState<string>(() => formatDiff(target));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (target == null) {
      setFormatted("-");
      return;
    }

    function tick() {
      setFormatted(formatDiff(target));
    }

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, [target]);

  return formatted;
}

function formatDiff(target: number | null): string {
  if (target == null) return "-";
  const diffSec = Math.max(0, Math.floor((target - Date.now()) / 1000));
  if (diffSec === 0) return "0s";

  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;

  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${s}s`;
}

// ── Shared inner components ────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin text-white"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// Feature list bullet shared across state 2 + 3
const FEATURES_EN = [
  "24/7 stage — never wait",
  "Cam + mic + 4h sessions",
  "Priority spotlight rotation",
];
const FEATURES_ES = [
  "Escenario 24/7 — sin esperar",
  "Cámara + mic + sesiones de 4h",
  "Rotación prioritaria en spotlight",
];

function FeatureList({ lang }: { lang: "en" | "es" }) {
  const items = lang === "es" ? FEATURES_ES : FEATURES_EN;
  return (
    <ul className="space-y-1.5" aria-label={lang === "es" ? "Beneficios PRIME" : "PRIME benefits"}>
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.70)" }}>
          <span className="text-base leading-none" aria-hidden="true">💎</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// Reusable gradient CTA button (matches Channel Pass panel)
interface GradientButtonProps {
  label: string;
  sublabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  "aria-label"?: string;
}

function GradientButton({
  label,
  sublabel,
  onClick,
  disabled,
  loading,
  "aria-label": ariaLabel,
}: GradientButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-full flex flex-col items-center justify-center gap-0.5 px-4 py-3.5 rounded-xl font-bold text-sm text-white min-h-[52px] transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
      style={{
        background: "linear-gradient(135deg, #D4007A, #E69138)",
        focusRingColor: "#D4007A",
        focusRingOffsetColor: "transparent",
      } as React.CSSProperties}
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          <span>{label}</span>
          {sublabel && (
            <span className="text-xs font-normal" style={{ color: "rgba(255,255,255,0.65)" }}>
              {sublabel}
            </span>
          )}
        </>
      )}
    </button>
  );
}

// Ghost/secondary button
interface GhostButtonProps {
  label: string;
  onClick?: () => void;
  "aria-label"?: string;
}

function GhostButton({ label, onClick, "aria-label": ariaLabel }: GhostButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-full flex items-center justify-center px-4 py-3 rounded-xl font-semibold text-sm min-h-[48px] transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.75)",
      }}
    >
      {label}
    </button>
  );
}

// ── Glass card container (matches VideoPaywallOverlay pattern) ─────────────────

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-5"
      style={{
        background: "rgba(30,30,30,0.92)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function FreeTierEntryCard({
  gateState,
  primePlanPriceUsd,
  onWatchLive,
  connecting,
  lang,
  adUnlockSlot,
}: FreeTierEntryCardProps) {
  const navigate = useNavigate();
  const state = computeFreeTierState(gateState);

  // Countdown targets
  const closeCountdown = useMainStageCountdown(
    state === "open" ? (gateState?.currentCloseAt ?? null) : null
  );
  const openCountdown = useMainStageCountdown(
    state === "upcoming" ? (gateState?.nextOpenAt ?? null) : null
  );

  const primeLabel =
    primePlanPriceUsd != null
      ? `${lang === "es" ? "Ir PRIME" : "Go PRIME"} · $${primePlanPriceUsd}/mo`
      : lang === "es"
      ? "Ir PRIME · siempre adentro"
      : "Go PRIME · always in";

  // ── State 1: WINDOW_OPEN ───────────────────────────────────────────────────
  if (state === "open") {
    return (
      <CardShell>
        <GlassCard>
          {/* Live indicator */}
          <div className="flex items-center justify-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0"
              style={{ background: "#D4007A" }}
              aria-hidden="true"
            />
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#D4007A" }}
            >
              LIVE
            </span>
          </div>

          {/* Header */}
          <div className="text-center space-y-1.5">
            <h2 className="text-xl font-bold text-white leading-snug">
              {lang === "es"
                ? "Main Stage está en vivo ahora mismo"
                : "Main Stage is live right now"}
            </h2>
            {closeCountdown !== "-" && (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.60)" }}>
                {lang === "es"
                  ? `Tu ventana gratis cierra en ${closeCountdown}`
                  : `Your free window closes in ${closeCountdown}`}
              </p>
            )}
          </div>

          {/* Primary CTA */}
          <GradientButton
            label={
              connecting
                ? lang === "es"
                  ? "Conectando..."
                  : "Connecting..."
                : lang === "es"
                ? "Ver en vivo gratis"
                : "Watch Live Free"
            }
            loading={connecting}
            disabled={connecting}
            onClick={onWatchLive}
            aria-label={
              lang === "es"
                ? "Ver Main Stage en vivo sin costo"
                : "Watch Main Stage live for free"
            }
          />

          {/* Secondary: upgrade nudge */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate("/subscribe")}
              className="text-xs font-medium underline underline-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent min-h-[44px] px-2 inline-flex items-center"
              style={{ color: "rgba(255,255,255,0.50)", focusRingColor: "#D4007A" } as React.CSSProperties}
            >
              {lang === "es"
                ? "Los PRIME entran siempre — sin esperar"
                : "Prime members always in — never wait"}
            </button>
          </div>
        </GlassCard>
      </CardShell>
    );
  }

  // ── State 2: WINDOW_UPCOMING ──────────────────────────────────────────────
  if (state === "upcoming") {
    return (
      <CardShell>
        <GlassCard>
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-white leading-snug">
              {lang === "es"
                ? `Main Stage enciende en ${openCountdown}`
                : `Main Stage lights up in ${openCountdown}`}
            </h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
              {lang === "es"
                ? "Agarra tu lugar cuando abran las puertas, o sáltate la espera"
                : "Grab a spot when the doors open, or skip the wait"}
            </p>
          </div>

          {/* Big countdown display */}
          <div className="text-center py-1">
            <span
              className="text-5xl font-extrabold tracking-tight"
              style={{
                background: "linear-gradient(135deg, #D4007A, #E69138)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
              aria-live="polite"
              aria-label={
                lang === "es"
                  ? `Tiempo restante: ${openCountdown}`
                  : `Time remaining: ${openCountdown}`
              }
            >
              {openCountdown}
            </span>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-2.5">
            <GradientButton
              label={primeLabel}
              sublabel={
                lang === "es"
                  ? "Acceso 24/7 — siempre adentro"
                  : "24/7 access — always in"
              }
              onClick={() => navigate("/subscribe")}
              aria-label={
                lang === "es"
                  ? "Suscribirse a PRIME para acceso ilimitado"
                  : "Subscribe to PRIME for unlimited access"
              }
            />
            {adUnlockSlot}
          </div>

          {/* Feature list */}
          <FeatureList lang={lang} />

          {/* Window schedule hint */}
          {gateState?.windows && gateState.windows.length > 0 && (
            <p
              className="text-center text-xs"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {lang === "es"
                ? `Ventanas gratis: ${gateState.windows.map((w) => w.start_utc).join(" + ")} UTC`
                : `Free windows: ${gateState.windows.map((w) => w.start_utc).join(" + ")} UTC`}
            </p>
          )}
        </GlassCard>
      </CardShell>
    );
  }

  // ── State 3: DISABLED_PRIMEONLY (gateState null OR enabled=false) ─────────
  return (
    <CardShell>
      <GlassCard>
        {/* Icon */}
        <div className="flex justify-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(212,0,122,0.20), rgba(230,145,56,0.20))",
              border: "1px solid rgba(212,0,122,0.28)",
            }}
            aria-hidden="true"
          >
            {/* Camera / stage icon */}
            <svg
              className="w-7 h-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              style={{ color: "#D4007A" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
        </div>

        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white leading-snug">
            {lang === "es"
              ? "Main Stage está en vivo para la familia PRIME"
              : "Main Stage is live for our PRIME family"}
          </h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
            {lang === "es"
              ? "Únete a la familia — 24/7 en vivo, cámara, mic, propinas"
              : "Come join us — 24/7 stage, cam, mic, tips"}
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-2.5">
          <GradientButton
            label={primeLabel}
            sublabel={
              lang === "es"
                ? "Acceso 24/7 — siempre adentro"
                : "24/7 access — always in"
            }
            onClick={() => navigate("/subscribe")}
            aria-label={
              lang === "es"
                ? "Suscribirse a PRIME para acceso ilimitado"
                : "Subscribe to PRIME for unlimited access"
            }
          />
          {adUnlockSlot}
        </div>

        {/* Feature list */}
        <FeatureList lang={lang} />
      </GlassCard>
    </CardShell>
  );
}

// ── Wrapper: blurred backdrop + centred card (matches VideoPaywallOverlay) ────

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-5">
      {/* Dark gradient fill — no video behind this card */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(212,0,122,0.12) 0%, rgba(0,0,0,0) 60%), rgba(0,0,0,0.88)",
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full flex justify-center">
        {children}
      </div>
    </div>
  );
}
