/**
 * Design tokens, lifted from the prototype's literal values.
 *
 * The prototype used raw hex inline; these are the same values, named, so a
 * brand change is one edit rather than a grep.
 */

export const COLORS = {
  bg: '#121212',
  surface: '#1E1E1E',
  border: '#2A2A2A',
  magenta: '#D4007A',
  lemon: '#FBFF00',
  amber: '#E69138',
  text: '#FFFFFF',
  textMuted: '#A1A1A3',
  textFaint: '#5A5A60',
  skipBg: 'rgba(30,30,30,0.6)',
} as const;

/**
 * Display face. Ethnocentric is served from fonts.cdnfonts.com; the stack falls
 * back to Roboto Mono so the piece degrades to real brand type rather than a
 * system default when that host is unreachable. See FONTS.md.
 */
export const FONT_DISPLAY = "'Ethnocentric Rg','Ethnocentric','Roboto Mono',monospace";
export const FONT_BODY = "'Roboto Mono',monospace";

/** Canvas dimensions per orientation. */
export const FRAME = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;
