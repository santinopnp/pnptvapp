import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Bottom tab bar — PNPtv Design System v4.
// Four items (Feed, Hangouts, Explore, Channels). Live streams moved into
// Channels; account pages live behind the header avatar. The floating
// "island" nav (beta) is retired.
// ─────────────────────────────────────────────────────────────────────────────

type NavId = "feed" | "hangouts" | "explore" | "channels";

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const navItems: Array<{ id: NavId; to: string; icon: React.ReactNode }> = [
  {
    id: "feed",
    to: "/?view=feed",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M7 9h10M7 13h10M7 17h6" />
      </svg>
    ),
  },
  {
    id: "hangouts",
    to: "/?view=hangouts",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.3c1.8.8 3 2.7 3 5.7" />
      </svg>
    ),
  },
  {
    id: "explore",
    to: "/nearby",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </svg>
    ),
  },
  {
    id: "channels",
    to: "/channels",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M8 2.5l4 3.5 4-3.5" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const location = useLocation();
  const viewParam = new URLSearchParams(location.search).get("view");
  const { nav } = useI18n();
  const path = location.pathname;

  const isActive = (id: NavId) => {
    switch (id) {
      case "feed":
        return path === "/" && viewParam !== "hangouts" && viewParam !== "home";
      case "hangouts":
        return (path === "/" && viewParam === "hangouts") || path.startsWith("/chat");
      case "explore":
        return path.startsWith("/nearby") || path.startsWith("/models") || path.startsWith("/explore");
      case "channels":
        return path.startsWith("/channels") || path.startsWith("/live");
    }
  };

  const labels: Record<NavId, string> = {
    feed: nav.feed,
    hangouts: nav.hangouts,
    explore: nav.explore,
    channels: nav.channels,
  };

  return (
    <nav
      aria-label="Main"
      className="border-t safe-area-bottom"
      style={{ background: "var(--background)", borderColor: "var(--border)" }}
    >
      <div className="flex items-stretch w-full max-w-lg mx-auto">
        {navItems.map((item) => {
          const active = isActive(item.id);
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1 min-h-[56px] text-[12px] leading-4 transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                color: active ? "var(--accent)" : "var(--text-tertiary)",
                fontWeight: active ? 600 : 500,
                outlineColor: "var(--focus)",
              }}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute top-0 w-6 h-0.5 rounded-sm"
                  style={{ background: "var(--accent)" }}
                />
              )}
              {item.icon}
              <span className="truncate max-w-full px-1">{labels[item.id]}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
