const strings = {
  en: {
    pageTitle: "Welcome to PNPtv! — Get Started",

    // Progress
    stepOf: "Step {current} of {total}",

    // Shared buttons
    continueBtn: "Continue",
    backBtn: "Back",
    agreeBtn: "I Agree",

    // Step 1 — Welcome (freemium pitch)
    tiersTitle: "The Private PNP-aware Queer Adult Entertainment Digital Community",
    tiersBody:
      "Freemium platform — no credit card required. Join free and explore at your own pace.",

    // Step 2 — Age
    ageTitle: "Age Verification",
    ageSubtitle: "This platform contains adult content intended for verified members only. Please confirm your date of birth to continue.",
    ageSelectYear: "Year",
    ageSelectMonth: "Month",
    ageSelectDay: "Day",
    ageCheckLabel: "I confirm I am of age and eligible to access this platform.",
    ageErrorUnderage: "You do not meet the age requirements for this platform.",
    ageErrorInvalidDate: "Please select a valid date of birth.",
    ageErrorServer: "Age could not be verified. Please try again.",

    // Step 3 — Terms
    termsTitle: "Terms of Service",
    termsSubtitle: "Please read and agree to our Terms of Service to continue.",
    termsScrollHint: "Scroll to the bottom to enable the button.",
    termsExcerptHeading: "PNPtv! Terms of Service — Summary",
    termsP1:
      "By accessing PNPtv!, you agree to use the platform in accordance with all applicable laws. You must meet our membership age requirements to register and use any feature of this service.",
    termsP2:
      "PNPtv! hosts adult content created by verified members and creators. All content depicting real people requires documented consent. We operate under 18 U.S.C. §2257 record-keeping requirements and cooperate fully with law enforcement requests.",
    termsP3:
      "You may not upload, share, or distribute content that is illegal, depicts minors, or violates the privacy of others without consent. Violations result in immediate account termination and may be reported to law enforcement.",
    termsP4:
      "PNPtv! reserves the right to suspend or terminate accounts at any time for violations of these terms. Payments are non-refundable except where required by law. Subscriptions renew automatically unless cancelled.",
    termsFullLink: "Open full Terms of Service",

    // Step 4 — Privacy
    privacyTitle: "Privacy Policy",
    privacySubtitle: "Please read our Privacy Policy before continuing.",
    privacyExcerptHeading: "PNPtv! Privacy Policy — Summary",
    privacyP1:
      "PNPtv! collects only the information needed to operate the platform: your Telegram ID or email, username, and usage data. We never sell your data to third parties.",
    privacyP2:
      "Location data is only used when you choose to enable the nearby-users feature and is never stored long-term. You can disable it at any time from your profile settings.",
    privacyP3:
      "We use industry-standard encryption for data in transit and at rest. Payments are processed by third-party providers and PNPtv! does not store full payment card details.",
    privacyP4:
      "You have the right to request deletion of your account and all associated data at any time from Settings → Danger Zone. We will process deletion requests within 30 days.",
    privacyFullLink: "Open full Privacy Policy",

    // Step 5 — Community Rules
    rulesTitle: "Community Rules",
    rulesSubtitle: "These rules keep everyone safe. Please read and commit to following them.",
    rulesItems: [
      "Content involving minors in any context is strictly prohibited and will be reported to authorities immediately.",
      "Non-consensual content or any form of coercion is banned. Always get explicit consent.",
      "No harassment, threats, doxxing, or hate speech of any kind.",
      "No illegal drug sales, trafficking, or solicitation of any substance.",
      "No spam, scams, phishing, or impersonation.",
      "Never share private content without the owner’s explicit written consent.",
      "No selling, asking, or telling sourcing for substances. Harm-reduction discussions are welcome; marketplace activity is not.",
      "Performers must disclose whether props or real substances are being used on camera when asked by another member.",
    ] as const,
    rulesCheckLabel:
      "I will follow these rules. I understand violations result in immediate termination and reporting to authorities where required by law.",

    // Step 6 — Values
    valuesTitle: "Our Values",
    valuesSubtitle: "PNPtv! was built on these principles. They guide every feature we build.",
    valuesItems: [
      "Queer-built and queer-led — this space exists because we built it for ourselves.",
      "Harm-reduction, not abstinence-only — we provide information and support without judgment.",
      "Body autonomy is sacred — your choices about your body are yours alone.",
      "Anti-cop, anti-shame — we do not collaborate with law enforcement beyond legal obligations, and we never shame our members.",
      "Privacy-first — your data, identity, and activity are protected by design.",
    ] as const,

    // Step 7 — Wallet setup
    cryptoTitle: "Your Digital Wallet",
    cryptoSubtitle: "PNPtv! includes a built-in wallet — think of it as a prepaid account. No bank, no credit card needed.",
    cryptoFinishBtn: "Continue →",
    cryptoFinishLoading: "Setting up your account…",
  },

  es: {
    pageTitle: "Bienvenido a PNPtv! — Empezar",

    stepOf: "Paso {current} de {total}",

    continueBtn: "Continuar",
    backBtn: "Atrás",
    agreeBtn: "Acepto",

    tiersTitle: "La Comunidad Digital Adulta Queer PNP-aware",
    tiersBody:
      "Plataforma freemium — sin tarjeta de crédito. Únete gratis y explora a tu ritmo.",

    ageTitle: "Verificación de Edad",
    ageSubtitle: "Esta plataforma contiene contenido para adultos destinado exclusivamente a miembros verificados. Por favor confirma tu fecha de nacimiento para continuar.",
    ageSelectYear: "Año",
    ageSelectMonth: "Mes",
    ageSelectDay: "Día",
    ageCheckLabel: "Confirmo que tengo la edad requerida y soy elegible para acceder a esta plataforma.",
    ageErrorUnderage: "No cumples con los requisitos de edad para esta plataforma.",
    ageErrorInvalidDate: "Por favor selecciona una fecha de nacimiento válida.",
    ageErrorServer: "No se pudo verificar la edad. Intenta de nuevo.",

    termsTitle: "Términos de Servicio",
    termsSubtitle: "Lee y acepta nuestros Términos de Servicio para continuar.",
    termsScrollHint: "Desplázate al final para habilitar el botón.",
    termsExcerptHeading: "PNPtv! Términos de Servicio — Resumen",
    termsP1:
      "Al acceder a PNPtv!, aceptas usar la plataforma de acuerdo con todas las leyes aplicables. Debes cumplir con los requisitos de edad para miembros para registrarte y usar cualquier función de este servicio.",
    termsP2:
      "PNPtv! aloja contenido para adultos creado por miembros y creadores verificados. Todo el contenido que muestre a personas reales requiere consentimiento documentado. Operamos bajo los requisitos de registro del artículo 18 U.S.C. §2257 y cooperamos plenamente con las solicitudes de las autoridades.",
    termsP3:
      "No puedes cargar, compartir ni distribuir contenido ilegal, que muestre a menores de edad o que viole la privacidad de otros sin consentimiento. Las violaciones resultan en la terminación inmediata de la cuenta y pueden ser reportadas a las autoridades.",
    termsP4:
      "PNPtv! se reserva el derecho de suspender o cancelar cuentas en cualquier momento por violaciones de estos términos. Los pagos no son reembolsables excepto cuando lo exija la ley. Las suscripciones se renuevan automáticamente a menos que se cancelen.",
    termsFullLink: "Abrir Términos de Servicio completos",

    privacyTitle: "Política de Privacidad",
    privacySubtitle: "Lee nuestra Política de Privacidad antes de continuar.",
    privacyExcerptHeading: "PNPtv! Política de Privacidad — Resumen",
    privacyP1:
      "PNPtv! recopila solo la información necesaria para operar la plataforma: tu ID de Telegram o correo, nombre de usuario y datos de uso. Nunca vendemos tus datos a terceros.",
    privacyP2:
      "Los datos de ubicación solo se usan cuando eliges habilitar la función de usuarios cercanos y nunca se almacenan a largo plazo. Puedes desactivarla en cualquier momento desde la configuración de tu perfil.",
    privacyP3:
      "Usamos cifrado estándar del sector para datos en tránsito y en reposo. Los pagos son procesados por proveedores externos y PNPtv! no almacena detalles completos de tarjetas.",
    privacyP4:
      "Tienes derecho a solicitar la eliminación de tu cuenta y todos los datos asociados en cualquier momento desde Configuración → Zona de Peligro. Procesaremos las solicitudes de eliminación en 30 días.",
    privacyFullLink: "Abrir Política de Privacidad completa",

    rulesTitle: "Normas de la Comunidad",
    rulesSubtitle: "Estas reglas mantienen a todos seguros. Por favor léelas y compómetete a seguirlas.",
    rulesItems: [
      "El contenido que involucre menores en cualquier contexto está estrictamente prohibido y se reportará a las autoridades de inmediato.",
      "El contenido sin consentimiento o cualquier forma de coerción está prohibido. Siempre obtén consentimiento explícito.",
      "Prohibido el acoso, amenazas, doxxing o discurso de odio.",
      "Prohibida la venta ilegal de drogas, tráfico o solicitud de cualquier sustancia.",
      "Prohibido el spam, estafas, phishing o suplantación de identidad.",
      "Nunca compartas contenido privado sin el consentimiento escrito explícito del dueño.",
      "Prohibido vender, preguntar o decir dónde conseguir sustancias. Las discusiones de reducción de daños son bienvenidas; la actividad de mercado no.",
      "Los performers deben divulgar si usan utilería o sustancias reales en cámara cuando un miembro lo solicite.",
    ] as const,
    rulesCheckLabel:
      "Seguiré estas reglas. Entiendo que las violaciones resultan en terminación inmediata y reporte a las autoridades donde lo exija la ley.",

    valuesTitle: "Nuestros Valores",
    valuesSubtitle: "PNPtv! fue construido sobre estos principios. Guían cada función que desarrollamos.",
    valuesItems: [
      "Construido y liderado por queers — este espacio existe porque lo construimos para nosotros.",
      "Reducción de daños, no abstinencia — brindamos información y apoyo sin juzgar.",
      "La autonomía corporal es sagrada — tus decisiones sobre tu cuerpo son solo tuyas.",
      "Anti-autoridades coercitivas y anti-vergüenza — no colaboramos con la policía más allá de las obligaciones legales y nunca avergonzamos a nuestros miembros.",
      "Privacidad primero — tus datos, identidad y actividad están protegidos por diseño.",
    ] as const,

    cryptoTitle: "Tu Billetera Digital",
    cryptoSubtitle: "PNPtv! incluye una billetera integrada — funciona como cuenta prepagada. Sin banco, sin tarjeta de crédito.",
    cryptoFinishBtn: "Continuar →",
    cryptoFinishLoading: "Configurando tu cuenta…",
  },
} as const;

export type OnboardingStrings = typeof strings.en;
export { strings as onboarding };
