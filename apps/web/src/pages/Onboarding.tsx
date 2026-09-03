import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { usePrivy, useWallets, useConnectWallet } from "@privy-io/react-auth";
import {
  submitOnboardingStep,
  completeOnboarding,
  type OnboardingStepKey,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepId = OnboardingStepKey;

interface StepState {
  isSubmitting: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeAge(year: number, month: number, day: number): number {
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current - 1) / (total - 1)) * 100);
  return (
    <div className="w-full h-1 bg-pnp-surfaceHover rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: "linear-gradient(90deg,#D4007A,#E69138)" }}
      />
    </div>
  );
}

// ── Step wrapper ──────────────────────────────────────────────────────────────

interface StepWrapperProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function StepWrapper({ title, subtitle, children }: StepWrapperProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-pnp-textPrimary">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-pnp-textSecondary leading-relaxed">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Scroll-to-agree card ──────────────────────────────────────────────────────

interface ScrollAgreementCardProps {
  children: React.ReactNode;
  onScrolledToBottom: () => void;
  hasScrolled: boolean;
}

function ScrollAgreementCard({
  children,
  onScrolledToBottom,
  hasScrolled,
}: ScrollAgreementCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el || hasScrolled) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (atBottom) onScrolledToBottom();
  }, [hasScrolled, onScrolledToBottom]);

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="max-h-72 overflow-y-auto rounded-xl bg-pnp-surface border border-pnp-border p-4 text-sm text-pnp-textSecondary space-y-3"
    >
      {children}
    </div>
  );
}

// ── Step 1: Welcome (freemium pitch — no prices) ──────────────────────────────

function StepTiers({
  onNext,
  state,
}: {
  onNext: () => void;
  state: StepState;
}) {
  const t = useI18n();
  const es = t.lang === "es";

  const perks = es
    ? [
        { icon: "🔓", label: "Gratis para siempre", desc: "Comunidad, feed social y PNP Channels sin costo" },
        { icon: "💜", label: "Mejora cuando quieras", desc: "PRIME desbloquea shows en vivo y contenido exclusivo de creadores" },
        { icon: "💎", label: "Gasta Ru$h", desc: "Nuestra moneda interna — funciona como crédito de regalo. $1 = 6 Ru$h" },
      ]
    : [
        { icon: "🔓", label: "Free forever", desc: "Community, social feed & PNP Channels at no cost" },
        { icon: "💜", label: "Upgrade anytime", desc: "PRIME unlocks live shows & exclusive creator content" },
        { icon: "💎", label: "Spend Ru$h", desc: "Our in-app currency — works like a gift card. $1 = 6 Ru$h" },
      ];

  return (
    <StepWrapper
      title={es ? "Club Digital Adulto Queer PNP-aware" : "The Private PNP-aware Queer Adult Entertainment Digital Club"}
      subtitle={es
        ? "Plataforma freemium — sin tarjeta de crédito. Únete gratis y explora a tu ritmo."
        : "Freemium platform — no credit card required. Join free and explore at your own pace."
      }
    >
      <div className="space-y-3">
        {perks.map((p) => (
          <div key={p.label} className="flex items-start gap-4 rounded-xl bg-pnp-surface border border-pnp-border p-4">
            <span className="text-2xl flex-shrink-0" aria-hidden="true">{p.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-pnp-textPrimary">{p.label}</p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {state.error && <p role="alert" className="text-sm text-pnp-error">{state.error}</p>}

      <button
        type="button"
        onClick={onNext}
        disabled={state.isSubmitting}
        className="w-full min-h-[44px] rounded-xl font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {state.isSubmitting ? "…" : (es ? "Unirme gratis →" : "Join free →")}
      </button>
    </StepWrapper>
  );
}

// ── Step 2: Age ───────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function StepAge({
  onNext,
  state,
}: {
  onNext: (dob: string) => Promise<void>;
  state: StepState;
}) {
  const o = useI18n().onboarding;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const years = Array.from({ length: 100 }, (_, i) => currentYear - 18 - i);
  const daysInMonth = year && month
    ? new Date(Number(year), Number(month), 0).getDate()
    : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const canSubmit = !!year && !!month && !!day && confirmed && !state.isSubmitting;

  const handleSubmit = async () => {
    setClientError(null);
    if (!year || !month || !day) {
      setClientError(o.ageErrorInvalidDate);
      return;
    }
    const age = computeAge(Number(year), Number(month), Number(day));
    if (age < 18) {
      setClientError(o.ageErrorUnderage);
      return;
    }
    await onNext(isoDate(Number(year), Number(month), Number(day)));
  };

  const displayError = clientError || state.error;

  return (
    <StepWrapper title={o.ageTitle} subtitle={o.ageSubtitle}>
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            id: "dob-month",
            label: o.ageSelectMonth,
            value: month,
            onChange: (v: string) => { setMonth(v); setClientError(null); },
            options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
          },
          {
            id: "dob-day",
            label: o.ageSelectDay,
            value: day,
            onChange: (v: string) => { setDay(v); setClientError(null); },
            options: days.map((d) => ({ value: String(d), label: String(d) })),
          },
          {
            id: "dob-year",
            label: o.ageSelectYear,
            value: year,
            onChange: (v: string) => { setYear(v); setClientError(null); },
            options: years.map((y) => ({ value: String(y), label: String(y) })),
          },
        ].map((sel) => (
          <div key={sel.id} className="flex flex-col gap-1">
            <label htmlFor={sel.id} className="text-xs text-pnp-textSecondary">
              {sel.label}
            </label>
            <select
              id={sel.id}
              value={sel.value}
              onChange={(e) => sel.onChange(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-pnp-border bg-pnp-surface text-pnp-textPrimary text-sm px-3 focus:outline-none focus:ring-2 focus:ring-pnp-accent"
              aria-label={sel.label}
            >
              <option value="">{sel.label}</option>
              {sel.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <label className="flex items-start gap-3 p-3 rounded-xl bg-pnp-surface border border-pnp-border cursor-pointer hover:border-pnp-accent/50 transition-colors">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded border-pnp-border accent-pnp-accent focus:ring-pnp-accent"
          aria-label={o.ageCheckLabel}
        />
        <span className="text-sm text-pnp-textPrimary leading-relaxed">{o.ageCheckLabel}</span>
      </label>

      {displayError && (
        <p role="alert" className="text-sm text-pnp-error">{displayError}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full min-h-[44px] rounded-xl font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {state.isSubmitting ? "…" : o.continueBtn}
      </button>
    </StepWrapper>
  );
}

// ── Step 3: Terms ─────────────────────────────────────────────────────────────

function StepTerms({
  onNext,
  state,
}: {
  onNext: () => Promise<void>;
  state: StepState;
}) {
  const o = useI18n().onboarding;
  const [scrolled, setScrolled] = useState(false);

  return (
    <StepWrapper title={o.termsTitle} subtitle={o.termsSubtitle}>
      {!scrolled && (
        <p className="text-xs text-pnp-textSecondary italic">{o.termsScrollHint}</p>
      )}
      <ScrollAgreementCard onScrolledToBottom={() => setScrolled(true)} hasScrolled={scrolled}>
        <p className="font-semibold text-pnp-textPrimary">{o.termsExcerptHeading}</p>
        <p>{o.termsP1}</p>
        <p>{o.termsP2}</p>
        <p>{o.termsP3}</p>
        <p>{o.termsP4}</p>
        <p>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-pnp-accent hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pnp-accent rounded"
          >
            {o.termsFullLink} &#8599;
          </a>
        </p>
      </ScrollAgreementCard>

      {state.error && (
        <p role="alert" className="text-sm text-pnp-error">{state.error}</p>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!scrolled || state.isSubmitting}
        className="w-full min-h-[44px] rounded-xl font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {state.isSubmitting ? "…" : o.agreeBtn}
      </button>
    </StepWrapper>
  );
}

// ── Step 4: Privacy ───────────────────────────────────────────────────────────

function StepPrivacy({
  onNext,
  state,
}: {
  onNext: () => Promise<void>;
  state: StepState;
}) {
  const o = useI18n().onboarding;
  const [scrolled, setScrolled] = useState(false);

  return (
    <StepWrapper title={o.privacyTitle} subtitle={o.privacySubtitle}>
      {!scrolled && (
        <p className="text-xs text-pnp-textSecondary italic">{o.termsScrollHint}</p>
      )}
      <ScrollAgreementCard onScrolledToBottom={() => setScrolled(true)} hasScrolled={scrolled}>
        <p className="font-semibold text-pnp-textPrimary">{o.privacyExcerptHeading}</p>
        <p>{o.privacyP1}</p>
        <p>{o.privacyP2}</p>
        <p>{o.privacyP3}</p>
        <p>{o.privacyP4}</p>
        <p>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-pnp-accent hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pnp-accent rounded"
          >
            {o.privacyFullLink} &#8599;
          </a>
        </p>
      </ScrollAgreementCard>

      {state.error && (
        <p role="alert" className="text-sm text-pnp-error">{state.error}</p>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!scrolled || state.isSubmitting}
        className="w-full min-h-[44px] rounded-xl font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {state.isSubmitting ? "…" : o.agreeBtn}
      </button>
    </StepWrapper>
  );
}

// ── Step 5: Rules ─────────────────────────────────────────────────────────────

function StepRules({
  onNext,
  state,
}: {
  onNext: () => Promise<void>;
  state: StepState;
}) {
  const o = useI18n().onboarding;
  const [accepted, setAccepted] = useState(false);

  return (
    <StepWrapper title={o.rulesTitle} subtitle={o.rulesSubtitle}>
      <div className="rounded-xl bg-pnp-surface border border-pnp-border p-4">
        <ul className="space-y-3">
          {(o.rulesItems as readonly string[]).map((rule, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-pnp-textSecondary">
              <span
                className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-pnp-accent border border-pnp-accent/40"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="min-w-0">{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex items-start gap-3 p-3 rounded-xl bg-pnp-surface border border-pnp-border cursor-pointer hover:border-pnp-accent/50 transition-colors">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded border-pnp-border accent-pnp-accent focus:ring-pnp-accent"
          aria-label={o.rulesCheckLabel}
        />
        <span className="text-sm text-pnp-textPrimary leading-relaxed">{o.rulesCheckLabel}</span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-pnp-error">{state.error}</p>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!accepted || state.isSubmitting}
        className="w-full min-h-[44px] rounded-xl font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {state.isSubmitting ? "…" : o.continueBtn}
      </button>
    </StepWrapper>
  );
}

// ── Step 6: Values ────────────────────────────────────────────────────────────

function StepValues({
  onNext,
  state,
}: {
  onNext: () => Promise<void>;
  state: StepState;
}) {
  const o = useI18n().onboarding;

  return (
    <StepWrapper title={o.valuesTitle} subtitle={o.valuesSubtitle}>
      <div className="rounded-xl bg-pnp-surface border border-pnp-border p-4">
        <ul className="space-y-3">
          {(o.valuesItems as readonly string[]).map((value, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-pnp-textSecondary">
              <span
                className="mt-0.5 flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
                style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                aria-hidden="true"
              />
              <span className="min-w-0">{value}</span>
            </li>
          ))}
        </ul>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-pnp-error">{state.error}</p>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={state.isSubmitting}
        className="w-full min-h-[44px] rounded-xl font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {state.isSubmitting ? "…" : o.continueBtn}
      </button>
    </StepWrapper>
  );
}

// ── Step 7: Wallet ────────────────────────────────────────────────────────────

function StepCrypto({
  onFinish,
  state,
}: {
  onFinish: () => Promise<void>;
  state: StepState;
}) {
  const t = useI18n();
  const es = t.lang === "es";
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [connectError, setConnectError] = useState<string | null>(null);
  // Callbacks so we can dismiss the spinner on cancel + show a real error if
  // WalletConnect handshake fails (was silently hanging the "Creating…" UI).
  const { connectWallet } = useConnectWallet({
    onSuccess: () => { setConnectError(null); setConnecting(false); },
    onError: (err) => {
      setConnecting(false);
      const msg = typeof err === "string" ? err : String(err);
      if (/exited|closed|cancel|reject/i.test(msg)) return;
      setConnectError(es
        ? "No pudimos conectar tu wallet. Intenta de nuevo."
        : "We couldn't connect your wallet. Please try again.");
    },
  });
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0] || null;
  const walletReady = authenticated && !!embeddedWallet;
  const [connecting, setConnecting] = useState(false);

  // Privy identity → pnptv user row sync now runs globally from
  // <PrivyIdentitySync /> in App.tsx so ANY Privy entry point (this step, the
  // wallet FAB, BuyTokensModal, PayInWalletChips) backfills privy_id +
  // wallet_address, not just Step 7. Local effect removed.
  useEffect(() => {
    if (walletReady) setConnecting(false);
  }, [walletReady]);

  // "Create my wallet" path — social login (Telegram / X) → embedded wallet auto-created
  const handleCreateWallet = useCallback(() => {
    setConnectError(null);
    setConnecting(true);
    login();
  }, [login]);

  // "I already use crypto" path — connect existing external wallet (MetaMask, Coinbase, …)
  const handleConnectExternal = useCallback(() => {
    setConnectError(null);
    setConnecting(true);
    connectWallet();
  }, [connectWallet]);

  const handleCancel = useCallback(() => {
    setConnecting(false);
  }, []);

  return (
    <StepWrapper
      title={es ? "Tu billetera digital" : "Your digital wallet"}
      subtitle={es
        ? "PNPtv! incluye una billetera integrada — funciona como cuenta prepagada. Sin banco, sin tarjeta de crédito."
        : "PNPtv! includes a built-in wallet — think of it as a prepaid account. No bank, no credit card needed."
      }
    >
      {walletReady ? (
        /* ── Success ── */
        <div className="rounded-xl border border-green-500/30 p-4 space-y-2" style={{ background: "rgba(34,197,94,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.15)" }}>
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-bold text-green-300">{es ? "¡Billetera lista!" : "Wallet ready!"}</p>
          </div>
          <p
            className="text-xs font-mono text-pnp-textSecondary pl-11 break-all"
            aria-label={es ? `Dirección de tu billetera: ${embeddedWallet.address}` : `Your wallet address: ${embeddedWallet.address}`}
          >
            {embeddedWallet.address}
          </p>
          <p className="text-xs text-pnp-textSecondary pl-11 leading-relaxed">
            {es
              ? "Cárgala con USDC (= dólares en Base) o compra Ru$h directamente con tarjeta desde la app."
              : "Top it up with USDC (= dollars on Base) or buy Ru$h with a card directly inside the app."
            }
          </p>
        </div>
      ) : connecting ? (
        /* ── Connecting spinner ── */
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#D4007A] animate-spin" />
          <p className="text-sm font-semibold text-pnp-textPrimary text-center">
            {es ? "Creando tu billetera…" : "Creating your wallet…"}
          </p>
          <p className="text-xs text-pnp-textSecondary text-center max-w-[220px] leading-relaxed">
            {es
              ? "Puede tardar hasta 60 segundos la primera vez. No cierres esta pantalla."
              : "This can take up to 60 seconds the first time. Don't close this screen."
            }
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className="mt-3 min-h-[44px] px-4 rounded-lg text-sm font-semibold text-pnp-textPrimary underline hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
          >
            {es ? "Cancelar" : "Cancel"}
          </button>
        </div>
      ) : (
        /* ── Choice ── */
        <div className="space-y-3">
          {/* Path B — Create (recommended) */}
          <button
            type="button"
            onClick={handleCreateWallet}
            disabled={!ready}
            className="w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all active:scale-[0.98] disabled:opacity-40 hover:brightness-110"
            style={{ borderColor: "rgba(212,0,122,0.4)", background: "rgba(212,0,122,0.08)" }}
          >
            <span className="text-2xl flex-shrink-0" aria-hidden="true">✨</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-pnp-textPrimary">
                {es ? "Crear mi billetera" : "Create my wallet"}
              </p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">
                {es ? "Gratis. Entra con Telegram o X." : "Free. Sign in with Telegram or X."}
              </p>
            </div>
            <span className="text-[9px] font-bold px-2 py-1 rounded-full text-white flex-shrink-0" style={{ background: "linear-gradient(90deg,#D4007A,#E69138)" }}>
              {es ? "RECOMENDADO" : "RECOMMENDED"}
            </span>
          </button>

          {/* Path A — Already have wallet */}
          <button
            type="button"
            onClick={handleConnectExternal}
            disabled={!ready}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-pnp-surface text-left transition-all active:scale-[0.98] disabled:opacity-40 hover:border-white/20"
          >
            <span className="text-2xl flex-shrink-0" aria-hidden="true">🔗</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-pnp-textPrimary">
                {es ? "Ya tengo una wallet" : "I already use crypto"}
              </p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">
                {es ? "Conecta MetaMask, Coinbase u otra wallet." : "Connect MetaMask, Coinbase, or any wallet."}
              </p>
            </div>
          </button>

          {connectError && (
            <div className="text-[11px] leading-snug text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {connectError}
            </div>
          )}

          {/* Security note */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-pnp-surface/50 border border-pnp-border/50">
            <span className="text-base flex-shrink-0 mt-0.5" aria-hidden="true">🔐</span>
            <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
              {es
                ? "Tu billetera solo te pertenece a ti. PNPtv! nunca tiene acceso a tus fondos — solo vemos las transacciones que tú firmas."
                : "Your wallet belongs only to you. PNPtv! never has access to your funds — we only see transactions you sign."
              }
            </p>
          </div>
        </div>
      )}

      {state.error && <p role="alert" className="text-sm text-pnp-error">{state.error}</p>}

      <button
        type="button"
        onClick={onFinish}
        disabled={state.isSubmitting || connecting}
        className="w-full min-h-[44px] rounded-xl font-semibold text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {state.isSubmitting
          ? (es ? "Configurando tu cuenta…" : "Setting up your account…")
          : walletReady
          ? (es ? "Continuar →" : "Continue →")
          : (es ? "Saltar por ahora →" : "Skip for now →")}
      </button>

      {!walletReady && !connecting && (
        <p className="text-center text-[11px] text-pnp-textSecondary/50">
          {es
            ? "Puedes configurar tu billetera después desde la app."
            : "You can set up your wallet later from inside the app."
          }
        </p>
      )}
    </StepWrapper>
  );
}

// ── Ordered step list ─────────────────────────────────────────────────────────

const STEPS: StepId[] = ["tiers", "age", "terms", "privacy", "rules", "values", "crypto"];

// ── Main Wizard ───────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, refreshUser } = useAuth();
  const o = useI18n().onboarding;

  // Persist stepIndex to sessionStorage so a re-mount (Privy popup close, HMR,
  // OAuth callback bounce, etc.) doesn't reset the wizard to step 0.
  const [stepIndex, setStepIndex] = useState(() => {
    try {
      const raw = sessionStorage.getItem("pnptv:onboarding:stepIndex");
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n >= 0 && n < STEPS.length ? n : 0;
    } catch { return 0; }
  });
  const [stepState, setStepState] = useState<StepState>({ isSubmitting: false, error: null });

  useEffect(() => {
    try { sessionStorage.setItem("pnptv:onboarding:stepIndex", String(stepIndex)); } catch {}
  }, [stepIndex]);

  const totalSteps = STEPS.length;
  const currentStep = STEPS[stepIndex];
  const currentStepNumber = stepIndex + 1;

  // Redirect if not authenticated (after auth resolves)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const setError = (err: string | null) => setStepState((s) => ({ ...s, error: err }));
  const setSubmitting = (v: boolean) => setStepState((s) => ({ ...s, isSubmitting: v }));

  const submit = useCallback(
    async (step: StepId, payload: Record<string, unknown> = {}) => {
      setSubmitting(true);
      setError(null);
      try {
        const result = await submitOnboardingStep(step, payload);
        if ("error" in result && result.error) {
          if (result.error === "must_be_18") {
            setError(o.ageErrorUnderage);
          } else {
            setError(result.error);
          }
          return false;
        }
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : o.ageErrorServer);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [o],
  );

  const goNext = useCallback(() => {
    setStepState({ isSubmitting: false, error: null });
    setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  }, [totalSteps]);

  const goBack = useCallback(() => {
    setStepState({ isSubmitting: false, error: null });
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Step handlers
  const handleTiers = useCallback(async () => {
    const ok = await submit("tiers");
    if (ok) goNext();
  }, [submit, goNext]);

  const handleAge = useCallback(
    async (dob: string) => {
      const ok = await submit("age", { dob });
      if (ok) goNext();
    },
    [submit, goNext],
  );

  const handleTerms = useCallback(async () => {
    const ok = await submit("terms");
    if (ok) goNext();
  }, [submit, goNext]);

  const handlePrivacy = useCallback(async () => {
    const ok = await submit("privacy");
    if (ok) goNext();
  }, [submit, goNext]);

  const handleRules = useCallback(async () => {
    const ok = await submit("rules");
    if (ok) goNext();
  }, [submit, goNext]);

  const handleValues = useCallback(async () => {
    const ok = await submit("values");
    if (ok) goNext();
  }, [submit, goNext]);

  const handleCrypto = useCallback(async () => {
    const ok = await submit("crypto");
    if (!ok) return;
    setSubmitting(true);
    setError(null);
    try {
      await completeOnboarding();
      await refreshUser().catch(() => {});
      try { sessionStorage.removeItem("pnptv:onboarding:stepIndex"); } catch {}
      // Post-onboarding tutorial: land users on santinofurioso's profile with
      // action=subscribe so the profile page auto-selects the monthly plan
      // and shows the "use your 180 gifted Ru$h" banner. onboarding=1 gates
      // the banner so returning users don't see it.
      navigate("/c/santinofurioso?action=subscribe&onboarding=1", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not complete setup. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [submit, navigate, refreshUser]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-pnp-background">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const stepLabel = o.stepOf
    .replace("{current}", String(currentStepNumber))
    .replace("{total}", String(totalSteps));

  return (
    <div className="min-h-dvh bg-pnp-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-pnp-background/90 backdrop-blur-sm border-b border-pnp-border px-4 py-3">
        <div className="max-w-lg mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span
              className="text-base font-bold text-pnp-textPrimary tracking-tight"
              style={{ background: "linear-gradient(90deg,#D4007A,#E69138)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              PNPtv!
            </span>
            <span className="text-xs text-pnp-textSecondary tabular-nums">{stepLabel}</span>
          </div>
          <ProgressBar current={currentStepNumber} total={totalSteps} />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col">
        <div className="max-w-lg mx-auto w-full px-4 py-6 flex-1 flex flex-col">
          {/* Back button */}
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              disabled={stepState.isSubmitting}
              aria-label={o.backBtn}
              className="self-start mb-4 flex items-center gap-1 text-sm text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors min-h-[44px] px-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pnp-accent rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {o.backBtn}
            </button>
          )}

          {/* Step content */}
          <div className="animate-fade-in-up flex-1">
            {currentStep === "tiers" && (
              <StepTiers onNext={handleTiers} state={stepState} />
            )}
            {currentStep === "age" && (
              <StepAge onNext={handleAge} state={stepState} />
            )}
            {currentStep === "terms" && (
              <StepTerms onNext={handleTerms} state={stepState} />
            )}
            {currentStep === "privacy" && (
              <StepPrivacy onNext={handlePrivacy} state={stepState} />
            )}
            {currentStep === "rules" && (
              <StepRules onNext={handleRules} state={stepState} />
            )}
            {currentStep === "values" && (
              <StepValues onNext={handleValues} state={stepState} />
            )}
            {currentStep === "crypto" && (
              <StepCrypto onFinish={handleCrypto} state={stepState} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
