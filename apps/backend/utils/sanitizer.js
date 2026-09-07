const sanitizeHtml = require('sanitize-html');

function sanitize(text, options = {}) {
  if (!text || typeof text !== 'string') return text || '';
  return sanitizeHtml(text, options);
}

sanitize.text = (text, options = {}) => {
  if (!text || typeof text !== 'string') return '';
  let clean = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
  if (options.maxLength && clean.length > options.maxLength) {
    clean = clean.substring(0, options.maxLength);
  }
  return clean;
};

sanitize.telegramMarkdown = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
};

module.exports = sanitize;
