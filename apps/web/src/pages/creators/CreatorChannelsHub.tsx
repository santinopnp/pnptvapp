import React from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import {
  getOwnChannels,
  createCreatorChannel,
  listChannelVideos,
  deleteChannelVideo,
  type CreatorChannel,
  type ChannelVideo,
} from "@/lib/api";
import { UploadVideoButton } from "@/components/channels/UploadVideoButton";


const ACCESS_LABELS: Record<string, { label: string; color: string }> = {
  free:         { label: "Free",         color: "#34A853" },
  subscription: { label: "Subscription", color: "#D4007A" },
  prime:        { label: "PRIME",        color: "#E69138" },
  paid:         { label: "Pay-per-view", color: "#9B59B6" },
  bts:          { label: "BTS ◈",        color: "#d8b9ff" },
};

function ChannelVideoRow({
  video,
  channelId,
  onDeleted,
}: {
  video: ChannelVideo;
  channelId: number;
  onDeleted: (id: number) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteChannelVideo(channelId, video.id);
      onDeleted(video.id);
    } catch { /* ignore */ }
    setDeleting(false);
    setConfirmDelete(false);
  };

  const statusColor = video.status === "published" ? "#34C759" : video.status === "processing" ? "#F59E0B" : "#8E8E93";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      {video.thumbnail_url ? (
        <img src={video.thumbnail_url} alt="" className="w-12 h-8 rounded object-cover shrink-0" />
      ) : (
        <div className="w-12 h-8 rounded shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
          <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{video.title || "Untitled"}</p>
        <p className="text-[10px] mt-0.5" style={{ color: statusColor }}>
          {video.status === "published" ? "Published" : video.status === "processing" ? "Processing…" : "Draft"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {confirmDelete ? (
          <>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-2 py-1 rounded text-[10px] font-semibold"
              style={{ background: "rgba(255,59,48,0.15)", color: "#FF3B30" }}
            >
              {deleting ? "…" : "Delete"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded text-[10px]"
              style={{ background: "rgba(255,255,255,0.06)", color: "#8E8E93" }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5 text-white/30 hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ChannelCard({
  channel,
  onVideoPublished,
}: {
  channel: CreatorChannel;
  onVideoPublished?: () => void;
}) {
  const { user } = useAuth();
  const [videos, setVideos] = React.useState<ChannelVideo[]>([]);
  const [videosLoading, setVideosLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  const loadVideos = React.useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await listChannelVideos(channel.id);
      if (res.success) setVideos(res.videos);
    } catch { /* ignore */ }
    setVideosLoading(false);
  }, [channel.id]);

  React.useEffect(() => { loadVideos(); }, [loadVideos]);

  const accessInfo = ACCESS_LABELS[channel.accessType] ?? { label: channel.accessType, color: "#D4007A" };
  const recentVideos = videos.slice(0, expanded ? videos.length : 3);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
      {/* Channel header */}
      {channel.coverImageUrl && (
        <div className="h-24 w-full overflow-hidden">
          <img src={channel.coverImageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">{channel.name}</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${accessInfo.color}20`, color: accessInfo.color }}>
                {accessInfo.label}
              </span>
            </div>
            {channel.description && (
              <p className="text-xs text-pnp-textSecondary mt-0.5 line-clamp-2">{channel.description}</p>
            )}
            <p className="text-xs text-pnp-textSecondary/60 mt-1">
              {videos.length} video{videos.length !== 1 ? "s" : ""}
              {channel.subscriberCount !== undefined && ` · ${channel.subscriberCount} subscriber${channel.subscriberCount !== 1 ? "s" : ""}`}
            </p>
          </div>
          <UploadVideoButton
            channelId={channel.id}
            channelName={channel.name}
            channelSlug={channel.slug ?? String(channel.id)}
            accessType={channel.accessType as "free" | "subscription" | "prime" | "paid" | "bts"}
            pricePerMonth={channel.priceUsd ?? null}
            creatorUsername={user?.username ?? null}
            onPublished={() => { loadVideos(); onVideoPublished?.(); }}
            variant="pill"
          />
        </div>

        {/* Video list */}
        {videosLoading ? (
          <div className="space-y-2 pt-1">
            {[1, 2].map(i => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />)}
          </div>
        ) : videos.length === 0 ? (
          <div className="py-4 text-center rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
            <p className="text-xs text-pnp-textSecondary">No videos yet. Upload your first one!</p>
          </div>
        ) : (
          <div className="pt-1">
            {recentVideos.map(v => (
              <ChannelVideoRow
                key={v.id}
                video={v}
                channelId={channel.id}
                onDeleted={id => setVideos(prev => prev.filter(x => x.id !== id))}
              />
            ))}
            {videos.length > 3 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="mt-2 text-xs font-medium transition-colors"
                style={{ color: "#D4007A" }}
              >
                {expanded ? "Show less" : `Show all ${videos.length} videos`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CreatorChannelsHub() {
  const [channels, setChannels] = React.useState<CreatorChannel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    name: "",
    description: "",
    accessType: "subscription" as "free" | "subscription" | "prime" | "paid" | "bts",
  });
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  // BTS is a Crystal-Creator-only perk. Fetch active state so we only show
  // the "BTS ◈" option to eligible creators. Non-active → option hidden.
  const [isCrystalActive, setIsCrystalActive] = React.useState<boolean>(false);
  React.useEffect(() => {
    fetch("/api/creator/crystal/self", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.active) setIsCrystalActive(true); })
      .catch(() => { /* non-fatal — non-invited creators return 403, no BTS option */ });
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOwnChannels();
      if (res.success) setChannels(res.channels);
      else setError("Failed to load channels.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channels.");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createCreatorChannel({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        accessType: createForm.accessType,
      });
      if (res.success) {
        setShowCreate(false);
        setCreateForm({ name: "", description: "", accessType: "subscription" });
        await load();
      } else {
        setCreateError("Could not create channel. Try again.");
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create channel.");
    }
    setCreating(false);
  };

  const canAddChannel = channels.length < 2;

  return (
    <>
      <Helmet><title>PNP Channels — Creator Studio — PNPtv!</title></Helmet>
      <div className="p-4 lg:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">PNP Channels</h1>
            <p className="text-sm text-pnp-textSecondary mt-1">
              Upload and manage your video content. Each channel has its own library, access type, and audience.
            </p>
          </div>
          {canAddChannel && (
            <button
              onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Channel
            </button>
          )}
        </div>

        {/* Upload explainer banner */}
        <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: "rgba(212,0,122,0.07)", border: "1px solid rgba(212,0,122,0.18)" }}>
          <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-pnp-textSecondary leading-relaxed">
            Tap <strong className="text-white/80">Add video</strong> on any channel to open the upload wizard.
            You'll be able to upload files up to 20 GB, then use <strong className="text-white/80">AI</strong> to generate a title, bilingual description, and hashtags — all in a few clicks.
          </p>
        </div>

        {/* Create channel form */}
        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="rounded-2xl p-5 space-y-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <h3 className="text-sm font-bold text-white">Create a new channel</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-pnp-textSecondary block mb-1">Channel name</label>
                <input id="pnp-creatorchannelshub-1"
                  type="text"
                  required
                  maxLength={80}
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. My Exclusive Collection"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-pnp-textSecondary/50 bg-pnp-surface border border-pnp-border focus:outline-none focus:border-pnp-primary"
                />
              </div>
              <div>
                <label className="text-xs text-pnp-textSecondary block mb-1">Description <span className="opacity-50">(optional)</span></label>
                <textarea id="pnp-creatorchannelshub-2"
                  maxLength={300}
                  rows={2}
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What will you share here?"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-pnp-textSecondary/50 bg-pnp-surface border border-pnp-border focus:outline-none focus:border-pnp-primary resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-pnp-textSecondary block mb-1">Access type</label>
                <select id="pnp-creatorchannelshub-3"
                  value={createForm.accessType}
                  onChange={e => setCreateForm(f => ({ ...f, accessType: e.target.value as typeof f.accessType }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white bg-pnp-surface border border-pnp-border focus:outline-none focus:border-pnp-primary"
                >
                  <option value="free">Free — all registered members</option>
                  <option value="subscription">Subscription — your paid fans</option>
                  <option value="paid">Pay-per-view — one-time purchase</option>
                  {isCrystalActive && (
                    <option value="bts">BTS ◈ — Crystal insiders only</option>
                  )}
                </select>
                {createForm.accessType === "bts" && (
                  <p className="text-[11px] mt-1.5 leading-snug" style={{ color: "#d8b9ff" }}>
                    Behind-the-scenes drop channel — visible only to fans with an active BTS subscription ($50/month).
                  </p>
                )}
              </div>
            </div>
            {createError && <p className="text-xs text-red-400">{createError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-pnp-textSecondary bg-white/8 hover:bg-white/12 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !createForm.name.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                {creating ? "Creating…" : "Create Channel"}
              </button>
            </div>
          </form>
        )}

        {/* Channel list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="rounded-2xl h-40 animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={load} className="mt-3 text-xs text-pnp-primary hover:opacity-80">Try again</button>
          </div>
        ) : channels.length === 0 ? (
          <div
            className="text-center py-12 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)" }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(212,0,122,0.1)" }}>
              <svg className="w-7 h-7" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-white">No channels yet</p>
            <p className="text-xs text-pnp-textSecondary mt-1">Create your first channel to start uploading videos.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              Create your first channel
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {channels.map(ch => (
              <ChannelCard key={ch.id} channel={ch} />
            ))}
            {!canAddChannel && (
              <p className="text-xs text-pnp-textSecondary text-center py-2">
                You've reached the 2-channel limit.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
