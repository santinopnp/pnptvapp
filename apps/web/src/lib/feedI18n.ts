import React from "react";

/**
 * Feed UI translations (EN / ES).
 * Keyed to the user's `language` profile field set via the Profile toggle.
 */

const strings = {
  en: {
    // Social page header
    socialFeedTitle: "Social Feed",
    socialFeedSubtitle: "Share updates with the PNPTV community",
    community: "Community",
    // Featured performers
    featured: "Featured",
    live: "Live",
    // Composer
    whatOnYourMind: "What's on your mind?",
    photo: "Photo",
    video: "Video",
    post: "Post",
    posting: "Posting...",
    bulkUploadVideos: "Bulk Upload Videos",
    exclusiveToggle: "Exclusive content (subscribers only)",
    allowSharing: "Allow sharing",
    // Tabs
    allPosts: "All Posts",
    wallOfFame: "Wall of Fame",
    following: "Following",
    // Feed states
    feedUnavailable: "Feed Unavailable",
    retry: "Retry",
    noPostsYet: "No Posts Yet",
    beTheFirst: "Be the first to share something with the community!",
    noWofPostsYet: "No Wall of Fame Posts Yet",
    wofHint: "Post photos in the Telegram group to appear here!",
    noFollowingPostsYet: "No Posts Yet",
    followSomeone: "Follow some creators to see their posts here",
    loadMore: "Load More",
    loading: "Loading...",
    // Post actions
    translate: "Translate",
    showOriginal: "Show original",
    translating: "...",
    // Comments
    writeComment: "Write a comment...",
    send: "Send",
    loadingComments: "Loading comments...",
    noCommentsYet: "No comments yet",
    // WoF removal
    remove: "Remove",
    removing: "Removing...",
    // Home page
    socialFeed: "Social Feed",
    viewAll: "View all",
    viewAllPosts: "View all posts",
    noPostsHome: "No posts yet",
    beFirstHome: "Be the first to post something!",
  },
  es: {
    socialFeedTitle: "Feed Social",
    socialFeedSubtitle: "Comparte con la comunidad de PNPtv",
    community: "Comunidad",
    featured: "Destacados",
    live: "En vivo",
    whatOnYourMind: "¿Qué estás pensando?",
    photo: "Foto",
    video: "Video",
    post: "Publicar",
    posting: "Publicando...",
    bulkUploadVideos: "Subir videos en lote",
    exclusiveToggle: "Contenido exclusivo (solo suscriptores)",
    allowSharing: "Permitir compartir",
    allPosts: "Todos",
    wallOfFame: "Muro de la Fama",
    following: "Siguiendo",
    feedUnavailable: "Feed no disponible",
    retry: "Reintentar",
    noPostsYet: "Aún no hay publicaciones",
    beTheFirst: "¡Sé el primero en compartir algo con la comunidad!",
    noWofPostsYet: "Aún no hay publicaciones en el Muro de la Fama",
    wofHint: "¡Publica fotos en el grupo de Telegram para aparecer aquí!",
    noFollowingPostsYet: "Aún no hay publicaciones",
    followSomeone: "Sigue a creadores para ver sus publicaciones aquí",
    loadMore: "Cargar más",
    loading: "Cargando...",
    translate: "Traducir",
    showOriginal: "Ver original",
    translating: "...",
    writeComment: "Escribe un comentario...",
    send: "Enviar",
    loadingComments: "Cargando comentarios...",
    noCommentsYet: "Aún no hay comentarios",
    remove: "Eliminar",
    removing: "Eliminando...",
    socialFeed: "Feed Social",
    viewAll: "Ver todo",
    viewAllPosts: "Ver todas las publicaciones",
    noPostsHome: "Aún no hay publicaciones",
    beFirstHome: "¡Sé el primero en publicar algo!",
  },
} as const;

export type FeedStrings = (typeof strings)["en"] | (typeof strings)["es"];

export function useFeedI18n(lang?: string | null): FeedStrings {
  return strings[lang === "es" ? "es" : "en"];
}

/**
 * Translate `text` to the target language using the MyMemory free API.
 * Source language is auto-detected by the service.
 * Returns null on failure.
 */
export async function translateText(
  text: string,
  targetLang: string
): Promise<string | null> {
  if (!text.trim()) return null;
  const ALLOWED_LANGS = new Set(["en","es","pt","zh","zhTW","fr","de","th","it","tr","ru","nl","vi","ja","id","ar"]);
  const lang = ALLOWED_LANGS.has(targetLang) ? targetLang : "en";
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=autodetect|${encodeURIComponent(lang)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
      return data.responseData.translatedText as string;
    }
  } catch { /* network error */ }
  return null;
}

// Rich markdown renderer for user bio / about-me text.
// Supports headings (#, ##, ###), lists (- or 1.), blockquotes (>), [links](url), `code`, **bold**, *italic*, ~~strike~~, and line breaks.
// React elements only — no dangerouslySetInnerHTML, so text is auto-escaped.
export function formatBio(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  
  const elements: React.ReactNode[] = [];
  let inBulletList = false;
  let bulletItems: React.ReactNode[] = [];
  let inNumberedList = false;
  let numberedItems: React.ReactNode[] = [];

  const flushLists = () => {
    if (inBulletList && bulletItems.length > 0) {
      elements.push(
        React.createElement("ul", { key: `ul-${elements.length}`, className: "list-disc list-inside space-y-1 my-1.5 pl-1 text-white/90" }, ...bulletItems)
      );
      bulletItems = [];
      inBulletList = false;
    }
    if (inNumberedList && numberedItems.length > 0) {
      elements.push(
        React.createElement("ol", { key: `ol-${elements.length}`, className: "list-decimal list-inside space-y-1 my-1.5 pl-1 text-white/90" }, ...numberedItems)
      );
      numberedItems = [];
      inNumberedList = false;
    }
  };

  lines.forEach((line, li) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushLists();
      elements.push(React.createElement("div", { key: `blank-${li}`, className: "h-1.5" }));
      return;
    }

    if (/^#\s+/.test(trimmed)) {
      flushLists();
      const content = trimmed.replace(/^#\s+/, "");
      elements.push(
        React.createElement("h1", { key: `h1-${li}`, className: "text-base font-bold text-white mt-3 mb-1 border-b border-white/10 pb-1" }, ...renderInline(content, li))
      );
      return;
    }

    if (/^##\s+/.test(trimmed)) {
      flushLists();
      const content = trimmed.replace(/^##\s+/, "");
      elements.push(
        React.createElement("h2", { key: `h2-${li}`, className: "text-sm font-bold text-pink-400 mt-3 mb-1" }, ...renderInline(content, li))
      );
      return;
    }

    if (/^###\s+/.test(trimmed)) {
      flushLists();
      const content = trimmed.replace(/^###\s+/, "");
      elements.push(
        React.createElement("h3", { key: `h3-${li}`, className: "text-xs font-semibold text-amber-300 mt-2 mb-1" }, ...renderInline(content, li))
      );
      return;
    }

    if (/^>\s+/.test(trimmed)) {
      flushLists();
      const content = trimmed.replace(/^>\s+/, "");
      elements.push(
        React.createElement(
          "blockquote",
          { key: `bq-${li}`, className: "border-l-2 border-pink-500/50 pl-3 py-1 my-1 text-white/80 italic bg-white/[0.02] rounded-r text-xs" },
          ...renderInline(content, li)
        )
      );
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (inNumberedList) flushLists();
      inBulletList = true;
      const content = trimmed.replace(/^[-*]\s+/, "");
      bulletItems.push(
        React.createElement("li", { key: `li-${li}`, className: "text-xs leading-relaxed" }, ...renderInline(content, li))
      );
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (inBulletList) flushLists();
      inNumberedList = true;
      const content = trimmed.replace(/^\d+\.\s+/, "");
      numberedItems.push(
        React.createElement("li", { key: `oli-${li}`, className: "text-xs leading-relaxed" }, ...renderInline(content, li))
      );
      return;
    }

    flushLists();
    elements.push(
      React.createElement(
        "p",
        { key: `p-${li}`, className: "text-xs leading-relaxed text-white/90" },
        ...renderInline(line, li)
      )
    );
  });

  flushLists();

  return React.createElement("div", { className: "space-y-1 my-1" }, ...elements);
}

function renderInline(input: string, lineIdx: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s<>"'\)]+|\/[^\s<>"'\)]+)\)|`([^`\n]+)`|(\*\*([^*\n]+)\*\*)|(~~([^~\n]+)~~)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|((?:https?:\/\/)[^\s<>"]*[^\s<>".,;:!?)\]}])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  const mkKey = () => `${lineIdx}-${key++}`;

  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) nodes.push(input.slice(lastIndex, match.index));

    if (match[1] !== undefined && match[2] !== undefined) {
      const label = match[1];
      const url = match[2];
      nodes.push(
        React.createElement(
          "a",
          {
            key: mkKey(),
            href: url,
            target: url.startsWith("/") ? undefined : "_blank",
            rel: url.startsWith("/") ? undefined : "noopener noreferrer nofollow",
            className: "text-pink-400 font-semibold underline hover:text-pink-300 transition-colors",
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
          },
          label
        )
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        React.createElement(
          "code",
          {
            key: mkKey(),
            className: "bg-white/10 text-pink-300 font-mono text-[11px] px-1.5 py-0.5 rounded border border-white/10",
          },
          match[3]
        )
      );
    } else if (match[5] !== undefined) {
      nodes.push(React.createElement("strong", { key: mkKey(), className: "font-bold text-white" }, match[5]));
    } else if (match[7] !== undefined) {
      nodes.push(React.createElement("s", { key: mkKey(), className: "line-through opacity-70" }, match[7]));
    } else if (match[9] !== undefined) {
      nodes.push(React.createElement("em", { key: mkKey(), className: "italic text-white/90" }, match[9]));
    } else if (match[11] !== undefined) {
      nodes.push(React.createElement("em", { key: mkKey(), className: "italic text-white/90" }, match[11]));
    } else if (match[12] !== undefined) {
      const url = match[12];
      nodes.push(
        React.createElement(
          "a",
          {
            key: mkKey(),
            href: url,
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            className: "text-pink-400 font-semibold underline hover:text-pink-300 transition-colors",
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
          },
          url
        )
      );
    }

    lastIndex = re.lastIndex;
  }

  if (lastIndex < input.length) nodes.push(input.slice(lastIndex));
  return nodes;
}
