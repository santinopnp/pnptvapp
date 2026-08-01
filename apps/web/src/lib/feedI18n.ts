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

// Lightweight markdown renderer for user bio / about-me text.
// Supports **bold**, *italic*, _italic_, ~~strike~~, autolinked http(s) URLs, and line breaks.
// React elements only — no dangerouslySetInnerHTML, so text is auto-escaped.
export function formatBio(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  return lines.map((line, li) =>
    React.createElement(
      React.Fragment,
      { key: li },
      li > 0 ? React.createElement("br") : null,
      ...renderInline(line, li)
    )
  );
}

function renderInline(input: string, lineIdx: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*\n]+)\*\*)|(~~([^~\n]+)~~)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|((?:https?:\/\/)[^\s<>"]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  const mkKey = () => `${lineIdx}-${key++}`;
  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) nodes.push(input.slice(lastIndex, match.index));
    if (match[2] !== undefined) {
      nodes.push(React.createElement("strong", { key: mkKey() }, match[2]));
    } else if (match[4] !== undefined) {
      nodes.push(React.createElement("s", { key: mkKey() }, match[4]));
    } else if (match[6] !== undefined) {
      nodes.push(React.createElement("em", { key: mkKey() }, match[6]));
    } else if (match[8] !== undefined) {
      nodes.push(React.createElement("em", { key: mkKey() }, match[8]));
    } else if (match[9] !== undefined) {
      const url = match[9];
      nodes.push(
        React.createElement(
          "a",
          {
            key: mkKey(),
            href: url,
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            className: "text-pnp-accent underline hover:opacity-80",
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
