import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import * as tus from "tus-js-client";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";
import { useCreatorData } from "@/hooks/useCreatorData";
import {
  listMyReplayShows,
  createReplayShow,
  deleteReplayShow,
  startReplayShow,
  stopReplayShow,
  getActiveReplaySession,
  uploadCreatorVideoChunked,
  type ReplayShow,
  type ActiveReplaySession,
  type ChunkUploadProgress,
} from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtElapsed(startedAt: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void;
  onCreated: (show: ReplayShow) => void;
}

function UploadModal({ onClose, onCreated }: UploadModalProps) {
  const { creator: t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<ChunkUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !title) {
      // default title = filename without extension
      setTitle(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setError(null);
    setBusy(true);
    try {
      // 1. Crear el video en Bunny y obtener la firma de subida. La API key no
      //    sale del servidor: aqui solo llega una firma con caducidad.
      const initRes = await fetch("/api/webapp/creators/me/replay/bunny-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const init = await initRes.json();
      if (!initRes.ok || !init.success) throw new Error(init.error || "No se pudo iniciar la subida");

      // 2. Subir los bytes directos a Bunny. TUS es reanudable, que a 2 GB desde
      //    una conexion domestica no es opcional.
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: init.upload.endpoint,
          headers: init.upload.headers,
          chunkSize: 25 * 1024 * 1024,
          retryDelays: [0, 3000, 10000, 30000, 60000],
          metadata: { filetype: file.type, title: title.trim() },
          // La barra espera ChunkUploadProgress; TUS no tiene trozos, asi que se
          // reporta uno solo y el porcentaje real.
          onProgress: (sent, total) => setProgress({
            pct: Math.round((sent / total) * 100),
            doneChunks: sent >= total ? 1 : 0,
            totalChunks: 1,
            uploadId: init.videoId,
          }),
          onError: reject,
          onSuccess: () => resolve(),
        });
        upload.start();
      });

      // 3. Esperar al transcodificado. Registrar la URL antes de que este lista
      //    daria un ingest fallido al emitir.
      let playbackUrl = "";
      for (let i = 0; i < 120; i++) {
        const st = await fetch("/api/webapp/creators/me/replay/bunny-finish", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: init.videoId }),
        }).then((r) => r.json());
        if (st.status === "ready" && st.playbackUrl) { playbackUrl = st.playbackUrl; break; }
        if (st.status === "failed") throw new Error("Bunny no pudo procesar el video");
        await new Promise((r) => setTimeout(r, 5000));
      }
      if (!playbackUrl) throw new Error("El video sigue procesandose. Vuelve en unos minutos.");

      // 4. Registrar el show con la URL de Bunny.
      const { show } = await createReplayShow({
        videoUrl: playbackUrl,
        title: title.trim(),
      });
      onCreated(show);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.replayShowsErrorUpload);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const isUploading = busy && progress !== null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.replayShowsUploadTitle}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => { if (!busy) onClose(); }}
      />
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        style={{ background: "rgba(18,12,28,0.98)", border: "1px solid rgba(216,185,255,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">{t.replayShowsUploadTitle}</h2>
            <p className="text-xs text-pnp-textSecondary mt-0.5">{t.replayShowsUploadDesc}</p>
          </div>
          <button
            type="button"
            aria-label={t.replayShowsUploadCancel}
            onClick={() => { if (!busy) onClose(); }}
            disabled={busy}
            className="p-1.5 rounded-lg text-pnp-textSecondary hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File picker */}
          <div>
            <label className="block text-xs font-semibold text-pnp-textSecondary mb-1.5" htmlFor="replay-file">
              {t.replayShowsUploadFile}
            </label>
            <div
              className="relative flex items-center gap-3 px-3 py-3 rounded-xl border border-white/10 bg-white/[0.04] cursor-pointer hover:bg-white/[0.07] transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <svg className="w-5 h-5 flex-shrink-0 text-pnp-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className={`text-sm flex-1 min-w-0 truncate ${file ? "text-white" : "text-pnp-textSecondary"}`}>
                {file ? file.name : t.replayShowsUploadFilePlaceholder}
              </span>
              <input
                ref={fileRef}
                id="replay-file"
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={handleFileChange}
                disabled={busy}
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-pnp-textSecondary mb-1.5" htmlFor="replay-title">
              {t.replayShowsUploadTitleLabel}
            </label>
            <input
              id="replay-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.replayShowsUploadTitlePlaceholder}
              disabled={busy}
              maxLength={120}
              className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder:text-pnp-textSecondary focus:outline-none focus:ring-2 focus:ring-pnp-accent/50 focus:border-pnp-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Upload progress bar */}
          {isUploading && progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-pnp-textSecondary">
                <span>{t.replayShowsUploadSaving}</span>
                <span className="tabular-nums font-semibold text-white">{progress.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.pct}%`,
                    background: "linear-gradient(90deg, #0a0612, #3c1a4d, #d8b9ff)",
                  }}
                />
              </div>
              <p className="text-[10px] text-pnp-textSecondary tabular-nums">
                {progress.doneChunks}/{progress.totalChunks} chunks
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-900/20 border border-red-500/30">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M12 21a9 9 0 110-18 9 9 0 010 18z" />
              </svg>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { if (!busy) onClose(); }}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-pnp-textSecondary border border-white/10 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.replayShowsUploadCancel}
            </button>
            <button
              type="submit"
              disabled={busy || !file || !title.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: busy || !file || !title.trim()
                  ? "rgba(216,185,255,0.15)"
                  : "linear-gradient(135deg, #0a0612 0%, #3c1a4d 50%, #6b4c7f 100%)",
                border: "1px solid rgba(216,185,255,0.35)",
              }}
            >
              {busy ? t.replayShowsUploadSaving : t.replayShowsUploadSave}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Active Session Banner ─────────────────────────────────────────────────────

interface ActiveBannerProps {
  session: ActiveReplaySession;
  onStop: () => void;
  stopping: boolean;
  t: ReturnType<typeof useI18n>["creator"];
}

function ActiveSessionBanner({ session, onStop, stopping, t }: ActiveBannerProps) {
  const [elapsed, setElapsed] = useState(() => fmtElapsed(session.startedAt));

  useEffect(() => {
    const iv = setInterval(() => setElapsed(fmtElapsed(session.startedAt)), 1000);
    return () => clearInterval(iv);
  }, [session.startedAt]);

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
      style={{
        background: "linear-gradient(135deg, rgba(10,6,18,0.9), rgba(60,26,77,0.7))",
        border: "1px solid rgba(216,185,255,0.3)",
        boxShadow: "0 0 24px rgba(60,26,77,0.4)",
      }}
      aria-live="polite"
    >
      {/* Animated dot */}
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-300" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">
          {t.replayShowsActiveBanner(session.showTitle)}
        </p>
        <p className="text-xs text-purple-300/80 tabular-nums mt-0.5">
          {elapsed}
          {session.tipTotalRush > 0 && (
            <span className="ml-2 text-pnp-warning font-semibold">
              · {t.replayShowsTipTotal(session.tipTotalRush.toLocaleString())}
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onStop}
        disabled={stopping}
        className="flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "rgba(255,60,100,0.2)", border: "1px solid rgba(255,60,100,0.4)" }}
      >
        {stopping ? t.replayShowsStopping : t.replayShowsStop}
      </button>
    </div>
  );
}

// ── Show Row ──────────────────────────────────────────────────────────────────

interface ShowRowProps {
  show: ReplayShow;
  isCurrentlyLive: boolean;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  startingId: string | null;
  deletingId: string | null;
  t: ReturnType<typeof useI18n>["creator"];
}

const ShowRow = React.memo(function ShowRow({
  show,
  isCurrentlyLive,
  onStart,
  onDelete,
  startingId,
  deletingId,
  t,
}: ShowRowProps) {
  const isStarting = startingId === show.id;
  const isDeleting = deletingId === show.id;

  const handleDelete = () => {
    // Use a confirm dialog pattern without alert()
    if (window.confirm(t.replayShowsDeleteConfirm)) {
      onDelete(show.id);
    }
  };

  return (
    <div
      className="flex gap-3 items-start p-3 rounded-xl transition-colors"
      style={{
        background: isCurrentlyLive
          ? "linear-gradient(135deg, rgba(10,6,18,0.95), rgba(60,26,77,0.5))"
          : "rgba(255,255,255,0.04)",
        border: isCurrentlyLive
          ? "1px solid rgba(216,185,255,0.4)"
          : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Thumbnail */}
      <div
        className="w-20 h-14 rounded-lg flex-shrink-0 overflow-hidden bg-white/[0.06] flex items-center justify-center"
      >
        {show.thumbnailUrl ? (
          <img
            src={show.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="text-sm font-semibold text-white leading-tight truncate flex-1">
            {show.title}
          </p>
          {isCurrentlyLive && (
            <span
              className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-purple-200"
              style={{ background: "rgba(216,185,255,0.15)", border: "1px solid rgba(216,185,255,0.3)" }}
            >
              ❖ LIVE
            </span>
          )}
        </div>
        <p className="text-xs text-pnp-textSecondary mt-0.5 tabular-nums">
          {show.durationSeconds != null ? t.replayShowsDuration(show.durationSeconds) : "—"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0 self-center">
        <button
          type="button"
          onClick={() => onStart(show.id)}
          disabled={isStarting || isDeleting}
          className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #0a0612 0%, #3c1a4d 60%, #6b4c7f 100%)",
            border: "1px solid rgba(216,185,255,0.3)",
          }}
        >
          {isStarting ? t.replayShowsStarting : t.replayShowsGoLive}
        </button>

        <button
          type="button"
          aria-label={t.replayShowsDeleteConfirm}
          onClick={handleDelete}
          disabled={isStarting || isDeleting}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-pnp-textSecondary hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isDeleting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
});

// ── Crystal-only gate card ────────────────────────────────────────────────────

// Precio de etiqueta. La tarifa real la impone el servidor (CRYSTAL_PRICES);
// esto solo se muestra.
const CRYSTAL_PRICE_USD = 100;

function CrystalUpgradeModal({ open, onClose, onPaid, lang }: {
  open: boolean; onClose: () => void; onPaid: () => void; lang: "es" | "en";
}) {
  if (!open) return null;
  const isEs = lang === "es";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isEs ? "Comprar Crystal Creator Pass" : "Buy Crystal Creator Pass"}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5"
        style={{ background: "var(--pnp-background, #121212)", border: "1px solid var(--pnp-border, #2A2A2A)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-base font-bold text-white">Crystal Creator Pass</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {isEs ? "1 mes · se acumula si compras varios" : "1 month · stacks if you buy several"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEs ? "Cerrar" : "Close"}
            className="text-xl leading-none px-2"
            style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
          >
            ×
          </button>
        </div>

        <WalletPayCard
          surface="crystal_self"
          amountUsd={CRYSTAL_PRICE_USD}
          entitlementSpec={{}}
          metadata={{ context: "replay_shows_gate" }}
          label={isEs ? `Pagar $${CRYSTAL_PRICE_USD}` : `Pay $${CRYSTAL_PRICE_USD}`}
          lang={lang}
          onSuccess={onPaid}
        />

        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {isEs
            ? "Se paga con tu wallet. Si ya tienes un pase activo, este se suma al final del actual."
            : "Paid from your wallet. If you already have an active pass, this one stacks onto it."}
        </p>
      </div>
    </div>
  );
}

function CrystalOnlyCard({ t, onUpgrade }: { t: ReturnType<typeof useI18n>["creator"]; onUpgrade: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: "linear-gradient(135deg, #0a0612 0%, #3c1a4d 50%, #6b4c7f 100%)",
          border: "1px solid rgba(216,185,255,0.35)",
          boxShadow: "0 4px 24px rgba(60,26,77,0.5)",
        }}
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "#d8b9ff" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25zm0 3.75h.008v4.5H12v-4.5z" />
        </svg>
      </div>
      <p className="text-base font-bold text-white mb-2">{t.replayShowsCrystalOnly}</p>
      <p className="text-sm text-pnp-textSecondary max-w-sm leading-relaxed mb-6">
        {t.replayShowsCrystalOnlyDesc}
      </p>
      <button
        type="button"
        onClick={onUpgrade}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #0a0612 0%, #3c1a4d 50%, #6b4c7f 100%)",
          border: "1px solid rgba(216,185,255,0.35)",
        }}
      >
        ❖ {t.replayShowsUpgradeCta}
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreatorReplayShows() {
  // lang sale del objeto raiz: t son solo las cadenas de creador y no lo lleva.
  const { creator: t, lang } = useI18n();
  const { crystalCreator } = useCreatorData();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [shows, setShows] = useState<ReplayShow[]>([]);
  const [session, setSession] = useState<ActiveReplaySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setError(null);
    try {
      const [showsRes, sessionRes] = await Promise.allSettled([
        listMyReplayShows(),
        getActiveReplaySession(),
      ]);
      if (showsRes.status === "fulfilled") setShows(showsRes.value.shows);
      if (sessionRes.status === "fulfilled") setSession(sessionRes.value);

      if (showsRes.status === "rejected") {
        const err = showsRes.reason;
        // 403 CRYSTAL_ONLY — crystalCreator will already be false from useCreatorData
        if (err instanceof Error && err.message.includes("403")) return;
        throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.replayShowsErrorLoad);
    } finally {
      setLoading(false);
    }
  }, [t.replayShowsErrorLoad]);

  useEffect(() => {
    // Skip fetch if clearly not a crystal creator — the gate card will show
    if (!crystalCreator) {
      setLoading(false);
      return;
    }
    void load();
  }, [crystalCreator, load]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreated = useCallback((show: ReplayShow) => {
    setShows((prev) => [show, ...prev]);
    setShowUploadModal(false);
  }, []);

  const handleStart = useCallback(async (id: string) => {
    setStartingId(id);
    try {
      await startReplayShow(id);
      // Refresh session after starting
      const updated = await getActiveReplaySession();
      setSession(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.replayShowsErrorStart);
    } finally {
      setStartingId(null);
    }
  }, [t.replayShowsErrorStart]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await stopReplayShow();
      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.replayShowsErrorStop);
    } finally {
      setStopping(false);
    }
  }, [t.replayShowsErrorStop]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteReplayShow(id);
      setShows((prev) => prev.filter((s) => s.id !== id));
      // If the deleted show was the active session, clear it
      setSession((prev) => prev?.showId === id ? null : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.replayShowsErrorDelete);
    } finally {
      setDeletingId(null);
    }
  }, [t.replayShowsErrorDelete]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 w-48 rounded-xl bg-pnp-surface animate-pulse" />
        <div className="h-4 w-72 rounded-lg bg-pnp-surface animate-pulse" />
        <div className="h-16 rounded-xl bg-pnp-surface animate-pulse mt-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-pnp-surface animate-pulse" />
        ))}
      </div>
    );
  }

  // Crystal-only gate
  if (!crystalCreator) {
    return (
      <div className="max-w-2xl mx-auto">
        <>
          <CrystalOnlyCard t={t} onUpgrade={() => setUpgradeOpen(true)} />
          <CrystalUpgradeModal
            open={upgradeOpen}
            onClose={() => setUpgradeOpen(false)}
            // Tras pagar se recarga: el pase ya esta activo y el gate cae.
            onPaid={() => { setUpgradeOpen(false); load(); }}
            lang={lang === "es" ? "es" : "en"}
          />
        </>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-black text-white">{t.replayShowsTitle}</h1>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                background: "linear-gradient(135deg, #0a0612, #3c1a4d)",
                border: "1px solid rgba(216,185,255,0.4)",
                color: "#d8b9ff",
              }}
            >
              ❖ Crystal
            </span>
          </div>
          <p className="text-sm text-pnp-textSecondary">{t.replayShowsDesc}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowUploadModal(true)}
          className="flex-shrink-0 flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #0a0612 0%, #3c1a4d 50%, #6b4c7f 100%)",
            border: "1px solid rgba(216,185,255,0.35)",
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t.replayShowsUploadBtn}
        </button>
      </div>

      {/* Active session banner */}
      {session && (
        <ActiveSessionBanner
          session={session}
          onStop={handleStop}
          stopping={stopping}
          t={t}
        />
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-500/30">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M12 21a9 9 0 110-18 9 9 0 010 18z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex-shrink-0 text-xs font-semibold text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Shows grid */}
      {!error && shows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "rgba(216,185,255,0.08)", border: "1px solid rgba(216,185,255,0.15)" }}
          >
            <svg className="w-7 h-7 text-purple-300/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white mb-1">{t.replayShowsEmptyTitle}</p>
          <p className="text-xs text-pnp-textSecondary max-w-xs">{t.replayShowsEmptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-1 md:gap-2 md:space-y-0">
          {shows.map((show) => (
            <ShowRow
              key={show.id}
              show={show}
              isCurrentlyLive={session?.showId === show.id}
              onStart={handleStart}
              onDelete={handleDelete}
              startingId={startingId}
              deletingId={deletingId}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
