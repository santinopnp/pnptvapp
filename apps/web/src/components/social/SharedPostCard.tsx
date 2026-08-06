import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { togglePostLike, togglePostHype, sharePostToHangouts, sharePostToDm, getHangoutGroups, type PostCardSnapshot, type HangoutGroup } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { MentionText } from "@/components/MentionText";
import { VideoPlayer } from "@/components/VideoPlayer";

// Shared rendering for `message_type === "post_card"` messages used in both
// hangout chat and DMs. Goal: card with rich preview that gives visibility to
// the original poster + drives interactions (inline like, jump to replies).
//
// Backend snapshot is captured at share time (see socialController
// .sharePostToHangouts and dmService.sharePostToDm). Counts are point-in-time
// and intentionally NOT refreshed — older shares show older numbers, which is
// fine. The inline like button hits the live post via togglePostLike() and
// updates the local count optimistically.

interface Props {
  postId: number;
  snapshot: PostCardSnapshot;
  /** Theming hint — when the message bubble is the viewer's own outbound message */
  isMe?: boolean;
}

function relativeTime(iso?: string | null, lang: "en" | "es" = "en"): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  const sec = Math.max(1, Math.floor(diff / 1000));
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (lang === "es") {
    if (day >= 7) return `${Math.floor(day / 7)}sem`;
    if (day >= 1) return `${day}d`;
    if (hour >= 1) return `${hour}h`;
    if (min >= 1) return `${min}m`;
    return "ahora";
  }
  if (day >= 7) return `${Math.floor(day / 7)}w`;
  if (day >= 1) return `${day}d`;
  if (hour >= 1) return `${hour}h`;
  if (min >= 1) return `${min}m`;
  return "now";
}

export function SharedPostCard({ postId, snapshot, isMe = false }: Props) {
  const navigate = useNavigate();
  const { lang } = useI18n();

  const handleName = snapshot.authorUsername
    ? `@${snapshot.authorUsername}`
    : (snapshot.authorFirstName || (lang === "es" ? "Usuario" : "User"));
  const authorPath = snapshot.authorUsername ? `/profile/${snapshot.authorUsername}` : null;

  const isVideo = snapshot.mediaType === "video";
  const isImage = snapshot.mediaType === "image" || (!isVideo && !!snapshot.mediaUrl);
  const isCreator = snapshot.authorCreatorStatus === "active";
  const isPrime = snapshot.authorTier === "PRIME";
  const isLocked = !!snapshot.isExclusive;

  const initialLikes = Number.isFinite(snapshot.likesCount as number)
    ? Math.max(0, snapshot.likesCount as number)
    : 0;
  const replyCount = Number.isFinite(snapshot.repliesCount as number)
    ? Math.max(0, snapshot.repliesCount as number)
    : 0;

  const [likes, setLikes] = useState<number>(initialLikes);
  const [liked, setLiked] = useState<boolean>(false);
  const [likePending, setLikePending] = useState<boolean>(false);

  const [hyped, setHyped] = useState<boolean>(false);
  const [hypePending, setHypePending] = useState<boolean>(false);

  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [shareStep, setShareStep] = useState<"main" | "hangout" | "dm">("main");
  const [shareHangouts, setShareHangouts] = useState<HangoutGroup[]>([]);
  const [shareHangoutsLoaded, setShareHangoutsLoaded] = useState<boolean>(false);
  const [shareDmInput, setShareDmInput] = useState<string>("");
  const [shareSending, setShareSending] = useState<boolean>(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  const relTime = relativeTime(snapshot.postCreatedAt, lang === "es" ? "es" : "en");

  const handleHype = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hypePending) return;
    setHypePending(true);
    const willHype = !hyped;
    setHyped(willHype);
    try {
      await togglePostHype(postId);
    } catch {
      setHyped(!willHype);
    } finally {
      setHypePending(false);
    }
  };

  const handleOpenShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShareOpen(true);
    setShareStep("main");
    setShareSuccess(null);
    setShareDmInput("");
    if (!shareHangoutsLoaded) {
      try {
        const res = await getHangoutGroups();
        setShareHangouts(res.groups ?? []);
        setShareHangoutsLoaded(true);
      } catch { setShareHangouts([]); }
    }
  }, [shareHangoutsLoaded]);

  const handleCloseShare = useCallback(() => {
    setShareOpen(false);
    setShareStep("main");
    setShareSuccess(null);
    setShareDmInput("");
    setShareSending(false);
  }, []);

  const handleShareToHangout = useCallback(async (groupId: number) => {
    if (shareSending) return;
    setShareSending(true);
    try {
      await sharePostToHangouts(postId, [groupId]);
      setShareSuccess(lang === "es" ? "Compartido!" : "Shared!");
      setTimeout(handleCloseShare, 1200);
    } catch { setShareSending(false); }
  }, [postId, shareSending, handleCloseShare, lang]);

  const handleShareToDm = useCallback(async () => {
    if (!shareDmInput.trim() || shareSending) return;
    setShareSending(true);
    try {
      await sharePostToDm(shareDmInput.trim(), postId);
      setShareSuccess(lang === "es" ? "Enviado!" : "Sent!");
      setTimeout(handleCloseShare, 1200);
    } catch { setShareSending(false); }
  }, [postId, shareDmInput, shareSending, handleCloseShare, lang]);

  const goToProfile = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (authorPath) navigate(authorPath);
  };
  const goToPost = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    navigate(`/social/post/${postId}`);
  };
  const goToReplies = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/social/post/${postId}#replies`);
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (likePending) return;
    setLikePending(true);
    // Optimistic toggle.
    const willLike = !liked;
    setLiked(willLike);
    setLikes((n) => Math.max(0, n + (willLike ? 1 : -1)));
    try {
      const res = await togglePostLike(postId);
      // If the server reports a different state, sync up.
      if (typeof res.liked === "boolean" && res.liked !== willLike) {
        setLiked(res.liked);
      }
      if (typeof res.likes_count === "number") {
        setLikes(Math.max(0, res.likes_count));
      }
    } catch {
      // Roll back on failure.
      setLiked(!willLike);
      setLikes((n) => Math.max(0, n + (willLike ? -1 : 1)));
    } finally {
      setLikePending(false);
    }
  };

  // Theming — own bubble (right-aligned) gets brighter text and pinker accents
  const accent = isMe ? "rgba(255,255,255,0.95)" : "#5ED1C4";
  const subText = isMe ? "text-white/80" : "text-white/85";
  const mutedText = isMe ? "text-white/60" : "text-pnp-textSecondary";

  return (
    <>
      {snapshot.note && (
        <p className="mb-1.5">
          <MentionText text={snapshot.note} />
        </p>
      )}

      <div
        className="w-full rounded-lg overflow-hidden border border-white/15 hover:border-white/25 bg-black/20 transition-colors"
      >
        {/* ── Author header ─────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-2.5 pt-2 pb-1.5 cursor-pointer"
          onClick={authorPath ? goToProfile : goToPost}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") goToPost(e); }}
        >
          {/* Avatar */}
          <span className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
            {(snapshot.authorPhoto || snapshot.authorAvatar) ? (
              <img
                src={snapshot.authorPhoto || snapshot.authorAvatar || ""}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" />
              </svg>
            )}
          </span>

          {/* Handle + badges + relative time */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="text-[12px] font-semibold leading-tight truncate hover:underline"
                style={{ color: accent }}
              >
                {handleName}
              </span>
              {isCreator && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(94,209,196,0.15)", color: "#5ED1C4", border: "1px solid rgba(94,209,196,0.3)" }}
                  aria-label={lang === "es" ? "Creador" : "Creator"}
                >
                  {lang === "es" ? "CREADOR" : "CREATOR"}
                </span>
              )}
              {isPrime && !isCreator && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(229,197,74,0.15)", color: "#E5C54A", border: "1px solid rgba(229,197,74,0.3)" }}
                >
                  PRIME
                </span>
              )}
              {relTime && (
                <span className={`text-[10px] ${mutedText}`}>· {relTime}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Media ─────────────────────────────────────────────────────── */}
        {snapshot.mediaUrl && (
          <button
            type="button"
            onClick={goToPost}
            className="block w-full text-left"
            aria-label={lang === "es" ? "Ver publicación" : "View post"}
          >
            <div className="relative w-full bg-black/40" style={{ aspectRatio: "16/9" }}>
              {isLocked ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(212,0,122,0.18), rgba(230,145,56,0.18)), rgba(0,0,0,0.5)",
                  }}
                >
                  <svg className="w-6 h-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v3M8 11V8a4 4 0 118 0v3M5 11h14v9H5z" />
                  </svg>
                  <p className="text-xs text-white/85 font-semibold">
                    {lang === "es" ? "Contenido exclusivo" : "Exclusive content"}
                  </p>
                  <p className="text-[10px] text-white/60">
                    {lang === "es" ? "Toca para suscribirte" : "Tap to subscribe"}
                  </p>
                </div>
              ) : isVideo ? (
                <>
                  {snapshot.videoThumbnailUrl || snapshot.mediaThumbUrl ? (
                    <img
                      src={snapshot.videoThumbnailUrl || snapshot.mediaThumbUrl || ""}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <VideoPlayer
                      src={snapshot.mediaUrl}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      creatorDisclaimer
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                </>
              ) : isImage ? (
                <img
                  src={snapshot.mediaUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : null}
            </div>
          </button>
        )}

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="px-2.5 py-2 space-y-1">
          {(snapshot.videoTitle || snapshot.videoDescription) && (
            <div>
              {snapshot.videoTitle && (
                <p className="text-[13px] font-semibold text-white leading-tight line-clamp-1">
                  {snapshot.videoTitle}
                </p>
              )}
              {snapshot.videoDescription && (
                <p className={`text-[11px] mt-0.5 line-clamp-2 ${mutedText}`}>
                  {snapshot.videoDescription}
                </p>
              )}
            </div>
          )}

          {snapshot.content && (
            <div className={`text-xs line-clamp-3 ${subText}`}>
              <MentionText text={snapshot.content} />
            </div>
          )}

          {/* ── Engagement bar ────────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-1.5">
            <button
              type="button"
              onClick={handleLike}
              disabled={likePending}
              className="flex items-center gap-1 text-xs transition-colors hover:opacity-90 disabled:opacity-60"
              style={{ color: liked ? "#D4007A" : isMe ? "rgba(255,255,255,0.75)" : "var(--pnp-text-secondary, #8E8E93)" }}
              aria-label={lang === "es" ? "Me gusta" : "Like"}
              aria-pressed={liked}
            >
              <svg
                className="w-4 h-4"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={liked ? 0 : 1.6}
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
              </svg>
              <span className="tabular-nums">{likes > 0 ? likes : ""}</span>
            </button>

            <button
              type="button"
              onClick={goToReplies}
              className="flex items-center gap-1 text-xs transition-colors hover:opacity-90"
              style={{ color: isMe ? "rgba(255,255,255,0.75)" : "var(--pnp-text-secondary, #8E8E93)" }}
              aria-label={lang === "es" ? "Comentarios" : "Replies"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              </svg>
              <span className="tabular-nums">{replyCount > 0 ? replyCount : ""}</span>
            </button>

            <button
              type="button"
              onClick={handleHype}
              disabled={hypePending}
              className="flex items-center gap-1 text-xs transition-colors hover:opacity-90 disabled:opacity-60"
              style={{ color: hyped ? "#FF9500" : isMe ? "rgba(255,255,255,0.75)" : "var(--pnp-text-secondary, #8E8E93)" }}
              aria-label="Hype"
              aria-pressed={hyped}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleOpenShare}
              className="flex items-center gap-1 text-xs transition-colors hover:opacity-90"
              style={{ color: isMe ? "rgba(255,255,255,0.75)" : "var(--pnp-text-secondary, #8E8E93)" }}
              aria-label={lang === "es" ? "Compartir" : "Share"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={goToPost}
              className="ml-auto text-[11px] font-semibold hover:underline"
              style={{ color: accent }}
            >
              {lang === "es" ? "Abrir →" : "Open →"}
            </button>
          </div>
        </div>
      </div>

      {shareOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleCloseShare}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.1)", borderBottom: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-sm font-semibold text-white">{lang === "es" ? "Compartir" : "Share"}</p>
              <button onClick={handleCloseShare} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {shareSuccess ? (
              <div className="px-4 py-8 text-center text-sm font-semibold text-green-400">{shareSuccess}</div>
            ) : shareStep === "main" ? (
              <div className="p-4 space-y-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(`https://pnptv.app/social/post/${postId}`).catch(() => {}); setShareSuccess(lang === "es" ? "Enlace copiado!" : "Link copied!"); setTimeout(handleCloseShare, 1000); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-white/8 transition-colors min-h-[44px]"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                  {lang === "es" ? "Copiar enlace" : "Copy link"}
                </button>
                <button
                  onClick={() => setShareStep("hangout")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-white/8 transition-colors min-h-[44px]"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
                  {lang === "es" ? "Compartir en Hangout" : "Share to Hangout"}
                </button>
                <button
                  onClick={() => setShareStep("dm")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-white/8 transition-colors min-h-[44px]"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                  {lang === "es" ? "Enviar por DM" : "Send via DM"}
                </button>
              </div>
            ) : shareStep === "hangout" ? (
              <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
                <button onClick={() => setShareStep("main")} className="text-xs text-white/50 hover:text-white/80 mb-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  {lang === "es" ? "Volver" : "Back"}
                </button>
                {shareHangouts.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-4">{lang === "es" ? "Sin hangouts" : "No hangouts joined yet"}</p>
                ) : shareHangouts.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleShareToHangout(g.id)}
                    disabled={shareSending}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/8 transition-colors disabled:opacity-50 text-left min-h-[44px]"
                    style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white/60">
                      {g.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{g.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <button onClick={() => setShareStep("main")} className="text-xs text-white/50 hover:text-white/80 mb-1 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  {lang === "es" ? "Volver" : "Back"}
                </button>
                <input
                  type="text"
                  value={shareDmInput}
                  onChange={(e) => setShareDmInput(e.target.value)}
                  placeholder={lang === "es" ? "Usuario o ID…" : "Enter username or user ID…"}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/25 min-h-[44px]"
                />
                <button
                  onClick={handleShareToDm}
                  disabled={shareSending || !shareDmInput.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity min-h-[44px]"
                  style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                >
                  {shareSending ? (lang === "es" ? "Enviando…" : "Sending…") : (lang === "es" ? "Enviar" : "Send")}
                </button>
              </div>
            )}
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}
    </>
  );
}
