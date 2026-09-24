/**
 * FloatingCallOverlay
 *
 * Renders the active call as either:
 * - Full screen (fixed inset-0): a complete call panel with minimize button
 * - PiP tile (fixed bottom-right): small video thumbnail + mic/cam/end/expand buttons
 *
 * A single <LiveKitRoom> stays mounted for the entire call so the connection
 * is never interrupted when the user minimizes or navigates.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { useFloatingCall } from "@/context/FloatingCallContext";

// ── Mic toggle button ─────────────────────────────────────────────────────────

function MicButton() {
  const { localParticipant } = useLocalParticipant();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!localParticipant) return;
    const update = () => setMuted(!localParticipant.isMicrophoneEnabled);
    localParticipant.on("trackMuted", update);
    localParticipant.on("trackUnmuted", update);
    update();
    return () => {
      localParticipant.off("trackMuted", update);
      localParticipant.off("trackUnmuted", update);
    };
  }, [localParticipant]);

  const toggle = () => {
    localParticipant?.setMicrophoneEnabled(muted);
  };

  return (
    <button
      onClick={toggle}
      title={muted ? "Unmute" : "Mute"}
      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
      style={{ background: muted ? "rgba(255,69,58,0.85)" : "rgba(255,255,255,0.15)" }}
      aria-label={muted ? "Unmute microphone" : "Mute microphone"}
    >
      {muted ? (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      )}
    </button>
  );
}

// ── PiP view (minimized) ──────────────────────────────────────────────────────

function PipView({ callerName, onExpand, onEnd }: { callerName: string; onExpand: () => void; onEnd: () => void }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: true }
  );
  const participants = useParticipants();

  // Show remote participant's video; fall back to first track
  const remoteTrack = tracks.find((t) => !t.participant.isLocal && t.publication?.track) ?? tracks.find((t) => !t.participant.isLocal);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!remoteTrack?.publication?.track || !remoteVideoRef.current) return;
    const pub = remoteTrack.publication;
    if ("videoTrack" in pub && pub.videoTrack) {
      pub.videoTrack.attach(remoteVideoRef.current);
      return () => { pub.videoTrack?.detach(remoteVideoRef.current!); };
    }
  }, [remoteTrack]);

  const remoteCount = participants.filter((p) => !p.isLocal).length;

  return (
    <div className="relative w-full h-full bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Remote video */}
      {remoteTrack?.publication?.track ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted={false}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ background: "linear-gradient(135deg, #7B61FF, #D4007A)" }}
          >
            {callerName.charAt(0).toUpperCase()}
          </div>
          <p className="text-xs text-white/70 truncate max-w-[80%]">{callerName}</p>
          {remoteCount === 0 && (
            <p className="text-[10px] text-white/40">Waiting to connect…</p>
          )}
        </div>
      )}

      {/* Top-right: expand button */}
      <button
        onClick={onExpand}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
        title="Expand call"
        aria-label="Expand call"
      >
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>

      {/* Bottom bar: mic + end */}
      <div
        className="absolute bottom-0 inset-x-0 flex items-center justify-between px-2.5 py-2"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}
      >
        <MicButton />
        <button
          onClick={onEnd}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: "#FF453A" }}
          title="End call"
          aria-label="End call"
        >
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Full-screen view ──────────────────────────────────────────────────────────

function FullView({ callerName, onMinimize, onEnd }: { callerName: string; onMinimize: () => void; onEnd: () => void }) {
  return (
    <div className="w-full h-full flex flex-col" style={{ background: "#000" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "rgba(0,0,0,0.85)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <button
          onClick={onMinimize}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-white"
          style={{ color: "rgba(255,255,255,0.7)" }}
          aria-label="Minimize to picture-in-picture"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
          <span>Minimize</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
          <span className="text-sm font-semibold text-white truncate max-w-[160px]">
            {callerName}
          </span>
        </div>

        <button
          onClick={onEnd}
          className="flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80 px-3 py-1.5 rounded-xl"
          style={{ background: "rgba(255,69,58,0.18)", color: "#FF453A", border: "1px solid rgba(255,69,58,0.3)" }}
          aria-label="End call"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)" />
          </svg>
          <span>End</span>
        </button>
      </div>

      {/* Call area */}
      <div className="flex-1 relative overflow-hidden">
        <VideoConference />
      </div>
    </div>
  );
}

// ── FloatingCallOverlay ───────────────────────────────────────────────────────

export function FloatingCallOverlay() {
  const { activeCall, isMinimized, closeCall, minimize, expand } = useFloatingCall();

  const handleEnd = useCallback(() => {
    closeCall();
  }, [closeCall]);

  if (!activeCall) return null;

  return (
    <div
      className={
        isMinimized
          ? "fixed bottom-20 right-4 z-[9990] w-52 h-36 rounded-2xl shadow-2xl"
          : "fixed inset-0 z-[9990] flex flex-col"
      }
      style={isMinimized ? { border: "1.5px solid rgba(255,255,255,0.15)" } : undefined}
    >
      <LiveKitRoom
        token={activeCall.token}
        serverUrl={activeCall.livekitUrl}
        audio={true}
        video={true}
        onDisconnected={handleEnd}
        style={{ width: "100%", height: "100%" }}
      >
        <RoomAudioRenderer />
        {isMinimized ? (
          <PipView
            callerName={activeCall.callerName}
            onExpand={expand}
            onEnd={handleEnd}
          />
        ) : (
          <FullView
            callerName={activeCall.callerName}
            onMinimize={minimize}
            onEnd={handleEnd}
          />
        )}
      </LiveKitRoom>
    </div>
  );
}
