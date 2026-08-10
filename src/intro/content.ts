/**
 * Scene list and legal copy.
 *
 * The scene list is the piece's outline and the single source of the cue table
 * — edit durations here and every animation retimes with them.
 */

import type { Scene } from './timeline';

export const INTRO_SCENES: Scene[] = [
  {
    name: 'Title',
    dur: 7,
    desc: 'The PNPtv logo, title and performer credits fade and scale in over a dark ambient background',
  },
  {
    name: 'Disclaimer',
    dur: 9,
    desc: 'Cut to the legal disclaimer card with age, consent and copyright notices; a skip button is available throughout',
  },
];

export interface Clause {
  /** Two-digit ordinal shown in the accent colour. */
  n: string;
  /** Clause heading. */
  t: string;
  /** Clause body. */
  b: string;
}

export const DISCLAIMER_CLAUSES: Clause[] = [
  {
    n: '01',
    t: 'AGE & CONSENT',
    b: 'This content is intended exclusively for adults 18 years of age or older, or the age of majority in your jurisdiction if higher. By continuing to view, you confirm that you meet this requirement.',
  },
  {
    n: '02',
    t: 'PERFORMER COMPLIANCE',
    b: 'All performers are of verified legal age and appear voluntarily, with documented consent, in accordance with 18 U.S.C. § 2257 and applicable Colombian regulations governing adult content production.',
  },
  {
    n: '03',
    t: 'DRAMATIZED CONTENT',
    b: 'Depictions of regulated or unregulated substances, professional or clinical settings, mobility-limitation facilities, and any scenario a viewer may consider provocative are staged fiction, performed by consenting adult actors for entertainment purposes only. No such depiction reflects an actual event or endorsement.',
  },
  {
    n: '04',
    t: 'NO ENDORSEMENT',
    b: 'PNPtv! does not encourage, promote, or endorse any substance, unsafe practice, or activity depicted. We affirm every individual’s right to make informed, autonomous decisions about their own body and health.',
  },
  {
    n: '05',
    t: 'COPYRIGHT',
    b: 'This production is the exclusive property of PNPtv! and its licensors, protected under applicable copyright and intellectual property law. Unauthorized reproduction or distribution, in whole or in part, is strictly prohibited.',
  },
  {
    n: '06',
    t: 'GOVERNING LAW',
    b: 'PNPtv! operates in accordance with the laws of the Republic of Colombia. Viewing this content constitutes acceptance of these terms and, where applicable, the laws of your local jurisdiction.',
  },
];

export const DISCLAIMER_HEADING = 'VIEWER DISCLAIMER';
export const DISCLAIMER_BADGE = '18+ ONLY';
export const LEGAL_ENTITY = 'PNPTV! S.A.S. — REPUBLIC OF COLOMBIA';
export const COPYRIGHT_LINE = '© 2026 PNPTV! — ALL RIGHTS RESERVED';

export const DEFAULTS = {
  channel: 'PNPTV! PRESENTS',
  title: 'YOUR TITLE HERE',
  performers: 'Performer Name  •  Performer Name',
} as const;
