import React, { useState, useEffect, useRef, useCallback } from "react";

// Shared MercadoPago (mpago.li hosted link) modal — used by /lifetime100 and
// each plan card on /subscribe. Two-step flow inside one modal:
//   1. Buyer enters email → clicks "Open MercadoPago" (also emails them the
//      payment link + step-by-step instructions in Spanish)
//   2. After paying on mpago.li in the new tab, buyer returns, enters the
//      12-digit "número de operación" MP shows on the confirmation screen,
//      clicks "Ya pagué — activar" → admin gets a Slack ping and activates
//      via /admin/manual-activations.

const API_BASE = import.meta.env.VITE_API_URL || "https://pnptv.app";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function Spinner({ size = 16 }: { size?: number }) {
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

export interface CardPaymentModalProps {
  /** mpago.li hosted checkout URL for this specific plan */
  link: string;
  /** plan_id sent to backend for correct grant dispatch */
  planId: string;
  /** Human-readable plan name (Spanish preferred) shown in modal + email */
  planName: string;
  /** USD equivalent (shown in copy) */
  priceUsd: number;
  /** Approximate COP amount MercadoPago will charge */
  copApprox: number;
  /** Language for UI copy (es | en) */
  lang?: string;
  onClose: () => void;
}

type Step = "form" | "submitted";

interface CardStrings {
  title: string;
  bodyIntro: string;      // "You'll be redirected... will charge ~X COP"
  emailLabel: string;
  emailPlaceholder: string;
  emailInvalid: string;
  emailLinkButton: string;       // "📧 Email me the link + instructions"
  emailLinkButtonSending: string;
  emailLinkSent: string;         // banner: "Payment link sent to your inbox ✓"
  openMpButton: string;          // "💳 Pay now with MercadoPago"
  opNumberSection: string;       // "¿Ya pagaste? Ingresa tu número de operación"
  opNumberHelp: string;          // "MercadoPago te muestra este número..."
  opNumberLabel: string;
  opNumberPlaceholder: string;
  opNumberInvalid: string;
  submitButton: string;          // "✅ Ya pagué — activar"
  submitButtonSubmitting: string;
  submittedTitle: string;
  submittedBody: string;
  submittedActivateHint: string;
  cancel: string;
  errorGeneric: string;
}

const STRINGS_ES: CardStrings = {
  title: "Pagar con Tarjeta vía MercadoPago",
  bodyIntro: "MercadoPago cobra en pesos colombianos. Después de pagar recibirás un número de operación — regresa aquí y pégalo abajo para activar tu membresía.",
  emailLabel: "Tu correo electrónico",
  emailPlaceholder: "tu@correo.com",
  emailInvalid: "Por favor ingresa un correo electrónico válido.",
  emailLinkButton: "📧 Envíame el link + instrucciones",
  emailLinkButtonSending: "Enviando…",
  emailLinkSent: "¡Enviado! Revisa tu correo (también revisa spam).",
  openMpButton: "💳 Pagar ahora con MercadoPago",
  opNumberSection: "¿Ya pagaste?",
  opNumberHelp: "Después de pagar, MercadoPago muestra un número de operación (aprox. 12 dígitos, ej: 172521754472). Cópialo y pégalo aquí:",
  opNumberLabel: "Número de operación de MercadoPago",
  opNumberPlaceholder: "172521754472",
  opNumberInvalid: "Ingresa el número de operación (aprox. 12 dígitos).",
  submitButton: "✅ Ya pagué — activar mi membresía",
  submitButtonSubmitting: "Enviando…",
  submittedTitle: "¡Recibimos tu solicitud!",
  submittedBody: "Verificaremos tu pago en el panel de MercadoPago y activaremos tu membresía en pocas horas. Te enviaremos un correo de bienvenida cuando esté lista.",
  submittedActivateHint: "Si tienes preguntas, escríbenos a support@pnptv.app",
  cancel: "Cerrar",
  errorGeneric: "Algo salió mal. Por favor intenta de nuevo.",
};

const STRINGS_EN: CardStrings = {
  title: "Pay with Card via MercadoPago",
  bodyIntro: "MercadoPago charges in Colombian pesos. After paying you'll get an operation number — come back here and paste it below to activate your membership.",
  emailLabel: "Your email address",
  emailPlaceholder: "you@email.com",
  emailInvalid: "Please enter a valid email address.",
  emailLinkButton: "📧 Email me the link + instructions",
  emailLinkButtonSending: "Sending…",
  emailLinkSent: "Sent! Check your inbox (also check spam).",
  openMpButton: "💳 Pay now with MercadoPago",
  opNumberSection: "Already paid?",
  opNumberHelp: "After paying, MercadoPago shows an operation number (~12 digits, e.g. 172521754472). Copy it and paste it here:",
  opNumberLabel: "MercadoPago operation number",
  opNumberPlaceholder: "172521754472",
  opNumberInvalid: "Enter the operation number (~12 digits).",
  submitButton: "✅ I paid — activate my membership",
  submitButtonSubmitting: "Sending…",
  submittedTitle: "Got your request!",
  submittedBody: "We'll verify your payment in the MercadoPago dashboard and activate your membership within a few hours. You'll get a welcome email once it's live.",
  submittedActivateHint: "Questions? Reach us at support@pnptv.app",
  cancel: "Close",
  errorGeneric: "Something went wrong. Please try again.",
};

function pickStrings(lang?: string): CardStrings {
  return (lang || "es").toLowerCase().startsWith("en") ? STRINGS_EN : STRINGS_ES;
}

export function CardPaymentModal({
  link,
  planId,
  planName,
  priceUsd,
  copApprox,
  lang,
  onClose,
}: CardPaymentModalProps) {
  const s = pickStrings(lang);
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [opNumber, setOpNumber] = useState("");
  const [emailLinkStatus, setEmailLinkStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => emailInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const emailLink = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) { setError(s.emailInvalid); return false; }
    setEmailLinkStatus("sending");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/mercadopago/email-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, planId }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || s.errorGeneric); setEmailLinkStatus("idle"); return false; }
      setEmailLinkStatus("sent");
      return true;
    } catch {
      setError(s.errorGeneric);
      setEmailLinkStatus("idle");
      return false;
    }
  }, [email, planId, s]);

  // Clicking "Open MercadoPago" fires the email-link fire-and-forget (best
  // effort — buyer might have closed their email tab), then opens mpago.li
  // in a new tab so they can pay. We do NOT block on the email sending.
  const openMp = () => {
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) { setError(s.emailInvalid); emailInputRef.current?.focus(); return; }
    // Fire email + open link in parallel.
    void emailLink();
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const submitOp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) { setError(s.emailInvalid); return; }
    const opTrim = opNumber.replace(/\s+/g, "").trim();
    if (opTrim.length < 6 || opTrim.length > 40 || !/^[A-Za-z0-9\-_]+$/.test(opTrim)) {
      setError(s.opNumberInvalid); return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/mercadopago/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, planId, mpTransactionId: opTrim }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || s.errorGeneric); return; }
      setStep("submitted");
    } catch {
      setError(s.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

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
          background: "rgba(44,44,46,0.94)",
          border: "1px solid rgba(0,158,227,0.35)",
          borderRadius: 24,
          padding: "24px 22px",
          width: "100%",
          maxWidth: 460,
          maxHeight: "88dvh",
          overflowY: "auto",
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        {step === "submitted" ? (
          <>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "8px auto 16px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#ffffff", textAlign: "center" }}>
              {s.submittedTitle}
            </h2>
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "#d0d0d5", lineHeight: 1.55, textAlign: "center" }}>
              {s.submittedBody}
            </p>
            <p style={{ margin: "0 0 20px", fontSize: 12, color: "#8E8E93", lineHeight: 1.55, textAlign: "center" }}>
              {s.submittedActivateHint}
            </p>
            <button
              onClick={onClose}
              style={{
                display: "block", width: "100%", padding: "13px 20px", borderRadius: 12,
                border: "none", background: "linear-gradient(90deg,#009EE3,#00B4E6)",
                color: "#ffffff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", minHeight: 48,
              }}
            >
              {s.cancel}
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#ffffff" }}>
              {s.title}
            </h2>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#5EC4FF", fontWeight: 600 }}>
              {planName} · ${priceUsd.toFixed(2)} USD ≈ {copApprox.toLocaleString("es-CO")} COP
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#8E8E93", lineHeight: 1.5 }}>
              {s.bodyIntro}
            </p>

            {/* Email */}
            <label htmlFor="mp-email" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 6 }}>
              {s.emailLabel}
            </label>
            <input
              id="mp-email"
              ref={emailInputRef}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); if (emailLinkStatus === "sent") setEmailLinkStatus("idle"); }}
              placeholder={s.emailPlaceholder}
              style={{
                display: "block", width: "100%", boxSizing: "border-box",
                padding: "12px 14px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.3)", color: "#ffffff",
                fontSize: 16, marginBottom: 10, outline: "none",
              }}
            />

            {/* Action buttons — Open MP (primary) + Email me the link (secondary) */}
            <button
              type="button"
              onClick={openMp}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                background: "linear-gradient(90deg,#009EE3,#00B4E6)",
                color: "#ffffff", fontSize: 14, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.05em",
                cursor: "pointer", minHeight: 48, boxSizing: "border-box",
                boxShadow: "0 6px 20px rgba(0,158,227,0.35)",
              }}
            >
              {s.openMpButton}
            </button>

            <button
              type="button"
              onClick={() => void emailLink()}
              disabled={emailLinkStatus === "sending"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "10px 14px", marginTop: 8, borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.04)",
                color: "#cfcfd4", fontSize: 12, fontWeight: 600,
                cursor: emailLinkStatus === "sending" ? "not-allowed" : "pointer",
                minHeight: 40,
              }}
            >
              {emailLinkStatus === "sending" && <Spinner size={12} />}
              {emailLinkStatus === "sending"
                ? s.emailLinkButtonSending
                : emailLinkStatus === "sent"
                ? `✓ ${s.emailLinkSent}`
                : s.emailLinkButton}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 14px" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8E8E93", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {s.opNumberSection}
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
            </div>

            {/* Op number */}
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#8E8E93", lineHeight: 1.5 }}>
              {s.opNumberHelp}
            </p>
            <label htmlFor="mp-op" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8E8E93", marginBottom: 6 }}>
              {s.opNumberLabel}
            </label>
            <input
              id="mp-op"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={opNumber}
              onChange={(e) => { setOpNumber(e.target.value); setError(null); }}
              placeholder={s.opNumberPlaceholder}
              style={{
                display: "block", width: "100%", boxSizing: "border-box",
                padding: "12px 14px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.3)", color: "#ffffff",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: 16, letterSpacing: "0.06em",
                marginBottom: 10, outline: "none",
              }}
            />

            {error && (
              <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#FF453A" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={submitOp}
              disabled={submitting || !email.trim() || !opNumber.trim()}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                background: submitting || !email.trim() || !opNumber.trim()
                  ? "rgba(212,0,122,0.45)"
                  : "linear-gradient(90deg,#D4007A,#FF3377)",
                color: "#ffffff", fontSize: 14, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.05em",
                cursor: submitting || !email.trim() || !opNumber.trim() ? "not-allowed" : "pointer",
                minHeight: 48,
              }}
            >
              {submitting && <Spinner size={14} />}
              {submitting ? s.submitButtonSubmitting : s.submitButton}
            </button>

            <button
              onClick={onClose}
              style={{
                display: "block", width: "100%", marginTop: 8, padding: "10px",
                background: "none", border: "none", color: "#8E8E93",
                fontSize: 13, cursor: "pointer", minHeight: 40,
              }}
            >
              {s.cancel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default CardPaymentModal;
