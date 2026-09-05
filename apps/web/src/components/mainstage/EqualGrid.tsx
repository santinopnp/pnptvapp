import {
  GridLayout,
  ParticipantTile,
  useTracks,
  useMaybeTrackRefContext,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MEDIA_IDENTITY } from "./CinemaGrid";
import { useI18n } from "@/lib/i18n";

/** Identity prefix used by replay bots that stream pre-recorded video. */
const REPLAY_IDENTITY_PREFIX = "replay-";

/**
 * Parse participant metadata to extract replay info.
 * Metadata shape: `{ replay: true, creator_user_id: "..." }`
 */
interface ReplayMeta {
  replay: true;
  creator_user_id: string;
}

function parseReplayMeta(raw: string | undefined | null): ReplayMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.replay === true && typeof parsed.creator_user_id === "string") {
      return parsed as ReplayMeta;
    }
  } catch {
    // Not JSON or wrong shape — fall through
  }
  return null;
}

/**
 * Thin wrapper around `<ParticipantTile />` that overlays an "Encore" pill
 * whenever the current track belongs to a replay participant.
 *
 * Detection order (prefer metadata, fall back to identity prefix):
 *   1. `participant.metadata` contains `{ replay: true, creator_user_id }` → replay
 *   2. `participant.identity` starts with "replay-" → replay
 */
function ReplayAwareParticipantTile() {
  const trackRef = useMaybeTrackRefContext();
  const participant = trackRef?.participant;

  const replayMeta = parseReplayMeta(participant?.metadata ?? null);
  const isReplay =
    replayMeta !== null ||
    (participant?.identity?.startsWith(REPLAY_IDENTITY_PREFIX) ?? false);

  return (
    <div className="relative w-full h-full">
      <ParticipantTile />
      {isReplay && (
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full pointer-events-none select-none"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid rgba(216,185,255,0.3)",
            boxShadow: "0 0 8px rgba(60,26,77,0.6)",
          }}
        >
          {/* Animated replay icon */}
          <svg
            className="w-2.5 h-2.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: "#d8b9ff" }}
            aria-hidden="true"
          >
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
          </svg>
          <span
            className="leading-none font-bold tracking-wide"
            style={{ fontSize: "11px", color: "#e8d5ff" }}
          >
            Encore
          </span>
        </div>
      )}
    </div>
  );
}

export function EqualGrid() {
  const t = useI18n().live;
  const allTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  // Drop the URL-ingress media bot so it doesn't get a tile alongside cammers.
  const tracks = allTracks.filter((track) => track.participant.identity !== MEDIA_IDENTITY);

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse bg-pnp-accent/10 border border-pnp-accent/20">
          <svg className="w-8 h-8 text-pnp-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{t.mainStageNobodyOnCam}</p>
          <p className="text-white/50 text-xs mt-1">
            {t.mainStageNobodyOnCamHint}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-pnp-background">
      <GridLayout tracks={tracks} style={{ height: "100%" }}>
        <ReplayAwareParticipantTile />
      </GridLayout>
    </div>
  );
}
