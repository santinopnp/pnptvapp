import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { requestRefund } from "@/lib/api";

const LANG_KEY = "pnptv:lang";
function getLang(): "en" | "es" {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s === "en" || s === "es") return s;
  } catch { /* ignore */ }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

/**
 * /refund/request?paymentId=123 — file a 72h-review refund request for a
 * confirmed on-chain USDC payment. Links here come from support DMs, order
 * confirmations, or an admin/support agent — there's no in-app payment
 * history list yet, so paymentId always arrives via the query string.
 */
export default function RefundRequest() {
  const es = getLang() === "es";
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = Number(params.get("paymentId"));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validPaymentId = Number.isFinite(paymentId) && paymentId > 0;

  const submit = async () => {
    if (!validPaymentId) return;
    setBusy(true);
    setError(null);
    try {
      const { refund } = await requestRefund(paymentId, reason.trim() || undefined);
      navigate(`/refund/${refund.id}`, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /REFUND_ALREADY_EXISTS/.test(msg)
          ? (es ? "Ya existe una solicitud de reembolso para este pago." : "A refund request already exists for this payment.")
          : /PAYMENT_NOT_CONFIRMED/.test(msg)
            ? (es ? "Este pago aún no está confirmado en la blockchain." : "This payment isn't confirmed on-chain yet.")
            : /PAYMENT_NOT_FOUND/.test(msg)
              ? (es ? "No encontramos ese pago en tu cuenta." : "We couldn't find that payment on your account.")
              : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-pnp-bg px-4 py-8 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-white mb-1">
        {es ? "Solicitar reembolso" : "Request a refund"}
      </h1>
      <p className="text-sm text-pnp-textSecondary mb-6">
        {es
          ? "Revisamos cada solicitud manualmente dentro de 72 horas. Te avisaremos por DM en cuanto haya una decisión."
          : "Every request is reviewed manually within 72 hours. We'll DM you as soon as there's a decision."}
      </p>

      {!validPaymentId ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {es ? "Falta el identificador del pago." : "Missing payment identifier."}
        </div>
      ) : (
        <>
          <label className="block text-xs font-semibold text-white/70 mb-1.5">
            {es ? "Motivo (opcional)" : "Reason (optional)"}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 2000))}
            rows={4}
            placeholder={es ? "Cuéntanos qué pasó…" : "Tell us what happened…"}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white placeholder:text-white/30 mb-4 resize-none focus:outline-none focus:border-emerald-400/50"
          />
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 mb-4">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: busy ? "#333" : "linear-gradient(135deg,#10b981,#059669)" }}
          >
            {busy ? (es ? "Enviando…" : "Submitting…") : (es ? "Enviar solicitud" : "Submit request")}
          </button>
        </>
      )}
    </div>
  );
}
