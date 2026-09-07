import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { blog } from "@/lib/i18n/blog";

type Lang = "en" | "es";

const LANG_KEY = "pnptv:blog:lang";

function getInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {}
  return navigator.language?.startsWith("es") ? "es" : "en";
}

function saveLang(lang: Lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
}

function findArticle(slug: string) {
  for (const lang of ["en", "es"] as Lang[]) {
    const idx = (blog[lang].articles as readonly { slug: string; title: string; date: string; category: string; summary: string; content: string }[]).findIndex((a) => a.slug === slug);
    if (idx !== -1) return { article: blog[lang].articles[idx], lang: lang as Lang, idx };
  }
  return null;
}

function CategoryBadge({ category, label }: { category: string; label: string }) {
  const colors: Record<string, string> = {
    community: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    safety: "bg-green-500/20 text-green-300 border-green-500/30",
    creators: "bg-pnp-amber/20 text-pnp-amber border-pnp-amber/30",
    platform: "bg-pnp-accent/20 text-pnp-accent border-pnp-accent/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[category] ?? "bg-white/10 text-white/60 border-white/20"}`}>
      {label}
    </span>
  );
}

function LangToggle({ lang, onToggle }: { lang: Lang; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-0.5 px-2.5 py-1 rounded-full border text-xs font-bold transition-all hover:border-white/20"
      style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}
      title="Switch language"
    >
      <span style={{ color: lang === "en" ? "white" : "rgba(255,255,255,0.28)" }}>EN</span>
      <span style={{ color: "rgba(255,255,255,0.18)", margin: "0 2px" }}>|</span>
      <span style={{ color: lang === "es" ? "white" : "rgba(255,255,255,0.28)" }}>ES</span>
    </button>
  );
}

function ArticleContent({ content }: { content: string }) {
  return (
    <div className="space-y-4" style={{ userSelect: "text" }}>
      {content.split("\n\n").map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (/^\d+\.\s/.test(trimmed)) {
          const items = trimmed.split("\n").filter((l) => l.trim());
          return (
            <ol key={i} className="list-decimal list-inside space-y-2 text-sm pl-1" style={{ color: "rgba(255,255,255,0.72)" }}>
              {items.map((item, j) => <li key={j}>{item.replace(/^\d+\.\s*/, "")}</li>)}
            </ol>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

function TopBar({ onBack, isAuthenticated, langToggle }: { onBack: () => void; isAuthenticated: boolean; langToggle: React.ReactNode }) {
  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-3"
      style={{ background: "rgba(10,10,11,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-white/60 hover:text-white transition-colors" aria-label="Go back">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Link to="/" className="flex items-center gap-1.5">
          <span className="text-sm font-black text-white">PNPtv</span>
          <span className="text-sm font-black text-pnp-accent">!</span>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {langToggle}
        {!isAuthenticated && (
          <>
            <Link to="/auth" className="text-xs font-medium text-white/70 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20">
              Log In
            </Link>
            <Link to="/join" className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg btn-gradient">
              Join Free
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function MiniFooter() {
  return (
    <div className="border-t px-4 py-8 text-center" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>&copy; 2026 PNPtv!</p>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {[{ href: "/terms", label: "Terms" }, { href: "/privacy", label: "Privacy" }, { href: "/safety", label: "Safety" }].map(({ href, label }) => (
          <Link key={href} to={href} className="text-xs hover:underline transition-colors" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</Link>
        ))}
      </div>
    </div>
  );
}

export default function BlogPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    saveLang(next);
  };

  // Backward compat: /blog?open=<slug> → /blog/<slug>
  useEffect(() => {
    const openParam = searchParams.get("open");
    if (openParam && !slug) navigate(`/blog/${openParam}`, { replace: true });
  }, [searchParams, slug, navigate]);

  const t = blog[lang];

  const categoryLabels: Record<string, string> = {
    community: t.categories.community,
    safety: t.categories.safety,
    creators: t.categories.creators,
    platform: t.categories.platform,
  };

  // ── SINGLE ARTICLE VIEW ──────────────────────────────────────────
  if (slug) {
    const found = findArticle(slug);

    if (!found) {
      return (
        <div className="min-h-dvh bg-pnp-background text-white flex flex-col">
          <TopBar onBack={() => navigate("/blog")} isAuthenticated={isAuthenticated} langToggle={null} />
          <div className="flex-1 flex items-center justify-center flex-col gap-4">
            <p className="text-white/40 text-sm">Article not found.</p>
            <Link to="/blog" className="text-pnp-accent text-sm hover:underline">Back to Blog</Link>
          </div>
        </div>
      );
    }

    const { article, lang: articleLang, idx } = found;
    const otherLang: Lang = articleLang === "en" ? "es" : "en";
    const counterpart = (blog[otherLang].articles as readonly { slug: string }[])[idx];

    const articleCategoryLabels: Record<string, string> = {
      community: blog[articleLang].categories.community,
      safety: blog[articleLang].categories.safety,
      creators: blog[articleLang].categories.creators,
      platform: blog[articleLang].categories.platform,
    };

    const handleDetailLangToggle = () => {
      if (counterpart) {
        saveLang(otherLang);
        setLang(otherLang);
        navigate(`/blog/${counterpart.slug}`, { replace: true });
      }
    };

    return (
      <>
        <Helmet>
          <title>{article.title} — PNPtv!</title>
          <meta name="description" content={article.summary} />
          <meta property="og:title" content={article.title} />
          <meta property="og:description" content={article.summary} />
          <meta property="og:type" content="article" />
        </Helmet>

        <div className="min-h-dvh bg-pnp-background text-white">
          <TopBar
            onBack={() => navigate("/blog")}
            isAuthenticated={isAuthenticated}
            langToggle={
              counterpart ? (
                <LangToggle lang={articleLang} onToggle={handleDetailLangToggle} />
              ) : null
            }
          />

          <div className="max-w-2xl mx-auto px-4 pt-8 pb-16">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <CategoryBadge category={article.category} label={articleCategoryLabels[article.category] ?? article.category} />
              <span className="text-xs text-white/30">{article.date}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white mb-5 leading-tight" style={{ userSelect: "text" }}>{article.title}</h1>

            <p className="text-sm leading-relaxed mb-8 pb-8 italic" style={{ color: "rgba(255,255,255,0.50)", borderBottom: "1px solid rgba(255,255,255,0.07)", userSelect: "text" }}>
              {article.summary}
            </p>

            <ArticleContent content={article.content} />

            <div className="mt-12 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={() => navigate("/blog")} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {articleLang === "en" ? "Back to Blog" : "Volver al Blog"}
              </button>
            </div>
          </div>

          <MiniFooter />
        </div>
      </>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────
  const categories = [
    { key: "all", label: t.categories.all },
    { key: "community", label: t.categories.community },
    { key: "safety", label: t.categories.safety },
    { key: "creators", label: t.categories.creators },
    { key: "platform", label: t.categories.platform },
  ];

  const filteredArticles = activeCategory === "all"
    ? t.articles
    : t.articles.filter((a) => a.category === activeCategory);

  return (
    <>
      <Helmet>
        <title>{t.pageTitle}</title>
        <meta name="description" content={t.pageDescription} />
        <meta property="og:title" content={t.pageTitle} />
        <meta property="og:description" content={t.pageDescription} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-dvh bg-pnp-background text-white">
        <TopBar
          onBack={() => navigate(-1)}
          isAuthenticated={isAuthenticated}
          langToggle={<LangToggle lang={lang} onToggle={toggleLang} />}
        />

        {/* Hero */}
        <div className="relative overflow-hidden px-4 pt-10 pb-8 text-center">
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,0,122,0.12) 0%, transparent 70%)" }} />
          <h1 className="relative text-3xl sm:text-4xl font-black text-white mb-3">{t.pageHeading}</h1>
          <p className="relative text-sm text-white/60 max-w-md mx-auto">{t.pageSubtitle}</p>
        </div>

        {/* Category filters */}
        <div className="px-4 mb-6 flex gap-2 flex-wrap justify-center">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                activeCategory === cat.key
                  ? "border-pnp-accent text-white bg-pnp-accent/15"
                  : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/70 bg-white/[0.04]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Article cards */}
        <div className="max-w-4xl mx-auto px-4 pb-12 space-y-4">
          {filteredArticles.map((article) => (
            <article
              key={article.slug}
              className="rounded-2xl border transition-all duration-200 hover:border-pnp-accent/30 cursor-pointer"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}
              onClick={() => navigate(`/blog/${article.slug}`)}
            >
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <CategoryBadge category={article.category} label={categoryLabels[article.category] ?? article.category} />
                  <span className="text-xs text-white/30">{article.date}</span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-white leading-snug mb-2">{article.title}</h2>
                <p className="text-sm text-white/55 leading-relaxed mb-4">{article.summary}</p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-pnp-accent">
                  {lang === "en" ? "Read article" : "Leer artículo"}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </article>
          ))}
        </div>

        <MiniFooter />
      </div>
    </>
  );
}
