'use strict';

/**
 * Forbidden-content filter for user-submitted descriptions (bios, group
 * descriptions, channel descriptions, posts, event descriptions) AND for
 * ephemeral streams (DMs, main-stage chat, hangout chat) via the same
 * assertCleanText entry point.
 *
 * Categories blocked:
 *   - child_safety             : pedophilia / CSAM references
 *   - zoophilia                : bestiality / animal sex
 *   - non_consent              : rape, drug-facilitated assault, non-consensual scenes
 *   - bug_chasing              : intentional HIV transmission / conversion culture
 *   - iv_drug_use              : needle-use language (slamming, IV meth, hotshots)
 *   - firearms                 : guns / ammo / weapons sales + trades
 *   - drug_sales               : selling / trading illicit drugs (distinct from personal
 *                                use — "hosting"/"pnp"/"partying" stay allowed, only the
 *                                commerce language is rejected: "for sale", "$ per g",
 *                                "delivering", "shipping", "menu", etc.)
 *   - off_platform_competitor  : promoting competing adult subscription/cam/escort
 *                                platforms (OnlyFans, Fansly, Chaturbate, link farms
 *                                like Linktree used to funnel to those). Users MAY
 *                                have accounts elsewhere; they may NOT solicit here.
 *   - off_platform_payment     : soliciting payment outside PNPtv's wallet — Cash App,
 *                                Venmo, Zelle, PayPal, LatAm fintech (Nequi, Daviplata,
 *                                Bre-B), wire transfers, or personal crypto wallet
 *                                addresses. All PNPtv monetization must flow through
 *                                the internal Wallet / Ru$h ledger.
 *
 * Tuning note: this platform's core context is adult PNP (party-and-play).
 * Generic terms like "meth" / "tina" / "pnp" / "chem" are NOT blocked — only
 * the specific *dangerous-vector* language (needle injection, intentional
 * infection, non-consent, minors, animals, weapons, and commercial supply)
 * is rejected.
 *
 * Anti-leakage note: the two `off_platform_*` categories exist to protect the
 * ecosystem from creators/users routing money and audience off-platform,
 * which starves the network of the reinvestment that funds features
 * everyone benefits from. Enforcement is a strike ladder (1=warn, 2=24h
 * mute, 3=ban) handled in warningService.logAntiLeakageStrike.
 */

// Patterns use a leading \b for word-start anchoring but intentionally omit a
// trailing \b so common suffixes ("pedophile/pedophilia", "chaser/chasing",
// "giver/giving") still match the stem.
const FORBIDDEN_PATTERNS = [
  // ── Pedophilia / CSAM ───────────────────────────────────────────────
  {
    category: 'child_safety',
    pattern: /\b(?:p(?:a)?edophil|child[-\s]*(?:porn|sex|rape|abuse)|kiddie[-\s]*(?:porn|sex)|underage|jailbait|pre[-\s]?teen|lolit[ao]|shotacon|shota[-\s]|minor[-\s]attracted|cp[-\s]*(?:trade|pack|bundle|dump|content|for[-\s]*sale|menu|available|dm|hmu)|young[-\s]*teen[-\s]*(?:sex|porn))/i,
  },
  // ── Zoophilia / bestiality ──────────────────────────────────────────
  {
    category: 'zoophilia',
    pattern: /\b(?:zoophil|bestiality|(?:animal|dog|horse|zoo)[-\s]*(?:sex|porn|fuck|breed|cum|cock)|fuck[-\s]*(?:my|a)[-\s]*(?:dog|horse|animal)|beast[-\s]*(?:sex|porn))/i,
  },
  // ── Rape / non-consent ──────────────────────────────────────────────
  {
    category: 'non_consent',
    pattern: /\b(?:rape[-\s]*(?:fantasy|play|kink|scene|me|you|her|him|them|slave|bait)|raping|rapist|non[-\s]?consen|forced[-\s]*sex|drug[-\s]*rape|date[-\s]*rape|roof(?:ie|y)|spike[-\s]*(?:drink|load)|cnc[-\s]+(?:play|scene|kink|bottom|top|session))/i,
  },
  // ── Bug chasing / intentional HIV transmission ──────────────────────
  {
    category: 'bug_chasing',
    pattern: /\b(?:bug[-\s]?chas|chas(?:e|er|ing)[-\s]+bugs?|breed[-\s]+(?:me[-\s]+)?(?:bug|poz|toxic)|gift[-\s]?giv|poz(?:z|)[-\s]*me[-\s]*up|pozz?(?:ing|ed)?[-\s]*(?:load|seed|cum|up[-\s]*(?:me|bottom))|toxic[-\s]*(?:load|seed|cum|poz|breed)|conversion[-\s]*(?:party|seed|load)|converting[-\s]*(?:me|bottom|neg)|charge[-\s]*me[-\s]*up|stealth[-\s]*(?:poz|load|infect)|intentional[-\s]*infect|give[-\s]*me[-\s]*(?:the|your)[-\s]*(?:bug|gift|poz))/i,
  },
  // ── Dangerous drug use: IV / slamming / hotshots ────────────────────
  {
    category: 'iv_drug_use',
    pattern: /\b(?:slam(?:ming|med|mer|sesh)|slam[-\s]+(?:session|party|sesh|bro|buddy|chem|meth|tina|bottom|hot)|iv[-\s]*(?:meth|tina|t\b)|inject(?:ing)?[-\s]*(?:meth|tina|t\b)|needle[-\s]*shar|shared?[-\s]*needles?|hot[-\s]?shot|suicide[-\s]*dose|shoot(?:ing)?[-\s]*(?:tina|meth|t\b)|point(?:ing)?[-\s]*each[-\s]*other|pointing[-\s]*party)/i,
  },
  // ── Firearms / weapons trade ────────────────────────────────────────
  // Blocks the commerce language, not fictional or joking mentions.
  // Allows a determiner ("a", "the", "some") between the verb and the noun
  // so "buying a glock" is caught, not just "buying glock".
  {
    category: 'firearms',
    pattern: /\b(?:sell(?:ing)?|buy(?:ing)?|trad(?:e|ing)|deliver(?:y|ing)|ship(?:ping)?|for[-\s]*sale)[-\s]+(?:a|the|some|my)?[-\s]*(?:gun|guns|firearm|pistol|handgun|glock|rifle|shotgun|ak[-\s]?47|ar[-\s]?15|ammo|ammunition|bullets?|magazine|silencer|suppressor)\b|\b(?:gun|firearm|pistol|glock|rifle|shotgun|ak[-\s]?47|ar[-\s]?15|ammo)[-\s]+(?:for[-\s]*sale|available|in[-\s]*stock|delivery|dm[-\s]*for|hit[-\s]*me[-\s]*up)|\b(?:untraceable|ghost|off[-\s]*paper|no[-\s]*paper|no[-\s]*ffl)[-\s]+(?:gun|firearm|pistol|glock|rifle|shotgun)/i,
  },
  // ── Drug sales / dealing ────────────────────────────────────────────
  // Explicitly targets commerce/supply — pricing, packaging, delivery,
  // "menus," dealer callouts. Personal-use language stays untouched so
  // legitimate PNP hosting is not swept up. Allows filler words ("for",
  // "some", "a") between the commerce word and the drug name.
  {
    category: 'drug_sales',
    pattern: /\b(?:sell(?:ing)?|for[-\s]*sale|plug|plugged|delivery|shipping|mailing|menu|prices?|price[-\s]*list|wholesale|bulk|stocked|in[-\s]*stock)[-\s]+(?:for[-\s]+|of[-\s]+|some[-\s]+|a[-\s]+)?(?:meth|tina|t\b|crystal|ice|shard|shards|g\b|gram|grams|q\b|zip|oz|ounce|pound|kilo|k\b|molly|mdma|ghb|g[-\s]?juice|cocaine|coke|blow|snow|coca|xanax|xannies|bars|percs?|percocet|oxy|oxycodone|fenta?nyl|fent|adderall|addy|weed|kush|zaza|pot|mushrooms?|shrooms|acid|lsd|dmt|ketamine|k[-\s]?hole|ket|special[-\s]?k)|\b(?:hmu|dm|inbox|text[-\s]+me|hit[-\s]+me[-\s]+up)[-\s]+for[-\s]+(?:meth|tina|t\b|crystal|ice|shard|molly|mdma|ghb|g[-\s]?juice|coke|blow|xanax|percs?|oxy|fent|weed|kush|shrooms?|acid|lsd|ketamine|ket|k\b)|(?:\$|\busd\b|\bper\b)[-\s]*\d+[-\s]*(?:\/|per)?[-\s]*(?:g|gram|grams|q\b|zip|oz|ounce|point|points?)\b/i,
  },
  // ── Off-platform competitor solicitation ────────────────────────────
  // Catches competitor adult-subscription/cam/escort platforms + link
  // aggregators commonly used to funnel PNPtv audience elsewhere. Char-class
  // `[\W_]*` allows dot/space/dash/underscore obfuscation ("o.n.l.y.f.a.n.s",
  // "0nly f4ns"). The bare "OF" abbreviation only matches inside a
  // solicitation context ("sub my OF", "check my of") to avoid false
  // positives on the English preposition.
  {
    category: 'off_platform_competitor',
    pattern: new RegExp([
      String.raw`\bo[\W_]*n[\W_]*l[\W_]*y[\W_]*f[\W_]*a[\W_]*n[\W_]*s\b`,
      String.raw`\b0[\W_]*n[\W_]*l[\W_]*y[\W_]*f[\W_]*[a4][\W_]*n[\W_]*s\b`,
      String.raw`onlyfans\.com`,
      String.raw`\b(?:sub(?:scribe)?|follow|check|see|find|hit|dm|hmu|join|visit|my|mi|mis|sigueme|síguéme|sígueme|sigan|suscri(?:be|banse)|nuestro)[\W_]+(?:my[\W_]+|mi[\W_]+|the[\W_]+)?of\b`,
      String.raw`\bfans[\W_]?ly(?:\.com)?\b`,
      String.raw`\bfanvue(?:\.com)?\b`,
      String.raw`\bjust[\W_]?for[\W_]?\.?fans?\b`,
      String.raw`\bloyal[\W_]?fans\b`,
      String.raw`\bmany[\W_]?vids\b`,
      String.raw`\bfan[\W_]?centro\b`,
      String.raw`\bchaturbate\b`,
      String.raw`\bstrip[\W_]?chat\b`,
      String.raw`\bmy[\W_]?free[\W_]?cams\b|\bmfc\.com\b`,
      String.raw`\bcam4(?:\.com)?\b`,
      String.raw`\bbonga[\W_]?cams\b`,
      String.raw`\bflirt4free\b`,
      String.raw`\bstream[\W_]?ate\b`,
      String.raw`\biwant(?:clips|empire|fanclub)\b`,
      String.raw`\bclips4sale\b`,
      String.raw`pornhub\.com\/model|\bmodelhub\.com\b`,
      String.raw`\bavn[\W_]?stars\b`,
      String.raw`\bunlockd\.me\b`,
      String.raw`\badmire[\W_]?me\b`,
      String.raw`\bslushy\.com\b`,
      String.raw`\brent(?:\.| )?men\b`,
      String.raw`\ba4a\.com\b`,
      // Additional adult social/content platforms observed in the wild (2026-08-10)
      String.raw`\bmewe\b`,
      String.raw`\bmotherless(?:\.com)?\b`,
      String.raw`\bfaphouse\b`,
      // Link aggregators — commonly used to redirect to the above
      String.raw`\blinktr\.ee\b`,
      String.raw`\bbeacons\.ai\b`,
      String.raw`\ball[\W_]?my[\W_]?links(?:\.com)?\b`,
      String.raw`\bbio\.link\b`,
      String.raw`\bcarrd\.co\b`,
      String.raw`\bsnip[\W_]?feed\b`,
      String.raw`\blinkme\.bio\b`,
      String.raw`\bcampsite\.bio\b`,
      String.raw`\bshor\.by\b`,
      // ── Telegram / WhatsApp active solicitation ─────────────────────
      // We DO allow passive mentions of IG / X / TikTok (Santino's policy:
      // those are discovery-allied and encouraged via a future 'Share
      // Profile' button). Telegram / WhatsApp are different — they're
      // 1-on-1 DM steering channels commonly used to move paying members
      // off PNPtv's revenue path. We block THREE patterns:
      //   (a) verb-of-solicitation + platform ("dm me on telegram")
      //   (b) platform followed by @handle ("TG: @carlos", "Telegram @foo")
      //   (c) possessive form ("my tele", "mi whatsapp")
      // Bare mention of "PNPtv Telegram bot" without @handle or verb is NOT
      // caught, so users can still reference the platform's own TG presence.
      String.raw`\b(?:dm|message|msg|hit(?:\s+me)?(?:\s+up)?|hmu|text|contact(?:ame|áme)?|escri(?:be|bí|bi)me|contactame|contáctame|write)\s+(?:me\s+)?(?:on|via|at|to|by|por|para|en\s+el|through)?\s*(?:telegram|tg\b|tele\b|tlgrm|whatsapp|wa\.me|t\.me|wa\b|wsp|whats\s*app)`,
      String.raw`\b(?:telegram|tg|tele|tlgrm|whatsapp|wa\.me|t\.me|wsp|whats\s*app)\s*[:\-–—]?\s*@\w{3,}`,
      String.raw`\b(?:my|mi|mis|our|nuestro|nuestra)\s+(?:telegram|tg\b|tele\b|tlgrm|whatsapp|wa\b|wsp|whats\s*app)\b`,
    ].join('|'), 'i'),
  },
  // ── Off-platform payment solicitation ───────────────────────────────
  // Any monetary channel that routes value outside the PNPtv Wallet /
  // Ru$h ledger. Includes US fintech, LatAm fintech, wire rails, and
  // direct crypto wallet solicitation (raw 0x address or "send USDC to
  // ..." phrasing). PNPtv-native wallet flows are unaffected because
  // they never require the user to *type* an address into a bio/chat.
  {
    category: 'off_platform_payment',
    pattern: new RegExp([
      // US fintech
      String.raw`\bcash[\W_]?app\b`,
      String.raw`\bcash[\W_]?tag\b`,
      String.raw`\bvenmo\b`,
      String.raw`\bzelle\b`,
      String.raw`\bpay[\W_]?pal(?:[\W_]?me|\.me)?\b`,
      String.raw`\bpp\.me\b`,
      // LatAm fintech
      String.raw`\bnequi\b`,
      String.raw`\bdavi[\W_]?plata\b`,
      String.raw`\bbre[\W_]?b\b`,
      String.raw`\brappi[\W_]?pay\b`,
      String.raw`\bmercado[\W_]?pago\b`,
      String.raw`\bpix[\W_]+(?:key|chave|transfer)\b`,
      // Wire / off-rail
      String.raw`\bwire[\W_]+transfer\b`,
      String.raw`\bwestern[\W_]+union\b`,
      String.raw`\bmoney[\W_]?gram\b`,
      // Direct crypto wallet solicitation
      String.raw`\b0x[a-fA-F0-9]{40}\b`,
      String.raw`\bbc1[a-z0-9]{25,}\b`,
      String.raw`\b(?:btc|bitcoin|eth|ethereum|usdt|usdc|sol|solana|trc20|erc20|bep20)[\W_]+(?:addr(?:ess)?|wallet)[\W_]*[:=]`,
      String.raw`(?:send|tip|pay|drop|transfer)[\W_]+(?:me[\W_]+)?(?:some[\W_]+)?(?:usdc|usdt|eth|btc|bitcoin|sol|solana)[\W_]+(?:to|at|directly)\b`,
    ].join('|'), 'i'),
  },
];

// Human-readable labels for each category. Surfaced directly to the user in
// the error message so they know WHY the save was rejected without needing
// to decode backend codes.
const CATEGORY_LABELS = {
  child_safety: 'minors / underage content',
  zoophilia: 'zoophilia / bestiality',
  non_consent: 'rape or non-consensual content',
  bug_chasing: 'intentional HIV transmission ("bug chasing")',
  iv_drug_use: 'dangerous drug injection ("slamming")',
  firearms: 'firearms / weapons trade',
  drug_sales: 'drug sales / dealing',
  off_platform_competitor: 'promotion of competing adult platforms (OnlyFans, Fansly, cam sites, link farms) — you may keep external accounts, but you may not promote them on PNPtv',
  off_platform_payment: 'off-platform payment methods (Cash App, Venmo, Zelle, PayPal, personal crypto wallets) — all PNPtv monetization must go through the in-app Wallet',
};

// Categories that specifically indicate an anti-leakage violation. Callers
// use this to decide whether to log a strike via warningService, in addition
// to the standard 400-response returned by assertCleanText.
const ANTI_LEAKAGE_CATEGORIES = new Set([
  'off_platform_competitor',
  'off_platform_payment',
]);

function findForbiddenTerms(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  for (const { category, pattern } of FORBIDDEN_PATTERNS) {
    const m = text.match(pattern);
    if (m) matches.push({ category, term: m[0] });
  }
  return matches;
}

/**
 * Throws a typed Error when the text contains forbidden terms so controllers
 * can catch and return 400. The message is user-facing — it names the field
 * and the policy category that matched so the user understands what to edit.
 *
 * @param {string|null|undefined} text
 * @param {string} field  Human-friendly field name for the error message.
 */
function assertCleanText(text, field = 'text') {
  const hits = findForbiddenTerms(text);
  if (hits.length === 0) return;
  const categories = [...new Set(hits.map((h) => h.category))];
  const labels = categories.map((c) => CATEGORY_LABELS[c] || c);
  const list = labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} and ${labels.slice(-1)}`
    : labels[0];
  const err = new Error(
    `Your ${field} can't be saved — it contains content that violates our community guidelines (${list}). ` +
    `Please remove the prohibited wording and try again.`
  );
  err.status = 400;
  err.code = 'FORBIDDEN_CONTENT';
  err.field = field;
  err.categories = categories;
  // `terms` carries the raw matched substrings so callers can log evidence
  // in the strike ledger without re-running the regex. Truncate long matches.
  err.terms = hits.map((h) => ({
    category: h.category,
    term: h.term.length > 120 ? `${h.term.slice(0, 117)}...` : h.term,
  }));
  err.isAntiLeakage = categories.some((c) => ANTI_LEAKAGE_CATEGORIES.has(c));
  throw err;
}

module.exports = {
  FORBIDDEN_PATTERNS,
  CATEGORY_LABELS,
  ANTI_LEAKAGE_CATEGORIES,
  findForbiddenTerms,
  assertCleanText,
};
