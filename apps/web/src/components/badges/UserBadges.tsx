import React, { useMemo, useState } from "react";
import { Crown, Gem, BadgeCheck, Handshake } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type BadgeKey = "pnptv_fam" | "crystal" | "verified" | "colombia" | "partner";

export interface BadgeSource {
  pnptvFam?: boolean;
  pnptvFamSince?: string | null;
  crystalCreator?: boolean;
  creatorVerified?: boolean;
  colombiaBadge?: boolean;
  partnerBadgeColor?: string | null;
}

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 20, md: 26, lg: 34 };
const ICON_PX: Record<Size, number> = { sm: 12, md: 16, lg: 20 };

interface BuiltBadge {
  key: BadgeKey;
  color?: string | null;
  since?: string | null;
}

/**
 * Priority-descending list of badges to render. Most exclusive first
 * (fam → crystal → verified → colombia → partner) so the leftmost slot in
 * the row is the most distinctive.
 */
export function buildBadges(source: BadgeSource): BuiltBadge[] {
  const out: BuiltBadge[] = [];
  if (source.pnptvFam) out.push({ key: "pnptv_fam", since: source.pnptvFamSince ?? null });
  if (source.crystalCreator) out.push({ key: "crystal" });
  if (source.creatorVerified) out.push({ key: "verified" });
  if (source.colombiaBadge) out.push({ key: "colombia" });
  if (source.partnerBadgeColor) out.push({ key: "partner", color: source.partnerBadgeColor });
  return out;
}

interface BadgeIconProps {
  badge: BuiltBadge;
  size?: Size;
}

/**
 * Single icon-only badge with a hover/focus tooltip showing its public name
 * and the reason it was granted. No text label — the icon carries the
 * identity. Each badge key has a distinct palette.
 */
function BadgeIcon({ badge, size = "md" }: BadgeIconProps) {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const px = SIZE_PX[size];
  const icon = ICON_PX[size];

  const strings = t.profile.badges[badge.key];
  const name = strings.name;
  const reason = strings.reason;
  const sinceLine = badge.since
    ? t.profile.badges.sinceLabel.replace("{date}", new Date(badge.since).toLocaleDateString())
    : "";

  const chrome = useMemo(() => {
    switch (badge.key) {
      case "pnptv_fam":
        return {
          bg: "linear-gradient(135deg, #ffb27a 0%, #f7c9a7 50%, #ffe8d6 100%)",
          border: "rgba(180,110,80,0.65)",
          color: "#2a0f08",
          IconEl: Crown,
          shadow: "0 2px 10px rgba(180,110,80,0.45)",
        };
      case "crystal":
        return {
          bg: "linear-gradient(135deg, #0a0612 0%, #3c1a4d 50%, #6b4c7f 100%)",
          border: "rgba(216,185,255,0.65)",
          color: "#f5f0ff",
          IconEl: Gem,
          shadow: "0 2px 10px rgba(60,26,77,0.45)",
        };
      case "verified":
        return {
          bg: "linear-gradient(135deg, #5ED1C4 0%, #2a9d92 100%)",
          border: "rgba(94,209,196,0.65)",
          color: "#052925",
          IconEl: BadgeCheck,
          shadow: "0 2px 10px rgba(42,157,146,0.4)",
        };
      case "colombia":
        return {
          bg: "linear-gradient(180deg, #FCD116 0%, #FCD116 33%, #003893 33%, #003893 66%, #CE1126 66%, #CE1126 100%)",
          border: "rgba(255,255,255,0.35)",
          color: "#ffffff",
          IconEl: null,
          shadow: "0 2px 10px rgba(0,0,0,0.35)",
          emoji: "🇨🇴",
        };
      case "partner":
        return {
          bg: `linear-gradient(135deg, ${badge.color || "#8b5cf6"} 0%, rgba(0,0,0,0.25) 100%)`,
          border: badge.color || "#8b5cf6",
          color: "#ffffff",
          IconEl: Handshake,
          shadow: `0 2px 10px ${badge.color ? badge.color + "80" : "rgba(139,92,246,0.45)"}`,
        };
    }
  }, [badge.key, badge.color]);

  const IconEl = chrome.IconEl;
  const emoji = "emoji" in chrome ? chrome.emoji : undefined;

  return (
    <span className="relative inline-flex items-center justify-center">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={name}
        aria-describedby={open ? `badge-tip-${badge.key}` : undefined}
        className="rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        style={{
          width: px,
          height: px,
          background: chrome.bg,
          border: `1px solid ${chrome.border}`,
          color: chrome.color,
          boxShadow: chrome.shadow,
        }}
      >
        {emoji ? (
          <span style={{ fontSize: icon, lineHeight: 1 }}>{emoji}</span>
        ) : IconEl ? (
          <IconEl size={icon} strokeWidth={2.4} />
        ) : null}
      </button>
      {open && (
        <span
          role="tooltip"
          id={`badge-tip-${badge.key}`}
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none w-max max-w-[220px] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug bg-black/90 text-white shadow-xl border border-white/10"
        >
          <span className="font-semibold block">{name}</span>
          <span className="block opacity-90 whitespace-normal">{reason}</span>
          {sinceLine && (
            <span className="block opacity-70 mt-0.5 whitespace-normal">{sinceLine}</span>
          )}
        </span>
      )}
    </span>
  );
}

interface BadgeRowProps {
  source: BadgeSource;
  size?: Size;
  className?: string;
}

/**
 * Prominent horizontal row of a user's badges — sits directly under the
 * displayName on profile headers and creator cards. Renders nothing when
 * the user has no badges.
 */
export function BadgeRow({ source, size = "md", className = "" }: BadgeRowProps) {
  const badges = buildBadges(source);
  if (!badges.length) return null;
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {badges.map((b) => (
        <BadgeIcon key={b.key} badge={b} size={size} />
      ))}
    </div>
  );
}

export default BadgeRow;
