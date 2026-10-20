import React, { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";
import {
  getPublicCreatorBookingInfo,
  getPromoVideos,
  type PublicBookingPackage,
  type PublicBookingCreator,
  type PublicBookingPerformer,
} from "@/lib/api";

// ── Boytoy selection type ────────────────────────────────────────────────────
type BoytoyChoice = "colombian" | "venezuelan";

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
    <div className="space-y-1.5">
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
              onClick={(e) => { e.stopPropagation(); onChange(choice); }}
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

// ── Package row (radio-style) ────────────────────────────────────────────────
function PackageRow({
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
    solo: `An intimate ${pkg.durationMinutes ?? 60}-minute private video call with just you and ${creatorName}.`,
    boytoy1: `A 60-minute private video call with ${creatorName} and one of their handpicked boytoys.`,
    boytoy2: `The full experience — ${creatorName} plus two boytoys for 60 minutes of private time.`,
    other: pkg.description || `A private video call with ${creatorName}.`,
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer"
      style={{
        background: selected
          ? "linear-gradient(135deg, rgba(212,0,122,0.12), rgba(123,97,255,0.08))"
          : "rgba(255,255,255,0.04)",
        border: selected
          ? "1.5px solid rgba(212,0,122,0.50)"
          : "1.5px solid rgba(255,255,255,0.08)",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Radio indicator */}
          <div
            className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all"
            style={{
              border: selected ? "2px solid #D4007A" : "2px solid rgba(255,255,255,0.22)",
              background: selected ? "rgba(212,0,122,0.12)" : "transparent",
            }}
          >
            {selected && (
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#D4007A" }} />
            )}
          </div>

          {/* Label + price */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-black text-white leading-tight">{pkg.title}</p>
              <span className="flex-shrink-0 inline-flex items-start leading-none">
                <span className="text-[10px] font-bold mt-[2px] opacity-70 text-white">$</span>
                <span className="text-xl font-black text-white tracking-tight">
                  {Math.floor(pkg.priceUsd)}
                </span>
              </span>
            </div>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              {descriptionMap[variant]}
            </p>
          </div>
        </div>

        {/* Boytoy selectors — shown inline when selected */}
        {selected && variant === "boytoy1" && (
          <div className="mt-3 ml-8">
            <BoytoySelector label="Choose your boytoy" value={boytoy1} onChange={onBoytoy1Change} />
          </div>
        )}
        {selected && variant === "boytoy2" && (
          <div className="mt-3 ml-8 space-y-2">
            <BoytoySelector label="Choose boytoy 1" value={boytoy1} onChange={onBoytoy1Change} />
            <BoytoySelector label="Choose boytoy 2" value={boytoy2} onChange={onBoytoy2Change} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function BookCreator() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

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

  // Promo video carousel
  const [promoVideos, setPromoVideos] = useState<string[]>([]);
  const [promoIndex, setPromoIndex] = useState(0);
  const [promoMuted, setPromoMuted] = useState(true);
  const promoVideoRef = useRef<HTMLVideoElement>(null);

  // Allow landscape on this page — the hero video and checkout should be usable
  // in any orientation. Without this, globals.css hides the whole page behind a
  // "rotate to portrait" overlay on Android Chrome in landscape (z-index 99999).
  useEffect(() => {
    document.body.classList.add("allow-landscape");
    return () => { document.body.classList.remove("allow-landscape"); };
  }, []);

  useEffect(() => {
    if (!handle) {
      setError("Creator not found.");
      setLoading(false);
      return;
    }
    // Fetch promo videos in parallel (non-blocking — failures ignored)
    getPromoVideos(handle).then((r) => { if (r.success && r.videos.length) setPromoVideos(r.videos); }).catch(() => {});
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
          {/* Video hero — autoplays muted; shows placeholder if no promos */}
          <div className="max-w-4xl mx-auto">
          <div
            className="w-full relative"
            style={{ aspectRatio: "16/9", background: "#0a0a0a" }}
          >
            {promoVideos.length > 0 ? (
              <>
                <video
                  ref={promoVideoRef}
                  key={promoVideos[promoIndex]}
                  src={promoVideos[promoIndex]}
                  autoPlay
                  loop
                  muted={promoMuted}
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  onError={() => {
                    // Skip broken video to next
                    if (promoVideos.length > 1) setPromoIndex((i) => (i + 1) % promoVideos.length);
                  }}
                />

                {/* Mute/unmute button */}
                <button
                  type="button"
                  aria-label={promoMuted ? "Unmute video" : "Mute video"}
                  onClick={() => setPromoMuted((m) => !m)}
                  className="absolute bottom-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-all active:scale-90"
                  style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.18)" }}
                >
                  {promoMuted ? (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>

                {/* Carousel dots — only when more than one video */}
                {promoVideos.length > 1 && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
                    {promoVideos.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Play video ${i + 1}`}
                        onClick={() => setPromoIndex(i)}
                        className="rounded-full transition-all"
                        style={{
                          width: i === promoIndex ? "20px" : "6px",
                          height: "6px",
                          background: i === promoIndex ? "#D4007A" : "rgba(255,255,255,0.35)",
                        }}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Fallback placeholder */
              <>
                <div
                  className="absolute inset-0"
                  style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(212,0,122,0.12) 0%, transparent 70%)" }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                  <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-xs font-medium tracking-wide uppercase">Video coming soon</span>
                </div>
              </>
            )}
          </div>
          </div>{/* /max-w-4xl */}

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

          {/* Package rows */}
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
            <div className="space-y-2.5">
              {packages.map((pkg) => {
                const variant = classifyPackage(pkg);
                return (
                  <PackageRow
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

          {/* ── Persistent checkout panel ──────────────────────────────── */}
          {payStep !== "success" && packages.length > 0 && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div
                className="px-5 py-3.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-sm font-black text-white">Your booking</p>
              </div>

              <div className="p-5 space-y-4">
                {!selectedPkg ? (
                  <p
                    className="text-sm text-center py-3"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    Select a session above ↑
                  </p>
                ) : (
                  <>
                    {/* Order summary row */}
                    <div
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                      style={{ background: "rgba(212,0,122,0.08)", border: "1px solid rgba(212,0,122,0.20)" }}
                    >
                      <span className="text-xs font-semibold text-white">{selectedPkg.title}</span>
                      <span className="text-xs font-black text-white">${selectedPkg.priceUsd.toFixed(2)}</span>
                    </div>

                    {!isAuthenticated ? (
                      <div className="space-y-3 text-center">
                        <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                          Log in to complete your booking.
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
                          const variant = classifyPackage(selectedPkg);
                          const boytoyIncomplete =
                            (variant === "boytoy1" && !boytoy1) ||
                            (variant === "boytoy2" && (!boytoy1 || !boytoy2));
                          return boytoyIncomplete ? (
                            <p className="text-center text-xs py-3" style={{ color: "rgba(255,183,0,0.85)" }}>
                              Please choose your boytoy above to continue.
                            </p>
                          ) : (
                            <>
                              <WalletPayCard
                                key={`wallet-${selectedPkg.id}`}
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
                  </>
                )}
              </div>
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
