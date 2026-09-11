export const strings = {
  en: {
    // ── Page head ──────────────────────────────────────────────────────────────
    pageTitle: "Founder Lifetime Prime — PNPtv!",

    // ── Hero ───────────────────────────────────────────────────────────────────
    heroTitle: "Lifetime PRIME Member",
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

    // ── Banxa "buy crypto with card" hint (BTC only) ──────────────────────────
    banxaHintTitle: "💳 Don't have a crypto wallet?",
    banxaHintBody:
      "Copy the BTC address below → open checkout.banxa.com → paste it as the destination and pay with your credit or debit card. Your plan activates automatically.",
    banxaHintCta: "Open checkout.banxa.com →",

    // ── Widget reliability (loading, error, reload, fallback) ─────────────────
    widgetLoading: "Loading payment widget…",
    widgetFailed: "Widget didn't load. Open the payment page in a new tab instead:",
    widgetFallbackCta: "Open full payment page →",
    widgetReload: "Reload widget",

    // ── Benefits list ─────────────────────────────────────────────────────────
    benefits: [
      "Pay once — full PRIME access forever, no renewals ever.",
      "Every exclusive drop unlocked for life — from day one, no expirations.",
      "Everything: Live, Hangouts, Feed, DMs, Nearby, and more.",
      "Private sessions with creators + founding member status.",
      "Priority support, always.",
    ],

    // ── "Before you pay" notice ────────────────────────────────────────────────
    noticeTitle: "Good to know",
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
    ctaPayWithWallet: "💳 PAY WITH CARD — $100",
    ctaPayWithDash: "🐎 PAY WITH DASH — $100",
    ctaLoading: "Checking availability...",
    ctaSoldOut: "Sold Out",

    // ── Card (MercadoPago) modal ───────────────────────────────────────────────
    cardModalTitle: "Pay via Local Payment",
    cardModalBody: "A payment link will open in your browser to complete your $100 payment. After paying, come back to complete your activation — usually within a few hours.",
    cardModalOpenButton: "Open Payment Link →",

    // ── Wallet (USDC on Base via Privy) modal ─────────────────────────────────
    walletModalTitle: "Pay with Card — USDC on Base",
    walletModalSubtitle: "Pay with your credit/debit card, Apple Pay, Google Pay, or connect Trust / MetaMask. Settles instantly as USDC on Base — PRIME activates the moment the payment confirms.",
    walletPayLabel: "Pay $100 · Lifetime PRIME",

    // ── Dash Direct modal ─────────────────────────────────────────────────────
    dashModalTitle: "🐎 Dash Direct",
    dashModalBody: "Send ≈ $100 USD worth of Dash to this address:",
    dashCurrentPrice: "Current price:",
    dashAfterPay: "📧 After paying, email your tx hash + your email to support@pnptv.app — we activate within 2h (24h max).",
    dashCopyAddress: "📋 Copy address",

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
    nequiSuccessBody: "Your payment was received. Enter your email below so we can send you your account activation details.",
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
    mercadoPagoCtaTitle: "Pay via Local Payment",
    mercadoPagoCtaBody: "A payment link will open in your browser. Manual activation within a few hours after we verify your payment.",
    mercadoPagoCtaButton: "Open Payment Link →",
    mercadoPagoAlreadyPaid: "Already paid via local payment?",
    mercadoPagoAlreadyPaidLink: "Send us your email so we can activate you →",

    // ── /mercadopago landing page ──────────────────────────────────────────
    mpagoPageTitle: "Payment Confirmed — PNPtv!",
    mpagoSuccessTitle: "Payment Received!",
    mpagoSuccessBody: "Your payment was received. Enter your email below so we can send you your account activation details.",
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
    heroTitle: "Miembro PRIME de por vida",
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

    // ── Banxa "buy crypto with card" hint (BTC only) ──────────────────────────
    banxaHintTitle: "💳 ¿No tienes wallet cripto?",
    banxaHintBody:
      "Copia la dirección BTC de abajo → abre checkout.banxa.com → pégala como destino y paga con tu tarjeta de crédito o débito. Tu plan se activa automáticamente.",
    banxaHintCta: "Abrir checkout.banxa.com →",

    // ── Widget reliability (loading, error, reload, fallback) ─────────────────
    widgetLoading: "Cargando widget de pago…",
    widgetFailed: "El widget no cargó. Abre la página de pago en una pestaña nueva:",
    widgetFallbackCta: "Abrir página completa de pago →",
    widgetReload: "Recargar widget",

    // ── Benefits list ─────────────────────────────────────────────────────────
    benefits: [
      "Paga una vez — acceso PRIME completo para siempre, sin renovaciones.",
      "Cada estreno exclusivo desbloqueado de por vida — desde el primer día, sin expiraciones.",
      "Todo: Live, Hangouts, Feed, DMs, Nearby y más.",
      "Sesiones privadas con creadores + estatus de miembro fundador.",
      "Soporte prioritario, siempre.",
    ],

    // ── "Before you pay" notice ────────────────────────────────────────────────
    noticeTitle: "Bueno saber",
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
    ctaPayWithWallet: "💳 PAGAR CON TARJETA — $100",
    ctaPayWithDash: "🐎 PAGAR CON DASH — $100",
    ctaLoading: "Verificando disponibilidad...",
    ctaSoldOut: "Agotado",

    // ── Card (MercadoPago) modal ───────────────────────────────────────────────
    cardModalTitle: "Pago Local",
    cardModalBody: "Se abrirá un enlace de pago en tu navegador para completar tu pago de $100. Después de pagar, vuelve para completar tu activación — normalmente en pocas horas.",
    cardModalOpenButton: "Abrir Enlace de Pago →",

    // ── Wallet (USDC on Base via Privy) modal ─────────────────────────────────
    walletModalTitle: "Pagar con Tarjeta — USDC en Base",
    walletModalSubtitle: "Paga con tu tarjeta de crédito/débito, Apple Pay, Google Pay, o conecta Trust / MetaMask. Se acredita al instante como USDC en Base — PRIME se activa apenas confirme el pago.",
    walletPayLabel: "Pagar $100 · PRIME de por vida",

    // ── Dash Direct modal ─────────────────────────────────────────────────────
    dashModalTitle: "🐎 Dash Directo",
    dashModalBody: "Envía ≈ $100 USD en Dash a esta dirección:",
    dashCurrentPrice: "Precio actual:",
    dashAfterPay: "📧 Después de pagar, envía el tx hash + tu correo a support@pnptv.app — activamos en menos de 2h (máx 24h).",
    dashCopyAddress: "📋 Copiar dirección",

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
    nequiSuccessBody: "Tu pago fue recibido. Ingresa tu correo para que te enviemos los detalles de activación de tu membresía.",
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
    mercadoPagoCtaTitle: "Pago Local",
    mercadoPagoCtaBody: "Se abrirá un enlace de pago en tu navegador. Activación manual en pocas horas después de verificar tu pago.",
    mercadoPagoCtaButton: "Abrir Enlace de Pago →",
    mercadoPagoAlreadyPaid: "¿Ya pagaste por enlace local?",
    mercadoPagoAlreadyPaidLink: "Envíanos tu correo y te activamos →",

    // ── /mercadopago landing page ──────────────────────────────────────────
    mpagoPageTitle: "Pago Confirmado — PNPtv!",
    mpagoSuccessTitle: "¡Pago Recibido!",
    mpagoSuccessBody: "Tu pago fue recibido. Ingresa tu correo para que te enviemos los detalles de activación de tu membresía.",
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
