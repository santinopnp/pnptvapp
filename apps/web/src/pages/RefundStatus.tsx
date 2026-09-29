import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { usePrivy, useSignMessage, useWallets } from "@privy-io/react-auth";
import { getRefund, signRefundDenial, type RefundRecord } from "@/lib/api";

const LANG_KEY = "pnptv:lang";
function getLang(): "en" | "es" {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s === "en" || s === "es") return s;
  } catch { /* ignore */ }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

function StatusPill({ status }: { status: RefundRecord["status"] }) {
  const cls =
    status === "approved" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
    status === "denied" ? "bg-red-500/15 text-red-300 border-red-500/30" :
    "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cls}`}>
      {status === "approved" ? "Approved" : status === "denied" ? "Denied" : "Pending review"}
    </span>
  );
}

/**
 * /refund/:refundId — poll a refund's status. Once denied, the user must
 * blockchain-sign (Privy embedded/linked wallet — never email) a denial
 * acknowledgement before the case closes, per refundService.getDenialMessage.
 */
export default function RefundStatus() {
  const es = getLang() === "es";
  const { refundId } = useParams<{ refundId: string }>();
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();

  const [refund, setRefund] = useState<RefundRecord | null>(null);
  const [denialMessage, setDenialMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const fetchRefund = useCallback(async () => {
    if (!refundId) return;
    try {
      const res = await getRefund(Number(refundId));
      setRefund(res.refund);
      setDenialMessage(res.denialMessageToSign || null);
      setLoadError(null);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refundId]);

  useEffect(() => {
    fetchRefund();
    // Poll every 15s while pending so a decision shows up without a manual refresh.
    const iv = setInterval(() => {
      if (refund?.status === "pending" || !refund) fetchRefund();
    }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRefund]);

  const handleSign = async () => {
    if (!refund || !denialMessage) return;
    if (!authenticated) { login(); return; }
    const wallet = wallets[0];
    if (!wallet) {
      setSignError(es ? "No encontramos tu billetera. Recarga la página." : "Couldn't find your wallet. Please reload.");
      return;
    }
    setSigning(true);
    setSignError(null);
    try {
      const { signature } = await signMessage({ message: denialMessage }, { address: wallet.address });
      const res = await signRefundDenial(refund.id, signature);
      setRefund(res.refund);
      setDenialMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/user rejected|cancel/i.test(msg)) {
        setSignError(es ? "No se pudo firmar. Intenta de nuevo." : "Could not sign. Please try again.");
      }
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-pnp-bg flex items-center justify-center text-sm text-pnp-textSecondary">
      {es ? "Cargando…" : "Loading…"}
    </div>;
  }

  if (loadError || !refund) {
    return (
      <div className="min-h-screen bg-pnp-bg px-4 py-8 max-w-lg mx-auto">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {loadError || (es ? "Reembolso no encontrado." : "Refund not found.")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pnp-bg px-4 py-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-white">
          {es ? `Reembolso #${refund.id}` : `Refund #${refund.id}`}
        </h1>
        <StatusPill status={refund.status} />
      </div>
      <p className="text-sm text-pnp-textSecondary mb-6">
        ${refund.amount_usd} USDC · {es ? "pago" : "payment"} #{refund.payment_id}
      </p>

      {refund.status === "pending" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {es
            ? "Tu solicitud está en revisión manual. Te avisaremos por DM dentro de 72 horas."
            : "Your request is under manual review. We'll DM you within 72 hours."}
        </div>
      )}

      {refund.status === "approved" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
          <p className="text-sm text-emerald-200 font-semibold">
            {es ? "Reembolso enviado ✅" : "Refund sent ✅"}
          </p>
          {refund.tx_hash && (
            <a
              href={`https://basescan.org/tx/${refund.tx_hash}`}
              target="_blank" rel="noopener noreferrer"
              className="block text-[11px] text-emerald-300/80 hover:text-emerald-200 underline underline-offset-2 font-mono truncate"
            >
              {refund.tx_hash.slice(0, 10)}…{refund.tx_hash.slice(-8)} ↗
            </a>
          )}
        </div>
      )}

      {refund.status === "denied" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-3">
          <div>
            <p className="text-sm text-red-200 font-semibold mb-1">
              {es ? "Solicitud negada" : "Request denied"}
            </p>
            <p className="text-xs text-red-200/80 leading-relaxed">
              {refund.denial_reasons || (es ? "No cumple con los criterios de reembolso." : "Doesn't meet the refund criteria.")}
            </p>
          </div>

          {refund.refund_denial_signed ? (
            <p className="text-xs text-white/60">
              {es ? "Acuse de recibo firmado. Caso cerrado." : "Denial acknowledgement signed. Case closed."}
            </p>
          ) : (
            <>
              <p className="text-xs text-white/70 leading-relaxed">
                {es
                  ? "Para cerrar el caso, firma con tu billetera (sin costo, sin gas) el acuse de recibo de esta decisión."
                  : "To close the case, sign the denial acknowledgement with your wallet (free, no gas)."}
              </p>
              {signError && (
                <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">{signError}</p>
              )}
              <button
                type="button"
                onClick={handleSign}
                disabled={signing}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: signing ? "#333" : "linear-gradient(135deg,#D4007A,#FF6B9D)" }}
              >
                {signing
                  ? (es ? "Firmando…" : "Signing…")
                  : !authenticated
                    ? (es ? "Entrar para firmar" : "Sign in to sign")
                    : (es ? "Firmar con mi billetera" : "Sign with my wallet")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
