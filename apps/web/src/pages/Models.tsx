import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { getAllPerformers, type FeaturedPerformer } from "@/lib/api";
import { PerformerDrawer } from "@/components/live/PerformerDrawer";
import { AppShell, RightRail, SuggestedFollowRow, ContextHintCard, useForYou } from "@/components/Layout";

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
  const { data: forYou } = useForYou("discover");

  const [performers, setPerformers] = useState<FeaturedPerformer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawerPerformer, setDrawerPerformer] = useState<FeaturedPerformer | null>(null);

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

  const modelsRail = (
    <>
      {(forYou?.contextHints ?? []).length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <ul>{(forYou?.contextHints ?? []).slice(0, 3).map((hint, i) => (
            <ContextHintCard key={i} hint={hint} />
          ))}</ul>
        </div>
      )}
      <RightRail
        sections={[
          {
            title: t.nav.railYouMightFollow,
            items: (forYou?.suggestedFollows ?? []).slice(0, 4).map((f) => (
              <SuggestedFollowRow
                key={f.userId}
                item={f}
                followLabel={t.nav.railFollow}
                viewLabel={t.nav.railView}
              />
            )),
          },
        ]}
      />
    </>
  );

  return (
    <AppShell rightRail={modelsRail}>
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

      {/* New-to-crypto onboarding card — links to /crypto-guide */}
      <a
        href="/crypto-guide"
        className="group block w-full mb-5 rounded-2xl overflow-hidden transition-transform active:scale-[0.99] hover:-translate-y-0.5"
        style={{
          background: "linear-gradient(135deg, rgba(247,147,26,0.16) 0%, rgba(0,141,228,0.12) 55%, rgba(16,185,129,0.14) 100%)",
          border: "1px solid rgba(247,147,26,0.35)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.03) inset",
        }}
      >
        <div className="p-4 flex items-center gap-3.5">
          <div className="relative flex-shrink-0" style={{ width: 56, height: 44 }}>
            {[
              { bg: "#F7931A", letter: "₿", offset: 0,  z: 40, ring: "#F7931A" },
              { bg: "#26A17B", letter: "₮", offset: 14, z: 30, ring: "#26A17B" },
              { bg: "#008DE4", letter: "Đ", offset: 28, z: 20, ring: "#008DE4" },
              { bg: "#5ED1C4", letter: "$", offset: 42, z: 10, ring: "#5ED1C4" },
            ].map((c) => (
              <div
                key={c.letter}
                className="absolute top-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-lg"
                style={{
                  left: c.offset,
                  zIndex: c.z,
                  background: c.bg,
                  border: "2.5px solid #0D0D0D",
                  boxShadow: `0 0 12px ${c.ring}55`,
                }}
                aria-hidden="true"
              >
                {c.letter}
              </div>
            ))}
          </div>

          <div className="flex-1 min-w-0 ml-4">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
                style={{ background: "rgba(247,147,26,0.2)", color: "#F7931A", border: "1px solid rgba(247,147,26,0.4)" }}
              >
                {es ? "Guía completa" : "Full guide"}
              </span>
              <span className="text-[10px] font-semibold text-pnp-textSecondary">
                {es ? "3 min de lectura" : "3 min read"}
              </span>
            </div>
            <p className="text-sm font-bold text-pnp-textPrimary leading-tight">
              {es ? "¿Primera vez pagando con crypto?" : "First time paying with crypto?"}
            </p>
            <p className="text-xs text-pnp-textSecondary mt-1 leading-snug">
              {es
                ? "Desbloquea creadores con USDT, Bitcoin o Dash en 5 minutos."
                : "Unlock creators with USDT, Bitcoin or Dash in 5 minutes."}
            </p>
          </div>

          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-0.5"
            style={{ background: "linear-gradient(135deg,#F7931A,#D4007A)", boxShadow: "0 4px 12px rgba(247,147,26,0.35)" }}
            aria-hidden="true"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
        </div>
      </a>

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

    </div>
    </AppShell>
  );
}
