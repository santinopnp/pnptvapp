import React, { useCallback, useEffect, useState } from "react";
import { Phone, Camera, MessageSquareHeart, Radio, Layers, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type ServiceType = "private_call" | "custom_content" | "priority_dm" | "private_main_stage" | "bts_subscription";
type Audience = "public" | "crystal" | "whale_pig" | "fam";

interface Service {
  id: number;
  serviceType: ServiceType;
  priceCents: number;
  durationMinutes: number | null;
  fulfillmentDays: number | null;
  descriptionEn: string | null;
  descriptionEs: string | null;
  minAudience: Audience;
  canBook: boolean;
}

interface Props {
  creatorId: string;
  creatorUsername: string | null;
}

const TYPE_ICON: Record<ServiceType, React.ComponentType<{ size?: number }>> = {
  private_call: Phone,
  custom_content: Camera,
  priority_dm: MessageSquareHeart,
  private_main_stage: Radio,
  bts_subscription: Layers,
};

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Direct-services panel for a Crystal Creator's profile. Renders nothing
 * when the creator has no services (i.e., non-Crystal creators).
 *
 * Every service row shows either a Book CTA or a locked teaser explaining
 * which tier is required. Lower-tier viewers see all rows so they know
 * what's waiting for them if they upgrade audience.
 */
export function CrystalServicesPanel({ creatorId, creatorUsername }: Props) {
  const t = useI18n();
  const es = t.lang === "es";
  const [services, setServices] = useState<Service[]>([]);
  const [viewerAudience, setViewerAudience] = useState<Audience>("public");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/creators/${encodeURIComponent(creatorId)}/services`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { services: [], viewerAudience: "public" }))
      .then((json) => {
        if (cancelled) return;
        setServices(Array.isArray(json?.services) ? json.services : []);
        setViewerAudience(json?.viewerAudience || "public");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  const handleBook = useCallback(
    (s: Service) => {
      fetch("/api/pnp-fam/event", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "crystal_upsell_click",
          payload: { creator: creatorUsername, service: s.serviceType, action: "book" },
        }),
      }).catch(() => {});
      // Route to the checkout flow — reuses existing hosted-link/creator
      // subscription patterns. Concrete booking wiring lands in Phase 2;
      // for now navigate to a query-param URL the profile page can catch.
      if (typeof window !== "undefined") {
        window.location.assign(
          `/c/${creatorUsername || creatorId}?service=${encodeURIComponent(s.serviceType)}&service_id=${s.id}`
        );
      }
    },
    [creatorId, creatorUsername]
  );

  if (loading || services.length === 0) return null;

  const lockLabel = (min: Audience): string => {
    if (viewerAudience === "public") return t.profile.crystalServices.lockedForPublic;
    switch (min) {
      case "crystal":   return t.profile.crystalServices.lockedForCrystal;
      case "whale_pig": return t.profile.crystalServices.lockedForWhalePig;
      case "fam":       return t.profile.crystalServices.lockedForFam;
      default:          return "";
    }
  };

  const priceSuffix = (s: Service): string => {
    if (s.serviceType === "bts_subscription" || s.serviceType === "priority_dm") {
      return t.profile.crystalServices.perMonth;
    }
    if (s.durationMinutes) {
      if (s.durationMinutes >= 60 && s.durationMinutes % 60 === 0) {
        return ` · ${t.profile.crystalServices.duration_hr.replace("{n}", String(s.durationMinutes / 60))}`;
      }
      return ` · ${t.profile.crystalServices.duration_min.replace("{n}", String(s.durationMinutes))}`;
    }
    if (s.fulfillmentDays) {
      return ` · ${t.profile.crystalServices.fulfillment.replace("{days}", String(s.fulfillmentDays))}`;
    }
    return "";
  };

  return (
    <section
      id="services"
      aria-label={t.profile.crystalServices.panelTitle}
      className="mt-6 rounded-3xl p-4"
      style={{
        background:
          "radial-gradient(600px 220px at 0% 0%, rgba(216,185,255,0.10) 0%, transparent 60%), linear-gradient(160deg, rgba(20,10,30,0.75), rgba(10,6,18,0.85))",
        border: "1px solid rgba(216,185,255,0.35)",
      }}
    >
      <div className="mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: "#f5f0ff" }}>
          {t.profile.crystalServices.panelTitle}
        </h3>
        <p className="text-[12px] mt-0.5 opacity-75" style={{ color: "#f5f0ff" }}>
          {t.profile.crystalServices.panelSubtitle}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {services.map((s) => {
          const Icon = TYPE_ICON[s.serviceType];
          const desc = (es ? s.descriptionEs : s.descriptionEn) || s.descriptionEn || "";
          return (
            <li
              key={s.id}
              className="rounded-2xl p-3 flex items-start gap-3"
              style={{
                background: "rgba(20,10,30,0.65)",
                border: `1px solid ${s.canBook ? "rgba(216,185,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                opacity: s.canBook ? 1 : 0.85,
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: s.canBook
                    ? "linear-gradient(135deg, #d8b9ff, #6b4c7f)"
                    : "linear-gradient(135deg, #333, #111)",
                  color: s.canBook ? "#0a0612" : "rgba(245,240,255,0.6)",
                }}
              >
                {s.canBook ? <Icon size={18} /> : <Lock size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ color: "#f5f0ff" }}>
                    {t.profile.crystalServices.types[s.serviceType]}
                  </span>
                  <span className="text-sm font-black" style={{ color: "#d8b9ff" }}>
                    {centsToUsd(s.priceCents)}{priceSuffix(s)}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: "rgba(216,185,255,0.15)",
                      color: "#d8b9ff",
                      border: "1px solid rgba(216,185,255,0.3)",
                    }}
                  >
                    {t.profile.crystalServices.audienceLabel[s.minAudience]}
                  </span>
                </div>
                {desc && (
                  <p className="text-[12px] mt-1 leading-snug" style={{ color: "rgba(245,240,255,0.85)" }}>
                    {desc}
                  </p>
                )}
                <div className="mt-2">
                  {s.canBook ? (
                    <button
                      type="button"
                      onClick={() => handleBook(s)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-transform hover:scale-[1.03] active:scale-95"
                      style={{
                        background: "linear-gradient(135deg, #d8b9ff, #6b4c7f)",
                        color: "#0a0612",
                        boxShadow: "0 2px 8px rgba(60,26,77,0.5)",
                      }}
                    >
                      {t.profile.crystalServices.book}
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold"
                      style={{ color: "rgba(245,240,255,0.7)" }}
                    >
                      <Lock size={11} />
                      {lockLabel(s.minAudience)}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default CrystalServicesPanel;
