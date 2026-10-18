/**
 * MediaProgressStrip — thumbnail row with tus upload progress overlays.
 * Supports drag-to-reorder via framer-motion Reorder.
 */

import React from "react";
import { Reorder, motion } from "framer-motion";
import type { UploadState } from "@/hooks/useMediaUpload";

interface MediaProgressStripProps {
  items: UploadState[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onReorder: (newOrder: UploadState[]) => void;
}

function CircleProgress({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      {/* Track */}
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
      {/* Progress arc */}
      <motion.circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="#D4007A"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ transform: "rotate(-90deg)", transformOrigin: "22px 22px" }}
      />
    </svg>
  );
}

function Thumb({ item, onCancel, onRetry }: { item: UploadState; onCancel: (id: string) => void; onRetry: (id: string) => void }) {
  const isVideo = item.file.type.startsWith("video/");
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const isCancelled = item.status === "cancelled";
  const isUploading = item.status === "uploading" || item.status === "queued";
  const showOverlay = !isDone || isError || isCancelled;

  return (
    <div
      className="relative flex-shrink-0 rounded-xl overflow-hidden bg-black/40 cursor-grab active:cursor-grabbing select-none"
      style={{ width: 80, height: 80, touchAction: "none" }}
      aria-label={`${isVideo ? "Video" : "Image"} — ${item.status}`}
    >
      {/* Thumbnail */}
      {isVideo ? (
        <video src={item.previewUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
      ) : (
        <img src={item.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
      )}

      {/* Dark overlay when not done */}
      {showOverlay && (
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} />
      )}

      {/* Uploading: ring + percent */}
      {isUploading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <CircleProgress pct={item.progress} />
          <span className="text-[10px] font-semibold text-white tabular-nums">{item.progress}%</span>
        </div>
      )}

      {/* Done: checkmark */}
      {isDone && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, type: "spring", stiffness: 300 }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(52,211,153,0.85)" }}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </motion.div>
      )}

      {/* Error: icon + retry */}
      {(isError || isCancelled) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1">
          <svg className="w-6 h-6" style={{ color: "#FF453A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ background: "rgba(255,69,58,0.8)", minHeight: 24 }}
            aria-label="Retry upload"
          >
            Retry
          </button>
        </div>
      )}

      {/* Cancel / Remove button */}
      {!isDone && !isError && !isCancelled && (
        <button
          type="button"
          onClick={() => onCancel(item.id)}
          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white"
          style={{ background: "rgba(0,0,0,0.7)", minHeight: 24, minWidth: 24 }}
          aria-label="Cancel upload"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {(isDone || isError || isCancelled) && (
        <button
          type="button"
          onClick={() => onCancel(item.id)}
          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white"
          style={{ background: "rgba(0,0,0,0.7)", minHeight: 24, minWidth: 24 }}
          aria-label="Remove"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function OverallProgress({ items }: { items: UploadState[] }) {
  if (items.length === 0) return null;
  const uploading = items.filter((i) => i.status === "uploading" || i.status === "queued");
  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  if (uploading.length === 0 && done === total) return null;

  const overall =
    total > 0
      ? Math.round(items.reduce((acc, i) => acc + (i.status === "done" ? 100 : i.progress), 0) / total)
      : 0;

  return (
    <div className="mt-2 flex items-center gap-2 px-1">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, #D4007A, #E69138)" }}
          animate={{ width: `${overall}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: "#8E8E93" }}>
        {done}/{total}
      </span>
    </div>
  );
}

export function MediaProgressStrip({ items, onCancel, onRetry, onReorder }: MediaProgressStripProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-3">
      <Reorder.Group
        axis="x"
        values={items}
        onReorder={onReorder}
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {items.map((item) => (
          <Reorder.Item
            key={item.id}
            value={item}
            className="flex-shrink-0"
            whileDrag={{ scale: 1.08, zIndex: 50 }}
          >
            <Thumb item={item} onCancel={onCancel} onRetry={onRetry} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <OverallProgress items={items} />
    </div>
  );
}
