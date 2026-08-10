/**
 * Preview harness.
 *
 * Stands in for the design tool's Tweaks panel: the same four editable fields,
 * plus a scrub bar so the choreography can be inspected frame by frame. None of
 * this ships with the intro — IntroPlayer is the deliverable.
 */

import { useState } from 'react';
import { IntroPlayer } from '../intro';
import { DEFAULTS, INTRO_SCENES } from '../intro/content';
import { deriveTimeline } from '../intro/timeline';
import type { OrientationInput } from '../intro/orientation';
import { COLORS } from '../intro/theme';

const DURATION = deriveTimeline(INTRO_SCENES).total;

const panel: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 320,
  padding: '20px 20px 24px',
  boxSizing: 'border-box',
  background: '#171717',
  borderLeft: `1px solid ${COLORS.border}`,
  overflowY: 'auto',
  fontFamily: "'Roboto Mono',monospace",
  fontSize: 12,
  color: COLORS.textMuted,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  background: '#0F0F0F',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  color: '#fff',
  fontFamily: "'Roboto Mono',monospace",
  fontSize: 12,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  letterSpacing: '0.08em',
  color: COLORS.textFaint,
  textTransform: 'uppercase',
};

export function DemoHarness() {
  const [channel, setChannel] = useState<string>(DEFAULTS.channel);
  const [title, setTitle] = useState<string>(DEFAULTS.title);
  const [performers, setPerformers] = useState<string>(DEFAULTS.performers);
  const [orientation, setOrientation] = useState<OrientationInput>('landscape');
  const [videoWidth, setVideoWidth] = useState(1920);
  const [videoHeight, setVideoHeight] = useState(1080);
  const [runKey, setRunKey] = useState(0);
  const [completed, setCompleted] = useState(false);

  const replay = () => {
    setCompleted(false);
    setRunKey((k) => k + 1);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0A0A0A' }}>
      <div style={{ position: 'absolute', inset: 0, right: 320 }}>
        <IntroPlayer
          key={runKey}
          channel={channel}
          title={title}
          performers={performers}
          orientation={orientation}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          onComplete={() => setCompleted(true)}
        />
      </div>

      <div style={panel}>
        <div
          style={{
            fontSize: 13,
            color: '#fff',
            letterSpacing: '0.1em',
            paddingBottom: 14,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          INTRO CURTAIN
        </div>

        <div>
          <label style={labelStyle} htmlFor="channel">
            Channel
          </label>
          <input
            id="channel"
            style={inputStyle}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="title">
            Title
          </label>
          <input
            id="title"
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="performers">
            Performers
          </label>
          <input
            id="performers"
            style={inputStyle}
            value={performers}
            onChange={(e) => setPerformers(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="orientation">
            Orientation
          </label>
          <select
            id="orientation"
            style={inputStyle}
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as OrientationInput)}
          >
            <option value="auto">auto (from video size)</option>
            <option value="landscape">landscape — 1920×1080</option>
            <option value="portrait">portrait — 1080×1920</option>
          </select>
        </div>

        {orientation === 'auto' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="vw">
                Video W
              </label>
              <input
                id="vw"
                type="number"
                style={inputStyle}
                value={videoWidth}
                onChange={(e) => setVideoWidth(Number(e.target.value))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="vh">
                Video H
              </label>
              <input
                id="vh"
                type="number"
                style={inputStyle}
                value={videoHeight}
                onChange={(e) => setVideoHeight(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={replay}
          style={{
            ...inputStyle,
            cursor: 'pointer',
            background: COLORS.magenta,
            borderColor: COLORS.magenta,
            letterSpacing: '0.08em',
          }}
        >
          REPLAY
        </button>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 14,
            borderTop: `1px solid ${COLORS.border}`,
            lineHeight: 1.7,
            color: COLORS.textFaint,
          }}
        >
          <div>
            Duration <span style={{ color: '#fff' }}>{DURATION}s</span> — Title 7s,
            Disclaimer 9s
          </div>
          <div>
            onComplete{' '}
            <span style={{ color: completed ? COLORS.lemon : COLORS.textFaint }}>
              {completed ? 'fired' : 'pending'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
