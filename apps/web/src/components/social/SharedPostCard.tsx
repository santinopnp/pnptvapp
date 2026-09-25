import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { togglePostLike, togglePostHype, type PostCardSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { MentionText } from "@/components/MentionText";
import { VideoPlayer } from "@/components/VideoPlayer";
import { SharePostModal } from "@/components/SharePostModal";

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

  const handleOpenShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShareOpen(true);
  }, []);

  const handleCloseShare = useCallback(() => {
    setShareOpen(false);
  }, []);

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
        {(snapshot.mediaUrl || isLocked) && (
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
                      "linear-gradient(135deg, rgba(212,0,122,0.18), rgba(230,145,56,0.18)), rgba(0,0,0,0.75)",
                  }}
                >
                  {snapshot.videoThumbnailUrl && (
                    <img
                      src={snapshot.videoThumbnailUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-25"
                      aria-hidden
                    />
                  )}
                  <div className="relative flex flex-col items-center gap-1.5">
                    <svg className="w-6 h-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v3M8 11V8a4 4 0 118 0v3M5 11h14v9H5z" />
                    </svg>
                    <p className="text-xs text-white/85 font-semibold">
                      {lang === "es" ? "Contenido exclusivo" : "Exclusive content"}
                    </p>
                    <p className="text-[10px] text-white/60">
                      {lang === "es" ? "Toca para ver" : "Tap to view"}
                    </p>
                  </div>
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
                      src={snapshot.mediaUrl ?? undefined}
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
                  src={snapshot.mediaUrl ?? undefined}
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

      <SharePostModal
        postId={postId}
        postContent={snapshot.content}
        authorName={snapshot.authorFirstName || snapshot.authorUsername}
        mediaType={snapshot.mediaType}
        videoThumbnailUrl={snapshot.videoThumbnailUrl}
        mediaUrl={snapshot.mediaUrl}
        isOwnPost={false}
        isOpen={shareOpen}
        onClose={handleCloseShare}
      />
    </>
  );
}
