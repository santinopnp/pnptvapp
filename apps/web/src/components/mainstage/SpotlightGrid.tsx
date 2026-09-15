import { useEffect, useState } from "react";
import {
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track, VideoQuality } from "livekit-client";
import type { RemoteTrackPublication } from "livekit-client";
import { MEDIA_IDENTITY } from "./CinemaGrid";
import { useI18n } from "@/lib/i18n";
import type { MainStageOnStageEntry } from "@/lib/api";

interface SpotlightGridProps {
  focusIdentity: string | null;
  nextAt: number | null;
  onTileClick?: (identity: string) => void;
  onStage?: MainStageOnStageEntry[];
  onTipCreator?: (userId: string, username: string | null) => void;
  onBookCreator?: (creator: { id: string; username: string; isCrystal: boolean }) => void;
}

function CountdownChip({ nextAt }: { nextAt: number | null }) {
  const t = useI18n().live;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (nextAt == null) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [nextAt]);

  if (nextAt == null) return null;
  const diff = Math.max(0, Math.floor((nextAt - now) / 1000));
  const label = diff <= 0
    ? t.mainStageCountdownRotating
    : (() => {
        const m = Math.floor(diff / 60);
        const s = String(diff % 60).padStart(2, "0");
        return t.mainStageCountdownNext(m, s);
      })();

  return (
    <div
      className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums pointer-events-none text-pnp-accent"
      style={{
        background: "rgba(0,0,0,0.65)",
        border: "1px solid rgba(212,0,122,0.35)",
        backdropFilter: "blur(8px)",
      }}
    >
      {label}
    </div>
  );
}

/**
 * Resolve the onStage entry for a LiveKit participant identity.
 * Matches on participantIdentity first (exact), falls back to userId match.
 */
function findCreatorEntry(
  identity: string,
  onStage: MainStageOnStageEntry[] | undefined,
): MainStageOnStageEntry | undefined {
  if (!onStage || onStage.length === 0) return undefined;
  return (
    onStage.find((e) => e.participantIdentity === identity) ??
    onStage.find((e) => e.userId === identity)
  );
}

/**
 * Strip tile for the Spotlight layout thumbnail row.
 * Requests VideoQuality.LOW to reduce decoder slot pressure.
 * Shows a crystal badge overlay for Crystal Creator cammers.
 */
function SpotlightStripTile({
  trackRef,
  onTileClick,
  creatorEntry,
  onTipCreator,
  onBookCreator,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  onTileClick?: (identity: string) => void;
  creatorEntry?: MainStageOnStageEntry;
  onTipCreator?: (userId: string, username: string | null) => void;
  onBookCreator?: (creator: { id: string; username: string; isCrystal: boolean }) => void;
}) {
  const t = useI18n().live;

  useEffect(() => {
    const pub = trackRef.publication as RemoteTrackPublication | undefined;
    if (!pub || !("setVideoQuality" in pub)) return;
    pub.setVideoQuality(VideoQuality.LOW);
  }, [trackRef.publication]);

  return (
    <button
      key={trackRef.participant.identity}
      type="button"
      aria-label={t.mainStageAriaFocusTile(trackRef.participant.identity)}
      onClick={onTileClick ? () => onTileClick(trackRef.participant.identity) : undefined}
      className="flex-shrink-0 rounded-xl overflow-hidden relative transition-all hover:scale-[1.04] active:scale-[0.97]"
      style={{
        width: "calc(16/9 * clamp(72px, 12vh, 120px))",
        height: "clamp(72px, 12vh, 120px)",
        minWidth: "calc(16/9 * 72px)",
        border: creatorEntry?.isCrystal
          ? "1.5px solid rgba(220,220,255,0.55)"
          : "1.5px solid rgba(255,255,255,0.12)",
        boxShadow: creatorEntry?.isCrystal
          ? "0 0 10px rgba(180,170,255,0.30)"
          : undefined,
        cursor: onTileClick ? "pointer" : "default",
      }}
    >
      <ParticipantTile trackRef={trackRef} style={{ width: "100%", height: "100%" }} />
      {/* Name + crystal badge scrim */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center px-1 pb-1 pt-3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)", pointerEvents: "none" }}
      >
        {creatorEntry?.isCrystal && (
          <span
            className="text-[8px] font-bold px-1 py-0.5 rounded-full"
            style={{
              background: "linear-gradient(135deg,rgba(15,15,20,0.90),rgba(35,30,55,0.90))",
              border: "1px solid rgba(220,220,255,0.55)",
              color: "#F0EDFF",
              letterSpacing: "0.3px",
            }}
          >
            ❖
          </span>
        )}
        <span
          className="text-white text-[9px] font-semibold truncate ml-1"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
        >
          {creatorEntry?.username
            ? `@${creatorEntry.username}`
            : (trackRef.participant.name || trackRef.participant.identity)}
        </span>
      </div>
      {/* Quick action buttons — tip/book overlaid in top-right corner */}
      {creatorEntry && (onTipCreator || (onBookCreator && creatorEntry.username)) && (
        <div
          className="absolute top-1 right-1 flex items-center gap-0.5"
          style={{ pointerEvents: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          {onBookCreator && creatorEntry.username && (
            <button
              type="button"
              onClick={() => onBookCreator({
                id: creatorEntry.userId,
                username: creatorEntry.username as string,
                isCrystal: creatorEntry.isCrystal,
              })}
              className="min-h-[22px] px-1.5 rounded-full text-[8px] font-bold text-white transition-all active:scale-95"
              style={{
                background: "rgba(10,10,15,0.80)",
                border: "1px solid rgba(255,255,255,0.25)",
                backdropFilter: "blur(6px)",
              }}
            >
              Book
            </button>
          )}
          {onTipCreator && (
            <button
              type="button"
              onClick={() => onTipCreator(creatorEntry.userId, creatorEntry.username)}
              className="min-h-[22px] px-1.5 rounded-full text-[8px] font-bold text-white transition-all active:scale-95"
              style={{
                background: "linear-gradient(135deg,#D4007A,#7B61FF)",
                boxShadow: "0 2px 6px rgba(212,0,122,0.45)",
              }}
            >
              💸
            </button>
          )}
        </div>
      )}
    </button>
  );
}

/**
 * Hero tile wrapper that requests VideoQuality.HIGH for the spotlighted participant.
 * Shows a creator info overlay (name, crystal badge, tip/book CTAs) at the bottom.
 */
function SpotlightHeroTile({
  trackRef,
  onTileClick,
  nextAt,
  creatorEntry,
  onTipCreator,
  onBookCreator,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  onTileClick?: (identity: string) => void;
  nextAt: number | null;
  creatorEntry?: MainStageOnStageEntry;
  onTipCreator?: (userId: string, username: string | null) => void;
  onBookCreator?: (creator: { id: string; username: string; isCrystal: boolean }) => void;
}) {
  useEffect(() => {
    const pub = trackRef.publication as RemoteTrackPublication | undefined;
    if (!pub || !("setVideoQuality" in pub)) return;
    pub.setVideoQuality(VideoQuality.HIGH);
  }, [trackRef.publication]);

  const displayName = creatorEntry?.username
    ? `@${creatorEntry.username}`
    : (trackRef.participant.name || trackRef.participant.identity);

  return (
    <div
      className={`absolute inset-0${onTileClick ? " cursor-pointer" : ""}`}
      onClick={onTileClick ? () => onTileClick(trackRef.participant.identity) : undefined}
    >
      <ParticipantTile trackRef={trackRef} style={{ width: "100%", height: "100%" }} />
      <CountdownChip nextAt={nextAt} />

      {/* Creator info overlay — gradient scrim + name/badge + action buttons */}
      {creatorEntry && (
        <div
          className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 pb-3 pt-12"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 60%, transparent 100%)",
            pointerEvents: "none",
          }}
        >
          {/* Left: badge + name */}
          <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
            {creatorEntry.isCrystal && (
              <span
                className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[9px] font-bold"
                style={{
                  background: "linear-gradient(135deg,rgba(15,15,20,0.92),rgba(35,30,55,0.92))",
                  border: "1px solid rgba(220,220,255,0.55)",
                  color: "#F0EDFF",
                  boxShadow: "0 0 8px rgba(180,170,255,0.25)",
                }}
              >
                <span aria-hidden>❖</span>
                Crystal Creator
              </span>
            )}
            <p
              className="text-white font-bold text-sm truncate"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
            >
              {displayName}
            </p>
          </div>

          {/* Right: action buttons */}
          {(onTipCreator || (onBookCreator && creatorEntry.username)) && (
            <div
              className="flex items-center gap-1.5 flex-shrink-0"
              style={{ pointerEvents: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              {onBookCreator && creatorEntry.username && (
                <button
                  type="button"
                  onClick={() => onBookCreator({
                    id: creatorEntry.userId,
                    username: creatorEntry.username as string,
                    isCrystal: creatorEntry.isCrystal,
                  })}
                  className="min-h-[36px] px-3 rounded-full text-[11px] font-bold text-white transition-all active:scale-95"
                  style={{
                    background: "rgba(20,20,30,0.88)",
                    border: "1px solid rgba(255,255,255,0.28)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  Book
                </button>
              )}
              {onTipCreator && (
                <button
                  type="button"
                  onClick={() => onTipCreator(creatorEntry.userId, creatorEntry.username)}
                  className="min-h-[36px] px-3 rounded-full text-[11px] font-bold text-white transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg,#D4007A,#7B61FF)",
                    boxShadow: "0 4px 12px rgba(212,0,122,0.45)",
                  }}
                >
                  💸 Tip
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* For non-known participants still show a minimal name bar */}
      {!creatorEntry && (
        <div
          className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-8"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)",
            pointerEvents: "none",
          }}
        >
          <p
            className="text-white font-semibold text-sm truncate"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
          >
            {trackRef.participant.name || trackRef.participant.identity}
          </p>
        </div>
      )}
    </div>
  );
}

export function SpotlightGrid({
  focusIdentity,
  nextAt,
  onTileClick,
  onStage,
  onTipCreator,
  onBookCreator,
}: SpotlightGridProps) {
  const t = useI18n().live;
  const allTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  // The URL-ingress media bot publishes a Camera track too; never let it
  // appear as a spotlight or strip tile.
  const tracks = allTracks.filter((track) => track.participant.identity !== MEDIA_IDENTITY);

  const heroTrack: TrackReferenceOrPlaceholder | undefined = focusIdentity
    ? tracks.find((track) => track.participant.identity === focusIdentity) ?? tracks[0]
    : tracks[0];

  const stripTracks = heroTrack
    ? tracks.filter((track) => track.participant.identity !== heroTrack.participant.identity)
    : tracks;

  // Empty state
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse bg-pnp-accent/10">
          <svg className="w-8 h-8 text-pnp-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{t.mainStageStageQuiet}</p>
          <p className="text-white/50 text-xs mt-1">
            {t.mainStageStageQuietHint}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-pnp-background">
      {/* Hero — requests HIGH quality for the spotlighted participant */}
      <div className="relative flex-1 min-h-0">
        {heroTrack && (
          <SpotlightHeroTile
            trackRef={heroTrack}
            onTileClick={onTileClick}
            nextAt={nextAt}
            creatorEntry={findCreatorEntry(heroTrack.participant.identity, onStage)}
            onTipCreator={onTipCreator}
            onBookCreator={onBookCreator}
          />
        )}
      </div>

      {/* Strip — requests LOW quality to reduce decoder pressure */}
      {stripTracks.length > 0 && (
        <div
          className="flex-shrink-0 flex gap-1.5 overflow-x-auto no-scrollbar"
          style={{
            height: "clamp(80px, 14vh, 140px)",
            padding: "6px 8px",
            background: "rgba(0,0,0,0.6)",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {stripTracks.map((track) => (
            <SpotlightStripTile
              key={track.participant.identity}
              trackRef={track}
              onTileClick={onTileClick}
              creatorEntry={findCreatorEntry(track.participant.identity, onStage)}
              onTipCreator={onTipCreator}
              onBookCreator={onBookCreator}
            />
          ))}
        </div>
      )}
    </div>
  );
}
