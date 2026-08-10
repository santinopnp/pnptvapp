# PNPtv! Intro Curtain — implementation

Production implementation of the design in `project/PNPtv Intro Curtain.dc.html`.

The intro is a 16-second curtain: a 7-second title card (channel eyebrow, logo lockup, gradient rule, title, performer credits) cutting to a 9-second legal disclaimer card, with a Skip affordance throughout. Channel, title and performers are props; the canvas is 1920×1080 or 1080×1920 depending on the source video's shape.

```
src/intro/          the deliverable — a React component with no app dependencies
render/             headless renderer + the prepend step for the upload flow
test/               timing and orientation tests (Node's test runner, no deps)
src/demo/           preview harness; not part of the deliverable
project/            the original design bundle, untouched
```

## Quick start

```bash
npm install
npm run dev        # preview harness at http://127.0.0.1:5173
npm run verify     # typecheck + tests + build
```

Render a clip:

```bash
npm run build
node render/render-intro.mjs \
  --channel "PNPTV! PRESENTS" \
  --title "Midnight Sessions" \
  --performers "Alex Vale  •  Rio Sun" \
  --video-width 1080 --video-height 1920 \
  --out out/intro
```

## Using the component

```tsx
import { IntroPlayer } from './src/intro';

<IntroPlayer
  channel="PNPTV! PRESENTS"
  title="Midnight Sessions"
  performers="Alex Vale  •  Rio Sun"
  videoWidth={1080}
  videoHeight={1920}       // taller than wide -> portrait canvas
  onComplete={() => startPlayback()}
/>
```

`IntroPlayer` fills its nearest positioned ancestor and letterboxes the fixed canvas to fit, so it works as an overlay on a `<video>` of any size. Props:

| Prop | Default | Notes |
|---|---|---|
| `channel` / `title` / `performers` | design placeholders | Burned into the title card |
| `orientation` | `'auto'` | `'auto' \| 'landscape' \| 'portrait'` |
| `videoWidth` / `videoHeight` | — | Source dimensions, used when `orientation` is `'auto'` |
| `logoSrc` | `assets/pnptv-logo2.png` | The transparent lockup |
| `scenes` | Title 7s + Disclaimer 9s | Retimes all choreography — see below |
| `mode` | `'auto'` | `'auto'` runs a rAF clock; `'manual'` only moves on `seek()` |
| `showSkip` | `true` in auto mode | |
| `onComplete` | — | Fires at the end, or on Skip |
| `scaling` | `'fit'` | `'exact'` renders 1:1 for pixel-exact capture |

Lower-level pieces are exported too: `IntroCurtain` (pure function of authored time, no clock), `useIntroClock`, `deriveTimeline`, `resolveOrientation`, and the easing kit.

## How time works

The whole piece is one element tree rendered as a pure function of a single authored clock `T`. Nothing mounts or unmounts at the scene boundary — the title card and the disclaimer card are both always present and cross-fade around the cue, which is why the transition is a dissolve rather than a swap.

`scenes` is the outline and the only source of the cue table:

```ts
[{ name: 'Title', dur: 7 }, { name: 'Disclaimer', dur: 9 }]
//                                     ^ CUES.Disclaimer === 7
```

Every animation is keyed to `CUES.Disclaimer`, so changing `dur` on the Title scene moves the entire disclaimer choreography with it. A scene may also carry `nat` (its authored length) separately from `dur` (its playback length); when they differ the same authored slice replays over the new playback length, so choreography retimes instead of getting cut off. `test/timeline.test.ts` pins this behaviour.

To change the pacing, edit `INTRO_SCENES` in `src/intro/content.ts`. The legal copy lives in the same file as `DISCLAIMER_CLAUSES`.

## Rendering

`render/render-intro.mjs` opens the built page with `?render=1`, which mounts the intro on a **manual** clock at 1:1 scale with no chrome. The renderer then seeks to an exact timestamp per frame and screenshots the canvas. Nothing depends on real-time playback, so output is deterministic regardless of machine speed.

| Flag | Default | |
|---|---|---|
| `--channel` `--title` `--performers` | empty | Falls back to the design placeholders |
| `--orientation` | `auto` | `auto \| landscape \| portrait` |
| `--video-width` `--video-height` | — | Used when `auto` |
| `--fps` | `30` | |
| `--out` | `out/intro` | |
| `--format` | `auto` | `auto \| mp4 \| webm \| frames` |
| `--keep-frames` | off | |
| `--ffmpeg` | — | Override the encoder binary |

It writes `intro.<ext>` and an `intro.json` manifest. When it cannot produce an mp4 it also writes a `mux.sh` with the exact command to run elsewhere, and keeps the frame sequence, since that script needs it.

A full 16s render at 1920×1080/30fps (481 frames) takes about **95 seconds** in this container. Budget accordingly — see the scaling notes below.

### Encoder availability

The renderer probes for an encoder **before** capturing, because the frame format has to follow it:

- **A full `ffmpeg`** (H.264 + `image2` + PNG decoder) → lossless PNG sequence → H.264 mp4. This is the production path.
- **Playwright's bundled ffmpeg** → VP8/WebM only, with no PNG decoder and no `image2` demuxer, so frames are captured as JPEG q96 and piped through `image2pipe`. Preview-grade; fine for checking choreography, not for masters.
- **Neither** → PNG sequence plus `mux.sh`.

This container has no system ffmpeg and cannot install one (apt repos are outside the network allowlist), so renders here produce **VP8 WebM**. On a host with a real ffmpeg the same command produces mp4 with no changes.

## Wiring it into the upload flow

This is the part the design chat deferred to engineering. On upload:

1. **Probe the upload** for its dimensions — the intro needs them to pick a canvas.

   ```bash
   ffprobe -v error -select_streams v:0 \
     -show_entries stream=width,height -of csv=p=0 upload.mp4
   ```

2. **Render the intro** with that upload's metadata. One render per upload; roughly 480 frames at 30fps.

   ```bash
   node render/render-intro.mjs \
     --channel "$CHANNEL_NAME" \
     --title "$VIDEO_TITLE" \
     --performers "$(join_performers)" \
     --video-width "$W" --video-height "$H" \
     --fps 30 --format mp4 --out "work/$UPLOAD_ID"
   ```

3. **Prepend it** to the upload:

   ```bash
   render/prepend-intro.sh upload.mp4 "work/$UPLOAD_ID/intro.mp4" published.mp4
   ```

   `prepend-intro.sh` re-encodes rather than stream-copying, and scales/pads the intro to the source's exact frame, framerate and pixel format, synthesising a silent audio track when the source has audio. The concat demuxer's stream-copy path produces broken output whenever the two inputs differ in any of those, which for arbitrary uploads is almost always.

4. **Publish** `published.mp4`.

Practical notes for running this at scale:

- Step 2 is the expensive one — a browser launch plus ~480 screenshots, ~95s per clip here. Keep a warm browser and reuse it across renders rather than launching per job; `captureFrames()` is the function to lift out. Since only the three text fields vary between uploads, the frames of the *disclaimer* scene are identical across every render of a given orientation — caching those and re-rendering only the title scene cuts the work by more than half.
- Steps 2–3 belong in a job queue, not in the HTTP request that accepts the upload.
- Titles are drawn at a fixed size and wrap; very long titles will wrap to several lines. Cap title length at the upload form, or add an auto-fit step, if that matters to you.
- The intro is silent. If you want a sting, add it in step 3 instead of synthesising silence.

Alternatively, skip burning-in entirely: mount `IntroPlayer` over the player in the web app and call `onComplete` to start playback. That costs no render time and keeps the intro editable after publish, but only covers your own player — a downloaded or embedded file won't carry it.

## Fonts

The display face (Ethnocentric) loads from a third-party CDN that this environment blocks, so renders here fall back to Roboto Mono. See **[FONTS.md](FONTS.md)** — the fix is a licensed `woff2` at `public/fonts/ethnocentric.woff2`, no code change.

## Fidelity notes

Every dimension, colour, letter-spacing and timing constant is the prototype's literal value. Two deliberate departures:

- **`pointerEvents` on the disclaimer wrapper.** The prototype's disclaimer overlay covers the whole frame from the first frame at zero opacity, which would swallow clicks on the Skip button. It is gated on opacity here.
- **`onSkip` is optional.** The prototype always rendered the Skip button; renders pass no handler, so no button is drawn into an exported video where nothing can be clicked.

The design tool's own chrome — the playback bar, the Tweaks panel, `CompositionStage`, the `x-import`/`DCLogic` scaffolding, and the video-export protocol in `animations-v3.jsx` — is prototyping apparatus, not part of the intro, and is not reproduced. The preview harness in `src/demo/` covers the same job for development.

One content observation, not a change: nine seconds is a short window for six dense legal clauses. The user chose that length explicitly in the design chat, so it is preserved. If the disclaimer needs to be genuinely readable, raise the Disclaimer `dur` in `INTRO_SCENES` — nothing else needs to change.
