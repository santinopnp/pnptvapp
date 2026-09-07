import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ControlBar,
} from "@livekit/components-react";
import "@livekit/components-styles";

interface TokenResponse {
  token: string;
  livekitUrl: string;
  roomName: string;
  isModerator: boolean;
  durationMinutes: number;
}

/**
 * Private Crystal Service call room (private_call / private_main_stage).
 * Fetches a JIT token from the backend on mount, then hands off to LiveKit.
 * Both parties (creator + buyer) hit this page from the fulfillment DM.
 *
 * Access is server-gated by the token endpoint — page just needs a booking
 * id. Renders a friendly error if the caller isn't a booking participant,
 * the booking is expired/cancelled, or LiveKit isn't configured.
 */
export default function PrivateCall() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [tokenInfo, setTokenInfo] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    setLoading(true);
    fetch(`/api/creator/services/bookings/${encodeURIComponent(bookingId)}/livekit-token`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const errCode = (body as { error?: string }).error || `HTTP ${r.status}`;
          throw new Error(errCode);
        }
        return body as TokenResponse;
      })
      .then((info) => setTokenInfo(info))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "#0a0612" }}>
        <p className="text-sm" style={{ color: "#d8b9ff" }}>Preparing your private room…</p>
      </div>
    );
  }

  if (error || !tokenInfo) {
    const friendly = error === "not_a_participant"
      ? "This private call isn't yours to join."
      : error === "booking_not_found"
        ? "Booking not found."
        : error === "booking_not_active"
          ? "This booking is no longer active."
          : error === "not_a_livekit_booking"
            ? "This booking doesn't have a call room."
            : "Couldn't connect to the room.";
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "#0a0612" }}>
        <p className="text-lg font-bold text-white">◈ Private call</p>
        <p className="text-sm" style={{ color: "rgba(245,240,255,0.7)" }}>{friendly}</p>
        <Link
          to="/"
          className="mt-2 min-h-[44px] px-6 rounded-2xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #b8f5ff, #d4bfff)", color: "#1a1a2e" }}
        >
          Back to PNPtv
        </Link>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "#0a0612" }}>
        <p className="text-lg font-bold text-white">Call ended</p>
        <Link
          to="/"
          className="mt-2 min-h-[44px] px-6 rounded-2xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #b8f5ff, #d4bfff)", color: "#1a1a2e" }}
        >
          Back to PNPtv
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: "#0a0612" }} data-lk-theme="default">
      <LiveKitRoom
        token={tokenInfo.token}
        serverUrl={tokenInfo.livekitUrl}
        connect
        audio
        video
        onDisconnected={() => setEnded(true)}
        style={{ height: "100dvh" }}
      >
        <VideoConference />
        <RoomAudioRenderer />
        <ControlBar variation="minimal" />
      </LiveKitRoom>
    </div>
  );
}
