#!/usr/bin/env node
'use strict';

/**
 * One-shot carousel generator for the 2026-08-03 Lex+Santino live announcement.
 * Produces 7 square (1080x1080) PNGs in public/uploads/announcements/,
 * following the PNPtv! flat design system (no gradients, no glow, no shadow).
 * Typography-only; no external image assets required aside from the PNPtv logo.
 *
 * Usage:
 *   docker exec pnptv-bot node /app/apps/backend/scripts/generate-lex-santino-carousel-2026-08-01.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '../../../public/uploads/announcements');
const LOGO_PATH = path.join(__dirname, '../../../public/logo.png');
const SIZE = 1080;

// PNPtv! brand palette (from packages/ui-kit/src/theme.ts)
const PALETTE = {
  bg: '#121212',
  surface: '#1E1E1E',
  accent: '#D4007A',
  purple: '#7B61FF',
  lemon: '#FBFF00',
  white: '#FFFFFF',
  textDim: '#A1A1A3',
};

// Bilingual slide config. Spanish slides use existing filenames (unchanged);
// English variants get an `en-` prefix so the two carousels can coexist.
const SLIDES_ES = [
  {
    file: '01-hook.png',
    bg: PALETTE.accent,
    fg: PALETTE.white,
    kicker: 'EVENTO EN VIVO',
    title: 'Videollamada con\nLex + Santino',
    sub: 'Fundadores de PNPtv',
    footer: 'Lunes 3 de agosto · 10:00 AM COL',
  },
  {
    file: '02-why-now.png',
    bg: PALETTE.bg,
    fg: PALETTE.white,
    kicker: null,
    title: 'Es hora de\ndejar de ser\ninvisibles.',
    sub: null,
    footer: null,
  },
  {
    file: '03-formacion.png',
    bg: PALETTE.purple,
    fg: PALETTE.white,
    kicker: 'PILAR 01',
    title: 'Formación\nintegral',
    sub: 'para las y los profesionales\ndel entorno.',
    footer: null,
  },
  {
    file: '04-bienestar.png',
    bg: PALETTE.accent,
    fg: PALETTE.white,
    kicker: 'PILAR 02',
    title: 'Bienestar\nreal',
    sub: 'Planificación financiera\ny salud mental.',
    footer: null,
  },
  {
    file: '05-comunidad.png',
    bg: PALETTE.bg,
    fg: PALETTE.white,
    kicker: 'PILAR 03',
    title: 'Comunidad\nactiva y humana',
    sub: 'Espacios liderados por ustedes\npara dignificar el trabajo.',
    footer: null,
  },
  {
    file: '06-ciencia.png',
    bg: PALETTE.purple,
    fg: PALETTE.white,
    kicker: 'PILAR 04',
    title: 'Ciencia sin\nprejuicios',
    sub: 'Datos reales sobre consumo\ny tecnología con propósito.',
    footer: null,
  },
  {
    file: '07-cta.png',
    bg: PALETTE.lemon,
    fg: PALETTE.bg,
    kicker: null,
    title: 'Te esperamos.',
    sub: 'Únete al hangout\nPNPtv Community',
    footer: 'Toca para confirmar asistencia →',
  },
];

const SLIDES_EN = [
  {
    file: 'en-01-hook.png',
    bg: PALETTE.accent,
    fg: PALETTE.white,
    kicker: 'LIVE EVENT',
    title: 'Video call with\nLex + Santino',
    sub: 'Founders of PNPtv',
    footer: 'Monday, Aug 3 · 10:00 AM COL',
  },
  {
    file: 'en-02-why-now.png',
    bg: PALETTE.bg,
    fg: PALETTE.white,
    kicker: null,
    title: "It's time to\nstop being\ninvisible.",
    sub: null,
    footer: null,
  },
  {
    file: 'en-03-formacion.png',
    bg: PALETTE.purple,
    fg: PALETTE.white,
    kicker: 'PILLAR 01',
    title: 'Comprehensive\ntraining',
    sub: 'for the professionals\nin the space.',
    footer: null,
  },
  {
    file: 'en-04-bienestar.png',
    bg: PALETTE.accent,
    fg: PALETTE.white,
    kicker: 'PILLAR 02',
    title: 'Real\nwell-being',
    sub: 'Financial planning\nand mental health.',
    footer: null,
  },
  {
    file: 'en-05-comunidad.png',
    bg: PALETTE.bg,
    fg: PALETTE.white,
    kicker: 'PILLAR 03',
    title: 'Active,\nhuman community',
    sub: 'Spaces led by you\nto dignify the work.',
    footer: null,
  },
  {
    file: 'en-06-ciencia.png',
    bg: PALETTE.purple,
    fg: PALETTE.white,
    kicker: 'PILLAR 04',
    title: 'Science without\nprejudice',
    sub: 'Real data on use,\ntechnology with purpose.',
    footer: null,
  },
  {
    file: 'en-07-cta.png',
    bg: PALETTE.lemon,
    fg: PALETTE.bg,
    kicker: null,
    title: "We're waiting.",
    sub: 'Join the hangout\nPNPtv Community',
    footer: 'Tap to RSVP →',
  },
];

const SLIDES = [...SLIDES_ES, ...SLIDES_EN];

function svg({ bg, fg, kicker, title, sub, footer }) {
  const titleLines = title.split('\n');
  // Approx char width for Liberation Sans bold at size 1 is ~0.58; we have
  // 900 usable pixels (1080 - 2*90). Pick size that fits the longest line.
  const longestLine = Math.max(...titleLines.map((l) => l.length));
  const maxWidthPx = 900;
  const widthCap = Math.floor(maxWidthPx / (longestLine * 0.58));
  const linesCap = titleLines.length >= 3 ? 110 : (titleLines.length === 2 ? 130 : 150);
  const titleSize = Math.min(widthCap, linesCap);
  const titleLineHeight = titleSize * 1.05;

  // Vertical layout: kicker at ~180, title block starts at ~380, sub at ~ (titleBottom+80), footer at ~980
  const kickerY = 180;
  const titleStartY = kicker ? 380 : 320;
  const titleBottomY = titleStartY + titleLineHeight * titleLines.length;
  const subStartY = titleBottomY + 40;

  const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const titleTspans = titleLines
    .map((line, i) => `<tspan x="90" dy="${i === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`)
    .join('');

  const subLines = sub ? sub.split('\n') : [];
  const subTspans = subLines
    .map((line, i) => `<tspan x="90" dy="${i === 0 ? 0 : 52}">${escapeXml(line)}</tspan>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="100%" height="100%" fill="${bg}"/>
  ${kicker ? `<text x="90" y="${kickerY}" font-family="Liberation Sans" font-weight="700" font-size="34" letter-spacing="6" fill="${fg}" opacity="0.85">${escapeXml(kicker)}</text>` : ''}
  <text x="90" y="${titleStartY}" font-family="Liberation Sans" font-weight="900" font-size="${titleSize}" fill="${fg}" style="line-height:1">${titleTspans}</text>
  ${sub ? `<text x="90" y="${subStartY}" font-family="Liberation Sans" font-weight="400" font-size="44" fill="${fg}" opacity="0.9">${subTspans}</text>` : ''}
  ${footer ? `<text x="90" y="980" font-family="Liberation Sans" font-weight="700" font-size="36" fill="${fg}" opacity="0.9">${escapeXml(footer)}</text>` : ''}
  <text x="${SIZE - 90}" y="980" text-anchor="end" font-family="Liberation Sans" font-weight="700" font-size="30" letter-spacing="4" fill="${fg}" opacity="0.7">PNPtv!</text>
</svg>`;
}

async function generate() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });

  const logoBuf = fs.existsSync(LOGO_PATH)
    ? await sharp(LOGO_PATH).resize({ width: 140, fit: 'inside' }).png().toBuffer()
    : null;

  const written = [];
  for (const slide of SLIDES) {
    const svgBuf = Buffer.from(svg(slide));
    const pipeline = sharp({
      create: { width: SIZE, height: SIZE, channels: 3, background: slide.bg },
    });

    const composites = [{ input: svgBuf, top: 0, left: 0 }];
    if (logoBuf) composites.push({ input: logoBuf, top: 80, left: SIZE - 220 });

    const outPath = path.join(OUT_DIR, slide.file);
    await pipeline.composite(composites).png({ compressionLevel: 9 }).toFile(outPath);
    written.push({ file: slide.file, url: `/uploads/announcements/${slide.file}` });
  }
  console.log(JSON.stringify(written, null, 2));
}

generate().catch((err) => {
  console.error('generator fatal:', err);
  process.exit(1);
});
