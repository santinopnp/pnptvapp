import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

interface Buyer {
  id: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  isPnptvFam: boolean;
  isInnerCircle: boolean;
}

interface Booking {
  id: string;
  serviceId: number;
  serviceType: string;
  priceCents: number;
  status: "pending" | "paid" | "fulfilled" | "cancelled" | "refunded";
  buyerNote: string | null;
  paymentProvider: string;
  paymentRef: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  expiresAt: string | null;
  buyer: Buyer;
}

const SERVICE_LABEL: Record<string, string> = {
  private_call: "Private Call",
  custom_content: "Custom Content",
  priority_dm: "Priority DM",
  private_main_stage: "Private Main Stage",
  bts_subscription: "BTS Subscription",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function relativeDays(iso: string | null): string {
  if (!iso) return "";
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days > 0) return `in ${days}d`;
  if (days < 0) return `${-days}d overdue`;
  return "today";
}

/**
 * Creator dashboard tab: manage inbound Crystal Service bookings.
 * Lists paid + pending bookings with buyer info, note, deadline; provides
 * "Mark delivered" and "Cancel + refund" actions per row.
 */
export default function CrystalServiceBookings() {
  const t = useI18n();
  const es = t.lang === "es";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/creator/services/bookings", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setBookings(Array.isArray(j?.bookings) ? j.bookings : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(bookingId: string, newStatus: "fulfilled" | "cancelled") {
    if (newStatus === "cancelled") {
      const ok = window.confirm(es
        ? "¿Cancelar esta reserva? El fan recibirá un reembolso (procesado manualmente por soporte)."
        : "Cancel this booking? The fan will get a refund (processed manually by support).");
      if (!ok) return;
    }
    setBusyId(bookingId);
    try {
      let fulfillmentNote: string | null = null;
      if (newStatus === "fulfilled") {
        fulfillmentNote = window.prompt(es
          ? "Nota para el fan (opcional) — enlace, mensaje o detalle de entrega:"
          : "Note to the fan (optional) — delivery link, message, or detail:", "") || null;
      }
      const r = await fetch(`/api/creator/services/bookings/${bookingId}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, fulfillmentNote }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      window.alert((es ? "Error: " : "Error: ") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId(null);
    }
  }

  const paidBookings = bookings.filter((b) => b.status === "paid");
  const pendingBookings = bookings.filter((b) => b.status === "pending");

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-black" style={{ color: "#f5f0ff" }}>
          {es ? "Reservas Crystal Services" : "Crystal Service bookings"}
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(245,240,255,0.7)" }}>
          {es
            ? "Fans que compraron uno de tus servicios premium. Márcalo como entregado cuando termines."
            : "Fans who purchased one of your premium services. Mark each as delivered when done."}
        </p>
      </header>

      {loading && (
        <p className="text-center text-sm py-8" style={{ color: "rgba(245,240,255,0.6)" }}>
          {es ? "Cargando…" : "Loading…"}
        </p>
      )}
      {error && (
        <p className="text-sm py-2 px-3 rounded-lg mb-4" style={{ background: "rgba(255,107,107,0.15)", color: "#ff6b6b" }}>
          {error}
        </p>
      )}
      {!loading && bookings.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(20,10,30,0.65)", border: "1px solid rgba(216,185,255,0.2)" }}>
          <p className="text-2xl mb-2">💎</p>
          <p className="text-sm" style={{ color: "rgba(245,240,255,0.75)" }}>
            {es ? "Aún no tienes reservas pendientes." : "No pending bookings yet."}
          </p>
        </div>
      )}

      {[...pendingBookings, ...paidBookings].map((b) => {
        const overdue = b.expiresAt && new Date(b.expiresAt) <= new Date();
        return (
          <div
            key={b.id}
            className="rounded-2xl p-4 mb-3"
            style={{
              background: "rgba(20,10,30,0.65)",
              border: `1px solid ${overdue ? "rgba(255,107,107,0.5)" : "rgba(216,185,255,0.3)"}`,
            }}
          >
            <div className="flex items-start gap-3">
              <img
                src={b.buyer.photoUrl || "/uploads/avatars/default.webp"}
                alt=""
                className="w-11 h-11 rounded-full flex-shrink-0 object-cover bg-white/10"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: "#f5f0ff" }}>
                    @{b.buyer.username || b.buyer.firstName || b.buyer.id.slice(0, 6)}
                  </span>
                  {b.buyer.isPnptvFam && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(216,185,255,0.2)", color: "#d8b9ff" }}>PNP Fam</span>
                  )}
                  {b.buyer.isInnerCircle && !b.buyer.isPnptvFam && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(184,245,255,0.2)", color: "#b8f5ff" }}>Inner Circle</span>
                  )}
                </div>
                <div className="text-sm mt-1" style={{ color: "#d8b9ff" }}>
                  <span className="font-bold">{SERVICE_LABEL[b.serviceType] || b.serviceType}</span>
                  {" · "}
                  <span className="font-mono">${(b.priceCents / 100).toFixed(0)}</span>
                  {" · "}
                  <span className="text-[11px] opacity-70">{b.paymentProvider}</span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "rgba(245,240,255,0.6)" }}>
                  {es ? "Comprado" : "Purchased"} {fmtDate(b.createdAt)}
                  {b.expiresAt && (
                    <span style={{ color: overdue ? "#ff6b6b" : "#f59e0b", marginLeft: 8 }}>
                      · {es ? "Vence" : "Deadline"} {fmtDate(b.expiresAt)} <strong>({relativeDays(b.expiresAt)})</strong>
                    </span>
                  )}
                </div>
                {b.buyerNote && (
                  <div className="mt-2 p-2 rounded-lg text-[12px]" style={{ background: "rgba(0,0,0,0.35)", color: "#f5f0ff", border: "1px solid rgba(216,185,255,0.2)" }}>
                    <span className="opacity-60 text-[10px] uppercase tracking-wider block mb-1">{es ? "Nota del fan" : "Fan's note"}</span>
                    {b.buyerNote}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <button
                type="button"
                disabled={busyId === b.id || b.status !== "paid"}
                onClick={() => updateStatus(b.id, "cancelled")}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.06)", color: "#f5f0ff", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                {busyId === b.id ? "…" : (es ? "Cancelar" : "Cancel")}
              </button>
              <button
                type="button"
                disabled={busyId === b.id || b.status !== "paid"}
                onClick={() => updateStatus(b.id, "fulfilled")}
                className="px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", boxShadow: "0 2px 8px rgba(16,185,129,0.35)" }}
              >
                {busyId === b.id ? "…" : (es ? "Marcar entregado" : "Mark delivered")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
