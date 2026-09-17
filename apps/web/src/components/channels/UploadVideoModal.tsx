/**
 * UploadVideoModal — Studio Express (3-step Mux upload wizard)
 *
 *   Step 1 "Sube tu video"   — drag-drop + one-liner description
 *                              Upload goes direct browser→Mux via chunked PUT
 *                              (50 MB chunks, Content-Range, 5 auto-retries)
 *   Step 2 "Pulido por IA"   — review/edit title, description, tags
 *                              Thumbnail picker from Mux-generated frames
 *   Step 3 "Publicar"        — toggle feed announce → publish → done
 *
 * Resumable: offset stored in localStorage. Re-selecting the same file after a
 * failure resumes from the last successful chunk boundary.
 *
 * Note: switched from tus-js-client (PATCH) to chunked PUT because Mux migrated
 * their direct-upload infrastructure to OCI, which only supports PUT/DELETE.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getMuxUploadUrl,
  aiAllChannelVideo,
  getMuxThumbnails,
  updateChannelVideo,
  publishChannelVideo,
  getChannelTagTaxonomy,
  type ChannelVideo,
} from "@/lib/api";

type AccessType = "free" | "subscription" | "prime" | "paid" | "bts";
type Step = "pick" | "uploading" | "metadata" | "publish" | "done";

interface Props {
  channelId: number;
  channelName: string;
  channelSlug: string;
  accessType: AccessType;
  pricePerMonth: number | null;
  creatorUsername: string | null;
  onClose: () => void;
  onPublished?: (video: ChannelVideo) => void;
}

const RESUME_KEY = "mux_upload_resume";
const MAX_FILE_BYTES = 50 * 1024 * 1024 * 1024;
const TUS_CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB per chunk

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface ResumeState {
  uploadId: string;
  videoId: number;
  channelId: number;
  fileName: string;
  fileSize: number;
  uploadUrl: string;
  bytesUploaded: number;
}

function saveResume(state: ResumeState) {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
function clearResume() {
  try { localStorage.removeItem(RESUME_KEY); } catch { /* ignore */ }
}
function loadResume(channelId: number): ResumeState | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed: ResumeState = JSON.parse(raw);
    if (parsed.channelId === channelId && parsed.bytesUploaded > 0) return parsed;
  } catch { /* ignore */ }
  return null;
}

export default function UploadVideoModal({
  channelId,
  channelName,
  channelSlug,
  accessType,
  pricePerMonth,
  creatorUsername,
  onClose,
  onPublished,
}: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [oneLiner, setOneLiner] = useState("");
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0); // bytes/sec
  const [uploadEta, setUploadEta] = useState<number | null>(null); // seconds
  const [retryCount, setRetryCount] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const abortedRef = useRef(false);
  const videoIdRef = useRef<number | null>(null);
  const uploadStartRef = useRef<number>(0);
  const lastProgressRef = useRef<{ time: number; bytes: number }>({ time: 0, bytes: 0 });

  // AI + metadata
  const [aiLoading, setAiLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [taxonomy, setTaxonomy] = useState<string[]>([]);
  const [thumbnails, setThumbnails] = useState<Array<{ label: string; url: string }>>([]);
  const [selectedThumb, setSelectedThumb] = useState<string | null>(null);
  const [thumbsLoading, setThumbsLoading] = useState(false);

  // Publish
  const [announce, setAnnounce] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // Resume
  const [resume, setResume] = useState<ResumeState | null>(null);
  useEffect(() => {
    const r = loadResume(channelId);
    setResume(r);
  }, [channelId]);

  // Storage quota
  const [quota, setQuota] = useState<{ usedBytes: number; capBytes: number; remainingBytes: number; videoCount: number } | null>(null);
  useEffect(() => {
    fetch("/api/webapp/channels/me/storage-quota", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.success) setQuota({ usedBytes: d.usedBytes, capBytes: d.capBytes, remainingBytes: d.remainingBytes, videoCount: d.videoCount }); })
      .catch(() => {});
  }, []);
  const overQuota = !!(quota && file && file.size > quota.remainingBytes);

  // Load tag taxonomy once
  useEffect(() => {
    getChannelTagTaxonomy(channelId).then((r) => setTaxonomy(r.tags || [])).catch(() => {});
  }, [channelId]);

  // Abort upload on unmount
  useEffect(() => () => { abortedRef.current = true; xhrRef.current?.abort(); }, []);

  const validateFile = (f: File): string | null => {
    if (f.type && !f.type.startsWith("video/")) return "Solo se permiten archivos de video.";
    if (f.size > MAX_FILE_BYTES) return "El archivo es demasiado grande (máx 50 GB).";
    return null;
  };

  const handleFileSelect = (f: File) => {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
  };

  const fetchThumbnails = async (videoId: number) => {
    setThumbsLoading(true);
    try {
      const r = await getMuxThumbnails(channelId, videoId);
      if (r.thumbnails && r.thumbnails.length > 0) {
        setThumbnails(r.thumbnails);
        setSelectedThumb(r.thumbnails[0].url);
      }
    } catch { /* thumbnails optional */ }
    setThumbsLoading(false);
  };

  /**
   * Chunked PUT upload — sends file in 50 MB chunks directly to the Mux OCI
   * upload endpoint using Content-Range headers. Mux migrated from TUS (PATCH)
   * to PUT-based uploads; the OCI endpoint returns 405 for HEAD and blocks PATCH
   * via CORS, so tus-js-client cannot be used.
   *
   * Resume: the stored byte offset from localStorage lets us skip already-sent
   * chunks on retry without restarting from byte 0.
   */
  const doPutUpload = useCallback((
    fileToUpload: File,
    uploadUrl: string,
    videoId: number,
    uploadId: string,
    startOffset = 0,
  ) => {
    uploadStartRef.current = Date.now();
    lastProgressRef.current = { time: Date.now(), bytes: startOffset };
    abortedRef.current = false;

    const total = fileToUpload.size;
    let offset = startOffset;
    let chunkAttempt = 0;
    const RETRY_DELAYS = [0, 3_000, 5_000, 10_000, 20_000];

    const sendChunk = () => {
      if (abortedRef.current) return;

      const chunkEnd = Math.min(offset + TUS_CHUNK_SIZE, total);
      const chunk = fileToUpload.slice(offset, chunkEnd);
      const isLastChunk = chunkEnd >= total;

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", fileToUpload.type || "application/octet-stream");
      // Always send Content-Range so the server knows where this chunk belongs.
      xhr.setRequestHeader("Content-Range", `bytes ${offset}-${chunkEnd - 1}/${total}`);

      xhr.upload.onprogress = (e) => {
        if (abortedRef.current) return;
        const uploaded = offset + e.loaded;
        const pct = Math.round((uploaded / total) * 100);
        setUploadPct(pct);
        setUploadedBytes(uploaded);

        const now = Date.now();
        const elapsed = (now - lastProgressRef.current.time) / 1000;
        if (elapsed > 0.5) {
          const speed = (uploaded - lastProgressRef.current.bytes) / elapsed;
          setUploadSpeed(Math.max(0, speed));
          setUploadEta(speed > 0 ? Math.ceil((total - uploaded) / speed) : null);
          lastProgressRef.current = { time: now, bytes: uploaded };
        }

        saveResume({ uploadId, videoId, channelId, fileName: fileToUpload.name, fileSize: fileToUpload.size, uploadUrl, bytesUploaded: uploaded });
      };

      xhr.onload = () => {
        if (abortedRef.current) return;

        if (xhr.status >= 200 && xhr.status < 300) {
          // Upload complete (200/201/204)
          clearResume();
          setUploadPct(100);
          setUploadSpeed(0);
          setUploadEta(null);
          setRetryCount(0);
          setStep("metadata");
          setTimeout(() => fetchThumbnails(videoId), 8_000);
        } else if (xhr.status === 308) {
          // GCS-style "Resume Incomplete" — advance offset from Range header
          const rangeHeader = xhr.getResponseHeader("Range");
          const match = rangeHeader?.match(/bytes=0-(\d+)/);
          offset = match ? parseInt(match[1]) + 1 : chunkEnd;
          chunkAttempt = 0;
          sendChunk();
        } else if (xhr.status === 429 || xhr.status >= 500) {
          retryChunk();
        } else {
          setRetryCount(0);
          setError(`La subida falló (HTTP ${xhr.status}). El archivo sigue seleccionado — intenta de nuevo.`);
          setStep("pick");
        }
      };

      const retryChunk = () => {
        if (chunkAttempt < RETRY_DELAYS.length - 1) {
          chunkAttempt++;
          setRetryCount(chunkAttempt);
          setTimeout(sendChunk, RETRY_DELAYS[chunkAttempt]);
        } else {
          setRetryCount(0);
          setError("La subida falló tras varios intentos. Revisa tu conexión — el archivo sigue seleccionado.");
          setStep("pick");
        }
      };

      xhr.onerror = () => { if (!abortedRef.current) retryChunk(); };
      xhr.ontimeout = () => { if (!abortedRef.current) retryChunk(); };
      xhr.timeout = 30 * 60 * 1000; // 30 min per chunk

      xhr.send(chunk);
    };

    // If entire file fits in one chunk, skip Content-Range so single-PUT servers
    // (which may not implement 308) get a plain PUT body instead.
    if (total <= TUS_CHUNK_SIZE) {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", fileToUpload.type || "application/octet-stream");

      xhr.upload.onprogress = (e) => {
        if (abortedRef.current) return;
        const pct = Math.round((e.loaded / total) * 100);
        setUploadPct(pct);
        setUploadedBytes(e.loaded);

        const now = Date.now();
        const elapsed = (now - lastProgressRef.current.time) / 1000;
        if (elapsed > 0.5) {
          const speed = (e.loaded - lastProgressRef.current.bytes) / elapsed;
          setUploadSpeed(Math.max(0, speed));
          setUploadEta(speed > 0 ? Math.ceil((total - e.loaded) / speed) : null);
          lastProgressRef.current = { time: now, bytes: e.loaded };
        }
      };

      xhr.onload = () => {
        if (abortedRef.current) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          clearResume();
          setUploadPct(100);
          setUploadSpeed(0);
          setUploadEta(null);
          setRetryCount(0);
          setStep("metadata");
          setTimeout(() => fetchThumbnails(videoId), 8_000);
        } else {
          setRetryCount(0);
          setError(`La subida falló (HTTP ${xhr.status}). El archivo sigue seleccionado — intenta de nuevo.`);
          setStep("pick");
        }
      };

      xhr.onerror = () => {
        if (!abortedRef.current) {
          setError("La subida falló. Revisa tu conexión — el archivo sigue seleccionado.");
          setStep("pick");
        }
      };

      xhr.send(fileToUpload);
    } else {
      sendChunk();
    }
  }, [channelId]);

  const startUpload = useCallback(async (fileToUpload: File, description1Line: string) => {
    setError(null);
    setStep("uploading");
    setUploadPct(0);
    setUploadedBytes(0);
    setUploadSpeed(0);
    setUploadEta(null);
    setRetryCount(0);

    // If the same file was partially uploaded before, reuse the Mux URL so TUS
    // can resume from the stored byte offset instead of starting from scratch.
    const sameFile = resume &&
      resume.channelId === channelId &&
      resume.fileName === fileToUpload.name &&
      resume.fileSize === fileToUpload.size;

    let videoId: number;
    let uploadUrl: string;
    let uploadId: string;

    let resumeOffset = 0;
    if (sameFile && resume) {
      videoId = resume.videoId;
      uploadUrl = resume.uploadUrl;
      uploadId = resume.uploadId;
      // Round down to nearest chunk boundary so we don't send a partial chunk
      resumeOffset = Math.floor(resume.bytesUploaded / TUS_CHUNK_SIZE) * TUS_CHUNK_SIZE;
      videoIdRef.current = videoId;
      setUploadedBytes(resumeOffset);
      setUploadPct(Math.round((resumeOffset / fileToUpload.size) * 100));
    } else {
      try {
        const res = await getMuxUploadUrl(channelId);
        videoId = res.videoId;
        uploadUrl = res.uploadUrl;
        uploadId = res.uploadId;
        videoIdRef.current = videoId;
        saveResume({ uploadId, videoId, channelId, fileName: fileToUpload.name, fileSize: fileToUpload.size, uploadUrl, bytesUploaded: 0 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`No se pudo iniciar la subida: ${msg}`);
        setStep("pick");
        return;
      }
    }

    // Fire AI in parallel (non-blocking)
    if (description1Line.trim()) {
      setAiLoading(true);
      aiAllChannelVideo(channelId, videoId, description1Line.trim())
        .then((r) => {
          setTitle(r.title || "");
          setDescription(r.description || "");
          setTags(r.tags || []);
        })
        .catch(() => {})
        .finally(() => setAiLoading(false));
    }

    doPutUpload(fileToUpload, uploadUrl, videoId, uploadId, resumeOffset);
  }, [channelId, resume, doPutUpload]);

  const handlePublish = async () => {
    if (!videoIdRef.current) return;
    if (!title.trim()) { setError("El título es requerido para publicar."); return; }
    setPublishing(true);
    setError(null);
    try {
      await updateChannelVideo(channelId, videoIdRef.current, { title: title.trim(), description, tags, post_to_feed: announce });
      const res = await publishChannelVideo(channelId, videoIdRef.current);
      setStep("done");
      onPublished?.(res.video);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al publicar. Intenta de nuevo.");
    } finally {
      setPublishing(false);
    }
  };

  const resetAll = () => {
    abortedRef.current = true;
    xhrRef.current?.abort();
    setStep("pick");
    setFile(null);
    setOneLiner("");
    setError(null);
    setUploadPct(0);
    setUploadedBytes(0);
    setTitle("");
    setDescription("");
    setTags([]);
    setThumbnails([]);
    setSelectedThumb(null);
    videoIdRef.current = null;
    clearResume();
  };

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, []);

  const accessBadge = {
    free: { label: "GRATIS", color: "#34D399" },
    subscription: { label: "PAGO", color: "#FBBF24" },
    prime: { label: "PRIME", color: "#FFB454" },
    paid: { label: "PAGO", color: "#FBBF24" },
    bts: { label: "CRYSTAL", color: "#A78BFA" },
  }[accessType]!;

  // Detect if the currently selected file matches the stored resume
  const isSameFileAsResume = !!(
    resume && file &&
    resume.channelId === channelId &&
    resume.fileName === file.name &&
    resume.fileSize === file.size
  );

  // ── Step renders ─────────────────────────────────────────────────────────────

  const renderPick = () => (
    <div className="p-5 space-y-4">
      {/* Storage quota bar */}
      {quota && (() => {
        const pct = Math.min(100, Math.round((quota.usedBytes / quota.capBytes) * 100));
        const warn = quota.remainingBytes < 500 * 1024 * 1024;
        const barColor = overQuota ? "#DC2626" : warn ? "#F59E0B" : "#5ED1C4";
        return (
          <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex justify-between text-xs">
              <span className="text-white/70 font-semibold">Almacenamiento · Storage</span>
              <span className="text-white/80 font-mono">{fmtBytes(quota.usedBytes)} / {fmtBytes(quota.capBytes)}</span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "#1E1E1E" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width .3s" }} />
            </div>
            <div className="flex justify-between text-[10px] text-white/50">
              <span>{quota.videoCount} {quota.videoCount === 1 ? "video" : "videos"}</span>
              <span>{fmtBytes(quota.remainingBytes)} libre · free</span>
            </div>
            {overQuota && file && (
              <p className="text-[11px] font-semibold" style={{ color: "#F87171" }}>
                Este archivo ({fmtBytes(file.size)}) excede el espacio disponible. Borra un video antes de continuar.
                <br />
                <span className="text-white/50 font-normal">This file exceeds your available space. Delete a video to free up room.</span>
              </p>
            )}
          </div>
        );
      })()}

      {/* Resume banner */}
      {resume && (
        <div
          className="rounded-xl px-4 py-3 space-y-1.5"
          style={{ background: "rgba(212,0,122,.1)", border: "1px solid rgba(212,0,122,.35)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm">Subida sin terminar</p>
              <p className="text-xs text-white/60 mt-0.5 truncate">
                {resume.fileName} · {fmtBytes(resume.bytesUploaded)} de {fmtBytes(resume.fileSize)}
              </p>
              {isSameFileAsResume ? (
                <p className="text-xs mt-1 font-medium" style={{ color: "#34D399" }}>
                  ✓ Mismo archivo — continuará desde donde quedó
                </p>
              ) : (
                <p className="text-xs mt-1 text-white/40">
                  Selecciona el mismo archivo para retomar automáticamente
                </p>
              )}
            </div>
            <button
              className="text-xs font-bold px-3 py-1.5 rounded-lg flex-none"
              style={{ background: "rgba(255,255,255,0.08)", color: "#A1A1A3", border: "1px solid rgba(255,255,255,0.12)" }}
              onClick={() => { clearResume(); setResume(null); }}
            >
              Limpiar
            </button>
          </div>
          {/* Mini progress bar */}
          <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.08)" }}>
            <div
              style={{
                width: `${Math.round((resume.bytesUploaded / resume.fileSize) * 100)}%`,
                height: "100%",
                background: "#D4007A",
              }}
            />
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById("mux-file-input")?.click()}
        className="cursor-pointer rounded-2xl flex flex-col items-center justify-center gap-3 py-10 px-4 transition-colors"
        style={{
          border: `2px dashed ${drag ? "#D4007A" : "rgba(212,0,122,.3)"}`,
          background: drag ? "rgba(212,0,122,.06)" : "rgba(255,255,255,.02)",
          minHeight: 180,
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={drag ? "#D4007A" : "rgba(255,255,255,.35)"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 10l-4 4l-4-4" />
          <path d="M11 14V3" />
          <path d="M5 21h14" />
          <rect x="3" y="3" width="4" height="4" rx="1" />
          <rect x="17" y="3" width="4" height="4" rx="1" />
        </svg>
        {file ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-white">{file.name}</p>
            <p className="text-xs text-white/50 mt-0.5">{fmtBytes(file.size)}</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-semibold text-white">Arrastra tu video aquí</p>
            <p className="text-xs text-white/40 mt-0.5">o toca para elegir · MP4, MOV, WebM · máx 50 GB</p>
          </div>
        )}
        <input
          id="mux-file-input"
          type="file"
          accept="video/*"
          className="sr-only"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
        />
      </div>

      {/* One-liner */}
      {file && (
        <div>
          <label className="block text-xs font-semibold text-white/60 mb-1.5">
            ¿De qué trata en una línea? <span style={{ color: "#FF4DA6" }}>*</span>{" "}
            <span className="text-white/30">— la IA arma título, descripción y tags a partir de esto</span>
          </label>
          <textarea id="pnp-uploadvideomodal-1"
            rows={2}
            maxLength={300}
            value={oneLiner}
            onChange={(e) => setOneLiner(e.target.value)}
            placeholder="Ej: Mi primera sesión en cuero con mi compañero de cuarto..."
            className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
            style={{
              background: "#161616",
              border: `1px solid ${oneLiner.trim() ? "#2A2A2A" : "rgba(212,0,122,.35)"}`,
              color: "#fff",
              outline: "none",
            }}
          />
          {!oneLiner.trim() && (
            <p className="text-[11px] text-white/40 mt-1">
              Sin esto la IA no puede generar nada — el paso 2 quedaría vacío.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs font-medium" style={{ color: "#FF6B6B" }}>{error}</p>}

      <button
        disabled={!file || !oneLiner.trim() || overQuota}
        onClick={() => file && oneLiner.trim() && !overQuota && startUpload(file, oneLiner)}
        className="w-full py-3.5 rounded-xl text-sm font-bold transition-opacity disabled:opacity-30"
        style={{ background: "linear-gradient(90deg,#D4007A,#7B61FF)", color: "#fff" }}
      >
        {overQuota
          ? "Sin espacio · No storage"
          : isSameFileAsResume
          ? "Retomar subida →"
          : "Subir a Mux →"}
      </button>
      <p className="text-center text-xs text-white/30">
        Sube directo a Mux en chunks de 50 MB — reanudable si se corta
      </p>
    </div>
  );

  const fmtSpeed = (bps: number) => {
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  };
  const fmtEta = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  };

  const renderUploading = () => (
    <div className="p-6 space-y-5 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(212,0,122,.12)", border: "1px solid rgba(212,0,122,.3)" }}>
        {retryCount > 0 ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFB454" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4007A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </div>

      <div className="w-full">
        <div className="flex justify-between text-xs text-white/50 mb-1.5">
          <span>
            {retryCount > 0
              ? `Reintentando chunk… (${retryCount}/5)`
              : "Subiendo a Mux…"}
          </span>
          <span style={{ color: retryCount > 0 ? "#FFB454" : undefined }}>{uploadPct}%</span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "#1E1E1E" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${uploadPct}%`,
              background: retryCount > 0
                ? "linear-gradient(90deg,#FFB454,#D4007A)"
                : "linear-gradient(90deg,#D4007A,#7B61FF)",
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-white/40 mt-1.5">
          <span>{fmtBytes(uploadedBytes)} de {file ? fmtBytes(file.size) : "—"}</span>
          <span>
            {uploadSpeed > 0 && `${fmtSpeed(uploadSpeed)}`}
            {uploadEta !== null && uploadSpeed > 0 && ` · ${fmtEta(uploadEta)}`}
          </span>
        </div>
        <p className="text-[10px] text-white/25 mt-1">
          Chunks de 50 MB · se reanuda automáticamente si se corta
        </p>
      </div>

      {aiLoading && (
        <p className="text-xs text-white/40 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-white/20 border-t-pink-500 animate-spin" />
          IA generando metadata…
        </p>
      )}

      <button
        onClick={() => { abortedRef.current = true; xhrRef.current?.abort(); clearResume(); setRetryCount(0); setStep("pick"); }}
        className="text-xs text-white/30 underline decoration-dotted hover:text-white/60"
      >
        Cancelar subida
      </button>
    </div>
  );

  const renderMetadata = () => (
    <div className="p-5 space-y-4">
      <p className="text-xs font-bold tracking-widest text-white/40">PASO 2 DE 3</p>

      {aiLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl animate-pulse" style={{ height: i === 2 ? 64 : 40, background: "#161616" }} />
          ))}
          <p className="text-xs text-center text-white/40">IA generando metadata…</p>
        </div>
      ) : (
        <>
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1">Título</label>
            <input id="pnp-uploadvideomodal-2"
              type="text"
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del video"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ background: "#161616", border: "1px solid #2A2A2A", color: "#fff", outline: "none" }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1">Descripción</label>
            <textarea id="pnp-uploadvideomodal-3"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción del video"
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
              style={{ background: "#161616", border: "1px solid #2A2A2A", color: "#fff", outline: "none" }}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-white/60 mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                  style={{ background: "rgba(212,0,122,.15)", border: "1px solid rgba(212,0,122,.4)", color: "#FF4DA6" }}
                >
                  {tag} ✕
                </button>
              ))}
              {taxonomy.filter((t) => !tags.includes(t)).slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => tags.length < 8 && setTags([...tags, tag])}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                  style={{ background: "#161616", border: "1px solid #2A2A2A", color: "#A1A1A3" }}
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Thumbnail picker */}
      <div>
        <label className="block text-xs font-semibold text-white/60 mb-1.5">Portada</label>
        {thumbsLoading ? (
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 rounded-xl animate-pulse" style={{ height: 72, background: "#161616" }} />
            ))}
          </div>
        ) : thumbnails.length > 0 ? (
          <div className="flex gap-2">
            {thumbnails.map((t) => (
              <button
                key={t.url}
                onClick={() => setSelectedThumb(t.url)}
                className="flex-1 rounded-xl overflow-hidden transition-all"
                style={{
                  border: `2px solid ${selectedThumb === t.url ? "#D4007A" : "transparent"}`,
                  outline: selectedThumb === t.url ? "2px solid rgba(212,0,122,.3)" : "none",
                }}
              >
                <img src={t.url} alt={t.label} className="w-full object-cover" style={{ height: 72 }} loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/30">La portada estará lista cuando Mux termine de procesar el video.</p>
        )}
      </div>

      {error && <p className="text-xs font-medium" style={{ color: "#FF6B6B" }}>{error}</p>}

      <button
        onClick={() => setStep("publish")}
        className="w-full py-3.5 rounded-xl text-sm font-bold"
        style={{ background: "linear-gradient(90deg,#D4007A,#7B61FF)", color: "#fff" }}
      >
        Siguiente →
      </button>
    </div>
  );

  const renderPublish = () => (
    <div className="p-5 space-y-4">
      <p className="text-xs font-bold tracking-widest text-white/40">PASO 3 DE 3</p>

      {/* Preview card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
        {selectedThumb && (
          <img src={selectedThumb} alt="" className="w-full object-cover" style={{ height: 160 }} />
        )}
        <div className="p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded-full text-[9px] font-bold"
              style={{ background: `${accessBadge.color}22`, color: accessBadge.color, border: `1px solid ${accessBadge.color}55` }}
            >
              {accessBadge.label}
            </span>
            <p className="text-sm font-semibold text-white truncate">{title || "Sin título"}</p>
          </div>
          {description && (
            <p className="text-xs text-white/50 line-clamp-2">{description}</p>
          )}
          {tags.length > 0 && (
            <div className="flex gap-1 flex-wrap pt-0.5">
              {tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#111", color: "#A1A1A3" }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Announce toggle */}
      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
        <div>
          <p className="text-sm font-semibold text-white">Anunciar en el feed</p>
          <p className="text-xs text-white/40 mt-0.5">Publica un teaser y notifica a tus seguidores</p>
        </div>
        <button
          onClick={() => setAnnounce((v) => !v)}
          className="relative w-11 h-6 rounded-full transition-colors flex-none"
          style={{ background: announce ? "#D4007A" : "#2A2A2A" }}
          role="switch"
          aria-checked={announce}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ left: announce ? "calc(100% - 22px)" : "2px" }}
          />
        </button>
      </div>

      {error && <p className="text-xs font-medium" style={{ color: "#FF6B6B" }}>{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => setStep("metadata")}
          className="flex-1 py-3 rounded-xl text-sm font-semibold"
          style={{ background: "#161616", border: "1px solid #2A2A2A", color: "#A1A1A3" }}
        >
          ← Atrás
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing || !title.trim()}
          className="flex-[2] py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(90deg,#D4007A,#7B61FF)", color: "#fff" }}
        >
          {publishing ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </div>
  );

  const renderDone = () => (
    <div className="p-8 flex flex-col items-center text-center gap-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(52,199,89,.12)", border: "1px solid rgba(52,199,89,.3)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <p className="text-lg font-bold text-white">¡Video publicado!</p>
        <p className="text-sm text-white/50 mt-1">
          Mux lo está transcodeando — estará en HD adaptivo en unos minutos.
        </p>
      </div>
      <div className="flex gap-2 w-full">
        <a
          href={`/channels?channel=${encodeURIComponent(channelSlug)}`}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-center"
          style={{ background: "#161616", border: "1px solid #2A2A2A", color: "#fff" }}
        >
          Ver canal →
        </a>
        <button
          onClick={resetAll}
          className="flex-1 py-3 rounded-xl text-sm font-bold"
          style={{ background: "linear-gradient(90deg,#D4007A,#7B61FF)", color: "#fff" }}
        >
          Subir otro
        </button>
      </div>
    </div>
  );

  // ── Modal shell ──────────────────────────────────────────────────────────────
  const stepLabel = { pick: "Sube tu video", uploading: "Subiendo…", metadata: "Pulido por IA", publish: "Publicar", done: "¡Listo!" }[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Subir video"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step === "uploading" ? undefined : onClose} aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-md max-h-[92dvh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl"
        style={{
          background: "#0D0D0D",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-none" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div>
            <p className="text-xs text-white/40 font-medium">{channelName}</p>
            <h2 className="text-sm font-bold text-white leading-tight">{stepLabel}</h2>
          </div>
          {step !== "uploading" && (
            <button onClick={onClose} aria-label="Cerrar" className="text-white/40 hover:text-white transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress dots */}
        {step !== "done" && (
          <div className="flex gap-1.5 px-4 py-2 flex-none">
            {(["pick", "metadata", "publish"] as const).map((s, i) => {
              const stepOrder = { pick: 0, uploading: 0, metadata: 1, publish: 2, done: 3 };
              const active = stepOrder[step] >= i;
              return (
                <div
                  key={s}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{ background: active ? "linear-gradient(90deg,#D4007A,#7B61FF)" : "#1E1E1E" }}
                />
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === "pick" && renderPick()}
          {step === "uploading" && renderUploading()}
          {step === "metadata" && renderMetadata()}
          {step === "publish" && renderPublish()}
          {step === "done" && renderDone()}
        </div>
      </div>
    </div>
  );
}
