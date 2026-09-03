import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@pnptv/ui-kit";
import { useAuth } from "@/hooks/useAuth";
import { useTier } from "@/hooks/useTier";
import { useTutorial } from "@/hooks/useTutorial";

import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { VideoPlayer } from "@/components/VideoPlayer";
import {
  getChannels,
  browseCreatorChannels,
  getChannelDetail,
  createCreatorChannel,
  updateCreatorChannel,
  deleteCreatorChannel,
  uploadChannelCover,
  updateChannelVideo,
  deleteChannelVideo,
  aiTitleChannelVideo,
  aiDescriptionChannelVideo,
  aiTagsChannelVideo,
  recordChannelVideoView,
  getChannelVideoComments,
  postChannelVideoComment,
  updateVideoTaggedCreators,
  searchCreators,
  createSocialPost,
  togglePostLike,
  togglePostHype,
  sharePostToHangouts,
  sharePostToDm,
  getPostReactions,
  reactToSocialPost,
  getHangoutGroups,
  type Channel,
  type ChannelVideo,
  type ChannelVideoComment,
  type CreatorChannel,
  type MentionUser,
  type SocialPostItem,
  type HangoutGroup,
  type ContentReaction,
} from "@/lib/api";
import { connectSocket } from "@/lib/socket";
import { UploadVideoButton } from "@/components/channels/UploadVideoButton";
import { UserAvatar } from "@/components/UserAvatar";
import CreatorSubscribeWizard from "@/components/creators/CreatorSubscribeWizard";

// ── Tier badge colors ────────────────────────────────────────────────────────
const TIER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ice: { bg: "rgba(173,216,230,0.15)", text: "#ADD8E6", label: "Ice" },
  crystal: { bg: "rgba(138,43,226,0.15)", text: "#BA55D3", label: "Crystal" },
  diamond: { bg: "rgba(0,191,255,0.15)", text: "#00BFFF", label: "Diamond" },
  full_time: { bg: "rgba(255,215,0,0.15)", text: "#FFD700", label: "Pro" },
};

// ── Helper ───────────────────────────────────────────────────────────────────
function isValidPhotoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return url.startsWith("/uploads/") || url.startsWith("http");
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Format a duration in seconds as M:SS or H:MM:SS. Returns null when duration is 0 or null. */
function formatDuration(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Format a raw view count into compact form: 1234 → 1.2K, 1200000 → 1.2M. */
function formatViewCount(count: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

// ── Creator Channel Card ─────────────────────────────────────────────────────
function CreatorChannelCard({
  channel,
  onClick,
}: {
  channel: CreatorChannel;
  onClick: () => void;
}) {
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const hasCover = isValidPhotoUrl(channel.coverImageUrl);

  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden flex flex-col text-left transition-all hover:scale-[1.02] hover:border-pnp-accent/40 cursor-pointer w-full"
    >
      {/* Cover image / gradient placeholder */}
      <div className="relative w-full aspect-video overflow-hidden">
        {hasCover ? (
          <>
            {!coverLoaded && (
              <div className="absolute inset-0 bg-pnp-surfaceHover animate-pulse" />
            )}
            <img
              src={channel.coverImageUrl!}
              alt=""
              className={`w-full h-full object-cover ${coverLoaded ? "block" : "hidden"}`}
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverLoaded(true)}
            />
          </>
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, hsl(${(channel.id * 47) % 360}, 60%, 20%), hsl(${(channel.id * 47 + 120) % 360}, 60%, 15%))`,
            }}
          />
        )}

        {/* Access type badge */}
        {(() => {
          const at = channel.accessType ?? (channel.isPremium ? "subscription" : "free");
          let bg = "rgba(94,209,196,0.85)";
          let label = "Free";
          if (at === "prime") { bg = "rgba(167,139,250,0.85)"; label = "Prime"; }
          else if (at === "subscription") { bg = "rgba(212,0,122,0.85)"; label = "Premium"; }
          else if (at === "paid") { bg = "rgba(230,145,56,0.85)"; label = `$${channel.priceUsd ?? 0}`; }
          return (
            <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
              style={{ background: bg, color: "#fff" }}>
              {label}
              {channel.hangoutGroupId && (
                <svg className="w-2.5 h-2.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </span>
          );
        })()}
        {channel.collaborators && channel.collaborators.length > 0 && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
            style={{ background: "rgba(230,145,56,0.85)", color: "#fff" }}>
            Joint
          </span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2">
        {/* Channel name */}
        <p className="text-sm font-semibold text-pnp-textPrimary leading-tight line-clamp-1">
          {channel.name}
        </p>

        {/* Tags */}
        {channel.tags && channel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {channel.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[10px] text-pnp-textSecondary"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Creator info + post count */}
        <div className="flex items-center justify-between mt-auto pt-1 border-t border-pnp-border/50">
          <div className="flex items-center gap-1.5 min-w-0">
            {isValidPhotoUrl(channel.creatorPhotoUrl) ? (
              <img
                src={channel.creatorPhotoUrl!}
                alt=""
                className={`w-5 h-5 rounded-full object-cover flex-shrink-0 ${avatarLoaded ? "block" : "hidden"}`}
                onLoad={() => setAvatarLoaded(true)}
                onError={() => setAvatarLoaded(true)}
              />
            ) : (
              <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}>
                {(channel.creatorName || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[11px] text-pnp-textSecondary truncate">
              {channel.creatorName || channel.creatorUsername || "Creator"}
            </span>
            {channel.creatorVerified && (
              <svg className="w-3 h-3 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <span className="text-[11px] text-pnp-textSecondary flex-shrink-0">
            {channel.videoCount != null && channel.videoCount > 0
              ? `${channel.videoCount} video${channel.videoCount !== 1 ? "s" : ""}`
              : `${channel.postCount} post${channel.postCount !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Channel Detail View ──────────────────────────────────────────────────────
function ChannelDetailView({
  channelId,
  onBack,
  onUpdated,
  onDeleted,
}: {
  channelId: number;
  onBack: () => void;
  onUpdated?: (channel: CreatorChannel) => void;
  onDeleted?: (channelId: number) => void;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { isPrime } = useTier();
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<CreatorChannel | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // requiresPrime: backend returns requires_prime:true when access_type === 'prime'. No hardcoded IDs.
  const channelIsPrime = channel?.requires_prime === true || channel?.accessType === 'prime';
  const showPrimeUpsell = channelIsPrime && !isPrime;
  const upsellKey = channel?.creatorId ? `pnp_prime_upsell_dismissed_${channel.creatorId}` : "";
  const [primeUpsellDismissed, setPrimeUpsellDismissed] = useState(false);
  useEffect(() => {
    if (!upsellKey) { setPrimeUpsellDismissed(false); return; }
    try { setPrimeUpsellDismissed(sessionStorage.getItem(upsellKey) === "1"); } catch { setPrimeUpsellDismissed(false); }
  }, [upsellKey]);
  const dismissPrimeUpsell = () => {
    if (!upsellKey) return;
    try { sessionStorage.setItem(upsellKey, "1"); } catch { /* ignore */ }
    setPrimeUpsellDismissed(true);
  };
  // Creator subscribe upsell — inside FREE channel, not the channel owner, not a PRIME channel
  const showCreatorSubscribeUpsell =
    !!channel?.creatorId &&
    !channelIsPrime &&
    (channel.accessType ?? "free") === "free" &&
    String(user?.id ?? "") !== String(channel.creatorId);
  const subscribeUpsellKey = channel?.creatorId ? `pnp_creator_subscribe_dismissed_${channel.creatorId}` : "";
  const [creatorUpsellDismissed, setCreatorUpsellDismissed] = useState(false);
  // Inline subscribe wizard — opens over the channel view instead of redirecting
  // to /profile/:creatorId (the redirect was jarring, especially on the video
  // paywall). Uses the same NP coin-picker grid as every other checkout.
  const [showSubscribeWizard, setShowSubscribeWizard] = useState(false);
  useEffect(() => {
    if (!subscribeUpsellKey) { setCreatorUpsellDismissed(false); return; }
    try { setCreatorUpsellDismissed(sessionStorage.getItem(subscribeUpsellKey) === "1"); } catch { setCreatorUpsellDismissed(false); }
  }, [subscribeUpsellKey]);
  const dismissCreatorUpsell = () => {
    if (!subscribeUpsellKey) return;
    try { sessionStorage.setItem(subscribeUpsellKey, "1"); } catch { /* ignore */ }
    setCreatorUpsellDismissed(true);
  };

  const [playingVideo, setPlayingVideo] = useState<{ url: string | null; fallbackUrl?: string | null; title?: string; videoId: number; channelId: number; promoPostId: number | null; taggedCreators: { id: string; username: string; first_name: string | null; avatar_url: string | null }[]; uploaderDisplayName?: string | null; durationSec?: number | null } | null>(null);
  const [videoPlayerError, setVideoPlayerError] = useState(false);
  // Set to true once the <video> metadata reveals a landscape aspect ratio.
  // Only landscape videos get the wider modal + taller player (semi-fullscreen);
  // portrait/square videos stay in the compact 2xl modal so they don't stretch.
  const [videoIsLandscape, setVideoIsLandscape] = useState(false);
  // Reset landscape detection whenever the current video changes so a
  // landscape video followed by a portrait one doesn't inherit the previous
  // modal size.
  useEffect(() => {
    setVideoIsLandscape(false);
  }, [playingVideo?.videoId]);
  const [videoComments, setVideoComments] = useState<ChannelVideoComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsHasMore, setCommentsHasMore] = useState(false);

  // ── Per-video management (owner) ──
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [videoEditForm, setVideoEditForm] = useState<{ title: string; description: string; tags: string }>({ title: "", description: "", tags: "" });
  const [videoEditSaving, setVideoEditSaving] = useState(false);
  const [videoEditError, setVideoEditError] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<number | null>(null);
  const [videoDeleteLoading, setVideoDeleteLoading] = useState(false);

  const [videoAiBusy, setVideoAiBusy] = useState<"title" | "description" | "tags" | null>(null);

  const [taggedCreators, setTaggedCreators] = useState<MentionUser[]>([]);
  const [creatorTagSearch, setCreatorTagSearch] = useState("");
  const [creatorTagResults, setCreatorTagResults] = useState<MentionUser[]>([]);
  const [creatorTagSearching, setCreatorTagSearching] = useState(false);

  // Hype — social post promotion for videos
  const [hypingVideoId, setHypingVideoId] = useState<number | null>(null);
  const [hypeText, setHypeText] = useState("");
  const [hypePosting, setHypePosting] = useState(false);
  const [hypePosted, setHypePosted] = useState<Set<number>>(new Set());
  const [modalHypeOpen, setModalHypeOpen] = useState(false);
  const [hypeError, setHypeError] = useState<string | null>(null);
  const hypeInFlight = useRef(false);

  // Per-video like state (optimistic)
  const [videoLikes, setVideoLikes] = useState<Record<number, { liked: boolean; count: number }>>({});

  // Per-video hype toggle state (optimistic, for promo_post_id hype)
  const [videoHypeToggles, setVideoHypeToggles] = useState<Record<number, boolean>>({});
  const hypeToggleInFlight = useRef<Record<number, boolean>>({});

  // Share sheet
  const [shareTarget, setShareTarget] = useState<{ promoPostId: number; videoTitle: string } | null>(null);
  const [shareHangouts, setShareHangouts] = useState<HangoutGroup[]>([]);
  const [shareHangoutsLoaded, setShareHangoutsLoaded] = useState(false);
  const [shareStep, setShareStep] = useState<"main" | "hangout" | "dm">("main");
  const [shareDmInput, setShareDmInput] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  // Comment reactions
  const [commentReactions, setCommentReactions] = useState<Record<number, ContentReaction[]>>({});
  const [commentReactionPickerOpen, setCommentReactionPickerOpen] = useState<number | null>(null);
  const commentReactionsFetched = useRef<Set<number>>(new Set());
  const REACTION_EMOJIS = ['😈','❤️','😆','🔝','🐷','🍆','🍑','💨','🚀'];

  const openVideoEdit = (v: ChannelVideo) => {
    setEditingVideoId(v.id);
    setVideoEditForm({ title: v.title || "", description: v.description || "", tags: (v.tags || []).join(", ") });
    setVideoEditError(null);
    setVideoAiBusy(null);
    setTaggedCreators([]);
    setCreatorTagSearch("");
    setCreatorTagResults([]);
  };

  // Save current form state then call AI — same pattern as the upload wizard
  const saveAndRunAi = async (field: "title" | "description" | "tags") => {
    if (!channel || editingVideoId === null) return;
    setVideoAiBusy(field); setVideoEditError(null);
    try {
      // Persist current text so the AI reads what the user typed
      const tags = videoEditForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
      await updateChannelVideo(channel.id, editingVideoId, {
        title: videoEditForm.title.trim(),
        description: videoEditForm.description.trim() || null,
        tags,
      });
      if (field === "title") {
        const r = await aiTitleChannelVideo(channel.id, editingVideoId);
        setVideoEditForm((p) => ({ ...p, title: r.title }));
      } else if (field === "description") {
        const r = await aiDescriptionChannelVideo(channel.id, editingVideoId);
        setVideoEditForm((p) => ({ ...p, description: r.description }));
      } else {
        const r = await aiTagsChannelVideo(channel.id, editingVideoId);
        setVideoEditForm((p) => ({ ...p, tags: (r.tags || []).join(", ") }));
      }
    } catch (err) {
      setVideoEditError(err instanceof Error ? err.message : "AI unavailable");
    } finally { setVideoAiBusy(null); }
  };

  const saveVideoEdit = async () => {
    if (!channel || editingVideoId === null) return;
    setVideoEditSaving(true); setVideoEditError(null);
    try {
      const tags = videoEditForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const r = await updateChannelVideo(channel.id, editingVideoId, { title: videoEditForm.title.trim(), description: videoEditForm.description.trim() || null, tags });
      await updateVideoTaggedCreators(channel.id, editingVideoId, taggedCreators.map((c) => c.id)).catch(() => {});
      setVideos((prev) => prev.map((v) => v.id === editingVideoId ? { ...v, ...r.video } : v));
      setEditingVideoId(null);
    } catch (err) {
      setVideoEditError(err instanceof Error ? err.message : "Save failed");
    } finally { setVideoEditSaving(false); }
  };

  const confirmVideoDelete = async () => {
    if (!channel || deletingVideoId === null) return;
    setVideoDeleteLoading(true);
    try {
      await deleteChannelVideo(channel.id, deletingVideoId);
      setVideos((prev) => prev.filter((v) => v.id !== deletingVideoId));
      setDeletingVideoId(null);
    } catch (err) {
      setVideoEditError(err instanceof Error ? err.message : "Delete failed");
    } finally { setVideoDeleteLoading(false); }
  };

  // ── Video view tracking + comments ───────────────────────────────────────
  const loadComments = useCallback(async (channelId: number, videoId: number, promoPostId: number | null, cursor?: string) => {
    if (!promoPostId) return;
    setCommentsLoading(true);
    try {
      const res = await getChannelVideoComments(channelId, videoId, cursor);
      if (cursor) {
        setVideoComments((prev) => [...prev, ...(res.replies ?? [])]);
      } else {
        setVideoComments(res.replies ?? []);
      }
      setCommentsCursor(res.nextCursor ?? null);
      setCommentsHasMore(res.nextCursor !== null);
    } catch { /* silent */ } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!playingVideo) {
      setVideoComments([]);
      setCommentInput("");
      setCommentsCursor(null);
      setCommentsHasMore(false);
      return;
    }
    recordChannelVideoView(playingVideo.channelId, playingVideo.videoId).catch(() => {});
    loadComments(playingVideo.channelId, playingVideo.videoId, playingVideo.promoPostId);
  }, [playingVideo?.videoId]);

  const submitComment = async () => {
    if (!playingVideo || !commentInput.trim() || commentPosting) return;
    setCommentPosting(true);
    try {
      const res = await postChannelVideoComment(playingVideo.channelId, playingVideo.videoId, commentInput.trim());
      setVideoComments((prev) => [res.comment, ...prev]);
      setCommentInput("");
    } catch { /* silent */ } finally {
      setCommentPosting(false);
    }
  };

  // ── Hype handlers ────────────────────────────────────────────────────────
  const buildHypeText = useCallback((v: ChannelVideo) => {
    // Collect all owner usernames (creator + collaborators), deduped
    const ownerHandles: string[] = [];
    if (channel?.creatorUsername) ownerHandles.push(`@${channel.creatorUsername}`);
    for (const cp of channel?.collaboratorProfiles ?? []) {
      if (cp.username && !ownerHandles.includes(`@${cp.username}`)) {
        ownerHandles.push(`@${cp.username}`);
      }
    }
    // Collect tagged performer usernames, skip any already in ownerHandles
    const performerHandles: string[] = [];
    for (const tc of v.tagged_creators ?? []) {
      if (tc.username && !ownerHandles.includes(`@${tc.username}`)) {
        performerHandles.push(`@${tc.username}`);
      }
    }
    const allHandles = [...ownerHandles, ...performerHandles];
    const mentions = allHandles.length > 0 ? ` ft. ${allHandles.join(", ")}` : "";
    return `🔥 Watch "${v.title}"${mentions} — now on ${channel?.name ?? "PNPtv! Channels"} ✨`;
  }, [channel]);

  const openHypeCard = useCallback((v: ChannelVideo) => {
    const isOpen = hypingVideoId === v.id;
    setHypingVideoId(isOpen ? null : v.id);
    if (!isOpen) setHypeText(buildHypeText(v));
    setModalHypeOpen(false);
  }, [buildHypeText, hypingVideoId]);

  const openHypeModal = useCallback((v: ChannelVideo) => {
    setHypingVideoId(null);
    setModalHypeOpen((prev) => {
      if (!prev) setHypeText(buildHypeText(v));
      return !prev;
    });
  }, [buildHypeText]);

  const submitHype = useCallback(async (videoId: number) => {
    if (!hypeText.trim() || hypePosting || hypeInFlight.current) return;
    hypeInFlight.current = true;
    setHypePosting(true);
    setHypeError(null);
    try {
      const v = videos.find((x) => x.id === videoId);
      // Use the Directus asset URL for playback in the social feed — the /stream
      // proxy is for the Channels page access gate, not for embedding in posts.
      const directusId = (v as any).directus_file_id as string | null ?? null;
      const directusVideoUrl = (v as any).directus_video_url as string | null
        ?? (directusId ? `https://cms.pnptv.app/assets/${directusId}` : v?.video_url ?? "");
      const promoMetadata = channel && v ? {
        kind: "channel_promo" as const,
        channel_id: channel.id,
        channel_slug: channel.slug,
        channel_name: channel.name,
        creator_id: channel.creatorId,
        creator_username: channel.creatorUsername ?? null,
        access_type: (channel.accessType ?? "free") as "free" | "subscription" | "prime" | "paid",
        price_usd: channel.priceUsd ?? null,
        video_id: v.id,
        video_directus_id: directusId ?? "",
        video_url: directusVideoUrl,
        has_animated_gif: !!v.gif_url,
        video_description: v.description ?? null,
      } : undefined;
      await createSocialPost(hypeText.trim(), undefined, false, true, {
        metadata: promoMetadata,
        videoThumbnailUrl: v?.thumbnail_url ?? undefined,
        channelId: (channel?.isOwner || channel?.isCollaborator) ? channel.id : undefined,
      });
      setHypePosted((prev) => new Set(prev).add(videoId));
      setHypingVideoId(null);
      setModalHypeOpen(false);
      setHypeText("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setHypeError(msg.toLowerCase().includes('already hyped') ? 'You already hyped this.' : 'Failed to post. Try again.');
    } finally {
      setHypePosting(false);
      hypeInFlight.current = false;
    }
  }, [hypeText, hypePosting, videos, channel]);

  const handleVideoLike = useCallback(async (v: ChannelVideo) => {
    if (!v.promo_post_id) return;
    const current = videoLikes[v.id] ?? { liked: v.liked_by_me ?? false, count: v.likes_count ?? 0 };
    const next = { liked: !current.liked, count: Math.max(0, current.count + (current.liked ? -1 : 1)) };
    setVideoLikes((prev) => ({ ...prev, [v.id]: next }));
    try {
      await togglePostLike(v.promo_post_id);
    } catch {
      setVideoLikes((prev) => ({ ...prev, [v.id]: current }));
    }
  }, [videoLikes]);

  const handleVideoHypeToggle = useCallback(async (v: ChannelVideo) => {
    if (!v.promo_post_id || hypeToggleInFlight.current[v.id]) return;
    hypeToggleInFlight.current[v.id] = true;
    const prevPosted = videoHypeToggles[v.id] ?? v.hype_posted_by_me ?? false;
    setVideoHypeToggles((prev) => ({ ...prev, [v.id]: !prevPosted }));
    try {
      await togglePostHype(v.promo_post_id);
    } catch {
      setVideoHypeToggles((prev) => ({ ...prev, [v.id]: prevPosted }));
    } finally {
      hypeToggleInFlight.current[v.id] = false;
    }
  }, [videoHypeToggles]);

  const openShareSheet = useCallback(async (promoPostId: number, videoTitle: string) => {
    setShareTarget({ promoPostId, videoTitle });
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

  const closeShareSheet = useCallback(() => {
    setShareTarget(null);
    setShareStep("main");
    setShareSuccess(null);
    setShareDmInput("");
    setShareSending(false);
  }, []);

  const handleShareToHangout = useCallback(async (groupId: number) => {
    if (!shareTarget || shareSending) return;
    setShareSending(true);
    try {
      await sharePostToHangouts(shareTarget.promoPostId, [groupId]);
      setShareSuccess("Shared to hangout!");
      setTimeout(closeShareSheet, 1200);
    } catch { setShareSending(false); }
  }, [shareTarget, shareSending, closeShareSheet]);

  const handleShareToDm = useCallback(async () => {
    if (!shareTarget || !shareDmInput.trim() || shareSending) return;
    setShareSending(true);
    try {
      await sharePostToDm(shareDmInput.trim(), shareTarget.promoPostId);
      setShareSuccess("Sent via DM!");
      setTimeout(closeShareSheet, 1200);
    } catch { setShareSending(false); }
  }, [shareTarget, shareDmInput, shareSending, closeShareSheet]);

  const loadCommentReactions = useCallback(async (commentId: number) => {
    if (commentReactionsFetched.current.has(commentId)) return;
    commentReactionsFetched.current.add(commentId);
    try {
      const res = await getPostReactions(commentId);
      setCommentReactions((prev) => ({ ...prev, [commentId]: res.reactions ?? [] }));
    } catch { /* silent */ }
  }, []);

  const handleCommentReaction = useCallback(async (commentId: number, emoji: string) => {
    const prevReactions = commentReactions[commentId] ?? [];
    const existing = prevReactions.find((r) => r.emoji === emoji);
    const wasReacted = existing?.reactedByMe ?? false;
    const optimistic = prevReactions.map((r) => {
      if (r.emoji !== emoji) return r;
      return { ...r, count: Math.max(0, r.count + (wasReacted ? -1 : 1)), reactedByMe: !wasReacted };
    });
    if (!existing && !wasReacted) {
      optimistic.push({ emoji, count: 1, users: [], reactedByMe: true });
    }
    setCommentReactions((prev) => ({ ...prev, [commentId]: optimistic }));
    setCommentReactionPickerOpen(null);
    try {
      const res = await reactToSocialPost(commentId, emoji);
      if (res.reactions) setCommentReactions((prev) => ({ ...prev, [commentId]: res.reactions }));
    } catch {
      setCommentReactions((prev) => ({ ...prev, [commentId]: prevReactions }));
    }
  }, [commentReactions]);

  // ── Edit channel ─────────────────────────────────────────────────────────
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; description: string; tags: string; accessType: 'free' | 'prime' | 'subscription' | 'paid'; priceUsd: number; telegramChannelId: string; bridgeEnabled: boolean }>({ name: "", description: "", tags: "", accessType: "free", priceUsd: 0, telegramChannelId: "", bridgeEnabled: false });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const openEdit = () => {
    if (!channel) return;
    setEditForm({
      name: channel.name,
      description: channel.description || "",
      tags: (channel.tags || []).join(", "),
      accessType: channel.accessType ?? (channel.isPremium ? "subscription" : "free"),
      priceUsd: channel.priceUsd ?? 0,
      telegramChannelId: channel.telegramChannelId || "",
      bridgeEnabled: channel.bridgeEnabled === true,
    });
    setEditError(null);
    setCoverPreview(null);
    setCoverFile(null);
    setShowEditForm(true);
  };

  const saveEdit = async () => {
    if (!channel || !editForm.name.trim()) { setEditError("Channel name is required"); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const tags = editForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await updateCreatorChannel(channel.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        tags,
        accessType: editForm.accessType,
        priceUsd: editForm.accessType === "paid" ? editForm.priceUsd : 0,
        telegramChannelId: editForm.telegramChannelId.trim() || null,
        bridgeEnabled: editForm.bridgeEnabled,
      });
      if (res.success) {
        let updated = res.channel;
        if (coverFile) {
          const coverRes = await uploadChannelCover(channel.id, coverFile);
          if (coverRes.success) {
            updated = { ...updated, coverImageUrl: coverRes.coverImageUrl };
          }
        }
        setChannel((prev) => prev ? { ...prev, ...updated } : updated);
        setShowEditForm(false);
        setCoverPreview(null);
        setCoverFile(null);
        onUpdated?.(updated);
      }
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!channel) return;
    setDeleteLoading(true);
    try {
      await deleteCreatorChannel(channel.id);
      onDeleted?.(channel.id);
      onBack();
    } catch {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    const refetch = () => {
      setLoading(true);
      setError(null);
      getChannelDetail(channelId)
        .then((res) => {
          if (res.success) {
            setChannel(res.channel);
            const fetchedVideos = res.videos ?? [];
            setVideos(fetchedVideos);
            setVideoLikes(
              fetchedVideos.reduce<Record<number, { liked: boolean; count: number }>>((acc, v) => {
                acc[v.id] = { liked: v.liked_by_me ?? false, count: v.likes_count ?? 0 };
                return acc;
              }, {})
            );
            setVideoHypeToggles(
              fetchedVideos.reduce<Record<number, boolean>>((acc, v) => {
                acc[v.id] = v.hype_posted_by_me ?? false;
                return acc;
              }, {})
            );
            setPosts(res.posts ?? []);
            setLocked(res.locked);
            setLockReason(res.lockReason ?? null);
          }
        })
        .catch((err) => setError(err.message || "Failed to load channel"))
        .finally(() => setLoading(false));
    };

    refetch();

    // Re-check access when the user returns to this tab (e.g., after subscribing
    // to the creator in another tab and coming back to the channel).
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [channelId]);

  // Auto-open a specific video when arriving via /channels?channel=<slug>&video=<id>
  // (used by the Videos destacados tiles on creator profiles). Runs once per
  // videos load, and only when nothing is currently playing.
  useEffect(() => {
    const videoParam = searchParams.get("video");
    if (!videoParam || videos.length === 0 || playingVideo) return;
    const vidId = parseInt(videoParam, 10);
    if (!Number.isFinite(vidId)) return;
    const v = videos.find((x) => x.id === vidId);
    if (!v || !channel) return;
    // Prefer Mux only when the asset is actually delivered — a stale playback
    // id on an errored/cancelled ingest will 404 the player.
    const muxUsable = !!v.mux_playback_id && v.mux_status !== "errored" && v.mux_status !== "cancelled";
    const muxUrl = muxUsable ? `https://stream.mux.com/${v.mux_playback_id}.m3u8` : null;
    const directusUrl = v.video_url || null;
    const playUrl = muxUrl || directusUrl;
    const fallbackUrl = muxUrl && directusUrl && muxUrl !== directusUrl ? directusUrl : null;
    setPlayingVideo({
      url: playUrl,
      fallbackUrl,
      title: v.title,
      videoId: v.id,
      channelId: channel.id,
      promoPostId: v.promo_post_id ?? null,
      taggedCreators: v.tagged_creators || [],
      uploaderDisplayName: v.uploader_display_name || v.uploader_username || null,
      durationSec: v.duration_sec ?? null,
    });
  }, [videos, searchParams, playingVideo, channel]);

  // ── Video card renderer ──────────────────────────────────────────────────
  // Extracted from inline JSX so the thumbnail logic, badge overlays, and
  // metadata row are defined in one place only. Called from the videos.map
  // below and not duplicated anywhere else in this file.
  const renderVideoCard = (v: ChannelVideo) => {
    const isEditing = editingVideoId === v.id;
    const isDeleting = deletingVideoId === v.id;
    // Playable when Mux delivered a playback id OR the backend still holds a
    // Directus/local source it can stream (video_url falls back to the /stream
    // endpoint which 302s to Directus).
    const muxReady = !!v.mux_playback_id && v.mux_status !== "errored" && v.mux_status !== "cancelled";
    const hasDirectusFallback = !!v.directus_file_id;
    const hasPlayableSource = muxReady || hasDirectusFallback || !!v.video_url;
    // A Mux ingest failure is only a real dead-end when there is no Directus
    // fallback — otherwise the /stream endpoint will still deliver the file.
    const muxFailed = v.mux_status === "errored" || v.mux_status === "cancelled";
    const isFailed = v.status === "failed" || (muxFailed && !hasDirectusFallback);
    const isProcessing = !isFailed && (v.status === "processing"
      || ((v.mux_status === "preparing" || v.mux_status === "waiting") && !hasPlayableSource));
    const isUnavailable = isFailed || (!hasPlayableSource && !isProcessing);
    const duration = formatDuration(v.duration_sec);

    // Thumbnail fallback chain: gif_url (hover only) → thumbnail_url → placeholder
    const staticThumb = v.thumbnail_url || null;
    const animatedThumb = v.gif_url || null;
    const hasThumb = !!staticThumb || !!animatedThumb;

    // Uploader chip: show only when this channel has a different owner than the video uploader
    const channelOwnerIds = new Set<string>();
    if (channel?.creatorId) channelOwnerIds.add(String(channel.creatorId));
    if (channel?.owner_id) channelOwnerIds.add(String(channel.owner_id));
    const showUploaderChip =
      !!v.uploader_id &&
      !channelOwnerIds.has(String(v.uploader_id)) &&
      (!!v.uploader_display_name || !!v.uploader_username);

    // Tag display: up to 5 pills, then a "+N" overflow badge
    const MAX_TAGS = 5;
    const visibleTags = (v.tags || []).slice(0, MAX_TAGS);
    const overflowTagCount = (v.tags || []).length - MAX_TAGS;

    return (
      <div key={`cv-${v.id}`} className="bg-pnp-surface">
        {/* ── Thumbnail — full device width, 16:9 ── */}
        <div
          className="relative w-full aspect-video bg-pnp-surfaceHover group cursor-pointer overflow-hidden"
          onClick={() => {
            if (isProcessing || isUnavailable) return;
            setVideoPlayerError(false);
            const muxUsable = !!v.mux_playback_id && v.mux_status !== "errored" && v.mux_status !== "cancelled";
            const muxUrl = muxUsable ? `https://stream.mux.com/${v.mux_playback_id}.m3u8` : null;
            const directusUrl = v.video_url || null;
            const playUrl = muxUrl || directusUrl;
            const fallbackUrl = muxUrl && directusUrl && muxUrl !== directusUrl ? directusUrl : null;
            setPlayingVideo({
              url: playUrl,
              fallbackUrl,
              title: v.title,
              videoId: v.id,
              channelId: channel!.id,
              promoPostId: v.promo_post_id ?? null,
              taggedCreators: v.tagged_creators || [],
              uploaderDisplayName: v.uploader_display_name || v.uploader_username || null,
              durationSec: v.duration_sec ?? null,
            });
          }}
        >
          {/* Thumbnail image with hover-to-gif swap */}
          {hasThumb ? (
            <img
              src={staticThumb || animatedThumb!}
              alt={v.title}
              className={[
                "w-full h-full object-cover transition-transform duration-200",
                isProcessing || isUnavailable ? "saturate-0 opacity-60" : "group-hover:scale-105",
              ].join(" ")}
              onMouseEnter={(e) => { if (animatedThumb && !isProcessing && !isUnavailable) (e.currentTarget as HTMLImageElement).src = animatedThumb; }}
              onMouseLeave={(e) => { if (staticThumb && animatedThumb && !isProcessing && !isUnavailable) (e.currentTarget as HTMLImageElement).src = staticThumb; }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            // Film-icon placeholder when both thumbnail and gif are null
            <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)" }}>
              <svg className="w-10 h-10 opacity-20 text-pnp-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375z" />
              </svg>
            </div>
          )}

          {/* Play overlay — hidden during processing or unavailable */}
          {!isProcessing && !isUnavailable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors pointer-events-none">
              <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
                <svg className="w-6 h-6 text-white drop-shadow ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}

          {/* Duration badge — bottom-right */}
          {duration && !isProcessing && !isUnavailable && (
            <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[11px] font-semibold text-white tabular-nums pointer-events-none" style={{ background: "rgba(0,0,0,0.72)" }}>
              {duration}
            </span>
          )}

          {/* Processing badge — bottom-left (amber, pulsing) */}
          {isProcessing && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white animate-pulse pointer-events-none" style={{ background: "rgba(234,179,8,0.85)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Processing…
            </span>
          )}

          {/* Unavailable badge — bottom-left (red) */}
          {isUnavailable && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white pointer-events-none" style={{ background: "rgba(220,38,38,0.9)" }}>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Unavailable
            </span>
          )}

          {/* Mirrored badge — top-left */}
          {v.is_mirrored && (
            <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white pointer-events-none" style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.15)" }}>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              From feed
            </span>
          )}
        </div>

        {/* ── Info row ── */}
        <div className="px-4 py-2.5 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-pnp-textPrimary line-clamp-1">{v.title || "Untitled"}</p>
            {v.description && (
              <p className="text-xs text-pnp-textSecondary mt-0.5 line-clamp-2">{v.description}</p>
            )}

            {/* Uploader chip — only when a different person uploaded this video */}
            {showUploaderChip && (
              <p className="text-[10px] text-pnp-textSecondary mt-0.5">
                by{" "}
                <span className="text-pnp-textPrimary font-medium">
                  {v.uploader_display_name || (v.uploader_username ? `@${v.uploader_username}` : "unknown")}
                </span>
              </p>
            )}

            {/* Meta row: view count + tags + overflow */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {v.view_count > 0 && (
                <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {formatViewCount(v.view_count)}
                </span>
              )}
              {visibleTags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                  {t}
                </span>
              ))}
              {overflowTagCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}>
                  +{overflowTagCount}
                </span>
              )}
            </div>

            {/* Tagged creators */}
            {v.tagged_creators && v.tagged_creators.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>with</span>
                {v.tagged_creators.map((c) => (
                  <a
                    key={c.id}
                    href={`/profile/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-[10px] font-medium hover:underline"
                    style={{ color: "#D4007A" }}
                  >
                    {c.avatar_url && (
                      <img src={c.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                    @{c.username}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {user && v.promo_post_id && (() => {
              const likeState = videoLikes[v.id] ?? { liked: v.liked_by_me ?? false, count: v.likes_count ?? 0 };
              const hyped = videoHypeToggles[v.id] ?? v.hype_posted_by_me ?? false;
              return (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVideoLike(v); }}
                    title={likeState.liked ? "Unlike" : "Like"}
                    aria-label={likeState.liked ? "Unlike" : "Like"}
                    className="flex items-center gap-0.5 p-1.5 rounded-lg transition-colors min-h-[44px] min-w-[44px] justify-center"
                    style={{ color: likeState.liked ? "#D4007A" : "rgba(255,255,255,0.35)", background: likeState.liked ? "rgba(212,0,122,0.1)" : "transparent" }}
                  >
                    <svg className="w-3.5 h-3.5" fill={likeState.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={likeState.liked ? 0 : 2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                    {likeState.count > 0 && <span className="text-[10px] tabular-nums">{likeState.count}</span>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVideoHypeToggle(v); }}
                    title={hyped ? "Hyped!" : "Hype this video"}
                    aria-label={hyped ? "Hyped!" : "Hype this video"}
                    className="p-1.5 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    style={hyped ? { color: "#FF9500", background: "rgba(255,149,0,0.12)" } : { color: "rgba(255,255,255,0.35)", background: "transparent" }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openShareSheet(v.promo_post_id!, v.title); }}
                    title="Share"
                    aria-label="Share"
                    className="p-1.5 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    style={{ color: "rgba(255,255,255,0.35)", background: "transparent" }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                    </svg>
                  </button>
                </>
              );
            })()}
            {(channel?.isOwner || channel?.isCollaborator) && (
              <>
                <button
                  onClick={() => openVideoEdit(v)}
                  className="p-1.5 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-white/8 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Edit video"
                  aria-label="Edit video"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeletingVideoId(v.id)}
                  className="p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Delete video"
                  aria-label="Delete video"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inline edit form */}
        {isEditing && (
          <div className="px-3 pb-3 space-y-2 border-t border-white/8 pt-2">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] text-white/40">Title</label>
                <button type="button" onClick={() => saveAndRunAi("title")} disabled={videoAiBusy !== null}
                  className="text-[10px] text-white/50 hover:text-white disabled:opacity-40 transition-colors">
                  {videoAiBusy === "title" ? "…" : "✨ AI title"}
                </button>
              </div>
              <input
                value={videoEditForm.title}
                onChange={(e) => setVideoEditForm((p) => ({ ...p, title: e.target.value }))}
                maxLength={255}
                className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] text-white/40">Description</label>
                <button type="button" onClick={() => saveAndRunAi("description")} disabled={videoAiBusy !== null}
                  className="text-[10px] text-white/50 hover:text-white disabled:opacity-40 transition-colors">
                  {videoAiBusy === "description" ? "…" : "✨ AI description"}
                </button>
              </div>
              <textarea
                rows={2}
                value={videoEditForm.description}
                onChange={(e) => setVideoEditForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent resize-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] text-white/40">Tags (comma-separated)</label>
                <button type="button" onClick={() => saveAndRunAi("tags")} disabled={videoAiBusy !== null}
                  className="text-[10px] text-white/50 hover:text-white disabled:opacity-40 transition-colors">
                  {videoAiBusy === "tags" ? "…" : "✨ AI tags"}
                </button>
              </div>
              <input
                value={videoEditForm.tags}
                onChange={(e) => setVideoEditForm((p) => ({ ...p, tags: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent"
              />
            </div>
            {/* Tag Creators */}
            <div>
              <label className="block text-[10px] text-white/40 mb-1">Tag Creators (max 5)</label>
              {taggedCreators.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {taggedCreators.map((c) => (
                    <span key={c.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-xs text-white/80">
                      @{c.username}
                      <button
                        type="button"
                        onClick={() => setTaggedCreators((prev) => prev.filter((x) => x.id !== c.id))}
                        className="text-white/40 hover:text-white ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {taggedCreators.length < 5 && (
                <div className="relative">
                  <input
                    type="text"
                    value={creatorTagSearch}
                    onChange={async (e) => {
                      setCreatorTagSearch(e.target.value);
                      if (e.target.value.trim().length < 2) { setCreatorTagResults([]); return; }
                      setCreatorTagSearching(true);
                      try {
                        const res = await searchCreators(e.target.value.trim());
                        setCreatorTagResults((res.users || []).filter((c) => !taggedCreators.some((t) => t.id === c.id)));
                      } catch { /* ignore */ } finally { setCreatorTagSearching(false); }
                    }}
                    placeholder={creatorTagSearching ? "Searching…" : "Search creators to tag…"}
                    className="w-full px-3 py-1.5 rounded-lg text-xs text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent placeholder-white/25"
                  />
                  {creatorTagResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-white/10 bg-pnp-surface overflow-hidden">
                      {creatorTagResults.slice(0, 5).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setTaggedCreators((prev) => [...prev, c]);
                            setCreatorTagSearch("");
                            setCreatorTagResults([]);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left"
                        >
                          <span className="text-xs text-white/80">@{c.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {videoEditError && <p className="text-xs text-red-400">{videoEditError}</p>}
            <div className="flex gap-2">
              <button
                onClick={saveVideoEdit}
                disabled={videoEditSaving}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
              >
                {videoEditSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingVideoId(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-white/50 border border-white/10 hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {isDeleting && (
          <div className="px-3 pb-3 pt-2 border-t border-red-500/20 space-y-2">
            <p className="text-xs text-red-300">Delete this video? This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={confirmVideoDelete}
                disabled={videoDeleteLoading}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {videoDeleteLoading ? "Deleting…" : "Yes, Delete"}
              </button>
              <button
                onClick={() => setDeletingVideoId(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-white/50 border border-white/10 hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Channels
        </button>
        <div className="w-full aspect-video rounded-xl bg-pnp-surfaceHover animate-pulse" />
        <div className="h-6 w-48 bg-pnp-surfaceHover animate-pulse rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-pnp-surfaceHover animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <div className="py-10 text-center text-pnp-textSecondary text-sm">
          {error || "Channel not found"}
        </div>
      </div>
    );
  }

  const hasCover = isValidPhotoUrl(channel.coverImageUrl);

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Channels
      </button>

      {/* Channel header */}
      <div className="rounded-2xl overflow-hidden border border-pnp-border bg-pnp-surface">
        {/* Cover */}
        <div className="relative w-full" style={{ aspectRatio: "3/1", minHeight: 120 }}>
          {hasCover ? (
            <img
              src={channel.coverImageUrl!}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, hsl(${(channel.id * 47) % 360}, 60%, 20%), hsl(${(channel.id * 47 + 120) % 360}, 60%, 15%))`,
              }}
            />
          )}
          {(() => {
            const at = channel.accessType ?? (channel.isPremium ? "subscription" : "free");
            if (at === "free") return null;
            let bg = "rgba(212,0,122,0.9)";
            let label = "Premium";
            if (at === "prime") { bg = "rgba(167,139,250,0.9)"; label = "Prime"; }
            else if (at === "paid") { bg = "rgba(230,145,56,0.9)"; label = `$${channel.priceUsd ?? 0}`; }
            return (
              <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                style={{ background: bg, color: "#fff" }}>
                {label}
                {channel.hangoutGroupId && (
                  <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </span>
            );
          })()}
        </div>

        {/* Meta */}
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-pnp-textPrimary leading-tight">{channel.name}</h2>
              {channel.description && (
                <p className="text-sm text-pnp-textSecondary mt-1 leading-relaxed">{channel.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm text-pnp-textSecondary">
                {(channel.videoCount ?? videos.length)} video{(channel.videoCount ?? videos.length) !== 1 ? "s" : ""}
              </span>
              {(channel.isOwner || channel.isCollaborator) && (
                <>
                  {/* New universal upload flow with AI assist + smart promo
                       — recommended for all channels going forward. */}
                  <UploadVideoButton
                    variant="compact"
                    channelId={channel.id}
                    channelName={channel.name}
                    channelSlug={channel.slug}
                    accessType={(channel.accessType as "free" | "subscription" | "prime" | "paid") || "free"}
                    pricePerMonth={channel.priceUsd ?? null}
                    creatorUsername={channel.creatorUsername ?? null}
                  />
                </>
              )}
              {channel.isOwner && (
                <>
                  <button
                    onClick={openEdit}
                    className="p-1.5 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-white/8 transition-colors"
                    title="Edit channel"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete channel"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Creator nudge: encourage uploading more content */}
          {(channel.isOwner || channel.isCollaborator) && channel.videoCount != null && channel.videoCount < 5 && (
            <div
              className="mx-4 mb-3 rounded-xl p-3 flex items-start gap-3 border border-yellow-500/20"
              style={{ background: "rgba(234,179,8,0.07)" }}
            >
              <span className="text-lg flex-shrink-0">💡</span>
              <div className="min-w-0">
                <p className="text-xs text-yellow-300/90 font-medium leading-snug">
                  You have {channel.videoCount} video{channel.videoCount !== 1 ? "s" : ""} in this channel.
                  Upload more content to attract more subscribers.
                </p>
                <a
                  href="/creators"
                  className="text-xs font-semibold underline underline-offset-2 mt-0.5 inline-block"
                  style={{ color: "#facc15" }}
                >
                  See content guidelines →
                </a>
              </div>
            </div>
          )}

          {/* Edit form */}
          {showEditForm && channel.isOwner && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-pnp-textPrimary">Edit Channel</p>
              {/* Cover image */}
              <div>
                <label className="block text-xs text-white/50 mb-1">Channel Picture</label>
                <div
                  className="relative w-full rounded-lg overflow-hidden cursor-pointer group border border-white/10 hover:border-pnp-accent/50 transition-colors"
                  style={{ aspectRatio: "3/1", minHeight: 80 }}
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverPreview || isValidPhotoUrl(channel.coverImageUrl) ? (
                    <img
                      src={coverPreview || channel.coverImageUrl!}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{
                        background: `linear-gradient(135deg, hsl(${(channel.id * 47) % 360}, 60%, 20%), hsl(${(channel.id * 47 + 120) % 360}, 60%, 15%))`,
                      }}
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1.5 text-white text-xs font-medium">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                      </svg>
                      Change Picture
                    </div>
                  </div>
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { setEditError("Image must be under 5MB"); return; }
                    setCoverFile(file);
                    setCoverPreview(URL.createObjectURL(file));
                    setEditError(null);
                  }}
                />
                <p className="text-[10px] text-white/30 mt-1">JPEG, PNG, WebP, GIF — max 5MB</p>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Channel Name *</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Tags (comma-separated)</label>
                <input
                  value={editForm.tags}
                  onChange={(e) => setEditForm((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="e.g. exclusive, photos, bts"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent"
                />
              </div>
              {/* Access type selector */}
              <div>
                <label className="block text-xs text-white/50 mb-2">Access Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "free" as const, label: "Free", color: "#5ED1C4", bg: "rgba(94,209,196,0.15)" },
                    { value: "subscription" as const, label: "Paid", color: "#D4007A", bg: "rgba(212,0,122,0.15)" },
                  ]).map(({ value, label, color, bg }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={channel?.accessType === "prime"}
                      onClick={() => setEditForm((p) => ({ ...p, accessType: value, priceUsd: 0 }))}
                      className="py-2 px-3 rounded-lg text-xs font-medium transition-all border"
                      style={editForm.accessType === value
                        ? { background: bg, color, borderColor: color }
                        : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.1)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {editForm.accessType === "paid" && (
                <div>
                  <label className="block text-xs text-white/50 mb-2">Price per 30 days (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "#E69138" }}>$</span>
                    <input
                      type="number"
                      min="1.99"
                      max="499"
                      step="0.01"
                      value={editForm.priceUsd || ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, priceUsd: Number(e.target.value) || 0 }))}
                      placeholder="9.99"
                      className="w-full pl-7 pr-12 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white placeholder-white/25 focus:outline-none focus:border-orange-500/60"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">/mo</span>
                  </div>
                  <p className="text-[10px] text-white/30 mt-1.5">Mín. $1.99 · Máx. $499 · La mayoría cobra entre $5 y $29/mes</p>
                </div>
              )}
              {/* Telegram Bridge */}
              <div className="pt-1 border-t border-white/10">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Telegram Bridge</p>
                <div className="mb-2">
                  <label className="block text-xs text-white/50 mb-1">Telegram Channel ID or @username</label>
                  <input
                    value={editForm.telegramChannelId}
                    onChange={(e) => setEditForm((p) => ({ ...p, telegramChannelId: e.target.value, bridgeEnabled: p.bridgeEnabled && !!e.target.value.trim() }))}
                    placeholder="-1001234567890 or @mychannel"
                    className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent font-mono"
                  />
                </div>
                {editForm.telegramChannelId.trim() && (
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.bridgeEnabled}
                      onChange={(e) => setEditForm((p) => ({ ...p, bridgeEnabled: e.target.checked }))}
                      className="w-4 h-4 rounded accent-[#D4007A]"
                    />
                    <span className="text-sm text-white/80">Enable auto-mirror</span>
                  </label>
                )}
              </div>
              {editError && (
                <div className="px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
                  {editError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={saveEdit}
                  disabled={editSaving || !editForm.name.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setShowEditForm(false)}
                  className="px-4 py-2.5 rounded-xl text-sm text-white/60 border border-white/10 hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-300">Delete this channel?</p>
              <p className="text-xs text-white/50">This will permanently delete <span className="text-white/80 font-medium">{channel.name}</span> and unlink all its posts from this channel. The posts themselves will remain visible in the social feed. This cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleteLoading ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 rounded-xl text-sm text-white/60 border border-white/10 hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Tags */}
          {channel.tags && channel.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {channel.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-xs text-pnp-textSecondary"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Channel owners */}
          {(() => {
            const allOwners = [
              { id: channel.creatorId, name: channel.creatorName || channel.creatorUsername || "Creator", username: channel.creatorUsername, photoUrl: channel.creatorPhotoUrl, verified: channel.creatorVerified ?? false },
              ...(channel.collaboratorProfiles ?? []),
            ];
            return (
              <div className="pt-1 border-t border-pnp-border/50">
                <div className="flex items-center gap-3 flex-wrap">
                  {allOwners.map((owner, i) => (
                    <a key={owner.id} href={`/profile/${owner.id}`} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                      {isValidPhotoUrl(owner.photoUrl) ? (
                        <img src={owner.photoUrl!} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}>
                          {(owner.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm text-pnp-textSecondary">{owner.name}</span>
                      {owner.verified && (
                        <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                      {i < allOwners.length - 1 && <span className="text-white/20 text-xs ml-1">&</span>}
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Locked overlay */}
      {locked ? (
        <div className="rounded-2xl border border-pnp-border bg-pnp-surface flex flex-col items-center justify-center gap-3 p-8 text-center"
          style={{ minHeight: 240 }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={channel.accessType === 'prime'
              ? { background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)" }
              : { background: "rgba(212,0,122,0.15)", border: "1px solid rgba(212,0,122,0.3)" }
            }>
            <svg className="w-7 h-7" style={{ color: channel.accessType === 'prime' ? "#A78BFA" : "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          {channel.accessType === 'prime' ? (
            <>
              <p className="text-white font-semibold text-base">PRIME Members Only</p>
              <p className="text-sm max-w-xs" style={{ color: "var(--pnp-text-secondary)" }}>
                This channel is exclusive to PRIME members. Upgrade your plan to unlock all {channel.videoCount ?? 0} videos.
              </p>
              <button
                className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #A78BFA, #D4007A)" }}
                onClick={() => { window.location.href = '/subscribe'; }}
              >
                Upgrade to PRIME
              </button>
            </>
          ) : lockReason === 'AUTH_REQUIRED' ? (
            <>
              <p className="text-white font-semibold text-base">Members Only</p>
              <p className="text-sm max-w-xs" style={{ color: "var(--pnp-text-secondary)" }}>
                Sign in to access this channel.
              </p>
              <button
                className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                onClick={() => { window.location.href = '/login'; }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              <p className="text-white font-semibold text-base">Premium Channel</p>
              <p className="text-sm max-w-xs" style={{ color: "var(--pnp-text-secondary)" }}>
                Subscribe to {channel.creatorName || "this creator"} to access this channel.
              </p>
              <p className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "rgba(230,145,56,0.15)", color: "#E69138", border: "1px solid rgba(230,145,56,0.3)" }}>
                💎 Incluye canal + perfil exclusivo — 2x1
              </p>
              <button
                className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                onClick={() => { if (channel.creatorId) setShowSubscribeWizard(true); }}
              >
                Subscribe to Access
              </button>
            </>
          )}
        </div>
      ) : videos.length === 0 && posts.length === 0 ? (
        <div className="py-12 text-center text-pnp-textSecondary text-sm">
          No content in this channel yet
        </div>
      ) : (
        <>
        {videos.length > 0 && (
          <div className="-mx-4 divide-y divide-pnp-border/40">
            {videos.map((v) => renderVideoCard(v))}
          </div>
        )}
        {/* Posts section */}
        {posts.length > 0 && (
          <div className="mt-4 space-y-3">
            {videos.length > 0 && (
              <h3 className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider px-1">Posts</h3>
            )}
            {posts.map((post) => {
              const authorName = post.author_first_name || post.author_username || "User";
              const authorPhoto = post.author_photo;
              const hasPhoto = isValidPhotoUrl(authorPhoto);
              const primaryMedia = post.media_urls && post.media_urls.length > 0
                ? post.media_urls[0]
                : post.media_url ? { url: post.media_url, type: post.media_type ?? "image" } : null;
              return (
                <div key={`post-${post.id}`} className="rounded-xl border border-pnp-border bg-pnp-surface p-3 space-y-2">
                  {/* Author row */}
                  <div className="flex items-center gap-2">
                    {hasPhoto ? (
                      <img
                        src={authorPhoto!}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-pnp-surfaceHover flex items-center justify-center flex-shrink-0 text-xs font-semibold text-pnp-textSecondary">
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-pnp-textPrimary truncate block">
                        {authorName}
                        {post.author_username && (
                          <span className="font-normal text-pnp-textSecondary ml-1">@{post.author_username}</span>
                        )}
                      </span>
                    </div>
                    <span className="text-[10px] text-pnp-textSecondary flex-shrink-0">{formatRelativeTime(post.created_at)}</span>
                  </div>
                  {/* Content */}
                  {post.content && (
                    <p className="text-sm text-pnp-textPrimary leading-relaxed whitespace-pre-line">{post.content}</p>
                  )}
                  {/* Media */}
                  {primaryMedia && (primaryMedia.type === "image" || primaryMedia.type?.startsWith("image/")) && (
                    <img
                      src={primaryMedia.url}
                      alt=""
                      className="w-full rounded-lg object-cover max-h-72"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  {/* Stats row */}
                  <div className="flex items-center gap-4 pt-0.5">
                    <span className="flex items-center gap-1 text-[11px] text-pnp-textSecondary">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                      {post.likes_count ?? 0}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-pnp-textSecondary">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                      </svg>
                      {post.replies_count ?? 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>
      )}
      {/* Video Player Modal */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPlayingVideo(null)}
        >
          <div
            className={`relative w-full rounded-2xl overflow-hidden flex flex-col ${videoIsLandscape ? "max-w-6xl" : "max-w-2xl"}`}
            style={{ background: "#0A0A14", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-sm font-semibold text-white truncate flex-1 mr-2">
                {playingVideo.title || "Video"}
              </p>
              {user && (() => {
                const pv = videos.find(x => x.id === playingVideo.videoId);
                const likeState = pv ? (videoLikes[pv.id] ?? { liked: pv.liked_by_me ?? false, count: pv.likes_count ?? 0 }) : { liked: false, count: 0 };
                return (
                  <>
                    {pv?.promo_post_id && (
                      <button
                        onClick={() => handleVideoLike(pv)}
                        title={likeState.liked ? "Unlike" : "Like"}
                        className="w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0"
                        style={{ color: likeState.liked ? "#D4007A" : "rgba(255,255,255,0.35)", background: likeState.liked ? "rgba(212,0,122,0.12)" : "transparent" }}
                      >
                        <svg className="w-4 h-4" fill={likeState.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={likeState.liked ? 0 : 2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => { if (pv) openHypeModal(pv); }}
                      title={hypePosted.has(playingVideo.videoId) || videoHypeToggles[playingVideo.videoId] ? "Hyped!" : "Hype this video"}
                      className="w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0"
                      style={hypePosted.has(playingVideo.videoId) || videoHypeToggles[playingVideo.videoId] || modalHypeOpen
                        ? { color: "#FF9500", background: "rgba(255,149,0,0.15)" }
                        : { color: "rgba(255,255,255,0.35)", background: "transparent" }
                      }
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                      </svg>
                    </button>
                    {pv?.promo_post_id && (
                      <button
                        onClick={() => openShareSheet(pv.promo_post_id!, pv.title)}
                        title="Share"
                        className="w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0"
                        style={{ color: "rgba(255,255,255,0.35)", background: "transparent" }}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                        </svg>
                      </button>
                    )}
                  </>
                );
              })()}
              <button
                onClick={() => setPlayingVideo(null)}
                className="w-11 h-11 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Video */}
            {!playingVideo.url ? (
              /* Per-video paywall — same lock card pattern as the full-channel overlay */
              <div className="w-full flex flex-col items-center justify-center gap-3 py-10 px-6 text-center" style={{ minHeight: 200, background: "#0A0A14" }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={channelIsPrime
                    ? { background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)" }
                    : { background: "rgba(212,0,122,0.15)", border: "1px solid rgba(212,0,122,0.3)" }
                  }>
                  <svg className="w-7 h-7" style={{ color: channelIsPrime ? "#A78BFA" : "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                {channelIsPrime ? (
                  <>
                    <p className="text-white font-semibold text-base">PRIME Members Only</p>
                    <p className="text-sm text-pnp-textSecondary max-w-xs">Upgrade to PRIME to watch this video.</p>
                    <button
                      onClick={() => { setPlayingVideo(null); window.location.href = '/subscribe'; }}
                      className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #A78BFA, #D4007A)" }}
                    >
                      Upgrade to PRIME
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-white font-semibold text-base">Premium Channel</p>
                    <p className="text-sm text-pnp-textSecondary max-w-xs">Subscribe to {channel.creatorName || "this creator"} to watch this video.</p>
                    <p className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "rgba(230,145,56,0.15)", color: "#E69138", border: "1px solid rgba(230,145,56,0.3)" }}>
                      &#128142; Incluye canal + perfil exclusivo — 2x1
                    </p>
                    <button
                      onClick={() => {
                        setPlayingVideo(null);
                        if (channel.creatorId) setShowSubscribeWizard(true);
                        else window.location.href = '/subscribe';
                      }}
                      className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                    >
                      Subscribe to Access
                    </button>
                  </>
                )}
              </div>

            ) : videoPlayerError ? (
              <div className="w-full flex flex-col items-center justify-center gap-2 py-10 bg-black" style={{ minHeight: 200 }}>
                <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p className="text-xs text-white/40">Video unavailable</p>
              </div>
            ) : (() => {
              // Product spec: 16s branded intro curtain plays before creator
              // channel videos ≥ 30s. Uploader is always the primary credit;
              // tagged collaborators are joined with "feat.". Channel eyebrow
              // is "{Channel name} for PNPtv!".
              const uploader = playingVideo.uploaderDisplayName || channel.creatorName || channel.creatorUsername || "Creator";
              const featNames = (playingVideo.taggedCreators || [])
                .map(t => t.first_name || t.username)
                .filter(Boolean);
              const performers = featNames.length > 0
                ? `${uploader} feat. ${featNames.join(" y ")}`
                : uploader;
              const eligible = (playingVideo.durationSec ?? 0) >= 30;
              // PRIME (official) channel gets a plain "PRIME" eyebrow — no
              // "for PNPtv!" suffix. All other creator channels use the full
              // "{Channel} for PNPtv!" form.
              const eyebrow = channelIsPrime ? "PRIME" : `${channel.name} for PNPtv!`;
              const intro = eligible ? {
                channel: eyebrow,
                title: playingVideo.title,
                performers,
              } : null;
              return (
                <VideoPlayer
                  key={playingVideo.url}
                  src={playingVideo.url}
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload"
                  creatorDisclaimer
                  intro={intro}
                  onContextMenu={(e) => e.preventDefault()}
                  onError={() => {
                    // If the primary source (usually Mux HLS) fails and we
                    // have a Directus fallback we haven't tried yet, swap and
                    // retry once before surfacing "Video unavailable".
                    const fb = playingVideo.fallbackUrl;
                    if (fb && fb !== playingVideo.url) {
                      setPlayingVideo({ ...playingVideo, url: fb, fallbackUrl: null });
                    } else {
                      setVideoPlayerError(true);
                    }
                  }}
                  onLoadedMetadata={(e) => {
                    // Landscape source → widen the modal + expand the player
                    // to semi-fullscreen. Portrait/square stays compact.
                    const v = e.currentTarget;
                    if (v.videoWidth && v.videoHeight) {
                      setVideoIsLandscape(v.videoWidth > v.videoHeight * 1.05);
                    }
                  }}
                  className="w-full flex-shrink-0 bg-black"
                  style={{ maxHeight: videoIsLandscape ? "80vh" : "50vh" }}
                  preload="metadata"
                />
              );
            })()}
            {showPrimeUpsell && !primeUpsellDismissed && playingVideo.url && !videoPlayerError && (
              <a
                href="/subscribe"
                onClick={() => setPlayingVideo(null)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(90deg, #D4007A 0%, #FF6B9D 100%)" }}
              >
                <span className="flex-1">Unlock everything {channel?.creatorName || channel?.creatorUsername || "this creator"} makes — go PRIME</span>
                <span aria-hidden="true">→</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissPrimeUpsell(); }}
                  aria-label="Dismiss"
                  className="w-5 h-5 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors -mr-1"
                >
                  ×
                </button>
              </a>
            )}
            {showCreatorSubscribeUpsell && !creatorUpsellDismissed && playingVideo.url && !videoPlayerError && (
              <button
                type="button"
                onClick={() => { setPlayingVideo(null); if (channel?.creatorId) setShowSubscribeWizard(true); }}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold flex-shrink-0 transition-opacity hover:opacity-90 text-left w-full"
                style={{ background: "linear-gradient(90deg, #5ED1C4 0%, #2DD4BF 100%)", color: "#04252b" }}
              >
                <span className="flex-1">Subscribe to {channel?.creatorName || channel?.creatorUsername || "this creator"} for exclusive content</span>
                <span aria-hidden="true">→</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissCreatorUpsell(); }}
                  aria-label="Dismiss"
                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors -mr-1 cursor-pointer"
                  style={{ color: "#04252b" }}
                >
                  ×
                </span>
              </button>
            )}
            {/* Tagged creators */}
            {playingVideo.taggedCreators.length > 0 && (
              <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="text-xs text-white/40">With:</span>
                {playingVideo.taggedCreators.map((c) => (
                  <a
                    key={c.id}
                    href={`/profile/${c.id}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium hover:opacity-80 transition-opacity"
                    style={{ background: "rgba(212,0,122,0.12)", color: "#D4007A", border: "1px solid rgba(212,0,122,0.2)" }}
                  >
                    {c.avatar_url && (
                      <img src={c.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                    @{c.username}
                  </a>
                ))}
              </div>
            )}
            {/* Hype compose panel in modal */}
            {modalHypeOpen && (
              <div className="px-4 py-3 flex-shrink-0 space-y-2" style={{ borderTop: "1px solid rgba(255,149,0,0.2)", background: "rgba(255,149,0,0.04)" }}>
                <p className="text-[10px] text-orange-400/70 font-medium tracking-wide uppercase">Hype Post</p>
                <textarea
                  rows={2}
                  value={hypeText}
                  onChange={(e) => setHypeText(e.target.value)}
                  maxLength={280}
                  className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-orange-400 resize-none placeholder-white/25"
                  placeholder="Write your hype post…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => submitHype(playingVideo.videoId)}
                    disabled={hypePosting || !hypeText.trim()}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
                    style={{ background: "linear-gradient(135deg,#FF9500,#E69138)" }}
                  >
                    {hypePosting ? "Posting…" : "🔥 Post Hype"}
                  </button>
                  <button
                    onClick={() => setModalHypeOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-white/50 border border-white/10 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Comments */}
            {playingVideo.promoPostId && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Comment input */}
                <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                      placeholder="Add a comment…"
                      maxLength={500}
                      className="flex-1 px-3 py-2 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent placeholder-white/25"
                    />
                    <button
                      onClick={submitComment}
                      disabled={commentPosting || !commentInput.trim()}
                      className="px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                      style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                    >
                      {commentPosting ? "…" : "Post"}
                    </button>
                  </div>
                </div>
                {/* Comment list */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3">
                  {commentsLoading && videoComments.length === 0 ? (
                    <div className="py-4 text-center text-xs text-white/30">Loading comments…</div>
                  ) : videoComments.length === 0 ? (
                    <div className="py-4 text-center text-xs text-white/30">No comments yet — be the first!</div>
                  ) : (
                    videoComments.map((c) => {
                      const cReactions = commentReactions[c.id] ?? [];
                      const visibleReactions = cReactions.filter((r) => r.count > 0);
                      return (
                        <div key={c.id} className="flex gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0 overflow-hidden">
                            {isValidPhotoUrl(c.author_photo) ? (
                              <img src={c.author_photo} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-white/40">
                                {(c.author_first_name || c.author_username || "?")[0].toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white/70">{c.author_first_name || c.author_username || "User"}</p>
                            <p className="text-sm text-white/90 mt-0.5 break-words">{c.content}</p>
                            {visibleReactions.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {visibleReactions.map((r) => (
                                  <button
                                    key={r.emoji}
                                    onClick={() => handleCommentReaction(c.id, r.emoji)}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-colors"
                                    style={r.reactedByMe ? { background: "rgba(212,0,122,0.15)", border: "1px solid rgba(212,0,122,0.35)", color: "#D4007A" } : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                                  >
                                    {r.emoji} {r.count}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="relative mt-1">
                              <button
                                onClick={() => {
                                  if (commentReactionPickerOpen === c.id) {
                                    setCommentReactionPickerOpen(null);
                                  } else {
                                    loadCommentReactions(c.id);
                                    setCommentReactionPickerOpen(c.id);
                                  }
                                }}
                                className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                              >
                                {commentReactionPickerOpen === c.id ? "✕" : "😀"}
                              </button>
                              {commentReactionPickerOpen === c.id && (
                                <div className="absolute left-0 top-5 z-10 flex flex-wrap gap-1 p-2 rounded-xl border border-white/10 shadow-xl" style={{ background: "#111118", minWidth: 220 }}>
                                  {REACTION_EMOJIS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={() => handleCommentReaction(c.id, emoji)}
                                      className="text-lg p-1 rounded-lg hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {commentsHasMore && (
                    <button
                      onClick={() => loadComments(playingVideo.channelId, playingVideo.videoId, playingVideo.promoPostId, commentsCursor ?? undefined)}
                      className="w-full py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      Load more comments
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {shareTarget && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeShareSheet}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.1)", borderBottom: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-sm font-semibold text-white truncate mr-2">{shareTarget.videoTitle}</p>
              <button onClick={closeShareSheet} className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {shareSuccess ? (
              <div className="px-4 py-8 text-center text-sm font-semibold text-green-400">{shareSuccess}</div>
            ) : shareStep === "main" ? (
              <div className="p-4 space-y-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://pnptv.app/channels`).catch(() => {});
                    setShareSuccess("Link copied!");
                    setTimeout(closeShareSheet, 1000);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-white/8 transition-colors min-h-[44px]"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                  Copy link
                </button>
                <button
                  onClick={() => setShareStep("hangout")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-white/8 transition-colors min-h-[44px]"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
                  Share to Hangout
                </button>
                <button
                  onClick={() => setShareStep("dm")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-white/8 transition-colors min-h-[44px]"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                  Send via DM
                </button>
              </div>
            ) : shareStep === "hangout" ? (
              <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
                <button onClick={() => setShareStep("main")} className="text-xs text-white/50 hover:text-white/80 mb-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
                {shareHangouts.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-4">No hangouts joined yet</p>
                ) : (
                  shareHangouts.map((g) => (
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
                  ))
                )}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <button onClick={() => setShareStep("main")} className="text-xs text-white/50 hover:text-white/80 mb-1 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
                <input
                  type="text"
                  value={shareDmInput}
                  onChange={(e) => setShareDmInput(e.target.value)}
                  placeholder="Enter username or user ID…"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent placeholder-white/25 min-h-[44px]"
                />
                <button
                  onClick={handleShareToDm}
                  disabled={shareSending || !shareDmInput.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity min-h-[44px]"
                  style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                >
                  {shareSending ? "Sending…" : "Send"}
                </button>
              </div>
            )}
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}

      {/* Inline creator-subscribe checkout — same NP coin-picker + tokens flow
          used by feed CTA + profile pill. Replaces the old redirect to
          /profile/:creatorId so users don't lose their place in the channel. */}
      {showSubscribeWizard && channel?.creatorId && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSubscribeWizard(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full sm:max-w-lg bg-pnp-background border border-pnp-border rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-pnp-textPrimary">
                Subscribe to {channel.creatorName || channel.creatorUsername || "creator"}
              </h2>
              <button
                onClick={() => setShowSubscribeWizard(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <CreatorSubscribeWizard
              creatorId={String(channel.creatorId)}
              creatorName={channel.creatorName || channel.creatorUsername || undefined}
              username={channel.creatorUsername ?? undefined}
              priceUsd={Number(channel.priceUsd || 0)}
              lang={"en"}
              accessType={(channel.accessType as "free" | "prime" | "subscription" | "paid") || "subscription"}
              storageKey={`pnp_creator_sub_${channel.creatorId}`}
              onSuccess={() => {
                setShowSubscribeWizard(false);
                // Refresh so the paywall gate lifts and the channel content
                // renders. The wizard's onSuccess fires after the poller sees
                // completed, so this is safe.
                window.location.reload();
              }}
              onClose={() => setShowSubscribeWizard(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Creator Card (existing) ───────────────────────────────────────────────────
function ChannelCard({ channel, onClick }: { channel: Channel; onClick: () => void }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const tier = TIER_COLORS[channel.creatorType] || TIER_COLORS.ice;
  const hasPreview = isValidPhotoUrl(channel.latestMediaUrl);

  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-pnp-surface overflow-hidden flex flex-col text-center transition-all hover:scale-[1.02] hover:border-pnp-accent/40 cursor-pointer w-full ${
        channel.isLive ? "border-red-500/50 ring-1 ring-red-500/20" : "border-pnp-border"
      }`}
    >
      {/* Preview thumbnail */}
      {hasPreview && (
        <div className="relative w-full aspect-video bg-pnp-surfaceHover">
          {!previewLoaded && (
            <div className="absolute inset-0 bg-pnp-surfaceHover animate-pulse" />
          )}
          <img
            src={channel.latestMediaUrl!}
            alt=""
            className={`w-full h-full object-cover ${previewLoaded ? "block" : "hidden"}`}
            onLoad={() => setPreviewLoaded(true)}
            onError={() => setPreviewLoaded(true)}
          />
          {channel.isLive && (
            <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          )}
        </div>
      )}

      <div className="p-4 flex flex-col items-center">
        {/* Avatar */}
        <div className="relative mb-3">
          {!imgLoaded && (
            <div className={`${hasPreview ? "w-14 h-14" : "w-20 h-20"} rounded-full bg-pnp-surfaceHover animate-pulse`} />
          )}
          <img
            src={isValidPhotoUrl(channel.photoUrl) ? channel.photoUrl : "/default-performer.svg"}
            alt={channel.displayName}
            className={`${hasPreview ? "w-14 h-14" : "w-20 h-20"} rounded-full object-cover border-2 ${
              channel.isLive ? "border-red-500" : "border-pnp-border"
            } ${imgLoaded ? "block" : "hidden"}`}
            onLoad={() => setImgLoaded(true)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/default-performer.svg";
              setImgLoaded(true);
            }}
          />
          {channel.isLive && !hasPreview && (
            <span className="absolute -top-1 -right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Name + verified */}
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm font-semibold text-pnp-textPrimary truncate max-w-[120px]">
            {channel.displayName}
          </span>
          {channel.verified && (
            <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
        </div>

        {/* Tier badge */}
        <span
          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mb-2"
          style={{ background: tier.bg, color: tier.text }}
        >
          {tier.label}
        </span>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[11px] text-pnp-textSecondary">
          <span>{channel.subscriberCount} subs</span>
          <span className="w-0.5 h-0.5 rounded-full bg-pnp-textSecondary" />
          <span>{channel.videoCount != null && channel.videoCount > 0 ? `${channel.videoCount} videos` : `${channel.postCount} posts`}</span>
        </div>

        {/* Featured badge */}
        {channel.featured && (
          <span className="text-[10px] mt-1.5 font-semibold" style={{ color: "#5ED1C4" }}>
            Featured
          </span>
        )}
      </div>
    </button>
  );
}

// ── Free-user upgrade wall ────────────────────────────────────────────────────
function MembersOnlyWall({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(212,0,122,0.12)", border: "1px solid rgba(212,0,122,0.3)" }}>
        <svg className="w-8 h-8" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-pnp-textPrimary mb-2">Members Only</h2>
        <p className="text-sm text-pnp-textSecondary max-w-xs">{message}</p>
      </div>
      <button
        onClick={() => navigate('/plans')}
        className="px-6 py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
      >
        See plans →
      </button>
      <button onClick={() => navigate(-1)} className="text-xs text-pnp-textSecondary hover:text-pnp-textPrimary">
        ← Go back
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Channels() {
  const { user } = useAuth();

  if (!user || user.tier === 'free') {
    return <MembersOnlyWall message="Channels and exclusive content require a PNPtv! membership." />;
  }

  return <ChannelsInner />;
}

function ChannelsInner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { showTutorial, dismissTutorial, dismissForever } = useTutorial("channels");

  // Selected channel for detail view
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);

  const [discoverTag, setDiscoverTag] = useState<string | null>(searchParams.get("discover"));
  const [discoverEntity, setDiscoverEntity] = useState<"all"|"members"|"creators"|"channels"|"videos"|"hangouts">("all");
  const [discoverResults, setDiscoverResults] = useState<{ members?: any[]; creators?: any[]; channels?: any[]; videos?: any[]; hangouts?: any[] } | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"channels"|"videos"|"discover">(
    searchParams.get("discover") ? "discover" : "channels"
  );

  // ── Creator profile state (feeds the pill strip at the bottom of the page) ──
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Creator channels state (the main grid) ──
  const [creatorChannels, setCreatorChannels] = useState<CreatorChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsSearch, setChannelsSearch] = useState("");
  const [debouncedChannelsSearch, setDebouncedChannelsSearch] = useState("");
  const [channelsPage, setChannelsPage] = useState(0);
  const [channelsHasMore, setChannelsHasMore] = useState(false);
  const [channelsTotal, setChannelsTotal] = useState(0);
  const [channelsLoadingMore, setChannelsLoadingMore] = useState(false);

  const channelsSentinelRef = useRef<HTMLDivElement>(null);

  // ── Create channel form (Channels page shortcut) ──
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<{ name: string; description: string; tags: string; accessType: "free" | "subscription" | "prime" | "paid"; priceUsd: number; telegramChannelId: string; bridgeEnabled: boolean }>({ name: "", description: "", tags: "", accessType: "free", priceUsd: 0, telegramChannelId: "", bridgeEnabled: false });
  const [createFormSaving, setCreateFormSaving] = useState(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  const handleQuickCreate = async () => {
    if (!createForm.name.trim()) { setCreateFormError("Channel name is required"); return; }
    setCreateFormSaving(true);
    setCreateFormError(null);
    try {
      const tags = createForm.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await createCreatorChannel({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        tags,
        accessType: createForm.accessType,
        priceUsd: createForm.accessType === "paid" ? createForm.priceUsd : 0,
        telegramChannelId: createForm.telegramChannelId.trim() || null,
        bridgeEnabled: createForm.bridgeEnabled,
      });
      if (res.success) {
        setCreatorChannels((prev) => [res.channel, ...prev]);
        setShowCreateForm(false);
        setCreateForm({ name: "", description: "", tags: "", accessType: "free", priceUsd: 0, telegramChannelId: "", bridgeEnabled: false });
        setSelectedChannelId(res.channel.id);
      }
    } catch (err: unknown) {
      setCreateFormError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setCreateFormSaving(false);
    }
  };

  // ── Debounce search (channels) ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedChannelsSearch(channelsSearch), 300);
    return () => clearTimeout(timer);
  }, [channelsSearch]);

  // ── Fetch creator profiles (feeds the pill strip — popular first, top 24 is
  // plenty for a horizontal scroll) ──
  const fetchChannels = useCallback(
    async () => {
      setLoading(true);
      try {
        const res = await getChannels({ sort: "popular", page: 0, limit: 24 });
        if (res.success) {
          setChannels(res.channels);
        }
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ── Fetch creator channels ──
  const fetchCreatorChannels = useCallback(
    async (pageNum: number, append = false) => {
      if (!append) setChannelsLoading(true);
      else setChannelsLoadingMore(true);
      try {
        const res = await browseCreatorChannels({
          search: debouncedChannelsSearch || undefined,
          page: pageNum,
          limit: 24,
        });
        if (res.success) {
          setCreatorChannels((prev) => (append ? [...prev, ...res.channels] : res.channels));
          setChannelsHasMore(res.nextPage !== null);
          setChannelsTotal(res.total);
          setChannelsPage(pageNum);
        }
      } catch {
        // non-critical
      } finally {
        setChannelsLoading(false);
        setChannelsLoadingMore(false);
      }
    },
    [debouncedChannelsSearch]
  );

  // ── Trigger fetches ──
  // Channels drive the main grid; creators feed the pill strip below it.
  useEffect(() => { fetchChannels(); }, [fetchChannels]);
  useEffect(() => { fetchCreatorChannels(0); }, [fetchCreatorChannels]);

  // ── Auto-select channel from URL ?channel=<slug> (e.g. from hype post CTA) ──
  useEffect(() => {
    const slugParam = searchParams.get("channel");
    if (!slugParam || creatorChannels.length === 0 || selectedChannelId !== null) return;
    const match = creatorChannels.find((ch) => ch.slug === slugParam);
    if (match) setSelectedChannelId(match.id);
  }, [searchParams, creatorChannels, selectedChannelId]);

  // ── Real-time live status via Socket.IO ──
  useEffect(() => {
    const socket = connectSocket();
    const handleLive = ({ userId }: { userId: string }) => {
      setChannels((prev) =>
        prev.map((ch) => (ch.id === userId ? { ...ch, isLive: true } : ch))
      );
    };
    const handleOffline = ({ userId }: { userId: string }) => {
      setChannels((prev) =>
        prev.map((ch) => (ch.id === userId ? { ...ch, isLive: false, hlsUrl: null } : ch))
      );
    };
    socket.on("channel:live", handleLive);
    socket.on("channel:offline", handleOffline);
    return () => {
      socket.off("channel:live", handleLive);
      socket.off("channel:offline", handleOffline);
    };
  }, []);

  // ── Infinite scroll (creator channels — the main grid) ──
  useEffect(() => {
    if (!channelsSentinelRef.current || !channelsHasMore || channelsLoadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && channelsHasMore && !channelsLoadingMore) {
          fetchCreatorChannels(channelsPage + 1, true);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(channelsSentinelRef.current);
    return () => observer.disconnect();
  }, [channelsHasMore, channelsLoadingMore, channelsPage, fetchCreatorChannels]);

  useEffect(() => {
    if (activeTab !== "discover" || !discoverTag) { setDiscoverResults(null); return; }
    setDiscoverLoading(true);
    const qs = new URLSearchParams({ tags: discoverTag, entity: discoverEntity });
    fetch(`/api/webapp/discover?${qs}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (data.success !== false) setDiscoverResults(data); })
      .catch(() => {})
      .finally(() => setDiscoverLoading(false));
  }, [discoverTag, discoverEntity, activeTab]);

  // ── If channel detail is open, render that view ──
  if (selectedChannelId !== null) {
    return (
      <>
        <Helmet>
          <title>Channel — PNPtv!</title>
        </Helmet>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <ChannelDetailView
            channelId={selectedChannelId}
            onBack={() => setSelectedChannelId(null)}
            onUpdated={(updated) =>
              setCreatorChannels((prev) =>
                prev.map((ch) => (ch.id === updated.id ? { ...ch, ...updated } : ch))
              )
            }
            onDeleted={(id) =>
              setCreatorChannels((prev) => prev.filter((ch) => ch.id !== id))
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Channels — PNPtv!</title>
        <meta name="description" content="Browse PNPtv creator channels" />
      </Helmet>

      <div className="max-w-6xl xl:max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-pnp-textPrimary">PNP Channels</h1>
            <p className="text-sm mt-1 text-pnp-textSecondary">Exclusive content from your favorite creators</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate("/models")} className="flex-shrink-0">
            ⭐ Browse Models
          </Button>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("channels")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "channels"
                ? "bg-pnp-accent text-white"
                : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
            }`}
          >
            Channels
          </button>
          <button
            onClick={() => setActiveTab("discover")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "discover"
                ? "bg-pnp-accent text-white"
                : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
            }`}
          >
            Discover ✨
          </button>
        </div>

        {/* ── DISCOVER VIEW ── */}
        {activeTab === "discover" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-pnp-border">
                <div className="flex flex-wrap gap-2 items-center">
                  {discoverTag ? (
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-pnp-accent text-white">
                      {discoverTag}
                      <button onClick={() => { setDiscoverTag(null); setDiscoverResults(null); }} className="ml-1 hover:opacity-80">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ) : (
                    <p className="text-sm text-pnp-textSecondary">Select an interest to explore:</p>
                  )}
                  {!discoverTag && [
                    { tag: "leather", e: "🥋" }, { tag: "bear", e: "🐻" }, { tag: "clouds", e: "☁️" },
                    { tag: "raw", e: "🔥" }, { tag: "bdsm", e: "⛓️" }, { tag: "twink", e: "🌸" },
                    { tag: "pig-play", e: "🐷" }, { tag: "outdoor", e: "🌲" }, { tag: "daddy", e: "👨" },
                    { tag: "latino", e: "🌶️" }, { tag: "jock", e: "💪" }, { tag: "muscle", e: "🏋️" },
                    { tag: "watersports", e: "💦" }, { tag: "voyeur", e: "👁️" }, { tag: "bondage", e: "🪢" },
                    { tag: "fisting", e: "✊" }, { tag: "solo", e: "1️⃣" }, { tag: "sober", e: "💧" },
                    { tag: "roleplay", e: "🎭" }, { tag: "breeding", e: "💦" }, { tag: "group", e: "👥" },
                    { tag: "orgy", e: "🎊" },
                  ].map(({ tag, e }) => (
                    <button
                      key={tag}
                      onClick={() => setDiscoverTag(tag)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-pnp-surface hover:bg-white/10 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors border border-pnp-border"
                    >
                      <span>{e}</span><span>{tag}</span>
                    </button>
                  ))}
                </div>
                {discoverTag && (
                  <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
                    {(["all","members","creators","channels","videos","hangouts"] as const).map(e => (
                      <button
                        key={e}
                        onClick={() => setDiscoverEntity(e)}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                          discoverEntity === e ? "bg-pnp-accent text-white" : "bg-pnp-surface text-pnp-textSecondary hover:text-pnp-textPrimary border border-pnp-border"
                        }`}
                      >
                        {e === "all" ? "All" : e.charAt(0).toUpperCase() + e.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {discoverLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : discoverTag && !discoverResults ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <p className="text-sm text-pnp-textSecondary">No results found for &ldquo;{discoverTag}&rdquo;</p>
                </div>
              ) : !discoverTag ? null : (
                <div className="divide-y divide-pnp-border">
                  {(discoverEntity === "all" || discoverEntity === "members") && (discoverResults?.members ?? []).length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-pnp-textSecondary/50 mb-2">Members</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {(discoverResults?.members ?? []).map((m: any) => {
                          const photo = m.photo_file_id && (m.photo_file_id.startsWith("/") || m.photo_file_id.startsWith("http")) ? m.photo_file_id : null;
                          const name = m.first_name ? `${m.first_name}${m.last_name ? ` ${m.last_name}` : ""}` : m.username || "Member";
                          return (
                            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-pnp-surfaceHover transition-colors text-left w-full">
                              <UserAvatar userId={m.id} photoUrl={photo} displayName={name} size="md" />
                              <button onClick={() => navigate(`/profile/${m.id}`)} className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-medium text-pnp-textPrimary truncate">{name}</p>
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                  {(m.tags || m.interests || []).slice(0, 3).map((tg: string) => (
                                    <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-pnp-surface text-pnp-textSecondary border border-pnp-border">{tg}</span>
                                  ))}
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(discoverEntity === "all" || discoverEntity === "creators") && (discoverResults?.creators ?? []).length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-pnp-textSecondary/50 mb-2">Creators</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {(discoverResults?.creators ?? []).map((c: any) => {
                          const photo = c.photo_url && (c.photo_url.startsWith("/") || c.photo_url.startsWith("http")) ? c.photo_url : null;
                          const name = c.display_name || c.username || "Creator";
                          return (
                            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-pnp-surfaceHover transition-colors text-left w-full">
                              <UserAvatar userId={c.user_id} photoUrl={photo} displayName={name} size="md" />
                              <button onClick={() => navigate(`/profile/${c.user_id}`)} className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-medium text-pnp-textPrimary truncate">{name}</p>
                                <div className="flex gap-1 mt-0.5 flex-wrap">
                                  {(c.tags || c.interests || []).slice(0, 3).map((tg: string) => (
                                    <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-pnp-surface text-pnp-textSecondary border border-pnp-border">{tg}</span>
                                  ))}
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(discoverEntity === "all" || discoverEntity === "channels") && (discoverResults?.channels ?? []).length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-pnp-textSecondary/50 mb-2">Channels</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {(discoverResults?.channels ?? []).map((ch: any) => (
                          <button key={ch.id} onClick={() => setSelectedChannelId(ch.id)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-pnp-surfaceHover transition-colors text-left w-full">
                            <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold text-white overflow-hidden" style={{ background: `linear-gradient(135deg, hsl(${(ch.id * 47) % 360}, 60%, 20%), hsl(${(ch.id * 47 + 120) % 360}, 60%, 15%))` }}>
                              {ch.coverImageUrl ? <img src={ch.coverImageUrl} alt="" className="w-full h-full object-cover" /> : (ch.name || "C")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-pnp-textPrimary truncate">{ch.name}</p>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {(ch.tags || []).slice(0, 3).map((tg: string) => (
                                  <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-pnp-surface text-pnp-textSecondary border border-pnp-border">{tg}</span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(discoverEntity === "all" || discoverEntity === "videos") && (discoverResults?.videos ?? []).length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-pnp-textSecondary/50 mb-2">Videos</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {(discoverResults?.videos ?? []).map((v: any) => (
                          <button key={v.id} onClick={() => setSelectedChannelId(v.channel_id)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-pnp-surfaceHover transition-colors text-left w-full">
                            <div className="w-14 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-pnp-surfaceHover">
                              {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><svg className="w-4 h-4 text-pnp-textSecondary" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-pnp-textPrimary truncate">{v.title || "Untitled"}</p>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {(v.tags || []).slice(0, 3).map((tg: string) => (
                                  <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-pnp-surface text-pnp-textSecondary border border-pnp-border">{tg}</span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(discoverEntity === "all" || discoverEntity === "hangouts") && (discoverResults?.hangouts ?? []).length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-pnp-textSecondary/50 mb-2">Hangouts</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {(discoverResults?.hangouts ?? []).map((h: any) => (
                          <button key={h.id} onClick={() => navigate(`/chat/${h.id}`)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-pnp-surfaceHover transition-colors text-left w-full">
                            <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold text-white" style={{ background: "rgba(212,0,122,0.2)" }}>
                              {(h.name || "H")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-pnp-textPrimary truncate">{h.name}</p>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {(h.tags || h.interests || []).slice(0, 3).map((tg: string) => (
                                  <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-pnp-surface text-pnp-textSecondary border border-pnp-border">{tg}</span>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {discoverResults && Object.values(discoverResults).every(arr => !arr || arr.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                      <p className="text-sm text-pnp-textSecondary">No results found for &ldquo;{discoverTag}&rdquo;</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CHANNELS VIEW (primary) ── */}
        {activeTab === "channels" && <>
            {/* Search + Create button row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pnp-textSecondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={channelsSearch}
                  onChange={(e) => setChannelsSearch(e.target.value)}
                  placeholder="Search channels..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-pnp-surface border border-pnp-border text-sm text-pnp-textPrimary placeholder:text-pnp-textSecondary focus:outline-none focus:border-pnp-accent/50 transition-colors"
                />
              </div>
              {user?.creator_status === "active" && (
                <button
                  onClick={() => { setShowCreateForm((v) => !v); setCreateFormError(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white flex-shrink-0 transition-all"
                  style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Channel
                </button>
              )}
            </div>

            {/* Inline create channel form */}
            {showCreateForm && user?.creator_status === "active" && (
              <div className="rounded-xl border border-pnp-border bg-pnp-surface p-4 space-y-3">
                <p className="text-sm font-semibold text-pnp-textPrimary">Create New Channel</p>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Channel Name *</label>
                  <input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Behind the Scenes"
                    className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={createForm.description}
                    onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What's this channel about?"
                    className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Tags (comma-separated)</label>
                  <input
                    value={createForm.tags}
                    onChange={(e) => setCreateForm((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="e.g. exclusive, photos, bts"
                    className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-2">Access Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: "free" as const, label: "Free", color: "#5ED1C4", bg: "rgba(94,209,196,0.15)" },
                      { value: "subscription" as const, label: "Paid", color: "#D4007A", bg: "rgba(212,0,122,0.15)" },
                    ]).map(({ value, label, color, bg }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCreateForm((p) => ({ ...p, accessType: value, priceUsd: 0 }))}
                        className="py-2 px-3 rounded-lg text-xs font-medium transition-all border"
                        style={createForm.accessType === value
                          ? { background: bg, color, borderColor: color }
                          : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.1)" }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {createForm.accessType === "paid" && (
                    <div className="mt-2">
                      <label className="block text-xs text-white/50 mb-1.5">Price per 30 days (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "#E69138" }}>$</span>
                        <input
                          type="number"
                          min="1.99"
                          max="499"
                          step="0.01"
                          value={createForm.priceUsd || ""}
                          onChange={(e) => setCreateForm((p) => ({ ...p, priceUsd: Number(e.target.value) || 0 }))}
                          placeholder="9.99"
                          className="w-full pl-7 pr-12 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white placeholder-white/25 focus:outline-none focus:border-orange-500/60"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">/mo</span>
                      </div>
                      <p className="text-[10px] text-white/30 mt-1.5">Mín. $1.99 · Máx. $499 · La mayoría cobra entre $5 y $29/mes</p>
                    </div>
                  )}
                </div>
                {/* Telegram Bridge */}
                <div className="pt-1 border-t border-white/10">
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Telegram Bridge</p>
                  <div className="mb-2">
                    <label className="block text-xs text-white/50 mb-1">Telegram Channel ID or @username</label>
                    <input
                      value={createForm.telegramChannelId}
                      onChange={(e) => setCreateForm((p) => ({ ...p, telegramChannelId: e.target.value, bridgeEnabled: p.bridgeEnabled && !!e.target.value.trim() }))}
                      placeholder="-1001234567890 or @mychannel"
                      className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-pnp-accent font-mono"
                    />
                    <p className="text-[10px] text-white/30 mt-1">The bot must be an admin of your Telegram channel.</p>
                  </div>
                  {createForm.telegramChannelId.trim() && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.bridgeEnabled}
                        onChange={(e) => setCreateForm((p) => ({ ...p, bridgeEnabled: e.target.checked }))}
                        className="w-4 h-4 rounded accent-[#D4007A]"
                      />
                      <span className="text-sm text-white/80">Enable auto-mirror</span>
                    </label>
                  )}
                </div>
                {createFormError && (
                  <div className="px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
                    {createFormError}
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleQuickCreate}
                    disabled={createFormSaving || !createForm.name.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                  >
                    {createFormSaving ? "Creating..." : "Create Channel"}
                  </button>
                  <button
                    onClick={() => { setShowCreateForm(false); setCreateFormError(null); }}
                    className="px-4 py-2.5 rounded-xl text-sm text-white/60 border border-white/10 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Total count */}
            {!channelsLoading && (
              <p className="text-xs text-pnp-textSecondary">
                {channelsTotal} channel{channelsTotal !== 1 ? "s" : ""}
                {debouncedChannelsSearch ? ` matching "${debouncedChannelsSearch}"` : ""}
              </p>
            )}

            {/* Channels grid */}
            {channelsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden">
                    <div className="w-full aspect-video bg-pnp-surfaceHover animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 w-3/4 bg-pnp-surfaceHover animate-pulse rounded" />
                      <div className="h-2.5 w-1/2 bg-pnp-surfaceHover animate-pulse rounded" />
                      <div className="h-2 w-full bg-pnp-surfaceHover animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : creatorChannels.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                  style={{ background: "rgba(212,0,122,0.1)" }}
                >
                  <svg className="w-8 h-8 text-pnp-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                </div>
                <p className="text-pnp-textPrimary font-semibold mb-1">No channels found</p>
                <p className="text-sm text-pnp-textSecondary mb-4">
                  {debouncedChannelsSearch ? "Try a different search term" : "Creators haven't published channels yet"}
                </p>
                {debouncedChannelsSearch && (
                  <Button variant="secondary" size="sm" onClick={() => setChannelsSearch("")}>
                    Clear search
                  </Button>
                )}
              </div>
            ) : (
              <>
                {(() => {
                  const featuredChannel = creatorChannels.find((c) => c.featured);
                  const gridChannels = creatorChannels.filter((c) => !c.featured);
                  return (
                    <>
                      {featuredChannel && (
                        <button
                          onClick={() => setSelectedChannelId(featuredChannel.id)}
                          className="w-full mb-4 group relative rounded-2xl overflow-hidden border border-pnp-accent/40 bg-pnp-surface text-left transition-transform hover:-translate-y-0.5"
                          style={{
                            background: featuredChannel.coverImageUrl
                              ? `linear-gradient(135deg, rgba(167,139,250,0.85) 0%, rgba(212,0,122,0.65) 50%, rgba(0,0,0,0.6) 100%), url(${featuredChannel.coverImageUrl}) center/cover`
                              : "linear-gradient(135deg, rgba(167,139,250,0.9) 0%, rgba(212,0,122,0.85) 100%)",
                          }}
                        >
                          <div className="px-5 py-6 sm:px-7 sm:py-8 flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur">
                                  Featured · PRIME
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/85">
                                  Available to all PRIME members
                                </span>
                              </div>
                              <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-sm">
                                {featuredChannel.name}
                              </h2>
                              {featuredChannel.description && (
                                <p className="mt-1.5 text-sm text-white/90 line-clamp-2 max-w-2xl">
                                  {featuredChannel.description}
                                </p>
                              )}
                              <div className="mt-3 flex items-center gap-3 text-xs text-white/80">
                                <span>{featuredChannel.videoCount != null && featuredChannel.videoCount > 0 ? `${featuredChannel.videoCount} videos` : `${featuredChannel.postCount} posts`}</span>
                                {(featuredChannel.subscriberCount ?? 0) > 0 && (
                                  <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-white/60" />
                                    <span>{featuredChannel.subscriberCount} subs</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-pnp-accent font-semibold text-sm shadow-lg group-hover:scale-105 transition-transform">
                                Enter PRIME
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </span>
                            </div>
                          </div>
                        </button>
                      )}
                      {gridChannels.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {gridChannels.map((ch) => (
                            <CreatorChannelCard
                              key={ch.id}
                              channel={ch}
                              onClick={() => setSelectedChannelId(ch.id)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
                {channelsLoadingMore && (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div ref={channelsSentinelRef} className="h-1" />
              </>
            )}

            {/* ── Creators pill strip (horizontal circle avatars) ── */}
            {!loading && channels.length > 0 && (
              <div className="pt-4 border-t border-pnp-border">
                <h2 className="text-sm font-semibold text-pnp-textPrimary mb-3">Creators</h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                  {channels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => navigate(`/profile/${ch.id}`)}
                      className="flex-shrink-0 flex flex-col items-center w-20 group"
                    >
                      <div className="relative">
                        <img
                          src={isValidPhotoUrl(ch.photoUrl) ? ch.photoUrl : "/default-performer.svg"}
                          alt={ch.displayName}
                          className={`w-16 h-16 rounded-full object-cover border-2 ${
                            ch.isLive ? "border-red-500" : "border-pnp-accent"
                          } group-hover:scale-105 transition-transform`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/default-performer.svg";
                          }}
                        />
                        {ch.isLive && (
                          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold uppercase">
                            Live
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-pnp-textPrimary mt-1.5 truncate max-w-full">
                        {ch.displayName}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
        </>}
      </div>
      {showTutorial && <TutorialOverlay section="channels" onDismiss={dismissTutorial} onDismissForever={dismissForever} />}
    </>
  );
}

// ── PNP Channels VOD Browser ─────────────────────────────────────────────────

function VideoramaInner() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [channels, setChannels] = useState<CreatorChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const TAGS = [
    { tag: "raw", e: "🔥" }, { tag: "leather", e: "🥋" }, { tag: "bear", e: "🐻" },
    { tag: "solo", e: "1️⃣" }, { tag: "bdsm", e: "⛓️" }, { tag: "muscle", e: "🏋️" },
    { tag: "latino", e: "🌶️" }, { tag: "twink", e: "🌸" }, { tag: "daddy", e: "👨" },
    { tag: "group", e: "👥" }, { tag: "outdoor", e: "🌲" }, { tag: "jock", e: "💪" },
    { tag: "bondage", e: "🪢" }, { tag: "fisting", e: "✊" }, { tag: "breeding", e: "💦" },
  ];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchChannels = useCallback(async (p: number, append: boolean) => {
    if (p === 0) setLoading(true); else setLoadingMore(true);
    try {
      const res = await browseCreatorChannels({ search: debouncedSearch || undefined, page: p, limit: 24 });
      if (res.success) {
        const videoChannels = (res.channels ?? []).filter((ch) => (ch.videoCount ?? 0) > 0);
        if (append) {
          setChannels((prev) => {
            const ids = new Set(prev.map((c) => c.id));
            return [...prev, ...videoChannels.filter((c) => !ids.has(c.id))];
          });
        } else {
          setChannels(videoChannels);
        }
        setTotal(res.total);
        setHasMore(res.nextPage !== null);
        setPage(p);
      }
    } catch {
      setError("Failed to load content");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    setChannels([]);
    setPage(0);
    setError(null);
    fetchChannels(0, false);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore) fetchChannels(page + 1, true); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page, fetchChannels]);

  const visibleChannels = activeTag
    ? channels.filter((ch) => ch.tags?.includes(activeTag))
    : channels;

  if (selectedChannelId !== null) {
    return (
      <>
        <Helmet>
          <title>PNP Channels — PNPtv!</title>
        </Helmet>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <ChannelDetailView
            channelId={selectedChannelId}
            onBack={() => setSelectedChannelId(null)}
            onUpdated={(updated) =>
              setChannels((prev) => prev.map((ch) => (ch.id === updated.id ? { ...ch, ...updated } : ch)))
            }
            onDeleted={(id) => setChannels((prev) => prev.filter((ch) => ch.id !== id))}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>PNP Channels — PNPtv!</title>
        <meta name="description" content="Browse exclusive PNPtv video channels" />
      </Helmet>
      <div className="max-w-6xl xl:max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #D4007A22, #7B61FF22)", border: "1px solid rgba(212,0,122,0.3)" }}
              >
                <svg className="w-4 h-4" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-pnp-textPrimary">PNP Channels</h1>
            </div>
            <p className="text-sm text-pnp-textSecondary">
              {loading ? "Loading..." : `${total} channel${total !== 1 ? "s" : ""} · exclusive videos from your creators`}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pnp-textSecondary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search channels…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-pnp-surface border border-pnp-border text-pnp-textPrimary placeholder:text-pnp-textSecondary focus:outline-none focus:border-pnp-accent/60 transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              activeTag === null ? "bg-pnp-accent text-white" : "bg-pnp-surface border border-pnp-border text-pnp-textSecondary hover:text-pnp-textPrimary"
            }`}
          >
            All
          </button>
          {TAGS.map(({ tag, e }) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTag === tag ? "bg-pnp-accent text-white" : "bg-pnp-surface border border-pnp-border text-pnp-textSecondary hover:text-pnp-textPrimary"
              }`}
            >
              <span>{e}</span>
              <span>{tag}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden">
                <div className="w-full aspect-video bg-pnp-surfaceHover animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-3 w-3/4 bg-pnp-surfaceHover animate-pulse rounded" />
                  <div className="h-2.5 w-1/2 bg-pnp-surfaceHover animate-pulse rounded" />
                  <div className="h-2 w-full bg-pnp-surfaceHover animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ background: "rgba(212,0,122,0.1)" }}
            >
              <svg className="w-9 h-9 text-pnp-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-pnp-textPrimary font-semibold mb-1">No videos found</p>
            <p className="text-sm text-pnp-textSecondary mb-4 max-w-xs">
              {activeTag ? `No channels tagged "${activeTag}" have videos yet` : debouncedSearch ? "Try a different search term" : "Creators haven't published videos yet"}
            </p>
            {(activeTag || debouncedSearch) && (
              <Button variant="secondary" size="sm" onClick={() => { setActiveTag(null); setSearch(""); }}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {(() => {
              const featured = visibleChannels.find((c) => c.featured);
              const rest = visibleChannels.filter((c) => !c.featured);
              return (
                <>
                  {featured && (
                    <button
                      onClick={() => setSelectedChannelId(featured.id)}
                      className="w-full group relative rounded-2xl overflow-hidden border border-pnp-accent/40 text-left transition-transform hover:-translate-y-0.5"
                      style={{
                        background: featured.coverImageUrl
                          ? `linear-gradient(135deg, rgba(123,97,255,0.85) 0%, rgba(212,0,122,0.7) 50%, rgba(0,0,0,0.6) 100%), url(${featured.coverImageUrl}) center/cover`
                          : "linear-gradient(135deg, rgba(123,97,255,0.9) 0%, rgba(212,0,122,0.85) 100%)",
                      }}
                    >
                      <div className="px-5 py-6 sm:px-7 sm:py-8 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur">
                              Featured
                            </span>
                            {featured.videoCount != null && featured.videoCount > 0 && (
                              <span className="text-[10px] font-semibold text-white/85">
                                {featured.videoCount} video{featured.videoCount !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-sm">{featured.name}</h2>
                          {featured.description && (
                            <p className="mt-1.5 text-sm text-white/90 line-clamp-2 max-w-2xl">{featured.description}</p>
                          )}
                          {featured.tags && featured.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {featured.tags.slice(0, 5).map((t) => (
                                <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/15 text-white/90 backdrop-blur">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-pnp-accent font-semibold text-sm shadow-lg group-hover:scale-105 transition-transform">
                            Watch now
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </button>
                  )}
                  {rest.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {rest.map((ch) => (
                        <VideoChannelCard key={ch.id} channel={ch} onClick={() => setSelectedChannelId(ch.id)} />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div ref={sentinelRef} className="h-1" />
          </>
        )}

        <div className="flex items-center justify-center pt-4">
          <button
            onClick={() => navigate("/channels")}
            className="flex items-center gap-1.5 text-xs text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            All Channels
          </button>
        </div>
      </div>
    </>
  );
}

function VideoChannelCard({ channel, onClick }: { channel: CreatorChannel; onClick: () => void }) {
  const [coverLoaded, setCoverLoaded] = useState(false);
  const hasCover = isValidPhotoUrl(channel.coverImageUrl);

  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden flex flex-col text-left transition-all hover:scale-[1.02] hover:border-pnp-accent/40 cursor-pointer w-full group"
    >
      <div className="relative w-full aspect-video overflow-hidden">
        {hasCover ? (
          <>
            {!coverLoaded && (
              <div className="absolute inset-0 bg-pnp-surfaceHover animate-pulse" />
            )}
            <img
              src={channel.coverImageUrl!}
              alt=""
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${coverLoaded ? "block" : "hidden"}`}
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverLoaded(true)}
            />
          </>
        ) : (
          <div
            className="w-full h-full group-hover:scale-105 transition-transform duration-300"
            style={{
              background: `linear-gradient(135deg, hsl(${(channel.id * 47) % 360}, 60%, 20%), hsl(${(channel.id * 47 + 120) % 360}, 60%, 15%))`,
            }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(212,0,122,0.85)", backdropFilter: "blur(4px)" }}>
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
        </div>
        {channel.videoCount != null && channel.videoCount > 0 && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
            {channel.videoCount} {channel.videoCount === 1 ? "video" : "videos"}
          </span>
        )}
        {(() => {
          const at = channel.accessType ?? (channel.isPremium ? "subscription" : "free");
          if (at === "free") return null;
          let bg = "rgba(212,0,122,0.85)";
          let label = "Premium";
          if (at === "prime") { bg = "rgba(167,139,250,0.85)"; label = "Prime"; }
          else if (at === "paid") { bg = "rgba(230,145,56,0.85)"; label = `$${channel.priceUsd ?? 0}`; }
          return (
            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-white"
              style={{ background: bg }}>
              {label}
            </span>
          );
        })()}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-pnp-textPrimary leading-tight line-clamp-1">{channel.name}</p>
        {channel.description && (
          <p className="text-xs text-pnp-textSecondary line-clamp-2 leading-relaxed">{channel.description}</p>
        )}
        {channel.tags && channel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {channel.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] text-pnp-textSecondary"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-auto pt-1.5 border-t border-pnp-border/50">
          {isValidPhotoUrl(channel.creatorPhotoUrl) ? (
            <img src={channel.creatorPhotoUrl!} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[7px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}>
              {(channel.creatorName || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-[11px] text-pnp-textSecondary truncate">
            {channel.creatorName || channel.creatorUsername || "Creator"}
          </span>
        </div>
      </div>
    </button>
  );
}

export function Videorama() {
  const { user } = useAuth();

  if (!user || user.tier === "free") {
    return <MembersOnlyWall message="PNP Channels exclusive videos require a PNPtv! membership." />;
  }

  return <VideoramaInner />;
}
