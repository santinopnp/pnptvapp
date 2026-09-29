import React, { useMemo, useState } from "react";
import { Crown, Gem, BadgeCheck, Handshake } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { CRYSTAL_UI_ENABLED } from "@/lib/api";

export type BadgeKey =
  | "pnptv_fam"
  | "crystal"
  | "verified"
  | "partner"
  | "meth_alpha"
  | "slam_slut"
  | "spun_royal"
  | "chem_mermaids";

// Legacy Telegram-era persona badges from the Cloudy Days group. Stored in
// users.badges TEXT[] as canonical slugs (see migration 411). Rendered but
// NOT awarded to new users.
const CLOUDY_DAYS_PERSONAS: readonly BadgeKey[] = [
  "meth_alpha",
  "slam_slut",
  "spun_royal",
  "chem_mermaids",
];

export interface BadgeSource {
  pnptvFam?: boolean;
  pnptvFamSince?: string | null;
  crystalCreator?: boolean;
  creatorVerified?: boolean;
  partnerBadgeColor?: string | null;
  badges?: string[] | null;
}

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 20, md: 26, lg: 34 };
const ICON_PX: Record<Size, number> = { sm: 12, md: 16, lg: 20 };

interface BuiltBadge {
  key: BadgeKey;
  color?: string | null;
  since?: string | null;
}

export function buildBadges(source: BadgeSource): BuiltBadge[] {
  const out: BuiltBadge[] = [];
  if (source.pnptvFam) out.push({ key: "pnptv_fam", since: source.pnptvFamSince ?? null });
  if (CRYSTAL_UI_ENABLED && source.crystalCreator) out.push({ key: "crystal" });
  if (source.creatorVerified) out.push({ key: "verified" });
  if (source.partnerBadgeColor) out.push({ key: "partner", color: source.partnerBadgeColor });
  if (source.badges && source.badges.length) {
    for (const persona of CLOUDY_DAYS_PERSONAS) {
      if (source.badges.includes(persona)) out.push({ key: persona });
    }
  }
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
      case "partner":
        return {
          bg: `linear-gradient(135deg, ${badge.color || "#8b5cf6"} 0%, rgba(0,0,0,0.25) 100%)`,
          border: badge.color || "#8b5cf6",
          color: "#ffffff",
          IconEl: Handshake,
          shadow: `0 2px 10px ${badge.color ? badge.color + "80" : "rgba(139,92,246,0.45)"}`,
        };
      case "meth_alpha":
        return {
          bg: "linear-gradient(135deg, #1a1035 0%, #3d2a6b 50%, #6b4bd6 100%)",
          border: "rgba(180,140,255,0.55)",
          color: "#f4ecff",
          IconEl: null,
          shadow: "0 2px 10px rgba(107,75,214,0.45)",
          emoji: "🧠",
        };
      case "slam_slut":
        return {
          bg: "linear-gradient(135deg, #3d0a0a 0%, #8a1a1a 50%, #ff5a2c 100%)",
          border: "rgba(255,120,80,0.60)",
          color: "#fff0e6",
          IconEl: null,
          shadow: "0 2px 10px rgba(255,90,44,0.45)",
          emoji: "🔥",
        };
      case "spun_royal":
        return {
          bg: "linear-gradient(135deg, #2a1a05 0%, #6b4a12 50%, #d4a445 100%)",
          border: "rgba(240,200,110,0.65)",
          color: "#2a1a05",
          IconEl: null,
          shadow: "0 2px 10px rgba(212,164,69,0.45)",
          emoji: "👑",
        };
      case "chem_mermaids":
        return {
          bg: "linear-gradient(135deg, #05202a 0%, #147a8c 50%, #6bd4c9 100%)",
          border: "rgba(140,220,215,0.60)",
          color: "#e6faf8",
          IconEl: null,
          shadow: "0 2px 10px rgba(20,122,140,0.45)",
          emoji: "🐚",
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
