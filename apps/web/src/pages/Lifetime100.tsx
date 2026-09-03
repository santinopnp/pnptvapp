import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useLocation, useNavigate, Link } from "react-router-dom";
import { useLifetime100Strings, type Lifetime100Strings } from "@/lib/i18n/lifetime100";
import { sheets } from "@/pages/LandingPage";
import {
  MetaMaskIcon,
  TrustWalletIcon,
  WalletConnectIcon,
  trustWalletDeepLink,
  metaMaskDeepLink,
  isMetaMaskCompatible,
  WalletPayCard,
} from "@/components/payments/PayInWalletChips";
import { CardPaymentModal } from "@/components/payments/CardPaymentModal";
import { useAuth } from "@/hooks/useAuth";

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || "https://pnptv.app";
const LANG_STORAGE_KEY = "pnptv:lifetime100:lang";
const REDIRECT_DELAY_MS = 2500;

// Direct Dash receive address. Manual activation — user sends ≈ $100 in Dash
// and emails the tx hash + their email to support@pnptv.app.
const DASH_ADDRESS = "Xbz9ZsZTdRyPXhKyTM2XrS7ELDFvJr9zL3";

// Lifetime PRIME entitlement — pinned to the $100 founders' plan id used by
// the existing /lifetime100 payment paths.
const LIFETIME100_PLAN_ID = "lifetime100";
const LIFETIME100_PRICE_USD = 100;

// Crypto currencies accepted for lifetime100 — mirrors the backend allow-list.
const CRYPTO_CURRENCIES = [
  { code: "usdcbase", labelKey: "cryptoUsdcLabel" as const, chain: "Base" },
  { code: "usdterc20", labelKey: "cryptoUsdtLabel" as const, chain: "ERC-20" },
  { code: "eth", labelKey: "cryptoEthLabel" as const, chain: "Ethereum" },
  { code: "btc", labelKey: "cryptoBtcLabel" as const, chain: "Bitcoin" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitialLang(): string {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage unavailable
  }
  return typeof navigator !== "undefined" ? navigator.language || "es" : "es";
}

function persistLang(lang: string): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// ── Spinner ────────────────────────────────────────────────────────────────────

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Diamond icon matching static page aesthetic ────────────────────────────────

function DiamondIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }}
    >
      <path d="M12 2L2 12L12 22L22 12L12 2Z" fill={color} />
    </svg>
  );
}

// ── Language toggle ────────────────────────────────────────────────────────────

interface LangToggleProps {
  lang: string;
  onChange: (lang: string) => void;
}

function LangToggle({ lang, onChange }: LangToggleProps) {
  const isEn = lang.toLowerCase().startsWith("en");

  const btnBase: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 18,
    transition: "all 0.2s ease",
    minHeight: 36,
    minWidth: 44,
  };

  return (
    <div
      style={{
        display: "flex",
        background: "rgba(255,255,255,0.10)",
        borderRadius: 20,
        padding: 2,
      }}
      role="group"
      aria-label="Language toggle"
    >
      <button
        onClick={() => onChange("en")}
        style={{
          ...btnBase,
          background: isEn ? "#ffffff" : "transparent",
          color: isEn ? "#120d14" : "#8E8E93",
        }}
        aria-pressed={isEn}
      >
        EN
      </button>
      <button
        onClick={() => onChange("es")}
        style={{
          ...btnBase,
          background: !isEn ? "#ffffff" : "transparent",
          color: !isEn ? "#120d14" : "#8E8E93",
        }}
        aria-pressed={!isEn}
      >
        ES
      </button>
    </div>
  );
}

// ── Modal backdrop ─────────────────────────────────────────────────────────────

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(44,44,46,0.92)",
          border: "1px solid rgba(255,180,84,0.3)",
          borderRadius: 24,
          padding: "28px 24px",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
          animation: "lt100-fadeIn 0.25s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Crypto payment modal (USDC / USDT / ETH / BTC via NowPayments) ────────────
//
// Two-step flow inside one modal:
//   1. Email + currency picker → POST /api/public/lifetime100/np-invoice
//   2. On success, swap in an NP widget iframe + MetaMask/Trust Wallet chips
//
// PRIME activates automatically via the shared NP IPN webhook once payment
// confirms — no code, no activation step.

interface CryptoPaymentModalProps {
  s: Lifetime100Strings;
  lang: string;
  onClose: () => void;
}

interface InvoiceState {
  invoiceUrl: string;
  nowpaymentsInvoiceId: string;
  payCurrency: string;
}

function CryptoPaymentModal({ s, lang, onClose }: CryptoPaymentModalProps) {
  const [email, setEmail] = useState("");
  const [payCurrency, setPayCurrency] = useState<string>("usdcbase");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceState | null>(null);
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [widgetErrored, setWidgetErrored] = useState(false);
  const [widgetReloadKey, setWidgetReloadKey] = useState(0);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!invoice) return;
    setWidgetLoaded(false);
    setWidgetErrored(false);
    const timeoutId = window.setTimeout(() => {
      setWidgetErrored((prev) => (widgetLoaded ? prev : true));
    }, 8000);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.nowpaymentsInvoiceId, widgetReloadKey]);

  useEffect(() => {
    if (invoice) return;
    const id = setTimeout(() => emailInputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [invoice]);

  const handleContinue = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setError(s.invalidEmail);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/lifetime100/np-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, payCurrency, language: lang }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || s.errorGeneric);
        return;
      }
      setInvoice({
        invoiceUrl: String(data.invoiceUrl),
        nowpaymentsInvoiceId: String(data.nowpaymentsInvoiceId),
        payCurrency: String(data.payCurrency || payCurrency),
      });
    } catch {
      setError(s.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }, [email, payCurrency, lang, s]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !invoice) handleContinue();
  };

  // ── Step 2 — invoice created, show widget + wallet chips ─────────────────
  if (invoice) {
    const widgetSrc = `https://nowpayments.io/embeds/payment-widget?iid=${encodeURIComponent(invoice.nowpaymentsInvoiceId)}`;
    const showMetaMask = isMetaMaskCompatible(invoice.payCurrency);
    const tw = trustWalletDeepLink(invoice.invoiceUrl, invoice.payCurrency);
    const mm = metaMaskDeepLink(invoice.invoiceUrl);

    return (
      <ModalOverlay onClose={onClose}>
        <div style={{ maxHeight: "85dvh", overflowY: "auto" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
            {s.cryptoPayHere}
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#8E8E93", lineHeight: 1.5 }}>
            {s.cryptoAfterPay}
          </p>

          {invoice.payCurrency === "btc" && (
            <div
              style={{
                margin: "0 0 12px",
                padding: "12px 14px",
                background: "rgba(255,180,84,0.12)",
                border: "1px solid rgba(255,180,84,0.35)",
                borderRadius: 12,
              }}
            >
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#ffb454" }}>
                {s.banxaHintTitle}
              </p>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#e5e5ea", lineHeight: 1.5 }}>
                {s.banxaHintBody}
              </p>
              <a
                href="https://checkout.banxa.com/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#0d0510",
                  background: "#ffb454",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                {s.banxaHintCta}
              </a>
            </div>
          )}

          <a
            href={invoice.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              margin: "0 0 10px",
              padding: "10px 12px",
              fontSize: 12,
              color: "#93c5fd",
              textDecoration: "none",
              background: "rgba(59,153,252,0.08)",
              border: "1px solid rgba(59,153,252,0.25)",
              borderRadius: 10,
              textAlign: "center",
            }}
          >
            🔗 {s.widgetFallbackCta}
          </a>

          {widgetErrored && (
            <div style={{
              margin: "0 0 10px", padding: "10px 12px",
              fontSize: 12, color: "#fca5a5",
              background: "rgba(220,38,38,0.10)",
              border: "1px solid rgba(220,38,38,0.35)",
              borderRadius: 10,
            }}>
              {s.widgetFailed}
            </div>
          )}

          <div
            style={{
              position: "relative",
              width: "100%",
              height: 480,
              borderRadius: 14,
              overflow: "hidden",
              background: "#0d0510",
              border: "1px solid rgba(255,180,84,0.25)",
            }}
          >
            {!widgetLoaded && !widgetErrored && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 2,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 10, background: "#0d0510",
                color: "#8E8E93", fontSize: 12,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: "3px solid rgba(255,180,84,0.25)",
                  borderTopColor: "#ffb454",
                  animation: "spin 0.8s linear infinite",
                }} />
                <span>{s.widgetLoading}</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            <iframe
              key={`np-widget-${widgetReloadKey}`}
              src={widgetSrc}
              title="NowPayments checkout"
              width="100%"
              height="480"
              frameBorder="0"
              scrolling="yes"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox"
              onLoad={() => { setWidgetLoaded(true); setWidgetErrored(false); }}
              onError={() => setWidgetErrored(true)}
              style={{ display: "block", border: 0, width: "100%", height: 480, background: "#fff" }}
              allow="payment"
            />
          </div>

          <button
            type="button"
            onClick={() => { setWidgetLoaded(false); setWidgetErrored(false); setWidgetReloadKey((n) => n + 1); }}
            style={{
              display: "block", width: "100%", marginTop: 8,
              padding: "8px 12px", fontSize: 12, fontWeight: 600,
              color: "#93c5fd", background: "rgba(59,153,252,0.08)",
              border: "1px solid rgba(59,153,252,0.25)",
              borderRadius: 10, cursor: "pointer", minHeight: 40,
            }}
          >
            🔄 {s.widgetReload}
          </button>

          <p style={{ margin: "16px 0 8px", fontSize: 11, fontWeight: 600, color: "#8E8E93" }}>
            {s.cryptoOpenWallet}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: showMetaMask ? "repeat(3, minmax(0,1fr))" : "repeat(2, minmax(0,1fr))",
              gap: 8,
            }}
          >
            {showMetaMask && (
              <a
                href={mm}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  padding: "12px 6px", borderRadius: 12,
                  border: "1px solid rgba(249,115,22,0.3)",
                  background: "rgba(249,115,22,0.08)",
                  textDecoration: "none",
                }}
              >
                <MetaMaskIcon />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fdba74" }}>MetaMask</span>
              </a>
            )}
            <a
              href={tw}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "12px 6px", borderRadius: 12,
                border: "1px solid rgba(59,153,252,0.3)",
                background: "rgba(37,99,235,0.1)",
                textDecoration: "none",
              }}
            >
              <TrustWalletIcon />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd" }}>Trust Wallet</span>
            </a>
            <a
              href={invoice.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "12px 6px", borderRadius: 12,
                border: "1px solid rgba(59,153,252,0.3)",
                background: "rgba(59,153,252,0.08)",
                textDecoration: "none",
              }}
            >
              <WalletConnectIcon />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd" }}>
                {s.cryptoOpenInNewTab}
              </span>
            </a>
          </div>

          <button
            onClick={onClose}
            style={{
              display: "block", width: "100%", marginTop: 16, padding: "10px",
              background: "none", border: "none", color: "#8E8E93",
              fontSize: 13, cursor: "pointer", minHeight: 44,
            }}
          >
            {s.cryptoCancel}
          </button>
        </div>
      </ModalOverlay>
    );
  }

  // ── Step 1 — email + currency picker ─────────────────────────────────────
  return (
    <ModalOverlay onClose={!submitting ? onClose : undefined}>
      <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
        {s.cryptoModalTitle}
      </h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#8E8E93", lineHeight: 1.5 }}>
        {s.cryptoModalSubtitle}
      </p>

      <label
        htmlFor="lt100-email"
        style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 6 }}
      >
        {s.emailLabel}
      </label>
      <input
        id="lt100-email"
        ref={emailInputRef}
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder={s.emailPlaceholder}
        disabled={submitting}
        style={{
          display: "block", width: "100%", boxSizing: "border-box",
          padding: "12px 14px", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(0,0,0,0.3)", color: "#ffffff",
          fontSize: 16, marginBottom: 16, outline: "none",
          opacity: submitting ? 0.6 : 1,
        }}
        aria-invalid={!!error}
      />

      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#8E8E93" }}>
        {s.cryptoPickCurrency}
      </p>
      <div
        role="radiogroup"
        aria-label={s.cryptoPickCurrency}
        style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: 18 }}
      >
        {CRYPTO_CURRENCIES.map((c) => {
          const selected = payCurrency === c.code;
          return (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPayCurrency(c.code)}
              disabled={submitting}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: "12px 4px", borderRadius: 12,
                border: selected ? "1.5px solid #ff9933" : "1px solid rgba(255,255,255,0.15)",
                background: selected ? "rgba(255,153,51,0.12)" : "rgba(0,0,0,0.3)",
                color: "#ffffff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                minHeight: 56, transition: "all 0.15s",
                boxShadow: selected ? "0 0 12px rgba(255,153,51,0.25)" : "none",
              }}
            >
              <span>{s[c.labelKey]}</span>
              <span style={{ fontSize: 9, fontWeight: 500, color: selected ? "#ffb454" : "#8E8E93" }}>
                {c.chain}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#FF453A" }}>
          {error}
        </p>
      )}

      <button
        onClick={handleContinue}
        disabled={submitting || !email.trim()}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
          background: submitting || !email.trim()
            ? "rgba(255,51,119,0.4)"
            : "linear-gradient(90deg, #ff3377, #ff9933)",
          color: "#ffffff", fontSize: 14, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.05em",
          cursor: submitting || !email.trim() ? "not-allowed" : "pointer",
          minHeight: 48, transition: "opacity 0.15s",
        }}
      >
        {submitting && <Spinner size={16} />}
        {submitting ? s.cryptoOpeningInvoice : s.cryptoContinue}
      </button>

      <button
        onClick={onClose}
        disabled={submitting}
        style={{
          display: "block", width: "100%", marginTop: 10, padding: "10px",
          background: "none", border: "none", color: "#8E8E93",
          fontSize: 13, cursor: submitting ? "not-allowed" : "pointer", minHeight: 44,
        }}
      >
        {s.modalCancel}
      </button>
    </ModalOverlay>
  );
}

// ── Card payment modal (MercadoPago hosted link — mpago.li) ──────────────────
//
// One-step redirect flow: opens the mpago.li checkout in a new tab. Buyer pays
// in COP (~320,000 ≈ $100 USD). After payment they return to /mercadopago,
// enter their email → admin activates from /admin/manual-activations.

// CardPaymentModal now lives in @/components/payments/CardPaymentModal.tsx —
// shared with Subscribe.tsx so both surfaces get the same email + operation
// number activation flow.

// ── Activate view ──────────────────────────────────────────────────────────────

interface ActivateViewProps {
  s: Lifetime100Strings;
  initialCode: string;
}

type ActivateError =
  | { type: "402" }
  | { type: "410" }
  | { type: "404" }
  | { type: "409" }
  | { type: "423" }
  | { type: "429" }
  | { type: "generic"; message: string };

function ActivateView({ s, initialCode }: ActivateViewProps) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ActivateError | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount, unless a code is pre-filled (focus still helps)
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  const getErrorMessage = (err: ActivateError): string => {
    switch (err.type) {
      case "402": return s.errorPaymentNotReceived;
      case "410": return s.errorCodeExpired;
      case "404": return s.errorCodeInvalid;
      case "409": return s.errorCodeAlreadyUsed;
      case "423": return s.errorActivationInProgress;
      case "429": return s.errorActivateRateLimit;
      default: return err.message;
    }
  };

  const handleActivate = useCallback(async () => {
    const trimmed = code.trim();
    if (trimmed.length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      // Uses the session-authed activation endpoint (the earlier public MP-backed
      // route at /api/public/lifetime100/activate was ripped in commit 88c54030
      // when its mp_payment_links table proved dead). 401 → send the user to
      // /login and bounce back here with the code preserved, so a fresh
      // purchaser who lands via email link but has no session can complete
      // the flow in one round-trip.
      const res = await fetch(`${API_BASE}/api/webapp/user/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          window.location.assign(data.redirect || "/");
        }, REDIRECT_DELAY_MS);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        const next = encodeURIComponent(`/lifetime100/activate?code=${encodeURIComponent(trimmed)}`);
        window.location.assign(`/login?next=${next}`);
        return;
      }
      if (res.status === 422 && data.redirect) {
        window.location.assign(data.redirect);
        return;
      }
      if (res.status === 400) { setError({ type: "404" }); return; }
      if (res.status === 402) { setError({ type: "402" }); return; }
      if (res.status === 404) { setError({ type: "404" }); return; }
      if (res.status === 409) { setError({ type: "409" }); return; }
      if (res.status === 410) { setError({ type: "410" }); return; }
      if (res.status === 423) { setError({ type: "423" }); return; }
      if (res.status === 429) { setError({ type: "429" }); return; }
      setError({ type: "generic", message: data.error || s.errorGeneric });
    } catch {
      setError({ type: "generic", message: s.errorGeneric });
    } finally {
      setSubmitting(false);
    }
  }, [code, navigate, s]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleActivate();
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          textAlign: "center",
          padding: "32px 24px",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "rgba(255,153,51,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
          aria-hidden="true"
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#ff9933" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#ffffff" }}>
          {s.activateSuccessTitle}
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 15, color: "#8E8E93", maxWidth: 320, lineHeight: 1.5 }}>
          {s.activateSuccessBody}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#8E8E93", fontSize: 13 }}>
          <Spinner size={14} />
          <span>{s.activateSuccessBody}</span>
        </div>
      </div>
    );
  }

  // ── Activate form ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 24px 120px" }}>
      {/* Amber top glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100vw",
          height: "50vw",
          background: "radial-gradient(circle, rgba(255,153,51,0.10) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <h1
        style={{
          margin: "0 0 8px",
          fontSize: 26,
          fontWeight: 900,
          color: "#ffffff",
          lineHeight: 1.15,
        }}
      >
        {s.activateTitle}
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: 15, color: "#8E8E93", lineHeight: 1.5 }}>
        {s.activateSubtitle}
      </p>

      <label
        htmlFor="lt100-code"
        style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 6 }}
      >
        {s.codeLabel}
      </label>
      <input
        id="lt100-code"
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder={s.codePlaceholder}
        disabled={submitting}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          padding: "14px 16px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(0,0,0,0.3)",
          color: "#ffffff",
          fontSize: 18,
          fontWeight: 600,
          fontFamily: "monospace",
          letterSpacing: "0.05em",
          marginBottom: 12,
          outline: "none",
          opacity: submitting ? 0.6 : 1,
        }}
        aria-describedby={error ? "lt100-activate-error" : undefined}
        aria-invalid={!!error}
      />

      {error && (
        <p
          id="lt100-activate-error"
          role="alert"
          style={{ margin: "0 0 16px", fontSize: 13, color: "#FF453A", lineHeight: 1.4 }}
        >
          {getErrorMessage(error)}
        </p>
      )}

      <button
        onClick={handleActivate}
        disabled={submitting || code.trim().length < 3}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "16px 20px",
          borderRadius: 14,
          border: "none",
          background: submitting || code.trim().length < 3
            ? "rgba(255,51,119,0.4)"
            : "linear-gradient(90deg, #ff3377, #ff9933)",
          color: "#ffffff",
          fontSize: 15,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          cursor: submitting || code.trim().length < 3 ? "not-allowed" : "pointer",
          minHeight: 52,
          transition: "opacity 0.15s",
        }}
      >
        {submitting && <Spinner size={16} />}
        {submitting ? s.activateSubmitting : s.activateSubmit}
      </button>
    </div>
  );
}

// ── Default (hero) view ────────────────────────────────────────────────────────

interface HeroViewProps {
  s: Lifetime100Strings;
  available: number | null;
  availabilityLoading: boolean;
  lang: string;
  onLangChange: (lang: string) => void;
  onOpenSheet: (id: string) => void;
}

function HeroView({ s, available, availabilityLoading, lang, onLangChange, onOpenSheet }: HeroViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [dashModalOpen, setDashModalOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  const isSoldOut = available === 0;
  const isClosed = !availabilityLoading && isSoldOut;

  const handleCtaClick = () => {
    if (isClosed) return;
    setModalOpen(true);
  };

  const handleCardClick = () => {
    if (isClosed) return;
    setCardModalOpen(true);
  };

  const handleWalletClick = () => {
    if (isClosed) return;
    setWalletModalOpen(true);
  };

  const handleDashClick = () => {
    if (isClosed) return;
    setDashModalOpen(true);
  };

  const activateHref = `/lifetime100/activate`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#120d14",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        paddingBottom: 280, // clearance for stacked pills + legal + 2 CTA buttons (crypto + card)
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "100vw",
          height: "100vw",
          background:
            "radial-gradient(circle, rgba(255,0,204,0.13) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Header */}
      <header
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
        }}
      >
        <a href="/" aria-label="PNPtv! home" style={{ display: "flex" }}>
          <img src="/logo-header.png" alt="PNPtv!" style={{ height: 36, width: "auto" }} />
        </a>
        <LangToggle lang={lang} onChange={onLangChange} />
      </header>

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 500,
          margin: "0 auto",
          padding: "0 16px",
        }}
      >
        {/* Hero */}
        <section style={{ textAlign: "center", padding: "12px 8px 20px" }}>
          <h1
            style={{
              fontSize: "clamp(26px, 7vw, 34px)",
              fontWeight: 900,
              lineHeight: 1.1,
              margin: "0 0 10px",
              textTransform: "uppercase",
            }}
          >
            {s.heroTitle}
          </h1>
          <p style={{ color: "#8E8E93", fontSize: 16, margin: 0 }}>
            {s.heroSubtitle}
          </p>
        </section>

        {/* Pricing glass card */}
        <div
          style={{
            background: "rgba(44,44,46,0.7)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,180,84,0.3)",
            borderRadius: 24,
            padding: "28px 24px",
            marginBottom: 16,
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Velvet rope top border */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: 4,
              background: "linear-gradient(90deg, #ff3377, #ff9933)",
            }}
          />

          {/* Badge */}
          <span
            style={{
              display: "block",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#ff9933",
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            {s.limitedBadge}
          </span>

          {/* Price */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 20,
                color: "#636366",
                textDecoration: "line-through",
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {s.oldPrice}
            </span>
            <div
              style={{
                fontSize: "clamp(56px, 15vw, 72px)",
                fontWeight: 900,
                lineHeight: 1,
                textShadow: "0 0 30px rgba(255,180,84,0.4)",
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: "0.36em", marginTop: "0.55em", opacity: 0.8 }}>$</span>
              <span>100</span>
            </div>
            <span
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 600,
                color: "#ff9933",
                textAlign: "center",
                letterSpacing: "0.02em",
              }}
            >
              {s.chargeCurrencyNote}
            </span>
          </div>

          {/* Benefits list */}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, textAlign: "left" }}>
            {s.benefits.map((benefit, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  marginBottom: 14,
                  fontSize: 14,
                  lineHeight: 1.4,
                  color: "rgba(255,255,255,0.9)",
                  gap: 12,
                }}
              >
                <DiamondIcon color="#ff9933" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Notice card — "Before you pay" */}
        <div
          role="note"
          style={{
            margin: "0 0 16px",
            padding: "18px 20px",
            borderRadius: 24,
            border: "1px solid rgba(255,153,51,0.45)",
            background:
              "linear-gradient(135deg, rgba(255,153,51,0.10), rgba(255,51,119,0.06))",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#ff9933",
            }}
          >
            {s.noticeTitle}
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.55,
              color: "#d6d6dc",
              listStyleType: "disc",
            }}
          >
            <li style={{ marginBottom: 8 }}>{s.noticeFundraising}</li>
            <li style={{ marginBottom: 8 }}>{s.noticeEarlyAccess}</li>
            <li>{s.noticeInProgress}</li>
          </ul>
        </div>

        {/* Diamond separator */}
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 4,
            margin: "20px 0",
            opacity: 0.5,
          }}
        >
          <span style={{ color: "#ff3377" }}>⬥</span>
          <span style={{ color: "#8E8E93" }}>⬥</span>
          <span style={{ color: "#ff9933" }}>⬥</span>
        </div>

        {/* Already paid link */}
        <p style={{ textAlign: "center", fontSize: 13, color: "#8E8E93" }}>
          {s.alreadyPaid}{" "}
          <a
            href={activateHref}
            style={{
              color: "#ff9933",
              fontWeight: 600,
              borderBottom: "1px solid rgba(255,153,51,0.5)",
              textDecoration: "none",
            }}
          >
            {s.alreadyPaidLink}
          </a>
        </p>
      </div>

      {/* Sticky footer: nav pills + legal + CTA button, stacked */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          width: "100%",
          background:
            "linear-gradient(to top, rgba(18,13,20,0.98) 50%, rgba(18,13,20,0.9) 85%, transparent)",
          zIndex: 50,
          boxSizing: "border-box",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Pill nav — opens bottom sheets in-place (stays on /lifetime100) */}
        <nav style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }} aria-label="Explore PNPtv">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", width: "max-content" }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenSheet(item.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#cfcfd4",
                  cursor: "pointer",
                  flexShrink: 0,
                  background: "rgba(18,13,20,0.6)",
                }}
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Legal links */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            columnGap: 12,
            rowGap: 2,
            padding: "4px 16px 8px",
          }}
        >
          {LEGAL_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                fontSize: 10,
                color: "rgba(207,207,212,0.5)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* CTA buttons — stacked: Pay with Crypto (primary) + Pay with Card (MP) */}
        <div style={{ padding: "4px 20px 0", display: "flex", flexDirection: "column", gap: 8, maxWidth: 500, margin: "0 auto" }}>
          <button
            onClick={handleCtaClick}
            disabled={availabilityLoading || isClosed}
            aria-disabled={availabilityLoading || isClosed}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "18px 24px",
              borderRadius: 16,
              border: "none",
              background: isClosed
                ? "rgba(255,255,255,0.08)"
                : "linear-gradient(90deg, #ff3377, #ff9933)",
              color: isClosed ? "#8E8E93" : "#ffffff",
              fontSize: 15,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: availabilityLoading || isClosed ? "not-allowed" : "pointer",
              minHeight: 56,
              boxShadow: isClosed
                ? "none"
                : "0 8px 32px rgba(255,51,119,0.4)",
              transition: "opacity 0.15s, transform 0.1s",
            }}
            onMouseDown={(e) => {
              if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
            onTouchStart={(e) => {
              if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onTouchEnd={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
          >
            {availabilityLoading && <Spinner size={16} />}
            {availabilityLoading
              ? s.ctaLoading
              : isClosed
              ? s.ctaSoldOut
              : s.ctaPayWithCrypto}
          </button>

          <button
            onClick={handleCardClick}
            disabled={availabilityLoading || isClosed}
            aria-disabled={availabilityLoading || isClosed}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "18px 24px",
              borderRadius: 16,
              border: "none",
              background: isClosed
                ? "rgba(255,255,255,0.08)"
                : "linear-gradient(90deg, #009EE3, #00B4E6)",
              color: isClosed ? "#8E8E93" : "#ffffff",
              fontSize: 15,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: availabilityLoading || isClosed ? "not-allowed" : "pointer",
              minHeight: 56,
              boxShadow: isClosed
                ? "none"
                : "0 8px 32px rgba(0,158,227,0.4)",
              transition: "opacity 0.15s, transform 0.1s",
            }}
            onMouseDown={(e) => {
              if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
            onTouchStart={(e) => {
              if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onTouchEnd={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
          >
            {availabilityLoading
              ? s.ctaLoading
              : isClosed
              ? s.ctaSoldOut
              : s.ctaPayWithCard}
          </button>

          {/* Wallet / USDC on Base — requires a pnptv session because
              /api/wallet/checkout/initiate is session-authed. Anonymous
              visitors can still use Crypto (NP), Card (MP), or Dash. */}
          {isAuthenticated && (
            <button
              onClick={handleWalletClick}
              disabled={availabilityLoading || isClosed}
              aria-disabled={availabilityLoading || isClosed}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                padding: "18px 24px",
                borderRadius: 16,
                border: "none",
                background: isClosed
                  ? "rgba(255,255,255,0.08)"
                  : "linear-gradient(90deg, #10b981, #059669)",
                color: isClosed ? "#8E8E93" : "#ffffff",
                fontSize: 15,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: availabilityLoading || isClosed ? "not-allowed" : "pointer",
                minHeight: 56,
                boxShadow: isClosed
                  ? "none"
                  : "0 8px 32px rgba(16,185,129,0.4)",
                transition: "opacity 0.15s, transform 0.1s",
              }}
              onMouseDown={(e) => {
                if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              }}
              onTouchStart={(e) => {
                if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
              }}
              onTouchEnd={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              }}
            >
              {availabilityLoading
                ? s.ctaLoading
                : isClosed
                ? s.ctaSoldOut
                : s.ctaPayWithWallet}
            </button>
          )}

          <button
            onClick={handleDashClick}
            disabled={availabilityLoading || isClosed}
            aria-disabled={availabilityLoading || isClosed}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              padding: "18px 24px",
              borderRadius: 16,
              border: "none",
              background: isClosed
                ? "rgba(255,255,255,0.08)"
                : "linear-gradient(90deg, #0891b2, #164e63)",
              color: isClosed ? "#8E8E93" : "#ffffff",
              fontSize: 15,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: availabilityLoading || isClosed ? "not-allowed" : "pointer",
              minHeight: 56,
              boxShadow: isClosed
                ? "none"
                : "0 8px 32px rgba(8,145,178,0.4)",
              transition: "opacity 0.15s, transform 0.1s",
            }}
            onMouseDown={(e) => {
              if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
            onTouchStart={(e) => {
              if (!isClosed) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
            }}
            onTouchEnd={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
          >
            {availabilityLoading
              ? s.ctaLoading
              : isClosed
              ? s.ctaSoldOut
              : s.ctaPayWithDash}
          </button>
        </div>
      </div>

      {/* Crypto payment modal — USDC / USDT / ETH / BTC via NowPayments */}
      {modalOpen && (
        <CryptoPaymentModal
          s={s}
          lang={lang}
          onClose={() => setModalOpen(false)}
        />
      )}

      {/* Card payment modal — MercadoPago (mpago.li) redirect + op# activation */}
      {cardModalOpen && (
        <CardPaymentModal
          link="https://mpago.li/2hvNVkH"
          planId="lifetime100"
          planName="Miembro de por vida + 2 Meses PRIME"
          priceUsd={100}
          copApprox={320000}
          lang={lang}
          onClose={() => setCardModalOpen(false)}
        />
      )}

      {/* Wallet payment modal — USDC on Base via Privy (card / connect wallet) */}
      {walletModalOpen && (
        <WalletPaymentModal
          s={s}
          lang={lang}
          onClose={() => setWalletModalOpen(false)}
        />
      )}

      {/* Dash Direct modal — copy address + email tx hash to support */}
      {dashModalOpen && (
        <DashPaymentModal
          s={s}
          onClose={() => setDashModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Wallet payment modal (USDC on Base via Privy) ─────────────────────────────
//
// Wraps the shared WalletPayCard in the /lifetime100 modal chrome. Requires an
// authenticated pnptv session (the parent gates the CTA button on
// useAuth().isAuthenticated) because /api/wallet/checkout/initiate is
// session-authed and needs to bind the checkout intent to a user row.

interface WalletPaymentModalProps {
  s: Lifetime100Strings;
  lang: string;
  onClose: () => void;
}

function WalletPaymentModal({ s, lang, onClose }: WalletPaymentModalProps) {
  const uiLang: "es" | "en" = lang.toLowerCase().startsWith("en") ? "en" : "es";
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ maxHeight: "85dvh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
          {s.walletModalTitle}
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#8E8E93", lineHeight: 1.5 }}>
          {s.walletModalSubtitle}
        </p>
        <WalletPayCard
          surface="prime"
          amountUsd={LIFETIME100_PRICE_USD}
          entitlementSpec={{ planId: LIFETIME100_PLAN_ID }}
          metadata={{ source: "lifetime100_page", planId: LIFETIME100_PLAN_ID }}
          label={s.walletPayLabel}
          lang={uiLang}
          onSuccess={() => {
            onClose();
            setTimeout(() => { window.location.href = "/"; }, 1200);
          }}
          compact
        />
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "12px 20px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            color: "#cfcfd4",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {s.cryptoCancel}
        </button>
      </div>
    </ModalOverlay>
  );
}

// ── Dash Direct modal ─────────────────────────────────────────────────────────
//
// Manual activation flow: user copies the address, sends ≈ $100 of Dash, then
// emails the tx hash + their email to support@pnptv.app so we can grant the
// lifetime entitlement. Public — no session required.

interface DashPaymentModalProps {
  s: Lifetime100Strings;
  onClose: () => void;
}

function DashPaymentModal({ s, onClose }: DashPaymentModalProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(DASH_ADDRESS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — user can still long-press to copy.
    }
  };
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ maxHeight: "85dvh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
          {s.dashModalTitle}
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#e5e5ea", lineHeight: 1.5 }}>
          {s.dashModalBody}
        </p>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(8,145,178,0.35)",
            padding: "10px 12px",
            borderRadius: 10,
            wordBreak: "break-all",
            userSelect: "all",
            color: "#e5e5ea",
            marginBottom: 10,
          }}
        >
          {DASH_ADDRESS}
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#8E8E93" }}>
          {s.dashCurrentPrice}{" "}
          <a
            href="https://www.coingecko.com/en/coins/dash"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#22d3ee", textDecoration: "underline" }}
          >
            coingecko.com/dash
          </a>
        </p>
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            fontSize: 12,
            color: "#cfcfd4",
            lineHeight: 1.5,
            marginBottom: 14,
          }}
        >
          {s.dashAfterPay}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: "linear-gradient(90deg, #0891b2, #164e63)",
            border: "none",
            borderRadius: 12,
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {copied ? "✓" : s.dashCopyAddress}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "12px 20px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            color: "#cfcfd4",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {s.cryptoCancel}
        </button>
      </div>
    </ModalOverlay>
  );
}

// ── Bottom nav + legal footer (mirrors LandingPage.tsx style) ─────────────────
// Pills deep-link to /landing?sheet=X so the user lands on the relevant bottom
// sheet on the main Landing page.

const NAV_ITEMS = [
  { id: "about",    emoji: "👋", label: "About" },
  { id: "feed",     emoji: "📣", label: "Feed" },
  { id: "hangouts", emoji: "🎙️", label: "Hangouts" },
  { id: "live",     emoji: "🔴", label: "Live" },
  { id: "nearby",   emoji: "📍", label: "Connect" },
  { id: "creators", emoji: "💰", label: "Creators" },
  { id: "payments", emoji: "💳", label: "Payments" },
  { id: "safety",   emoji: "🛡️", label: "Safety" },
] as const;

const LEGAL_LINKS = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "Content Policy", href: "/content-policy" },
  { label: "DMCA", href: "/dmca" },
  { label: "Refunds", href: "/refunds" },
  { label: "Contact", href: "/contact" },
];

function NavFooter({ onOpenSheet }: { onOpenSheet: (id: string) => void }) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        background: "rgba(18, 13, 20, 0.92)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <nav style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }} aria-label="Explore PNPtv">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 48, width: "max-content" }}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenSheet(item.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#cfcfd4",
                cursor: "pointer",
                flexShrink: 0,
                background: "transparent",
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#ffffff";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#cfcfd4";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
            >
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          columnGap: 12,
          rowGap: 2,
          padding: "8px 16px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        {LEGAL_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            style={{
              fontSize: 10,
              color: "rgba(207,207,212,0.4)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#cfcfd4"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(207,207,212,0.4)"; }}
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Bottom-sheet modal (mirrors LandingPage's sheet) ──────────────────────────
// Lets pills open sheet content IN-PLACE so the user stays on /lifetime100.

interface SheetModalProps {
  sheet: { title: string; emoji: string; body: React.ReactNode };
  onClose: () => void;
}

function SheetModal({ sheet, onClose }: SheetModalProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] glass-nav border-t border-pnp-border rounded-t-2xl overflow-y-auto animate-fade-in-up"
        style={{ maxHeight: "70dvh", animationDuration: "0.2s" }}
        role="dialog"
        aria-label={sheet.title}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-pnp-border" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-pnp-border sticky top-0 glass-nav">
          <div className="flex items-center gap-2">
            <span className="text-xl">{sheet.emoji}</span>
            <h2 className="text-sm font-bold text-white">{sheet.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-pnp-textSecondary hover:text-white hover:bg-pnp-surface transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4">{sheet.body}</div>
        <div className="px-4 pb-6">
          <Link
            to="/join"
            onClick={onClose}
            className="btn-gradient block w-full text-center py-3 rounded-xl text-sm font-bold text-white"
          >
            Join free →
          </Link>
        </div>
      </div>
    </>
  );
}

// ── NequiNegociosPage ─────────────────────────────────────────────────────────
//
// Post-payment landing that Wompi redirects to after the buyer pays via the
// reusable Nequi Negocios link. Wompi appends:
//   ?status=APPROVED|PENDING|DECLINED  ?reference=xxx  ?id=xxx
//
// The buyer enters their email → POST /api/public/nequinegocios/register.
// Admin gets a Slack notification, verifies in the Wompi dashboard, then
// grants access via the admin panel (Admin → Meru Links → Nequi tab).

export function NequiNegociosPage() {
  const [searchParams] = useSearchParams();
  const wompiStatus        = searchParams.get("status")    || "";
  const wompiReference     = searchParams.get("reference") || "";
  const wompiTransactionId = searchParams.get("id")        || "";

  const isApproved = wompiStatus === "APPROVED";
  const isDeclined = wompiStatus === "DECLINED" || wompiStatus === "ERROR";

  const [lang, setLang]         = useState(getInitialLang);
  const s                       = useLifetime100Strings(lang);
  const [email, setEmail]       = useState("");
  const [submitting, setSubmit] = useState(false);
  const [submitted, setDone]    = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    document.title = s.nequiPageTitle;
  }, [s.nequiPageTitle]);

  const handleLangChange = (next: string) => {
    setLang(next);
    persistLang(next);
  };

  const handleRegister = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) { setError(s.invalidEmail); return; }
    setSubmit(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/nequinegocios/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          wompiReference:     wompiReference     || null,
          wompiTransactionId: wompiTransactionId || null,
          wompiStatus:        wompiStatus        || null,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || s.errorGeneric); return; }
      setDone(true);
    } catch {
      setError(s.errorGeneric);
    } finally {
      setSubmit(false);
    }
  };

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#120d14",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    overflowX: "hidden",
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(44,44,46,0.85)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,180,84,0.3)",
    borderRadius: 24,
    padding: "28px 24px",
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
  };

  // ── Declined state ──────────────────────────────────────────────────────────
  if (isDeclined) {
    return (
      <div style={pageStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px" }}>
          <a href="/" aria-label="PNPtv! home"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 36 }} /></a>
          <LangToggle lang={lang} onChange={handleLangChange} />
        </header>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={cardStyle}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,69,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, textAlign: "center" }}>{s.nequiDeclinedTitle}</h1>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 1.5 }}>{s.nequiDeclinedBody}</p>
            <a
              href="/lifetime100"
              style={{ display: "block", textAlign: "center", padding: "14px 20px", borderRadius: 14, border: "none", background: "linear-gradient(90deg,#ff3377,#ff9933)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
            >
              Volver a intentar
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Success — submitted email ───────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={pageStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px" }}>
          <a href="/" aria-label="PNPtv! home"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 36 }} /></a>
          <LangToggle lang={lang} onChange={handleLangChange} />
        </header>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={cardStyle}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,153,51,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#ff9933" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, textAlign: "center" }}>{s.nequiDoneTitle}</h1>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 1.5 }}>{s.nequiDoneBody}</p>
            <a
              href="/lifetime100/activate"
              style={{ display: "block", textAlign: "center", padding: "12px 16px", borderRadius: 12, background: "rgba(255,180,84,0.12)", border: "1px solid rgba(255,180,84,0.3)", color: "#FFB454", fontSize: 13, fontWeight: 600, textDecoration: "none", marginBottom: 12 }}
            >
              {s.nequiActivateLink}
            </a>
            <button
              onClick={() => setDone(false)}
              style={{ display: "block", width: "100%", padding: "10px", background: "none", border: "none", color: "#8E8E93", fontSize: 13, cursor: "pointer" }}
            >
              {s.nequiTryAgain}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Email capture form ──────────────────────────────────────────────────────
  const title = isApproved ? s.nequiSuccessTitle : s.nequiPendingTitle;
  const body  = isApproved ? s.nequiSuccessBody  : s.nequiPendingBody;
  const iconColor = isApproved ? "#ff9933" : "#8E8E93";
  const iconPath  = isApproved
    ? "M5 13l4 4L19 7"
    : "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

  return (
    <div style={pageStyle}>
      {/* Ambient glow */}
      <div aria-hidden="true" style={{ position: "fixed", top: "-20%", left: "50%", transform: "translateX(-50%)", width: "100vw", height: "100vw", background: "radial-gradient(circle, rgba(255,153,51,0.10) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <header style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px" }}>
        <a href="/" aria-label="PNPtv! home"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 36 }} /></a>
        <LangToggle lang={lang} onChange={handleLangChange} />
      </header>

      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px 80px" }}>
        <div style={cardStyle}>
          {/* Top gradient stripe */}
          <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 4, background: "linear-gradient(90deg,#ff3377,#ff9933)", borderRadius: "24px 24px 0 0" }} />

          {/* Icon */}
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: `rgba(255,153,51,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "8px auto 20px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={iconPath} />
            </svg>
          </div>

          <h1 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 900, textAlign: "center" }}>{title}</h1>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 1.5 }}>{body}</p>

          {/* Email form */}
          <label htmlFor="nq-email" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 6 }}>
            {s.nequiEmailLabel}
          </label>
          <input
            id="nq-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
            placeholder="tu@correo.com"
            disabled={submitting}
            style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 16, marginBottom: 10, outline: "none", opacity: submitting ? 0.6 : 1 }}
            aria-invalid={!!error}
          />

          {error && (
            <p role="alert" style={{ margin: "0 0 14px", fontSize: 13, color: "#FF453A" }}>{error}</p>
          )}

          <button
            onClick={handleRegister}
            disabled={submitting || !email.trim()}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "15px 20px", borderRadius: 13, border: "none", background: submitting || !email.trim() ? "rgba(255,51,119,0.4)" : "linear-gradient(90deg,#ff3377,#ff9933)", color: "#fff", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", cursor: submitting || !email.trim() ? "not-allowed" : "pointer", minHeight: 50 }}
          >
            {submitting && <Spinner size={16} />}
            {submitting ? s.nequiSubmitting : s.nequiSubmit}
          </button>

          {/* Already have a code */}
          <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#8E8E93" }}>
            {s.alreadyPaid}{" "}
            <a href="/lifetime100/activate" style={{ color: "#ff9933", fontWeight: 600, borderBottom: "1px solid rgba(255,153,51,0.5)", textDecoration: "none" }}>
              {s.alreadyPaidLink}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── MercadoPagoPage ───────────────────────────────────────────────────────────
//
// Post-payment landing after the buyer pays via the mpago.li hosted link
// (https://mpago.li/2hvNVkH, ~320,000 COP ≈ $100 USD). MercadoPago appends
// query params when back_urls are configured on the preference:
//   ?collection_status=approved|pending|rejected  ?payment_id=xxx  ?external_reference=xxx
// If no back_urls, the buyer clicks "Ya pagué" on /lifetime100 to land here.
//
// Buyer enters email → POST /api/public/mercadopago/register → admin gets a
// Slack alert, verifies in the MercadoPago dashboard, then grants access via
// POST /api/webapp/admin/mercadopago/:id/activate.

export function MercadoPagoPage() {
  const [searchParams] = useSearchParams();
  const mpStatus         = (searchParams.get("collection_status") || searchParams.get("status") || "").toLowerCase();
  const mpReference      = searchParams.get("external_reference") || searchParams.get("reference") || "";
  const urlOpNumber      = searchParams.get("payment_id") || searchParams.get("collection_id") || searchParams.get("id") || "";
  const planId           = searchParams.get("planId") || "lifetime100";

  const isApproved = mpStatus === "approved";
  const isDeclined = mpStatus === "rejected" || mpStatus === "cancelled" || mpStatus === "error";

  const [lang, setLang]           = useState(getInitialLang);
  const s                         = useLifetime100Strings(lang);
  const [email, setEmail]         = useState("");
  const [opNumber, setOpNumber]   = useState(urlOpNumber);
  const [submitting, setSubmit]   = useState(false);
  const [submitted, setDone]      = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    document.title = s.mpagoPageTitle;
  }, [s.mpagoPageTitle]);

  const handleLangChange = (next: string) => {
    setLang(next);
    persistLang(next);
  };

  const handleRegister = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) { setError(s.invalidEmail); return; }
    const opTrim = opNumber.replace(/\s+/g, "").trim();
    if (opTrim.length < 6 || opTrim.length > 40 || !/^[A-Za-z0-9\-_]+$/.test(opTrim)) {
      setError(lang.startsWith("en")
        ? "Enter your MercadoPago operation number (~12 digits)."
        : "Ingresa tu número de operación de MercadoPago (aprox. 12 dígitos).");
      return;
    }
    setSubmit(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/mercadopago/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          planId,
          mpReference:     mpReference || null,
          mpTransactionId: opTrim,
          mpStatus:        mpStatus || null,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || s.errorGeneric); return; }
      setDone(true);
    } catch {
      setError(s.errorGeneric);
    } finally {
      setSubmit(false);
    }
  };

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#120d14",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    overflowX: "hidden",
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(44,44,46,0.85)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,180,84,0.3)",
    borderRadius: 24,
    padding: "28px 24px",
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
  };

  if (isDeclined) {
    return (
      <div style={pageStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px" }}>
          <a href="/" aria-label="PNPtv! home"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 36 }} /></a>
          <LangToggle lang={lang} onChange={handleLangChange} />
        </header>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={cardStyle}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,69,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, textAlign: "center" }}>{s.mpagoDeclinedTitle}</h1>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 1.5 }}>{s.mpagoDeclinedBody}</p>
            <a
              href="/lifetime100"
              style={{ display: "block", textAlign: "center", padding: "14px 20px", borderRadius: 14, border: "none", background: "linear-gradient(90deg,#ff3377,#ff9933)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
            >
              {s.nequiTryAgain}
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={pageStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px" }}>
          <a href="/" aria-label="PNPtv! home"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 36 }} /></a>
          <LangToggle lang={lang} onChange={handleLangChange} />
        </header>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={cardStyle}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,153,51,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#ff9933" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, textAlign: "center" }}>{s.mpagoDoneTitle}</h1>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 1.5 }}>{s.mpagoDoneBody}</p>
            <a
              href="/lifetime100/activate"
              style={{ display: "block", textAlign: "center", padding: "12px 16px", borderRadius: 12, background: "rgba(255,180,84,0.12)", border: "1px solid rgba(255,180,84,0.3)", color: "#FFB454", fontSize: 13, fontWeight: 600, textDecoration: "none", marginBottom: 12 }}
            >
              {s.mpagoActivateLink}
            </a>
            <button
              onClick={() => setDone(false)}
              style={{ display: "block", width: "100%", padding: "10px", background: "none", border: "none", color: "#8E8E93", fontSize: 13, cursor: "pointer" }}
            >
              {s.mpagoTryAgain}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = isApproved ? s.mpagoSuccessTitle : s.mpagoPendingTitle;
  const body  = isApproved ? s.mpagoSuccessBody  : s.mpagoPendingBody;
  const iconColor = isApproved ? "#ff9933" : "#8E8E93";
  const iconPath  = isApproved
    ? "M5 13l4 4L19 7"
    : "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

  return (
    <div style={pageStyle}>
      <div aria-hidden="true" style={{ position: "fixed", top: "-20%", left: "50%", transform: "translateX(-50%)", width: "100vw", height: "100vw", background: "radial-gradient(circle, rgba(255,153,51,0.10) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <header style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px" }}>
        <a href="/" aria-label="PNPtv! home"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 36 }} /></a>
        <LangToggle lang={lang} onChange={handleLangChange} />
      </header>

      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px 80px" }}>
        <div style={cardStyle}>
          <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 4, background: "linear-gradient(90deg,#ff3377,#ff9933)", borderRadius: "24px 24px 0 0" }} />

          <div style={{ width: 64, height: 64, borderRadius: "50%", background: `rgba(255,153,51,0.15)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "8px auto 20px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={iconPath} />
            </svg>
          </div>

          <h1 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 900, textAlign: "center" }}>{title}</h1>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 1.5 }}>{body}</p>

          <label htmlFor="mp-email" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 6 }}>
            {s.mpagoEmailLabel}
          </label>
          <input
            id="mp-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder="tu@correo.com"
            disabled={submitting}
            style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 16, marginBottom: 14, outline: "none", opacity: submitting ? 0.6 : 1 }}
            aria-invalid={!!error}
          />

          <label htmlFor="mp-op" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 4 }}>
            {lang.startsWith("en") ? "MercadoPago operation number" : "Número de operación de MercadoPago"}
          </label>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#8E8E93", lineHeight: 1.5 }}>
            {lang.startsWith("en")
              ? "The ~12-digit number MercadoPago shows after your payment (e.g. 172521754472)."
              : "El número (~12 dígitos) que MercadoPago te muestra tras pagar (ej: 172521754472)."}
          </p>
          <input
            id="mp-op"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={opNumber}
            onChange={(e) => { setOpNumber(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
            placeholder="172521754472"
            disabled={submitting}
            style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.3)", color: "#fff", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 16, letterSpacing: "0.06em", marginBottom: 10, outline: "none", opacity: submitting ? 0.6 : 1 }}
            aria-invalid={!!error}
          />

          {error && (
            <p role="alert" style={{ margin: "0 0 14px", fontSize: 13, color: "#FF453A" }}>{error}</p>
          )}

          <button
            onClick={handleRegister}
            disabled={submitting || !email.trim() || !opNumber.trim()}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "15px 20px", borderRadius: 13, border: "none", background: submitting || !email.trim() || !opNumber.trim() ? "rgba(255,51,119,0.4)" : "linear-gradient(90deg,#ff3377,#ff9933)", color: "#fff", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", cursor: submitting || !email.trim() || !opNumber.trim() ? "not-allowed" : "pointer", minHeight: 50 }}
          >
            {submitting && <Spinner size={16} />}
            {submitting ? s.mpagoSubmitting : s.mpagoSubmit}
          </button>

          <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 13, color: "#8E8E93" }}>
            {s.alreadyPaid}{" "}
            <a href="/lifetime100/activate" style={{ color: "#ff9933", fontWeight: 600, borderBottom: "1px solid rgba(255,153,51,0.5)", textDecoration: "none" }}>
              {s.alreadyPaidLink}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Root page ──────────────────────────────────────────────────────────────────

export default function Lifetime100() {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Determine display mode
  const isActivatePath = location.pathname.includes("/activate");
  const modeParam = searchParams.get("mode");
  const codeParam = searchParams.get("code") || "";
  const isActivateMode = isActivatePath || modeParam === "activate" || !!codeParam;

  // Bottom-sheet state — pills open an in-place sheet instead of navigating
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  useEffect(() => {
    document.body.style.overflow = activeSheet ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [activeSheet]);
  const sheetData = activeSheet ? sheets[activeSheet] : null;

  // Language
  const [lang, setLang] = useState(getInitialLang);
  const s = useLifetime100Strings(lang);

  const handleLangChange = (next: string) => {
    setLang(next);
    persistLang(next);
  };

  // Availability (hero view only)
  const [available, setAvailable] = useState<number | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(!isActivateMode);

  useEffect(() => {
    document.title = s.pageTitle;
  }, [s.pageTitle]);

  useEffect(() => {
    if (isActivateMode) return;
    let cancelled = false;
    setAvailabilityLoading(true);
    fetch(`${API_BASE}/api/public/lifetime100/availability`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (typeof data.available === "number") {
          setAvailable(data.available);
        }
      })
      .catch(() => {
        // On error, don't block the CTA — treat as available
        if (!cancelled) setAvailable(null);
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => { cancelled = true; };
  }, [isActivateMode]);

  // Global keyframe injection (once)
  useEffect(() => {
    const STYLE_ID = "lt100-keyframes";
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes lt100-fadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to   { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      try { document.head.removeChild(style); } catch { /* already removed */ }
    };
  }, []);

  if (isActivateMode) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#120d14",
          color: "#ffffff",
          position: "relative",
          overflowX: "hidden",
          paddingBottom: 96, // clearance for fixed NavFooter
        }}
      >
        {/* Header with lang toggle */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
          }}
        >
          <a href="/" aria-label="PNPtv! home" style={{ display: "flex" }}>
            <img src="/logo-header.png" alt="PNPtv!" style={{ height: 36, width: "auto" }} />
          </a>
          <LangToggle lang={lang} onChange={handleLangChange} />
        </header>

        <ActivateView s={s} initialCode={codeParam} />
        <NavFooter onOpenSheet={setActiveSheet} />
        {sheetData && (
          <SheetModal sheet={sheetData} onClose={() => setActiveSheet(null)} />
        )}
      </div>
    );
  }

  return (
    <>
    <HeroView
      s={s}
      available={available}
      availabilityLoading={availabilityLoading}
      lang={lang}
      onLangChange={handleLangChange}
      onOpenSheet={setActiveSheet}
    />
    {sheetData && (
      <SheetModal sheet={sheetData} onClose={() => setActiveSheet(null)} />
    )}
    </>
  );
}
