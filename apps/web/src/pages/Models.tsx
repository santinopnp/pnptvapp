import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { getAllPerformers, type FeaturedPerformer } from "@/lib/api";
import { PerformerDrawer } from "@/components/live/PerformerDrawer";
import { PayWithCryptoWizard } from "@/components/payments/PayWithCryptoWizard";

const ALLOWED_IMAGE_HOSTS = ["cms.pnptv.app", "app.pnptv.app", "pnptv.app"];
function isValidPhotoUrl(photo: string | null | undefined): photo is string {
  if (!photo) return false;
  if (photo.startsWith("/uploads/")) return true;
  try {
    const url = new URL(photo);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      ALLOWED_IMAGE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}

export default function Models() {
  const { user } = useAuth();
  const t = useI18n();
  const es = t.lang === "es";

  const [performers, setPerformers] = useState<FeaturedPerformer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawerPerformer, setDrawerPerformer] = useState<FeaturedPerformer | null>(null);
  const [showCryptoWizard, setShowCryptoWizard] = useState(false);

  useEffect(() => {
    getAllPerformers()
      .then((res) => {
        if (res.success) {
          setPerformers(res.performers);
        } else {
          setError(es ? "No se pudieron cargar los creadores." : "Failed to load creators.");
        }
      })
      .catch((err) => setError(err?.message || (es ? "No se pudieron cargar los creadores." : "Failed to load creators.")))
      .finally(() => setLoading(false));
  }, [es]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return performers;
    return performers.filter((p) => {
      const haystack = [p.displayName, p.name, p.bio, p.city, p.country]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [performers, query]);

  return (
    <div className="page-container py-6 px-4 max-w-5xl mx-auto">
      <Helmet>
        <title>{es ? "Modelos y Creadores | PNPtv" : "Models & Creators | PNPtv"}</title>
        <meta
          name="description"
          content={es ? "Busca y descubre a nuestros creadores y performers." : "Search and discover our content creators and performers."}
        />
      </Helmet>

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-pnp-textPrimary mb-1">
          {es ? "Modelos y Creadores" : "Models & Creators"}
        </h1>
        <p className="text-sm text-pnp-textSecondary">
          {es ? "Busca performers y creadores de contenido, y reserva o suscríbete." : "Search performers and content creators, then book or subscribe."}
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-3 group">
        <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center z-10">
          <svg className="w-4 h-4 text-pnp-textSecondary group-focus-within:text-pnp-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7 7 0 104.65 4.65a7 7 0 0011.9 11.9z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={es ? "Buscar por nombre, ciudad o país…" : "Search by name, city, or country…"}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-pnp-surface border border-pnp-border text-sm text-pnp-textPrimary placeholder:text-pnp-textSecondary/60 focus:outline-none focus:ring-2 focus:ring-pnp-accent"
          aria-label={es ? "Buscar creadores" : "Search creators"}
        />
      </div>

      {/* Pay-with-crypto wizard entry point */}
      <button
        type="button"
        onClick={() => setShowCryptoWizard(true)}
        className="w-full flex items-center gap-3 px-4 py-3 mb-5 rounded-xl text-left transition-all active:scale-[0.99] hover:opacity-95"
        style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(6,182,212,0.10))", border: "1px solid rgba(16,185,129,0.28)" }}
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg,#10B981,#06B6D4)" }}>
          <span className="text-base">🪙</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-pnp-textPrimary">
            {es ? "Asistente de pago con cripto" : "Pay-with-crypto wizard"}
          </p>
          <p className="text-xs text-pnp-textSecondary mt-0.5 truncate">
            {es ? "Suscríbete o desbloquea acceso con USDT, BTC y más" : "Subscribe or unlock access with USDT, BTC, and more"}
          </p>
        </div>
        <span className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white whitespace-nowrap" style={{ background: "linear-gradient(90deg,#10B981,#06B6D4)" }}>
          {es ? "Iniciar" : "Start"}
        </span>
      </button>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-pnp-surface animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-pnp-error text-center py-8">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-pnp-textSecondary text-center py-8">
          {es ? "No se encontraron creadores con esa búsqueda." : "No creators matched your search."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {filtered.map((p) => {
            const imgSrc = isValidPhotoUrl(p.photoUrl) ? p.photoUrl : null;
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`${es ? "Ver perfil de" : "Open"} ${p.displayName}`}
                onClick={() => setDrawerPerformer(p)}
                onKeyDown={(e) => { if (e.key === "Enter") setDrawerPerformer(p); }}
                className="group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform bg-pnp-surface"
              >
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={p.displayName}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-pnp-accent/70 to-purple-600/70 flex items-center justify-center text-white text-3xl font-bold select-none" aria-hidden="true">
                    {(p.displayName || "?").charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

                {p.isLive ? (
                  <span className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" aria-hidden="true" />
                    LIVE
                  </span>
                ) : p.isAvailable ? (
                  <span className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full text-white text-[10px] font-bold shadow-lg" style={{ background: "#5ED1C4" }}>
                    {es ? "Disponible" : "Available"}
                  </span>
                ) : null}

                {p.isOnline && !p.isLive && (
                  <span className="absolute top-2 right-2 z-10 flex h-3 w-3" aria-label="Online">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-black/40" />
                  </span>
                )}

                <div className="absolute bottom-0 left-0 right-0 z-10 px-2.5 pb-2.5 pt-8">
                  <p className="text-white text-xs font-bold truncate drop-shadow-md leading-tight">{p.displayName}</p>
                  {(p.city || p.country) && (
                    <p className="text-white/70 text-[10px] truncate drop-shadow-sm leading-tight mt-0.5">
                      {[p.city, p.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {p.basePrice > 0 && (
                    <p className="text-white/90 text-[10px] font-semibold drop-shadow-sm leading-tight mt-0.5">
                      {es ? "Desde" : "From"} ${p.basePrice}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Performer detail drawer — book a call / subscribe / watch live */}
      {drawerPerformer && (
        <PerformerDrawer
          performer={drawerPerformer}
          onClose={() => setDrawerPerformer(null)}
          currentUserId={user?.id}
        />
      )}

      {/* Pay with Crypto Wizard */}
      <PayWithCryptoWizard open={showCryptoWizard} onClose={() => setShowCryptoWizard(false)} />
    </div>
  );
}
