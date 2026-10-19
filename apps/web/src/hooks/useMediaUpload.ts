/**
 * useMediaUpload — tus resumable upload hook with HEIC conversion + image compression.
 * Uploads to /api/webapp/social/uploads/tus/ (endpoint provided by parallel agent).
 */

import { useCallback, useRef, useState } from "react";
import * as tus from "tus-js-client";

const API_BASE = import.meta.env.VITE_API_URL || "https://pnptv.app";
const TUS_ENDPOINT = `${API_BASE}/api/webapp/social/uploads/tus/`;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const COMPRESS_THRESHOLD = 500 * 1024; // skip if <500 KB

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export interface UploadState {
  id: string;
  status: UploadStatus;
  progress: number; // 0-100
  url?: string;
  error?: string;
  file: File;
  previewUrl: string;
}

interface UseMediaUploadReturn {
  items: Record<string, UploadState>;
  addFile: (file: File) => string;
  cancelFile: (id: string) => void;
  retryFile: (id: string) => void;
  clear: () => void;
}

async function convertHeic(file: File): Promise<File> {
  const mime = file.type.toLowerCase();
  if (mime !== "image/heic" && mime !== "image/heif") return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 }) as Blob;
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file; // fall back to original on conversion error
  }
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < COMPRESS_THRESHOLD) return file;
  try {
    const compress = (await import("browser-image-compression")).default;
    const compressed = await compress(file, {
      maxSizeMB: 2,
      maxWidthOrHeight: 2560,
      useWebWorker: true,
      fileType: "image/jpeg",
    });
    return new File([compressed], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useMediaUpload(): UseMediaUploadReturn {
  const [items, setItems] = useState<Record<string, UploadState>>({});
  const uploadsRef = useRef<Record<string, tus.Upload>>({});
  const previewsRef = useRef<Record<string, string>>({});

  const updateItem = useCallback((id: string, patch: Partial<UploadState>) => {
    setItems((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...patch } };
    });
  }, []);

  const startUpload = useCallback(
    async (id: string, rawFile: File) => {
      updateItem(id, { status: "uploading", progress: 0, error: undefined });

      let file = rawFile;
      try {
        file = await convertHeic(rawFile);
        if (file.type.startsWith("image/")) {
          file = await compressImage(file);
        }
      } catch {
        // pre-processing failed — upload original
        file = rawFile;
      }

      // Background task wrapper for native (optional dep — @capacitor/background-task may not be installed)
      let taskId: string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let bgTaskModule: any;
      try {
        if (
          typeof window !== "undefined" &&
          (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
        ) {
          // Opaque dynamic import — keeps tsc and vite happy when package absent
          // eslint-disable-next-line no-new-func
          bgTaskModule = await new Function('return import("@capacitor/background-task")')();
          taskId = (await bgTaskModule.BackgroundTask.beforeExit(async () => {})).taskId;
        }
      } catch {
        // @capacitor/background-task not installed — skip gracefully
        bgTaskModule = undefined;
      }

      const finishBgTask = () => {
        if (taskId && bgTaskModule) {
          try { bgTaskModule.BackgroundTask.finish({ taskId }); } catch { /* noop */ }
        }
      };

      const upload = new tus.Upload(file, {
        endpoint: TUS_ENDPOINT,
        chunkSize: CHUNK_SIZE,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: { "X-Requested-With": "XMLHttpRequest" },
        metadata: {
          filename: file.name,
          filetype: file.type,
        },
        onProgress(bytesUploaded, bytesTotal) {
          const pct = Math.round((bytesUploaded / bytesTotal) * 100);
          updateItem(id, { progress: pct });
        },
        onSuccess() {
          const url = upload.url ?? "";
          updateItem(id, { status: "done", progress: 100, url });
          delete uploadsRef.current[id];
          finishBgTask();
        },
        onError(err) {
          updateItem(id, { status: "error", error: err instanceof Error ? err.message : String(err) });
          delete uploadsRef.current[id];
          finishBgTask();
        },
      });

      uploadsRef.current[id] = upload;
      upload.start();
    },
    [updateItem]
  );

  const addFile = useCallback(
    (file: File): string => {
      const id = makeId();
      const previewUrl = URL.createObjectURL(file);
      previewsRef.current[id] = previewUrl;
      setItems((prev) => ({
        ...prev,
        [id]: { id, status: "queued", progress: 0, file, previewUrl },
      }));
      // Start uploading on next tick so caller gets the id first
      setTimeout(() => startUpload(id, file), 0);
      return id;
    },
    [startUpload]
  );

  const cancelFile = useCallback((id: string) => {
    const upload = uploadsRef.current[id];
    if (upload) {
      upload.abort(true).catch(() => {});
      delete uploadsRef.current[id];
    }
    setItems((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], status: "cancelled", progress: 0 } };
    });
  }, []);

  const retryFile = useCallback(
    (id: string) => {
      setItems((prev) => {
        if (!prev[id]) return prev;
        return { ...prev, [id]: { ...prev[id], status: "queued", progress: 0, error: undefined } };
      });
      setItems((prev) => {
        const item = prev[id];
        if (item) startUpload(id, item.file);
        return prev;
      });
    },
    [startUpload]
  );

  const clear = useCallback(() => {
    Object.entries(uploadsRef.current).forEach(([, u]) => u.abort(true).catch(() => {}));
    uploadsRef.current = {};
    Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url));
    previewsRef.current = {};
    setItems({});
  }, []);

  return { items, addFile, cancelFile, retryFile, clear };
}
