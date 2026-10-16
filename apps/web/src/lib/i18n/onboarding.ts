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
      "Never share private content without the owner's explicit written consent.",
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

  pt: {
    pageTitle: "Bem-vindo ao PNPtv! — Começar",

    stepOf: "Passo {current} de {total}",

    continueBtn: "Continuar",
    backBtn: "Voltar",
    agreeBtn: "Concordo",

    tiersTitle: "A Comunidade Digital Adulta Queer PNP",
    tiersBody:
      "Plataforma freemium — sem cartão de crédito. Entre grátis e explore no seu ritmo.",

    ageTitle: "Verificação de Idade",
    ageSubtitle: "Esta plataforma contém conteúdo adulto destinado exclusivamente a membros verificados. Por favor confirme a sua data de nascimento para continuar.",
    ageSelectYear: "Ano",
    ageSelectMonth: "Mês",
    ageSelectDay: "Dia",
    ageCheckLabel: "Confirmo que tenho a idade necessária e sou elegível para acessar esta plataforma.",
    ageErrorUnderage: "Você não atende aos requisitos de idade desta plataforma.",
    ageErrorInvalidDate: "Por favor selecione uma data de nascimento válida.",
    ageErrorServer: "A idade não pôde ser verificada. Tente novamente.",

    termsTitle: "Termos de Serviço",
    termsSubtitle: "Leia e concorde com nossos Termos de Serviço para continuar.",
    termsScrollHint: "Role até o final para habilitar o botão.",
    termsExcerptHeading: "PNPtv! Termos de Serviço — Resumo",
    termsP1:
      "Ao acessar o PNPtv!, você concorda em usar a plataforma de acordo com todas as leis aplicáveis. Você deve atender aos requisitos de idade para membros para se registrar e usar qualquer recurso deste serviço.",
    termsP2:
      "O PNPtv! hospeda conteúdo adulto criado por membros e criadores verificados. Todo conteúdo que retrate pessoas reais requer consentimento documentado. Operamos sob os requisitos de registro do 18 U.S.C. §2257 e cooperamos plenamente com solicitações de autoridades.",
    termsP3:
      "Você não pode carregar, compartilhar ou distribuir conteúdo ilegal, que retrate menores ou que viole a privacidade de outros sem consentimento. Violações resultam em rescisão imediata da conta e podem ser reportadas às autoridades.",
    termsP4:
      "O PNPtv! reserva-se o direito de suspender ou encerrar contas a qualquer momento por violações destes termos. Os pagamentos não são reembolsáveis, exceto quando exigido por lei. As assinaturas são renovadas automaticamente a menos que sejam canceladas.",
    termsFullLink: "Abrir Termos de Serviço completos",

    privacyTitle: "Política de Privacidade",
    privacySubtitle: "Leia nossa Política de Privacidade antes de continuar.",
    privacyExcerptHeading: "PNPtv! Política de Privacidade — Resumo",
    privacyP1:
      "O PNPtv! coleta apenas as informações necessárias para operar a plataforma: seu Telegram ID ou e-mail, nome de usuário e dados de uso. Nunca vendemos seus dados a terceiros.",
    privacyP2:
      "Os dados de localização são usados apenas quando você opta por habilitar o recurso de usuários próximos e nunca são armazenados a longo prazo. Você pode desativá-lo a qualquer momento nas configurações do seu perfil.",
    privacyP3:
      "Usamos criptografia padrão do setor para dados em trânsito e em repouso. Os pagamentos são processados por provedores terceiros e o PNPtv! não armazena detalhes completos de cartões.",
    privacyP4:
      "Você tem o direito de solicitar a exclusão de sua conta e todos os dados associados a qualquer momento em Configurações → Zona de Perigo. Processaremos as solicitações de exclusão em 30 dias.",
    privacyFullLink: "Abrir Política de Privacidade completa",

    rulesTitle: "Regras da Comunidade",
    rulesSubtitle: "Estas regras mantêm todos seguros. Por favor leia e comprometa-se a segui-las.",
    rulesItems: [
      "Conteúdo envolvendo menores em qualquer contexto é estritamente proibido e será reportado às autoridades imediatamente.",
      "Conteúdo sem consentimento ou qualquer forma de coerção é proibido. Sempre obtenha consentimento explícito.",
      "Proibido assédio, ameaças, doxxing ou discurso de ódio de qualquer tipo.",
      "Proibida a venda ilegal de drogas, tráfico ou solicitação de qualquer substância.",
      "Proibido spam, golpes, phishing ou personificação.",
      "Nunca compartilhe conteúdo privado sem o consentimento escrito explícito do proprietário.",
      "Proibido vender, perguntar ou informar fontes de substâncias. Discussões de redução de danos são bem-vindas; atividade de mercado não.",
      "Performers devem divulgar se estão usando adereços ou substâncias reais na câmera quando solicitado por outro membro.",
    ] as const,
    rulesCheckLabel:
      "Seguirei estas regras. Entendo que as violações resultam em rescisão imediata e reporte às autoridades onde exigido por lei.",

    valuesTitle: "Nossos Valores",
    valuesSubtitle: "O PNPtv! foi construído sobre esses princípios. Eles guiam cada recurso que desenvolvemos.",
    valuesItems: [
      "Construído e liderado por queers — este espaço existe porque o construímos para nós mesmos.",
      "Redução de danos, não abstinência — fornecemos informações e suporte sem julgamento.",
      "A autonomia corporal é sagrada — suas escolhas sobre seu corpo são apenas suas.",
      "Anti-repressão e anti-vergonha — não colaboramos com as forças de segurança além das obrigações legais e nunca envergonhamos nossos membros.",
      "Privacidade em primeiro lugar — seus dados, identidade e atividade são protegidos por design.",
    ] as const,

    cryptoTitle: "Sua Carteira Digital",
    cryptoSubtitle: "O PNPtv! inclui uma carteira integrada — funciona como uma conta pré-paga. Sem banco, sem cartão de crédito.",
    cryptoFinishBtn: "Continuar →",
    cryptoFinishLoading: "Configurando sua conta…",
  },

  fr: {
    pageTitle: "Bienvenue sur PNPtv! — Commencer",

    stepOf: "Étape {current} sur {total}",

    continueBtn: "Continuer",
    backBtn: "Retour",
    agreeBtn: "J'accepte",

    tiersTitle: "La Communauté Numérique Adulte Queer PNP",
    tiersBody:
      "Plateforme freemium — aucune carte de crédit requise. Rejoignez gratuitement et explorez à votre rythme.",

    ageTitle: "Vérification de l'âge",
    ageSubtitle: "Cette plateforme contient du contenu adulte destiné exclusivement aux membres vérifiés. Veuillez confirmer votre date de naissance pour continuer.",
    ageSelectYear: "Année",
    ageSelectMonth: "Mois",
    ageSelectDay: "Jour",
    ageCheckLabel: "Je confirme que j'ai l'âge requis et que je suis éligible pour accéder à cette plateforme.",
    ageErrorUnderage: "Vous ne remplissez pas les conditions d'âge de cette plateforme.",
    ageErrorInvalidDate: "Veuillez sélectionner une date de naissance valide.",
    ageErrorServer: "L'âge n'a pas pu être vérifié. Veuillez réessayer.",

    termsTitle: "Conditions d'utilisation",
    termsSubtitle: "Veuillez lire et accepter nos Conditions d'utilisation pour continuer.",
    termsScrollHint: "Faites défiler jusqu'en bas pour activer le bouton.",
    termsExcerptHeading: "PNPtv! Conditions d'utilisation — Résumé",
    termsP1:
      "En accédant à PNPtv!, vous acceptez d'utiliser la plateforme conformément à toutes les lois applicables. Vous devez remplir les conditions d'âge pour vous inscrire et utiliser tout service.",
    termsP2:
      "PNPtv! héberge du contenu adulte créé par des membres et créateurs vérifiés. Tout contenu représentant de vraies personnes nécessite un consentement documenté. Nous opérons sous les exigences de la loi 18 U.S.C. §2257 et coopérons pleinement avec les demandes des forces de l'ordre.",
    termsP3:
      "Vous ne pouvez pas télécharger, partager ou distribuer du contenu illégal, représentant des mineurs ou violant la vie privée d'autrui sans consentement. Les violations entraînent la résiliation immédiate du compte et peuvent être signalées aux autorités.",
    termsP4:
      "PNPtv! se réserve le droit de suspendre ou de résilier des comptes à tout moment pour violation de ces conditions. Les paiements sont non remboursables sauf si la loi l'exige. Les abonnements se renouvellent automatiquement sauf annulation.",
    termsFullLink: "Ouvrir les Conditions d'utilisation complètes",

    privacyTitle: "Politique de confidentialité",
    privacySubtitle: "Veuillez lire notre Politique de confidentialité avant de continuer.",
    privacyExcerptHeading: "PNPtv! Politique de confidentialité — Résumé",
    privacyP1:
      "PNPtv! collecte uniquement les informations nécessaires au fonctionnement de la plateforme : votre identifiant Telegram ou e-mail, votre nom d'utilisateur et vos données d'utilisation. Nous ne vendons jamais vos données à des tiers.",
    privacyP2:
      "Les données de localisation ne sont utilisées que lorsque vous choisissez d'activer la fonctionnalité utilisateurs à proximité et ne sont jamais stockées à long terme. Vous pouvez la désactiver à tout moment dans les paramètres de votre profil.",
    privacyP3:
      "Nous utilisons un chiffrement standard du secteur pour les données en transit et au repos. Les paiements sont traités par des prestataires tiers et PNPtv! ne stocke pas les détails complets des cartes.",
    privacyP4:
      "Vous avez le droit de demander la suppression de votre compte et de toutes les données associées à tout moment depuis Paramètres → Zone de danger. Nous traiterons les demandes de suppression dans les 30 jours.",
    privacyFullLink: "Ouvrir la Politique de confidentialité complète",

    rulesTitle: "Règles de la communauté",
    rulesSubtitle: "Ces règles assurent la sécurité de tous. Veuillez les lire et vous engager à les respecter.",
    rulesItems: [
      "Tout contenu impliquant des mineurs dans quelque contexte que ce soit est strictement interdit et sera immédiatement signalé aux autorités.",
      "Le contenu non consensuel ou toute forme de coercition est interdit. Obtenez toujours un consentement explicite.",
      "Aucun harcèlement, menace, doxxing ou discours de haine de quelque nature que ce soit.",
      "Aucune vente illégale de drogues, trafic ou sollicitation de toute substance.",
      "Aucun spam, arnaque, phishing ou usurpation d'identité.",
      "Ne partagez jamais de contenu privé sans le consentement écrit explicite du propriétaire.",
      "Aucune vente, demande ou indication de sources pour des substances. Les discussions sur la réduction des risques sont les bienvenues ; les activités commerciales ne le sont pas.",
      "Les artistes doivent indiquer s'ils utilisent des accessoires ou de vraies substances devant la caméra lorsqu'un autre membre le demande.",
    ] as const,
    rulesCheckLabel:
      "Je respecterai ces règles. Je comprends que les violations entraînent une résiliation immédiate et un signalement aux autorités si la loi l'exige.",

    valuesTitle: "Nos valeurs",
    valuesSubtitle: "PNPtv! a été construit sur ces principes. Ils guident chaque fonctionnalité que nous développons.",
    valuesItems: [
      "Construit et dirigé par des queers — cet espace existe parce que nous l'avons créé pour nous-mêmes.",
      "La réduction des risques, pas l'abstinence totale — nous fournissons informations et soutien sans jugement.",
      "L'autonomie corporelle est sacrée — vos choix concernant votre corps vous appartiennent.",
      "Anti-répression, anti-honte — nous ne collaborons pas avec les forces de l'ordre au-delà de nos obligations légales, et nous ne faisons jamais honte à nos membres.",
      "La vie privée avant tout — vos données, votre identité et votre activité sont protégées par conception.",
    ] as const,

    cryptoTitle: "Votre portefeuille numérique",
    cryptoSubtitle: "PNPtv! inclut un portefeuille intégré — pensez-y comme un compte prépayé. Pas de banque, pas de carte de crédit.",
    cryptoFinishBtn: "Continuer →",
    cryptoFinishLoading: "Configuration de votre compte…",
  },

  de: {
    pageTitle: "Willkommen bei PNPtv! — Jetzt starten",

    stepOf: "Schritt {current} von {total}",

    continueBtn: "Weiter",
    backBtn: "Zurück",
    agreeBtn: "Ich stimme zu",

    tiersTitle: "Die Private Queer PNP Erwachsenen-Digitalgemeinschaft",
    tiersBody:
      "Freemium-Plattform — keine Kreditkarte erforderlich. Kostenlos beitreten und in eigenem Tempo erkunden.",

    ageTitle: "Altersverifikation",
    ageSubtitle: "Diese Plattform enthält Inhalte für Erwachsene, die ausschließlich für verifizierte Mitglieder bestimmt sind. Bitte bestätige dein Geburtsdatum, um fortzufahren.",
    ageSelectYear: "Jahr",
    ageSelectMonth: "Monat",
    ageSelectDay: "Tag",
    ageCheckLabel: "Ich bestätige, dass ich das erforderliche Alter erreicht habe und berechtigt bin, auf diese Plattform zuzugreifen.",
    ageErrorUnderage: "Du erfüllst nicht die Altersanforderungen dieser Plattform.",
    ageErrorInvalidDate: "Bitte wähle ein gültiges Geburtsdatum aus.",
    ageErrorServer: "Das Alter konnte nicht verifiziert werden. Bitte versuche es erneut.",

    termsTitle: "Nutzungsbedingungen",
    termsSubtitle: "Bitte lies und stimme unseren Nutzungsbedingungen zu, um fortzufahren.",
    termsScrollHint: "Scrolle nach unten, um die Schaltfläche zu aktivieren.",
    termsExcerptHeading: "PNPtv! Nutzungsbedingungen — Zusammenfassung",
    termsP1:
      "Durch den Zugriff auf PNPtv! stimmst du zu, die Plattform in Übereinstimmung mit allen geltenden Gesetzen zu nutzen. Du musst die Altersanforderungen für Mitglieder erfüllen, um dich zu registrieren und jeden Dienst zu nutzen.",
    termsP2:
      "PNPtv! hostet Erwachseneninhalte, die von verifizierten Mitgliedern und Creators erstellt wurden. Alle Inhalte, die echte Personen darstellen, erfordern eine dokumentierte Zustimmung. Wir operieren unter den Anforderungen von 18 U.S.C. §2257 und kooperieren vollständig mit Strafverfolgungsbehörden.",
    termsP3:
      "Du darfst keine illegalen Inhalte hochladen, teilen oder verbreiten, die Minderjährige darstellen oder die Privatsphäre anderer ohne Zustimmung verletzen. Verstöße führen zur sofortigen Kontosperrung und können den Behörden gemeldet werden.",
    termsP4:
      "PNPtv! behält sich das Recht vor, Konten jederzeit wegen Verstößen gegen diese Bedingungen zu sperren oder zu kündigen. Zahlungen sind nicht erstattungsfähig, es sei denn, dies ist gesetzlich vorgeschrieben. Abonnements verlängern sich automatisch, sofern sie nicht gekündigt werden.",
    termsFullLink: "Vollständige Nutzungsbedingungen öffnen",

    privacyTitle: "Datenschutzrichtlinie",
    privacySubtitle: "Bitte lies unsere Datenschutzrichtlinie, bevor du fortfährst.",
    privacyExcerptHeading: "PNPtv! Datenschutzrichtlinie — Zusammenfassung",
    privacyP1:
      "PNPtv! sammelt nur die Informationen, die für den Betrieb der Plattform erforderlich sind: deine Telegram-ID oder E-Mail, Benutzername und Nutzungsdaten. Wir verkaufen deine Daten niemals an Dritte.",
    privacyP2:
      "Standortdaten werden nur verwendet, wenn du die Funktion für nahegelegene Benutzer aktivierst, und werden niemals langfristig gespeichert. Du kannst sie jederzeit in deinen Profileinstellungen deaktivieren.",
    privacyP3:
      "Wir verwenden branchenübliche Verschlüsselung für Daten im Transit und im Ruhezustand. Zahlungen werden von Drittanbietern verarbeitet, und PNPtv! speichert keine vollständigen Zahlungskartendetails.",
    privacyP4:
      "Du hast das Recht, jederzeit unter Einstellungen → Gefahrenzone die Löschung deines Kontos und aller zugehörigen Daten zu beantragen. Wir bearbeiten Löschanfragen innerhalb von 30 Tagen.",
    privacyFullLink: "Vollständige Datenschutzrichtlinie öffnen",

    rulesTitle: "Community-Regeln",
    rulesSubtitle: "Diese Regeln halten alle sicher. Bitte lies sie und verpflichte dich, sie einzuhalten.",
    rulesItems: [
      "Inhalte mit Minderjährigen in jedem Kontext sind streng verboten und werden sofort den Behörden gemeldet.",
      "Nicht-einvernehmliche Inhalte oder jegliche Form von Nötigung sind verboten. Hol immer ausdrückliche Zustimmung ein.",
      "Kein Belästigung, Drohungen, Doxxing oder Hassrede jeglicher Art.",
      "Kein illegaler Drogenverkauf, Handel oder Beschaffungsanfragen für Substanzen.",
      "Kein Spam, Betrug, Phishing oder Identitätsbetrug.",
      "Teile niemals private Inhalte ohne die ausdrückliche schriftliche Zustimmung des Eigentümers.",
      "Kein Verkauf, Anfragen oder Hinweise auf Beschaffungsquellen für Substanzen. Harm-Reduction-Diskussionen sind willkommen; Marktplatzaktivitäten nicht.",
      "Performer müssen auf Anfrage eines anderen Mitglieds offenlegen, ob Requisiten oder echte Substanzen vor der Kamera verwendet werden.",
    ] as const,
    rulesCheckLabel:
      "Ich werde diese Regeln befolgen. Ich verstehe, dass Verstöße zur sofortigen Kündigung und Meldung an die Behörden führen, wo gesetzlich vorgeschrieben.",

    valuesTitle: "Unsere Werte",
    valuesSubtitle: "PNPtv! wurde auf diesen Grundsätzen aufgebaut. Sie leiten jede Funktion, die wir entwickeln.",
    valuesItems: [
      "Queer-gebaut und queer-geführt — dieser Raum existiert, weil wir ihn für uns selbst gebaut haben.",
      "Schadensminimierung, nicht nur Abstinenz — wir bieten Informationen und Unterstützung ohne Urteil.",
      "Körperliche Selbstbestimmung ist heilig — deine Entscheidungen über deinen Körper gehören dir allein.",
      "Anti-Repression, anti-Scham — wir arbeiten über gesetzliche Verpflichtungen hinaus nicht mit den Strafverfolgungsbehörden zusammen und beschämen niemals unsere Mitglieder.",
      "Datenschutz zuerst — deine Daten, Identität und Aktivitäten sind von Grund auf geschützt.",
    ] as const,

    cryptoTitle: "Deine digitale Geldbörse",
    cryptoSubtitle: "PNPtv! enthält eine integrierte Geldbörse — stell sie dir wie ein Prepaid-Konto vor. Kein Bankkonto, keine Kreditkarte erforderlich.",
    cryptoFinishBtn: "Weiter →",
    cryptoFinishLoading: "Dein Konto wird eingerichtet…",
  },

  it: {
    pageTitle: "Benvenuto su PNPtv! — Inizia",

    stepOf: "Passo {current} di {total}",

    continueBtn: "Continua",
    backBtn: "Indietro",
    agreeBtn: "Accetto",

    tiersTitle: "La Comunità Digitale Adulta Queer PNP",
    tiersBody:
      "Piattaforma freemium — nessuna carta di credito richiesta. Iscriviti gratis ed esplora al tuo ritmo.",

    ageTitle: "Verifica dell'età",
    ageSubtitle: "Questa piattaforma contiene contenuti per adulti destinati esclusivamente ai membri verificati. Conferma la tua data di nascita per continuare.",
    ageSelectYear: "Anno",
    ageSelectMonth: "Mese",
    ageSelectDay: "Giorno",
    ageCheckLabel: "Confermo di aver raggiunto l'età richiesta e di essere idoneo ad accedere a questa piattaforma.",
    ageErrorUnderage: "Non soddisfi i requisiti di età di questa piattaforma.",
    ageErrorInvalidDate: "Seleziona una data di nascita valida.",
    ageErrorServer: "L'età non ha potuto essere verificata. Riprova.",

    termsTitle: "Termini di servizio",
    termsSubtitle: "Leggi e accetta i nostri Termini di servizio per continuare.",
    termsScrollHint: "Scorri fino in fondo per abilitare il pulsante.",
    termsExcerptHeading: "PNPtv! Termini di servizio — Riepilogo",
    termsP1:
      "Accedendo a PNPtv!, accetti di utilizzare la piattaforma in conformità con tutte le leggi applicabili. Devi soddisfare i requisiti di età per i membri per registrarti e utilizzare qualsiasi funzione del servizio.",
    termsP2:
      "PNPtv! ospita contenuti per adulti creati da membri e creator verificati. Tutti i contenuti che ritraggono persone reali richiedono il consenso documentato. Operiamo secondo i requisiti di 18 U.S.C. §2257 e collaboriamo pienamente con le forze dell'ordine.",
    termsP3:
      "Non puoi caricare, condividere o distribuire contenuti illegali, che ritraggono minori o violano la privacy altrui senza consenso. Le violazioni comportano la chiusura immediata dell'account e possono essere segnalate alle autorità.",
    termsP4:
      "PNPtv! si riserva il diritto di sospendere o chiudere account in qualsiasi momento per violazioni dei presenti termini. I pagamenti non sono rimborsabili salvo quanto previsto dalla legge. Gli abbonamenti si rinnovano automaticamente salvo cancellazione.",
    termsFullLink: "Apri i Termini di servizio completi",

    privacyTitle: "Informativa sulla privacy",
    privacySubtitle: "Leggi la nostra Informativa sulla privacy prima di continuare.",
    privacyExcerptHeading: "PNPtv! Informativa sulla privacy — Riepilogo",
    privacyP1:
      "PNPtv! raccoglie solo le informazioni necessarie per gestire la piattaforma: il tuo ID Telegram o e-mail, nome utente e dati di utilizzo. Non vendiamo mai i tuoi dati a terzi.",
    privacyP2:
      "I dati di localizzazione vengono utilizzati solo quando scegli di abilitare la funzione utenti nelle vicinanze e non vengono mai archiviati a lungo termine. Puoi disattivarla in qualsiasi momento dalle impostazioni del profilo.",
    privacyP3:
      "Utilizziamo la crittografia standard del settore per i dati in transito e a riposo. I pagamenti vengono elaborati da fornitori terzi e PNPtv! non archivia i dettagli completi delle carte.",
    privacyP4:
      "Hai il diritto di richiedere l'eliminazione del tuo account e di tutti i dati associati in qualsiasi momento da Impostazioni → Zona pericolo. Elaboreremo le richieste di eliminazione entro 30 giorni.",
    privacyFullLink: "Apri l'Informativa sulla privacy completa",

    rulesTitle: "Regole della comunità",
    rulesSubtitle: "Queste regole mantengono tutti al sicuro. Leggile e impegnati a rispettarle.",
    rulesItems: [
      "I contenuti che coinvolgono minori in qualsiasi contesto sono severamente vietati e verranno segnalati immediatamente alle autorità.",
      "I contenuti non consensuali o qualsiasi forma di coercizione sono vietati. Ottieni sempre un consenso esplicito.",
      "Nessuna molestia, minaccia, doxxing o discorso d'odio di alcun tipo.",
      "Nessuna vendita illegale di droghe, traffico o sollecitazione di sostanze.",
      "Nessuno spam, truffa, phishing o impersonificazione.",
      "Non condividere mai contenuti privati senza il consenso scritto esplicito del proprietario.",
      "Nessuna vendita, richiesta o indicazione di fonti per sostanze. Le discussioni sulla riduzione del danno sono benvenute; l'attività di mercato no.",
      "I performer devono dichiarare se vengono usati oggetti di scena o sostanze reali in camera quando richiesto da un altro membro.",
    ] as const,
    rulesCheckLabel:
      "Seguirò queste regole. Comprendo che le violazioni comportano la chiusura immediata e la segnalazione alle autorità ove richiesto dalla legge.",

    valuesTitle: "I nostri valori",
    valuesSubtitle: "PNPtv! è stato costruito su questi principi. Guidano ogni funzione che sviluppiamo.",
    valuesItems: [
      "Costruito e guidato da queer — questo spazio esiste perché lo abbiamo costruito per noi stessi.",
      "Riduzione del danno, non solo astinenza — forniamo informazioni e supporto senza giudizio.",
      "L'autonomia corporea è sacra — le tue scelte sul tuo corpo appartengono solo a te.",
      "Anti-repressione, anti-vergogna — non collaboriamo con le forze dell'ordine oltre gli obblighi di legge, e non vergogniamo mai i nostri membri.",
      "La privacy prima di tutto — i tuoi dati, la tua identità e le tue attività sono protetti by design.",
    ] as const,

    cryptoTitle: "Il tuo portafoglio digitale",
    cryptoSubtitle: "PNPtv! include un portafoglio integrato — pensalo come un conto prepagato. Nessuna banca, nessuna carta di credito.",
    cryptoFinishBtn: "Continua →",
    cryptoFinishLoading: "Configurazione del tuo account in corso…",
  },

  ru: {
    pageTitle: "Добро пожаловать на PNPtv! — Начать",

    stepOf: "Шаг {current} из {total}",

    continueBtn: "Продолжить",
    backBtn: "Назад",
    agreeBtn: "Принимаю",

    tiersTitle: "Частное квир-сообщество для взрослых PNP",
    tiersBody:
      "Freemium-платформа — кредитная карта не требуется. Присоединяйтесь бесплатно и исследуйте в своём темпе.",

    ageTitle: "Подтверждение возраста",
    ageSubtitle: "Эта платформа содержит материалы для взрослых, предназначенные только для верифицированных участников. Пожалуйста, подтвердите дату рождения, чтобы продолжить.",
    ageSelectYear: "Год",
    ageSelectMonth: "Месяц",
    ageSelectDay: "День",
    ageCheckLabel: "Я подтверждаю, что достиг(ла) необходимого возраста и имею право доступа к этой платформе.",
    ageErrorUnderage: "Вы не соответствуете возрастным требованиям этой платформы.",
    ageErrorInvalidDate: "Пожалуйста, выберите корректную дату рождения.",
    ageErrorServer: "Возраст не удалось подтвердить. Пожалуйста, попробуйте снова.",

    termsTitle: "Условия использования",
    termsSubtitle: "Пожалуйста, прочитайте и примите наши Условия использования, чтобы продолжить.",
    termsScrollHint: "Прокрутите вниз, чтобы активировать кнопку.",
    termsExcerptHeading: "PNPtv! Условия использования — Краткое изложение",
    termsP1:
      "Получая доступ к PNPtv!, вы соглашаетесь использовать платформу в соответствии со всеми применимыми законами. Вы должны соответствовать возрастным требованиям для регистрации и использования любой функции сервиса.",
    termsP2:
      "PNPtv! размещает материалы для взрослых, созданные верифицированными участниками и авторами. Все материалы с изображением реальных людей требуют задокументированного согласия. Мы работаем в соответствии с требованиями 18 U.S.C. §2257 и полностью сотрудничаем с правоохранительными органами.",
    termsP3:
      "Вы не можете загружать, распространять или делиться незаконными материалами, изображающими несовершеннолетних или нарушающими конфиденциальность других лиц без их согласия. Нарушения влекут немедленное удаление аккаунта и могут быть переданы в правоохранительные органы.",
    termsP4:
      "PNPtv! оставляет за собой право приостанавливать или прекращать действие аккаунтов в любое время за нарушения этих условий. Платежи не возвращаются, если иное не предусмотрено законом. Подписки продлеваются автоматически, если они не отменены.",
    termsFullLink: "Открыть полные Условия использования",

    privacyTitle: "Политика конфиденциальности",
    privacySubtitle: "Пожалуйста, прочитайте нашу Политику конфиденциальности перед продолжением.",
    privacyExcerptHeading: "PNPtv! Политика конфиденциальности — Краткое изложение",
    privacyP1:
      "PNPtv! собирает только информацию, необходимую для работы платформы: ваш Telegram ID или email, имя пользователя и данные об использовании. Мы никогда не продаём ваши данные третьим лицам.",
    privacyP2:
      "Данные о местоположении используются только тогда, когда вы включаете функцию поиска пользователей рядом, и никогда не хранятся долгосрочно. Вы можете отключить её в любое время в настройках профиля.",
    privacyP3:
      "Мы используем шифрование отраслевого стандарта для данных в процессе передачи и хранения. Платежи обрабатываются сторонними провайдерами, и PNPtv! не хранит полные данные платёжных карт.",
    privacyP4:
      "Вы имеете право запросить удаление своего аккаунта и всех связанных данных в любое время в разделе Настройки → Зона опасности. Мы обработаем запросы на удаление в течение 30 дней.",
    privacyFullLink: "Открыть полную Политику конфиденциальности",

    rulesTitle: "Правила сообщества",
    rulesSubtitle: "Эти правила обеспечивают безопасность для всех. Пожалуйста, прочитайте их и обязуйтесь их соблюдать.",
    rulesItems: [
      "Любой контент с участием несовершеннолетних строго запрещён и будет немедленно передан властям.",
      "Контент без согласия или любая форма принуждения запрещены. Всегда получай явное согласие.",
      "Никаких преследований, угроз, доксинга или языка ненависти.",
      "Никаких незаконных продаж наркотиков, трафика или запросов о получении веществ.",
      "Никакого спама, мошенничества, фишинга или самозванства.",
      "Никогда не распространяй личный контент без явного письменного согласия владельца.",
      "Запрещены продажа, запросы или указание источников веществ. Обсуждения снижения вреда приветствуются; торговля — нет.",
      "Исполнители должны по запросу другого участника раскрывать, используются ли реквизиты или реальные вещества во время съёмки.",
    ] as const,
    rulesCheckLabel:
      "Я буду соблюдать эти правила. Я понимаю, что нарушения влекут немедленное удаление аккаунта и сообщение в органы власти, где это требуется по закону.",

    valuesTitle: "Наши ценности",
    valuesSubtitle: "PNPtv! был построен на этих принципах. Они направляют каждую функцию, которую мы разрабатываем.",
    valuesItems: [
      "Создано и руководится квирами — это пространство существует, потому что мы построили его для себя.",
      "Снижение вреда, а не только воздержание — мы предоставляем информацию и поддержку без осуждения.",
      "Телесная автономия священна — твои решения о своём теле принадлежат только тебе.",
      "Против репрессий и стыда — мы не сотрудничаем с правоохранительными органами сверх правовых обязательств и никогда не стыдим наших участников.",
      "Конфиденциальность прежде всего — твои данные, личность и активность защищены по умолчанию.",
    ] as const,

    cryptoTitle: "Ваш цифровой кошелёк",
    cryptoSubtitle: "PNPtv! включает встроенный кошелёк — думайте о нём как о предоплаченном счёте. Без банка, без кредитной карты.",
    cryptoFinishBtn: "Продолжить →",
    cryptoFinishLoading: "Настройка вашего аккаунта…",
  },

  zh: {
    pageTitle: "欢迎来到 PNPtv! — 开始",

    stepOf: "第 {current} 步，共 {total} 步",

    continueBtn: "继续",
    backBtn: "返回",
    agreeBtn: "我同意",

    tiersTitle: "私密酷儿 PNP 成人数字社区",
    tiersBody:
      "免费增值平台——无需信用卡。免费加入，按自己的节奏探索。",

    ageTitle: "年龄验证",
    ageSubtitle: "本平台包含仅供已验证会员访问的成人内容。请确认您的出生日期以继续。",
    ageSelectYear: "年",
    ageSelectMonth: "月",
    ageSelectDay: "日",
    ageCheckLabel: "我确认我已达到要求的年龄，有资格访问本平台。",
    ageErrorUnderage: "您不满足本平台的年龄要求。",
    ageErrorInvalidDate: "请选择有效的出生日期。",
    ageErrorServer: "无法验证年龄。请重试。",

    termsTitle: "服务条款",
    termsSubtitle: "请阅读并同意我们的服务条款以继续。",
    termsScrollHint: "滚动到底部以启用按钮。",
    termsExcerptHeading: "PNPtv! 服务条款——摘要",
    termsP1:
      "访问 PNPtv! 即表示您同意依照所有适用法律使用本平台。您必须满足会员年龄要求才能注册和使用本服务的任何功能。",
    termsP2:
      "PNPtv! 托管由经验证的会员和创作者创建的成人内容。所有涉及真实人物的内容均需有记录的同意书。我们依照美国法典第18编第2257条的记录保存要求运营，并全力配合执法机构的请求。",
    termsP3:
      "您不得上传、分享或传播非法内容、涉及未成年人的内容或未经他人同意侵犯其隐私的内容。违规将导致立即封号，并可能向执法机构举报。",
    termsP4:
      "PNPtv! 保留随时因违反这些条款而暂停或终止账户的权利。除法律要求外，付款不予退款。订阅将自动续订，除非取消。",
    termsFullLink: "打开完整服务条款",

    privacyTitle: "隐私政策",
    privacySubtitle: "继续之前，请阅读我们的隐私政策。",
    privacyExcerptHeading: "PNPtv! 隐私政策——摘要",
    privacyP1:
      "PNPtv! 仅收集运营平台所需的信息：您的 Telegram ID 或电子邮件、用户名和使用数据。我们绝不将您的数据出售给第三方。",
    privacyP2:
      "位置数据仅在您选择启用附近用户功能时使用，且从不进行长期存储。您可随时在个人资料设置中将其禁用。",
    privacyP3:
      "我们对传输中和静态数据使用行业标准加密。付款由第三方服务商处理，PNPtv! 不存储完整的支付卡详细信息。",
    privacyP4:
      "您有权随时在设置 → 危险区域申请删除账户及所有相关数据。我们将在 30 天内处理删除请求。",
    privacyFullLink: "打开完整隐私政策",

    rulesTitle: "社区规则",
    rulesSubtitle: "这些规则让所有人都保持安全。请阅读并承诺遵守。",
    rulesItems: [
      "任何涉及未成年人的内容在任何情况下均被严格禁止，并将立即向当局举报。",
      "禁止未经同意的内容或任何形式的胁迫行为。始终获得明确同意。",
      "禁止任何形式的骚扰、威胁、人肉搜索或仇恨言论。",
      "禁止非法销售毒品、贩运或招揽任何物质。",
      "禁止垃圾信息、诈骗、网络钓鱼或冒充他人。",
      "未经所有者明确书面同意，不得分享私人内容。",
      "禁止出售、询问或透露物质来源。欢迎减少伤害的讨论，不允许任何市场交易活动。",
      "当其他成员询问时，表演者必须披露是使用道具还是在摄像机前使用真实物质。",
    ] as const,
    rulesCheckLabel:
      "我将遵守这些规则。我了解违规将导致立即封号，并在法律要求时向相关机构举报。",

    valuesTitle: "我们的价值观",
    valuesSubtitle: "PNPtv! 建立在这些原则之上。它们指导着我们开发的每一项功能。",
    valuesItems: [
      "由酷儿构建，由酷儿领导——这个空间之所以存在，是因为我们为自己建造了它。",
      "减少伤害，而不仅仅是戒断——我们在不做评判的情况下提供信息和支持。",
      "身体自主权是神圣的——关于你身体的选择只属于你自己。",
      "反权力，反羞耻——除法律义务外，我们不与执法机构合作，也绝不让成员感到羞耻。",
      "隐私优先——你的数据、身份和活动受到设计层面的保护。",
    ] as const,

    cryptoTitle: "您的数字钱包",
    cryptoSubtitle: "PNPtv! 内置数字钱包——可将其视为预付账户。无需银行卡，无需信用卡。",
    cryptoFinishBtn: "继续 →",
    cryptoFinishLoading: "正在设置您的账户…",
  },

  ja: {
    pageTitle: "PNPtv! へようこそ — はじめる",

    stepOf: "{total} 中 {current} ステップ",

    continueBtn: "続ける",
    backBtn: "戻る",
    agreeBtn: "同意する",

    tiersTitle: "プライベートなクィア PNP アダルトデジタルコミュニティ",
    tiersBody:
      "フリーミアムプラットフォーム — クレジットカード不要。無料で参加して、自分のペースで探索しましょう。",

    ageTitle: "年齢確認",
    ageSubtitle: "このプラットフォームには、認証済みメンバー専用のアダルトコンテンツが含まれています。続行するには生年月日を確認してください。",
    ageSelectYear: "年",
    ageSelectMonth: "月",
    ageSelectDay: "日",
    ageCheckLabel: "私は必要な年齢に達しており、このプラットフォームにアクセスする資格があることを確認します。",
    ageErrorUnderage: "このプラットフォームの年齢要件を満たしていません。",
    ageErrorInvalidDate: "有効な生年月日を選択してください。",
    ageErrorServer: "年齢を確認できませんでした。もう一度お試しください。",

    termsTitle: "利用規約",
    termsSubtitle: "続行するには利用規約をお読みの上、同意してください。",
    termsScrollHint: "ボタンを有効にするには一番下までスクロールしてください。",
    termsExcerptHeading: "PNPtv! 利用規約 — 概要",
    termsP1:
      "PNPtv! にアクセスすることで、適用されるすべての法律に従ってプラットフォームを使用することに同意します。登録してこのサービスの機能を使用するには、会員の年齢要件を満たしている必要があります。",
    termsP2:
      "PNPtv! は、認証済みのメンバーとクリエイターが作成したアダルトコンテンツをホストしています。実在の人物が映るコンテンツはすべて、文書化された同意が必要です。私たちは 18 U.S.C. §2257 の記録保管要件に基づいて運営し、法執行機関の要請に全面的に協力しています。",
    termsP3:
      "違法なコンテンツ、未成年者が映るコンテンツ、または同意なしに他者のプライバシーを侵害するコンテンツをアップロード、共有、または配布することはできません。違反はアカウントの即時停止につながり、当局に報告される場合があります。",
    termsP4:
      "PNPtv! は、これらの規約への違反に対して、いつでもアカウントを停止または削除する権利を留保します。支払いは法律で要求される場合を除き、返金されません。サブスクリプションはキャンセルされない限り自動的に更新されます。",
    termsFullLink: "利用規約全文を開く",

    privacyTitle: "プライバシーポリシー",
    privacySubtitle: "続行する前にプライバシーポリシーをお読みください。",
    privacyExcerptHeading: "PNPtv! プライバシーポリシー — 概要",
    privacyP1:
      "PNPtv! はプラットフォームの運営に必要な情報のみを収集します：Telegram の ID またはメール、ユーザー名、使用データ。ユーザーのデータを第三者に販売することはありません。",
    privacyP2:
      "位置情報データは、近くのユーザー機能を有効にした場合にのみ使用され、長期間保存されることはありません。プロフィール設定からいつでも無効にできます。",
    privacyP3:
      "転送中および保存中のデータには業界標準の暗号化を使用しています。支払いはサードパーティプロバイダーによって処理され、PNPtv! は完全な支払いカードの詳細を保存しません。",
    privacyP4:
      "設定 → 危険ゾーンからいつでもアカウントとすべての関連データの削除を要求する権利があります。削除リクエストは 30 日以内に処理されます。",
    privacyFullLink: "プライバシーポリシー全文を開く",

    rulesTitle: "コミュニティルール",
    rulesSubtitle: "これらのルールで全員が安全を保てます。読んで、従うことを約束してください。",
    rulesItems: [
      "あらゆる文脈で未成年者が関わるコンテンツは厳しく禁止されており、直ちに当局に報告されます。",
      "同意のないコンテンツやあらゆる形態の強制は禁止されています。常に明示的な同意を得てください。",
      "いかなる形態のハラスメント、脅迫、ドクシング、ヘイトスピーチも禁止です。",
      "違法な薬物の販売、取引、あらゆる物質の勧誘は禁止です。",
      "スパム、詐欺、フィッシング、なりすましは禁止です。",
      "所有者の明示的な書面による同意なしに、プライベートコンテンツを共有しないでください。",
      "物質の販売、問い合わせ、入手先の案内は禁止です。ハームリダクションについての議論は歓迎されますが、市場取引活動は認められません。",
      "パフォーマーは、他のメンバーから求められた場合、カメラの前で小道具を使用しているのか実際の物質を使用しているのかを開示する必要があります。",
    ] as const,
    rulesCheckLabel:
      "これらのルールを守ります。違反はアカウントの即時停止につながり、法律で要求される場合は当局への報告につながることを理解しています。",

    valuesTitle: "私たちの価値観",
    valuesSubtitle: "PNPtv! はこれらの原則の上に構築されました。これらは私たちが開発するすべての機能を導くものです。",
    valuesItems: [
      "クィアによって作られ、クィアによって率いられている — このスペースは私たち自身のために私たちが作ったから存在します。",
      "禁欲だけでなくハームリダクション — 判断なしに情報とサポートを提供します。",
      "身体の自律性は神聖です — 自分の体についての選択はあなただけのものです。",
      "反権力、反恥 — 法的義務以上に法執行機関と協力せず、メンバーを恥じさせることはありません。",
      "プライバシー最優先 — あなたのデータ、アイデンティティ、活動は設計によって保護されています。",
    ] as const,

    cryptoTitle: "デジタルウォレット",
    cryptoSubtitle: "PNPtv! には内蔵ウォレットが含まれています — プリペイドアカウントとして考えてください。銀行もクレジットカードも不要です。",
    cryptoFinishBtn: "続ける →",
    cryptoFinishLoading: "アカウントを設定中…",
  },

  ar: {
    pageTitle: "مرحباً بك في PNPtv! — ابدأ",

    stepOf: "الخطوة {current} من {total}",

    continueBtn: "متابعة",
    backBtn: "رجوع",
    agreeBtn: "أوافق",

    tiersTitle: "مجتمع PNP الكويري الخاص للبالغين رقمياً",
    tiersBody:
      "منصة مجانية — لا تحتاج إلى بطاقة ائتمانية. انضم مجاناً واستكشف بالسرعة التي تناسبك.",

    ageTitle: "التحقق من العمر",
    ageSubtitle: "تحتوي هذه المنصة على محتوى للبالغين مخصص للأعضاء المتحققين فقط. يرجى تأكيد تاريخ ميلادك للمتابعة.",
    ageSelectYear: "السنة",
    ageSelectMonth: "الشهر",
    ageSelectDay: "اليوم",
    ageCheckLabel: "أؤكد أنني بلغت السن المطلوبة وأنني مؤهل للوصول إلى هذه المنصة.",
    ageErrorUnderage: "لا تستوفي متطلبات العمر لهذه المنصة.",
    ageErrorInvalidDate: "يرجى اختيار تاريخ ميلاد صحيح.",
    ageErrorServer: "تعذّر التحقق من العمر. يرجى المحاولة مجدداً.",

    termsTitle: "شروط الخدمة",
    termsSubtitle: "يرجى قراءة شروط الخدمة والموافقة عليها للمتابعة.",
    termsScrollHint: "مرر لأسفل حتى النهاية لتفعيل الزر.",
    termsExcerptHeading: "PNPtv! شروط الخدمة — ملخص",
    termsP1:
      "بالوصول إلى PNPtv! فإنك توافق على استخدام المنصة وفقاً لجميع القوانين المعمول بها. يجب أن تستوفي متطلبات العمر للأعضاء للتسجيل واستخدام أي ميزة من ميزات هذه الخدمة.",
    termsP2:
      "تستضيف PNPtv! محتوى للبالغين ينشئه أعضاء ومبدعون موثّقون. يتطلب أي محتوى يُصوّر أشخاصاً حقيقيين موافقة موثّقة. نعمل وفق متطلبات الاحتفاظ بالسجلات المنصوص عليها في القسم §2257 من القانون الأمريكي 18 U.S.C. ونتعاون بشكل كامل مع طلبات إنفاذ القانون.",
    termsP3:
      "لا يُسمح لك بتحميل أو مشاركة أو توزيع محتوى غير قانوني أو يُصوّر قاصرين أو ينتهك خصوصية الآخرين دون موافقتهم. تؤدي المخالفات إلى إغلاق الحساب فوراً وقد يتم الإبلاغ عنها للسلطات.",
    termsP4:
      "تحتفظ PNPtv! بالحق في تعليق الحسابات أو إنهائها في أي وقت بسبب انتهاك هذه الشروط. المدفوعات غير قابلة للاسترداد إلا حيث يقتضي القانون ذلك. تتجدد الاشتراكات تلقائياً ما لم يتم إلغاؤها.",
    termsFullLink: "فتح شروط الخدمة كاملة",

    privacyTitle: "سياسة الخصوصية",
    privacySubtitle: "يرجى قراءة سياسة الخصوصية قبل المتابعة.",
    privacyExcerptHeading: "PNPtv! سياسة الخصوصية — ملخص",
    privacyP1:
      "تجمع PNPtv! فقط المعلومات اللازمة لتشغيل المنصة: معرّف Telegram أو البريد الإلكتروني واسم المستخدم وبيانات الاستخدام. لا نبيع بياناتك أبداً لأطراف ثالثة.",
    privacyP2:
      "تُستخدم بيانات الموقع فقط عند اختيارك تفعيل ميزة المستخدمين القريبين ولا يتم تخزينها على المدى الطويل. يمكنك تعطيلها في أي وقت من إعدادات ملفك الشخصي.",
    privacyP3:
      "نستخدم تشفيراً بمستوى المعيار الصناعي للبيانات أثناء النقل وعند التخزين. تتم معالجة المدفوعات بواسطة مزودين طرف ثالث ولا تخزّن PNPtv! تفاصيل كاملة لبطاقات الدفع.",
    privacyP4:
      "يحق لك طلب حذف حسابك وجميع البيانات المرتبطة به في أي وقت من الإعدادات ← منطقة الخطر. سنعالج طلبات الحذف خلال 30 يوماً.",
    privacyFullLink: "فتح سياسة الخصوصية كاملة",

    rulesTitle: "قواعد المجتمع",
    rulesSubtitle: "هذه القواعد تحفظ الجميع آمنين. يرجى قراءتها والالتزام باتباعها.",
    rulesItems: [
      "أي محتوى يتضمن قاصرين في أي سياق محظور صراحةً وسيتم الإبلاغ عنه للسلطات فوراً.",
      "المحتوى غير المرضي عنه أو أي شكل من أشكال الإكراه محظور. احصل دائماً على موافقة صريحة.",
      "ممنوع التحرش والتهديدات والكشف عن المعلومات الخاصة وخطاب الكراهية بأي شكل.",
      "ممنوع بيع المخدرات غير القانوني والاتجار بها أو التماس أي مواد.",
      "ممنوع البريد المزعج والاحتيال والتصيد الاحتيالي وانتحال الهوية.",
      "لا تشارك أبداً محتوى خاصاً دون الحصول على موافقة كتابية صريحة من صاحبه.",
      "ممنوع بيع المواد أو السؤال عنها أو الإفصاح عن مصادرها. نقاشات الحد من الضرر مرحب بها؛ النشاط التجاري لها غير مسموح.",
      "يجب على فناني الأداء الإفصاح عما إذا كانوا يستخدمون دعائم أو مواد حقيقية أمام الكاميرا عند سؤالهم من قِبل عضو آخر.",
    ] as const,
    rulesCheckLabel:
      "سألتزم بهذه القواعد. أفهم أن المخالفات تؤدي إلى الإغلاق الفوري والإبلاغ عنها للسلطات حيثما يقتضي القانون.",

    valuesTitle: "قيمنا",
    valuesSubtitle: "بُنيت PNPtv! على هذه المبادئ. وهي توجّه كل ميزة نطوّرها.",
    valuesItems: [
      "مبني ومُدار من قِبل الكويريين — هذا الفضاء موجود لأننا بنيناه لأنفسنا.",
      "تقليل الضرر لا الامتناع الكلي — نقدم المعلومات والدعم دون إصدار أحكام.",
      "استقلالية الجسد مقدسة — قراراتك بشأن جسدك تخصك وحدك.",
      "ضد القمع وضد الخزي — لا نتعاون مع الجهات الأمنية تجاوزاً للالتزامات القانونية، ولا نشعر أعضاءنا بالخزي أبداً.",
      "الخصوصية أولاً — بياناتك وهويتك ونشاطك محمية بالتصميم.",
    ] as const,

    cryptoTitle: "محفظتك الرقمية",
    cryptoSubtitle: "تتضمن PNPtv! محفظة مدمجة — فكّر فيها كحساب مدفوع مسبقاً. لا حاجة لبنك أو بطاقة ائتمانية.",
    cryptoFinishBtn: "متابعة →",
    cryptoFinishLoading: "جارٍ إعداد حسابك…",
  },

  ko: {
    pageTitle: "PNPtv! 에 오신 것을 환영합니다 — 시작하기",

    stepOf: "{total}단계 중 {current}단계",

    continueBtn: "계속",
    backBtn: "뒤로",
    agreeBtn: "동의합니다",

    tiersTitle: "개인 퀴어 PNP 성인 디지털 커뮤니티",
    tiersBody:
      "프리미엄 플랫폼 — 신용카드 불필요. 무료로 가입하여 자신의 속도로 탐색하세요.",

    ageTitle: "나이 확인",
    ageSubtitle: "이 플랫폼에는 인증된 회원만을 위한 성인 콘텐츠가 포함되어 있습니다. 계속하려면 생년월일을 확인하세요.",
    ageSelectYear: "년",
    ageSelectMonth: "월",
    ageSelectDay: "일",
    ageCheckLabel: "저는 필요한 연령에 달했으며 이 플랫폼에 접근할 자격이 있음을 확인합니다.",
    ageErrorUnderage: "이 플랫폼의 연령 요건을 충족하지 못합니다.",
    ageErrorInvalidDate: "유효한 생년월일을 선택해 주세요.",
    ageErrorServer: "나이를 확인할 수 없습니다. 다시 시도해 주세요.",

    termsTitle: "이용약관",
    termsSubtitle: "계속하려면 이용약관을 읽고 동의해 주세요.",
    termsScrollHint: "버튼을 활성화하려면 맨 아래로 스크롤하세요.",
    termsExcerptHeading: "PNPtv! 이용약관 — 요약",
    termsP1:
      "PNPtv!에 접근함으로써 귀하는 모든 관련 법률에 따라 플랫폼을 사용할 것에 동의합니다. 이 서비스에 등록하고 모든 기능을 사용하려면 회원 연령 요건을 충족해야 합니다.",
    termsP2:
      "PNPtv!는 인증된 회원 및 크리에이터가 제작한 성인 콘텐츠를 호스팅합니다. 실제 인물이 등장하는 모든 콘텐츠는 문서화된 동의가 필요합니다. 당사는 18 U.S.C. §2257 기록 보관 요건에 따라 운영하며 법 집행 기관의 요청에 전적으로 협조합니다.",
    termsP3:
      "불법 콘텐츠, 미성년자가 등장하는 콘텐츠 또는 동의 없이 타인의 개인 정보를 침해하는 콘텐츠를 업로드, 공유 또는 배포할 수 없습니다. 위반 시 계정이 즉시 정지되며 당국에 신고될 수 있습니다.",
    termsP4:
      "PNPtv!는 이 약관 위반으로 인해 언제든지 계정을 정지하거나 종료할 권리를 보유합니다. 법률에서 요구하는 경우를 제외하고 결제는 환불되지 않습니다. 구독은 취소하지 않는 한 자동으로 갱신됩니다.",
    termsFullLink: "전체 이용약관 열기",

    privacyTitle: "개인정보 보호정책",
    privacySubtitle: "계속하기 전에 개인정보 보호정책을 읽어 주세요.",
    privacyExcerptHeading: "PNPtv! 개인정보 보호정책 — 요약",
    privacyP1:
      "PNPtv!는 플랫폼 운영에 필요한 정보만 수집합니다: Telegram ID 또는 이메일, 사용자 이름, 사용 데이터. 귀하의 데이터를 제3자에게 절대 판매하지 않습니다.",
    privacyP2:
      "위치 데이터는 귀하가 근처 사용자 기능을 사용하도록 선택한 경우에만 사용되며 장기간 저장되지 않습니다. 언제든지 프로필 설정에서 비활성화할 수 있습니다.",
    privacyP3:
      "전송 중 및 저장 시 데이터에 업계 표준 암호화를 사용합니다. 결제는 제3자 제공업체가 처리하며 PNPtv!는 전체 결제 카드 세부 정보를 저장하지 않습니다.",
    privacyP4:
      "설정 → 위험 구역에서 언제든지 계정 및 관련된 모든 데이터의 삭제를 요청할 수 있습니다. 삭제 요청은 30일 이내에 처리됩니다.",
    privacyFullLink: "전체 개인정보 보호정책 열기",

    rulesTitle: "커뮤니티 규칙",
    rulesSubtitle: "이 규칙들이 모든 사람을 안전하게 지킵니다. 읽고 따를 것을 약속해 주세요.",
    rulesItems: [
      "어떤 상황에서도 미성년자가 포함된 콘텐츠는 엄격히 금지되며 즉시 당국에 신고됩니다.",
      "동의 없는 콘텐츠 또는 어떤 형태의 강압도 금지됩니다. 항상 명시적 동의를 받으세요.",
      "어떤 종류의 괴롭힘, 위협, 신상 털기, 혐오 발언도 금지입니다.",
      "불법 마약 판매, 거래 또는 어떤 물질의 유도도 금지됩니다.",
      "스팸, 사기, 피싱 또는 사칭은 금지됩니다.",
      "소유자의 명시적 서면 동의 없이 개인 콘텐츠를 공유하지 마세요.",
      "물질의 판매, 문의 또는 출처 안내는 금지됩니다. 해악 감소 토론은 환영받지만 시장 활동은 허용되지 않습니다.",
      "다른 회원이 물어볼 경우 공연자는 카메라 앞에서 소품을 사용하는지 실제 물질을 사용하는지 공개해야 합니다.",
    ] as const,
    rulesCheckLabel:
      "저는 이 규칙을 따를 것입니다. 위반 시 즉각적인 계정 정지 및 법적으로 요구되는 경우 당국에 신고됨을 이해합니다.",

    valuesTitle: "우리의 가치관",
    valuesSubtitle: "PNPtv!는 이러한 원칙을 바탕으로 만들어졌습니다. 이 원칙들은 우리가 개발하는 모든 기능을 안내합니다.",
    valuesItems: [
      "퀴어가 만들고 퀴어가 이끄는 — 이 공간은 우리가 우리 자신을 위해 만들었기 때문에 존재합니다.",
      "금욕이 아닌 해악 감소 — 우리는 판단 없이 정보와 지원을 제공합니다.",
      "신체 자율성은 신성합니다 — 내 몸에 대한 선택은 오직 나만의 것입니다.",
      "반권력, 반수치심 — 우리는 법적 의무 이상으로 법 집행 기관과 협력하지 않으며 회원들을 절대 수치스럽게 만들지 않습니다.",
      "프라이버시 우선 — 귀하의 데이터, 신원 및 활동은 설계에 의해 보호됩니다.",
    ] as const,

    cryptoTitle: "나의 디지털 지갑",
    cryptoSubtitle: "PNPtv!에는 내장 지갑이 포함되어 있습니다 — 선불 계좌로 생각하세요. 은행 계좌나 신용카드가 필요 없습니다.",
    cryptoFinishBtn: "계속 →",
    cryptoFinishLoading: "계정 설정 중…",
  },
} as const;

export type OnboardingStrings = typeof strings.en;
export { strings as onboarding };
