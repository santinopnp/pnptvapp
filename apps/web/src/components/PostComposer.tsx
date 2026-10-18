/**
 * PostComposer — shared post creation component for Social, Profile, and Home.
 *
 * Features:
 *  - Native Capacitor camera/photo picker on mobile (web file input fallback)
 *  - HEIC → JPEG conversion + image compression via useMediaUpload
 *  - Video duration pre-check (60s PRIME gate, 10min hard limit)
 *  - Resumable tus uploads with per-file progress via MediaProgressStrip
 *  - Drag-to-reorder thumbnails (framer-motion)
 *  - Long-press per-thumb context sheet (alt text, set cover, remove)
 *  - Alt text per image (250 char, soft nag, never blocking)
 *  - Reply controls dropdown (Everyone / Following / Mentioned)
 *  - Hashtag autocomplete (# detection, caret popover)
 *  - Creator Copy Coach ("Help me write") — active creators only
 *  - Background upload task on native (optional @capacitor/background-task)
 *  - Haptic feedback throughout
 *  - Existing features: categories, exclusive toggle, allow-sharing, mentions,
 *    char limit 5000, hangout scoping, creator template pills, AI write post
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useMediaUpload, type UploadState } from "@/hooks/useMediaUpload";
import { MediaProgressStrip } from "@/components/social/MediaProgressStrip";
import {
  getCreatorEligibilityStatus,
  getOwnChannels,
  getSocialMuxUploadUrl,
  finalizeSocialMuxPost,
  generateCreatorPost,
  type SocialPostItem,
  type CreatorChannel,
  type MentionUser,
} from "@/lib/api";
import { MentionInput } from "@/components/MentionInput";

// ── Types for new api.ts additions (parallel agent) ────────────────────────
// These are declared locally so the compiler is happy if api.ts hasn't been
// updated yet. They will be overridden by the real exports when ready.
type ComposeAssistGoal =
  | "hype_drop"
  | "tease_exclusive"
  | "event_invite"
  | "personal_update"
  | "nsfw_tease"
  | "call_to_tip"
  | "flash_sale"
  | "replies_bait";

interface ComposeAssistVariant {
  label: string;
  full: string;
  hashtags: string[];
}

interface ComposeAssistResponse {
  success: boolean;
  variants?: ComposeAssistVariant[];
  error?: string;
  reason?: string;
}

// Dynamic imports so TypeScript doesn't choke if these don't exist yet
async function callComposeAssist(params: {
  raw_idea: string;
  post_goal: ComposeAssistGoal;
  media_attached: "none" | "image" | "video" | "carousel";
  audience_language: "en" | "es";
  regenerate?: boolean;
}): Promise<ComposeAssistResponse> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = await import("@/lib/api") as any;
    if (typeof api.composeAssist === "function") {
      return api.composeAssist(params);
    }
  } catch { /* noop */ }
  return { success: false, error: "Not available yet" };
}

async function callSuggestHashtags(query: string): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = await import("@/lib/api") as any;
    if (typeof api.suggestHashtags === "function") {
      const res = await api.suggestHashtags(query);
      return Array.isArray(res.tags) ? res.tags : [];
    }
  } catch { /* noop */ }
  return [];
}

// ── Haptics helper ─────────────────────────────────────────────────────────
type HapticStyle = "light" | "medium";
async function haptic(style: HapticStyle = "light"): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch { /* noop on web */ }
}

// ── Constants ─────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "https://pnptv.app";

const POST_CATEGORIES = [
  { value: "fun",       label: "Fun",       color: "#E69138" },
  { value: "wellness",  label: "Wellness",  color: "#34D399" },
  { value: "chemsex",   label: "Chem-Sex",  color: "#D4007A" },
  { value: "slam",      label: "Slam",      color: "#FF3B30" },
  { value: "clouds",    label: "Clouds",    color: "#A78BFA" },
  { value: "non_pnp",   label: "Non-PNP",   color: "#60A5FA" },
  { value: "community", label: "Community", color: "#34C759" },
  { value: "media",     label: "Media",     color: "#8E8E93" },
  { value: "social",    label: "Social",    color: "#636366" },
] as const;

type PostCategory = (typeof POST_CATEGORIES)[number]["value"];
type ReplyControl = "everyone" | "following" | "mentioned";

const MAX_IMAGES = 4;
const MAX_VIDEOS = 4;
const MAX_FILE_SIZE_REGULAR = 512 * 1024 * 1024;        // 512 MB
const MAX_FILE_SIZE_CREATOR = 50 * 1024 * 1024 * 1024;  // 50 GB
const MAX_CHARS = 5000;
const MAX_ALT_TEXT = 250;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

const REPLY_CONTROL_OPTIONS: { value: ReplyControl; label: string }[] = [
  { value: "everyone",  label: "Everyone can reply" },
  { value: "following", label: "People you follow" },
  { value: "mentioned", label: "Only mentioned" },
];

const COPY_COACH_GOALS: { value: ComposeAssistGoal; label: string }[] = [
  { value: "hype_drop",      label: "Hype drop" },
  { value: "tease_exclusive", label: "Tease exclusive" },
  { value: "event_invite",   label: "Event invite" },
  { value: "personal_update", label: "Personal update" },
  { value: "nsfw_tease",     label: "NSFW tease" },
  { value: "call_to_tip",    label: "Call to tip" },
  { value: "flash_sale",     label: "Flash sale" },
  { value: "replies_bait",   label: "Replies bait" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function isValidPhotoUrl(photo: string | null | undefined): photo is string {
  return !!photo && (photo.startsWith("/uploads/") || photo.startsWith("http"));
}
function isImageType(file: File): boolean { return ACCEPTED_IMAGE_TYPES.includes(file.type); }
function isVideoType(file: File): boolean { return ACCEPTED_VIDEO_TYPES.includes(file.type); }
function isNative(): boolean {
  return typeof window !== "undefined" &&
    !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

async function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────

interface AvatarProps { photoUrl?: string; displayName: string; }
function ComposerAvatar({ photoUrl, displayName }: AvatarProps) {
  if (isValidPhotoUrl(photoUrl)) {
    return (
      <img
        src={photoUrl}
        alt={`${displayName}'s avatar`}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        onError={(e) => {
          const img = e.currentTarget;
          img.style.display = "none";
          const sib = img.nextElementSibling as HTMLElement | null;
          if (sib) sib.style.display = "flex";
        }}
      />
    );
  }
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}
      aria-hidden="true"
    >
      {(displayName || "U")[0].toUpperCase()}
    </div>
  );
}

interface ToggleSwitchProps {
  id: string; checked: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; activeColor: string; label: string; icon: React.ReactNode;
}
function ToggleSwitch({ id, checked, onChange, disabled, activeColor, label, icon }: ToggleSwitchProps) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2.5"
      style={{ background: checked ? `${activeColor}0F` : "rgba(255,255,255,0.03)", border: `1px solid ${checked ? `${activeColor}33` : "rgba(255,255,255,0.1)"}` }}
    >
      <label htmlFor={id} className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0">
        <span className="w-4 h-4 flex-shrink-0" style={{ color: checked ? activeColor : "#8E8E93" }}>{icon}</span>
        <span className="text-xs font-medium truncate" style={{ color: checked ? activeColor : "#8E8E93" }}>{label}</span>
      </label>
      <button
        id={id} type="button" role="switch" aria-checked={checked}
        onClick={() => onChange(!checked)} disabled={disabled}
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ml-2"
        style={{ background: checked ? activeColor : "rgba(255,255,255,0.15)" }}
      >
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}

// ── Per-thumb context sheet ────────────────────────────────────────────────
interface ThumbSheetProps {
  fileId: string;
  altText: string;
  isCover: boolean;
  onSetAltText: (id: string, text: string) => void;
  onSetCover: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}
function ThumbContextSheet({ fileId, altText, isCover, onSetAltText, onSetCover, onRemove, onClose }: ThumbSheetProps) {
  const [draft, setDraft] = useState(altText);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl p-4 pb-8 space-y-3"
        style={{ background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.12)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-white">Image options</span>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1" aria-label="Close" style={{ minHeight: 44, minWidth: 44 }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "#8E8E93" }}>Alt text ({draft.length}/{MAX_ALT_TEXT})</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_ALT_TEXT))}
            placeholder="Describe this image for screen readers..."
            rows={3}
            className="w-full rounded-xl px-3 py-2 text-sm text-white resize-none outline-none focus:ring-1"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 14 }}
          />
          <button
            type="button"
            onClick={() => { onSetAltText(fileId, draft); onClose(); }}
            className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "rgba(212,0,122,0.2)", border: "1px solid rgba(212,0,122,0.3)", minHeight: 44 }}
          >
            Save alt text
          </button>
        </div>
        {!isCover && (
          <button
            type="button"
            onClick={() => { onSetCover(fileId); onClose(); }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/80 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", minHeight: 44 }}
          >
            Set as cover
          </button>
        )}
        <button
          type="button"
          onClick={() => { onRemove(fileId); onClose(); }}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.25)", color: "#FF453A", minHeight: 44 }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Hashtag popover ────────────────────────────────────────────────────────
interface HashtagPopoverProps {
  tags: string[];
  onSelect: (tag: string) => void;
  onClose: () => void;
}
function HashtagPopover({ tags, onSelect, onClose }: HashtagPopoverProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, tags.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter")     { e.preventDefault(); if (tags[activeIdx]) onSelect(tags[activeIdx]); }
      if (e.key === "Escape")    { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tags, activeIdx, onSelect, onClose]);

  if (tags.length === 0) return null;
  return (
    <div className="absolute z-40 left-0 mt-1 rounded-xl overflow-hidden shadow-2xl" style={{ background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.12)", minWidth: 180 }}>
      {tags.map((tag, i) => (
        <button
          key={tag}
          type="button"
          onClick={() => { haptic("light"); onSelect(tag); }}
          className="w-full text-left px-4 py-2.5 text-sm transition-colors"
          style={{ background: i === activeIdx ? "rgba(212,0,122,0.15)" : "transparent", color: i === activeIdx ? "#D4007A" : "#fff", minHeight: 44 }}
          onMouseEnter={() => setActiveIdx(i)}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

// ── Copy Coach Modal ───────────────────────────────────────────────────────
interface CopyCoachModalProps {
  rawIdea: string;
  mediaAttached: "none" | "image" | "video" | "carousel";
  userLanguage: "en" | "es";
  onApply: (text: string, hashtags: string[]) => void;
  onClose: () => void;
}
function CopyCoachModal({ rawIdea, mediaAttached, userLanguage, onApply, onClose }: CopyCoachModalProps) {
  const [goal, setGoal] = useState<ComposeAssistGoal>("hype_drop");
  const [lang, setLang] = useState<"en" | "es">(userLanguage);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<ComposeAssistVariant[]>([]);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const generate = useCallback(async (regen = false) => {
    if (regen) setRegenerating(true); else setLoading(true);
    setCoachError(null);
    try {
      const res = await callComposeAssist({
        raw_idea: rawIdea,
        post_goal: goal,
        media_attached: mediaAttached,
        audience_language: lang,
        regenerate: regen,
      });
      if (res.error === "content_blocked") {
        setCoachError(res.reason ?? "Content not allowed");
        setVariants([]);
      } else if (res.success && res.variants) {
        setVariants(res.variants);
      } else {
        setCoachError(res.error ?? "Could not generate — try again");
      }
    } catch {
      setCoachError("Could not generate — try again in a moment");
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [rawIdea, goal, mediaAttached, lang]);

  const started = variants.length > 0 || loading || coachError !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 pb-8 space-y-4 overflow-y-auto"
        style={{ background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.12)", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-white">Help me write ✨</span>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1" style={{ minHeight: 44, minWidth: 44 }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Goal selector */}
        <div>
          <label className="text-xs font-medium mb-2 block" style={{ color: "#8E8E93" }}>What's the goal?</label>
          <div className="grid grid-cols-2 gap-2">
            {COPY_COACH_GOALS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGoal(g.value)}
                className="py-2 px-3 rounded-xl text-xs font-semibold text-left transition-all"
                style={{
                  background: goal === g.value ? "rgba(212,0,122,0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${goal === g.value ? "rgba(212,0,122,0.4)" : "rgba(255,255,255,0.1)"}`,
                  color: goal === g.value ? "#D4007A" : "#8E8E93",
                  minHeight: 44,
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="flex gap-2">
          {(["en", "es"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: lang === l ? "rgba(212,0,122,0.15)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${lang === l ? "rgba(212,0,122,0.3)" : "rgba(255,255,255,0.1)"}`,
                color: lang === l ? "#D4007A" : "#8E8E93",
                minHeight: 44,
              }}
            >
              {l === "en" ? "English" : "Español"}
            </button>
          ))}
        </div>

        {!started && (
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all"
            style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", minHeight: 48 }}
          >
            Generate 3 variants
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6 gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-pink-500 animate-spin" />
            <span className="text-sm" style={{ color: "#8E8E93" }}>Writing your post…</span>
          </div>
        )}

        {coachError && (
          <p className="text-xs text-center py-2" style={{ color: "#FF453A" }}>{coachError}</p>
        )}

        {/* Variants */}
        {variants.map((v, i) => (
          <div
            key={i}
            className="rounded-xl p-4 space-y-2 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={() => { haptic("light"); onApply(v.full, v.hashtags); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") { haptic("light"); onApply(v.full, v.hashtags); } }}
          >
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#D4007A" }}>{v.label}</span>
            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{v.full}</p>
            {v.hashtags.length > 0 && (
              <p className="text-xs" style={{ color: "#8E8E93" }}>{v.hashtags.map((t) => `#${t}`).join(" ")}</p>
            )}
            <div className="text-right">
              <span className="text-[11px] font-semibold" style={{ color: "#D4007A" }}>Tap to use →</span>
            </div>
          </div>
        ))}

        {variants.length > 0 && (
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={regenerating}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/70 hover:text-white transition-all disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", minHeight: 44 }}
          >
            {regenerating ? "Regenerating…" : "Regenerate better (slower)"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export interface PostComposerProps {
  onPostCreated?: (post: SocialPostItem) => void;
  compact?: boolean;
  placeholder?: string;
  className?: string;
  hangoutGroupId?: number;
  initialTaggedPerformers?: MentionUser[];
}

export function PostComposer({
  onPostCreated,
  compact = false,
  placeholder,
  className = "",
  hangoutGroupId,
  initialTaggedPerformers,
}: PostComposerProps) {
  const { user, isAuthenticated } = useAuth();
  const { feed: tFeed, profile: tProfile } = useI18n();
  const navigate = useNavigate();
  const baseId = useId();
  const textareaId = `${baseId}-textarea`;
  const exclusiveId = `${baseId}-exclusive`;
  const dropzoneId = `${baseId}-dropzone`;

  // ── Upload hook ────────────────────────────────────────────────────────
  const { items: uploadItems, addFile, cancelFile, retryFile, clear: clearUploads } = useMediaUpload();
  // ordered list of upload item ids (drives reorder)
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const orderedUploadItems: UploadState[] = orderedIds
    .filter((id) => uploadItems[id])
    .map((id) => uploadItems[id]);

  // Track cover image id and per-image alt texts
  const [coverId, setCoverId] = useState<string | null>(null);
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  const [thumbSheetId, setThumbSheetId] = useState<string | null>(null);
  // Dismissed alt-text nag per session
  const [altNagDismissed, setAltNagDismissed] = useState(false);

  // ── Core state ─────────────────────────────────────────────────────────
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [isActiveCreator, setIsActiveCreator] = useState(false);
  const [canPostExclusive, setCanPostExclusive] = useState(false);
  const [isExclusive, setIsExclusive] = useState(false);
  const [channels, setChannels] = useState<CreatorChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [category, setCategory] = useState<PostCategory | null>(null);
  const [taggedPerformers] = useState<MentionUser[]>(() => initialTaggedPerformers ?? []);
  const [creatorTemplate, setCreatorTemplate] = useState<"promote" | "calls" | "free" | null>(null);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [replyControl, setReplyControl] = useState<ReplyControl>("everyone");
  const [showCopyCoach, setShowCopyCoach] = useState(false);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [hashtagQuery, setHashtagQuery] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounterRef = useRef(0);
  const hashtagDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaContainerRef = useRef<HTMLDivElement>(null);

  // ── Toast helper ───────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  // ── Creator status ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    getCreatorEligibilityStatus().then((e) => {
      setIsActiveCreator(e.creatorStatus === "active");
      setCanPostExclusive(e.canPostExclusive ?? false);
    }).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || user?.creator_status !== "active") return;
    getOwnChannels().then((r) => { if (r.success) setChannels(r.channels); }).catch(() => {});
  }, [isAuthenticated, user?.creator_status]);

  // ── Textarea auto-resize ───────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // ── Hashtag detection ──────────────────────────────────────────────────
  const handleTextChange = useCallback((v: string) => {
    setText(v.slice(0, MAX_CHARS + 50));
    // Detect #word at caret
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = v.slice(0, pos);
    const match = before.match(/#(\w{1,30})$/);
    if (match) {
      const q = match[1];
      setHashtagQuery(q);
      if (hashtagDebounce.current) clearTimeout(hashtagDebounce.current);
      hashtagDebounce.current = setTimeout(async () => {
        const tags = await callSuggestHashtags(q);
        setHashtagSuggestions(tags);
      }, 200);
    } else {
      setHashtagQuery(null);
      setHashtagSuggestions([]);
    }
  }, []);

  const insertHashtag = useCallback((tag: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const newBefore = before.replace(/#\w{0,30}$/, `#${tag} `);
    const newText = newBefore + after;
    setText(newText.slice(0, MAX_CHARS + 50));
    setHashtagQuery(null);
    setHashtagSuggestions([]);
    haptic("light");
    setTimeout(() => { if (ta) { ta.selectionStart = ta.selectionEnd = newBefore.length; ta.focus(); } }, 0);
  }, [text]);

  // ── Native media picker ────────────────────────────────────────────────
  const handleNativeMediaPicker = useCallback(async (mode: "camera" | "library") => {
    try {
      const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
      if (mode === "camera") {
        const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 90 });
        if (photo.path || photo.webPath) {
          const url = photo.webPath ?? photo.path ?? "";
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext = photo.format ?? "jpeg";
          const file = new File([blob], `photo.${ext}`, { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
          const id = addFile(file);
          setOrderedIds((prev) => [...prev, id]);
          haptic("light");
        }
      } else {
        const result = await Camera.pickImages({ limit: MAX_IMAGES });
        for (const photo of result.photos.slice(0, MAX_IMAGES - orderedIds.length)) {
          const url = photo.webPath ?? "";
          if (!url) continue;
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext = photo.format ?? "jpeg";
          const file = new File([blob], `photo.${ext}`, { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
          const id = addFile(file);
          setOrderedIds((prev) => [...prev, id]);
          haptic("light");
        }
      }
    } catch (err) {
      // User cancelled or permission denied — silent
      if (err instanceof Error && !err.message.includes("cancelled") && !err.message.includes("cancel")) {
        setError("Could not access camera/photos. Check app permissions.");
      }
    }
  }, [addFile, orderedIds.length]);

  // ── Video duration check ───────────────────────────────────────────────
  const validateVideoFile = useCallback(async (file: File): Promise<boolean> => {
    const dur = await readVideoDuration(file);
    if (dur > 600) { // 10 min hard limit
      setError("Videos must be under 10 minutes.");
      return false;
    }
    if (!isActiveCreator && dur > 60) {
      showToast("Videos over 60s need PRIME. Upgrade?");
      return false;
    }
    return true;
  }, [isActiveCreator, showToast]);

  // ── Add files (from web input or native) ──────────────────────────────
  const addFilesValidated = useCallback(async (incoming: File[]) => {
    setError(null);
    if (incoming.length === 0) return;

    const hasVideo = incoming.some(isVideoType);
    const hasImage = incoming.some(isImageType);

    if (hasVideo && hasImage) { setError("You can't mix images and videos in a single post."); return; }

    const firstFile = incoming[0];
    if (!isVideoType(firstFile) && !isImageType(firstFile)) {
      setError("Unsupported file type. Use JPEG, PNG, WebP, GIF, HEIC, MP4, WebM, or MOV.");
      return;
    }

    const MAX_FILE_SIZE_BYTES = isActiveCreator ? MAX_FILE_SIZE_CREATOR : MAX_FILE_SIZE_REGULAR;

    if (hasVideo) {
      const available = MAX_VIDEOS - orderedIds.filter((id) => uploadItems[id]?.file && isVideoType(uploadItems[id].file)).length;
      const batch = incoming.filter(isVideoType).slice(0, Math.max(0, available));
      if (batch.length === 0) { setError(`Maximum ${MAX_VIDEOS} videos per post.`); return; }
      for (const f of batch) {
        if (f.size > MAX_FILE_SIZE_BYTES) { setError(isActiveCreator ? `${f.name}: Video too large (max 50 GB)` : tProfile.fileTooLarge); return; }
        const ok = await validateVideoFile(f);
        if (!ok) return;
        const id = addFile(f);
        setOrderedIds((prev) => [...prev, id]);
        haptic("light");
      }
      return;
    }

    // Images
    const available = MAX_IMAGES - orderedIds.filter((id) => uploadItems[id]?.file && isImageType(uploadItems[id].file)).length;
    const batch = incoming.filter(isImageType).slice(0, Math.max(0, available));
    if (batch.length === 0) { setError(`Maximum ${MAX_IMAGES} images per post.`); return; }
    for (const f of batch) {
      if (f.size > MAX_FILE_SIZE_BYTES) { setError(`${f.name}: ${tProfile.fileTooLarge}`); return; }
      const id = addFile(f);
      setOrderedIds((prev) => [...prev, id]);
      haptic("light");
    }
    if (incoming.filter(isImageType).length > available) {
      setError(`Maximum ${MAX_IMAGES} images per post. Some files were skipped.`);
    }
  }, [addFile, isActiveCreator, orderedIds, uploadItems, tProfile.fileTooLarge, validateVideoFile]);

  const handleImageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFilesValidated(Array.from(e.target.files));
    e.target.value = "";
  }, [addFilesValidated]);

  const handleVideoInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFilesValidated(Array.from(e.target.files));
    e.target.value = "";
  }, [addFilesValidated]);

  // ── Remove file ────────────────────────────────────────────────────────
  const removeFileById = useCallback((id: string) => {
    cancelFile(id);
    setOrderedIds((prev) => prev.filter((i) => i !== id));
    setAltTexts((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (coverId === id) setCoverId(null);
  }, [cancelFile, coverId]);

  // ── Drag-and-drop ──────────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current += 1; if (dragCounterRef.current === 1) setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current -= 1; if (dragCounterRef.current === 0) setIsDragging(false); }, []);
  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dragCounterRef.current = 0; setIsDragging(false);
    if (e.dataTransfer.files) addFilesValidated(Array.from(e.dataTransfer.files));
  }, [addFilesValidated]);

  // ── Clear form ─────────────────────────────────────────────────────────
  const clearForm = useCallback(() => {
    setText("");
    clearUploads();
    setOrderedIds([]);
    setAltTexts({});
    setCoverId(null);
    setError(null);
    setIsExclusive(false);
    setSelectedChannelId(null);
    setCategory(null);
    setCreatorTemplate(null);
    setShowAiInput(false);
    setAiPrompt("");
    setAiError(null);
    setReplyControl("everyone");
    setHashtagQuery(null);
    setHashtagSuggestions([]);
    if (compact) setIsExpanded(false);
  }, [compact, clearUploads]);

  // ── Legacy AI writer (existing feature) ───────────────────────────────
  const handleGeneratePost = useCallback(async () => {
    const promptText = aiPrompt.trim();
    if (!promptText || isGeneratingAi || !creatorTemplate || creatorTemplate === "free") return;
    setIsGeneratingAi(true); setAiError(null);
    try {
      const res = await generateCreatorPost(creatorTemplate, promptText);
      if (res.success && res.post) { setText(res.post); setAiPrompt(""); setShowAiInput(false); }
      else setAiError("Could not generate post");
    } catch { setAiError("Could not generate post — please try again in a moment"); }
    finally { setIsGeneratingAi(false); }
  }, [aiPrompt, isGeneratingAi, creatorTemplate]);

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    const hasMedia = orderedIds.length > 0;
    if ((!trimmed && !hasMedia) || isPosting) return;

    // Wait until all uploads done
    const stillUploading = orderedIds.some((id) => {
      const s = uploadItems[id]?.status;
      return s === "uploading" || s === "queued";
    });
    if (stillUploading) { showToast("Media is still uploading, please wait…"); return; }

    const failedIds = orderedIds.filter((id) => uploadItems[id]?.status === "error");
    if (failedIds.length > 0) { setError("Some files failed to upload. Retry or remove them before posting."); return; }

    setIsPosting(true); setError(null);

    try {
      const mediaUrls = orderedIds.map((id) => uploadItems[id]?.url ?? "").filter(Boolean);
      const mediaAltTexts = orderedIds.map((id) => altTexts[id] ?? "");
      const coverUrl = coverId ? (uploadItems[coverId]?.url ?? null) : null;

      let result: { success: boolean; post: SocialPostItem };

      if (mediaUrls.length > 0) {
        // Post with pre-uploaded media URLs
        const firstFile = uploadItems[orderedIds[0]]?.file;
        const isCreatorVideo = isActiveCreator && firstFile && isVideoType(firstFile);

        if (isCreatorVideo && mediaUrls.length === 1) {
          // Creator video: use Mux path — re-upload via Mux since tus gave us a local URL
          const muxUploadUrl = await getSocialMuxUploadUrl();
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", () => {});
            xhr.addEventListener("load", () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`Mux upload failed (${xhr.status})`)); });
            xhr.addEventListener("error", () => reject(new Error("Network error")));
            xhr.addEventListener("abort", () => reject(new Error("Cancelled")));
            xhr.open("PUT", muxUploadUrl.uploadUrl);
            xhr.setRequestHeader("Content-Type", firstFile.type || "video/mp4");
            xhr.send(firstFile);
          });
          result = await finalizeSocialMuxPost({
            uploadId: muxUploadUrl.uploadId,
            content: trimmed,
            isExclusive,
            isShareable: true,
            isAiGenerated: false,
            hangoutGroupId: hangoutGroupId ?? null,
            category: category ?? null,
            channelId: selectedChannelId ?? null,
            taggedPerformerIds: taggedPerformers.length ? taggedPerformers.map((p) => p.id) : null,
          });
        } else {
          // Image(s) or regular video — use multi-media endpoint with tus URLs
          const body: Record<string, unknown> = {
            content: trimmed,
            mediaUrls,
            mediaAltTexts,
            isExclusive,
            replyControl,
            ...(coverUrl ? { coverUrl } : {}),
            ...(selectedChannelId !== null ? { channelId: selectedChannelId } : {}),
            ...(hangoutGroupId ? { hangoutGroupId } : {}),
            ...(category ? { category } : {}),
            ...(taggedPerformers.length ? { taggedPerformerIds: taggedPerformers.map((p) => p.id) } : {}),
          };
          const res = await fetch(`${API_BASE}/api/webapp/social/posts/with-tus-media`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `Post failed (${res.status})`);
          }
          result = await res.json();
        }
      } else {
        // Text-only post
        const res = await fetch(`${API_BASE}/api/webapp/social/posts`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            isExclusive,
            replyControl,
            ...(selectedChannelId !== null ? { channelId: selectedChannelId } : {}),
            ...(hangoutGroupId ? { hangoutGroupId } : {}),
            ...(category ? { category } : {}),
            ...(taggedPerformers.length ? { taggedPerformerIds: taggedPerformers.map((p) => p.id) } : {}),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `Post failed (${res.status})`);
        }
        result = await res.json();
      }

      if (result.success && result.post) {
        haptic("medium");
        onPostCreated?.(result.post);
        clearForm();
      } else {
        throw new Error("Post creation failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setIsPosting(false);
    }
  }, [
    text, orderedIds, uploadItems, isPosting, isExclusive, selectedChannelId,
    hangoutGroupId, category, taggedPerformers, isActiveCreator, onPostCreated,
    clearForm, altTexts, coverId, replyControl, showToast,
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  // ── Derived ────────────────────────────────────────────────────────────
  const hasMedia = orderedIds.length > 0;
  const hasVideo = orderedIds.some((id) => uploadItems[id]?.file && isVideoType(uploadItems[id].file));
  const imageCount = orderedIds.filter((id) => uploadItems[id]?.file && isImageType(uploadItems[id].file)).length;
  const videoCount = orderedIds.filter((id) => uploadItems[id]?.file && isVideoType(uploadItems[id].file)).length;
  const canAddMoreImages = !hasVideo && imageCount < MAX_IMAGES;
  const canAddMoreVideos = !orderedIds.some((id) => uploadItems[id]?.file && isImageType(uploadItems[id].file)) && videoCount < MAX_VIDEOS;
  const isOverCharLimit = text.length > MAX_CHARS;
  const isUploading = orderedIds.some((id) => uploadItems[id]?.status === "uploading" || uploadItems[id]?.status === "queued");
  const canPost = (text.trim().length > 0 || hasMedia) && !isPosting && !isOverCharLimit && !isUploading;
  const resolvedPlaceholder = placeholder ?? tFeed.whatOnYourMind;
  const displayName = user?.displayName || user?.username || "U";
  const mediaAttachedType: "none" | "image" | "video" | "carousel" =
    imageCount > 1 ? "carousel" : imageCount === 1 ? "image" : videoCount > 0 ? "video" : "none";
  const imagesWithoutAlt = orderedIds.filter((id) => uploadItems[id]?.file && isImageType(uploadItems[id].file) && !altTexts[id]);
  const showAltNag = !altNagDismissed && imagesWithoutAlt.length > 0 && orderedIds.some((id) => uploadItems[id]?.status === "done");

  // ── Compact collapsed ──────────────────────────────────────────────────
  if (compact && !isExpanded) {
    return (
      <div
        className={`glass-card-sm p-4 cursor-pointer hover:border-white/20 transition-colors ${className}`}
        onClick={() => { setIsExpanded(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
        role="button" tabIndex={0} aria-label="Create a post"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsExpanded(true); setTimeout(() => textareaRef.current?.focus(), 50); } }}
      >
        <div className="flex gap-3 items-center">
          <button onClick={(e) => { e.stopPropagation(); navigate("/profile"); }} className="flex-shrink-0">
            <ComposerAvatar photoUrl={user?.photoUrl} displayName={displayName} />
          </button>
          <div className="flex-1 min-w-0 text-white/40 text-sm">{resolvedPlaceholder}</div>
        </div>
      </div>
    );
  }

  // ── Full composer ──────────────────────────────────────────────────────
  const TEMPLATE_PLACEHOLDERS: Record<"promote" | "calls" | "free", string> = {
    promote: "Drop a hook that stops the scroll, build it out, then tell them what to do...",
    calls: "Set the vibe — what kind of energy are you bringing to the call?",
    free: resolvedPlaceholder,
  };
  const AI_PROMPT_PLACEHOLDERS: Record<"promote" | "calls", string> = {
    promote: "e.g. new exclusive video with Lex, wild pool session...",
    calls: "e.g. feeling spicy tonight, open for 1-on-1 video calls...",
  };
  const activePlaceholder = isActiveCreator && creatorTemplate && creatorTemplate !== "free"
    ? TEMPLATE_PLACEHOLDERS[creatorTemplate]
    : resolvedPlaceholder;

  const activeReplyLabel = REPLY_CONTROL_OPTIONS.find((o) => o.value === replyControl)?.label ?? "Everyone can reply";

  return (
    <>
      {/* Toast */}
      {toastMsg && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-xl pointer-events-none"
          style={{ background: "rgba(28,28,30,0.95)", border: "1px solid rgba(255,255,255,0.15)" }}
          role="alert"
        >
          {toastMsg}
        </div>
      )}

      {/* Thumb context sheet */}
      {thumbSheetId && (
        <ThumbContextSheet
          fileId={thumbSheetId}
          altText={altTexts[thumbSheetId] ?? ""}
          isCover={coverId === thumbSheetId}
          onSetAltText={(id, t) => setAltTexts((prev) => ({ ...prev, [id]: t }))}
          onSetCover={(id) => setCoverId(id)}
          onRemove={removeFileById}
          onClose={() => setThumbSheetId(null)}
        />
      )}

      {/* Copy Coach Modal */}
      {showCopyCoach && (
        <CopyCoachModal
          rawIdea={text}
          mediaAttached={mediaAttachedType}
          userLanguage={(user as unknown as { language?: string })?.language === "es" ? "es" : "en"}
          onApply={(full, hashtags) => {
            setText((full + (hashtags.length ? " " + hashtags.map((t) => `#${t}`).join(" ") : "")).slice(0, MAX_CHARS + 50));
            haptic("light");
            setShowCopyCoach(false);
          }}
          onClose={() => setShowCopyCoach(false)}
        />
      )}

      <div
        className={`glass-card-sm p-4 transition-all ${className}`}
        onDragEnter={compact ? undefined : handleDragEnter}
        onDragLeave={compact ? undefined : handleDragLeave}
        onDragOver={compact ? undefined : handleDragOver}
        onDrop={compact ? undefined : handleDrop}
        style={isDragging ? { borderColor: "rgba(212,0,122,0.6)", background: "rgba(212,0,122,0.04)" } : undefined}
        id={dropzoneId}
        aria-label={isDragging ? "Drop files here" : undefined}
      >
        {isDragging && (
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none z-10" style={{ border: "2px dashed rgba(212,0,122,0.6)", background: "rgba(212,0,122,0.06)" }} aria-hidden="true">
            <p className="text-sm font-semibold" style={{ color: "#D4007A" }}>Drop to attach</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => navigate("/profile")} className="flex-shrink-0">
            <ComposerAvatar photoUrl={user?.photoUrl} displayName={displayName} />
          </button>

          <div className="flex-1 min-w-0">
            {/* Hidden web file inputs (fallback) */}
            <input id="pnp-postcomposer-1" ref={imageInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} multiple className="hidden" onChange={handleImageInputChange} aria-hidden="true" tabIndex={-1} />
            <input id="pnp-postcomposer-2" ref={videoInputRef} type="file" accept={ACCEPTED_VIDEO_TYPES.join(",")} multiple className="hidden" onChange={handleVideoInputChange} aria-hidden="true" tabIndex={-1} />

            {/* Creator template pills */}
            {isActiveCreator && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {(["promote", "calls", "free"] as const).map((t) => {
                  const labels = { promote: "📣 Promote", calls: "📞 Available", free: "✍️ Free post" };
                  const active = creatorTemplate === t;
                  return (
                    <button key={t} type="button"
                      onClick={() => { setCreatorTemplate(active ? null : t); setShowAiInput(false); setAiPrompt(""); setAiError(null); }}
                      disabled={isPosting}
                      className="px-3 py-1 rounded-full text-xs font-semibold border transition-all disabled:opacity-40"
                      style={{ background: active ? "rgba(212,0,122,0.15)" : "transparent", borderColor: active ? "rgba(212,0,122,0.5)" : "rgba(255,255,255,0.12)", color: active ? "#D4007A" : "#8E8E93" }}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Textarea + hashtag popover */}
            <div className="relative" ref={textareaContainerRef}>
              <label htmlFor={textareaId} className="sr-only">{activePlaceholder}</label>
              <MentionInput
                id={textareaId}
                textareaRef={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={activePlaceholder}
                rows={compact ? 2 : 3}
                disabled={isPosting}
                maxLength={MAX_CHARS + 50}
                className="w-full bg-transparent text-white py-2 border-b border-white/10 mb-2 resize-none outline-none placeholder:text-white/40 disabled:opacity-60 overflow-hidden"
                style={{ minHeight: "44px", fontSize: "16px" }}
                aria-describedby={error ? `${baseId}-error` : undefined}
              />
              {hashtagQuery !== null && hashtagSuggestions.length > 0 && (
                <HashtagPopover tags={hashtagSuggestions} onSelect={insertHashtag} onClose={() => { setHashtagQuery(null); setHashtagSuggestions([]); }} />
              )}
            </div>

            {/* Char counter + reply controls + copy coach */}
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2">
                {/* Reply control dropdown */}
                <div className="relative">
                  <select
                    value={replyControl}
                    onChange={(e) => setReplyControl(e.target.value as ReplyControl)}
                    disabled={isPosting}
                    className="appearance-none bg-transparent text-xs pr-4 outline-none cursor-pointer disabled:opacity-40"
                    style={{ color: "#8E8E93", minHeight: 28 }}
                    aria-label="Who can reply"
                  >
                    {REPLY_CONTROL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} style={{ background: "#1C1C1E", color: "#fff" }}>{o.label}</option>
                    ))}
                  </select>
                  <svg className="w-3 h-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#8E8E93" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                {/* Copy Coach */}
                {isActiveCreator && (
                  <button
                    type="button"
                    onClick={() => { haptic("light"); setShowCopyCoach(true); }}
                    disabled={isPosting}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.15), rgba(230,145,56,0.1))", border: "1px solid rgba(212,0,122,0.25)", color: "#D4007A", minHeight: 28 }}
                    aria-label="Help me write"
                  >
                    ✨ Write
                  </button>
                )}
              </div>
              <span className="text-xs tabular-nums" style={{ color: isOverCharLimit ? "#FF453A" : "#8E8E93" }} aria-live="polite" aria-atomic="true">
                {text.length}/{MAX_CHARS}
              </span>
            </div>

            {/* Legacy AI writer (existing) */}
            {isActiveCreator && creatorTemplate && creatorTemplate !== "free" && (
              <div className="mb-3">
                {!showAiInput ? (
                  <button type="button" onClick={() => setShowAiInput(true)} disabled={isPosting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.25), rgba(230,145,56,0.2))", border: "1px solid rgba(212,0,122,0.3)" }}>
                    ✨ Write post for me
                  </button>
                ) : (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(212,0,122,0.06)", border: "1px solid rgba(212,0,122,0.2)" }}>
                    <div className="flex gap-2">
                      <input
                        id="pnp-postcomposer-ai"
                        type="text" value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleGeneratePost(); } if (e.key === "Escape") { setShowAiInput(false); setAiPrompt(""); } }}
                        placeholder={AI_PROMPT_PLACEHOLDERS[creatorTemplate as "promote" | "calls"]}
                        autoFocus disabled={isGeneratingAi}
                        className="flex-1 bg-black/40 text-white text-xs rounded-lg px-3 py-2 border border-white/15 outline-none placeholder:text-white/30 disabled:opacity-60"
                        style={{ fontSize: "14px" }}
                      />
                      <button type="button" onClick={handleGeneratePost} disabled={isGeneratingAi || !aiPrompt.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white btn-gradient disabled:opacity-40 transition-all whitespace-nowrap">
                        {isGeneratingAi ? "Writing…" : "✨ Write"}
                      </button>
                      <button type="button" onClick={() => { setShowAiInput(false); setAiPrompt(""); setAiError(null); }}
                        className="px-2 py-1.5 rounded-lg text-xs text-white/40 hover:text-white transition-colors">✕</button>
                    </div>
                    {aiError && <p className="text-[11px]" style={{ color: "#FF453A" }}>{aiError}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Media progress strip (tus uploads + reorder) */}
            {orderedUploadItems.length > 0 && (
              <div>
                <MediaProgressStrip
                  items={orderedUploadItems}
                  onCancel={removeFileById}
                  onRetry={(id) => { retryFile(id); }}
                  onReorder={(newOrder) => {
                    haptic("light");
                    setOrderedIds(newOrder.map((i) => i.id));
                  }}
                />
                {/* Long-press trigger: small label row below strip */}
                <div className="flex gap-2 mb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {orderedUploadItems.filter((i) => i.file && isImageType(i.file)).map((item) => {
                    const hasAlt = !!altTexts[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { haptic("light"); setThumbSheetId(item.id); }}
                        className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full transition-all"
                        style={{
                          background: hasAlt ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)",
                          border: `1px solid ${hasAlt ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}`,
                          color: hasAlt ? "#34D399" : "#8E8E93",
                          minHeight: 24,
                          width: 80,
                        }}
                        aria-label={hasAlt ? "Edit alt text" : "Add alt text"}
                      >
                        {hasAlt ? "Alt ✓" : "Add alt"}
                      </button>
                    );
                  })}
                </div>
                {/* Alt nag — dismissible */}
                {showAltNag && (
                  <div className="flex items-center justify-between mb-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="text-[11px]" style={{ color: "#8E8E93" }}>Add alt text for better accessibility</span>
                    <button type="button" onClick={() => setAltNagDismissed(true)} className="text-[11px] ml-2" style={{ color: "#8E8E93", minHeight: 24 }} aria-label="Dismiss">✕</button>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <p id={`${baseId}-error`} className="text-xs mb-2" style={{ color: "#FF453A" }} role="alert" aria-live="assertive">{error}</p>
            )}

            {/* Action row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {/* Photo button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (isNative()) {
                        // Show native action sheet options
                        if (confirm("Take a photo or choose from library?\n\n[OK] = Camera   [Cancel] = Library")) {
                          handleNativeMediaPicker("camera");
                        } else {
                          handleNativeMediaPicker("library");
                        }
                      } else {
                        imageInputRef.current?.click();
                      }
                    }}
                    disabled={isPosting || !canAddMoreImages}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 hover:border-white/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ color: "#D4007A", minHeight: 44 }}
                    aria-label={`Attach photo${imageCount > 0 ? ` (${imageCount}/${MAX_IMAGES})` : ""}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                    <span className="hidden sm:inline">{tFeed.photo}</span>
                    {imageCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "#D4007A" }} aria-hidden="true">{imageCount}</span>
                    )}
                  </button>
                </div>
                {/* Video button */}
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={isPosting || !canAddMoreVideos}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 hover:border-white/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "#E69138", minHeight: 44 }}
                  aria-label={`Attach video${videoCount > 0 ? ` (${videoCount}/${MAX_VIDEOS})` : ""}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  <span className="hidden sm:inline">{tFeed.video}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canPost}
                className="btn-gradient px-5 py-1.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                style={{ minHeight: 44 }}
              >
                {isPosting ? tFeed.posting : isUploading ? "Uploading…" : tFeed.post}
              </button>
            </div>

            {/* Creator-only options */}
            {isActiveCreator && (
              <>
                <div className="mt-3">
                  <ToggleSwitch
                    id={exclusiveId}
                    checked={isExclusive}
                    onChange={canPostExclusive ? setIsExclusive : () => {}}
                    disabled={isPosting || !canPostExclusive}
                    activeColor="#D4007A"
                    label={tFeed.exclusiveToggle}
                    icon={
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    }
                  />
                  {!canPostExclusive && <p className="mt-1 text-[11px]" style={{ color: "#8E8E93" }}>Reach 10 followers to unlock exclusive posts</p>}
                </div>

                {channels.length > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: selectedChannelId !== null ? "rgba(212,0,122,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${selectedChannelId !== null ? "rgba(212,0,122,0.2)" : "rgba(255,255,255,0.1)"}` }}>
                    <label htmlFor={`${baseId}-channel`} className="flex items-center gap-2 flex-shrink-0">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 flex-shrink-0" style={{ color: selectedChannelId !== null ? "#D4007A" : "#8E8E93" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 8.25h16.5" />
                      </svg>
                      <span className="text-xs font-medium" style={{ color: selectedChannelId !== null ? "#D4007A" : "#8E8E93" }}>Channel</span>
                    </label>
                    <select id={`${baseId}-channel`} value={selectedChannelId ?? ""} onChange={(e) => setSelectedChannelId(e.target.value === "" ? null : Number(e.target.value))} disabled={isPosting} className="ml-3 flex-1 min-w-0 bg-transparent text-xs outline-none text-right disabled:opacity-40 cursor-pointer" style={{ color: selectedChannelId !== null ? "#D4007A" : "#8E8E93" }}>
                      <option value="">No channel</option>
                      {channels.map((ch) => (
                        <option key={ch.id} value={ch.id} style={{ background: "var(--pnp-surface, #1C1C1E)", color: "#fff" }}>{ch.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {user?.username && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "#8E8E93" }}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{tFeed.creatorWallHint}</span>
                    <a href={`/c/@${user.username}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline hover:text-white transition-colors" style={{ color: "#D4007A" }}>
                      /c/@{user.username}
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
