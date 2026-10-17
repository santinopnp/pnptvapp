import React, { useEffect, useRef, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import type { CreatorStrings } from "@/lib/i18n/creator";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";
import {
  getParcheInfo,
  bookParcheCall,
  assertPaymentUrl,
  type ParcheDetail,
  type ParchePackage,
} from "@/lib/api";

// ── Payment step ──────────────────────────────────────────────────────────────
type PayStep = "idle" | "choosing" | "polling" | "success" | "error";

// ── Small spinner ─────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="animate-spin w-5 h-5"
      style={{ color: "#D4007A" }}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Member avatar strip (overlapping circles) ─────────────────────────────────
function MemberAvatarStrip({ parche }: { parche: ParcheDetail }) {
  const accepted = parche.members.filter((m) => m.inviteStatus === "accepted");
  const maxShow = Math.min(accepted.length, 5);
  return (
    <div className="relative" style={{ height: 56, width: Math.max(56, 28 + maxShow * 28) }}>
      {accepted.slice(0, maxShow).map((m, i) => {
        const initial = (m.displayName || "?").charAt(0).toUpperCase();
        return (
          <div
            key={m.id}
            className="absolute top-0 flex items-center justify-center rounded-full overflow-hidden text-white font-bold text-sm flex-shrink-0"
            style={{
              width: 56,
              height: 56,
              left: i * 28,
              zIndex: maxShow - i,
              background: "linear-gradient(135deg, #D4007A, #7B61FF)",
              border: "2.5px solid #0A0A0F",
            }}
          >
            {m.photoUrl
              ? <img src={m.photoUrl} alt={m.displayName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              : initial}
          </div>
        );
      })}
    </div>
  );
}

// ── NowPayments checkout for Parche ──────────────────────────────────────────
function NpParcheCheckout({
  parcheId,
  packageId,
  onSuccess,
  onError,
  t,
}: {
  parcheId: string;
  packageId: number;
  onSuccess: (bookingId: string) => void;
  onError: (msg: string) => void;
  t: CreatorStrings;
}) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const stopPolling = useCallback((clearBooking = false) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPolling(false);
    if (clearBooking) setBookingId(null);
    try { popupRef.current?.close(); } catch (_) {}
    popupRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (!polling || !bookingId) return;
    const bid = bookingId;
    pollDeadlineRef.current = Date.now() + 10 * 60 * 1000; // 10-minute cap
    pollRef.current = setInterval(async () => {
      if (Date.now() > pollDeadlineRef.current) {
        stopPolling(true);
        onError(t.parcheBookPayExpired);
        return;
      }
      try {
        const res = await fetch(`/api/webapp/parche-bookings/${encodeURIComponent(bid)}/status`, {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "confirmed" || data.status === "paid") {
          stopPolling();
          onSuccess(bid);
        } else if (data.status === "failed" || data.status === "expired" || data.status === "cancelled") {
          stopPolling(true);
          onError(t.parcheBookPayFailed);
        }
      } catch (_) { /* keep polling */ }
    }, 5000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [polling, bookingId, onSuccess, onError, stopPolling]);

  const handleLaunch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bookParcheCall({ parcheId, packageId, provider: "nowpayments" });
      if (!res.bookingId) throw new Error(t.parcheBookCryptoError);
      const rawUrl = (res as any).checkoutUrl || (res as any).paymentUrl;
      const invoiceUrl = rawUrl ? assertPaymentUrl(rawUrl) : null;
      const w = invoiceUrl
        ? window.open(invoiceUrl, "np_parche_checkout", "width=480,height=720,left=200,top=100")
        : null;
      popupRef.current = w;
      setBookingId(res.bookingId);
      setPolling(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : t.parcheBookCryptoError);
    } finally {
      setLoading(false);
    }
  }, [parcheId, packageId, onError]);

  if (polling) {
    return (
      <div
        className="rounded-xl p-4 text-center space-y-2"
        style={{ background: "rgba(255,183,0,0.07)", border: "1px solid rgba(255,183,0,0.30)" }}
      >
        <div className="flex items-center justify-center gap-2">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
          <span className="text-sm font-semibold" style={{ color: "rgba(255,183,0,0.90)" }}>
            {t.parcheBookWaiting}
          </span>
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t.parcheBookWaitingDesc}
        </p>
        <button
          type="button"
          onClick={() => {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setPolling(false);
            setBookingId(null);
            try { popupRef.current?.close(); } catch (_) {}
            popupRef.current = null;
          }}
          className="text-xs underline underline-offset-2"
          style={{ color: "rgba(255,255,255,0.40)" }}
        >
          {t.parcheBookCancel}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleLaunch}
      className="w-full min-h-[48px] rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
      style={{
        background: "rgba(255,183,0,0.12)",
        border: "1.5px solid rgba(255,183,0,0.55)",
        color: "rgba(255,183,0,0.95)",
      }}
    >
      {loading
        ? <span className="inline-block w-4 h-4 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
        : <>
            <span>₿</span>
            <span>{t.parcheBookCryptoBtn}</span>
          </>
      }
    </button>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function BookParche() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { creator: t, lang } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parche, setParche] = useState<ParcheDetail | null>(null);

  // Selection state
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);

  // Payment state
  const [payStep, setPayStep] = useState<PayStep>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("allow-landscape");
    return () => { document.body.classList.remove("allow-landscape"); };
  }, []);

  useEffect(() => {
    if (!slug) {
      setError(t.parcheBookNotFound);
      setLoading(false);
      return;
    }
    getParcheInfo(slug)
      .then((res) => {
        if (!res.parche) {
          setError(t.parcheBookNotAccepting);
          return;
        }
        setParche(res.parche);
        try {
          const pendingPkgId = sessionStorage.getItem("pnptv:book_parche_pending_pkg");
          if (pendingPkgId && isAuthenticated) {
            const pkgId = Number(pendingPkgId);
            if (!isNaN(pkgId) && res.parche.packages.some((p) => p.id === pkgId)) {
              setSelectedPkgId(pkgId);
              setPayStep("choosing");
              sessionStorage.removeItem("pnptv:book_parche_pending_pkg");
            }
          }
        } catch (_) {}
      })
      .catch(() => setError(t.parcheBookLoadError))
      .finally(() => setLoading(false));
  }, [slug, isAuthenticated]);

  const selectedPkg = parche?.packages.find((p) => p.id === selectedPkgId) ?? null;

  function handleSelectPackage(pkg: ParchePackage) {
    if (selectedPkgId === pkg.id) {
      setSelectedPkgId(null);
      setPayStep("idle");
      setPayError(null);
      return;
    }
    setSelectedPkgId(pkg.id);
    setPayStep("choosing");
    setPayError(null);
  }

  function handlePaySuccess(bookingId: string) {
    setConfirmedBookingId(bookingId);
    setPayStep("success");
  }

  function handlePayError(msg: string) {
    setPayError(msg);
    setPayStep("error");
  }

  const acceptedMembers = parche?.members.filter((m) => m.inviteStatus === "accepted") ?? [];

  if (loading) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center"
        style={{ background: "var(--pnp-background, #0A0A0F)" }}
      >
        <Spinner />
      </div>
    );
  }

  if (error || !parche) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: "var(--pnp-background, #0A0A0F)" }}
      >
        <p className="text-white font-semibold">{error || t.parcheBookNotAccepting}</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm underline"
          style={{ color: "#D4007A" }}
        >
          {t.parcheBookBackToPnptv}
        </button>
      </div>
    );
  }

  const activePackages = parche.packages.filter((p) => p.isActive);

  return (
    <>
      <Helmet>
        <title>Book {parche.name} — PNPtv!</title>
        <meta name="description" content={`Book a group private call with ${parche.name} on PNPtv!`} />
      </Helmet>

      <div
        className="min-h-dvh"
        style={{ background: "var(--pnp-background, #0A0A0F)" }}
      >
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div
          className="relative w-full px-4 pt-10 pb-6"
          style={{
            background: "linear-gradient(to bottom, rgba(212,0,122,0.10) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs mb-6"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {t.parcheBookBack}
          </button>

          {/* Overlapping avatars */}
          <MemberAvatarStrip parche={parche} />

          {/* Name + badges */}
          <div className="mt-4 space-y-2">
            <h1 className="text-2xl font-bold text-white leading-tight">{parche.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {parche.locationCity && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.60)" }}
                >
                  {parche.locationCity}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                style={
                  parche.isOpen
                    ? { background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)", color: "rgba(52,211,153,0.95)" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.40)" }
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: parche.isOpen ? "#34d399" : "rgba(255,255,255,0.30)" }}
                />
                {parche.isOpen ? t.parcheOpenForBookings : t.parcheClosed}
              </span>
            </div>
            {parche.description && (
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.60)" }}>
                {parche.description}
              </p>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

          {/* Member strip — horizontal scroll */}
          {acceptedMembers.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.40)" }}>
                {t.parcheBookTheCrew}
              </p>
              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {acceptedMembers.map((m) => {
                  const initial = (m.displayName || "?").charAt(0).toUpperCase();
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => navigate(`/book/${m.username}`)}
                      className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-[0.97] transition-transform"
                      style={{ minWidth: 64 }}
                    >
                      <div
                        className="relative w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #D4007A, #7B61FF)" }}
                      >
                        {m.photoUrl
                          ? <img src={m.photoUrl} alt={m.displayName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          : initial}
                        {m.isOnline && (
                          <span
                            className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                            style={{ background: "#34C759", borderColor: "#0A0A0F" }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] text-white/60 text-center leading-tight max-w-[64px] truncate">
                        {m.displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section header */}
          <div>
            <h2 className="text-base font-black text-white">{t.parcheBookTitle}</h2>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t.parcheBookSubtitle}
            </p>
          </div>

          {/* Package cards */}
          {!parche.isOpen ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t.parcheBookNotAccepting}
              </p>
            </div>
          ) : activePackages.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                {t.parcheBookNoPackages}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activePackages.map((pkg) => {
                const selected = selectedPkgId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    className="rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer"
                    style={{
                      background: selected
                        ? "linear-gradient(135deg, rgba(212,0,122,0.15), rgba(123,97,255,0.10))"
                        : "rgba(255,255,255,0.04)",
                      border: selected
                        ? "1.5px solid rgba(212,0,122,0.55)"
                        : "1.5px solid rgba(255,255,255,0.08)",
                      boxShadow: selected ? "0 0 24px rgba(212,0,122,0.15)" : "none",
                    }}
                    onClick={() => handleSelectPackage(pkg)}
                  >
                    <div className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white leading-tight">{pkg.title}</p>
                          <p className="text-xs leading-relaxed mt-1" style={{ color: "rgba(255,255,255,0.60)" }}>
                            {pkg.description ||
                              `A ${pkg.durationMinutes}-minute private video call with ${parche.name}.`}
                          </p>
                          <p className="text-[10px] mt-1 font-semibold" style={{ color: "rgba(212,0,122,0.80)" }}>
                            With {acceptedMembers.length} creator{acceptedMembers.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className="inline-flex items-start leading-none">
                            <span className="text-xs font-bold mt-[3px] opacity-80 text-white">$</span>
                            <span className="text-2xl font-black text-white tracking-tight">
                              {Math.floor(Number(pkg.priceUsd))}
                            </span>
                          </span>
                          <p className="text-[10px] text-white/40 mt-0.5">{pkg.durationMinutes}min</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="w-full min-h-[44px] rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] mt-1"
                        style={{
                          background: selected
                            ? "linear-gradient(135deg, #D4007A, #7B61FF)"
                            : "rgba(212,0,122,0.18)",
                          border: selected
                            ? "none"
                            : "1.5px solid rgba(212,0,122,0.40)",
                          boxShadow: selected ? "0 4px 20px rgba(212,0,122,0.30)" : "none",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPackage(pkg);
                        }}
                      >
                        {selected ? t.parcheBookSelected : t.parcheBookNow}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Payment panel ─────────────────────────────────────────── */}
          {selectedPkg && payStep !== "idle" && payStep !== "success" && (
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-white">{t.parcheBookComplete}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPkgId(null);
                    setPayStep("idle");
                    setPayError(null);
                  }}
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.40)" }}
                  aria-label={t.parcheBookClosePanel}
                >
                  {t.parcheBookCancel}
                </button>
              </div>

              {/* Summary row */}
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(212,0,122,0.08)", border: "1px solid rgba(212,0,122,0.20)" }}
              >
                <span className="text-xs font-semibold text-white">{selectedPkg.title}</span>
                <span className="text-xs font-black text-white">${selectedPkg.priceUsd}</span>
              </div>

              {/* Auth gate */}
              {!isAuthenticated ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                    {t.parcheBookLoginRequired}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem("pnptv:post_login_redirect", window.location.pathname);
                        if (selectedPkgId) {
                          sessionStorage.setItem("pnptv:book_parche_pending_pkg", String(selectedPkgId));
                        }
                      } catch (_) {}
                      navigate("/login");
                    }}
                    className="w-full min-h-[48px] rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #D4007A, #7B61FF)" }}
                  >
                    {t.parcheBookLogin}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Wallet USDC */}
                  <WalletPayCard
                    surface="call"
                    amountUsd={Number(selectedPkg.priceUsd)}
                    entitlementSpec={{
                      packageId: selectedPkg.id,
                      parche_id: parche.id,
                    } as any}
                    metadata={{ source: "book_parche_page", parcheSlug: parche.slug }}
                    label={`Pay $${Number(selectedPkg.priceUsd).toFixed(2)}`}
                    lang={(lang === "en" || lang === "es") ? lang : "en"}
                    onSuccess={(result) => {
                      const bid = (result as any)?.bookingId ?? null;
                      if (bid) handlePaySuccess(String(bid));
                      else setPayStep("success");
                    }}
                  />

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.30)" }}>
                      {t.parcheBookOrCrypto}
                    </span>
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  </div>

                  {/* NowPayments crypto popup */}
                  <NpParcheCheckout
                    parcheId={parche.id}
                    packageId={selectedPkg.id}
                    onSuccess={handlePaySuccess}
                    onError={handlePayError}
                    t={t}
                  />

                  <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.30)" }}>
                    BTC · ETH · USDT · USDC · and more
                  </p>

                  {payStep === "error" && payError && (
                    <div
                      className="rounded-xl px-3 py-2.5 text-xs"
                      style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: "#f87171" }}
                    >
                      {payError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Success state ──────────────────────────────────────────── */}
          {payStep === "success" && (
            <div
              className="rounded-2xl p-6 text-center space-y-3"
              style={{
                background: "linear-gradient(135deg, rgba(52,211,153,0.08), rgba(16,185,129,0.05))",
                border: "1.5px solid rgba(52,211,153,0.30)",
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "rgba(52,211,153,0.15)" }}
              >
                <svg className="w-6 h-6" style={{ color: "#34d399" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-base font-black text-white">{t.parcheBookConfirmed}</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                {t.parcheBookConfirmedDesc}
              </p>
              {confirmedBookingId && (
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {t.parcheBookRef} {confirmedBookingId}
                </p>
              )}
              <button
                type="button"
                onClick={() => navigate(isAuthenticated ? "/dm" : "/")}
                className="mt-1 text-xs underline underline-offset-2"
                style={{ color: "#34d399" }}
              >
                {isAuthenticated ? t.parcheBookViewMessages : t.parcheBookBackToPnptv}
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="pb-6 text-center space-y-1">
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              {t.parcheBookPoweredBy}
            </p>
            <a
              href="/"
              className="text-[10px] underline underline-offset-2"
              style={{ color: "rgba(212,0,122,0.60)" }}
            >
              pnptv.app
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
