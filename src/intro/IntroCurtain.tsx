/**
 * The intro curtain: title card cutting to a legal disclaimer card.
 *
 * A pure function of authored time `T` — no internal state, no timers. Both
 * cards stay mounted for the whole piece and cross-fade around the Disclaimer
 * cue, so the transition is interpolation rather than a mount swap. Every
 * literal here (px, hex, letter-spacings) is the prototype's value.
 */

import { animate, Easing, fade } from './easing';
import {
  COPYRIGHT_LINE,
  DEFAULTS,
  DISCLAIMER_BADGE,
  DISCLAIMER_CLAUSES,
  DISCLAIMER_HEADING,
  LEGAL_ENTITY,
  type Clause,
} from './content';
import { COLORS, FONT_BODY, FONT_DISPLAY } from './theme';
import type { Orientation } from './orientation';

export interface IntroCurtainProps {
  /** Authored time in seconds. */
  T: number;
  /** Authored start of the Disclaimer scene. */
  disclaimerCue: number;
  orientation: Orientation;
  channel?: string;
  title?: string;
  performers?: string;
  /** URL for the logo lockup. */
  logoSrc: string;
  /** Rendered when set; omit for renders, where nothing can be clicked. */
  onSkip?: () => void;
  clauses?: Clause[];
}

export function IntroCurtain({
  T,
  disclaimerCue: d,
  orientation,
  channel = DEFAULTS.channel,
  title = DEFAULTS.title,
  performers = DEFAULTS.performers,
  logoSrc,
  onSkip,
  clauses = DISCLAIMER_CLAUSES,
}: IntroCurtainProps) {
  const isPortrait = orientation === 'portrait';

  // ── Title card choreography ───────────────────────────────────────────────
  const titleOp = fade(T, 0.1, 0.9, d - 0.7, d + 0.1);
  const eyebrowOp = fade(T, 0.05, 0.5, d - 0.9, d - 0.3);
  const logoProg = animate({
    from: 0,
    to: 1,
    start: 0.25,
    end: 1.1,
    ease: Easing.easeOutBack,
  })(T);
  const lineW = animate({
    from: 0,
    to: 88,
    start: 1.15,
    end: 1.7,
    ease: Easing.easeOutCubic,
  })(T);
  const titleTextOp = fade(T, 1.6, 2.3, d - 0.7, d + 0.05);
  const titleTextY = animate({ from: 16, to: 0, start: 1.6, end: 2.3 })(T);
  const performersOp = fade(T, 2.1, 2.8, d - 0.7, d + 0.05);
  const performersY = animate({ from: 14, to: 0, start: 2.1, end: 2.8 })(T);

  // ── Disclaimer card choreography ──────────────────────────────────────────
  const discOp = fade(T, d - 0.4, d + 0.5);
  const discY = animate({
    from: 28,
    to: 0,
    start: d - 0.4,
    end: d + 0.6,
    ease: Easing.easeOutCubic,
  })(T);

  const skipOp = fade(T, 0.3, 1);

  // Slow ambient drift of the two background glows.
  const glowX = Math.sin(T * 0.25) * 60;
  const glowY = Math.cos(T * 0.2) * 40;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        overflow: 'hidden',
        fontFamily: FONT_BODY,
        color: COLORS.text,
      }}
    >
      {/* Ambient magenta glow, drifting */}
      <div
        style={{
          position: 'absolute',
          left: `calc(50% - 500px + ${glowX}px)`,
          top: `calc(20% + ${glowY}px)`,
          width: 900,
          height: 900,
          borderRadius: '50%',
          background:
            'radial-gradient(circle,rgba(212,0,122,0.16),transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      {/* Ambient lemon glow, drifting counter to the magenta one */}
      <div
        style={{
          position: 'absolute',
          right: `calc(10% - ${glowX}px)`,
          bottom: `calc(8% - ${glowY}px)`,
          width: 800,
          height: 800,
          borderRadius: '50%',
          background:
            'radial-gradient(circle,rgba(251,255,0,0.08),transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      {/* Scanline texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px)',
          pointerEvents: 'none',
        }}
      />

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          style={{
            position: 'absolute',
            top: 48,
            right: 48,
            // Above both cards. Without this the title card — a full-frame
            // overlay that comes later in DOM order — swallows the click.
            zIndex: 10,
            opacity: skipOp,
            padding: '12px 26px',
            borderRadius: 999,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.skipBg,
            color: COLORS.textMuted,
            fontFamily: FONT_BODY,
            fontSize: 16,
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          SKIP &gt;
        </button>
      )}

      {/* ── Title card ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: titleOp,
          gap: 22,
          // Pure display; never a click target.
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            opacity: eyebrowOp,
            fontSize: 18,
            letterSpacing: '0.35em',
            color: COLORS.magenta,
            fontWeight: 600,
          }}
        >
          {channel}
        </div>

        <img
          src={logoSrc}
          alt="PNPtv!"
          style={{
            width: isPortrait ? 190 : 280,
            transform: `scale(${0.8 + 0.2 * logoProg}) translateY(${
              (1 - logoProg) * 24
            }px)`,
            opacity: logoProg,
          }}
        />

        <div
          style={{
            width: lineW,
            height: 3,
            background: `linear-gradient(90deg,${COLORS.magenta},${COLORS.lemon})`,
            borderRadius: 2,
          }}
        />

        <div
          style={{
            opacity: titleTextOp,
            transform: `translateY(${titleTextY}px)`,
            fontFamily: FONT_DISPLAY,
            fontSize: isPortrait ? 40 : 60,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            textAlign: 'center',
            maxWidth: isPortrait ? 820 : 1200,
            padding: isPortrait ? '0 40px' : 0,
          }}
        >
          {title}
        </div>

        <div
          style={{
            opacity: performersOp,
            transform: `translateY(${performersY}px)`,
            fontSize: isPortrait ? 19 : 24,
            letterSpacing: '0.08em',
            color: COLORS.lemon,
            textTransform: 'uppercase',
            textAlign: 'center',
            padding: isPortrait ? '0 40px' : 0,
          }}
        >
          {performers}
        </div>
      </div>

      {/* ── Disclaimer card ────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: discOp,
          transform: `translateY(${discY}px)`,
          padding: isPortrait ? '0 32px' : '0 80px',
          // The title card owns pointer events until the disclaimer is up.
          pointerEvents: discOp > 0.5 ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: isPortrait ? 920 : 1560,
            maxHeight: '92%',
            overflowY: 'auto',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: isPortrait ? '30px 28px' : '44px 56px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: isPortrait ? 20 : 28,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: isPortrait ? 22 : 30,
                letterSpacing: '0.06em',
                color: COLORS.text,
              }}
            >
              {DISCLAIMER_HEADING}
            </div>
            <div
              style={{
                background: COLORS.lemon,
                color: COLORS.bg,
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: '0.06em',
                padding: '4px 12px',
                borderRadius: 6,
              }}
            >
              {DISCLAIMER_BADGE}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isPortrait ? '1fr' : '1fr 1fr',
              columnGap: 48,
              rowGap: isPortrait ? 16 : 22,
            }}
          >
            {clauses.map((c) => (
              <div key={c.n} style={{ display: 'flex', gap: 14 }}>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    color: COLORS.magenta,
                    fontSize: 15,
                    paddingTop: 2,
                  }}
                >
                  {c.n}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      letterSpacing: '0.08em',
                      color: COLORS.amber,
                      marginBottom: 4,
                      fontWeight: 700,
                    }}
                  >
                    {c.t}
                  </div>
                  <div
                    style={{
                      fontSize: isPortrait ? 14 : 15,
                      lineHeight: 1.5,
                      color: COLORS.textMuted,
                    }}
                  >
                    {c.b}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: isPortrait ? 20 : 30,
              paddingTop: 18,
              borderTop: `1px solid ${COLORS.border}`,
              display: 'flex',
              flexDirection: isPortrait ? 'column' : 'row',
              gap: isPortrait ? 6 : 0,
              justifyContent: 'space-between',
              fontSize: 13,
              color: COLORS.textFaint,
              letterSpacing: '0.04em',
            }}
          >
            <span>{LEGAL_ENTITY}</span>
            <span>{COPYRIGHT_LINE}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
