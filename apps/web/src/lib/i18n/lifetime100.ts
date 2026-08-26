export const strings = {
  en: {
    // ── Page head ──────────────────────────────────────────────────────────────
    pageTitle: "Founder Lifetime Prime — PNPtv!",

    // ── Hero ───────────────────────────────────────────────────────────────────
    heroTitle: "Lifetime Member + 2 Months PRIME",
    heroSubtitle: "Pay once. Yours forever.",

    // ── Pricing card ──────────────────────────────────────────────────────────
    oldPrice: "$250",
    newPrice: "$100",
    limitedBadge: "FOUNDERS PRICE · LIMITED SPOTS",
    chargeCurrencyNote: "Pay with USDC · USDT · ETH · BTC — no card needed",

    // ── Crypto payment modal ──────────────────────────────────────────────────
    cryptoModalTitle: "Pay Lifetime PRIME with crypto",
    cryptoModalSubtitle:
      "Enter your email, pick your coin, and complete the payment. PRIME activates automatically the moment your payment confirms — no waiting on a code.",
    cryptoPickCurrency: "Choose your currency",
    cryptoOpenWallet: "Open directly in your wallet:",
    cryptoContinue: "Continue to payment",
    cryptoOpeningInvoice: "Opening payment...",
    cryptoPayHere: "Complete the payment below",
    cryptoAfterPay:
      "Keep this tab open until the payment confirms. You'll get a confirmation email at the address above and PRIME activates automatically.",
    cryptoOpenInNewTab: "Open in new tab",
    cryptoCancel: "Close",
    cryptoUsdcLabel: "USDC",
    cryptoUsdtLabel: "USDT",
    cryptoEthLabel: "ETH",
    cryptoBtcLabel: "BTC",

    // ── Benefits list ─────────────────────────────────────────────────────────
    benefits: [
      "Pay once — full access forever, no renewals ever.",
      "2 months PRIME included — all exclusive content unlocked from day one.",
      "Everything: Live, Hangouts, Feed, DMs, Nearby, and more.",
      "Private sessions with creators + founding member status.",
      "Priority support, always.",
    ],

    // ── "Before you pay" notice ────────────────────────────────────────────────
    noticeTitle: "Good to know",
    noticeManualActivation:
      "Activation is done manually — usually within 2 hours, up to 24 max. That hands-on onboarding is one of the reasons we can offer this at $100 instead of $250.",
    noticeFundraising:
      "Your $100 goes directly to building PNPtv — founders' price while we finish.",
    noticeEarlyAccess:
      "You lock in lifetime access to every feature we ever ship.",
    noticeInProgress:
      "Some screens still in progress — we're moving fast.",

    // ── Sticky CTA ─────────────────────────────────────────────────────────────
    ctaGetAccess: "CLAIM YOUR SPOT — $100",
    ctaPayWithCrypto: "💎 PAY WITH CRYPTO — $100",
    ctaPayWithCard: "💳 PAY WITH CARD — $100",
    ctaLoading: "Checking availability...",
    ctaSoldOut: "Sold Out",

    // ── Card (MercadoPago) modal ───────────────────────────────────────────────
    cardModalTitle: "Pay with Card via MercadoPago",
    cardModalBody: "You'll be redirected to MercadoPago to complete your $100 payment. MercadoPago will charge ~320,000 COP (the equivalent of $100 USD). After paying, come back to /mercadopago to complete your activation — usually within a few hours.",
    cardModalOpenButton: "Open MercadoPago →",

    // ── Email capture modal ────────────────────────────────────────────────────
    modalTitle: "Get Your Payment Link",
    modalSubtitle:
      "Enter your email — we send a secure payment link instantly. After paying you'll get an activation code.",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    invalidEmail: "Please enter a valid email address.",
    modalSubmit: "Send My Link",
    modalSubmitting: "Sending...",
    modalCancel: "Cancel",

    // ── Confirmation modal ─────────────────────────────────────────────────────
    confirmationTitle: "Check Your Email!",
    confirmationBody:
      "Payment link sent. Complete the payment and you'll get an activation code within minutes.",
    confirmationCheckEmail:
      "Didn't get it? Check spam or try again.",
    confirmationClose: "Got it",

    // ── Activate view ──────────────────────────────────────────────────────────
    activateTitle: "Activate Your Membership",
    activateSubtitle:
      "Enter the activation code from your payment confirmation email.",
    codeLabel: "Activation code",
    codePlaceholder: "Enter your code",
    activateSubmit: "Activate",
    activateSubmitting: "Activating...",
    activateSuccessTitle: "Welcome to PNPtv!",
    activateSuccessBody:
      "Your lifetime membership is now active. Redirecting you to the app...",
    activateGoHome: "Go to PNPtv!",

    // ── Error messages ─────────────────────────────────────────────────────────
    errorGeneric: "Something went wrong. Please try again.",
    errorPoolEmpty:
      "All spots have been claimed. Join our waitlist to be notified if a spot opens up.",
    errorCodeExpired:
      "This code has expired. Please request a new payment link at /lifetime100.",
    errorCodeInvalid: "Code not found. Double-check that you entered it correctly.",
    errorPaymentNotReceived:
      "Payment not received yet. Complete the payment and wait a minute, then try again.",
    errorCodeAlreadyUsed:
      "This code has already been redeemed. Contact support if you believe this is an error.",
    errorActivationInProgress:
      "Activation is already in progress for this code. Wait a moment and try again.",
    errorActivateRateLimit:
      "Too many activation attempts. Please try again in an hour.",

    // ── Already paid link ──────────────────────────────────────────────────────
    alreadyPaid: "Already paid?",
    alreadyPaidLink: "Activate here",

    // ── /nequinegocios landing page ────────────────────────────────────────────
    nequiPageTitle: "Payment Confirmed — PNPtv!",
    nequiSuccessTitle: "Payment Received!",
    nequiSuccessBody: "Your Nequi Negocios payment was received. Enter your email below so we can send you your account activation details.",
    nequiPendingTitle: "Verifying Payment…",
    nequiPendingBody: "Your payment is being verified. Enter your email below and we'll contact you once confirmed.",
    nequiDeclinedTitle: "Payment Declined",
    nequiDeclinedBody: "It looks like your payment did not go through. Please try again or contact support.",
    nequiEmailLabel: "Your email address",
    nequiSubmit: "Send Me Activation Details",
    nequiSubmitting: "Sending…",
    nequiDoneTitle: "You're all set!",
    nequiDoneBody: "We'll send your activation details to your email within minutes. Already have a code?",
    nequiActivateLink: "Activate your membership here",
    nequiTryAgain: "Try a different email",

    // ── MercadoPago (mpago.li) entry on /lifetime100 ────────────────────────
    mercadoPagoCtaTitle: "Pay with MercadoPago",
    mercadoPagoCtaBody: "Charged in COP (~320,000 COP ≈ $100 USD). Manual activation within a few hours after we verify your payment.",
    mercadoPagoCtaButton: "Open MercadoPago →",
    mercadoPagoAlreadyPaid: "Already paid on MercadoPago?",
    mercadoPagoAlreadyPaidLink: "Send us your email so we can activate you →",

    // ── /mercadopago landing page ──────────────────────────────────────────
    mpagoPageTitle: "Payment Confirmed — PNPtv!",
    mpagoSuccessTitle: "Payment Received!",
    mpagoSuccessBody: "Your MercadoPago payment was received. Enter your email below so we can send you your account activation details.",
    mpagoPendingTitle: "Verifying Payment…",
    mpagoPendingBody: "Your payment is being verified. Enter your email below and we'll contact you once confirmed.",
    mpagoDeclinedTitle: "Payment Declined",
    mpagoDeclinedBody: "It looks like your payment did not go through. Please try again or contact support.",
    mpagoEmailLabel: "Your email address",
    mpagoSubmit: "Send Me Activation Details",
    mpagoSubmitting: "Sending…",
    mpagoDoneTitle: "You're all set!",
    mpagoDoneBody: "We'll send your activation details to your email within a few hours. Already have a code?",
    mpagoActivateLink: "Activate your membership here",
    mpagoTryAgain: "Try a different email",
  },

  es: {
    // ── Page head ──────────────────────────────────────────────────────────────
    pageTitle: "Fundador Lifetime Prime — PNPtv!",

    // ── Hero ───────────────────────────────────────────────────────────────────
    heroTitle: "Miembro de por vida + 2 Meses PRIME",
    heroSubtitle: "Paga una vez. Tuyo para siempre.",

    // ── Pricing card ──────────────────────────────────────────────────────────
    oldPrice: "$250",
    newPrice: "$100",
    limitedBadge: "PRECIO DE FUNDADORES · CUPOS LIMITADOS",
    chargeCurrencyNote: "Paga con USDC · USDT · ETH · BTC — sin tarjeta",

    // ── Crypto payment modal ──────────────────────────────────────────────────
    cryptoModalTitle: "Paga Lifetime PRIME con cripto",
    cryptoModalSubtitle:
      "Escribe tu correo, escoge la moneda y completa el pago. PRIME se activa automáticamente en cuanto tu pago confirme — sin esperar códigos.",
    cryptoPickCurrency: "Escoge tu moneda",
    cryptoOpenWallet: "Abre directo en tu wallet:",
    cryptoContinue: "Continuar al pago",
    cryptoOpeningInvoice: "Abriendo pago...",
    cryptoPayHere: "Completa el pago aquí abajo",
    cryptoAfterPay:
      "Deja esta pestaña abierta hasta que el pago confirme. Recibirás un correo de confirmación al email de arriba y PRIME se activará automáticamente.",
    cryptoOpenInNewTab: "Abrir en pestaña nueva",
    cryptoCancel: "Cerrar",
    cryptoUsdcLabel: "USDC",
    cryptoUsdtLabel: "USDT",
    cryptoEthLabel: "ETH",
    cryptoBtcLabel: "BTC",

    // ── Benefits list ─────────────────────────────────────────────────────────
    benefits: [
      "Paga una vez — acceso completo para siempre, sin renovaciones.",
      "2 meses PRIME incluidos — todo el contenido exclusivo desbloqueado desde el primer día.",
      "Todo: Live, Hangouts, Feed, DMs, Nearby y más.",
      "Sesiones privadas con creadores + estatus de miembro fundador.",
      "Soporte prioritario, siempre.",
    ],

    // ── "Before you pay" notice ────────────────────────────────────────────────
    noticeTitle: "Bueno saber",
    noticeManualActivation:
      "La activación se hace manualmente — normalmente en menos de 2 horas, máximo 24. Esa atención personal es una de las razones por las que podemos ofrecerlo a $100 en vez de $250.",
    noticeFundraising:
      "Tu $100 va directamente a construir PNPtv — precio de fundadores mientras terminamos.",
    noticeEarlyAccess:
      "Aseguras acceso de por vida a cada función que lancemos.",
    noticeInProgress:
      "Algunas pantallas aún en progreso — avanzando rápido.",

    // ── Sticky CTA ─────────────────────────────────────────────────────────────
    ctaGetAccess: "RECLAMA TU LUGAR — $100",
    ctaPayWithCrypto: "💎 PAGAR CON CRIPTO — $100",
    ctaPayWithCard: "💳 PAGAR CON TARJETA — $100",
    ctaLoading: "Verificando disponibilidad...",
    ctaSoldOut: "Agotado",

    // ── Card (MercadoPago) modal ───────────────────────────────────────────────
    cardModalTitle: "Pagar con Tarjeta vía MercadoPago",
    cardModalBody: "Serás redirigido a MercadoPago para completar tu pago de $100. MercadoPago cobrará ~320.000 COP (el equivalente a $100 USD). Después de pagar, vuelve a /mercadopago para completar tu activación — normalmente en pocas horas.",
    cardModalOpenButton: "Abrir MercadoPago →",

    // ── Email capture modal ────────────────────────────────────────────────────
    modalTitle: "Obtén Tu Link de Pago",
    modalSubtitle:
      "Escribe tu correo — te enviamos un link de pago seguro al instante. Tras pagar recibes tu código de activación.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tu@correo.com",
    invalidEmail: "Por favor ingresa un correo electrónico válido.",
    modalSubmit: "Enviar Mi Link",
    modalSubmitting: "Enviando...",
    modalCancel: "Cancelar",

    // ── Confirmation modal ─────────────────────────────────────────────────────
    confirmationTitle: "¡Revisa Tu Correo!",
    confirmationBody:
      "Link de pago enviado. Completa el pago y recibirás tu código de activación en minutos.",
    confirmationCheckEmail:
      "¿No lo ves? Revisa spam o intenta de nuevo.",
    confirmationClose: "Entendido",

    // ── Activate view ──────────────────────────────────────────────────────────
    activateTitle: "Activa Tu Membresía",
    activateSubtitle:
      "Ingresa el código de activación de tu correo de confirmación de pago.",
    codeLabel: "Código de activación",
    codePlaceholder: "Ingresa tu código",
    activateSubmit: "Activar",
    activateSubmitting: "Activando...",
    activateSuccessTitle: "¡Bienvenido a PNPtv!",
    activateSuccessBody:
      "Tu membresía de por vida está activa. Redirigiendo a la app...",
    activateGoHome: "Ir a PNPtv!",

    // ── Error messages ─────────────────────────────────────────────────────────
    errorGeneric: "Algo salió mal. Por favor intenta de nuevo.",
    errorPoolEmpty:
      "Todos los lugares han sido reclamados. Únete a la lista de espera para ser notificado si hay disponibilidad.",
    errorCodeExpired:
      "Este código ha expirado. Solicita un nuevo enlace de pago en /lifetime100.",
    errorCodeInvalid:
      "Código no encontrado. Verifica que lo hayas ingresado correctamente.",
    errorPaymentNotReceived:
      "Pago no recibido aún. Completa el pago, espera un minuto e intenta de nuevo.",
    errorCodeAlreadyUsed:
      "Este código ya fue canjeado. Contacta a soporte si crees que es un error.",
    errorActivationInProgress:
      "La activación ya está en proceso para este código. Espera un momento e intenta de nuevo.",
    errorActivateRateLimit:
      "Demasiados intentos de activación. Por favor intenta de nuevo en una hora.",

    // ── Already paid link ──────────────────────────────────────────────────────
    alreadyPaid: "¿Ya pagaste?",
    alreadyPaidLink: "Activa aquí",

    // ── /nequinegocios landing page ────────────────────────────────────────────
    nequiPageTitle: "Pago Confirmado — PNPtv!",
    nequiSuccessTitle: "¡Pago Recibido!",
    nequiSuccessBody: "Tu pago con Nequi fue recibido. Ingresa tu correo para que te enviemos los detalles de activación de tu membresía.",
    nequiPendingTitle: "Verificando tu pago…",
    nequiPendingBody: "Tu pago está siendo verificado. Ingresa tu correo y te contactamos cuando sea confirmado.",
    nequiDeclinedTitle: "Pago Rechazado",
    nequiDeclinedBody: "Parece que tu pago no fue procesado. Intenta de nuevo o contáctanos.",
    nequiEmailLabel: "Tu correo electrónico",
    nequiSubmit: "Enviarme los detalles de activación",
    nequiSubmitting: "Enviando…",
    nequiDoneTitle: "¡Todo listo!",
    nequiDoneBody: "Te enviaremos los detalles de activación a tu correo en minutos. ¿Ya tienes un código?",
    nequiActivateLink: "Activa tu membresía aquí",
    nequiTryAgain: "Usar otro correo",

    // ── MercadoPago (mpago.li) entry on /lifetime100 ────────────────────────
    mercadoPagoCtaTitle: "Paga con MercadoPago",
    mercadoPagoCtaBody: "Se cobra en pesos (~320.000 COP ≈ $100 USD). Activación manual en pocas horas después de verificar tu pago.",
    mercadoPagoCtaButton: "Abrir MercadoPago →",
    mercadoPagoAlreadyPaid: "¿Ya pagaste en MercadoPago?",
    mercadoPagoAlreadyPaidLink: "Envíanos tu correo y te activamos →",

    // ── /mercadopago landing page ──────────────────────────────────────────
    mpagoPageTitle: "Pago Confirmado — PNPtv!",
    mpagoSuccessTitle: "¡Pago Recibido!",
    mpagoSuccessBody: "Tu pago con MercadoPago fue recibido. Ingresa tu correo para que te enviemos los detalles de activación de tu membresía.",
    mpagoPendingTitle: "Verificando tu pago…",
    mpagoPendingBody: "Tu pago está siendo verificado. Ingresa tu correo y te contactamos cuando sea confirmado.",
    mpagoDeclinedTitle: "Pago Rechazado",
    mpagoDeclinedBody: "Parece que tu pago no fue procesado. Intenta de nuevo o contáctanos.",
    mpagoEmailLabel: "Tu correo electrónico",
    mpagoSubmit: "Enviarme los detalles de activación",
    mpagoSubmitting: "Enviando…",
    mpagoDoneTitle: "¡Todo listo!",
    mpagoDoneBody: "Te enviaremos los detalles de activación a tu correo en pocas horas. ¿Ya tienes un código?",
    mpagoActivateLink: "Activa tu membresía aquí",
    mpagoTryAgain: "Usar otro correo",
  },
};

export type Lifetime100Strings = (typeof strings)["en"];

export function useLifetime100Strings(lang?: string): Lifetime100Strings {
  const key = (lang || "es").toLowerCase().startsWith("en") ? "en" : "es";
  return strings[key as keyof typeof strings];
}
