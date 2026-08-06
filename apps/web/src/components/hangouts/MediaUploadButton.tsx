import React, { useRef, useState, useEffect, useCallback } from "react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime", "video/3gpp", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"];
const MAX_IMAGE_BYTES = 20 * 1_048_576;  // 20 MB
const MAX_VIDEO_BYTES = 200 * 1_048_576; // 200 MB (video + audio)
const MAX_RECORDING_SECONDS = 60;

interface MediaUploadButtonProps {
  onFilesSelect: (files: File[], previewUrls: string[]) => void;
  onError: (error: string) => void;
  onVoiceRecord?: (blob: Blob, duration: number) => void;
  onVideoNoteRecord?: (blob: Blob, duration: number) => void;
  disabled: boolean;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MediaUploadButton({
  onFilesSelect,
  onError,
  onVoiceRecord,
  onVideoNoteRecord,
  disabled,
}: MediaUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // --- Voice recording state ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // For cancel-on-drag-away (mobile press-and-hold)
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const isMobilePressRef = useRef(false);
  const cancelledRef = useRef(false);

  // --- Video note recording state ---
  const [isVideoNoteRecording, setIsVideoNoteRecording] = useState(false);
  const [videoNoteSeconds, setVideoNoteSeconds] = useState(0);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoStartTimeRef = useRef<number>(0);
  const videoAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoCancelledRef = useRef(false);
  const vidButtonRef = useRef<HTMLButtonElement>(null);
  const vidPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const isVidMobilePressRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      if (videoAutoStopRef.current) clearTimeout(videoAutoStopRef.current);
      if (videoRecorderRef.current && videoRecorderRef.current.state !== "inactive") {
        videoRecorderRef.current.stop();
      }
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  function startTimer() {
    setRecordingSeconds(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  }

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearAutoStop() {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }

  const stopRecording = useCallback((cancelled: boolean) => {
    clearTimer();
    clearAutoStop();
    cancelledRef.current = cancelled;

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      return;
    }
    recorder.stop();
    // onstop handler will do the rest
  }, []);

  async function startRecording() {
    if (disabled || isRecording) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access denied. Please allow microphone permissions.");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/ogg";

    chunksRef.current = [];
    cancelledRef.current = false;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      onError("Audio recording is not supported in this browser.");
      return;
    }
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      // Stop all tracks to release the mic
      stream.getTracks().forEach((t) => t.stop());

      if (cancelledRef.current || !onVoiceRecord) {
        chunksRef.current = [];
        setIsRecording(false);
        setRecordingSeconds(0);
        return;
      }

      const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      setIsRecording(false);
      setRecordingSeconds(0);

      if (blob.size > 0 && durationSeconds > 0) {
        onVoiceRecord(blob, durationSeconds);
      }
    };

    recorder.start(100); // collect data every 100 ms for smoother chunking
    setIsRecording(true);
    startTimer();

    // Auto-stop at max duration
    autoStopRef.current = setTimeout(() => {
      stopRecording(false);
    }, MAX_RECORDING_SECONDS * 1000);
  }

  // ─── File upload handlers ────────────────────────────────────────────────

  function handleUploadClick() {
    if (disabled || isRecording) return;
    inputRef.current?.click();
  }

  function handleImageClick() {
    if (disabled || isRecording) return;
    imageInputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (selected.length === 0) return;

    const validFiles: File[] = [];
    for (const file of selected) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!ACCEPTED_TYPES.includes(file.type)) {
        onError("Unsupported file type. Please select JPEG, PNG, GIF, WebP, MP4, WebM, MOV, or 3GP files.");
        return;
      }
      const isAudio = file.type.startsWith("audio/");
      if (isImage && file.size > MAX_IMAGE_BYTES) {
        onError(`"${file.name}" is over 20 MB. Images must be under 20 MB.`);
        return;
      }
      if ((isVideo || isAudio) && file.size > MAX_VIDEO_BYTES) {
        onError(`"${file.name}" is over 200 MB. Files must be under 200 MB.`);
        return;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;
    const previewUrls = validFiles.map((f) => URL.createObjectURL(f));
    onFilesSelect(validFiles, previewUrls);
  }

  // ─── Mic button interaction — desktop (click-to-toggle) ─────────────────

  function handleMicClick() {
    // Only used on desktop (non-touch). On touch, pointer events handle it.
    if (isMobilePressRef.current) return;
    if (isRecording) {
      stopRecording(false);
    } else {
      startRecording();
    }
  }

  // ─── Mic button interaction — mobile (press-and-hold) ───────────────────

  function handleTouchStart(e: React.TouchEvent) {
    isMobilePressRef.current = true;
    const touch = e.touches[0];
    pressOriginRef.current = { x: touch.clientX, y: touch.clientY };
    startRecording();
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isRecording || !pressOriginRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - pressOriginRef.current.x;
    const dy = touch.clientY - pressOriginRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 50) {
      stopRecording(true);
    }
  }

  function handleTouchEnd() {
    if (isRecording) {
      stopRecording(false);
    }
    // Reset flag after a tick so handleMicClick sees it and skips
    setTimeout(() => { isMobilePressRef.current = false; }, 0);
  }

  function handleTouchCancel() {
    stopRecording(true);
    setTimeout(() => { isMobilePressRef.current = false; }, 0);
  }

  // ─── Video note helpers ──────────────────────────────────────────────────

  function startVideoTimer() {
    setVideoNoteSeconds(0);
    videoStartTimeRef.current = Date.now();
    videoTimerRef.current = setInterval(() => {
      setVideoNoteSeconds(Math.floor((Date.now() - videoStartTimeRef.current) / 1000));
    }, 500);
  }

  function clearVideoTimer() {
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
  }

  function clearVideoAutoStop() {
    if (videoAutoStopRef.current) {
      clearTimeout(videoAutoStopRef.current);
      videoAutoStopRef.current = null;
    }
  }

  function stopVideoPreview() {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    }
  }

  const stopVideoNoteRecording = useCallback((cancelled: boolean) => {
    clearVideoTimer();
    clearVideoAutoStop();
    videoCancelledRef.current = cancelled;

    const recorder = videoRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      stopVideoPreview();
      setIsVideoNoteRecording(false);
      return;
    }
    recorder.stop();
    // onstop handler will finalize
  }, []);

  async function startVideoNoteRecording() {
    if (disabled || isRecording || isVideoNoteRecording) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 400 }, height: { ideal: 400 }, aspectRatio: 1 },
        audio: true,
      });
    } catch {
      onError("Camera access denied. Please allow camera and microphone permissions.");
      return;
    }

    videoStreamRef.current = stream;

    // Attach stream to live preview element
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = stream;
    }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "video/mp4";

    videoChunksRef.current = [];
    videoCancelledRef.current = false;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      stopVideoPreview();
      onError("Video recording is not supported in this browser.");
      return;
    }
    videoRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stopVideoPreview();

      if (videoCancelledRef.current || !onVideoNoteRecord) {
        videoChunksRef.current = [];
        setIsVideoNoteRecording(false);
        setVideoNoteSeconds(0);
        return;
      }

      const durationSeconds = Math.round((Date.now() - videoStartTimeRef.current) / 1000);
      const blob = new Blob(videoChunksRef.current, { type: mimeType });
      videoChunksRef.current = [];
      setIsVideoNoteRecording(false);
      setVideoNoteSeconds(0);

      if (blob.size > 0 && durationSeconds > 0) {
        onVideoNoteRecord(blob, durationSeconds);
      }
    };

    recorder.start(100);
    setIsVideoNoteRecording(true);
    startVideoTimer();

    videoAutoStopRef.current = setTimeout(() => {
      stopVideoNoteRecording(false);
    }, MAX_RECORDING_SECONDS * 1000);
  }

  // ─── Video note button interactions ─────────────────────────────────────────

  function handleVideoCamClick() {
    if (isVidMobilePressRef.current) return;
    if (isVideoNoteRecording) {
      stopVideoNoteRecording(false);
    } else {
      startVideoNoteRecording();
    }
  }

  function handleVideoCamTouchStart(e: React.TouchEvent) {
    isVidMobilePressRef.current = true;
    const touch = e.touches[0];
    vidPressOriginRef.current = { x: touch.clientX, y: touch.clientY };
    startVideoNoteRecording();
  }

  function handleVideoCamTouchMove(e: React.TouchEvent) {
    if (!isVideoNoteRecording || !vidPressOriginRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - vidPressOriginRef.current.x;
    const dy = touch.clientY - vidPressOriginRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 50) {
      stopVideoNoteRecording(true);
    }
  }

  function handleVideoCamTouchEnd() {
    if (isVideoNoteRecording) {
      stopVideoNoteRecording(false);
    }
    setTimeout(() => { isVidMobilePressRef.current = false; }, 0);
  }

  function handleVideoCamTouchCancel() {
    stopVideoNoteRecording(true);
    setTimeout(() => { isVidMobilePressRef.current = false; }, 0);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/3gpp,audio/webm,audio/ogg,audio/mp4,audio/mpeg"
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
        multiple
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
        multiple
      />

      {/* Dedicated picture button */}
      <button
        type="button"
        onClick={handleImageClick}
        disabled={disabled || isRecording}
        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition-all disabled:opacity-40 disabled:pointer-events-none text-pnp-textSecondary hover:text-pnp-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
        aria-label="Send picture"
        title="Send picture"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
          />
        </svg>
      </button>

      {/* File upload button */}
      <button
        type="button"
        onClick={handleUploadClick}
        disabled={disabled || isRecording}
        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition-all disabled:opacity-40 disabled:pointer-events-none text-pnp-textSecondary hover:text-pnp-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
        aria-label="Attach video or file"
        title="Attach video or file"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
          />
        </svg>
      </button>

      {/* Voice message recording button + indicator */}
      {onVoiceRecord && (
        <div className="flex-shrink-0 flex items-center gap-1.5 select-none">
          {isRecording && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30">
              {/* Pulsing red dot */}
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500" />
              </span>
              <span className="text-[11px] font-mono text-red-400 tabular-nums min-w-[2.4rem]">
                {formatElapsed(recordingSeconds)}
              </span>
              <span className="text-[10px] text-red-400/70 hidden sm:inline">
                {recordingSeconds < 55 ? "Release to send" : `${MAX_RECORDING_SECONDS - recordingSeconds}s left`}
              </span>
            </div>
          )}

          <button
            ref={micButtonRef}
            type="button"
            onClick={handleMicClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            disabled={disabled}
            className={[
              "w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent",
              "disabled:opacity-40 disabled:pointer-events-none",
              isRecording
                ? "bg-red-500 text-white scale-110 shadow-lg shadow-red-500/40 hover:bg-red-600"
                : "hover:bg-white/10 active:scale-90 text-pnp-textSecondary hover:text-pnp-textPrimary",
            ].join(" ")}
            aria-label={isRecording ? "Stop recording" : "Record voice message (hold on mobile)"}
            title={isRecording ? "Stop recording" : "Record voice message"}
          >
            {isRecording ? (
              // Stop icon when recording
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              // Microphone icon
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Video note recording button + indicator */}
      {onVideoNoteRecord && (
        <div className="flex-shrink-0 flex items-center gap-1.5 select-none">
          {isVideoNoteRecording && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-pnp-accent/15 border border-pnp-accent/30">
              {/* Live circular preview */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "2px solid rgba(212,0,122,0.7)",
                  flexShrink: 0,
                }}
              >
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ display: "block" }}
                />
              </div>
              <span className="text-[11px] font-mono text-pnp-accent tabular-nums min-w-[2.4rem]">
                {formatElapsed(videoNoteSeconds)}
              </span>
              <span className="text-[10px] text-pnp-accent/70 hidden sm:inline">
                {videoNoteSeconds < 55 ? "Release to send" : `${MAX_RECORDING_SECONDS - videoNoteSeconds}s left`}
              </span>
            </div>
          )}

          <button
            ref={vidButtonRef}
            type="button"
            onClick={handleVideoCamClick}
            onTouchStart={handleVideoCamTouchStart}
            onTouchMove={handleVideoCamTouchMove}
            onTouchEnd={handleVideoCamTouchEnd}
            onTouchCancel={handleVideoCamTouchCancel}
            disabled={disabled || isRecording}
            className={[
              "w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent",
              "disabled:opacity-40 disabled:pointer-events-none",
              isVideoNoteRecording
                ? "bg-pnp-accent text-white scale-110 shadow-lg shadow-pnp-accent/40 hover:bg-pnp-accentHover"
                : "hover:bg-white/10 active:scale-90 text-pnp-textSecondary hover:text-pnp-textPrimary",
            ].join(" ")}
            aria-label={isVideoNoteRecording ? "Stop video note recording" : "Record video note (hold on mobile)"}
            title={isVideoNoteRecording ? "Stop recording" : "Record video note"}
          >
            {isVideoNoteRecording ? (
              // Stop icon when recording
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              // Video camera icon
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25V7.5A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            )}
          </button>
        </div>
      )}
    </>
  );
}
