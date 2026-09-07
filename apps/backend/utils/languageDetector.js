async function detectLanguage(ctx, defaultLang = 'es') {
  if (!ctx) return defaultLang;
  if (ctx.session && ctx.session.language) return ctx.session.language;
  const tgLang = ctx.from && ctx.from.language_code;
  if (tgLang) {
    if (tgLang.startsWith('es')) return 'es';
    if (tgLang.startsWith('en')) return 'en';
  }
  return defaultLang;
}

module.exports = {
  detectLanguage,
};
