import React, { useEffect, useRef, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";
import {
  getPublicCreatorBookingInfo,
  prepareCallNowPayments,
  getBookingPaymentStatus,
  type PublicBookingPackage,
  type PublicBookingCreator,
  type PublicBookingPerformer,
} from "@/lib/api";

// ── Boytoy selection type ────────────────────────────────────────────────────
type BoytoyChoice = "colombian" | "venezuelan";

interface BoytoySlot {
  slot: 1 | 2;
  choice: BoytoyChoice | null;
}

// ── Package variant classification ──────────────────────────────────────────
type PackageVariant = "solo" | "boytoy1" | "boytoy2" | "other";

// ── Payment step ─────────────────────────────────────────────────────────────
type PayStep = "idle" | "choosing" | "success" | "error";

function classifyPackage(pkg: PublicBookingPackage): PackageVariant {
  const sku = pkg.sku?.toUpperCase() ?? "";
  if (sku.includes("BOYTOY2")) return "boytoy2";
  if (sku.includes("BOYTOY1")) return "boytoy1";
  return "solo";
}

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

// ── Boytoy selector ──────────────────────────────────────────────────────────
function BoytoySelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BoytoyChoice | null;
  onChange: (v: BoytoyChoice) => void;
}) {
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(["colombian", "venezuelan"] as BoytoyChoice[]).map((choice) => {
          const active = value === choice;
          return (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(choice)}
              className="py-2.5 px-3 rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
              style={{
                background: active
                  ? "linear-gradient(135deg, rgba(212,0,122,0.25), rgba(123,97,255,0.25))"
                  : "rgba(255,255,255,0.05)",
                border: active
                  ? "1.5px solid rgba(212,0,122,0.60)"
                  : "1.5px solid rgba(255,255,255,0.08)",
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
              }}
            >
              {choice === "colombian" ? "Colombian Boytoy" : "Venezuelan Boytoy"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Package card ──────────────────────────────────────────────────────────────
function PackageCard({
  pkg,
  variant,
  creatorName,
  selected,
  onSelect,
  boytoy1,
  boytoy2,
  onBoytoy1Change,
  onBoytoy2Change,
}: {
  pkg: PublicBookingPackage;
  variant: PackageVariant;
  creatorName: string;
  selected: boolean;
  onSelect: () => void;
  boytoy1: BoytoyChoice | null;
  boytoy2: BoytoyChoice | null;
  onBoytoy1Change: (v: BoytoyChoice) => void;
  onBoytoy2Change: (v: BoytoyChoice) => void;
}) {
  const descriptionMap: Record<PackageVariant, string> = {
    solo: `An intimate ${pkg.durationMinutes}-minute private video call with just you and ${creatorName}.`,
    boytoy1: `A 60-minute private video call with ${creatorName} and one of their handpicked boytoys.`,
    boytoy2: `The full experience — ${creatorName} plus two boytoys for 60 minutes of private time.`,
    other: pkg.description || `A private video call with ${creatorName}.`,
  };

  return (
    <div
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
      onClick={onSelect}
    >
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white leading-tight">{pkg.title}</p>
            <p className="text-xs leading-relaxed mt-1" style={{ color: "rgba(255,255,255,0.60)" }}>
              {descriptionMap[variant]}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="inline-flex items-start leading-none">
              <span className="text-xs font-bold mt-[3px] opacity-80 text-white">$</span>
              <span className="text-2xl font-black text-white tracking-tight">
                {Math.floor(pkg.priceUsd)}
              </span>
            </span>
          </div>
        </div>

        {/* Boytoy selectors — shown only when this card is selected */}
        {selected && variant === "boytoy1" && (
          <BoytoySelector label="Choose your boytoy" value={boytoy1} onChange={onBoytoy1Change} />
        )}
        {selected && variant === "boytoy2" && (
          <>
            <BoytoySelector label="Choose boytoy 1" value={boytoy1} onChange={onBoytoy1Change} />
            <BoytoySelector label="Choose boytoy 2" value={boytoy2} onChange={onBoytoy2Change} />
          </>
        )}

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
            onSelect();
          }}
        >
          {selected ? "Selected — Choose Payment" : "Book Now"}
        </button>
      </div>
    </div>
  );
}

// ── NowPayments inline checkout (popup + poll) ────────────────────────────────
function NpCallCheckout({
  packageId,
  clientNotes,
  onSuccess,
  onError,
}: {
  packageId: number;
  clientNotes: string | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollRef_id, setPollRef_id] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      try { popupRef.current?.close(); } catch (_) {}
    };
  }, []);

  // Poll for completion
  useEffect(() => {
    if (!polling || !pollRef_id) return;
    const pid = pollRef_id;
    pollRef.current = setInterval(async () => {
      try {
        const status = await getBookingPaymentStatus(pid);
        if (status.status === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPolling(false);
          try { popupRef.current?.close(); } catch (_) {}
          popupRef.current = null;
          onSuccess();
        } else if (status.status === "failed" || status.status === "expired") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPolling(false);
          setPollRef_id(null);
          onError("Payment failed or expired. Please try again.");
        }
      } catch (_) { /* swallow — keep polling */ }
    }, 5000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [polling, pollRef_id, onSuccess, onError]);

  const handleLaunch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await prepareCallNowPayments({
        packageId,
        clientNotes: clientNotes || null,
      });
      // Prefer bookingId if backend returns it; fall back to paymentId
      const pollTarget = (res as any).bookingId ?? res.paymentId;
      if (!res.success || !res.invoiceUrl || !pollTarget) {
        throw new Error(res.error || "Could not create crypto payment.");
      }
      const w = window.open(res.invoiceUrl, "np_book_checkout", "width=480,height=720,left=200,top=100");
      popupRef.current = w;
      setPollRef_id(String(pollTarget));
      setPolling(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Crypto payment error.");
    } finally {
      setLoading(false);
    }
  }, [packageId, clientNotes, onError]);

  if (polling) {
    return (
      <div
        className="rounded-xl p-4 text-center space-y-2"
        style={{ background: "rgba(255,183,0,0.07)", border: "1px solid rgba(255,183,0,0.30)" }}
      >
        <div className="flex items-center justify-center gap-2">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
          <span className="text-sm font-semibold" style={{ color: "rgba(255,183,0,0.90)" }}>
            Waiting for your payment…
          </span>
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
          Complete the payment in the window that opened. This screen updates automatically.
        </p>
        <button
          type="button"
          onClick={() => {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setPolling(false);
            setPollRef_id(null);
            try { popupRef.current?.close(); } catch (_) {}
            popupRef.current = null;
          }}
          className="text-xs underline underline-offset-2"
          style={{ color: "rgba(255,255,255,0.40)" }}
        >
          Cancel
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
            <span>Pay with crypto · Apps &amp; wallets</span>
          </>
      }
    </button>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function BookCreator() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creator, setCreator] = useState<PublicBookingCreator | null>(null);
  const [performer, setPerformer] = useState<PublicBookingPerformer | null>(null);
  const [packages, setPackages] = useState<PublicBookingPackage[]>([]);

  // Selection state
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);
  const [boytoy1, setBoytoy1] = useState<BoytoyChoice | null>(null);
  const [boytoy2, setBoytoy2] = useState<BoytoyChoice | null>(null);

  // Payment state
  const [payStep, setPayStep] = useState<PayStep>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | number | null>(null);

  useEffect(() => {
    if (!handle) {
      setError("Creator not found.");
      setLoading(false);
      return;
    }
    getPublicCreatorBookingInfo(handle)
      .then((res) => {
        if (!res.success) {
          setError("Creator not found.");
          return;
        }
        setCreator(res.creator);
        setPerformer(res.performer);
        // Only show the 3 canonical booking packages; fall back to all if none match
        const canonical = res.packages.filter((p) => {
          const v = classifyPackage(p);
          return v === "solo" || v === "boytoy1" || v === "boytoy2";
        });
        const finalPkgs = canonical.length > 0 ? canonical : res.packages;
        setPackages(finalPkgs);
        // Restore pending package selection if user just returned from login
        try {
          const pendingPkgId = sessionStorage.getItem("pnptv:book_pending_pkg");
          if (pendingPkgId && isAuthenticated) {
            const pkgId = Number(pendingPkgId);
            if (!isNaN(pkgId) && finalPkgs.some((p) => p.id === pkgId)) {
              setSelectedPkgId(pkgId);
              setPayStep("choosing");
              sessionStorage.removeItem("pnptv:book_pending_pkg");
            }
          }
        } catch (_) {}
      })
      .catch(() => setError("Could not load creator information."))
      .finally(() => setLoading(false));
  }, [handle]);

  // Derive client notes string from boytoy selections
  function buildClientNotes(pkg: PublicBookingPackage | undefined): string | null {
    if (!pkg) return null;
    const v = classifyPackage(pkg);
    if (v === "boytoy1" && boytoy1) {
      return `Boytoy 1: ${boytoy1 === "colombian" ? "Colombian Boytoy" : "Venezuelan Boytoy"}`;
    }
    if (v === "boytoy2") {
      const parts: string[] = [];
      if (boytoy1) parts.push(`Boytoy 1: ${boytoy1 === "colombian" ? "Colombian Boytoy" : "Venezuelan Boytoy"}`);
      if (boytoy2) parts.push(`Boytoy 2: ${boytoy2 === "colombian" ? "Colombian Boytoy" : "Venezuelan Boytoy"}`);
      return parts.length > 0 ? parts.join(" | ") : null;
    }
    return null;
  }

  const selectedPkg = packages.find((p) => p.id === selectedPkgId);

  function handleSelectPackage(pkg: PublicBookingPackage) {
    // If tapping the already-selected package, deselect it
    if (selectedPkgId === pkg.id) {
      setSelectedPkgId(null);
      setBoytoy1(null);
      setBoytoy2(null);
      setPayStep("idle");
      setPayError(null);
      return;
    }
    setSelectedPkgId(pkg.id);
    setBoytoy1(null);
    setBoytoy2(null);
    setPayStep("choosing");
    setPayError(null);
  }

  function handlePaySuccess(bookingId?: string | number | null) {
    if (bookingId != null) setConfirmedBookingId(bookingId);
    setPayStep("success");
  }

  function handlePayError(msg: string) {
    setPayError(msg);
    setPayStep("error");
  }

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

  if (error || !creator) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: "var(--pnp-background, #0A0A0F)" }}
      >
        <p className="text-white font-semibold">{error || "Creator not found."}</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm underline"
          style={{ color: "#D4007A" }}
        >
          Back to PNPtv
        </button>
      </div>
    );
  }

  const isAvailable = performer?.isAvailable === true && performer?.status === "active";

  return (
    <>
      <Helmet>
        <title>Book a Call with {creator.displayName} — PNPtv!</title>
        <meta name="description" content={`Book a private video call with ${creator.displayName} on PNPtv!`} />
      </Helmet>

      <div
        className="min-h-dvh"
        style={{ background: "var(--pnp-background, #0A0A0F)" }}
      >
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className="relative w-full overflow-hidden" style={{ background: "#000" }}>
          {/* Video placeholder */}
          <div
            className="w-full flex items-center justify-center relative"
            style={{ aspectRatio: "16/9", maxHeight: "55vh", background: "#0a0a0a" }}
          >
            {/* Subtle radial glow */}
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse at 50% 50%, rgba(212,0,122,0.12) 0%, transparent 70%)",
              }}
            />
            {/* Play icon */}
            <div
              className="relative flex flex-col items-center gap-3"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-xs font-medium tracking-wide uppercase">Video coming soon</span>
            </div>
          </div>

          {/* Creator name overlay at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-12"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.90) 0%, transparent 100%)",
            }}
          >
            <div className="flex items-end gap-3">
              {creator.photoUrl && (
                <img
                  src={creator.photoUrl}
                  alt={creator.displayName}
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  style={{ border: "2px solid rgba(212,0,122,0.60)" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0 pb-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-black text-white leading-tight truncate">
                    {creator.displayName}
                  </h1>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                    style={
                      isAvailable
                        ? {
                            background: "rgba(52,211,153,0.15)",
                            border: "1px solid rgba(52,211,153,0.40)",
                            color: "rgba(52,211,153,0.95)",
                          }
                        : {
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "rgba(255,255,255,0.40)",
                          }
                    }
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: isAvailable ? "#34d399" : "rgba(255,255,255,0.30)" }}
                    />
                    {isAvailable ? "Available for calls" : "Currently offline"}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  @{creator.username}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Bio */}
          {creator.bio && (
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
              {creator.bio}
            </p>
          )}

          {/* Section header */}
          <div>
            <h2 className="text-base font-black text-white">Book a private call</h2>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              Choose a package below. All calls are 60 minutes over private video.
            </p>
          </div>

          {/* Package cards */}
          {packages.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
                No packages available right now. Check back soon.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {packages.map((pkg) => {
                const variant = classifyPackage(pkg);
                return (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    variant={variant}
                    creatorName={creator.displayName}
                    selected={selectedPkgId === pkg.id}
                    onSelect={() => handleSelectPackage(pkg)}
                    boytoy1={boytoy1}
                    boytoy2={boytoy2}
                    onBoytoy1Change={(v) => setBoytoy1(v)}
                    onBoytoy2Change={(v) => setBoytoy2(v)}
                  />
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
                <p className="text-sm font-black text-white">Complete your booking</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPkgId(null);
                    setBoytoy1(null);
                    setBoytoy2(null);
                    setPayStep("idle");
                    setPayError(null);
                  }}
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.40)" }}
                  aria-label="Close payment panel"
                >
                  Cancel
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
                    You need to be logged in to book a call.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem("pnptv:post_login_redirect", window.location.pathname);
                        if (selectedPkgId) {
                          sessionStorage.setItem("pnptv:book_pending_pkg", String(selectedPkgId));
                        }
                      } catch (_) {}
                      navigate("/login");
                    }}
                    className="w-full min-h-[48px] rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #D4007A, #7B61FF)" }}
                  >
                    Log in to continue
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const variant = selectedPkg ? classifyPackage(selectedPkg) : "other";
                    const boytoyIncomplete =
                      (variant === "boytoy1" && !boytoy1) ||
                      (variant === "boytoy2" && (!boytoy1 || !boytoy2));
                    return boytoyIncomplete ? (
                      <p className="text-center text-xs py-3" style={{ color: "rgba(255,183,0,0.85)" }}>
                        Please choose your boytoy above to continue.
                      </p>
                    ) : (
                      <>
                        {/* Wallet USDC */}
                        <WalletPayCard
                          surface="call"
                          amountUsd={selectedPkg.priceUsd}
                          entitlementSpec={{
                            packageId: selectedPkg.id,
                            creator_id: creator.id,
                            clientNotes: buildClientNotes(selectedPkg) ?? undefined,
                          }}
                          metadata={{ source: "book_creator_page", handle: creator.username }}
                          label={`Pay $${selectedPkg.priceUsd.toFixed(2)}`}
                          lang="en"
                          onSuccess={(result) => {
                            handlePaySuccess((result as any)?.bookingId ?? null);
                          }}
                        />

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.30)" }}>
                            or pay with crypto
                          </span>
                          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                        </div>

                        {/* NowPayments crypto popup */}
                        <NpCallCheckout
                          packageId={selectedPkg.id}
                          clientNotes={buildClientNotes(selectedPkg)}
                          onSuccess={handlePaySuccess}
                          onError={handlePayError}
                        />

                        <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.30)" }}>
                          BTC · ETH · USDT · USDC · and more
                        </p>
                      </>
                    );
                  })()}

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
              <p className="text-base font-black text-white">Booking confirmed!</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                {creator.displayName} will be in touch to confirm the time. Check your messages on PNPtv.
              </p>
              {confirmedBookingId != null && (
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Booking ref: {String(confirmedBookingId)}
                </p>
              )}
              <button
                type="button"
                onClick={() => navigate(isAuthenticated ? "/dm" : "/")}
                className="mt-1 text-xs underline underline-offset-2"
                style={{ color: "#34d399" }}
              >
                {isAuthenticated ? "View my messages" : "Back to PNPtv"}
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="pb-6 text-center space-y-1">
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Powered by PNPtv! · Secure payments
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
