import { Link } from "react-router-dom";
import { trackAdEvent } from "@/components/AdSlot";

interface Props {
  slot: string;
  className?: string;
}

/**
 * Tiny pill that sits alongside an AdSlot with a "remove ads with PRIME" CTA.
 * Shown to free-tier and anonymous visitors when the server flags
 * ux.showUpgradeChip=true. Emits upgrade_shown on mount and upgrade_click on
 * tap so we can attribute Prime conversions to specific slot placements.
 *
 * Styling is intentionally minimal — a monochrome pill that reads as chrome,
 * not another ad. Two lines max on the narrowest mobile viewport.
 */
export function UpgradeChip({ slot, className }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap select-none transition-opacity hover:opacity-100 opacity-70 ${className ?? ""}`}
      style={{
        background: "rgba(212, 0, 122, 0.10)",
        border: "1px solid rgba(212, 0, 122, 0.35)",
        color: "#FF6B9D",
        fontFamily: "'Roboto Mono', monospace",
      }}
      ref={(el) => {
        if (el && !el.dataset.tracked) {
          el.dataset.tracked = "1";
          trackAdEvent(slot, "upgrade_shown", { surface: "chip" });
        }
      }}
    >
      <span aria-hidden="true">✕</span>
      <Link
        to={`/subscribe?ref=ad-${encodeURIComponent(slot)}`}
        onClick={() => trackAdEvent(slot, "upgrade_click", { surface: "chip" })}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        Sin ads con PRIME
      </Link>
    </div>
  );
}

export default UpgradeChip;
