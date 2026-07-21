const { Markup } = require('telegraf');
const ageVerificationService = require('../../../services/ageVerificationService');
const { t } = require('../../../utils/i18n');
const logger = require('../../../utils/logger');
const { getLanguage } = require('../../utils/helpers');

/**
 * Age Verification Handler
 * Handles camera-based age verification with AI
 */

/**
 * Register age verification handlers
 * @param {Telegraf} bot - Bot instance
 */
const registerAgeVerificationHandlers = (bot) => {
  // Action to start photo verification
  bot.action('age_verify_photo', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await startPhotoVerification(ctx);
    } catch (error) {
      logger.error('Error starting photo verification:', error);
      const lang = getLanguage(ctx);
      await ctx.reply(t('error', lang)).catch(() => {});
    }
  });

  // Action to skip photo verification (fallback to manual confirmation)
  bot.action('age_verify_manual', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await showManualAgeConfirmation(ctx);
    } catch (error) {
      logger.error('Error in manual age verification:', error);
      const lang = getLanguage(ctx);
      await ctx.reply(t('error', lang)).catch(() => {});
    }
  });

  // Listen for photo submissions during age verification
  bot.on('photo', async (ctx, next) => {
    // Check if user is in photo verification mode
    if (ctx.session.temp?.waitingForAgePhoto) {
      await handleAgePhotoSubmission(ctx);
      return;
    }
    return next();
  });

  // Handle Telegram WebApp payloads (age verification results + manual fallback)
  bot.on('message', async (ctx, next) => {
    const webAppPayload = ctx.message?.web_app_data?.data;
    if (!webAppPayload) {
      return next();
    }

    const lang = getLanguage(ctx);
    const [command, payload] = webAppPayload.split(':', 2);

    if (command === 'age_verified') {
      const { updateAgeVerificationStatus } = require('../../middleware/ageVerificationRequired');
      const { showTermsAndPrivacy } = require('./onboarding');

      await updateAgeVerificationStatus(ctx, true, 'webapp_photo');
      ctx.session.onboardingStep = 'terms';
      await ctx.saveSession();

      const parsedAge = payload ? Number(payload) : null;
      const roundedAge = Number.isFinite(parsedAge) ? Math.round(parsedAge) : null;
      const successMessage = lang === 'es'
        ? `✅ Verificación completada${roundedAge ? ` (edad estimada: ${roundedAge})` : ''}. Gracias por completar la verificación.`
        : `✅ Verification completed${roundedAge ? ` (estimated age: ${roundedAge})` : ''}. Thank you for completing the verification.`;

      await ctx.reply(successMessage, { parse_mode: 'Markdown' });
      await showTermsAndPrivacy(ctx);
      return;
    }

    if (command === 'manual_verification') {
      await showManualAgeConfirmation(ctx);
      return;
    }

    return next();
  });

  // Handle manual age confirmation - Yes
  bot.action('age_confirm_yes', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { updateAgeVerificationStatus } = require('../../middleware/ageVerificationRequired');

      // Update verification status with correct method
      await updateAgeVerificationStatus(ctx, true, 'manual');

      // Continue with onboarding
      const { showTermsAndPrivacy } = require('./onboarding');
      await showTermsAndPrivacy(ctx);
    } catch (error) {
      logger.error('Error handling manual age confirmation:', error);
      const lang = getLanguage(ctx);
      await ctx.reply(t('error', lang));
    }
  });

  // Handle manual age confirmation - No
  bot.action('age_confirm_no', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const lang = getLanguage(ctx);

      const message = lang === 'es'
        ? `❌ **No Puedes Continuar**\n\nDebes ser mayor de 18 años para usar PNPtv.\n\nSi crees que esto es un error, contacta a soporte.`
        : `❌ **You Cannot Continue**\n\nYou must be at least 18 years old to use PNPtv.\n\nIf you believe this is an error, contact support.`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error handling age confirmation rejection:', error);
      const lang = getLanguage(ctx);
      await ctx.reply(t('error', lang));
    }
  });
};

/**
 * Show age verification options (photo or manual)
 * PRIVACY-FIRST: Clear messaging about zero data storage
 * @param {Context} ctx - Telegraf context
 */
const showAgeVerificationOptions = async (ctx) => {
  const lang = getLanguage(ctx);

  const message = lang === 'es'
    ? `🔒 *Verificación de Edad - Tu Privacidad es Primero*

Para cumplir con regulaciones, necesitamos verificar que eres mayor de 18 años.

📸 *Opción 1: Verificación con IA (Recomendado)*
✅ Toma una selfie clara de tu rostro
✅ Nuestra IA analiza tu edad automáticamente
🔐 *TU FOTO NO SE ALMACENA* - Se elimina inmediatamente
🔐 Solo guardamos el resultado de la verificación (edad verificada: sí/no)

✅ *Opción 2: Confirmación Manual*
Confirma manualmente que eres mayor de edad.

*Privacidad Garantizada:*
• No almacenamos imágenes faciales
• No compartimos datos con terceros
• Los datos están protegidos por encriptación
• Puedes eliminar tu cuenta en cualquier momento

¿Cómo deseas verificar tu edad?`
    : `🔒 *Age Verification - Your Privacy Comes First*

To comply with regulations, we need to verify that you are over 18 years old.

📸 *Option 1: AI Age Verification (Recommended)*
✅ Take a clear selfie of your face
✅ Our AI automatically analyzes your age
🔐 *YOUR PHOTO IS NOT STORED* - Deleted immediately
🔐 We only save the verification result (age verified: yes/no)

✅ *Option 2: Manual Confirmation*
Manually confirm that you are of legal age.

*Privacy Guaranteed:*
• We do NOT store facial images
• We do NOT share data with third parties
• Your data is protected with encryption
• You can delete your account anytime

How would you like to verify your age?`;

  const userId = ctx.from?.id;
  if (!userId) {
    logger.warn('showAgeVerificationOptions called without ctx.from.id');
    return;
  }

  const webhookDomain = process.env.BOT_WEBHOOK_DOMAIN || 'https://pnptv.app';
  const cameraUrl = `${webhookDomain}/age-verification-camera.html?user_id=${userId}&lang=${lang}`;

  await ctx.reply(
    message,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.url(
          lang === 'es' ? '📹 Verificación con Cámara' : '📹 Camera Verification',
          cameraUrl
        )],
        [Markup.button.callback(
          lang === 'es' ? '✅ Confirmación Manual' : '✅ Manual Confirmation',
          'age_verify_manual'
        )],
      ])
    }
  );
};

/**
 * Start photo verification process
 * PRIVACY-FIRST: Emphasized zero storage and temporary processing
 * @param {Context} ctx - Telegraf context
 */
const startPhotoVerification = async (ctx) => {
  const lang = getLanguage(ctx);

  const instructions = lang === 'es'
    ? `📸 *Instrucciones para la Foto - Tu Privacidad Protegida*

*Para una verificación exitosa:*
✓ Toma una selfie clara de tu rostro
✓ Asegúrate de tener buena iluminación
✓ Mira directamente a la cámara
✓ No uses filtros o efectos
✓ Tu rostro debe estar completamente visible

*🔐 PRIVACIDAD GARANTIZADA:*
📷 Tu foto se envía directamente a Face++ (IA)
🗑️ La foto se elimina INMEDIATAMENTE después de analizarla
❌ NUNCA guardamos imágenes faciales en nuestros servidores
📊 Solo guardamos: Fecha, resultado (verificado sí/no), edad estimada

*No rastreamos:*
• Características faciales específicas
• Datos biométricos
• Identificadores faciales

📷 *Envía tu foto ahora*

Presiona "Cancelar" si prefieres la confirmación manual.`
    : `📸 *Photo Instructions - Your Privacy Protected*

*For successful verification:*
✓ Take a clear selfie of your face
✓ Ensure good lighting
✓ Look directly at the camera
✓ Don't use filters or effects
✓ Your face must be fully visible

*🔐 PRIVACY GUARANTEED:*
📷 Your photo is sent directly to Face++ (AI)
🗑️ Photo is DELETED IMMEDIATELY after analysis
❌ We NEVER store facial images on our servers
📊 We only save: Date, result (verified yes/no), estimated age

*We do NOT track:*
• Specific facial features
• Biometric data
• Facial identifiers

📷 *Send your photo now*

Press "Cancel" if you prefer manual confirmation.`;

  ctx.session.temp = ctx.session.temp || {};
  ctx.session.temp.waitingForAgePhoto = true;
  await ctx.saveSession();

  await ctx.editMessageText(
    instructions,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(
          lang === 'es' ? '❌ Cancelar' : '❌ Cancel',
          'age_verify_manual'
        )],
      ])
    }
  );
};

/**
 * Handle age photo submission
 * @param {Context} ctx - Telegraf context
 */
const handleAgePhotoSubmission = async (ctx) => {
  try {
    const lang = getLanguage(ctx);

    // Get the highest quality photo
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const photoFileId = photo.file_id;

    logger.info(`Received age verification photo from user ${ctx.from.id}`);

    // Show processing message
    const processingMsg = await ctx.reply(
      lang === 'es'
        ? '⏳ Analizando tu foto con IA, por favor espera...'
        : '⏳ Analyzing your photo with AI, please wait...'
    );

    // Verify age with AI
    const result = await ageVerificationService.verifyAgeFromPhoto(ctx, photoFileId);

    // Delete processing message
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
    } catch (err) {
      // Ignore if can't delete
    }

    // Clear waiting flag
    ctx.session.temp.waitingForAgePhoto = false;
    await ctx.saveSession();

    // Handle result
    if (!result.success) {
      await handleVerificationError(ctx, result);
      return;
    }

    if (result.verified) {
      await handleVerificationSuccess(ctx, result);
    } else {
      await handleVerificationFailure(ctx, result);
    }
  } catch (error) {
    logger.error('Error handling age photo submission:', error);
    const lang = getLanguage(ctx);
    await ctx.reply(
      lang === 'es'
        ? '❌ Error al procesar la foto. Por favor, intenta nuevamente.'
        : '❌ Error processing photo. Please try again.'
    );
  }
};

/**
 * Handle verification error
 * @param {Context} ctx - Telegraf context
 * @param {Object} result - Verification result
 */
const handleVerificationError = async (ctx, result) => {
  const lang = getLanguage(ctx);

  let errorMessage;
  if (result.error === 'NO_FACE_DETECTED') {
    errorMessage = lang === 'es'
      ? `❌ *No se detectó un rostro*

No pudimos detectar un rostro claro en tu foto.

Por favor, intenta nuevamente con:
• Mejor iluminación
• Foto más cercana de tu rostro
• Sin gafas de sol u obstrucciones

¿Deseas intentar de nuevo?`
      : `❌ *No Face Detected*

We couldn't detect a clear face in your photo.

Please try again with:
• Better lighting
• Closer photo of your face
• No sunglasses or obstructions

Would you like to try again?`;
  } else {
    errorMessage = lang === 'es'
      ? `❌ *Error de Verificación*

Hubo un problema al verificar tu edad: ${result.message || result.error}

¿Deseas intentar de nuevo?`
      : `❌ *Verification Error*

There was a problem verifying your age: ${result.message || result.error}

Would you like to try again?`;
  }

  await ctx.reply(
    errorMessage,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(
          lang === 'es' ? '🔄 Intentar de Nuevo' : '🔄 Try Again',
          'age_verify_photo'
        )],
        [Markup.button.callback(
          lang === 'es' ? '✅ Verificación Manual' : '✅ Manual Verification',
          'age_verify_manual'
        )],
      ])
    }
  );
};

/**
 * Handle verification success
 * @param {Context} ctx - Telegraf context
 * @param {Object} result - Verification result
 */
const handleVerificationSuccess = async (ctx, result) => {
  const lang = getLanguage(ctx);

  const successMessage = lang === 'es'
    ? `✅ *Verificación Exitosa - Tu Privacidad Está Protegida*

Tu edad ha sido verificada correctamente.

📊 Edad estimada: ${result.age} años
🔒 Estado: Verificado

*Lo que sucedió con tu foto:*
🗑️ Tu foto fue analizada por Face++ (IA)
❌ Tu foto fue ELIMINADA inmediatamente después
🔐 No guardamos imágenes faciales
📊 Solo guardamos: Fecha, resultado, edad estimada

*Tu privacidad está garantizada:*
• No compartimos datos con terceros
• Tus datos están encriptados
• Puedes eliminar tu cuenta en cualquier momento

¡Gracias por completar la verificación!`
    : `✅ *Verification Successful - Your Privacy is Protected*

Your age has been verified successfully.

📊 Estimated age: ${result.age} years
🔒 Status: Verified

*What happened to your photo:*
🗑️ Your photo was analyzed by Face++ (AI)
❌ Your photo was DELETED immediately after
🔐 We do NOT store facial images
📊 We only save: Date, result, estimated age

*Your privacy is guaranteed:*
• We do NOT share data with third parties
• Your data is encrypted
• You can delete your account anytime

Thank you for completing the verification!`;

  await ctx.reply(successMessage, { parse_mode: 'Markdown' });

  // Update age verification status (session + cache invalidation)
  const { updateAgeVerificationStatus } = require('../../middleware/ageVerificationRequired');
  await updateAgeVerificationStatus(ctx, true, 'ai_photo');

  // Update session
  ctx.session.temp.ageConfirmed = true;
  await ctx.saveSession();

  // Continue with onboarding
  const { showTermsAndPrivacy } = require('./onboarding');
  await showTermsAndPrivacy(ctx);
};

/**
 * Handle verification failure (underage)
 * @param {Context} ctx - Telegraf context
 * @param {Object} result - Verification result
 */
const handleVerificationFailure = async (ctx, result) => {
  const lang = getLanguage(ctx);

  const failureMessage = lang === 'es'
    ? `❌ *Verificación No Exitosa*

Según nuestro análisis, no cumples con el requisito de edad mínima (${result.minAge} años).

📊 Edad estimada: ${result.age} años

Si crees que esto es un error, puedes:
• Intentar con otra foto más clara
• Contactar a soporte

Lo sentimos, pero no podemos proceder con tu registro.`
    : `❌ *Verification Failed*

According to our analysis, you don't meet the minimum age requirement (${result.minAge} years).

📊 Estimated age: ${result.age} years

If you believe this is an error, you can:
• Try with a clearer photo
• Contact support

We're sorry, but we cannot proceed with your registration.`;

  await ctx.reply(
    failureMessage,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(
          lang === 'es' ? '🔄 Intentar con Otra Foto' : '🔄 Try with Another Photo',
          'age_verify_photo'
        )],
        [Markup.button.callback(
          lang === 'es' ? '📞 Contactar Soporte' : '📞 Contact Support',
          'show_support'
        )],
      ])
    }
  );
};

/**
 * Show manual age confirmation (fallback)
 * @param {Context} ctx - Telegraf context
 */
const showManualAgeConfirmation = async (ctx) => {
  const lang = getLanguage(ctx);

  const message = lang === 'es'
    ? `⚠️ *Confirmación Manual de Edad*

Por favor, confirma que tienes al menos 18 años de edad.

Al hacer clic en "Confirmar", declaras bajo tu responsabilidad que eres mayor de edad.`
    : `⚠️ *Manual Age Confirmation*

Please confirm that you are at least 18 years old.

By clicking "Confirm", you declare under your responsibility that you are of legal age.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(
      lang === 'es' ? '✅ Confirmar (Soy mayor de 18)' : '✅ Confirm (I am 18+)',
      'age_confirm_yes'
    )],
    [Markup.button.callback(
      lang === 'es' ? '❌ No soy mayor de edad' : '❌ I am not of legal age',
      'age_confirm_no'
    )],
  ]);

  let edited = false;
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard,
      });
      edited = true;
    } catch (error) {
      if (error.description?.includes('message is not modified')) {
        // Content is already identical on screen — nothing to do, not a failure.
        edited = true;
      } else {
        // Includes "message to edit not found" and anything else: the edit did
        // NOT happen, so the user is left staring at the old screen. Must fall
        // through to the reply() below or they see no response at all.
        logger.warn('Could not edit manual age confirmation message, falling back to reply', {
          error: error.message,
          userId: ctx.from?.id,
        });
      }
    }
  }

  if (!edited) {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...keyboard,
    });
  }
};

module.exports = {
  registerAgeVerificationHandlers,
  showAgeVerificationOptions,
  startPhotoVerification,
  handleAgePhotoSubmission,
};
