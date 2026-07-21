import React, { useState, useEffect } from "react";
import { CryptoOnboardingWizard } from "@/components/payments/CryptoOnboardingWizard";

type Lang = "en" | "es";

const LANG_KEY = "pnptv:lang";

function getInitialLang(): Lang {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s === "en" || s === "es") return s;
  } catch { /* ignore */ }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const isEn = lang === "en";
  const base: React.CSSProperties = { background: "none", border: "none", padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 18, minHeight: 36, minWidth: 44 };
  return (
    <div style={{ display: "flex", background: "rgba(255,255,255,0.10)", borderRadius: 20, padding: 2 }}>
      <button onClick={() => onChange("en")} style={{ ...base, background: isEn ? "#fff" : "transparent", color: isEn ? "#120d14" : "#8E8E93" }}>EN</button>
      <button onClick={() => onChange("es")} style={{ ...base, background: !isEn ? "#fff" : "transparent", color: !isEn ? "#120d14" : "#8E8E93" }}>ES</button>
    </div>
  );
}

const PAGE_TITLE: Record<Lang, string> = {
  en: "Pay with Crypto — PNPtv!",
  es: "Paga con Cripto — PNPtv!",
};

export default function CryptoGuide() {
  const [lang, setLang] = useState<Lang>(getInitialLang);

  useEffect(() => { document.title = PAGE_TITLE[lang]; }, [lang]);

  const handleLangChange = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--pnp-background, #121212)", color: "#ffffff", overflowX: "hidden" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", maxWidth: 680, margin: "0 auto" }}>
        <a href="/"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 32, width: "auto" }} /></a>
        <LangToggle lang={lang} onChange={handleLangChange} />
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "8px 20px 80px" }}>
        <CryptoOnboardingWizard lang={lang} />
      </div>
    </div>
  );
}
