import { useEffect, useRef, useState } from "react";
import { useTier } from "@/hooks/useTier";
import { getAdsConfig, type AdSlotConfig, type AdSlotFormat } from "@/lib/api";

interface Props {
  slot: string;
  className?: string;
  style?: React.CSSProperties;
  onVastUrl?: (url: string) => void;
}

const loadedScripts = new Set<string>();
function loadScriptOnce(src: string, attrs: Record<string, string> = {}) {
  if (loadedScripts.has(src)) return;
  loadedScripts.add(src);
  const s = document.createElement("script");
  s.async = true;
  s.type = "application/javascript";
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
  s.src = src;
  document.head.appendChild(s);
}

const DISPLAY_FORMATS: ReadonlySet<AdSlotFormat> = new Set([
  "banner",
  "sticky_banner",
  "mobile_banner",
  "in_content_banner",
  "recommendation_widget",
  "multi_format",
  "instant_message",
  "push_inpage",
  "video_slider",
  "outstream_video",
  "vertical_video",
]);

const POPUNDER_FORMATS: ReadonlySet<AdSlotFormat> = new Set(["popunder", "mobile_popunder"]);

function sessionCapKey(slot: string) { return `pnpapp:adslot:${slot}:shown`; }

export function AdSlot({ slot, className, style, onVastUrl }: Props) {
  const { isFree } = useTier();
  const ref = useRef<HTMLDivElement | null>(null);
  const [cfg, setCfg] = useState<AdSlotConfig | null>(null);
  const [scriptUrl, setScriptUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isFree) { setCfg(null); return; }
    let cancelled = false;
    getAdsConfig().then((r) => {
      if (cancelled) return;
      if (!r.showAds) return;
      const s = r.slots?.[slot];
      if (!s || !s.zoneId) return;
      setCfg(s);
      setScriptUrl(r.scriptUrl);
    });
    return () => { cancelled = true; };
  }, [slot, isFree]);

  useEffect(() => {
    if (!cfg || !isFree) return;

    if (cfg.format === "vast") {
      if (cfg.vastUrl && onVastUrl) onVastUrl(cfg.vastUrl);
      return;
    }

    if (POPUNDER_FORMATS.has(cfg.format)) {
      if (cfg.capPerSession > 0 && sessionStorage.getItem(sessionCapKey(slot))) return;
      loadScriptOnce(
        `https://a.magsrv.com/ad-provider.js`,
        { "data-cfasync": "false" },
      );
      const ins = document.createElement("ins");
      ins.className = "eas6a97888e17";
      ins.setAttribute("data-zoneid", String(cfg.zoneId));
      document.body.appendChild(ins);
      const push = document.createElement("script");
      push.type = "application/javascript";
      push.textContent = `(AdProvider = window.AdProvider || []).push({"serve": {}});`;
      document.body.appendChild(push);
      if (cfg.capPerSession > 0) sessionStorage.setItem(sessionCapKey(slot), "1");
      return;
    }

    if (DISPLAY_FORMATS.has(cfg.format) && ref.current) {
      if (cfg.capPerSession > 0 && sessionStorage.getItem(sessionCapKey(slot))) return;
      if (scriptUrl) loadScriptOnce(scriptUrl);
      const host = ref.current;
      host.innerHTML = "";
      const ins = document.createElement("ins");
      ins.className = "eas6a97888e2";
      ins.setAttribute("data-zoneid", String(cfg.zoneId));
      host.appendChild(ins);
      const push = document.createElement("script");
      push.type = "application/javascript";
      push.textContent = `(AdProvider = window.AdProvider || []).push({"serve": {}});`;
      host.appendChild(push);
      if (cfg.capPerSession > 0) sessionStorage.setItem(sessionCapKey(slot), "1");
    }
  }, [cfg, scriptUrl, slot, isFree, onVastUrl]);

  if (!isFree) return null;
  if (!cfg) return null;
  if (cfg.format === "vast") return null;
  if (POPUNDER_FORMATS.has(cfg.format)) return null;

  const [w, h] = (cfg.size || "").split("x").map((n) => parseInt(n, 10));
  const dimStyle: React.CSSProperties =
    Number.isFinite(w) && Number.isFinite(h) ? { minWidth: w, minHeight: h } : {};

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...dimStyle, ...style }}
      data-ad-slot={slot}
      aria-hidden="true"
    />
  );
}

export default AdSlot;
