const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const sanitizeHtml = require('sanitize-html');
const https = require('https');

// ── Redis key patterns ────────────────────────────────────────────────────
// email:suppressed:<address>       TTL-less → permanent hard-bounce suppress
// email:sent:<address>:<date>      counter, TTL 86400 → per-day send volume
// email:delivery:<messageId>       hash, TTL 7d → delivery status per message

const SUPPRESS_PREFIX = 'email:suppressed:';
const DELIVERY_PREFIX = 'email:delivery:';
const SEND_COUNT_PREFIX = 'email:sent:';

// ── Hostinger Mail API client ─────────────────────────────────────────────
// Base: https://api.mail.hostinger.com  (NOT api.hostinger.com)
// Auth: Bearer token, order-scoped. Mailbox resource IDs from /api/v1/me.
//
// Known mailboxes (from GET /api/v1/me):
//   noreply@pnptv.app  → AC2d383e41e81e1cb3feba76324096
//   support@pnptv.app  → ACbaf8cd14bb90ffd57edf302bc5a7
const HOSTINGER_API_KEY = process.env.HOSTINGER_API_KEY;
const HOSTINGER_MAIL_BASE = 'https://api.mail.hostinger.com';
const HOSTINGER_MAILBOX_NOREPLY = process.env.HOSTINGER_MAILBOX_NOREPLY || 'AC2d383e41e81e1cb3feba76324096';
const HOSTINGER_MAILBOX_SUPPORT = process.env.HOSTINGER_MAILBOX_SUPPORT || 'ACbaf8cd14bb90ffd57edf302bc5a7';

function hostingerRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!HOSTINGER_API_KEY) return reject(new Error('HOSTINGER_API_KEY not set'));
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(`${HOSTINGER_MAIL_BASE}${path}`);
    const req = https.request(url, {
      method,
      headers: {
        Authorization: `Bearer ${HOSTINGER_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 204) return resolve({ status: 204, body: null });
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Email Service - Handles sending emails from multiple domains
 * - easybots.store for invoices/billing
 * - pnptv.app for welcome/instructions/notifications
 *
 * Canonical file (merged 2026-07-18 from the diverged emailService.js /
 * emailservice.js pair — see .design-sync-free note in commit message).
 */
class EmailService {
  constructor() {
    this.transporters = {
      easybots: null,
      pnptv: null,
    };

    // Initialize transporters if config is available
    this.initTransporters();
  }

  // ── Redis helper ──────────────────────────────────────────────────────
  _redis() {
    try {
      const { getRedis } = require('../config/redis');
      return getRedis();
    } catch {
      return null;
    }
  }

  // ── Suppression list ──────────────────────────────────────────────────

  async isSuppressed(email) {
    const redis = this._redis();
    if (!redis) return false;
    try {
      return !!(await redis.get(`${SUPPRESS_PREFIX}${email.toLowerCase()}`));
    } catch { return false; }
  }

  async suppress(email, reason = 'hard-bounce') {
    const redis = this._redis();
    if (!redis) return;
    const key = `${SUPPRESS_PREFIX}${email.toLowerCase()}`;
    try {
      await redis.set(key, JSON.stringify({ reason, suppressedAt: new Date().toISOString() }));
      logger.warn('[email] address suppressed', { email, reason });
    } catch (err) {
      logger.error('[email] suppress write failed', { email, error: err.message });
    }
  }

  async unsuppress(email) {
    const redis = this._redis();
    if (!redis) return;
    try {
      await redis.del(`${SUPPRESS_PREFIX}${email.toLowerCase()}`);
      logger.info('[email] suppression removed', { email });
    } catch { /* ignore */ }
  }

  async listSuppressed(cursor = '0', count = 100) {
    const redis = this._redis();
    if (!redis) return { cursor: '0', emails: [] };
    try {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SUPPRESS_PREFIX}*`, 'COUNT', count);
      const emails = keys.map((k) => k.replace(SUPPRESS_PREFIX, ''));
      return { cursor: nextCursor, emails };
    } catch { return { cursor: '0', emails: [] }; }
  }

  // ── Delivery tracking ─────────────────────────────────────────────────

  async _trackSent(messageId, meta) {
    const redis = this._redis();
    if (!redis || !messageId) return;
    try {
      await redis.setex(
        `${DELIVERY_PREFIX}${messageId}`,
        7 * 86400,
        JSON.stringify({ ...meta, sentAt: new Date().toISOString(), status: 'sent' })
      );
      // per-address daily send count (for rate-guard awareness)
      const today = new Date().toISOString().slice(0, 10);
      const countKey = `${SEND_COUNT_PREFIX}${meta.to}:${today}`;
      await redis.incr(countKey);
      await redis.expire(countKey, 86400);
    } catch { /* non-critical */ }
  }

  async getDeliveryStatus(messageId) {
    const redis = this._redis();
    if (!redis) return null;
    try {
      const raw = await redis.get(`${DELIVERY_PREFIX}${messageId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async getDailyCount(email) {
    const redis = this._redis();
    if (!redis) return 0;
    const today = new Date().toISOString().slice(0, 10);
    try {
      return parseInt(await redis.get(`${SEND_COUNT_PREFIX}${email}:${today}`) || '0', 10);
    } catch { return 0; }
  }

  // ── Retry helper ──────────────────────────────────────────────────────

  async _sendWithRetry(transporter, mailOptions, { retries = 2, delayMs = 2000 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const info = await transporter.sendMail(mailOptions);
        if (attempt > 0) {
          logger.info('[email] sent after retry', { attempt, messageId: info.messageId, to: mailOptions.to });
        }
        return info;
      } catch (err) {
        lastErr = err;
        // Hard errors (bad address, auth failure) — don't retry
        const isHard = err.responseCode >= 500 && err.responseCode < 600;
        if (isHard || attempt === retries) break;
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  // ── Hostinger Mail API helpers ────────────────────────────────────────

  /** Return authenticated account info + mailbox list */
  hostingerGetMe() {
    return hostingerRequest('GET', '/api/v1/me');
  }

  /** Mailbox quota (storage used / total) */
  hostingerGetQuota(mailboxId = HOSTINGER_MAILBOX_SUPPORT) {
    return hostingerRequest('GET', `/api/v1/mailboxes/${mailboxId}/quota`);
  }

  /** List messages in a folder (default: INBOX, page 1) */
  hostingerListMessages(mailboxId, folder = 'INBOX', page = 1, perPage = 25) {
    return hostingerRequest('GET', `/api/v1/mailboxes/${mailboxId}/folders/${encodeURIComponent(folder)}/messages?page=${page}&perPage=${perPage}`);
  }

  /** Full-text search within a folder */
  hostingerSearchMessages(mailboxId, folder = 'INBOX', query = {}) {
    return hostingerRequest('POST', `/api/v1/mailboxes/${mailboxId}/folders/${encodeURIComponent(folder)}/messages/search`, query);
  }

  /** Get single message (with body) */
  hostingerGetMessage(mailboxId, folder, uid) {
    return hostingerRequest('GET', `/api/v1/mailboxes/${mailboxId}/folders/${encodeURIComponent(folder)}/messages/${uid}`);
  }

  /** Get plain-text body of a message */
  hostingerGetMessageText(mailboxId, folder, uid) {
    return hostingerRequest('GET', `/api/v1/mailboxes/${mailboxId}/folders/${encodeURIComponent(folder)}/messages/${uid}/text`);
  }

  /** List folders in a mailbox */
  hostingerListFolders(mailboxId) {
    return hostingerRequest('GET', `/api/v1/mailboxes/${mailboxId}/folders`);
  }

  /**
   * Send an email via the Hostinger Mail HTTP API (replaces SMTP for noreply sends).
   * Outgoing sender address is determined by the mailboxId.
   */
  async sendViaHostingerApi({
    to, subject, html, text, displayName,
    cc = [], bcc = [],
    mailboxId = HOSTINGER_MAILBOX_NOREPLY,
  }) {
    if (!HOSTINGER_API_KEY) throw new Error('HOSTINGER_API_KEY not set');
    if (!to) throw new Error('to is required');
    const toArr = Array.isArray(to) ? to : [to];
    const result = await hostingerRequest('POST', `/api/v1/mailboxes/${mailboxId}/send`, {
      to: toArr,
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      ...(displayName ? { displayName } : {}),
      subject,
      html,
      text: text || this.stripHtml(html || ''),
    });
    if (result.status !== 200 && result.status !== 202 && result.status !== 204) {
      throw new Error(`Hostinger send failed: ${JSON.stringify(result.body)}`);
    }
    return result;
  }

  /** List webhooks on a mailbox */
  hostingerListWebhooks(mailboxId = HOSTINGER_MAILBOX_SUPPORT) {
    return hostingerRequest('GET', `/api/v1/mailboxes/${mailboxId}/webhooks`);
  }

  /** Create a webhook (returns one-time secret in response — store it!) */
  hostingerCreateWebhook(mailboxId, { name, url, events = ['message.received'], description = '' }) {
    return hostingerRequest('POST', `/api/v1/mailboxes/${mailboxId}/webhooks`, { name, url, events, description });
  }

  /** Delete a webhook */
  hostingerDeleteWebhook(mailboxId, webhookId) {
    return hostingerRequest('DELETE', `/api/v1/mailboxes/${mailboxId}/webhooks/${webhookId}`);
  }

  /** Trigger a test delivery on a webhook */
  hostingerTestWebhook(mailboxId, webhookId) {
    return hostingerRequest('POST', `/api/v1/mailboxes/${mailboxId}/webhooks/${webhookId}/test`);
  }

  /** Expose resource IDs for use by other services */
  static get MAILBOX_NOREPLY() { return HOSTINGER_MAILBOX_NOREPLY; }
  static get MAILBOX_SUPPORT() { return HOSTINGER_MAILBOX_SUPPORT; }

  /**
   * Initialize email transporters for both domains
   */
  initTransporters() {
    try {
      // EasyBots transporter (for invoices)
      if (process.env.EASYBOTS_SMTP_HOST) {
        this.transporters.easybots = nodemailer.createTransport({
          host: process.env.EASYBOTS_SMTP_HOST,
          port: parseInt(process.env.EASYBOTS_SMTP_PORT || '587'),
          secure: process.env.EASYBOTS_SMTP_SECURE === 'true', // true for 465, false for other ports
          pool: true,
          maxConnections: 2,
          rateDelta: 1000,
          rateLimit: 3,
          auth: {
            user: process.env.EASYBOTS_SMTP_USER,
            pass: process.env.EASYBOTS_SMTP_PASS,
          },
        });
        logger.info('EasyBots email transporter initialized');
      } else {
        logger.warn('EasyBots SMTP not configured, invoice emails will not be sent');
      }

      // PNPtv transporter (for welcome emails)
      if (process.env.PNPTV_SMTP_HOST) {
        this.transporters.pnptv = nodemailer.createTransport({
          host: process.env.PNPTV_SMTP_HOST,
          port: parseInt(process.env.PNPTV_SMTP_PORT || '587'),
          secure: process.env.PNPTV_SMTP_SECURE === 'true',
          pool: true,
          maxConnections: 2,
          rateDelta: 1000,
          rateLimit: 3,
          auth: {
            user: process.env.PNPTV_SMTP_USER,
            pass: process.env.PNPTV_SMTP_PASS,
          },
        });
        logger.info('PNPtv email transporter initialized');
      } else {
        logger.warn('PNPtv SMTP not configured, welcome emails will not be sent');
      }
    } catch (error) {
      logger.error('Error initializing email transporters:', error);
    }
  }

  // ── Security / utility helpers ────────────────────────────────────────

  /**
   * Escape HTML special characters to prevent injection in email templates
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Validate email address to prevent nodemailer parsing vulnerabilities.
   * Rejects quoted local-parts that could cause misrouting (CVE-style attack).
   * @param {string} email - Email address to validate
   * @returns {boolean} True if safe, false if potentially malicious
   */
  isEmailSafe(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }

    // Reject emails with quoted local-parts containing @ (parsing vulnerability)
    // Pattern: "anything@something"@domain
    if (/^"[^"]*@[^"]*"@/.test(email)) {
      return false;
    }

    // Basic email format validation
    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return basicEmailRegex.test(email);
  }

  /**
   * Strip HTML tags from string (used for plaintext fallback)
   * @param {string} html - HTML string
   * @returns {string} Plain text
   */
  stripHtml(html) {
    return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  }

  /**
   * Generic send — used for one-off transactional emails (password resets,
   * account deletion, broadcasts, reactivation, recording-ready notices).
   * Defaults to the pnptv transporter.
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result
   */
  async send(options) {
    const {
      to,
      subject,
      html,
      text,
      from = process.env.PNPTV_FROM_EMAIL || process.env.EMAIL_FROM || 'PNPtv! <noreply@pnptv.app>',
      bcc,
      attachments = [],
    } = options;

    try {
      // Validate email address to prevent misrouting attacks
      if (!this.isEmailSafe(to)) {
        logger.error('Invalid or potentially malicious email address rejected:', { to });
        throw new Error('Invalid email address format');
      }

      // Suppression list check — skip hard-bounced addresses silently
      if (await this.isSuppressed(to)) {
        logger.info('[email] skipped — address is suppressed', { to, subject });
        return { success: false, messageId: null, mode: 'suppressed' };
      }

      // Primary path: Hostinger Mail HTTP API (more reliable than SMTP, no auth rotation issues)
      if (HOSTINGER_API_KEY) {
        try {
          const result = await this.sendViaHostingerApi({ to, subject, html, text });
          const messageId = `hostinger-${Date.now()}`;
          await this._trackSent(messageId, { to, subject, from: 'noreply@pnptv.app', transporter: 'hostinger-api' });
          logger.info('Email sent via Hostinger API:', { to, subject });
          return { success: true, messageId, mode: 'hostinger-api' };
        } catch (apiErr) {
          // Rate-limit responses (4.7.1 / hostinger_out_ratelimit) are per-account,
          // and SMTP hits the same account — falling back just piles on and
          // triggers auth-blocking (535) as Hostinger flags the source. Fail
          // fast for this case so the caller can retry later at their own cadence.
          const msg = apiErr.message || '';
          const rateLimited = /4\.7\.1|ratelimit|rate.?limit|too many|429/i.test(msg);
          if (rateLimited) {
            logger.warn('[email] Hostinger API rate-limited — SKIPPING SMTP fallback (same account):', { error: msg, to });
            return { success: false, messageId: null, mode: 'rate-limited', error: msg };
          }
          logger.warn('[email] Hostinger API failed, falling back to SMTP:', { error: msg, to });
        }
      }

      // Fallback: SMTP transporter
      if (!this.transporters.pnptv) {
        logger.info('Email would be sent (no transporter configured):', {
          to,
          subject,
          from,
          attachments: attachments.length,
        });
        return { success: true, messageId: 'logged', mode: 'logging' };
      }

      const mailOptions = {
        from,
        to,
        ...(bcc ? { bcc } : {}),
        subject,
        html,
        text: text || this.stripHtml(html),
        attachments,
      };

      const info = await this._sendWithRetry(this.transporters.pnptv, mailOptions);
      await this._trackSent(info.messageId, { to, subject, from, transporter: 'pnptv' });

      logger.info('Email sent successfully:', {
        to,
        subject,
        messageId: info.messageId,
        attachments: attachments.length,
      });

      return {
        success: true,
        messageId: info.messageId,
        mode: 'sent',
      };
    } catch (error) {
      // Auto-suppress on permanent delivery failure (5xx SMTP response)
      if (error.responseCode >= 550 && error.responseCode < 560) {
        await this.suppress(to, `smtp-${error.responseCode}`);
      }
      logger.error('Error sending email:', {
        to,
        subject,
        error: error.message,
        responseCode: error.responseCode,
      });
      throw error;
    }
  }

  // ── Invoice / welcome / purchase / credentials / founder / tokens ──────

  /**
   * Send invoice email from pnptv.app
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {Buffer} options.invoicePdf - PDF invoice buffer
   * @param {string} options.invoiceNumber - Invoice number
   * @param {string} options.customerName - Customer name
   * @param {number} options.amount - Payment amount
   * @param {string} options.planName - Plan name
   * @returns {Promise<Object>} Send result
   */
  async sendInvoiceEmail({ to, subject, invoicePdf, invoiceNumber, customerName, amount, planName }) {
    try {
      if (!this.transporters.easybots) {
        logger.warn('EasyBots transporter not configured, skipping invoice email');
        return { success: false, error: 'Transporter not configured' };
      }

      const mailOptions = {
        from: `"PNPtv Billing" <${process.env.EASYBOTS_SMTP_USER || 'hello@easybots.store'}>`,
        to,
        subject: subject || `Invoice #${invoiceNumber} - PNPtv`,
        html: this.generateInvoiceEmailHtml({
          customerName: customerName || 'Valued Customer',
          invoiceNumber,
          amount,
          planName,
        }),
        attachments: invoicePdf ? [{
          filename: `invoice-${invoiceNumber}.pdf`,
          content: invoicePdf,
          contentType: 'application/pdf',
        }] : [],
      };

      const result = await this.transporters.easybots.sendMail(mailOptions);

      logger.info('Invoice email sent successfully', {
        to,
        invoiceNumber,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Error sending invoice email:', {
        error: error.message,
        to,
        invoiceNumber,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send welcome email from pnptv.app with access instructions
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.customerName - Customer name
   * @param {string} options.planName - Plan name
   * @param {number} options.duration - Plan duration in days
   * @param {Date} options.expiryDate - Subscription expiry date
   * @param {string} options.language - Email language (en/es)
   * @param {string} options.userUuid - User's unique ID for recovery
   * @param {string} options.username - User's username
   * @param {string} options.loginMethod - Method used to login (telegram, x, email, deep_link)
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeEmail({
    to, customerName, planName, duration, expiryDate,
    language = 'es', onboardingGuidePdf = null,
    userUuid = null, username = null, loginMethod = null
  }) {
    try {
      if (!this.transporters.pnptv) {
        logger.warn('PNPtv transporter not configured, skipping welcome email');
        return { success: false, error: 'Transporter not configured' };
      }

      const isSpanish = language === 'es';
      const subject = isSpanish
        ? 'Tu Guía de Membresía PNPtv 🎬'
        : 'Your PNPtv Membership Guide 🎬';

      const attachments = [];
      if (onboardingGuidePdf) {
        attachments.push({
          filename: isSpanish ? 'Como-Usar-PNPtv.pdf' : 'How-to-Use-PNPtv.pdf',
          content: onboardingGuidePdf,
          contentType: 'application/pdf',
        });
      }

      const mailOptions = {
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv" <hello@pnptv.app>',
        to,
        subject,
        html: this.generateWelcomeEmailHtml({
          customerName: customerName || 'Valued Customer',
          planName,
          duration,
          expiryDate,
          language,
          userUuid,
          username,
          loginMethod
        }),
        attachments,
      };

      const result = await this.transporters.pnptv.sendMail(mailOptions);

      logger.info('Welcome email sent successfully', {
        to,
        planName,
        language,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Error sending welcome email:', {
        error: error.message,
        to,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Unified purchase confirmation email — sent from hello@pnptv.app for every
   * completed payment regardless of provider. Generates a PDF invoice inline.
   */
  async sendPurchaseConfirmationEmail({
    to, customerName, planName, amount, currency = 'USD',
    transactionId, provider = 'payment', language = 'es',
    expiryDate = null, isLifetime = false,
  }) {
    try {
      if (!this.transporters.pnptv) {
        logger.warn('[PurchaseConfirmation] pnptv transporter not configured, skipping');
        return { success: false, error: 'Transporter not configured' };
      }
      if (!to) {
        return { success: false, error: 'No recipient email' };
      }

      const InvoiceService = require('./invoiceservice');
      let invoicePdf = null;
      try {
        const inv = await InvoiceService.generateInvoice({
          invoiceNumber: transactionId || `PNP-${Date.now()}`,
          customerName: customerName || 'Valued Customer',
          planName,
          amount,
          currency,
          provider,
          transactionId,
          purchaseDate: new Date(),
          expiryDate: isLifetime ? null : expiryDate,
          language,
        });
        invoicePdf = inv.buffer;
      } catch (pdfErr) {
        logger.warn('[PurchaseConfirmation] PDF generation failed, sending without attachment', { error: pdfErr.message });
      }

      const isEs = language === 'es';
      const subject = isEs
        ? `Confirmación de compra — PNPtv #${transactionId || ''}`
        : `Purchase confirmation — PNPtv #${transactionId || ''}`;

      const expiryLine = isLifetime
        ? (isEs ? '<p><strong>Duración:</strong> Permanente ♾️</p>' : '<p><strong>Duration:</strong> Permanent ♾️</p>')
        : expiryDate
          ? (isEs
              ? `<p><strong>Vence:</strong> ${new Date(expiryDate).toLocaleDateString('es-ES')}</p>`
              : `<p><strong>Expires:</strong> ${new Date(expiryDate).toLocaleDateString('en-US')}</p>`)
          : '';

      const html = isEs ? `
<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1)}
  .hdr{background:#1C1C1E;padding:24px 30px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:26px}.hdr span{color:#D4007A}
  .body{padding:30px}
  .box{background:#f8f9fa;border-left:4px solid #D4007A;padding:16px 20px;border-radius:4px;margin:20px 0}
  .box p{margin:6px 0}
  .btn{display:inline-block;margin:20px 0;padding:12px 28px;background:#D4007A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold}
  .ftr{text-align:center;padding:20px;color:#888;font-size:12px;border-top:1px solid #eee}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>PNPtv<span>!</span></h1></div>
  <div class="body">
    <p>Hola <strong>${customerName || 'amig@'}</strong>,</p>
    <p>¡Gracias por tu compra! Tu membresía está <strong>activa ahora mismo</strong>.</p>
    <div class="box">
      <p><strong>Plan:</strong> ${planName}</p>
      <p><strong>Monto:</strong> $${parseFloat(amount || 0).toFixed(2)} ${currency}</p>
      <p><strong>Referencia:</strong> ${transactionId || '—'}</p>
      <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
      ${expiryLine}
    </div>
    <p>Accede a tu cuenta en <a href="https://pnptv.app">pnptv.app</a></p>
    <a class="btn" href="https://pnptv.app">Ir a PNPtv</a>
    <p>Si tienes preguntas, escríbenos a <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>
  </div>
  <div class="ftr"><p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p></div>
</div>
</body></html>` : `
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1)}
  .hdr{background:#1C1C1E;padding:24px 30px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:26px}.hdr span{color:#D4007A}
  .body{padding:30px}
  .box{background:#f8f9fa;border-left:4px solid #D4007A;padding:16px 20px;border-radius:4px;margin:20px 0}
  .box p{margin:6px 0}
  .btn{display:inline-block;margin:20px 0;padding:12px 28px;background:#D4007A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold}
  .ftr{text-align:center;padding:20px;color:#888;font-size:12px;border-top:1px solid #eee}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>PNPtv<span>!</span></h1></div>
  <div class="body">
    <p>Hi <strong>${customerName || 'there'}</strong>,</p>
    <p>Thank you for your purchase! Your membership is <strong>active right now</strong>.</p>
    <div class="box">
      <p><strong>Plan:</strong> ${planName}</p>
      <p><strong>Amount:</strong> $${parseFloat(amount || 0).toFixed(2)} ${currency}</p>
      <p><strong>Reference:</strong> ${transactionId || '—'}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-US')}</p>
      ${expiryLine}
    </div>
    <p>Access your account at <a href="https://pnptv.app">pnptv.app</a></p>
    <a class="btn" href="https://pnptv.app">Go to PNPtv</a>
    <p>Questions? Email us at <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>
  </div>
  <div class="ftr"><p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p></div>
</div>
</body></html>`;

      const attachments = invoicePdf ? [{
        filename: `pnptv-invoice-${transactionId || Date.now()}.pdf`,
        content: invoicePdf,
        contentType: 'application/pdf',
      }] : [];

      const result = await this.transporters.pnptv.sendMail({
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv" <hello@pnptv.app>',
        to,
        subject,
        html,
        attachments,
      });

      logger.info('[PurchaseConfirmation] Email sent', { to, transactionId, messageId: result.messageId });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('[PurchaseConfirmation] Email failed', { to, transactionId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SSO credentials email when a new Authentik account is provisioned.
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} options.customerName - Display name
   * @param {string} options.username - Authentik username
   * @param {string} options.password - Generated password
   * @param {string} options.loginUrl - Login URL (e.g., https://pnptv.app)
   * @param {string} [options.language='es'] - Email language (en/es)
   * @returns {Promise<Object>}
   */
  async sendCredentialsEmail({ to, customerName, username, password, loginUrl, language = 'es' }) {
    try {
      if (!this.transporters.pnptv) {
        logger.warn('PNPtv transporter not configured, skipping credentials email');
        return { success: false, error: 'Transporter not configured' };
      }

      const isSpanish = language === 'es';
      const subject = isSpanish
        ? 'Tus credenciales de acceso a PNPtv'
        : 'Your PNPtv Access Credentials';

      const mailOptions = {
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv" <hello@pnptv.app>',
        to,
        subject,
        html: this.generateCredentialsEmailHtml({ customerName, username, password, loginUrl, language }),
      };

      const result = await this.transporters.pnptv.sendMail(mailOptions);

      logger.info('Credentials email sent successfully', {
        to,
        username,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Error sending credentials email:', { error: error.message, to });
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate HTML for SSO credentials email
   * @private
   */
  generateCredentialsEmailHtml({ customerName, username, password, loginUrl, language = 'es' }) {
    const isSpanish = language === 'es';

    const title = isSpanish ? 'Tus Credenciales PNPtv' : 'Your PNPtv Credentials';
    const greeting = isSpanish ? `Hola <strong>${customerName}</strong>,` : `Hello <strong>${customerName}</strong>,`;
    const intro = isSpanish
      ? 'Tu cuenta SSO de PNPtv ha sido creada automáticamente. Con estas credenciales puedes acceder a <strong>todos los servicios</strong> de la plataforma con un solo inicio de sesión:'
      : 'Your PNPtv SSO account has been created automatically. With these credentials you can access <strong>all platform services</strong> with a single login:';
    const userLabel = isSpanish ? 'Usuario' : 'Username';
    const passLabel = isSpanish ? 'Contraseña' : 'Password';
    const servicesTitle = isSpanish ? 'Servicios incluidos:' : 'Services included:';
    const btnText = isSpanish ? 'Iniciar Sesión en PNPtv' : 'Log in to PNPtv';
    const securityNote = isSpanish
      ? 'Guarda estas credenciales en un lugar seguro. Puedes cambiar tu contraseña después de iniciar sesión en'
      : 'Save these credentials in a safe place. You can change your password after logging in at';
    const footer = isSpanish
      ? 'Este es un correo automático, por favor no respondas directamente.'
      : 'For help or questions, contact <a href="mailto:support@pnptv.app">support@pnptv.app</a>.';

    return `
<!DOCTYPE html>
<html lang="${isSpanish ? 'es' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; padding-bottom: 20px; border-bottom: 3px solid #667eea; }
    .header h1 { color: #667eea; margin: 0; font-size: 28px; }
    .credentials-box { background: #1a1a2e; color: #fff; padding: 25px; border-radius: 8px; margin: 25px 0; font-family: monospace; }
    .credentials-box .label { color: #aaa; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
    .credentials-box .value { font-size: 18px; font-weight: bold; color: #D4007A; margin-bottom: 15px; letter-spacing: 1px; }
    .services-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 15px 0; }
    .service-badge { background: #f0f0ff; color: #667eea; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500; }
    .button { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; }
    .security-note { background: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FFB454; font-size: 13px; }
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PNPtv</h1>
      <p style="color: #666; margin: 8px 0 0;">${title}</p>
    </div>

    <div style="padding: 20px 0;">
      <p>${greeting}</p>
      <p>${intro}</p>

      <div class="credentials-box">
        <div class="label">${userLabel}</div>
        <div class="value">${username}</div>
        <div class="label">${passLabel}</div>
        <div class="value">${password}</div>
      </div>

      <p><strong>${servicesTitle}</strong></p>
      <div class="services-grid">
        <span class="service-badge">PNPtv App</span>
        <span class="service-badge">Matrix Chat</span>
        <span class="service-badge">PNP Live</span>
        <span class="service-badge">Hangouts</span>
        <span class="service-badge">Radio</span>
        <span class="service-badge">Booking</span>
        <span class="service-badge">CMS</span>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" class="button">${btnText}</a>
      </div>

      <div class="security-note">
        <p style="margin: 0;">${securityNote} <a href="https://auth.pnptv.app" style="color: #667eea;">auth.pnptv.app</a></p>
      </div>
    </div>

    <div class="footer">
      <p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p>
      <p>${footer}</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML for invoice email
   * @private
   */
  generateInvoiceEmailHtml({ customerName, invoiceNumber, amount, planName }) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #667eea; }
    .header h1 { color: #667eea; margin: 0; }
    .content { padding: 20px 0; }
    .invoice-details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .invoice-details p { margin: 8px 0; }
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 PNPtv</h1>
      <p>Payment Invoice</p>
    </div>

    <div class="content">
      <p>Dear ${customerName},</p>

      <p>Thank you for your payment. Please find your invoice details below:</p>

      <div class="invoice-details">
        <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
        <p><strong>Plan:</strong> ${planName || 'Subscription'}</p>
        <p><strong>Amount:</strong> $${amount?.toFixed(2) || '0.00'} USD</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <p>Your invoice is attached to this email as a PDF.</p>

      <p>Questions about this invoice? Contact us at <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>

      <p>Best regards,<br>
      <strong>PNPtv Team</strong></p>
    </div>

    <div class="footer">
      <p>PNPtv | billing@pnptv.app</p>
      <p>For help or questions, contact <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML for welcome email
   * @private
   */
  generateWelcomeEmailHtml({ customerName, planName, duration, expiryDate, language = 'es', userUuid, username, loginMethod }) {
    const isSpanish = language === 'es';

    const recoveryInstructionsEs = userUuid ? `
      <div style="background: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FFB454;">
        <p style="margin: 0; color: #333;"><strong>🔑 Recuperación de Cuenta:</strong></p>
        <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Tu ID de recuperación único es: <strong style="font-family: monospace; font-size: 16px; color: #D4007A;">${userUuid}</strong></p>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">Por favor, guarda este ID en un lugar seguro. Es la <strong>única forma</strong> de recuperar el acceso a tu cuenta si pierdes tu método de inicio de sesión.</p>
      </div>
    ` : '';

    const recoveryInstructionsEn = userUuid ? `
      <div style="background: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FFB454;">
        <p style="margin: 0; color: #333;"><strong>🔑 Account Recovery:</strong></p>
        <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Your unique recovery ID is: <strong style="font-family: monospace; font-size: 16px; color: #D4007A;">${userUuid}</strong></p>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">Please save this ID in a safe place. It is the <strong>only way</strong> to recover access to your account if you lose your login method.</p>
      </div>
    ` : '';

    const loginDetailsEs = (username || loginMethod) ? `
      <div style="background: #f0f7ff; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea;">
        <p style="margin: 0; color: #333;"><strong>👤 Detalles de Acceso:</strong></p>
        ${username ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Usuario: <strong>@${username}</strong></p>` : ''}
        ${loginMethod ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Método de inicio: <strong>${loginMethod}</strong></p>` : ''}
      </div>
    ` : '';

    const loginDetailsEn = (username || loginMethod) ? `
      <div style="background: #f0f7ff; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea;">
        <p style="margin: 0; color: #333;"><strong>👤 Access Details:</strong></p>
        ${username ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Username: <strong>@${username}</strong></p>` : ''}
        ${loginMethod ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">Login method: <strong>${loginMethod}</strong></p>` : ''}
      </div>
    ` : '';

    if (isSpanish) {
      return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; padding-bottom: 20px; border-bottom: 3px solid #667eea; }
    .header h1 { color: #667eea; margin: 0; font-size: 32px; }
    .welcome-badge { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .content { padding: 20px 0; }
    .plan-details { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
    .plan-details p { margin: 10px 0; }
    .instructions { background: #e8f4ff; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .instructions h3 { color: #667eea; margin-top: 0; }
    .instructions ol { padding-left: 20px; }
    .instructions li { margin: 10px 0; }
    .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
    .highlight { color: #667eea; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 PNPtv</h1>
    </div>

    <div class="welcome-badge">
      <h2 style="margin: 0;">¡Bienvenido a PNPtv!</h2>
      <p style="margin: 10px 0 0 0;">Tu suscripción está activa</p>
    </div>

    <div class="content">
      <p>Hola <strong>${customerName}</strong>,</p>

      <p>¡Gracias por unirte a PNPtv! Tu pago ha sido procesado exitosamente y tu cuenta ya está activa.</p>

      ${loginDetailsEs}

      <div class="plan-details">
        <p><strong>📦 Plan:</strong> ${planName}</p>
        <p><strong>⏱️ Duración:</strong> ${duration >= 36500 ? 'Acceso de por vida' : `${duration} días`}</p>
        <p><strong>📅 Válido hasta:</strong> ${expiryDate ? new Date(expiryDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Permanente'}</p>
      </div>

      ${recoveryInstructionsEs}

      <div class="instructions">
        <h3>🚀 Cómo acceder a PNPtv:</h3>
        <ol>
          <li><strong>Visita</strong> <a href="https://pnptv.app/welcome" class="highlight">pnptv.app/welcome</a> para comenzar</li>
          <li><strong>Abre Telegram</strong> y busca nuestro bot: <span class="highlight">@PNPtvBot</span></li>
          <li><strong>Tu suscripción ya está activa</strong> - ¡Comienza a disfrutar del contenido!</li>
        </ol>
      </div>

      <div style="background: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #E69138;">
        <p style="margin: 0;"><strong>📎 Guía adjunta:</strong> Hemos adjuntado un PDF con instrucciones detalladas sobre cómo usar cada función de PNPtv. ¡Guárdalo para referencia!</p>
      </div>

      <p style="margin-top: 20px;"><strong>¿Qué puedes hacer con PNPtv?</strong></p>
      <ul>
        <li>📹 Hangouts — Salas de videollamadas comunitarias</li>
        <li>🔴 PNP Live — Transmisiones en vivo</li>
        <li>💬 Social Feed — Publica, comenta y conecta</li>
        <li>📍 Nearby — Descubre miembros cercanos</li>
        <li>⭐ Canal PRIME — Contenido premium en Telegram</li>
      </ul>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://pnptv.app/welcome" class="button">🚀 Comenzar en PNPtv</a>
      </div>

      <p><strong>¿Necesitas ayuda?</strong><br>
      Nuestro equipo de soporte está disponible para ayudarte. Contáctanos en cualquier momento.</p>

      <p style="margin-top: 30px;">¡Disfruta tu experiencia PNPtv!<br>
      <strong>El Equipo de PNPtv</strong></p>
    </div>

    <div class="footer">
      <p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p>
      <p>Este es un correo automático, por favor no respondas directamente a este mensaje.</p>
    </div>
  </div>
</body>
</html>
      `.trim();
    } else {
      // English version
      return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; padding-bottom: 20px; border-bottom: 3px solid #667eea; }
    .header h1 { color: #667eea; margin: 0; font-size: 32px; }
    .welcome-badge { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .content { padding: 20px 0; }
    .plan-details { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
    .plan-details p { margin: 10px 0; }
    .instructions { background: #e8f4ff; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .instructions h3 { color: #667eea; margin-top: 0; }
    .instructions ol { padding-left: 20px; }
    .instructions li { margin: 10px 0; }
    .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .footer { text-align: center; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
    .highlight { color: #667eea; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 PNPtv</h1>
    </div>

    <div class="welcome-badge">
      <h2 style="margin: 0;">Welcome to PNPtv!</h2>
      <p style="margin: 10px 0 0 0;">Your subscription is now active</p>
    </div>

    <div class="content">
      <p>Hello <strong>${customerName}</strong>,</p>

      <p>Thank you for joining PNPtv! Your payment has been processed successfully and your account is now active.</p>

      ${loginDetailsEn}

      <div class="plan-details">
        <p><strong>📦 Plan:</strong> ${planName}</p>
        <p><strong>⏱️ Duration:</strong> ${duration >= 36500 ? 'Lifetime access' : `${duration} days`}</p>
        <p><strong>📅 Valid until:</strong> ${expiryDate ? new Date(expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Permanent'}</p>
      </div>

      ${recoveryInstructionsEn}

      <div class="instructions">
        <h3>🚀 How to access PNPtv:</h3>
        <ol>
          <li><strong>Visit</strong> <a href="https://pnptv.app/welcome" class="highlight">pnptv.app/welcome</a> to get started</li>
          <li><strong>Open Telegram</strong> and search for our bot: <span class="highlight">@PNPtvBot</span></li>
          <li><strong>Your subscription is active</strong> - Start enjoying the content!</li>
        </ol>
      </div>

      <div style="background: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #E69138;">
        <p style="margin: 0;"><strong>📎 Guide attached:</strong> We've attached a PDF with detailed instructions on how to use every feature of PNPtv. Save it for reference!</p>
      </div>

      <p style="margin-top: 20px;"><strong>What can you do with PNPtv?</strong></p>
      <ul>
        <li>📹 Hangouts — Community video call rooms</li>
        <li>🔴 PNP Live — Live streams</li>
        <li>💬 Social Feed — Post, comment, and connect</li>
        <li>📍 Nearby — Discover nearby members</li>
        <li>⭐ PRIME Channel — Premium Telegram content</li>
      </ul>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://pnptv.app/welcome" class="button">🚀 Get Started on PNPtv</a>
      </div>

      <p><strong>Need help?</strong><br>
      Our support team is available to help you anytime.</p>

      <p style="margin-top: 30px;">Enjoy your PNPtv experience!<br>
      <strong>The PNPtv Team</strong></p>
    </div>

    <div class="footer">
      <p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p>
      <p>For help or questions, contact <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>
    </div>
  </div>
</body>
</html>
      `.trim();
    }
  }

  /**
   * Send the combined Founder Lifetime email: Meru code + login credentials + Recovery ID.
   * Bilingual (en/es). Includes 1-hour expiry warning, Pay button, and Activate button.
   * @param {Object} opts
   * @param {string} opts.to - Recipient email address
   * @param {string} [opts.language='es'] - 'en' or 'es'
   * @param {string} opts.meruCode - The reserved Meru code (displayed prominently)
   * @param {string} opts.meruUrl - Full Meru payment link URL
   * @param {string} opts.loginEmail - The user's login email
   * @param {string} opts.loginPassword - Plaintext password (new accounts only)
   * @param {string} opts.recoveryId - User UUID for account recovery
   * @param {string} opts.activationUrl - Deep-link back to /lifetime100/activate?code=...
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendFounderLifetimeEmail({ to, language = 'es', meruCode, meruUrl, loginEmail, loginPassword, recoveryId, activationUrl }) {
    try {
      if (!this.transporters.pnptv) {
        logger.warn('PNPtv transporter not configured, skipping founder email');
        return { success: false, error: 'Transporter not configured' };
      }
      const isEs = language === 'es';
      const subject = isEs
        ? 'Tu Código de Activación PNPtv Founder — Válido 1 Hora'
        : 'Your PNPtv Founder Activation Code — Valid 1 Hour';

      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const safeCode = esc(meruCode);
      const safeMeruUrl = esc(meruUrl);
      const safeActivation = esc(activationUrl);
      const safeEmail = esc(loginEmail);
      const safePassword = esc(loginPassword);
      const safeRecovery = esc(recoveryId);

      const html = isEs ? `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;background:#120d14;color:#F5F5F7;border-radius:16px;">
  <h2 style="color:#FFB454;margin:0 0 6px;font-size:22px;">¡Bienvenido, Founder! 🚀</h2>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">Gracias por apoyarnos mientras terminamos PNPtv. Aquí está tu código de activación de por vida:</p>
  <div style="background:rgba(255,180,84,0.10);border:2px dashed #FFB454;border-radius:12px;padding:20px;text-align:center;margin:18px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;color:#FFB454;text-transform:uppercase;font-weight:700;">Tu código Founder</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:28px;font-weight:900;letter-spacing:2px;color:#fff;">${safeCode}</p>
    <p style="margin:10px 0 0;font-size:12px;color:#ff3377;font-weight:700;">⏱ Válido solo por 1 hora</p>
  </div>
  <ol style="font-size:14px;line-height:1.7;padding-left:20px;margin:18px 0;">
    <li><strong>Paga $100 en Meru</strong> usando el botón abajo.</li>
    <li><strong>Regresa y activa</strong> con el código arriba.</li>
    <li>¡Listo! Miembro de por vida + 2 meses PRIME.</li>
  </ol>
  <div style="text-align:center;margin:22px 0;">
    <a href="${safeMeruUrl}" style="display:inline-block;padding:14px 28px;background:#ff3377;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">💳 Pagar $100 en Meru</a>
    <br/>
    <a href="${safeActivation}" style="display:inline-block;padding:14px 28px;background:#FFB454;color:#120d14;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">✓ Ya pagué — Activar</a>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:24px;padding-top:18px;">
    <p style="margin:0 0 10px;font-size:13px;color:#A1A1A6;font-weight:700;">Tus credenciales de acceso:</p>
    <table style="width:100%;font-size:13px;">
      <tr><td style="padding:3px 0;color:#A1A1A6;">Email:</td><td style="padding:3px 0;font-weight:700;">${safeEmail}</td></tr>
      <tr><td style="padding:3px 0;color:#A1A1A6;">Contraseña:</td><td style="padding:3px 0;font-family:monospace;font-weight:700;">${safePassword}</td></tr>
    </table>
    <div style="margin-top:12px;padding:10px;background:rgba(255,180,84,0.08);border-left:3px solid #FFB454;border-radius:4px;">
      <p style="margin:0;font-size:11px;color:#FFB454;font-weight:700;">🔑 ID de Recuperación</p>
      <p style="margin:4px 0 0;font-family:monospace;font-size:13px;">${safeRecovery}</p>
    </div>
  </div>
  <p style="font-size:11px;color:#8E8E93;margin-top:20px;line-height:1.5;">Si tu código expira antes de completar el pago, solicita uno nuevo en pnptv.app/lifetime100. Precio especial para ayudarnos a terminar la app — algunas funciones aún están en desarrollo.</p>
</div>`
        : `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;background:#120d14;color:#F5F5F7;border-radius:16px;">
  <h2 style="color:#FFB454;margin:0 0 6px;font-size:22px;">Welcome, Founder! 🚀</h2>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">Thanks for backing us while we finish building PNPtv. Here's your lifetime activation code:</p>
  <div style="background:rgba(255,180,84,0.10);border:2px dashed #FFB454;border-radius:12px;padding:20px;text-align:center;margin:18px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;color:#FFB454;text-transform:uppercase;font-weight:700;">Your Founder Code</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:28px;font-weight:900;letter-spacing:2px;color:#fff;">${safeCode}</p>
    <p style="margin:10px 0 0;font-size:12px;color:#ff3377;font-weight:700;">⏱ Valid for 1 hour only</p>
  </div>
  <ol style="font-size:14px;line-height:1.7;padding-left:20px;margin:18px 0;">
    <li><strong>Pay $100 on Meru</strong> using the button below.</li>
    <li><strong>Return and activate</strong> with the code above.</li>
    <li>Done! Lifetime member + 2 months PRIME.</li>
  </ol>
  <div style="text-align:center;margin:22px 0;">
    <a href="${safeMeruUrl}" style="display:inline-block;padding:14px 28px;background:#ff3377;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">💳 Pay $100 on Meru</a>
    <br/>
    <a href="${safeActivation}" style="display:inline-block;padding:14px 28px;background:#FFB454;color:#120d14;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">✓ Already paid — Activate</a>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:24px;padding-top:18px;">
    <p style="margin:0 0 10px;font-size:13px;color:#A1A1A6;font-weight:700;">Your login credentials:</p>
    <table style="width:100%;font-size:13px;">
      <tr><td style="padding:3px 0;color:#A1A1A6;">Email:</td><td style="padding:3px 0;font-weight:700;">${safeEmail}</td></tr>
      <tr><td style="padding:3px 0;color:#A1A1A6;">Password:</td><td style="padding:3px 0;font-family:monospace;font-weight:700;">${safePassword}</td></tr>
    </table>
    <div style="margin-top:12px;padding:10px;background:rgba(255,180,84,0.08);border-left:3px solid #FFB454;border-radius:4px;">
      <p style="margin:0;font-size:11px;color:#FFB454;font-weight:700;">🔑 Recovery ID</p>
      <p style="margin:4px 0 0;font-family:monospace;font-size:13px;">${safeRecovery}</p>
    </div>
  </div>
  <p style="font-size:11px;color:#8E8E93;margin-top:20px;line-height:1.5;">If your code expires before you complete payment, request a new one at pnptv.app/lifetime100. Special fundraising price to help us finish building — some features are still in development.</p>
</div>`;

      const result = await this.transporters.pnptv.sendMail({
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv Founder" <hello@pnptv.app>',
        to,
        subject,
        html,
      });
      logger.info('Founder lifetime email sent', { to, meruCode, messageId: result.messageId });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('sendFounderLifetimeEmail error:', { error: error.message, to });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send token credit notification email.
   * Fires every time tokens are added to a user's wallet (webhook or manual).
   * @param {{ to: string, username: string, tokens: number, newBalance: number, invoiceId: string, provider?: string, usdAmount?: number }} opts
   */
  async sendTokenCreditEmail({ to, username, tokens, newBalance, invoiceId, provider = 'payment', usdAmount }) {
    try {
      if (!this.transporters.pnptv) {
        logger.warn('[TokenCredit] pnptv transporter not configured, skipping');
        return { success: false, error: 'Transporter not configured' };
      }
      if (!to) return { success: false, error: 'No recipient email' };

      const usdLine = usdAmount ? `<p><strong>Monto pagado:</strong> $${parseFloat(usdAmount).toFixed(2)} USD</p>` : '';
      const usdLineEn = usdAmount ? `<p><strong>Amount paid:</strong> $${parseFloat(usdAmount).toFixed(2)} USD</p>` : '';

      const subject = `+${tokens} tokens acreditados en tu cuenta — PNPtv`;

      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.1)}
  .hdr{background:#1C1C1E;padding:24px 30px;text-align:center}
  .hdr h1{color:#fff;margin:0;font-size:26px}.hdr span{color:#D4007A}
  .body{padding:30px}
  .box{background:#f8f9fa;border-left:4px solid #008DE4;padding:16px 20px;border-radius:4px;margin:20px 0}
  .box p{margin:6px 0}
  .balance{font-size:28px;font-weight:bold;color:#008DE4;text-align:center;padding:10px 0}
  .info{background:#eaf4fd;border-radius:6px;padding:14px 18px;margin:16px 0;font-size:13px;color:#444}
  .btn{display:inline-block;margin:20px 0;padding:12px 28px;background:#D4007A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold}
  .ftr{text-align:center;padding:20px;color:#888;font-size:12px;border-top:1px solid #eee}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>PNPtv<span>!</span></h1></div>
  <div class="body">
    <p>Hola <strong>${username || 'amig@'}</strong>,</p>
    <p>¡Tus tokens han sido acreditados!</p>
    <div class="box">
      <p><strong>Tokens recibidos:</strong> +${tokens} tokens</p>
      ${usdLine}
      <p><strong>Referencia:</strong> ${invoiceId}</p>
      <p><strong>Proveedor:</strong> ${provider}</p>
      <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
    </div>
    <div class="balance">Saldo actual: ${newBalance} tokens</div>
    <div class="info">
      <strong>¿Cómo funciona el sistema de tokens?</strong><br><br>
      • <strong>1 token ≈ $0.17 USD</strong> (6 tokens = $1 USD)<br>
      • Necesitas mínimo <strong>60 tokens</strong> para ver un show en vivo<br>
      • Los tokens se usan para ver shows y enviar propinas a tus modelos favoritos<br>
      • El modelo recibe <strong>4 de cada 6 tokens</strong> que gastas<br><br>
      Tu saldo siempre está visible en <strong>Ajustes → Pagos</strong>.
    </div>
    <p>Ve a <a href="https://pnptv.app/live">pnptv.app/live</a> para disfrutar de los shows.</p>
    <a class="btn" href="https://pnptv.app/live">Ver shows en vivo →</a>
    <p>¿Preguntas? Escríbenos a <a href="mailto:support@pnptv.app">support@pnptv.app</a>.</p>
  </div>
  <div class="ftr">
    <p>PNPtv! &middot; <a href="mailto:support@pnptv.app" style="color:inherit;">support@pnptv.app</a></p>
    <p style="font-size:10px;color:#aaa">This email was sent because tokens were added to your PNPtv account.<br>
    ${usdLineEn ? `${tokens} tokens credited for $${parseFloat(usdAmount).toFixed(2)} USD via ${provider}.` : `${tokens} tokens credited via ${provider}.`}</p>
  </div>
</div>
</body></html>`;

      const result = await this.transporters.pnptv.sendMail({
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv" <support@pnptv.app>',
        to,
        subject,
        html,
      });
      logger.info('Token credit email sent', { to, tokens, newBalance, invoiceId, messageId: result.messageId });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('sendTokenCreditEmail error:', { error: error.message, to });
      return { success: false, error: error.message };
    }
  }

  // ── Legacy general-purpose methods (ported from the single-transporter
  //    EmailService — account deletion, main-stage guest promo, broadcasts,
  //    reactivation, recording-ready). All route through the generic send(). ──

  /**
   * Send account deletion confirmation email
   * @param {Object} data - { email, userName, userLanguage }
   * @returns {Promise<Object>} Send result
   */
  async sendAccountDeletionConfirmationEmail(data) {
    const { email, userName = 'Member', userLanguage = 'en' } = data;
    const safeName = this.escapeHtml(userName);
    const isEs = userLanguage === 'es';
    const subject = isEs
      ? 'Tu cuenta de PNPtv! ha sido eliminada'
      : 'Your PNPtv! account has been deleted';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);"><tr><td style="background:linear-gradient(135deg,#1a0a0a,#13131a);padding:32px;text-align:center;"><p style="margin:0;font-size:28px;font-weight:800;background:linear-gradient(135deg,#5ED1C4,#D4007A);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">PNPtv!</p></td></tr><tr><td style="padding:32px;"><h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 16px;">${isEs ? 'Tu cuenta ha sido eliminada' : 'Your account has been deleted'}</h1><p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin:0 0 16px;">${isEs ? `Hola ${safeName},` : `Hi ${safeName},`}</p><p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin:0 0 16px;">${isEs ? 'Hemos procesado tu solicitud. Tu cuenta de PNPtv! y todos los datos asociados han sido eliminados permanentemente de nuestros servidores.' : 'We have processed your request. Your PNPtv! account and all associated data have been permanently deleted from our servers.'}</p><p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;margin:0 0 24px;">${isEs ? 'Si tienes alguna pregunta, puedes contactarnos en support@pnptv.app.' : 'If you have any questions, you can reach us at support@pnptv.app.'}</p><p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">${isEs ? '— El equipo de PNPtv!' : '— The PNPtv! Team'}</p></td></tr><tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;"><p style="color:rgba(255,255,255,0.3);font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} PNPtv! &middot; support@pnptv.app</p></td></tr></table></td></tr></table></body></html>`;
    return await this.send({ to: email, subject, html });
  }

  /**
   * Send Main Stage guest welcome + lifetime100 promo.
   * Triggered when an unauthenticated user redeems a Main Stage invite.
   * @param {Object} data - { to, displayName, language? }
   */
  async sendMainStageGuestPromoEmail(data) {
    const { to, displayName, language, inviteCode } = data || {};
    const isEs = language === 'es';
    const safeName = this.escapeHtml(displayName || (isEs ? 'invitado' : 'guest'));
    const subject = isEs
      ? '🎬 Tu acceso al Main Stage de PNPtv'
      : '🎬 Your Main Stage access on PNPtv';
    const ctaUrl = 'https://pnptv.app/lifetime100';
    const joinUrl = 'https://pnptv.app/join';
    const safeInviteCode = (typeof inviteCode === 'string' && /^[A-Za-z0-9_-]{8,32}$/.test(inviteCode)) ? inviteCode : null;
    const inviteUrl = safeInviteCode ? `https://pnptv.app/main-stage/join/${safeInviteCode}` : null;

    const intro = isEs
      ? (inviteUrl
          ? `¡Hola ${safeName}! Estás dentro del Main Stage de PNPtv. Si pierdes tu sesión (cierras pestaña, expira el navegador, etc.), usa el enlace de abajo para volver a entrar con este mismo invite.`
          : `¡Hola ${safeName}! Gracias por unirte al Main Stage como invitado. Esperamos que la pasaras increíble en cámara.`)
      : (inviteUrl
          ? `Hi ${safeName}! You're in — welcome to PNPtv Main Stage. If you lose your session (close the tab, browser expires, etc.), use the link below to jump back in with this same invite.`
          : `Hi ${safeName}! Thanks for jumping into Main Stage as a guest. We hope you had a great time on cam.`);

    const rejoinBlock = inviteUrl ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:rgba(94,209,196,0.08);border:1px solid rgba(94,209,196,0.35);border-radius:14px;padding:20px;"><p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#FFFFFF;">${isEs ? '🎬 Tu enlace de Main Stage' : '🎬 Your Main Stage link'}</p><p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.78);">${isEs ? 'Guarda este enlace. Te llevará directo al Main Stage como invitado (no necesitas cuenta).' : 'Save this link. It takes you straight into Main Stage as a guest (no account needed).'}</p><a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#5ED1C4,#1A8F8F);color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:800;">${isEs ? 'Entrar al Main Stage →' : 'Enter Main Stage →'}</a><p style="margin:12px 0 0;font-size:11px;color:rgba(255,255,255,0.4);word-break:break-all;">${inviteUrl}</p></td></tr></table>` : '';
    const pitch = isEs
      ? 'Crea tu cuenta gratis para guardar tu perfil, seguir creadores, recibir invitaciones y mucho más. Y si te enganchó la vibra, mira esto:'
      : 'Create a free account to keep your profile, follow creators, receive invites and unlock everything. And if you’re hooked, check this out:';
    const offerTitle = isEs
      ? 'Lifetime100 — paga una vez, accede para siempre'
      : 'Lifetime100 — pay once, access forever';
    const offerBody = isEs
      ? 'Una sola cuota y obtienes acceso PRIME de por vida: video VOD exclusivo, salas premium, descuentos para reservas y los próximos lanzamientos. Cupos muy limitados.'
      : 'One single payment unlocks lifetime PRIME access: exclusive VOD, premium rooms, booking discounts and every upcoming launch. Very limited spots.'
    ;
    const ctaLabel = isEs ? 'Reservar Lifetime100' : 'Claim Lifetime100';
    const joinLabel = isEs ? 'Crear cuenta gratis' : 'Create free account';
    const footer = isEs
      ? 'Si no quieres más correos, ignora este mensaje. — El equipo de PNPtv!'
      : 'If you’d rather not hear from us, just ignore this email. — The PNPtv! Team';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);"><tr><td style="background:linear-gradient(135deg,#1a0a1a,#13131a);padding:32px;text-align:center;"><p style="margin:0;font-size:28px;font-weight:800;background:linear-gradient(135deg,#5ED1C4,#D4007A);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">PNPtv!</p></td></tr><tr><td style="padding:32px;"><h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 16px;">${isEs ? '¡Bienvenido al Main Stage!' : 'Welcome to the Main Stage!'}</h1><p style="color:rgba(255,255,255,0.78);font-size:14px;line-height:1.6;margin:0 0 16px;">${intro}</p>${rejoinBlock}<p style="color:rgba(255,255,255,0.78);font-size:14px;line-height:1.6;margin:0 0 24px;">${pitch}</p><table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr><td style="background:linear-gradient(135deg,rgba(212,0,122,0.15),rgba(123,97,255,0.15));border:1px solid rgba(212,0,122,0.45);border-radius:14px;padding:20px;"><p style="margin:0 0 8px;font-size:16px;font-weight:800;color:#FFFFFF;">${offerTitle}</p><p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.78);">${offerBody}</p><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#D4007A,#7B61FF);color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:800;letter-spacing:0.2px;">${ctaLabel} →</a></td></tr></table><p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.6);">${isEs ? '¿No estás listo todavía? Crea una cuenta gratis primero:' : 'Not ready yet? Create a free account first:'}</p><a href="${joinUrl}" style="display:inline-block;color:#5ED1C4;text-decoration:none;font-size:13px;font-weight:700;border:1px solid rgba(94,209,196,0.45);padding:9px 18px;border-radius:999px;">${joinLabel}</a><p style="color:rgba(255,255,255,0.4);font-size:12px;margin:28px 0 0;">${footer}</p></td></tr><tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;"><p style="color:rgba(255,255,255,0.3);font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} PNPtv! &middot; support@pnptv.app</p></td></tr></table></td></tr></table></body></html>`;

    return await this.send({ to, subject, html });
  }

  /**
   * Send broadcast email to user
   * @param {Object} data - Broadcast data
   * @returns {Promise<Object>} Send result
   */
  async sendBroadcastEmail(data) {
    const {
      email,
      userName = 'PNPtv! Member',
      messageEn,
      messageEs,
      userLanguage = 'en',
      mediaUrl = null,
      buttons = [],
      subjectEn = null,
      subjectEs = null,
      preheaderEn = null,
      preheaderEs = null
    } = data;

    const message = userLanguage === 'es' ? messageEs : messageEn;
    const subject = userLanguage === 'es'
      ? (subjectEs || 'PNPtv! — Novedades')
      : (subjectEn || 'PNPtv! — Latest Update');
    const preheader = userLanguage === 'es' ? preheaderEs : preheaderEn;
    const html = this.getBroadcastEmailTemplate({
      userName,
      message,
      mediaUrl,
      buttons,
      language: userLanguage,
      preheader
    });

    return await this.send({
      to: email,
      subject,
      html,
      from: process.env.PNPTV_FROM_EMAIL || 'PNPtv! <noreply@pnptv.app>'
    });
  }

  /**
   * Send broadcast emails to multiple users
   * @param {Array} users - Array of user objects with email
   * @param {Object} broadcastData - Broadcast content
   * @returns {Promise<Object>} Results summary
   */
  async sendBroadcastEmails(users, broadcastData) {
    const { messageEn, messageEs, mediaUrl, buttons, subjectEn, subjectEs, preheaderEn, preheaderEs } = broadcastData;

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const user of users) {
      if (!user.email || !this.isEmailSafe(user.email)) {
        continue; // Skip users without valid email
      }

      try {
        await this.sendBroadcastEmail({
          email: user.email,
          userName: user.first_name || user.username || 'PNPtv! Member',
          messageEn,
          messageEs,
          userLanguage: user.language || 'en',
          mediaUrl,
          buttons,
          subjectEn,
          subjectEs,
          preheaderEn,
          preheaderEs
        });
        sent++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failed++;
        errors.push({ email: user.email, error: error.message });
      }
    }

    return { sent, failed, errors };
  }

  /**
   * Send creator-account-activated email
   * @param {Object} data - { to, name, language }
   * @returns {Promise<Object>} Send result
   */
  async sendCreatorActivatedEmail({ to, name = 'Creator', language = 'en' }) {
    const isEs = language.startsWith('es');
    const safeName = this.escapeHtml(name);
    const subject = isEs
      ? '🎉 ¡Tu cuenta de creador en PNPtv ha sido activada!'
      : '🎉 Your PNPtv creator account is now live!';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d0d0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="font-size:40px">🎉</span>
      <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:12px 0 4px;">
        ${isEs ? `¡Bienvenido al equipo, ${safeName}!` : `Welcome to the team, ${safeName}!`}
      </h1>
      <p style="color:#8E8E93;font-size:14px;margin:0;">
        ${isEs ? 'Tu cuenta de creador en PNPtv está activa' : 'Your PNPtv creator account is active'}
      </p>
    </div>

    <div style="background:#1C1C1E;border-radius:16px;padding:24px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.08);">
      <p style="color:#E5E5EA;font-size:15px;line-height:1.6;margin:0 0 16px;">
        ${isEs
            ? `Tu perfil de creador ha sido activado. Ya puedes publicar contenido exclusivo, configurar tu precio de suscripción y conectar con tu audiencia en PNPtv.`
            : `Your creator profile has been activated. You can now post exclusive content, set your subscription price, and connect with your audience on PNPtv.`}
      </p>
      <ul style="color:#E5E5EA;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
        <li>${isEs ? 'Publica contenido exclusivo para tus suscriptores' : 'Post exclusive content for your subscribers'}</li>
        <li>${isEs ? 'Configura tu precio de suscripción mensual' : 'Set your monthly subscription price'}</li>
        <li>${isEs ? 'Transmite en vivo desde tu canal personal' : 'Go live on your personal channel'}</li>
        <li>${isEs ? 'Ofrece llamadas privadas y sesiones personalizadas' : 'Offer private calls and personalized sessions'}</li>
      </ul>
    </div>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://pnptv.app/profile"
         style="display:inline-block;background:linear-gradient(135deg,#D4007A,#E69138);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;">
        ${isEs ? 'Ver mi perfil' : 'View my profile'}
      </a>
    </div>

    <p style="color:#8E8E93;font-size:12px;text-align:center;margin:0;">
      PNPtv! &mdash; ${isEs ? 'La comunidad queer PNP' : 'The queer PNP community'}
    </p>
  </div>
</body></html>`;

    return await this.send({ to, subject, html, from: process.env.PNPTV_FROM_EMAIL || 'PNPtv! <noreply@pnptv.app>' });
  }

  /**
   * Send reactivation email
   * @param {Object} data - Reactivation email data
   * @returns {Promise<Object>} Send result
   */
  async sendReactivationEmail(data) {
    const { email, userName = 'PNPtv! Member', lifetimeDealLink, telegramLink, userLanguage = 'en' } = data;

    const subject = userLanguage === 'es' ? '🔥 PNPtv! Está de Vuelta 🔥' : '🔥 PNPtv! IS BACK 🔥';
    const html = this.getReactivationEmailTemplate({ lifetimeDealLink, telegramLink, language: userLanguage });

    return await this.send({
      to: email,
      subject: subject,
      html,
      from: process.env.PNPTV_FROM_EMAIL || 'PNPtv! <noreply@pnptv.app>'
    });
  }

  /**
   * Send recording ready notification
   * @param {Object} data - Recording data
   * @returns {Promise<Object>} Send result
   */
  async sendRecordingReady(data) {
    const {
      email,
      roomTitle,
      recordingUrl,
      downloadUrl,
      duration,
      fileSize
    } = data;

    const html = this.getRecordingReadyTemplate({
      roomTitle,
      recordingUrl,
      downloadUrl,
      fileSize,
      duration
    });

    return await this.send({
      to: email,
      subject: `📹 Your Recording is Ready - ${roomTitle}`,
      html
    });
  }

  /**
   * Get broadcast email template
   * @param {Object} data - Template data
   * @returns {string} HTML template
   */
  getBroadcastEmailTemplate(data) {
    const { userName, message, mediaUrl, buttons, language, preheader } = data;

    const isSpanish = language === 'es';
    const greeting = isSpanish ? `¡Hola ${userName}!` : `Hey ${userName}!`;
    const footerText = isSpanish
      ? 'Recibiste este correo porque eres miembro de PNPtv!'
      : 'You received this email because you are a member of PNPtv!';
    const unsubText = isSpanish
      ? 'Para dejar de recibir estos correos, actualiza tus preferencias en el bot.'
      : 'To stop receiving these emails, update your preferences in the bot.';

    // Build button HTML
    let buttonsHtml = '';
    if (buttons && buttons.length > 0) {
      const buttonItems = buttons.map(btn => {
        const buttonObj = typeof btn === 'string' ? JSON.parse(btn) : btn;
        if (buttonObj.type === 'url' && buttonObj.target) {
          return `<a href="${buttonObj.target}" class="button">${buttonObj.text}</a>`;
        }
        return '';
      }).filter(b => b).join('\n');

      if (buttonItems) {
        buttonsHtml = `<div style="text-align: center; margin: 25px 0;">${buttonItems}</div>`;
      }
    }

    // Media HTML
    const mediaHtml = mediaUrl
      ? `<div style="text-align: center; margin: 20px 0;"><img src="${mediaUrl}" alt="PNPtv!" style="max-width: 100%; border-radius: 10px;"></div>`
      : '';

    // Convert message line breaks to HTML
    const formattedMessage = message
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    const preheaderText = preheader
      ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;">${preheader}</span>`
      : '';

    return `
<!DOCTYPE html>
<html lang="${isSpanish ? 'es' : 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #1a1a2e;
        }
        .container {
            background: linear-gradient(135deg, #16213e 0%, #1a1a2e 100%);
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            color: #ffffff;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            background: linear-gradient(90deg, #e94560, #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .greeting {
            font-size: 22px;
            margin-bottom: 20px;
            color: #ff6b6b;
        }
        .content {
            font-size: 16px;
            line-height: 1.8;
            color: #e0e0e0;
        }
        .button {
            display: inline-block;
            background: linear-gradient(90deg, #e94560, #ff6b6b);
            color: white !important;
            padding: 14px 35px;
            text-decoration: none;
            border-radius: 50px;
            font-weight: bold;
            margin: 10px 5px;
            transition: transform 0.3s, box-shadow 0.3s;
        }
        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(233, 69, 96, 0.4);
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
            color: #888;
            font-size: 12px;
        }
        .social-links {
            margin: 15px 0;
        }
        .social-links a {
            color: #e94560;
            text-decoration: none;
            margin: 0 10px;
        }
    </style>
</head>
<body>
    ${preheaderText}
    <div class="container">
        <div class="header">
            <div class="logo">🔥 PNPtv!</div>
        </div>

        <h1 class="greeting">${greeting}</h1>

        ${mediaHtml}

        <div class="content">
            ${formattedMessage}
        </div>

        ${buttonsHtml}

        <div style="text-align: center; margin-top: 30px;">
            <a href="https://t.me/pnplatinotv_bot" class="button">💬 Open Bot</a>
        </div>

        <div class="footer">
            <div class="social-links">
                <a href="https://t.me/pnplatinotv_bot">Telegram</a>
            </div>
            <p>${footerText}</p>
            <p>${unsubText}</p>
            <p>© ${new Date().getFullYear()} PNPtv!. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
  }

  /**
   * Get reactivation email template
   * @param {Object} data - Template data
   * @returns {string} HTML template
   */
  getReactivationEmailTemplate(data) {
    const { lifetimeDealLink = "https://pnptv.app/lifetime100", telegramLink = "https://t.me/pnplatinotv_bot", language = 'es' } = data;

    const spanishTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>PNPtv! Está de Vuelta</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #ffffff;
      background-color: #0b0b0f; /* Dark background */
    }
    .container {
      background-color: #1a1a2e; /* Slightly lighter dark background for content */
      border-radius: 15px;
      box-shadow: 0 8px 25px rgba(0, 229, 255, 0.2); /* Neon blue shadow */
      padding: 20px;
      margin: 20px auto; /* Center on page */
      max-width: 600px;
      border: 1px solid #00e5ff; /* Neon blue border */
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #ff00cc; /* Fuchsia divider */
      margin-bottom: 20px;
    }
    h1 {
      color: #ff00cc; /* Fuchsia */
      font-size: 32px;
      margin-bottom: 5px;
      text-shadow: 0 0 10px rgba(255, 0, 204, 0.7); /* Neon glow */
    }
    h2 {
      color: #00e5ff; /* Neon Blue */
      font-size: 24px;
      margin-top: 0;
      text-shadow: 0 0 8px rgba(0, 229, 255, 0.7); /* Neon glow */
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #dddddd;
      margin-bottom: 15px;
    }
    .button-primary {
      display: inline-block;
      background-color: #ff00cc; /* Fuchsia */
      color: #ffffff !important;
      padding: 15px 30px;
      text-decoration: none;
      border-radius: 50px; /* Pill shape */
      font-weight: bold;
      font-size: 18px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(255, 0, 204, 0.4);
      border: none;
    }
    .button-primary:hover {
      background-color: #e600b8; /* Darker fuchsia on hover */
      box-shadow: 0 6px 20px rgba(255, 0, 204, 0.6);
      transform: translateY(-2px);
    }
    .button-secondary {
      color: #00e5ff !important; /* Neon Blue */
      font-size: 16px;
      text-decoration: none;
      font-weight: bold;
      transition: color 0.3s ease;
    }
    .button-secondary:hover {
      color: #00b8cc !important; /* Darker neon blue on hover */
    }
    .footer-text {
      font-size: 13px;
      color: #666666;
      margin-top: 20px;
    }
    .highlight {
      color: #00e5ff; /* Highlight words with neon blue */
      font-weight: bold;
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0b0f;">
    <tr>
      <td align="center">
        <table class="container" width="600" cellpadding="20" cellspacing="0">

          <tr>
            <td class="header">
              <h1>🔥 PNP LATINO TV ESTÁ DE VUELTA 🔥</h1>
              <h2>Más Caliente Que Nunca</h2>
            </td>
          </tr>

          <tr>
            <td>
              <p>
                <span class="highlight">PNPtv!</span> está de vuelta — <span class="highlight">más 🔥 que nunca</span>.
              </p>
              <p>
                Después de cada intento de cierre, nos levantamos más fuertes, trayéndote el contenido que amas y un bot de nueva generación construido para mantener a nuestra comunidad más unida que nunca.
              </p>
              <p>
                Disfruta de tus videos favoritos, explora nuevas experiencias como Nearby, Hangouts y PNP Live, y reconecta con un espacio donde la <span class="highlight">libertad, la conexión y el placer</span> se encuentran.
              </p>
              <p style="text-align: center; font-style: italic; font-size: 18px; color: #ff00cc;">
                Tu espacio. Tu gente. Tu momento.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top: 0;">
              <a href="${lifetimeDealLink}" class="button-primary">
                🔥 Lifetime Hot Deal
              </a>
            </td>
          </tr>

          <tr>
            <td align="center">
              <p style="margin-bottom: 0;">Suscríbete ahora y vuelve a encender el 🔥.</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top: 10px;">
              <a href="${telegramLink}" class="button-secondary">
                Suscríbete al canal y únete a la comunidad
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" class="footer-text">
              PNPtv! — Comunidad • Conexión • Placer
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const englishTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PNPtv! Is Back</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #ffffff;
      background-color: #0b0b0f; /* Dark background */
    }
    .container {
      background-color: #1a1a2e; /* Slightly lighter dark background for content */
      border-radius: 15px;
      box-shadow: 0 8px 25px rgba(0, 229, 255, 0.2); /* Neon blue shadow */
      padding: 20px;
      margin: 20px auto; /* Center on page */
      max-width: 600px;
      border: 1px solid #00e5ff; /* Neon blue border */
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #ff00cc; /* Fuchsia divider */
      margin-bottom: 20px;
    }
    h1 {
      color: #ff00cc; /* Fuchsia */
      font-size: 32px;
      margin-bottom: 5px;
      text-shadow: 0 0 10px rgba(255, 0, 204, 0.7); /* Neon glow */
    }
    h2 {
      color: #00e5ff; /* Neon Blue */
      font-size: 24px;
      margin-top: 0;
      text-shadow: 0 0 8px rgba(0, 229, 255, 0.7); /* Neon glow */
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #dddddd;
      margin-bottom: 15px;
    }
    .button-primary {
      display: inline-block;
      background-color: #ff00cc; /* Fuchsia */
      color: #ffffff !important;
      padding: 15px 30px;
      text-decoration: none;
      border-radius: 50px; /* Pill shape */
      font-weight: bold;
      font-size: 18px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(255, 0, 204, 0.4);
      border: none;
    }
    .button-primary:hover {
      background-color: #e600b8; /* Darker fuchsia on hover */
      box-shadow: 0 6px 20px rgba(255, 0, 204, 0.6);
      transform: translateY(-2px);
    }
    .button-secondary {
      color: #00e5ff !important; /* Neon Blue */
      font-size: 16px;
      text-decoration: none;
      font-weight: bold;
      transition: color 0.3s ease;
    }
    .button-secondary:hover {
      color: #00b8cc !important; /* Darker neon blue on hover */
    }
    .footer-text {
      font-size: 13px;
      color: #666666;
      margin-top: 20px;
    }
    .highlight {
      color: #00e5ff; /* Highlight words with neon blue */
      font-weight: bold;
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0b0f;">
    <tr>
      <td align="center">
        <table class="container" width="600" cellpadding="20" cellspacing="0">

          <tr>
            <td class="header">
              <h1>🔥 PNPtv! IS BACK 🔥</h1>
              <h2>Hotter Than Ever</h2>
            </td>
          </tr>

          <tr>
            <td>
              <p>
                <span class="highlight">PNPtv!</span> is back — <span class="highlight">hotter than ever</span>.
              </p>
              <p>
                After every shutdown attempt, we rise stronger, bringing you the content you love and a new generation bot built to keep our community closer than ever.
              </p>
              <p>
                Enjoy your favorite videos, explore new experiences like Nearby, Hangouts, and PNP Live, and reconnect with a space where <span class="highlight">freedom, connection, and pleasure</span> meet.
              </p>
              <p style="text-align: center; font-style: italic; font-size: 18px; color: #ff00cc;">
                Your space. Your people. Your moment.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top: 0;">
              <a href="${lifetimeDealLink}" class="button-primary">
                🔥 Lifetime Hot Deal
              </a>
            </td>
          </tr>

          <tr>
            <td align="center">
              <p style="margin-bottom: 0;">Subscribe now and turn the heat back on. 🔥</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top: 10px;">
              <a href="${telegramLink}" class="button-secondary">
                Join the community & subscribe to our channel
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" class="footer-text">
              PNPtv! — Community • Connection • Pleasure
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return language === 'es' ? spanishTemplate : englishTemplate;
  }

  /**
   * Get recording ready template
   * @param {Object} data - Template data
   * @returns {string} HTML template
   */
  getRecordingReadyTemplate(data) {
    const { roomTitle, recordingUrl, downloadUrl, duration, fileSize } = data;

    const fileSizeMB = fileSize ? (fileSize / 1024 / 1024).toFixed(2) : 'N/A';
    const durationMin = duration ? Math.floor(duration / 60) : 'N/A';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .button {
            display: inline-block;
            background: #2D8CFF;
            color: white !important;
            padding: 15px 40px;
            text-decoration: none;
            border-radius: 50px;
            font-weight: bold;
            margin: 10px 5px;
        }
        .info-box {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #2D8CFF;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 style="color: #2D8CFF;">📹 Your Recording is Ready!</h1>

        <p>The recording for <strong>${roomTitle}</strong> has been processed and is ready to view.</p>

        <div class="info-box">
            <p><strong>Duration:</strong> ${durationMin} minutes</p>
            <p><strong>File Size:</strong> ${fileSizeMB} MB</p>
        </div>

        <div style="text-align: center;">
            <a href="${recordingUrl}" class="button">▶️ Watch</a>
            ${downloadUrl ? `<a href="${downloadUrl}" class="button">⬇️ Download</a>` : ''}
        </div>

        <p style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
            <strong>PNP.tv</strong> - Premium Zoom Meetings
        </p>
    </div>
</body>
</html>
        `;
  }

  /**
   * Send a token-purchase activation-code email for the /live Meru flow.
   * The user receives:
   *   1. A monospace 12-char activation code box
   *   2. "Pay on Meru" button → meruUrl
   *   3. "Already paid — Activate" button → activationUrl
   *   4. 3-step instructions + 60-min expiry notice
   *
   * @param {{ to: string, language?: string, activationCode: string, meruUrl: string,
   *            activationUrl: string, packageLabel: string, tokens: number,
   *            usdAmount: number, expiresAt: Date }} opts
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendTokenActivationEmail({ to, language = 'es', activationCode, meruUrl, activationUrl, packageLabel, tokens, usdAmount, expiresAt }) {
    try {
      if (!this.transporters.pnptv) {
        logger.warn('PNPtv transporter not configured, skipping token activation email');
        return { success: false, error: 'Transporter not configured' };
      }

      const isEs = language === 'es';
      const safeCode = String(activationCode || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Reject anything that isn't an https:// URL — defense-in-depth against
      // a poisoned meru_link value making its way into a mailto/javascript: href.
      const rawMeruUrl = String(meruUrl || '');
      const safeMeruUrl = /^https:\/\//i.test(rawMeruUrl) ? rawMeruUrl.replace(/"/g, '%22') : '#';
      const rawActivationUrl = String(activationUrl || '');
      const safeActivationUrl = /^https:\/\//i.test(rawActivationUrl) ? rawActivationUrl.replace(/"/g, '%22') : '#';
      const safePkgLabel = String(packageLabel || `${tokens} tokens ($${usdAmount})`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const expiryStr = expiresAt
        ? new Date(expiresAt).toLocaleTimeString(isEs ? 'es-MX' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
        : '60 min';

      const subject = isEs
        ? `Tu Código de Activación PNPtv Tokens — ${safePkgLabel} — Válido 1 Hora`
        : `Your PNPtv Token Activation Code — ${safePkgLabel} — Valid 1 Hour`;

      const html = isEs ? `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;background:#120d14;color:#F5F5F7;border-radius:16px;">
  <h2 style="color:#FFB454;margin:0 0 6px;font-size:22px;">¡Tus Tokens PNPtv! 🪙</h2>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">Compraste <strong>${safePkgLabel}</strong>. Aquí está tu código de activación:</p>
  <div style="background:rgba(255,180,84,0.10);border:2px dashed #FFB454;border-radius:12px;padding:20px;text-align:center;margin:18px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;color:#FFB454;text-transform:uppercase;font-weight:700;">Tu Código de Activación</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:28px;font-weight:900;letter-spacing:3px;color:#fff;">${safeCode}</p>
    <p style="margin:10px 0 0;font-size:12px;color:#ff3377;font-weight:700;">⏱ Válido solo por 1 hora (expira ~${expiryStr})</p>
  </div>
  <ol style="font-size:14px;line-height:1.7;padding-left:20px;margin:18px 0;">
    <li><strong>Paga $${usdAmount} en Meru</strong> usando el botón de abajo.</li>
    <li><strong>Regresa a PNPtv</strong> en la página /live.</li>
    <li><strong>Ingresa el código</strong> de arriba y haz clic en "Activar".</li>
  </ol>
  <div style="text-align:center;margin:22px 0;">
    <a href="${safeMeruUrl}" style="display:inline-block;padding:14px 28px;background:#ff3377;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">💳 Pagar $${usdAmount} en Meru</a>
    <br/>
    <a href="${safeActivationUrl}" style="display:inline-block;padding:14px 28px;background:#FFB454;color:#120d14;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">✓ Ya pagué — Activar</a>
  </div>
  <div style="margin-top:18px;padding:12px;background:rgba(255,255,255,0.04);border-left:3px solid #FFB454;border-radius:4px;">
    <p style="margin:0;font-size:11px;color:#FFB454;font-weight:700;">🔑 ID de Recuperación (guarda esto)</p>
    <p style="margin:4px 0 0;font-family:monospace;font-size:13px;color:#F5F5F7;">${safeCode}</p>
  </div>
  <p style="font-size:11px;color:#8E8E93;margin-top:20px;line-height:1.5;">Si tu código expira antes de completar el pago, regresa a pnptv.app/live y solicita uno nuevo. Los tokens se acreditan instantáneamente al activar.</p>
</div>` : `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;background:#120d14;color:#F5F5F7;border-radius:16px;">
  <h2 style="color:#FFB454;margin:0 0 6px;font-size:22px;">Your PNPtv Tokens! 🪙</h2>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">You're purchasing <strong>${safePkgLabel}</strong>. Here is your activation code:</p>
  <div style="background:rgba(255,180,84,0.10);border:2px dashed #FFB454;border-radius:12px;padding:20px;text-align:center;margin:18px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.1em;color:#FFB454;text-transform:uppercase;font-weight:700;">Your Activation Code</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:28px;font-weight:900;letter-spacing:3px;color:#fff;">${safeCode}</p>
    <p style="margin:10px 0 0;font-size:12px;color:#ff3377;font-weight:700;">⏱ Valid for 1 hour only (expires ~${expiryStr})</p>
  </div>
  <ol style="font-size:14px;line-height:1.7;padding-left:20px;margin:18px 0;">
    <li><strong>Pay $${usdAmount} on Meru</strong> using the button below.</li>
    <li><strong>Return to PNPtv</strong> on the /live page.</li>
    <li><strong>Enter the code</strong> above and click "Activate".</li>
  </ol>
  <div style="text-align:center;margin:22px 0;">
    <a href="${safeMeruUrl}" style="display:inline-block;padding:14px 28px;background:#ff3377;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">💳 Pay $${usdAmount} on Meru</a>
    <br/>
    <a href="${safeActivationUrl}" style="display:inline-block;padding:14px 28px;background:#FFB454;color:#120d14;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;margin:4px;">✓ Already paid — Activate</a>
  </div>
  <div style="margin-top:18px;padding:12px;background:rgba(255,255,255,0.04);border-left:3px solid #FFB454;border-radius:4px;">
    <p style="margin:0;font-size:11px;color:#FFB454;font-weight:700;">🔑 Recovery ID (save this)</p>
    <p style="margin:4px 0 0;font-family:monospace;font-size:13px;color:#F5F5F7;">${safeCode}</p>
  </div>
  <p style="font-size:11px;color:#8E8E93;margin-top:20px;line-height:1.5;">If your code expires before you complete payment, return to pnptv.app/live and request a new one. Tokens are credited instantly on activation.</p>
</div>`;

      const result = await this.transporters.pnptv.sendMail({
        from: process.env.PNPTV_FROM_EMAIL || '"PNPtv" <support@pnptv.app>',
        to,
        subject,
        html,
      });
      logger.info('Token activation email sent', { to, activationCode, packageLabel, messageId: result.messageId });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('sendTokenActivationEmail error:', { error: error.message, to });
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify email transporter connections
   * @returns {Promise<boolean>} True if at least one transporter verifies
   */
  async verifyConnection() {
    let ok = false;
    for (const [name, transporter] of Object.entries(this.transporters)) {
      if (!transporter) continue;
      try {
        await transporter.verify();
        logger.info(`Email transporter '${name}' verified successfully`);
        ok = true;
      } catch (error) {
        logger.error(`Email transporter '${name}' verification failed:`, error);
      }
    }
    return ok;
  }
}

// Export singleton instance
/**
 * Weekly creator payout proposal — Mondays 09:00 America/Bogota.
 * Sends a bilingual (ES/EN) reminder with the balance + method snapshot and
 * a deep-link to the approval banner on /creator/earnings.
 */
EmailService.prototype.sendCreatorWeeklyPayoutProposal = async function sendCreatorWeeklyPayoutProposal({
  to,
  displayName,
  language,
  approvalId,
  balanceUsd,
  balanceCop,
  methodLabel,
  country,
  isEmergency,
  adminNote,
}) {
  const es = String(language || 'en').toLowerCase().startsWith('es');
  const base = process.env.APP_PUBLIC_URL || 'https://pnptv.app';
  const url = `${base}/creator/earnings?approve=${encodeURIComponent(approvalId)}`;
  const showCop = country && country.toLowerCase().startsWith('col');
  const usd = Number(balanceUsd || 0).toFixed(2);
  const cop = balanceCop ? Number(balanceCop).toLocaleString('es-CO') : null;

  const subject = isEmergency
    ? (es
        ? `🚨 Adelanto de pago PNPtv! — $${usd} USD listo para aprobar`
        : `🚨 PNPtv! emergency advance — $${usd} USD ready to approve`)
    : (es
        ? `Tu pago semanal PNPtv! está listo — $${usd} USD`
        : `Your weekly PNPtv! payout is ready — $${usd} USD`);

  const noteBlock = adminNote
    ? (es
        ? `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;margin:12px 0"><p style="margin:0;font-size:12px;color:#8a6d3b;font-weight:600">Nota del equipo:</p><p style="margin:4px 0 0;font-size:13px;color:#333">${adminNote}</p></div>`
        : `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px;margin:12px 0"><p style="margin:0;font-size:12px;color:#8a6d3b;font-weight:600">Note from team:</p><p style="margin:4px 0 0;font-size:13px;color:#333">${adminNote}</p></div>`)
    : '';

  const introEs = isEmergency
    ? 'Te habilitamos un <strong>adelanto excepcional</strong> de tu saldo disponible. Aprueba cuando quieras — no tiene deadline semanal.'
    : 'Tu saldo acumulado esta semana está listo para aprobación.';
  const introEn = isEmergency
    ? 'We\'ve opened an <strong>exceptional advance</strong> of your available balance. Approve whenever you\'re ready — no weekly deadline.'
    : 'Your weekly balance is ready for your approval.';
  const deadlineEs = isEmergency
    ? '<p style="color:#888;font-size:12px">Este adelanto queda abierto hasta que apruebes o rechaces.</p>'
    : '<p><strong>Aprueba antes de las 4pm (Bogotá) para que se procese mañana martes.</strong> Puedes cambiar tu método al aprobar.</p><p style="color:#888;font-size:12px">Si no apruebas hoy, el saldo se acumula para la propuesta del próximo lunes — no se pierde.</p>';
  const deadlineEn = isEmergency
    ? '<p style="color:#888;font-size:12px">This advance stays open until you approve or reject.</p>'
    : '<p><strong>Approve before 4pm (Bogota) so we can process tomorrow (Tuesday).</strong> You can change your payout method when you approve.</p><p style="color:#888;font-size:12px">If you don\'t approve today, the balance rolls over to next Monday\'s proposal — nothing is lost.</p>';

  const html = es
    ? `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
        <h2 style="color:#D4007A;margin:0 0 8px">Hola ${displayName},</h2>
        <p>${introEs}</p>
        ${noteBlock}
        <div style="background:#faf5f8;border:1px solid #f0d5e5;border-radius:12px;padding:20px;margin:16px 0">
          <p style="margin:0;font-size:12px;color:#888">Monto a pagar</p>
          <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#D4007A">$${usd} USD</p>
          ${showCop && cop ? `<p style="margin:2px 0 0;font-size:14px;color:#666">≈ COP $${cop}</p>` : ''}
          <p style="margin:12px 0 0;font-size:12px;color:#888">Método de pago actual: <strong>${methodLabel}</strong></p>
        </div>
        ${deadlineEs}
        <p style="margin:24px 0"><a href="${url}" style="background:#D4007A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Revisar y aprobar</a></p>
      </div>`
    : `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222">
        <h2 style="color:#D4007A;margin:0 0 8px">Hi ${displayName},</h2>
        <p>${introEn}</p>
        ${noteBlock}
        <div style="background:#faf5f8;border:1px solid #f0d5e5;border-radius:12px;padding:20px;margin:16px 0">
          <p style="margin:0;font-size:12px;color:#888">Amount</p>
          <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#D4007A">$${usd} USD</p>
          ${showCop && cop ? `<p style="margin:2px 0 0;font-size:14px;color:#666">≈ COP $${cop}</p>` : ''}
          <p style="margin:12px 0 0;font-size:12px;color:#888">Current payout method: <strong>${methodLabel}</strong></p>
        </div>
        ${deadlineEn}
        <p style="margin:24px 0"><a href="${url}" style="background:#D4007A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Review and approve</a></p>
      </div>`;

  return this.send({ to, subject, html });
};

module.exports = new EmailService();
