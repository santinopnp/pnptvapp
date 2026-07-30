const { Markup } = require('telegraf');
const UserService = require('../../../services/userService');
const UserModel = require('../../../models/userModel');
const { t } = require('../../../utils/i18n');
const { isValidEmail } = require('../../../utils/validation');
const logger = require('../../../utils/logger');
const { getLanguage } = require('../../utils/helpers');
const { showMainMenu, showStartMenu } = require('./menu');
const { showEditProfileOverview } = require('./profile');
const paymentHandlers = require('../payments');
const { showNearbyMenu } = require('./nearbyUnified');
const supportRoutingService = require('../../../services/supportRoutingService');
const { handlePromoDeepLink } = require('../promo/promoHandler');
const { activateMembership, fetchActivationCode, markCodeUsed, logActivation } = require('../payments/activation');
const { query } = require('../../../config/postgres');
const { getRedis } = require('../../../config/redis');

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://pnptv.app';
const SubscriptionService = require('../../../services/subscriptionService');
const MessageTemplates = require('../../../services/messageTemplates');
const BusinessNotificationService = require('../../../services/businessNotificationService');
const meruPaymentService = require('../../../services/meruPaymentService');
const meruLinkService = require('../../../services/meruLinkService');
const PaymentHistoryService = require('../../../services/paymentHistoryService');

const activationStrings = {
  en: {
    thanks: "Thank you for your purchase!\n\nTo activate your *Lifetime Pass*, please press the button below and send us your confirmation code.",
    sendCodeButton: "✉️ Send My Confirmation Code",
    promptCode: "Please send your payment confirmation code:",
    invalidCodeFormat: "❌ Invalid code format. Please send the code as plain text.",
    codeNotFound: "❌ Code not found or invalid. Please check your code and try again.",
    paymentExpiredOrPaid: "✅ Your Lifetime Pass has been activated! Welcome to PRIME!\n\n🌟 Your full access is ready — open the app:\n👉 {webappUrl}",
    paymentNotCompleted: "⚠️ We could not confirm your payment. Please ensure your payment is complete and try again. If you forgot your code, please use the 'Recover my Code' option in /support and send a screenshot of your bank statement showing the amount, date, and hour of payment.",
    errorActivating: "❌ An error occurred during activation. Please try again later.",
    receiptReceived: "✅ Receipt received. Our team will review and activate your account soon."
  },
  es: {
    thanks: "¡Muchas gracias por tu compra!\n\nPara activar tu *Lifetime Pass*, por favor presiona el botón de abajo y envíanos tu código de confirmación.",
    sendCodeButton: "✉️ Enviar mi código de confirmación",
    promptCode: "Por favor, envía tu código de confirmación de pago:",
    invalidCodeFormat: "❌ Formato de código inválido. Por favor, envía el código como texto simple.",
    codeNotFound: "❌ Código no encontrado o inválido. Si olvidaste tu código, por favor usa la opción 'Recuperar mi Código' en /support y envía un screenshot de tu movimiento bancario donde se vea monto, fecha y hora.",
    paymentExpiredOrPaid: "✅ ¡Tu Lifetime Pass ha sido activado! ¡Bienvenido a PRIME!\n\n🌟 Tu acceso completo está listo — abre la app:\n👉 {webappUrl}",
    paymentNotCompleted: "⚠️ No pudimos confirmar tu pago. Asegúrate de que el pago esté completo. Si olvidaste tu código, usa 'Recuperar mi Código' en /support con un screenshot de tu movimiento bancario.",
    errorActivating: "❌ Ocurrió un error durante la activación. Por favor, inténtalo de nuevo más tarde.",
    receiptReceived: "✅ Recibo recibido. Nuestro equipo revisará y activará tu cuenta pronto."
  }
};

/**
 * Onboarding handlers
 * @param {Telegraf} bot - Bot instance
 */
const registerOnboardingHandlers = (bot) => {
  // Action: Retry start/refresh context
  bot.action('retry_start', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;

      const user = await UserService.getOrCreateFromContext(ctx);
      if (user && user.onboardingComplete) {
        await showMainMenu(ctx);
      } else {
        await showLanguageSelection(ctx);
      }
    } catch (error) {
      logger.error('Error in retry_start action:', error);
    }
  });

  // Action: Refresh context (same as retry_start)
  bot.action('refresh_context', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const user = await UserService.getOrCreateFromContext(ctx);
      if (user && user.onboardingComplete) {
        await showMainMenu(ctx);
      } else {
        await showLanguageSelection(ctx);
      }
    } catch (error) {
      logger.error('Error in refresh_context action:', error);
    }
  });

  // Action: Show language selection menu
  bot.action('show_lang_selection', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await showLanguageSelection(ctx);
    } catch (error) {
      logger.error('Error in show_lang_selection action:', error);
    }
  });

  // Onboard command - restart onboarding for testing
  bot.command('onboard', async (ctx) => {
    try {
      const user = await UserService.getOrCreateFromContext(ctx);

      if (!user) {
        logger.error('/onboard command: Failed to get or create user', { userId: ctx.from.id });
        await ctx.reply('An error occurred. Please try again in a few moments.');
        return;
      }

      // Reset onboarding status for testing
      await UserService.updateProfile(ctx.from.id, {
        onboardingComplete: false,
      });

      logger.info('Onboarding restarted for testing', { userId: ctx.from.id });

      // Start fresh onboarding - language selection
      await showLanguageSelection(ctx);
    } catch (error) {
      logger.error('Error in /onboard command:', error);
      await ctx.reply('An error occurred. Please try again.');
    }
  });

  // Action to prompt user for activation code
  bot.action('activate_lifetime_send_code', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const lang = getLanguage(ctx);
      if (!ctx.session.temp) ctx.session.temp = {};
      ctx.session.temp.waitingForLifetimeCode = true;
      await ctx.saveSession();
      await ctx.reply(activationStrings[lang].promptCode);
    } catch (error) {
      logger.error('Error in activate_lifetime_send_code action:', error);
      const lang = getLanguage(ctx);
      await ctx.reply(activationStrings[lang].errorActivating, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
          [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
        ]),
      });
    }
  });

  // NOTE: /start is intentionally NOT registered here. bot.js registers its
  // own bot.command('start', ...) earlier in setup (before registerOnboarding
  // Handlers runs), and Telegraf's middleware chain stops at the first
  // matching command handler that doesn't call next() — which that one
  // doesn't. A duplicate handler used to live in this exact spot; it was
  // provably unreachable dead code (bot.js always won), so it was removed.
  // New-user onboarding is driven from bot.js's /start via the exported
  // showLanguageSelection() below, which bot.js imports directly.

  // Language selection
  bot.action(/^set_lang_(.+)$/, async (ctx) => {
    try {
      // Validate match result exists
      if (!ctx.match || !ctx.match[1]) {
        logger.error('Invalid language selection format');
        await ctx.reply('An error occurred. Please try /start again.', {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔤 Select Language', 'show_lang_selection')],
          ]),
        });
        return;
      }

      const lang = ctx.match[1];
      ctx.session.language = lang;
      await ctx.saveSession();

      await ctx.editMessageText(
        t('languageSelected', lang),
        { parse_mode: 'Markdown' },
      );

      // Move to age confirmation
      await showAgeConfirmation(ctx);
    } catch (error) {
      logger.error('Error setting language:', error);
    }
  });

  // Age confirmation — persist to DB + invalidate Redis cache
  bot.action('age_confirm_yes', async (ctx) => {
    try {
      const lang = getLanguage(ctx);
      ctx.session.temp.ageConfirmed = true;

      // Persist age verification to database and invalidate cache
      const { updateAgeVerificationStatus } = require('../../core/middleware/ageVerificationRequired');
      await updateAgeVerificationStatus(ctx, true, 'manual');

      await ctx.editMessageText(t('termsAccepted', lang));

      // Move to terms acceptance
      await showTermsAndPrivacy(ctx);
    } catch (error) {
      logger.error('Error in age confirmation:', error);
    }
  });

  bot.action('age_confirm_no', async (ctx) => {
    try {
      const lang = getLanguage(ctx);
      await ctx.editMessageText(t('underAge', lang));
    } catch (error) {
      logger.error('Error in age rejection:', error);
    }
  });

  // Terms acceptance — persist to DB so compliance is honored even for users
  // who only ever touch the bot (never the webapp). Uses the shared
  // onboardingService so version constants + audit columns stay in sync with
  // the webapp acceptance path.
  bot.action('accept_terms', async (ctx) => {
    try {
      const lang = getLanguage(ctx);
      ctx.session.temp.termsAccepted = true;

      const userId = String(ctx.from.id);
      const onboardingService = require('../../../services/onboardingService');
      // Bot has no client IP; leave null. terms_accepted_ip stays NULL for
      // Telegram-origin acceptances (distinguishable from web acceptances).
      const ip = null;

      try {
        await onboardingService.markStep(userId, 'terms', {}, ip);
        await onboardingService.markStep(userId, 'privacy', {}, ip);
      } catch (persistErr) {
        logger.warn('accept_terms: DB persist failed (non-fatal, wizard continues)', {
          userId, error: persistErr.message,
        });
      }

      // If the user entered via a group deep link and that group has rules,
      // record rules acceptance too — the rules text was appended to the
      // terms message they just accepted.
      try {
        const { getRedis } = require('../../../config/redis');
        const redis = getRedis();
        const grpRaw = await redis.get(`onboard:grp:${ctx.from.id}`);
        if (grpRaw) {
          const grp = JSON.parse(grpRaw);
          if (grp?.chatId) {
            const rulesRes = await query(
              'SELECT rules FROM hangout_groups WHERE telegram_chat_id = $1 LIMIT 1',
              [String(grp.chatId)]
            );
            if (rulesRes.rows[0]?.rules) {
              await onboardingService.markStep(userId, 'rules', {}, ip);
            }
          }
        }
      } catch (rulesErr) {
        logger.warn('accept_terms: rules persist failed (non-fatal)', {
          userId, error: rulesErr.message,
        });
      }

      await ctx.editMessageText(t('termsAccepted', lang));

      // Move to email prompt
      await showEmailPrompt(ctx);
    } catch (error) {
      logger.error('Error accepting terms:', error);
    }
  });

  // Location sharing actions
  bot.action('share_location_yes', async (ctx) => {
    try {
      const lang = getLanguage(ctx);

      // Set location sharing preference
      if (ctx.from?.id) {
        await UserService.updateProfile(ctx.from.id, {
          locationSharingEnabled: true
        });
      }

      await ctx.editMessageText(t('locationSharingEnabled', lang));
      await completeOnboarding(ctx);
    } catch (error) {
      logger.error('Error enabling location sharing:', error);
    }
  });

  bot.action('share_location_no', async (ctx) => {
    try {
      const lang = getLanguage(ctx);

      // Set location sharing preference
      if (ctx.from?.id) {
        await UserService.updateProfile(ctx.from.id, {
          locationSharingEnabled: false
        });
      }

      await ctx.editMessageText(t('locationSharingDisabled', lang));
      await completeOnboarding(ctx);
    } catch (error) {
      logger.error('Error disabling location sharing:', error);
    }
  });

  bot.action('provide_email', async (ctx) => {
    try {
      const lang = getLanguage(ctx);
      // Ensure temp object exists
      if (!ctx.session.temp) {
        ctx.session.temp = {};
      }
      ctx.session.temp.waitingForEmail = true;
      ctx.session.temp.emailConflict = null;
      await ctx.saveSession();
      logger.info('Email input mode activated', { userId: ctx.from?.id });

      await ctx.editMessageText(
        '📧 Please send your email address:',
      );
    } catch (error) {
      logger.error('Error in provide email:', error);
    }
  });

  bot.action('onboarding_retry_email', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      if (!ctx.session.temp) ctx.session.temp = {};
      ctx.session.temp.emailConflict = null;
      ctx.session.temp.waitingForEmail = true;
      await ctx.saveSession();
      await ctx.reply('📧 Please send your email address:');
    } catch (error) {
      logger.error('Error in onboarding_retry_email:', error);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // PASO 2️⃣: USUARIO INICIA ACTIVACIÓN
  // ═══════════════════════════════════════════════════════════════
  /**
   * PASO 2.3️⃣: Activar flag de espera de código de Meru
   * Usuario presiona botón "Enviar mi código de confirmación"
   * Bot activa waitingForLifetimeCode = true
   * Espera a que usuario envíe el código en un mensaje de texto
   */
  bot.action('activate_lifetime_send_code', async (ctx) => {
    try {
      logger.info('🔵 PASO 2️⃣: Usuario iniciando activación de Lifetime Pass', {
        userId: ctx.from.id,
        username: ctx.from.username
      });

      await ctx.answerCbQuery();
      const lang = getLanguage(ctx);

      // Validar que session.temp existe
      if (!ctx.session.temp) {
        ctx.session.temp = {};
      }

      // PASO 2.3️⃣: Activar flag
      logger.info('🔵 PASO 2.3️⃣: Activando flag waitingForLifetimeCode = true', {
        userId: ctx.from.id
      });

      ctx.session.temp.waitingForLifetimeCode = true;
      await ctx.saveSession();

      const message = lang === 'es'
        ? 'Por favor, envía tu código de confirmación de pago:'
        : 'Please send your payment confirmation code:';

      await ctx.reply(message);
    } catch (error) {
      logger.error('❌ Error en activate_lifetime_send_code:', error);
      const lang = getLanguage(ctx);
      await ctx.reply(lang === 'es'
        ? '❌ Ocurrió un error. Por favor, inténtalo de nuevo.'
        : '❌ An error occurred. Please try again.');
    }
  });

  // Listen for email input and Meru lifetime code
  bot.on('text', async (ctx, next) => {
    logger.info('Onboarding text handler', {
      userId: ctx.from?.id,
      waitingForEmail: ctx.session?.temp?.waitingForEmail,
      waitingForLifetimeCode: ctx.session?.temp?.waitingForLifetimeCode,
      text: ctx.message?.text?.substring(0, 50)
    });

    // New logic for Lifetime Code Activation
    if (ctx.session?.temp?.waitingForLifetimeCode) {
      const lang = getLanguage(ctx);
      const rawCode = ctx.message?.text?.trim();

      if (!rawCode || rawCode.length === 0 || rawCode.includes(' ')) { // Simple validation for now
        await ctx.reply(activationStrings[lang].invalidCodeFormat, {
          ...Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'es' ? '🔄 Intentar de Nuevo' : '🔄 Try Again', 'activate_lifetime_send_code')],
            [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
          ]),
        });
        ctx.session.temp.waitingForLifetimeCode = false; // Clear the flag
        await ctx.saveSession();
        return;
      }

      ctx.session.temp.waitingForLifetimeCode = false; // Clear the flag
      await ctx.saveSession();

      try {
        // Validate code against active links in the database (single source of truth).
        // The Meru link pool is consolidated under 'lifetime100' (migration 195) —
        // both the lifetime-pass and lifetime100 plans pull from the same codes.
        const availableLinks = await meruLinkService.getAvailableLinks('lifetime100');
        const matchingLink = availableLinks.find(link => link.code === rawCode);

        if (!matchingLink) {
            await ctx.reply(activationStrings[lang].codeNotFound, {
              ...Markup.inlineKeyboard([
                [Markup.button.callback(lang === 'es' ? '🔄 Intentar de Nuevo' : '🔄 Try Again', 'activate_lifetime_send_code')],
                [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
              ]),
            });
            return;
        }

        const matchingLinkCode = matchingLink.code;

        await ctx.reply(`Verificando pago para el código: \`${matchingLinkCode}\`...`, { parse_mode: 'Markdown' });

        // Usar Puppeteer para verificar el pago (lee contenido real con JavaScript ejecutado)
        // Pasar el idioma del usuario para que Meru muestre el mensaje en el idioma correcto
        const paymentCheck = await meruPaymentService.verifyPayment(matchingLinkCode, lang);

        logger.info('Meru payment verification result', {
          code: matchingLinkCode,
          isPaid: paymentCheck.isPaid,
          userId: ctx.from.id,
        });

        if (paymentCheck.isPaid) {
          // Payment confirmed, activate PRIME
          const userId = ctx.from.id;
          const planId = 'lifetime-pass'; // Assuming this is the plan ID for Lifetime Pass
          const product = 'lifetime-pass';

          const activated = await activateMembership({
            ctx,
            userId,
            planId,
            product,
            // successMessage will be handled below
          });

          if (!activated) {
            await ctx.reply(activationStrings[lang].errorActivating, {
              ...Markup.inlineKeyboard([
                [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
                [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
              ]),
            });
            return;
          }

          // Mark code as used
          await markCodeUsed(matchingLinkCode, userId, ctx.from.username);

          // IMPORTANT: Invalidate the Meru link to prevent reuse
          const linkInvalidation = await meruLinkService.invalidateLinkAfterActivation(
            matchingLinkCode,
            userId,
            ctx.from.username
          );

          if (!linkInvalidation.success) {
            logger.warn('Failed to invalidate Meru link after activation', {
              code: matchingLinkCode,
              userId,
              reason: linkInvalidation.message,
            });
          }

          // Record payment in history
          try {
            await PaymentHistoryService.recordPayment({
              userId,
              paymentMethod: 'meru',
              amount: 50,  // Standard lifetime pass price
              currency: 'USD',
              planId: 'lifetime-pass',
              planName: 'Lifetime Pass',
              product: product || 'lifetime-pass',
              paymentReference: matchingLinkCode,  // Meru link code is the payment reference
              status: 'completed',
              metadata: {
                meru_link: `https://pay.getmeru.com/${matchingLinkCode}`,
                verification_method: 'puppeteer',
                language: lang,
              },
            });
          } catch (historyError) {
            logger.warn('Failed to record Meru payment in history (non-critical):', {
              error: historyError.message,
              userId,
              code: matchingLinkCode,
            });
          }

          await logActivation({ userId, username: ctx.from.username, code: matchingLinkCode, product, success: true });
          BusinessNotificationService.notifyCodeActivation({ userId, username: ctx.from.username, code: matchingLinkCode, product });

          await ctx.reply(
            activationStrings[lang].paymentExpiredOrPaid.replace('{webappUrl}', WEBAPP_URL),
            { parse_mode: 'Markdown', disable_web_page_preview: true }
          );
          await showMainMenu(ctx); // Show main menu after activation
        } else {
          // Payment not confirmed
          await ctx.reply(activationStrings[lang].paymentNotCompleted, {
            ...Markup.inlineKeyboard([
              [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
              [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
            ]),
          });
        }
      } catch (error) {
        logger.error('Error processing lifetime code activation:', error);
        await ctx.reply(activationStrings[lang].errorActivating, {
          ...Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
            [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
          ]),
        });
      }
      return; // Crucial to return here to prevent further text processing
    }

    if (ctx.session?.temp?.waitingForEmail) {
      const lang = getLanguage(ctx);

      // Validate message text exists
      if (!ctx.message?.text) {
        logger.warn('Email handler received message without text');
        await ctx.reply(`${t('invalidInput', lang)}\nPlease send a valid email address.`, {
          ...Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'es' ? '✏️ Intentar de Nuevo' : '✏️ Try Again', 'onboarding_retry_email')],
            [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
          ]),
        });
        return;
      }

      // Normalize email: trim, lowercase, check length
      const rawEmail = ctx.message.text.trim().toLowerCase();

      // Check email length (emails shouldn't exceed 254 characters per RFC)
      if (rawEmail.length > 254 || rawEmail.length < 5) {
        await ctx.reply(`${t('invalidInput', lang)}\nEmail must be between 5 and 254 characters.`, {
          ...Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'es' ? '✏️ Intentar de Nuevo' : '✏️ Try Again', 'onboarding_retry_email')],
            [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
          ]),
        });
        return;
      }

      if (isValidEmail(rawEmail)) {
        // Wizard mode: skip location/WoF and go straight to creator completion.
        if (process.env.BOT_WIZARD_ENABLED === 'true') {
          ctx.session.temp.waitingForEmail = false;
          await ctx.saveSession();
          await completeCreatorOnboarding(ctx, rawEmail);
          return;
        }

        const existingUser = typeof UserService.getByEmail === 'function'
          ? await UserService.getByEmail(rawEmail)
          : await UserModel.getByEmail(rawEmail);

        if (existingUser) {
          if (String(existingUser.id) === String(ctx.from.id)) {
            // Same user, fuse and complete
            await UserService.updateProfile(ctx.from.id, {
              email: rawEmail,
              onboardingComplete: true,
            });
            ctx.session.temp.waitingForEmail = false;
            await ctx.saveSession();
            await ctx.reply(t('emailReceived', lang));
            await completeOnboarding(ctx);
          } else {
            // Different user, notify admin and inform user to provide a different email
            const adminNotification = `⚠️ *Alerta de Email Duplicado*\n\n` +
              `Un usuario se ha registrado con un email que ya existe en la base de datos.\n\n` +
              `📧 **Email:** \`${rawEmail}\`\n` +
              `👤 **ID de Telegram Existente:** \`${existingUser.id}\`\n` +
              `🆕 **ID de Telegram Nuevo:** \`${ctx.from.id}\`\n\n` +
              `El nuevo usuario no podrá proceder con este email. Por favor, revisa manualmente la situación.`;

            await supportRoutingService.sendToSupportGroup(adminNotification, 'escalation', {
              id: 'SYSTEM',
              first_name: 'System Alert',
              username: 'system'
            });

            logger.warn('Duplicate email detected during onboarding for different user', {
              newUserId: ctx.from.id,
              existingUserId: existingUser.id,
              email: rawEmail
            });

            ctx.session.temp.waitingForEmail = false;
            ctx.session.temp.emailConflict = { email: rawEmail, existingUserId: existingUser.id };
            await ctx.saveSession();

            await ctx.reply(
              lang === 'es'
                ? `❌ Este email ya está en uso por otra cuenta.`
                : `❌ This email is already in use by another account.`,
              {
                ...Markup.inlineKeyboard([
                  [Markup.button.callback(lang === 'es' ? '✏️ Usar otro email' : '✏️ Use another email', 'onboarding_retry_email')],
                  [Markup.button.url(lang === 'es' ? '🆘 Soporte' : '🆘 Support', 'https://t.me/pnptv_support')],
                ]),
              }
            );
          }
        } else {
          // New email, proceed normally
          ctx.session.temp.email = rawEmail;
          ctx.session.temp.waitingForEmail = false;
          await ctx.saveSession();

          await ctx.reply(t('emailReceived', lang));
          await showLocationSharingPrompt(ctx);
        }
      } else {
        await ctx.reply(`${t('invalidInput', lang)}\nPlease send a valid email address (e.g., user@example.com).`, {
          ...Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'es' ? '✏️ Intentar de Nuevo' : '✏️ Try Again', 'onboarding_retry_email')],
            [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
          ]),
        });
      }
      return;
    }

    return next();
  });
};

/**
 * Show language selection
 * @param {Context} ctx - Telegraf context
 */
const showLanguageSelection = async (ctx) => {
  await ctx.reply(
    '👋 Welcome to PNPtv!\n\nPlease select your language / Por favor selecciona tu idioma:',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🇺🇸 English', 'set_lang_en'),
        Markup.button.callback('🇪🇸 Español', 'set_lang_es'),
      ],
    ]),
  );
};

/**
 * Show age confirmation
 * @param {Context} ctx - Telegraf context
 */
const showAgeConfirmation = async (ctx) => {
  const lang = getLanguage(ctx);

  // Import age verification handler
  const { showAgeVerificationOptions } = require('./ageVerificationHandler');

  // Show new AI-based age verification options
  await showAgeVerificationOptions(ctx);
};

/**
 * Show terms and privacy
 * @param {Context} ctx - Telegraf context
 */
const showTermsAndPrivacy = async (ctx) => {
  const lang = getLanguage(ctx);

  let baseText = `${t('termsAndPrivacy', lang)}\n\n📄 Terms: https://pnptv.app/terms\n🔒 Privacy: https://pnptv.app/privacy`;

  // Append group-specific rules if user joined via a group
  try {
    const redis = getRedis();
    const grpRaw = await redis.get(`onboard:grp:${ctx.from.id}`);
    if (grpRaw) {
      const grp = JSON.parse(grpRaw);
      if (grp.chatId) {
        const rulesRes = await query(
          'SELECT rules FROM hangout_groups WHERE telegram_chat_id = $1 LIMIT 1',
          [String(grp.chatId)]
        );
        if (rulesRes.rows.length > 0 && rulesRes.rows[0].rules) {
          baseText += `\n\n📋 *Group Rules — ${grp.name || 'the group'}:*\n${rulesRes.rows[0].rules}`;
        }
      }
    }
  } catch (_) {}

  await ctx.reply(
    baseText,
    Markup.inlineKeyboard([
      [Markup.button.callback(`✅ I accept all of the above`, 'accept_terms')],
    ]),
  );
};

/**
 * Show email prompt
 * @param {Context} ctx - Telegraf context
 */
const showEmailPrompt = async (ctx) => {
  const lang = getLanguage(ctx);
  const isSpanish = lang === 'es';

  // Combine prompt and required note in one message with button
  const message = `${t('emailPrompt', lang)}\n\n${t('emailRequiredNote', lang)}`;
  const buttonText = isSpanish ? '📧 Enviar Email' : '📧 Provide Email';

  await ctx.reply(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback(buttonText, 'provide_email')],
    ]),
  );
};

/**
 * Show location sharing prompt
 * @param {Context} ctx - Telegraf context
 */
const showLocationSharingPrompt = async (ctx) => {
  const lang = getLanguage(ctx);

  const locationText = lang === 'es'
    ? `📍 *Compartir Ubicación (Opcional)*

¿Quieres que otros miembros te encuentren en el mapa de *¿Quién está Cercano?*?

💡 *Esto es completamente opcional* y puedes cambiarlo más tarde en tu perfil.

🔒 *Tu privacidad está protegida*: Solo mostrará tu ubicación aproximada a otros miembros que también hayan activado esta función.

👥 *Beneficios*:
• Conecta con otros papis cloudy cerca de ti
• Encuentra slam buddies en tu área
• Descubre la escena local de PNP

🌍 *¿Cómo funciona?*:
• Solo compartes tu ubicación cuando usas la función *¿Quién está Cercano?*
• Puedes desactivarlo en cualquier momento
• Solo es visible para otros miembros verificados`
    : `📍 *Share Location (Optional)*

Want other members to find you on the *Who is Nearby?* map?

💡 *This is completely optional* and you can change it later in your profile.

🔒 *Your privacy is protected*: It will only show your approximate location to other members who have also enabled this feature.

👥 *Benefits*:
• Connect with other cloudy papis near you
• Find slam buddies in your area
• Discover the local PNP scene

🌍 *How it works*:
• You only share your location when using the *Who is Nearby?* feature
• You can turn it off anytime
• Only visible to other verified members`;

  await ctx.reply(
    locationText,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📍 Yes, Share My Location', 'share_location_yes')],
        [Markup.button.callback('🚫 No Thanks', 'share_location_no')],
      ]),
    }
  );
};

/**
 * Complete onboarding
 * @param {Context} ctx - Telegraf context
 */
const completeOnboarding = async (ctx) => {
  try {
    const lang = getLanguage(ctx);

    // Validate user context exists
    if (!ctx.from?.id) {
      logger.error('Missing user context in onboarding completion');
      await ctx.reply('An error occurred. Please try /start again.', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Retry', 'retry_start')],
        ]),
      });
      return;
    }

    const userId = ctx.from.id;

    // Update user profile
    // Double-check that onboarding is not already complete to prevent duplicates
    const userCheck = await UserService.getById(userId);
    if (userCheck && userCheck.onboardingComplete) {
      logger.warn('Onboarding completion attempted for already completed user', { userId });
      await ctx.reply('You have already completed onboarding. Enjoy the platform!');
      await showMainMenu(ctx);
      return;
    }

    const result = await UserService.updateProfile(userId, {
      language: lang,
      email: ctx.session.temp?.email || null,
      onboardingComplete: true,
    });

    if (!result.success) {
      logger.error('Failed to update user profile:', result.error);
      const lang = getLanguage(ctx);
      await ctx.reply('An error occurred. Please try /start again.', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback(lang === 'es' ? '🔄 Reintentar' : '🔄 Retry', 'retry_start')],
          [Markup.button.url(lang === 'es' ? '🆘 Soporte' : '🆘 Support', 'https://t.me/pnptv_support')],
        ]),
      });
      return;
    }

    // Log onboarding completion
    logger.info('User completed onboarding', { userId, language: lang });

    // Grant free trial to new users (default: 1 day / 24 hours)
    const monetizationConfig = require('../../../config/monetizationConfig');
    const trialDays = monetizationConfig.subscription.freeTrialDays || 1;
    const trialResult = await SubscriptionService.addFreeTrial(userId, trialDays, 'new_user_activation');
    if (trialResult.success) {
      logger.info('Free trial granted on activation', { userId, days: trialDays, expiry: trialResult.newExpiry });
    }

    // Clear temp session data
    ctx.session.temp = {};
    await ctx.saveSession();

    // Unrestrict user in group (if they joined via a group) and mark onboarding done
    try {
      const { unrestrictUserInGroup } = require('../group/groupAdminPanel');
      const redis = getRedis();
      const grpRaw = await redis.get(`onboard:grp:${userId}`);
      if (grpRaw) {
        const grp = JSON.parse(grpRaw);
        if (grp.chatId) {
          await unrestrictUserInGroup(ctx.telegram, grp.chatId, userId);
        }
        await redis.del(`onboard:grp:${userId}`);
      }
      await redis.set(`onboard:done:${userId}`, '1', 'EX', 86400 * 30);
    } catch (grpErr) {
      logger.error('completeOnboarding: failed to unrestrict/mark done in group', {
        userId,
        error: grpErr.message,
      });
    }

    // Check if user is PRIME to send appropriate onboarding completion message
    const user = await UserService.getById(userId);
    const isPrime = user && user.isPremium;
    
    const messageKey = isPrime 
      ? (lang === 'es' ? 'pnpLatinoPrimeOnboardingComplete' : 'pnpLatinoPrimeOnboardingComplete')
      : (lang === 'es' ? 'pnpLatinoFreeOnboardingComplete' : 'pnpLatinoFreeOnboardingComplete');
    
    await ctx.reply(t(messageKey, lang));

    // Show all connected communities the user can join
    try {
      const groupManagerService = require('../../../services/groupManagerService');
      const groups = await groupManagerService.getLinkedGroups();
      if (groups.length > 0) {
        const joinMsg = lang === 'es'
          ? '🏘 *Comunidades disponibles* — toca cualquiera para obtener tu enlace personal de acceso:'
          : '🏘 *Available communities* — tap any to get your personal invite link:';
        const buttons = groups.map((g) => [Markup.button.callback(`🏘 ${g.name}`, `join_group:${g.telegram_chat_id}`)]);
        await ctx.reply(joinMsg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      }
    } catch (groupErr) {
      logger.warn('Post-onboarding group list failed (non-fatal)', { error: groupErr.message });
    }

    // Show main menu
    await showMainMenu(ctx);
  } catch (error) {
    logger.error('Error completing onboarding:', error);
    const lang = getLanguage(ctx);
    await ctx.reply('An error occurred. Please try /start again.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback(lang === 'es' ? '🔄 Reintentar' : '🔄 Retry', 'retry_start')],
        [Markup.button.url(lang === 'es' ? '🆘 Soporte' : '🆘 Support', 'https://t.me/pnptv_support')],
      ]),
    });
  }
};
const verifyAndActivateMeruPayment = async (ctx, meruCode, lang = 'es') => {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'unknown';

    logger.info('🔵 PASO 4️⃣: Iniciando verificación de pago con Puppeteer', {
      userId,
      username,
      code: meruCode
    });

    // Enviar mensaje de verificación
    const verifyingMessage = lang === 'es'
      ? `⏳ Verificando tu pago en Meru para el código: \`${meruCode}\`...`
      : `⏳ Verifying your payment on Meru for code: \`${meruCode}\`...`;

    const statusMsg = await ctx.reply(verifyingMessage, { parse_mode: 'Markdown' });

    // ═══════════════════════════════════════════════════════════════
    // PASO 4️⃣: BOT VERIFICA PAGO CON PUPPETEER
    // ═══════════════════════════════════════════════════════════════
    const paymentCheck = await meruPaymentService.verifyPayment(meruCode, lang);

    logger.info('✅ Verificación completada', {
      userId,
      code: meruCode,
      isPaid: paymentCheck.isPaid
    });

    if (!paymentCheck.isPaid) {
      logger.warn('⚠️  Pago no confirmado', {
        userId,
        code: meruCode,
        message: paymentCheck.message
      });

      const failMessage = lang === 'es'
        ? `❌ No pudimos confirmar tu pago para el código \`${meruCode}\`.

Por favor asegúrate de que:
1. El link de Meru fue pagado completamente
2. El código es correcto
3. El link aún no ha sido usado

Si el problema persiste, contacta a soporte: /support`
        : `❌ We could not confirm your payment for code \`${meruCode}\`.

Please ensure that:
1. The Meru link was paid in full
2. The code is correct
3. The link has not been used yet

If the problem persists, contact support: /support`;

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      } catch (e) {
        logger.debug('Could not delete status message');
      }

      await ctx.reply(failMessage, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
          [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
        ]),
      });
      return;
    }

    logger.info('✅ Pago confirmado en Meru', { userId, code: meruCode });

    // ═══════════════════════════════════════════════════════════════
    // PASO 5️⃣: BOT ACTIVA LA MEMBRESÍA
    // ═══════════════════════════════════════════════════════════════
    logger.info('🔵 PASO 5️⃣: Activando membresía', { userId });

    const planId = 'lifetime-pass';
    const product = 'lifetime-pass';

    // Marcar código como usado en BD
    logger.info('🔵 PASO 5.2️⃣: Marcando link como usado', {
      userId,
      code: meruCode,
      username
    });

    const linkInvalidation = await meruLinkService.invalidateLinkAfterActivation(
      meruCode,
      userId,
      username
    );

    if (!linkInvalidation.success) {
      logger.warn('⚠️  Failed to invalidate Meru link', {
        code: meruCode,
        userId,
        reason: linkInvalidation.message
      });
    } else {
      logger.info('✅ Link marcado como usado', {
        code: meruCode,
        userId
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 6️⃣: REGISTRAR PAGO EN HISTORIAL
    // ═══════════════════════════════════════════════════════════════
    logger.info('🔵 PASO 6️⃣: Registrando pago en historial', { userId, code: meruCode });

    try {
      await PaymentHistoryService.recordPayment({
        userId: String(userId),
        paymentMethod: 'meru',
        amount: 50,
        currency: 'USD',
        planId: 'lifetime-pass',
        planName: 'Lifetime Pass',
        product: product,
        paymentReference: meruCode,
        status: 'completed',
        metadata: {
          meru_link: `https://pay.getmeru.com/${meruCode}`,
          verification_method: 'puppeteer',
          language: lang,
          activated_at: new Date().toISOString()
        }
      });

      logger.info('✅ Pago registrado en historial', {
        userId,
        code: meruCode,
        method: 'meru'
      });
    } catch (historyError) {
      logger.warn('⚠️  Failed to record payment in history (non-critical)', {
        error: historyError.message,
        userId,
        code: meruCode
      });
      // No fallar si el historial falla, es secundario
    }

    // Actualizar perfil del usuario
    try {
      await UserService.updateProfile(userId, {
        isPremium: true,
        premiumPlan: planId,
        premiumActivatedDate: new Date()
      });

      logger.info('✅ Perfil de usuario actualizado', {
        userId,
        planId: planId
      });
    } catch (profileError) {
      logger.error('❌ Error actualizando perfil de usuario', {
        userId,
        error: profileError.message
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 7️⃣: NOTIFICACIONES FINALES
    // ═══════════════════════════════════════════════════════════════
    logger.info('🔵 PASO 7️⃣: Enviando notificaciones finales', { userId });

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    } catch (e) {
      logger.debug('Could not delete status message');
    }

    // 7.1️⃣: Mensaje de activación exitosa
    const successMessage = lang === 'es'
      ? `✅ *¡Tu Lifetime Pass ha sido activado!*

¡Bienvenido a PRIME! 🎉

Ahora tienes acceso ilimitado a todo el contenido exclusivo.

📱 *Acciones a continuación:*
• Visita tu perfil para completar información
• Explora el catálogo de contenido premium
• Disfruta sin límites

¿Preguntas? Escribe /support`
      : `✅ *Your Lifetime Pass has been activated!*

Welcome to PRIME! 🎉

You now have unlimited access to all exclusive content.

📱 *Next steps:*
• Visit your profile to complete information
• Browse our premium content catalog
• Enjoy without limits

Questions? Write /support`;

    await ctx.reply(successMessage, { parse_mode: 'Markdown' });

    // 7.2️⃣: Log de auditoría
    logger.info('✅ PASO 7.1️⃣: Lifetime Pass activado correctamente', {
      userId,
      username,
      code: meruCode,
      planId,
      timestamp: new Date().toISOString()
    });

    // 7.3️⃣: Enviar menú principal
    await showMainMenu(ctx);

    // 7.4️⃣: Notificar a admin (opcional, sin bloquear flujo)
    try {
      const adminNotification = `💎 *Lifetime Pass Activado*

👤 *Usuario:* ${username} (ID: \`${userId}\`)
🔗 *Código Meru:* \`${meruCode}\`
⏰ *Hora:* ${new Date().toLocaleString()}

Pago verificado con Puppeteer ✅
Membresía activada correctamente`;

      await supportRoutingService.sendToSupportGroup(
        adminNotification,
        'activation',
        { id: userId, username, first_name: username }
      ).catch(err => {
        logger.warn(`Could not send admin notification: ${err.message}`);
      });
    } catch (notifyError) {
      logger.debug('Admin notification skipped:', notifyError.message);
    }

  } catch (error) {
    logger.error('❌ Error en verifyAndActivateMeruPayment', {
      userId: ctx.from?.id,
      error: error.message,
      stack: error.stack
    });

    const errorMessage = lang === 'es'
      ? '❌ Ocurrió un error durante la activación. Por favor, contacta a soporte: /support'
      : '❌ An error occurred during activation. Please contact support: /support';

    try {
      await ctx.reply(errorMessage, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback(lang === 'es' ? '🏠 Volver al Inicio' : '🏠 Back to Home', 'back_to_main')],
          [Markup.button.url(lang === 'es' ? '🆘 Contactar Soporte' : '🆘 Contact Support', 'https://t.me/pnptv_support')],
        ]),
      });
    } catch (e) {
      logger.error(`Could not send error message: ${e.message}`);
    }
  }
};

/**
 * Completion step for external-group bot onboarding.
 * Replaces location-sharing + WoF consent with group invite + hangout links.
 */
const completeCreatorOnboarding = async (ctx, email) => {
  try {
    const lang = getLanguage(ctx);
    const userId = ctx.from.id;

    await UserService.updateProfile(userId, { email, onboardingComplete: true, language: lang });

    const { getRedis } = require('../../../config/redis');
    const { query: dbQuery } = require('../../../config/postgres');
    const redis = getRedis();
    const stored = await redis.get(`onboard:grp:${userId}`);
    let groupName = 'PNPtv';
    let groupChatId = null;
    let joinedViaDeepLink = false;
    try {
      const p = JSON.parse(stored);
      groupName = p.name || groupName;
      groupChatId = p.chatId || null;
      // Only true when this context came from an actual /start grp_<chatId>
      // click just now (bot.js sets it, 30-min TTL). The 7-day context
      // handleNewChatMemberWithCustomWelcome() pre-fills on every new group
      // member -- regardless of how they joined -- leaves this unset, so
      // simply having been a group member can never earn the group badge.
      joinedViaDeepLink = p.viaDeepLink === true;
    } catch (_) {}
    await redis.del(`onboard:grp:${userId}`);
    await redis.set(`onboard:done:${userId}`, '1', 'EX', 60 * 60 * 24 * 30);

    // Unrestrict user in group now that onboarding is complete
    if (groupChatId) {
      try {
        const { unrestrictUserInGroup } = require('../group/groupAdminPanel');
        await unrestrictUserInGroup(ctx.telegram, groupChatId, userId);
      } catch (_) {}
    }

    let inviteLink = null;
    if (groupChatId) {
      try {
        const inv = await ctx.telegram.createChatInviteLink(groupChatId, { name: 'PNPtv Onboarding', creates_join_request: false });
        inviteLink = inv.invite_link;
      } catch (e) { logger.debug('Could not create invite link:', e.message); }
    }

    let hangoutId = null, hangoutName = null, hangoutBadgeSlug = null;
    if (groupChatId) {
      try {
        const { rows } = await dbQuery('SELECT id, name, badge_slug FROM hangout_groups WHERE telegram_chat_id = $1 LIMIT 1', [String(groupChatId)]);
        if (rows.length) { hangoutId = rows[0].id; hangoutName = rows[0].name || groupName; hangoutBadgeSlug = rows[0].badge_slug || null; }
      } catch (e) { logger.debug('Could not fetch hangout:', e.message); }
    }

    // Track migration and award points when user joins via a linked group
    if (groupChatId) {
      try {
        const groupManagerService = require('../../../services/groupManagerService');
        const pnptvUserId = String(ctx.from.id);
        const tracked = await groupManagerService.trackMigration(
          String(groupChatId), hangoutId, pnptvUserId,
          String(userId), ctx.from.username || null
        );
        if (tracked) {
          await groupManagerService.awardPoints(
            String(groupChatId), pnptvUserId, String(userId),
            ctx.from.username || null, 100, 'joined_pnptv'
          );
          // Per-hangout "you joined the right way" badge — only defined for a
          // handful of hangouts (hangout_groups.badge_slug), and only ever
          // awarded here, right where trackMigration just confirmed this is a
          // genuine new join via THIS group's own unique deep link. Gated on
          // joinedViaDeepLink specifically (not just `tracked`) so it can
          // never fire off the 7-day "was welcomed as a new member" context
          // that handleNewChatMemberWithCustomWelcome() sets for every new
          // group member regardless of how they got there — that pre-fill
          // is what produced the original mis-awarded badges.
          if (hangoutBadgeSlug && joinedViaDeepLink) {
            try {
              const gamificationService = require('../../../services/gamificationService');
              await gamificationService.awardBadge(pnptvUserId, hangoutBadgeSlug, null, `Joined via group deep link: ${groupChatId}`);
            } catch (badgeErr) {
              logger.warn('completeCreatorOnboarding: group badge award failed (non-critical)', { userId, hangoutBadgeSlug, error: badgeErr.message });
            }
          }
          const milestone = await groupManagerService.checkMilestone(String(groupChatId));
          if (milestone) {
            const celebMsg = `*Milestone reached!* ${milestone} members from this group have now joined PNPtv! Amazing community growth!`;
            ctx.telegram.sendMessage(groupChatId, celebMsg, { parse_mode: 'Markdown' }).catch(() => {});
          }
        }
      } catch (e) {
        logger.warn('completeCreatorOnboarding: group tracking failed', { error: e.message });
      }
    }

    const firstName = ctx.from?.first_name || '';
    const doneMsg = lang === 'es'
      ? `✅ ¡Listo${firstName ? `, *${firstName}*` : ''}! Ya eres parte de *${groupName}*. 🏳️‍🌈\n\nTu perfil está sincronizado. Usa los botones de abajo para unirte al grupo y al hangout.`
      : `✅ You\'re in${firstName ? `, *${firstName}*` : ''}! Welcome to *${groupName}*. 🏳️‍🌈\n\nYour profile is synced. Use the buttons below to join the group and hangout.`;

    const buttons = [];
    if (inviteLink) buttons.push([{ text: `🔗 ${lang === 'es' ? 'Unirme al grupo' : 'Join the group'} — ${groupName}`, url: inviteLink }]);
    if (hangoutId) buttons.push([{ text: `💬 ${lang === 'es' ? 'Abrir hangout' : 'Open hangout'} en PNPtv!`, url: `https://pnptv.app/hangouts/${hangoutId}` }]);
    buttons.push([{ text: `🌐 ${lang === 'es' ? 'Abrir PNPtv!' : 'Open PNPtv!'}`, url: 'https://pnptv.app' }]);

    await ctx.reply(doneMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    logger.info('Creator onboarding complete', { userId, groupName, hangoutId });
  } catch (err) {
    logger.error('Error in completeCreatorOnboarding:', err);
    await ctx.reply('An error occurred. Please try /start again.');
  }
};

module.exports = registerOnboardingHandlers;
module.exports.showTermsAndPrivacy = showTermsAndPrivacy;
module.exports.showLanguageSelection = showLanguageSelection;
