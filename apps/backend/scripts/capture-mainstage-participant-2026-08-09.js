#!/usr/bin/env node
'use strict';

/**
 * Capture N seconds of one participant's video+audio from a LiveKit room and
 * mux to MP4 (H.264 + AAC). Uses @livekit/rtc-node as a hidden subscriber.
 *
 *   docker exec pnptv-bot node /app/apps/backend/scripts/capture-mainstage-participant-2026-08-09.js
 *
 * Env overrides: CAPTURE_ROOM, CAPTURE_IDENTITY, CAPTURE_MS, CAPTURE_OUTPUT.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const BACKEND = path.resolve(__dirname, '..');
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env') }); } catch {}
try { require('dotenv').config({ path: path.join(BACKEND, '../../.env.production'), override: true }); } catch {}

const { AccessToken } = require('livekit-server-sdk');
const {
  Room, RoomEvent, TrackKind, VideoStream, AudioStream,
} = require('@livekit/rtc-node');

const ROOM      = process.env.CAPTURE_ROOM || 'main-stage-prime';
const IDENTITY  = process.env.CAPTURE_IDENTITY || '8599671840';
const DUR_MS    = Number(process.env.CAPTURE_MS || 5000);
const OUTPUT    = process.env.CAPTURE_OUTPUT || `/tmp/mainstage-${IDENTITY}-${Date.now()}.mp4`;
const SR        = 48000;
const CH        = 1;

async function main() {
  const wsUrl = process.env.LIVEKIT_WS_URL || 'wss://livekit.pnptv.app';
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('LIVEKIT_API_KEY/SECRET missing');

  const at = new AccessToken(apiKey, apiSecret, {
    identity: `clip-recorder-${Date.now()}`,
    name: 'Clip Recorder',
    ttl: 300,
  });
  at.addGrant({
    roomJoin: true, room: ROOM,
    canSubscribe: true, canPublish: false, canPublishData: false,
    hidden: true, recorder: true,
  });
  const token = await at.toJwt();

  const room = new Room();
  console.log(`[capture] connecting ws=${wsUrl} room=${ROOM} target=${IDENTITY}`);
  await room.connect(wsUrl, token, { autoSubscribe: true, dynacast: false });
  console.log('[capture] connected. remote participants:', [...room.remoteParticipants.keys()].join(','));

  const REQUIRE_AUDIO = process.env.CAPTURE_REQUIRE_AUDIO === '1';
  const AUDIO_WAIT_MS = Number(process.env.CAPTURE_AUDIO_WAIT_MS || 3000);
  let videoTrack = null, audioTrack = null;

  const scan = () => {
    for (const [, p] of room.remoteParticipants) {
      if (p.identity !== IDENTITY) continue;
      for (const [, pub] of p.trackPublications) {
        if (!pub.track) continue;
        if (pub.kind === TrackKind.KIND_VIDEO && !videoTrack) videoTrack = pub.track;
        if (pub.kind === TrackKind.KIND_AUDIO && !audioTrack) audioTrack = pub.track;
      }
    }
  };

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No video track from target within 15s')), 15000);
    const check = () => { if (videoTrack) { clearTimeout(timeout); resolve(); } };
    scan(); check();
    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (participant.identity !== IDENTITY) return;
      if (track.kind === TrackKind.KIND_VIDEO && !videoTrack) { videoTrack = track; console.log('[capture] video track ready'); }
      if (track.kind === TrackKind.KIND_AUDIO && !audioTrack) { audioTrack = track; console.log('[capture] audio track ready'); }
      check();
    });
  });

  // Optional short wait for audio (best effort)
  if (!audioTrack) {
    console.log(`[capture] audio not present, waiting ${AUDIO_WAIT_MS}ms best-effort...`);
    await new Promise(r => setTimeout(r, AUDIO_WAIT_MS));
    scan();
  }
  if (!audioTrack) {
    if (REQUIRE_AUDIO) throw new Error('Audio required but target has no audio track');
    console.log('[capture] no audio track — will encode video-only');
  }

  const videoRaw = `/tmp/vid-${Date.now()}.yuv`;
  const audioRaw = audioTrack ? `/tmp/aud-${Date.now()}.s16le` : null;
  const vFd = fs.openSync(videoRaw, 'w');
  const aFd = audioRaw ? fs.openSync(audioRaw, 'w') : null;

  let width = 0, height = 0;
  let vFrames = 0;
  const started = Date.now();

  const vs = new VideoStream(videoTrack);
  const as = audioTrack ? new AudioStream(audioTrack, SR, CH) : null;

  const vLoop = (async () => {
    for await (const item of vs) {
      const frame = item.frame || item;
      if (!width) {
        width = frame.width; height = frame.height;
        console.log(`[capture] first video frame ${width}x${height}`);
      }
      const src = frame.data;
      const buf = Buffer.from(src.buffer, src.byteOffset, src.byteLength);
      fs.writeSync(vFd, buf);
      vFrames++;
      if (Date.now() - started >= DUR_MS) break;
    }
  })();

  const aLoop = as ? (async () => {
    for await (const item of as) {
      const frame = item.frame || item;
      const src = frame.data;
      const buf = Buffer.from(src.buffer, src.byteOffset, src.byteLength);
      fs.writeSync(aFd, buf);
      if (Date.now() - started >= DUR_MS) break;
    }
  })() : Promise.resolve();

  await Promise.race([
    Promise.all([vLoop, aLoop]),
    new Promise(r => setTimeout(r, DUR_MS + 2000)),
  ]);

  try { await vs.close(); } catch {}
  if (as) try { await as.close(); } catch {}
  fs.closeSync(vFd);
  if (aFd) fs.closeSync(aFd);
  try { await room.disconnect(); } catch {}

  const elapsedMs = Date.now() - started;
  if (!width || !vFrames) throw new Error(`No video captured (frames=${vFrames})`);

  const detectedFps = Math.max(10, Math.min(60, Math.round((vFrames / (elapsedMs / 1000)))));
  console.log(`[capture] frames=${vFrames} elapsed=${elapsedMs}ms → fps=${detectedFps} → muxing`);

  const ffArgs = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${width}x${height}`, '-r', String(detectedFps),
    '-i', videoRaw,
  ];
  if (audioRaw) {
    ffArgs.push('-f', 's16le', '-ar', String(SR), '-ac', String(CH), '-i', audioRaw);
  }
  ffArgs.push(
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-profile:v', 'main',
  );
  if (audioRaw) ffArgs.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  ffArgs.push('-movflags', '+faststart', OUTPUT);

  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ffArgs, { stdio: 'inherit' });
    ff.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    ff.on('error', reject);
  });

  fs.unlinkSync(videoRaw);
  if (audioRaw) fs.unlinkSync(audioRaw);
  const st = fs.statSync(OUTPUT);
  console.log(`[capture] DONE ${OUTPUT} (${(st.size / 1024).toFixed(1)} KB)`);
  process.exit(0);
}

main().catch(e => { console.error('[capture] FATAL', e); process.exit(1); });
