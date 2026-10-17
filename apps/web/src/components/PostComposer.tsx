/**
 * PostComposer — shared post creation component for Social, Profile, and Home.
 *
 * Features:
 *  - Multi-file selection: up to 4 images OR 1 video
 *  - Drag-and-drop zone (disabled in compact mode)
 *  - Media preview grid with per-file remove buttons
 *  - XHR upload with progress bar
 *  - Client-side file validation (type, size, count)
 *  - Auto-resizing textarea with character counter
 *  - Exclusive content and allow-sharing toggles (active creators only)
 *  - Compact mode: renders a minimal prompt that expands on focus
 *  - Full bilingual support via useI18n()
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
import { getCreatorEligibilityStatus, getOwnChannels, getSocialMuxUploadUrl, finalizeSocialMuxPost, generateCreatorPost, type SocialPostItem, type CreatorChannel, type MentionUser } from "@/lib/api";
import { MentionInput } from "@/components/MentionInput";

// ── Constants ─────────────────────────────────────────────────────────────────

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
const MAX_IMAGES = 4;
const MAX_VIDEOS = 4;
const MAX_FILE_SIZE_REGULAR = 512 * 1024 * 1024;    // 512 MB
const MAX_FILE_SIZE_CREATOR = 50 * 1024 * 1024 * 1024; // 50 GB (Mux direct upload)
const MAX_CHARS = 5000;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidPhotoUrl(photo: string | null | undefined): photo is string {
  return !!photo && (photo.startsWith("/uploads/") || photo.startsWith("http"));
}

function isImageType(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

function isVideoType(file: File): boolean {
  return ACCEPTED_VIDEO_TYPES.includes(file.type);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectedFile {
  /** Stable identity key */
  id: string;
  file: File;
  /** Object URL — revoked on removal / unmount */
  previewUrl: string;
}

export interface PostComposerProps {
  /** Called with the new post after a successful submission. */
  onPostCreated?: (post: SocialPostItem) => void;
  /**
   * Compact mode renders a minimal prompt that expands into the full composer
   * when the user clicks or focuses the text area. Drag-and-drop is disabled.
   */
  compact?: boolean;
  placeholder?: string;
  className?: string;
  /** When set, posts are scoped to this hangout group's feed */
  hangoutGroupId?: number;
  /** Pre-tag these performers when the composer first opens */
  initialTaggedPerformers?: MentionUser[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AvatarProps {
  photoUrl?: string;
  displayName: string;
}

function ComposerAvatar({ photoUrl, displayName }: AvatarProps) {
  if (isValidPhotoUrl(photoUrl)) {
    return (
      <img
        src={photoUrl}
        alt={`${displayName}'s avatar`}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        onError={(e) => {
          // Swap to initial-letter fallback on broken URLs
          const img = e.currentTarget;
          img.style.display = "none";
          const sibling = img.nextElementSibling as HTMLElement | null;
          if (sibling) sibling.style.display = "flex";
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
  id: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  activeColor: string;
  label: string;
  icon: React.ReactNode;
}

function ToggleSwitch({ id, checked, onChange, disabled, activeColor, label, icon }: ToggleSwitchProps) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2.5"
      style={{
        background: checked ? `${activeColor}0F` : "rgba(255,255,255,0.03)",
        border: `1px solid ${checked ? `${activeColor}33` : "rgba(255,255,255,0.1)"}`,
      }}
    >
      <label
        htmlFor={id}
        className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0"
      >
        <span className="w-4 h-4 flex-shrink-0" style={{ color: checked ? activeColor : "#8E8E93" }}>
          {icon}
        </span>
        <span className="text-xs font-medium truncate" style={{ color: checked ? activeColor : "#8E8E93" }}>
          {label}
        </span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ml-2"
        style={{ background: checked ? activeColor : "rgba(255,255,255,0.15)" }}
      >
        <span
          className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}

interface MediaPreviewGridProps {
  files: SelectedFile[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

function MediaPreviewGrid({ files, onRemove, disabled }: MediaPreviewGridProps) {
  if (files.length === 0) return null;

  const gridClass =
    files.length === 1
      ? "grid grid-cols-1"
      : "grid grid-cols-2";

  return (
    <div className={`${gridClass} gap-1.5 mb-3 rounded-xl overflow-hidden`}>
      {files.map((f, index) => {
        const isVideo = isVideoType(f.file);
        // For 3-file layouts the last cell is alone in its row — give it col-span-2
        const isLastOdd = files.length === 3 && index === 2;

        return (
          <div
            key={f.id}
            className={`relative bg-black/40 overflow-hidden${isLastOdd ? " col-span-2" : ""}`}
            style={{ aspectRatio: files.length === 1 ? "16/9" : "1/1" }}
          >
            {isVideo ? (
              <video
                src={f.previewUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <img
                src={f.previewUrl}
                alt={`Preview ${index + 1}`}
                className="w-full h-full object-cover"
              />
            )}

            {/* Video play overlay */}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            )}

            {/* Remove button */}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(f.id)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-white transition-opacity hover:opacity-90 active:scale-90 focus-visible:ring-2 focus-visible:ring-white"
                style={{ background: "rgba(0,0,0,0.65)" }}
                aria-label={`Remove ${isVideo ? "video" : "image"} ${index + 1}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

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

  // ── Unique IDs for ARIA ────────────────────────────────────────────────────
  const baseId = useId();
  const textareaId = `${baseId}-textarea`;
  const exclusiveId = `${baseId}-exclusive`;
  const dropzoneId = `${baseId}-dropzone`;

  // ── State ──────────────────────────────────────────────────────────────────
  const [text, setText] = useState("");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
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

  const handleGeneratePost = useCallback(async () => {
    const promptText = aiPrompt.trim();
    if (!promptText || isGeneratingAi || !creatorTemplate || creatorTemplate === "free") return;
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const res = await generateCreatorPost(creatorTemplate, promptText);
      if (res.success && res.post) {
        setText(res.post);
        setAiPrompt("");
        setShowAiInput(false);
      } else {
        setAiError("Could not generate post");
      }
    } catch {
      setAiError("Could not generate post — please try again in a moment");
    } finally {
      setIsGeneratingAi(false);
    }
  }, [aiPrompt, isGeneratingAi, creatorTemplate]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounterRef = useRef(0); // tracks nested drag-enter/leave pairs

  // ── Creator status check ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    getCreatorEligibilityStatus()
      .then((eligibility) => {
        // Show the exclusive toggle for all active creators (Ice tier sees it disabled)
        const isCreatorActive = eligibility.creatorStatus === 'active';
        setIsActiveCreator(isCreatorActive);
        setCanPostExclusive(eligibility.canPostExclusive ?? false);
      })
      .catch(() => {
        // Non-critical — exclusive toggle stays hidden
      });
  }, [isAuthenticated]);

  // ── Fetch own channels for active creators ─────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || user?.creator_status !== "active") return;
    getOwnChannels()
      .then((res) => {
        if (res.success) setChannels(res.channels);
      })
      .catch(() => {
        // Non-critical — channel dropdown simply won't appear
      });
  }, [isAuthenticated, user?.creator_status]);

  // ── Textarea auto-resize ───────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // ── Cleanup object URLs on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // We only want this to run on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File validation ────────────────────────────────────────────────────────
  const validateAndAddFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      const MAX_FILE_SIZE_BYTES = isActiveCreator ? MAX_FILE_SIZE_CREATOR : MAX_FILE_SIZE_REGULAR;

      if (incoming.length === 0) return;

      const firstFile = incoming[0];
      const firstIsVideo = isVideoType(firstFile);
      const firstIsImage = isImageType(firstFile);

      if (!firstIsVideo && !firstIsImage) {
        setError("Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, WebM, or MOV.");
        return;
      }

      // If any file in the new batch is a video, treat the whole batch as video
      const hasVideo = incoming.some((f) => isVideoType(f));
      const hasImage = incoming.some((f) => isImageType(f));

      if (hasVideo && hasImage) {
        setError("You can't mix images and videos in a single post.");
        return;
      }

      if (hasVideo) {
        // Up to MAX_VIDEOS per post — no mixing with images
        const currentVideoCount = files.filter((f) => isVideoType(f.file)).length;
        const currentHasImage = files.some((f) => isImageType(f.file));
        if (currentHasImage) {
          // Replacing images with videos — clear existing
          files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
          setFiles([]);
        }
        const availableVideoSlots = MAX_VIDEOS - (currentHasImage ? 0 : currentVideoCount);
        const videoBatch = incoming.filter((f) => isVideoType(f)).slice(0, availableVideoSlots);
        const skippedVideos = incoming.filter((f) => isVideoType(f)).length - videoBatch.length;

        const oversizedVideo = videoBatch.find((v) => v.size > MAX_FILE_SIZE_BYTES);
        if (oversizedVideo) {
          setError(isActiveCreator ? `${oversizedVideo.name}: Video too large (max 50 GB)` : tProfile.fileTooLarge);
          return;
        }

        if (skippedVideos > 0) {
          setError(`Maximum ${MAX_VIDEOS} videos per post. ${skippedVideos} file(s) were skipped.`);
        }

        const newVideoEntries: SelectedFile[] = videoBatch.map((f) => ({
          id: `${f.name}-${Date.now()}-${Math.random()}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
        }));

        setFiles((prev) => (currentHasImage ? newVideoEntries : [...prev, ...newVideoEntries]));
        return;
      }

      // Images path
      const currentImageCount = files.filter((f) => isImageType(f.file)).length;
      const currentHasVideo = files.some((f) => isVideoType(f.file));

      if (currentHasVideo) {
        // Replacing video with images — clear existing
        files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        setFiles([]);
      }

      const availableSlots = MAX_IMAGES - (currentHasVideo ? 0 : currentImageCount);
      const toAdd = incoming.filter((f) => isImageType(f)).slice(0, availableSlots);
      const skippedCount = incoming.filter((f) => isImageType(f)).length - toAdd.length;

      const oversized = toAdd.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
      if (oversized.length > 0) {
        setError(`${oversized[0].name}: ${tProfile.fileTooLarge}`);
        return;
      }

      if (skippedCount > 0) {
        setError(`Maximum ${MAX_IMAGES} images per post. ${skippedCount} file(s) were skipped.`);
      }

      const newEntries: SelectedFile[] = toAdd.map((f) => ({
        id: `${f.name}-${Date.now()}-${Math.random()}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
      }));

      setFiles((prev) => (currentHasVideo ? newEntries : [...prev, ...newEntries]));
    },
    [files, isActiveCreator, tProfile.fileTooLarge]
  );

  // ── Remove file ────────────────────────────────────────────────────────────
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // ── File input handlers ────────────────────────────────────────────────────
  const handleImageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) validateAndAddFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [validateAndAddFiles]
  );

  const handleVideoInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) validateAndAddFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [validateAndAddFiles]
  );

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files) {
        validateAndAddFiles(Array.from(e.dataTransfer.files));
      }
    },
    [validateAndAddFiles]
  );

  // ── Clear form ─────────────────────────────────────────────────────────────
  const clearForm = useCallback(() => {
    setText("");
    setFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      return [];
    });
    setError(null);
    setUploadProgress(null);
    setIsExclusive(false);
    setSelectedChannelId(null);
    setCategory(null);
    setCreatorTemplate(null);
    setShowAiInput(false);
    setAiPrompt("");
    setAiError(null);
    if (compact) setIsExpanded(false);
  }, [compact]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if ((!trimmed && files.length === 0) || isPosting) return;

    setIsPosting(true);
    setError(null);
    setUploadProgress(null);

    try {
      let result: { success: boolean; post: SocialPostItem };

      if (files.length > 1) {
        // Multi-image: use XHR so we can track progress
        result = await new Promise<{ success: boolean; post: SocialPostItem }>(
          (resolve, reject) => {
            const formData = new FormData();
            formData.append("content", trimmed);
            files.forEach((f) => formData.append("media", f.file));
            if (isExclusive) formData.append("isExclusive", "true");
            if (selectedChannelId !== null) formData.append("channelId", String(selectedChannelId));
            if (hangoutGroupId) formData.append("hangoutGroupId", String(hangoutGroupId));
            if (category) formData.append("category", category);
            if (taggedPerformers.length) formData.append("taggedPerformerIds", JSON.stringify(taggedPerformers.map((p) => p.id)));

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${API_BASE}/api/webapp/social/posts/with-multi-media`);
            xhr.withCredentials = true;

            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                setUploadProgress(Math.round((e.loaded / e.total) * 100));
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  resolve(JSON.parse(xhr.responseText));
                } catch {
                  reject(new Error("Invalid server response"));
                }
              } else {
                try {
                  const err = JSON.parse(xhr.responseText);
                  reject(new Error(err.error || `Upload failed (${xhr.status})`));
                } catch {
                  reject(new Error(`Upload failed (${xhr.status})`));
                }
              }
            });

            xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
            xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
            xhr.send(formData);
          }
        );
      } else if (files.length === 1) {
        const singleFile = files[0].file;
        const isCreatorVideo = isActiveCreator && isVideoType(singleFile);

        if (isCreatorVideo) {
          // Creator video → direct browser→Mux upload (no size cap from VPS).
          // Step 1: mint a Mux upload URL
          const { uploadId, uploadUrl } = await getSocialMuxUploadUrl();

          // Step 2: PUT the file directly to Mux
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
            });
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`Mux upload failed (${xhr.status})`));
            });
            xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
            xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
            xhr.open("PUT", uploadUrl);
            xhr.setRequestHeader("Content-Type", singleFile.type && singleFile.type.startsWith("video/") ? singleFile.type : "video/mp4");
            xhr.send(singleFile);
          });

          // Step 3: finalize the post server-side (creates social_posts row)
          result = await finalizeSocialMuxPost({
            uploadId,
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
          // Regular users (any file) + creators uploading images → legacy multer path
          result = await new Promise<{ success: boolean; post: SocialPostItem }>(
            (resolve, reject) => {
              const formData = new FormData();
              formData.append("content", trimmed);
              formData.append("media", singleFile);
              if (isExclusive) formData.append("isExclusive", "true");
              if (selectedChannelId !== null) formData.append("channelId", String(selectedChannelId));
              if (hangoutGroupId) formData.append("hangoutGroupId", String(hangoutGroupId));
              if (category) formData.append("category", category);
              if (taggedPerformers.length) formData.append("taggedPerformerIds", JSON.stringify(taggedPerformers.map((p) => p.id)));

              const xhr = new XMLHttpRequest();
              xhr.open("POST", `${API_BASE}/api/webapp/social/posts/with-media`);
              xhr.withCredentials = true;

              xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                  setUploadProgress(Math.round((e.loaded / e.total) * 100));
                }
              });

              xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    resolve(JSON.parse(xhr.responseText));
                  } catch {
                    reject(new Error("Invalid server response"));
                  }
                } else {
                  try {
                    const err = JSON.parse(xhr.responseText);
                    reject(new Error(err.error || `Upload failed (${xhr.status})`));
                  } catch {
                    reject(new Error(`Upload failed (${xhr.status})`));
                  }
                }
              });

              xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
              xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
              xhr.send(formData);
            }
          );
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
        onPostCreated?.(result.post);
        clearForm();
      } else {
        throw new Error("Post creation failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create post");
      setUploadProgress(null);
    } finally {
      setIsPosting(false);
    }
  }, [text, files, isPosting, isExclusive, selectedChannelId, hangoutGroupId, category, taggedPerformers, isActiveCreator, onPostCreated, clearForm]);

  // ── Keyboard submit (Ctrl/Cmd + Enter) ────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // ── Derived values ─────────────────────────────────────────────────────────
  const hasVideo = files.some((f) => isVideoType(f.file));
  const imageCount = files.filter((f) => isImageType(f.file)).length;
  const canAddMoreImages = !hasVideo && imageCount < MAX_IMAGES;
  const videoCount = files.filter((f) => isVideoType(f.file)).length;
  const canAddMoreVideos = !files.some((f) => isImageType(f.file)) && videoCount < MAX_VIDEOS;
  const canAddVideo = canAddMoreVideos;
  const isOverCharLimit = text.length > MAX_CHARS;
  const hasVideoFile = files.some((f) => isVideoType(f.file));
  // Creators must pick a category for video posts; members can post freely
  const canPost = (text.trim().length > 0 || files.length > 0) && !isPosting && !isOverCharLimit && (!isActiveCreator || !hasVideoFile || category !== null);
  const resolvedPlaceholder = placeholder ?? tFeed.whatOnYourMind;
  const displayName = user?.displayName || user?.username || "U";

  // ── Compact collapsed view ─────────────────────────────────────────────────
  if (compact && !isExpanded) {
    return (
      <div
        className={`glass-card-sm p-4 cursor-pointer hover:border-white/20 transition-colors ${className}`}
        onClick={() => {
          setIsExpanded(true);
          // Focus textarea on next tick after expand
          setTimeout(() => textareaRef.current?.focus(), 50);
        }}
        role="button"
        tabIndex={0}
        aria-label="Create a post"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(true);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }
        }}
      >
        <div className="flex gap-3 items-center">
          <button onClick={(e) => { e.stopPropagation(); navigate("/profile"); }} className="flex-shrink-0">
            <ComposerAvatar photoUrl={user?.photoUrl} displayName={displayName} />
          </button>
          <div className="flex-1 min-w-0 text-white/40 text-sm">
            {resolvedPlaceholder}
          </div>
        </div>
      </div>
    );
  }


  // ── Full composer ──────────────────────────────────────────────────────────
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

  return (
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
        <div
          className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none z-10"
          style={{ border: "2px dashed rgba(212,0,122,0.6)", background: "rgba(212,0,122,0.06)" }}
          aria-hidden="true"
        >
          <p className="text-sm font-semibold" style={{ color: "#D4007A" }}>Drop to attach</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => navigate("/profile")} className="flex-shrink-0">
          <ComposerAvatar photoUrl={user?.photoUrl} displayName={displayName} />
        </button>

        <div className="flex-1 min-w-0">
          {/* Hidden file inputs */}
          <input id="pnp-postcomposer-1" ref={imageInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} multiple className="hidden" onChange={handleImageInputChange} aria-hidden="true" tabIndex={-1} />
          <input id="pnp-postcomposer-2" ref={videoInputRef} type="file" accept={ACCEPTED_VIDEO_TYPES.join(",")} multiple className="hidden" onChange={handleVideoInputChange} aria-hidden="true" tabIndex={-1} />

          {/* Creator template pills */}
          {isActiveCreator && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {(["promote", "calls", "free"] as const).map((t) => {
                const labels = { promote: "📣 Promote", calls: "📞 Available", free: "✍️ Free post" };
                const active = creatorTemplate === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setCreatorTemplate(active ? null : t); setShowAiInput(false); setAiPrompt(""); setAiError(null); }}
                    disabled={isPosting}
                    className="px-3 py-1 rounded-full text-xs font-semibold border transition-all disabled:opacity-40"
                    style={{
                      background: active ? "rgba(212,0,122,0.15)" : "transparent",
                      borderColor: active ? "rgba(212,0,122,0.5)" : "rgba(255,255,255,0.12)",
                      color: active ? "#D4007A" : "#8E8E93",
                    }}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Textarea */}
          <label htmlFor={textareaId} className="sr-only">{activePlaceholder}</label>
          <MentionInput
            id={textareaId}
            textareaRef={textareaRef}
            value={text}
            onChange={(v) => setText(v.slice(0, MAX_CHARS + 50))}
            onKeyDown={handleKeyDown}
            placeholder={activePlaceholder}
            rows={compact ? 2 : 3}
            disabled={isPosting}
            maxLength={MAX_CHARS + 50}
            className="w-full bg-transparent text-white py-2 border-b border-white/10 mb-2 resize-none outline-none placeholder:text-white/40 disabled:opacity-60 overflow-hidden"
            style={{ minHeight: "44px", fontSize: "16px" }}
            aria-describedby={error ? `${baseId}-error` : undefined}
          />

          {/* Character counter */}
          <div className="flex justify-end mb-2">
            <span className="text-xs tabular-nums" style={{ color: isOverCharLimit ? "#FF453A" : "#8E8E93" }} aria-live="polite" aria-atomic="true">
              {text.length}/{MAX_CHARS}
            </span>
          </div>

          {/* Creator AI write post */}
          {isActiveCreator && creatorTemplate && creatorTemplate !== "free" && (
            <div className="mb-3">
              {!showAiInput ? (
                <button
                  type="button"
                  onClick={() => setShowAiInput(true)}
                  disabled={isPosting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.25), rgba(230,145,56,0.2))", border: "1px solid rgba(212,0,122,0.3)" }}
                >
                  ✨ Write post for me
                </button>
              ) : (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(212,0,122,0.06)", border: "1px solid rgba(212,0,122,0.2)" }}>
                  <div className="flex gap-2">
                    <input
                      id="pnp-postcomposer-ai"
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleGeneratePost(); }
                        if (e.key === "Escape") { setShowAiInput(false); setAiPrompt(""); }
                      }}
                      placeholder={AI_PROMPT_PLACEHOLDERS[creatorTemplate as "promote" | "calls"]}
                      autoFocus
                      disabled={isGeneratingAi}
                      className="flex-1 bg-black/40 text-white text-xs rounded-lg px-3 py-2 border border-white/15 outline-none focus:border-pnp-pink/50 placeholder:text-white/30 disabled:opacity-60"
                      style={{ fontSize: "14px" }}
                    />
                    <button
                      type="button"
                      onClick={handleGeneratePost}
                      disabled={isGeneratingAi || !aiPrompt.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white btn-gradient disabled:opacity-40 transition-all whitespace-nowrap"
                    >
                      {isGeneratingAi ? "Writing…" : "✨ Write"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAiInput(false); setAiPrompt(""); setAiError(null); }}
                      className="px-2 py-1.5 rounded-lg text-xs text-white/40 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  {aiError && <p className="text-[11px]" style={{ color: "#FF453A" }}>{aiError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Media preview */}
          <MediaPreviewGrid files={files} onRemove={removeFile} disabled={isPosting} />

          {/* Upload progress */}
          {uploadProgress !== null && (
            <div className="mb-3 rounded-lg overflow-hidden" style={{ background: "rgba(212,0,122,0.06)", border: "1px solid rgba(212,0,122,0.15)" }}>
              <div className="flex justify-between items-center px-3 pt-2 pb-1">
                <span className="text-xs" style={{ color: "#D4007A" }}>{isPosting ? "Uploading..." : "Upload complete"}</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: "#D4007A" }}>{uploadProgress}%</span>
              </div>
              <div className="h-1 mx-3 mb-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg, #D4007A, #E69138)" }} role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p id={`${baseId}-error`} className="text-xs mb-2" style={{ color: "#FF453A" }} role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          {/* Action row: media + post */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isPosting || !canAddMoreImages}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 hover:border-white/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "#D4007A", minHeight: "36px" }}
                  aria-label={`Attach photo${imageCount > 0 ? ` (${imageCount}/${MAX_IMAGES})` : ""}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                  <span className="hidden sm:inline">{tFeed.photo}</span>
                  {imageCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "#D4007A" }} aria-hidden="true">
                      {imageCount}
                    </span>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={isPosting || !canAddVideo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/5 hover:border-white/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: "#E69138", minHeight: "36px" }}
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
              style={{ minHeight: "36px" }}
            >
              {isPosting ? tFeed.posting : tFeed.post}
            </button>
          </div>

          {/* Creator-only options */}
          {isActiveCreator && (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {POST_CATEGORIES.map((cat) => {
                  const active = category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(active ? null : cat.value)}
                      disabled={isPosting}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all disabled:opacity-40"
                      style={{
                        background: active ? `${cat.color}22` : "transparent",
                        borderColor: active ? cat.color : "rgba(255,255,255,0.12)",
                        color: active ? cat.color : "#8E8E93",
                      }}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              {hasVideoFile && !category && (
                <p className="mt-1 text-[11px]" style={{ color: "#FF9500" }}>Select a category to post your video</p>
              )}

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
                {!canPostExclusive && (
                  <p className="mt-1 text-[11px]" style={{ color: "#8E8E93" }}>Reach 10 followers to unlock exclusive posts</p>
                )}
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
  );
}
