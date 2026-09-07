import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gem, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { UserAvatar } from "@/components/UserAvatar";

export interface CrystalRowCreator {
  id: string;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  bio: string | null;
  totalServices: number;
  unlockedServices: number;
  creatorVerified: boolean;
}

/**
 * Pinned "Crystal Creators" row — sits above Discover and inside the fam
 * home strip. Shows all currently active Crystal Creators (any user with a
 * live crystal pass), with a service count preview keyed to the viewer's
 * audience tier ("2 of 5 unlocked" tells an inner-circle viewer they
 * have more to unlock as fam).
 *
 * Doesn't render if there are no active Crystal Creators. Fires two CRM
 * events (row_view once per mount, row_click per card tap) via the
 * generic /api/pnp-fam/event beacon.
 */
export function CrystalCreatorsRow({ variant = "default" }: { variant?: "default" | "compact" }) {
  const t = useI18n();
  const navigate = useNavigate();
  const [creators, setCreators] = useState<CrystalRowCreator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crystal-creators", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((json) => {
        if (cancelled) return;
        setCreators(Array.isArray(json?.creators) ? json.creators : []);
        if (Array.isArray(json?.creators) && json.creators.length > 0) {
          fetch("/api/pnp-fam/event", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "crystal_upsell_view", payload: { surface: "crystal_row" } }),
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = (c: CrystalRowCreator) => {
    fetch("/api/pnp-fam/event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "crystal_upsell_click", payload: { surface: "crystal_row", creator: c.username } }),
    }).catch(() => {});
    if (c.username) navigate(`/c/${c.username}#services`);
  };

  if (loading || creators.length === 0) return null;

  const isCompact = variant === "compact";

  return (
    <section
      aria-label={t.profile.crystalRow.title}
      className="mb-4 rounded-3xl p-4"
      style={{
        background:
          "radial-gradient(600px 240px at 20% 0%, rgba(216,185,255,0.15) 0%, transparent 60%), linear-gradient(160deg, #0a0612 0%, #1a0f2e 50%, #0a0612 100%)",
        border: "1px solid rgba(216,185,255,0.35)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full"
          style={{ background: "linear-gradient(135deg, #d8b9ff, #6b4c7f)", color: "#0a0612" }}
        >
          <Gem size={14} strokeWidth={2.5} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: "#f5f0ff" }}>
            {t.profile.crystalRow.title}
          </h2>
          {!isCompact && (
            <p className="text-[11px] mt-0.5 opacity-75" style={{ color: "#f5f0ff" }}>
              {t.profile.crystalRow.subtitle}
            </p>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${isCompact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>
        {creators.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => handleClick(c)}
            className="text-left rounded-2xl p-3 transition-transform hover:scale-[1.02] active:scale-95 flex items-center gap-3 sm:flex-col sm:items-start"
            style={{
              background: "rgba(20,10,30,0.65)",
              border: "1px solid rgba(216,185,255,0.28)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            <UserAvatar
              userId={c.id}
              photoUrl={c.photoUrl}
              displayName={c.firstName || c.username || "Crystal"}
              size="lg"
              showOnline
              linkToProfile={false}
              crystalCreator
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold truncate" style={{ color: "#f5f0ff" }}>
                  @{c.username || c.firstName || "creator"}
                </span>
                {c.creatorVerified && (
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
                    style={{ background: "linear-gradient(135deg, #5ED1C4, #2a9d92)", color: "#052925" }}
                    aria-label="Verified"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </div>
              <div className="text-[11px] mt-0.5 opacity-80" style={{ color: "#f5f0ff" }}>
                {t.profile.crystalRow.unlockedOf
                  .replace("{unlocked}", String(c.unlockedServices))
                  .replace("{total}", String(c.totalServices))}
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#d8b9ff" }}>
                {t.profile.crystalRow.viewProfile}
                <ArrowRight size={11} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default CrystalCreatorsRow;
