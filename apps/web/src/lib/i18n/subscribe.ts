const strings = {
  en: {
    // ── Page head ─────────────────────────────────────────────────────────────
    pageTitle: "Subscribe — PNPtv!",
    pageDescription: "Choose your PNPtv plan. Unlock exclusive content, PRIME video access, nearby discovery, and more.",

    // ── Header ────────────────────────────────────────────────────────────────
    chooseYourPlan: "Choose Your Plan",
    subtitle: "Unlock exclusive content and features with PNPTV PRIME",

    // ── Current tier status banner ────────────────────────────────────────────
    currentTierFree: "You're on the free tier",
    currentTierMember: "You're a PNP Member",
    currentTierPrime: "You have PRIME access",
    upgradeCta: "Upgrade to unlock more features",
    extendCta: "Extend or upgrade your plan below",

    // ── Currency toggle ───────────────────────────────────────────────────────
    showPricesInUSD: "Show prices in USD",
    showPricesInCOP: "Show prices in COP",

    // ── Plan tier section labels ──────────────────────────────────────────────
    communityMember: "Community Member",
    communityMemberDesc: "Social features, PNP Live & Radio, Hangouts, Nearby — PRIME channel, exclusive creator profiles, Ru$h for shows & private calls cost extra",
    prime: "PRIME",
    primeDesc: "All Basic features + PNPtv! PRIME channel — exclusive creator profiles, Ru$h for shows & private calls cost extra",

    // ── Plan duration labels ──────────────────────────────────────────────────
    lifetime: "Lifetime",
    monthly: "Monthly",
    perMonth: "/mo",
    oneTimePayment: "One-time · no auto-renewal",

    // ── Plan badge ────────────────────────────────────────────────────────────
    bestValue: "Best Value",
    launchRate: "✦ Intro",

    // ── Entitlement-driven features ───────────────────────────────────────────
    everythingInMemberPlus: "Everything in Member, plus:",
    showBenefits: "Show benefits",
    hideBenefits: "Hide benefits",
    platformAccess: "Platform access",
    primeAccess: "Full PRIME access",
    includesAddOns: "Includes:",
    addonMember: "Member",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Private Call",

    // ── Email section ─────────────────────────────────────────────────────────
    emailAddress: "Email address",
    emailDesc: "We'll send your login credentials and membership info",
    emailPlaceholder: "you@example.com",
    invalidEmail: "Please enter a valid email address",

    // ── Payment methods ───────────────────────────────────────────────────────
    paymentMethod: "Payment Method",
    cardPse: "Card / Bank Transfer",
    cardPseDesc: "Credit, Debit",
    usdc: "Pay",
    // Dash and Lightning i18n strings removed 2026-07-31 (BTCPay/Dash/Lightning retired)

    // ── USDC / USDT stablecoin (NOWPayments) ─────────────────────────────────
    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · No price swings",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — fixed USD value, no crypto volatility. Works with Base, Solana, Polygon, TRON, ETH, and 20+ other networks. Pay directly from Coinbase, MetaMask, or any crypto wallet.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please contact support.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31 (Dash/BTCPay retired)
    cancel: "Cancel",

    // ── Promo / Meru code section ─────────────────────────────────────────────
    or: "or",
    wantBestDeal: "Want the best deal?",
    lifetime100Desc: "Founders' lifetime access — a single $100 payment helps us finish building PNPtv while giving you early access forever. Some features are still in development.",
    checkoutLifetime100: "Check out the Lifetime Prime deal",
    lifetime100NoticeTitle: "Before you pay — please read",
    lifetime100NoticeFundraising: "Special fundraising price: your one-time $100 goes directly toward finishing the app.",
    lifetime100NoticeEarlyAccess: "You get early access to PNPtv and every feature we launch, forever.",
    lifetime100NoticeInProgress: "Some features are still being built. You may find rough edges or work-in-progress screens.",
    haveMeruCode: "Have a Meru code?",
    meruCodePlaceholder: "Enter your Meru code",
    activate: "Activate",
    verifying: "Verifying...",
    verifyingPayment: "Verifying payment... this may take a few seconds",
    activationFailed: "Activation failed",
    activationError: "Activation error",
    pleaseEnterValidEmailAbove: "Please enter a valid email address above",

    // ── Promo code (discount) ────────────────────────────────────────────────
    promoHaveCode: "Have a discount code?",
    promoCodePlaceholder: "Enter your code",
    promoApply: "Apply",
    promoApplied: "Discount applied",
    promoRemove: "Remove",
    promoInvalid: "This code isn't valid or has expired.",

    // ── Payment polling ───────────────────────────────────────────────────────
    waitingForPayment: "Processing your payment...",
    completePaymentInWindow: "Complete the payment on the checkout page. This page will update automatically.",

    // ── Subscribe button ──────────────────────────────────────────────────────
    subscribeNow: "Subscribe Now",
    processingPayment: "Processing...",
    goBack: "Go Back",

    // ── Success screen ────────────────────────────────────────────────────────
    paymentConfirmed: "Payment Confirmed!",
    subscriptionNowActive: "Your subscription is now active. Check your email for your invoice and onboarding guide.",
    goToPNPtv: "Go to PNPtv!",

    // ── Error states ──────────────────────────────────────────────────────────
    noPlansAvailable: "No plans available",
    failedToLoadPlans: "Failed to load plans",
    retry: "Retry",
    paymentTimedOut: "Payment verification timed out. If you completed the payment, your subscription will activate automatically within minutes.",
    paymentNotSuccessful: "Payment was not successful. Please try again.",
    // Dash error strings removed 2026-07-31 (Dash/BTCPay retired)
    failedToCreatePayment: "Failed to create payment",
    paymentErrorGeneric: "Payment error",
  },

  es: {
    pageTitle: "Suscribirse — PNPtv!",
    pageDescription: "Elige tu plan de PNPtv. Desbloquea contenido exclusivo, acceso a PRIME, descubrimiento cercano y mucho más.",

    chooseYourPlan: "Elige tu plan",
    subtitle: "Desbloquea contenido exclusivo y funciones con PNPTV PRIME",

    currentTierFree: "Estás en el plan gratuito",
    currentTierMember: "Eres Miembro PNP",
    currentTierPrime: "Tienes acceso PRIME",
    upgradeCta: "Mejora tu plan para desbloquear más funciones",
    extendCta: "Extiende o mejora tu plan abajo",

    showPricesInUSD: "Ver precios en USD",
    showPricesInCOP: "Ver precios en COP",

    communityMember: "Miembro de comunidad",
    communityMemberDesc: "Funciones sociales, PNP Live & Radio, Hangouts, Nearby — canal PRIME, perfiles exclusivos de creadores, Ru$h en shows y llamadas privadas tienen costo adicional",
    prime: "PRIME",
    primeDesc: "Todo lo de Basic + canal PNPtv! PRIME — perfiles exclusivos de creadores, Ru$h en shows y llamadas privadas tienen costo adicional",

    lifetime: "De por vida",
    monthly: "Mensual",
    perMonth: "/mes",
    oneTimePayment: "Pago único · sin renovación automática",

    bestValue: "Mejor precio",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Todo lo del plan Miembro, más:",
    showBenefits: "Ver beneficios",
    hideBenefits: "Ocultar beneficios",
    platformAccess: "Acceso a la plataforma",
    primeAccess: "Acceso PRIME completo",
    includesAddOns: "Incluye:",
    addonMember: "Miembro",
    addonPrime: "PRIME",
    addonCreator: "Creador",
    addonPrivateCalls: "Llamada privada",

    emailAddress: "Correo electrónico",
    emailDesc: "Te enviaremos tus credenciales de acceso e información de membresía",
    emailPlaceholder: "tu@ejemplo.com",
    invalidEmail: "Por favor ingresa un correo electrónico válido",

    paymentMethod: "Método de pago",
    cardPse: "Tarjeta / Transferencia Bancaria",
    cardPseDesc: "Crédito, Débito",
    usdc: "Pagar",
    // Dash y Lightning strings eliminados 2026-07-31 (BTCPay/Dash/Lightning retirados)

    // ── USDC / USDT stablecoin (NOWPayments) ─────────────────────────────────
    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ redes · Sin volatilidad",
    usdcComingSoon: "Próximamente",
    usdcBadge: "ESTABLE",
    usdcInfoText: "Paga con USDC o USDT — valor fijo en USD, sin volatilidad. Compatible con Base, Solana, Polygon, TRON, ETH y más de 20 redes. Paga desde Coinbase, MetaMask o cualquier billetera crypto.",
    usdcRedirecting: "Abriendo pago seguro...",
    usdcWaitingTitle: "Esperando pago USDC",
    usdcWaitingDesc: "Completa tu pago abajo. La página se actualiza automáticamente cuando se confirme.",
    usdcPaymentConfirmed: "¡Pago confirmado!",
    usdcExpired: "Pago no completado. Intenta de nuevo o contacta soporte si ya enviaste fondos.",
    failedToCreateUsdcInvoice: "Error al crear la factura USDC",
    usdcNotConfigured: "Los pagos USDC no están disponibles aún. Por favor usa Tarjeta.",
    usdcOpenCheckout: "Abrir página de pago",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Cancelar",

    or: "o",
    wantBestDeal: "¿Quieres la mejor oferta?",
    lifetime100Desc: "Acceso de por vida para fundadores — un solo pago de $100 nos ayuda a terminar de construir PNPtv mientras obtienes acceso anticipado para siempre. Algunas funciones aún están en desarrollo.",
    checkoutLifetime100: "Ver la oferta Lifetime Prime",
    lifetime100NoticeTitle: "Antes de pagar — por favor lee",
    lifetime100NoticeFundraising: "Precio especial de recaudación: tu pago único de $100 se destina directamente a terminar la app.",
    lifetime100NoticeEarlyAccess: "Obtienes acceso anticipado a PNPtv y a cada función que lancemos, para siempre.",
    lifetime100NoticeInProgress: "Algunas funciones aún se están construyendo. Podrías encontrar detalles sin pulir o pantallas en desarrollo.",
    haveMeruCode: "¿Tienes un código Meru?",
    meruCodePlaceholder: "Ingresa tu código Meru",
    activate: "Activar",
    verifying: "Verificando...",
    verifyingPayment: "Verificando pago... esto puede tardar unos segundos",
    activationFailed: "Error en la activación",
    activationError: "Error al activar",
    pleaseEnterValidEmailAbove: "Por favor ingresa un correo electrónico válido arriba",

    promoHaveCode: "¿Tienes un código de descuento?",
    promoCodePlaceholder: "Ingresa tu código",
    promoApply: "Aplicar",
    promoApplied: "Descuento aplicado",
    promoRemove: "Quitar",
    promoInvalid: "Este código no es válido o ha expirado.",

    waitingForPayment: "Procesando tu pago...",
    completePaymentInWindow: "Completa el pago en la página de pago. Esta página se actualizará automáticamente.",

    subscribeNow: "Suscribirme ahora",
    processingPayment: "Procesando...",
    goBack: "Volver",

    paymentConfirmed: "¡Pago confirmado!",
    subscriptionNowActive: "Tu suscripción ya está activa. Revisa tu correo para tu factura y guía de bienvenida.",
    goToPNPtv: "Ir a PNPtv!",

    noPlansAvailable: "No hay planes disponibles",
    failedToLoadPlans: "Error al cargar los planes",
    retry: "Reintentar",
    paymentTimedOut: "Se agotó el tiempo de verificación del pago. Si completaste el pago, tu suscripción se activará automáticamente en minutos.",
    paymentNotSuccessful: "El pago no fue exitoso. Por favor, inténtalo de nuevo.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Error al crear el pago",
    paymentErrorGeneric: "Error en el pago",
  },

  pt: {
    pageTitle: "Assinar — PNPtv!",
    pageDescription: "Escolha seu plano PNPtv. Desbloqueie conteúdo exclusivo, acesso PRIME a vídeos, descoberta por proximidade e muito mais.",

    chooseYourPlan: "Escolha Seu Plano",
    subtitle: "Desbloqueie conteúdo exclusivo e recursos com PNPTV PRIME",

    currentTierFree: "Você está no plano gratuito",
    currentTierMember: "Você é Membro PNP",
    currentTierPrime: "Você tem acesso PRIME",
    upgradeCta: "Atualize para desbloquear mais recursos",
    extendCta: "Estenda ou atualize seu plano abaixo",

    showPricesInUSD: "Ver preços em USD",
    showPricesInCOP: "Ver preços em COP",

    communityMember: "Membro da Comunidade",
    communityMemberDesc: "Recursos sociais, PNP Live & Radio, Hangouts, Nearby — canal PRIME, perfis exclusivos de criadores, Ru$h em shows e chamadas privadas têm custo adicional",
    prime: "PRIME",
    primeDesc: "Tudo do Basic + canal PNPtv! PRIME — perfis exclusivos de criadores, Ru$h em shows e chamadas privadas têm custo adicional",

    lifetime: "Vitalício",
    monthly: "Mensal",
    perMonth: "/mês",
    oneTimePayment: "Pagamento único · sem renovação automática",

    bestValue: "Melhor Custo-Benefício",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Tudo do plano Membro, mais:",
    showBenefits: "Ver benefícios",
    hideBenefits: "Ocultar benefícios",
    platformAccess: "Acesso à plataforma",
    primeAccess: "Acesso PRIME completo",
    includesAddOns: "Inclui:",
    addonMember: "Membro",
    addonPrime: "PRIME",
    addonCreator: "Criador",
    addonPrivateCalls: "Chamada privada",

    emailAddress: "Endereço de e-mail",
    emailDesc: "Enviaremos suas credenciais de acesso e informações de assinatura",
    emailPlaceholder: "voce@exemplo.com",
    invalidEmail: "Por favor, insira um endereço de e-mail válido",

    paymentMethod: "Método de Pagamento",
    cardPse: "Cartão / Transferência Bancária",
    cardPseDesc: "Crédito, Débito",
    usdc: "Pagar",
    // Dash and Lightning info strings removed 2026-07-31

    // ── USDC / USDT stablecoin (NOWPayments) ─────────────────────────────────
    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Em breve",
    usdcBadge: "ESTÁVEL",
    usdcInfoText: "Pague com USDC ou USDT — valor estável, sem volatilidade, aceito em qualquer rede. Escolha sua rede preferida no checkout.",
    usdcRedirecting: "Abrindo checkout seguro...",
    usdcWaitingTitle: "Aguardando pagamento USDC",
    usdcWaitingDesc: "Conclua o pagamento na janela da NOWPayments. Esta página atualiza automaticamente quando confirmado.",
    usdcPaymentConfirmed: "Pagamento confirmado!",
    usdcExpired: "Pagamento não concluído. Tente novamente ou entre em contato com o suporte se você enviou fundos.",
    failedToCreateUsdcInvoice: "Falha ao criar fatura USDC",
    usdcNotConfigured: "Pagamentos USDC ainda não estão disponíveis. Por favor, use Cartão.",
    usdcOpenCheckout: "Abrir página de pagamento",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Cancelar",

    or: "ou",
    wantBestDeal: "Quer o melhor negócio?",
    lifetime100Desc: "Acesso vitalício para fundadores — um único pagamento de $100 nos ajuda a terminar de construir o PNPtv enquanto você tem acesso antecipado para sempre. Algumas funções ainda estão em desenvolvimento.",
    checkoutLifetime100: "Ver a oferta Lifetime Prime",
    lifetime100NoticeTitle: "Antes de pagar — por favor leia",
    lifetime100NoticeFundraising: "Preço especial de captação: seu pagamento único de $100 vai direto para terminar o app.",
    lifetime100NoticeEarlyAccess: "Você tem acesso antecipado ao PNPtv e a cada função que lançarmos, para sempre.",
    lifetime100NoticeInProgress: "Algumas funções ainda estão sendo construídas. Você pode encontrar detalhes não polidos ou telas em desenvolvimento.",
    haveMeruCode: "Tem um código Meru?",
    meruCodePlaceholder: "Digite seu código Meru",
    activate: "Ativar",
    verifying: "Verificando...",
    verifyingPayment: "Verificando pagamento... isso pode levar alguns segundos",
    activationFailed: "Falha na ativação",
    activationError: "Erro na ativação",
    pleaseEnterValidEmailAbove: "Por favor, insira um endereço de e-mail válido acima",

    promoHaveCode: "Tem um código de desconto?",
    promoCodePlaceholder: "Insira seu código",
    promoApply: "Aplicar",
    promoApplied: "Desconto aplicado",
    promoRemove: "Remover",
    promoInvalid: "Este código não é válido ou expirou.",

    waitingForPayment: "Processando seu pagamento...",
    completePaymentInWindow: "Complete o pagamento na página de checkout. Esta página será atualizada automaticamente.",

    subscribeNow: "Assinar Agora",
    processingPayment: "Processando...",
    goBack: "Voltar",

    paymentConfirmed: "Pagamento Confirmado!",
    subscriptionNowActive: "Sua assinatura está ativa. Verifique seu e-mail para a fatura e o guia de integração.",
    goToPNPtv: "Ir para PNPtv!",

    noPlansAvailable: "Nenhum plano disponível",
    failedToLoadPlans: "Falha ao carregar os planos",
    retry: "Tentar novamente",
    paymentTimedOut: "Tempo de verificação do pagamento esgotado. Se você completou o pagamento, sua assinatura será ativada automaticamente em minutos.",
    paymentNotSuccessful: "O pagamento não foi bem-sucedido. Por favor, tente novamente.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Falha ao criar pagamento",
    paymentErrorGeneric: "Erro no pagamento",
  },

  zh: {
    pageTitle: "订阅 — PNPtv!",
    pageDescription: "选择您的 PNPtv 方案。解锁独家内容、PRIME 视频访问、附近发现功能等。",

    chooseYourPlan: "选择您的方案",
    subtitle: "使用 PNPTV PRIME 解锁独家内容和功能",

    currentTierFree: "您目前使用免费版",
    currentTierMember: "您是 PNP 会员",
    currentTierPrime: "您拥有 PRIME 访问权限",
    upgradeCta: "升级以解锁更多功能",
    extendCta: "在下方延长或升级您的方案",

    showPricesInUSD: "以美元显示价格",
    showPricesInCOP: "以哥伦比亚比索显示价格",

    communityMember: "社区会员",
    communityMemberDesc: "社交功能、PNP Live & Radio、Hangouts、Nearby — PRIME频道、创作者独家资料、节目代币和私人通话需额外付费",
    prime: "PRIME",
    primeDesc: "所有Basic功能 + PNPtv! PRIME频道 — 创作者独家资料、节目代币和私人通话需额外付费",

    lifetime: "终身",
    monthly: "月付",
    perMonth: "/月",
    oneTimePayment: "一次性付款 · 不自动续费",

    bestValue: "最超值",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "包含会员所有功能，另外还有：",
    showBenefits: "查看权益",
    hideBenefits: "隐藏权益",
    platformAccess: "平台访问",
    primeAccess: "完整 PRIME 访问",
    includesAddOns: "包含：",
    addonMember: "会员",
    addonPrime: "PRIME",
    addonCreator: "创作者",
    addonPrivateCalls: "私人通话",

    emailAddress: "电子邮件地址",
    emailDesc: "我们将发送您的登录凭证和会员信息",
    emailPlaceholder: "you@example.com",
    invalidEmail: "请输入有效的电子邮件地址",

    paymentMethod: "支付方式",
    cardPse: "银行卡 / 银行转账",
    cardPseDesc: "信用卡、借记卡",
    usdc: "支付",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "取消",

    or: "或",
    wantBestDeal: "想要最优惠的价格？",
    lifetime100Desc: "创始人终身访问 — 一次性 $100 帮助我们完成 PNPtv 的开发，同时让您永久获得早期访问。部分功能仍在开发中。",
    checkoutLifetime100: "查看 Lifetime Prime 优惠",
    lifetime100NoticeTitle: "付款前请阅读",
    lifetime100NoticeFundraising: "特别筹资价格：您的一次性 $100 将直接用于完成应用开发。",
    lifetime100NoticeEarlyAccess: "您将永久获得 PNPtv 及我们推出的每项功能的早期访问权限。",
    lifetime100NoticeInProgress: "部分功能仍在开发中。您可能会看到未完善的细节或正在开发中的页面。",
    haveMeruCode: "有 Meru 码？",
    meruCodePlaceholder: "输入您的 Meru 码",
    activate: "激活",
    verifying: "验证中...",
    verifyingPayment: "正在验证付款...这可能需要几秒钟",
    activationFailed: "激活失败",
    activationError: "激活错误",
    pleaseEnterValidEmailAbove: "请在上方输入有效的电子邮件地址",

    promoHaveCode: "有优惠码？",
    promoCodePlaceholder: "输入你的优惠码",
    promoApply: "应用",
    promoApplied: "折扣已应用",
    promoRemove: "移除",
    promoInvalid: "该优惠码无效或已过期。",

    waitingForPayment: "正在处理您的付款...",
    completePaymentInWindow: "在结账页面完成付款。此页面将自动更新。",

    subscribeNow: "立即订阅",
    processingPayment: "处理中...",
    goBack: "返回",

    paymentConfirmed: "付款已确认！",
    subscriptionNowActive: "您的订阅已激活。请查看电子邮件获取发票和入门指南。",
    goToPNPtv: "前往 PNPtv!",

    noPlansAvailable: "暂无可用方案",
    failedToLoadPlans: "加载方案失败",
    retry: "重试",
    paymentTimedOut: "付款验证超时。如果您已完成付款，您的订阅将在几分钟内自动激活。",
    paymentNotSuccessful: "付款未成功，请重试。",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "创建付款失败",
    paymentErrorGeneric: "付款错误",
  },

  zhTW: {
    pageTitle: "訂閱 — PNPtv!",
    pageDescription: "選擇您的 PNPtv 方案。解鎖獨家內容、PRIME 影片訪問、附近探索功能等。",

    chooseYourPlan: "選擇您的方案",
    subtitle: "使用 PNPTV PRIME 解鎖獨家內容和功能",

    currentTierFree: "您目前使用免費版",
    currentTierMember: "您是 PNP 會員",
    currentTierPrime: "您擁有 PRIME 存取權限",
    upgradeCta: "升級以解鎖更多功能",
    extendCta: "在下方延長或升級您的方案",

    showPricesInUSD: "以美元顯示價格",
    showPricesInCOP: "以哥倫比亞披索顯示價格",

    communityMember: "社群會員",
    communityMemberDesc: "社交功能、PNP Live & Radio、Hangouts、Nearby — PRIME頻道、創作者獨家資料、節目代幣和私人通話需額外付費",
    prime: "PRIME",
    primeDesc: "所有Basic功能 + PNPtv! PRIME頻道 — 創作者獨家資料、節目代幣和私人通話需額外付費",

    lifetime: "終身",
    monthly: "月付",
    perMonth: "/月",
    oneTimePayment: "一次性付款 · 不自動續費",

    bestValue: "最超值",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "包含會員所有功能，另外還有：",
    showBenefits: "查看權益",
    hideBenefits: "隱藏權益",
    platformAccess: "平台存取",
    primeAccess: "完整 PRIME 存取",
    includesAddOns: "包含：",
    addonMember: "會員",
    addonPrime: "PRIME",
    addonCreator: "創作者",
    addonPrivateCalls: "私人通話",

    emailAddress: "電子郵件地址",
    emailDesc: "我們將傳送您的登入憑證和會員資訊",
    emailPlaceholder: "you@example.com",
    invalidEmail: "請輸入有效的電子郵件地址",

    paymentMethod: "付款方式",
    cardPse: "銀行卡 / 銀行轉帳",
    cardPseDesc: "信用卡、金融卡",
    usdc: "付款",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "取消",

    or: "或",
    wantBestDeal: "想要最優惠的價格？",
    lifetime100Desc: "創始人終身存取 — 一次性 $100 幫助我們完成 PNPtv 的開發，同時讓您永久獲得早期存取。部分功能仍在開發中。",
    checkoutLifetime100: "查看 Lifetime Prime 優惠",
    lifetime100NoticeTitle: "付款前請閱讀",
    lifetime100NoticeFundraising: "特別籌資價格：您的一次性 $100 將直接用於完成應用開發。",
    lifetime100NoticeEarlyAccess: "您將永久獲得 PNPtv 及我們推出的每項功能的早期存取權限。",
    lifetime100NoticeInProgress: "部分功能仍在開發中。您可能會看到未完善的細節或正在開發中的頁面。",
    haveMeruCode: "有 Meru 碼？",
    meruCodePlaceholder: "輸入您的 Meru 碼",
    activate: "啟用",
    verifying: "驗證中...",
    verifyingPayment: "正在驗證付款...這可能需要幾秒鐘",
    activationFailed: "啟用失敗",
    activationError: "啟用錯誤",
    pleaseEnterValidEmailAbove: "請在上方輸入有效的電子郵件地址",

    promoHaveCode: "有優惠碼？",
    promoCodePlaceholder: "輸入你的優惠碼",
    promoApply: "套用",
    promoApplied: "折扣已套用",
    promoRemove: "移除",
    promoInvalid: "此優惠碼無效或已過期。",

    waitingForPayment: "正在處理您的付款...",
    completePaymentInWindow: "在結帳頁面完成付款。此頁面將自動更新。",

    subscribeNow: "立即訂閱",
    processingPayment: "處理中...",
    goBack: "返回",

    paymentConfirmed: "付款已確認！",
    subscriptionNowActive: "您的訂閱已啟用。請查看電子郵件獲取發票和入門指南。",
    goToPNPtv: "前往 PNPtv!",

    noPlansAvailable: "暫無可用方案",
    failedToLoadPlans: "載入方案失敗",
    retry: "重試",
    paymentTimedOut: "付款驗證超時。如果您已完成付款，您的訂閱將在幾分鐘內自動啟用。",
    paymentNotSuccessful: "付款未成功，請重試。",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "建立付款失敗",
    paymentErrorGeneric: "付款錯誤",
  },

  fr: {
    pageTitle: "S'abonner — PNPtv!",
    pageDescription: "Choisissez votre plan PNPtv. Débloquez du contenu exclusif, l'accès vidéo PRIME, la découverte de proximité et plus encore.",

    chooseYourPlan: "Choisissez Votre Plan",
    subtitle: "Débloquez du contenu exclusif et des fonctionnalités avec PNPTV PRIME",

    currentTierFree: "Vous êtes sur le plan gratuit",
    currentTierMember: "Vous êtes Membre PNP",
    currentTierPrime: "Vous avez l'accès PRIME",
    upgradeCta: "Passez à un plan supérieur pour plus de fonctionnalités",
    extendCta: "Prolongez ou améliorez votre plan ci-dessous",

    showPricesInUSD: "Voir les prix en USD",
    showPricesInCOP: "Voir les prix en COP",

    communityMember: "Membre de la Communauté",
    communityMemberDesc: "Fonctionnalités sociales, PNP Live & Radio, Hangouts, Nearby — canal PRIME, profils exclusifs de créateurs, Ru$h pour shows et appels privés en supplément",
    prime: "PRIME",
    primeDesc: "Tout le Basic + canal PNPtv! PRIME — profils exclusifs de créateurs, Ru$h pour shows et appels privés en supplément",

    lifetime: "À vie",
    monthly: "Mensuel",
    perMonth: "/mois",
    oneTimePayment: "Paiement unique · sans renouvellement automatique",

    bestValue: "Meilleur Rapport Qualité-Prix",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Tout du plan Membre, plus :",
    showBenefits: "Voir les avantages",
    hideBenefits: "Masquer les avantages",
    platformAccess: "Accès à la plateforme",
    primeAccess: "Accès PRIME complet",
    includesAddOns: "Inclut :",
    addonMember: "Membre",
    addonPrime: "PRIME",
    addonCreator: "Créateur",
    addonPrivateCalls: "Appel privé",

    emailAddress: "Adresse e-mail",
    emailDesc: "Nous vous enverrons vos identifiants de connexion et vos informations d'adhésion",
    emailPlaceholder: "vous@exemple.com",
    invalidEmail: "Veuillez saisir une adresse e-mail valide",

    paymentMethod: "Mode de Paiement",
    cardPse: "Carte / Virement Bancaire",
    cardPseDesc: "Crédit, Débit",
    usdc: "Payer",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Annuler",

    or: "ou",
    wantBestDeal: "Vous voulez la meilleure offre ?",
    lifetime100Desc: "Accès à vie pour les fondateurs — un seul paiement de $100 nous aide à terminer PNPtv tout en vous donnant un accès anticipé pour toujours. Certaines fonctionnalités sont encore en développement.",
    checkoutLifetime100: "Voir l'offre Lifetime Prime",
    lifetime100NoticeTitle: "Avant de payer — veuillez lire",
    lifetime100NoticeFundraising: "Prix spécial de financement : votre paiement unique de $100 va directement à la finalisation de l'application.",
    lifetime100NoticeEarlyAccess: "Vous obtenez un accès anticipé à PNPtv et à chaque fonctionnalité que nous lançons, pour toujours.",
    lifetime100NoticeInProgress: "Certaines fonctionnalités sont encore en construction. Vous pouvez rencontrer des éléments non finalisés ou des écrans en développement.",
    haveMeruCode: "Vous avez un code Meru ?",
    meruCodePlaceholder: "Entrez votre code Meru",
    activate: "Activer",
    verifying: "Vérification...",
    verifyingPayment: "Vérification du paiement... cela peut prendre quelques secondes",
    activationFailed: "Échec de l'activation",
    activationError: "Erreur d'activation",
    pleaseEnterValidEmailAbove: "Veuillez saisir une adresse e-mail valide ci-dessus",

    promoHaveCode: "Vous avez un code de réduction ?",
    promoCodePlaceholder: "Entrez votre code",
    promoApply: "Appliquer",
    promoApplied: "Réduction appliquée",
    promoRemove: "Supprimer",
    promoInvalid: "Ce code n'est pas valide ou a expiré.",

    waitingForPayment: "Traitement de votre paiement...",
    completePaymentInWindow: "Complétez le paiement sur la page de paiement. Cette page se mettra à jour automatiquement.",

    subscribeNow: "S'abonner Maintenant",
    processingPayment: "Traitement en cours...",
    goBack: "Retour",

    paymentConfirmed: "Paiement Confirmé !",
    subscriptionNowActive: "Votre abonnement est maintenant actif. Consultez vos e-mails pour votre facture et votre guide d'intégration.",
    goToPNPtv: "Aller sur PNPtv!",

    noPlansAvailable: "Aucun plan disponible",
    failedToLoadPlans: "Impossible de charger les plans",
    retry: "Réessayer",
    paymentTimedOut: "Vérification du paiement expirée. Si vous avez complété le paiement, votre abonnement s'activera automatiquement en quelques minutes.",
    paymentNotSuccessful: "Le paiement n'a pas abouti. Veuillez réessayer.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Échec de la création du paiement",
    paymentErrorGeneric: "Erreur de paiement",
  },

  de: {
    pageTitle: "Abonnieren — PNPtv!",
    pageDescription: "Wähle deinen PNPtv-Plan. Schalte exklusive Inhalte, PRIME-Videozugang, Nutzer-in-der-Nähe-Entdeckung und mehr frei.",

    chooseYourPlan: "Wähle Deinen Plan",
    subtitle: "Schalte exklusive Inhalte und Funktionen mit PNPTV PRIME frei",

    currentTierFree: "Du bist im kostenlosen Plan",
    currentTierMember: "Du bist PNP-Mitglied",
    currentTierPrime: "Du hast PRIME-Zugang",
    upgradeCta: "Upgrade um mehr Funktionen freizuschalten",
    extendCta: "Verlängere oder verbessere deinen Plan unten",

    showPricesInUSD: "Preise in USD anzeigen",
    showPricesInCOP: "Preise in COP anzeigen",

    communityMember: "Community-Mitglied",
    communityMemberDesc: "Soziale Funktionen, PNP Live & Radio, Hangouts, Nearby — PRIME-Kanal, exklusive Erstellerprofile, Ru$h für Shows und private Anrufe kosten extra",
    prime: "PRIME",
    primeDesc: "Alle Basic-Funktionen + PNPtv! PRIME-Kanal — exklusive Erstellerprofile, Ru$h für Shows und private Anrufe kosten extra",

    lifetime: "Lebenslang",
    monthly: "Monatlich",
    perMonth: "/Monat",
    oneTimePayment: "Einmalzahlung · keine automatische Verlängerung",

    bestValue: "Bestes Angebot",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Alles aus dem Mitglied-Plan, plus:",
    showBenefits: "Vorteile anzeigen",
    hideBenefits: "Vorteile ausblenden",
    platformAccess: "Plattformzugang",
    primeAccess: "Vollständiger PRIME-Zugang",
    includesAddOns: "Enthält:",
    addonMember: "Mitglied",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Privatanruf",

    emailAddress: "E-Mail-Adresse",
    emailDesc: "Wir senden dir deine Login-Daten und Mitgliedschaftsinformationen",
    emailPlaceholder: "du@beispiel.de",
    invalidEmail: "Bitte gib eine gültige E-Mail-Adresse ein",

    paymentMethod: "Zahlungsmethode",
    cardPse: "Karte / Banküberweisung",
    cardPseDesc: "Kredit, Debit",
    usdc: "Bezahlen",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Abbrechen",

    or: "oder",
    wantBestDeal: "Du willst das beste Angebot?",
    lifetime100Desc: "Gründer-Lebenszugang — eine einmalige Zahlung von $100 hilft uns, PNPtv fertigzustellen, und gibt dir für immer frühen Zugang. Einige Funktionen sind noch in Entwicklung.",
    checkoutLifetime100: "Lifetime Prime-Deal ansehen",
    lifetime100NoticeTitle: "Vor der Zahlung — bitte lesen",
    lifetime100NoticeFundraising: "Spezieller Finanzierungspreis: Deine einmalige Zahlung von $100 fließt direkt in die Fertigstellung der App.",
    lifetime100NoticeEarlyAccess: "Du bekommst frühen Zugang zu PNPtv und jeder Funktion, die wir veröffentlichen — für immer.",
    lifetime100NoticeInProgress: "Einige Funktionen werden noch gebaut. Du kannst auf unfertige Details oder Screens in Entwicklung stoßen.",
    haveMeruCode: "Hast du einen Meru-Code?",
    meruCodePlaceholder: "Meru-Code eingeben",
    activate: "Aktivieren",
    verifying: "Verifizieren...",
    verifyingPayment: "Zahlung wird überprüft... dies kann einige Sekunden dauern",
    activationFailed: "Aktivierung fehlgeschlagen",
    activationError: "Aktivierungsfehler",
    pleaseEnterValidEmailAbove: "Bitte gib oben eine gültige E-Mail-Adresse ein",

    promoHaveCode: "Hast du einen Rabattcode?",
    promoCodePlaceholder: "Code eingeben",
    promoApply: "Anwenden",
    promoApplied: "Rabatt angewendet",
    promoRemove: "Entfernen",
    promoInvalid: "Dieser Code ist ungültig oder abgelaufen.",

    waitingForPayment: "Zahlung wird verarbeitet...",
    completePaymentInWindow: "Schließe die Zahlung auf der Checkout-Seite ab. Diese Seite wird automatisch aktualisiert.",

    subscribeNow: "Jetzt Abonnieren",
    processingPayment: "Wird verarbeitet...",
    goBack: "Zurück",

    paymentConfirmed: "Zahlung bestätigt!",
    subscriptionNowActive: "Dein Abonnement ist jetzt aktiv. Prüfe deine E-Mails für deine Rechnung und den Onboarding-Leitfaden.",
    goToPNPtv: "Zu PNPtv!",

    noPlansAvailable: "Keine Pläne verfügbar",
    failedToLoadPlans: "Pläne konnten nicht geladen werden",
    retry: "Erneut versuchen",
    paymentTimedOut: "Zahlungsverifizierung abgelaufen. Wenn du die Zahlung abgeschlossen hast, wird dein Abo automatisch innerhalb von Minuten aktiviert.",
    paymentNotSuccessful: "Die Zahlung war nicht erfolgreich. Bitte versuche es erneut.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Zahlung konnte nicht erstellt werden",
    paymentErrorGeneric: "Zahlungsfehler",
  },

  th: {
    pageTitle: "สมัครสมาชิก — PNPtv!",
    pageDescription: "เลือกแผน PNPtv ของคุณ ปลดล็อกเนื้อหาพิเศษ การเข้าถึงวิดีโอ PRIME ฟีเจอร์ค้นหาผู้ใช้ใกล้เคียง และอื่นๆ",

    chooseYourPlan: "เลือกแผนของคุณ",
    subtitle: "ปลดล็อกเนื้อหาพิเศษและฟีเจอร์ด้วย PNPTV PRIME",

    currentTierFree: "You're on the free tier",
    currentTierMember: "You're a PNP Member",
    currentTierPrime: "You have PRIME access",
    upgradeCta: "Upgrade to unlock more features",
    extendCta: "Extend or upgrade your plan below",

    showPricesInUSD: "แสดงราคาเป็น USD",
    showPricesInCOP: "แสดงราคาเป็น COP",

    communityMember: "สมาชิกชุมชน",
    communityMemberDesc: "ฟีเจอร์สังคม, PNP Live & Radio, Hangouts, Nearby — ช่อง PRIME, โปรไฟล์พิเศษของผู้สร้าง, โทเค็นโชว์และการโทรส่วนตัวมีค่าใช้จ่ายเพิ่มเติม",
    prime: "PRIME",
    primeDesc: "ทุกฟีเจอร์ Basic + ช่อง PNPtv! PRIME — โปรไฟล์พิเศษของผู้สร้าง, โทเค็นโชว์และการโทรส่วนตัวมีค่าใช้จ่ายเพิ่มเติม",

    lifetime: "ตลอดชีพ",
    monthly: "รายเดือน",
    perMonth: "/เดือน",
    oneTimePayment: "ชำระครั้งเดียว · ไม่ต่ออายุอัตโนมัติ",

    bestValue: "คุ้มที่สุด",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Everything in Member, plus:",
    showBenefits: "Show benefits",
    hideBenefits: "Hide benefits",
    platformAccess: "Platform access",
    primeAccess: "Full PRIME access",
    includesAddOns: "Includes:",
    addonMember: "Member",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Private Call",

    emailAddress: "ที่อยู่อีเมล",
    emailDesc: "เราจะส่งข้อมูลล็อกอินและข้อมูลสมาชิกของคุณ",
    emailPlaceholder: "you@example.com",
    invalidEmail: "กรุณากรอกที่อยู่อีเมลที่ถูกต้อง",

    paymentMethod: "วิธีการชำระเงิน",
    cardPse: "บัตร / โอนเงิน",
    cardPseDesc: "เครดิต, เดบิต",
    usdc: "ชำระเงิน",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "ยกเลิก",

    or: "หรือ",
    wantBestDeal: "ต้องการดีลที่ดีที่สุด?",
    lifetime100Desc: "การเข้าถึงตลอดชีพสำหรับผู้ก่อตั้ง — ชำระครั้งเดียว $100 ช่วยเราสร้าง PNPtv ให้เสร็จ พร้อมรับการเข้าถึงก่อนใครตลอดไป บางฟีเจอร์ยังอยู่ระหว่างการพัฒนา",
    checkoutLifetime100: "ดูดีล Lifetime Prime",
    lifetime100NoticeTitle: "ก่อนชำระเงิน — โปรดอ่าน",
    lifetime100NoticeFundraising: "ราคาระดมทุนพิเศษ: การชำระครั้งเดียว $100 ของคุณจะถูกใช้เพื่อทำให้แอปเสร็จสมบูรณ์",
    lifetime100NoticeEarlyAccess: "คุณจะได้รับการเข้าถึง PNPtv และทุกฟีเจอร์ที่เราเปิดตัวก่อนใคร ตลอดไป",
    lifetime100NoticeInProgress: "บางฟีเจอร์ยังอยู่ระหว่างการสร้าง คุณอาจพบรายละเอียดที่ยังไม่สมบูรณ์หรือหน้าจอที่กำลังพัฒนา",
    haveMeruCode: "มีโค้ด Meru?",
    meruCodePlaceholder: "กรอกโค้ด Meru ของคุณ",
    activate: "เปิดใช้งาน",
    verifying: "กำลังตรวจสอบ...",
    verifyingPayment: "กำลังตรวจสอบการชำระเงิน... อาจใช้เวลาสักครู่",
    activationFailed: "การเปิดใช้งานล้มเหลว",
    activationError: "ข้อผิดพลาดในการเปิดใช้งาน",
    pleaseEnterValidEmailAbove: "กรุณากรอกที่อยู่อีเมลที่ถูกต้องด้านบน",

    promoHaveCode: "มีรหัสส่วนลด?",
    promoCodePlaceholder: "ใส่รหัสของคุณ",
    promoApply: "ใช้",
    promoApplied: "ใช้ส่วนลดแล้ว",
    promoRemove: "ลบออก",
    promoInvalid: "รหัสนี้ไม่ถูกต้องหรือหมดอายุแล้ว",

    waitingForPayment: "กำลังประมวลผลการชำระเงิน...",
    completePaymentInWindow: "ชำระเงินให้เสร็จในหน้าชำระเงิน หน้านี้จะอัปเดตโดยอัตโนมัติ",

    subscribeNow: "สมัครสมาชิกเลย",
    processingPayment: "กำลังดำเนินการ...",
    goBack: "กลับไป",

    paymentConfirmed: "ยืนยันการชำระเงินแล้ว!",
    subscriptionNowActive: "การสมัครสมาชิกของคุณใช้งานได้แล้ว ตรวจสอบอีเมลสำหรับใบแจ้งหนี้และคู่มือการเริ่มต้น",
    goToPNPtv: "ไปที่ PNPtv!",

    noPlansAvailable: "ไม่มีแผนให้เลือก",
    failedToLoadPlans: "โหลดแผนล้มเหลว",
    retry: "ลองใหม่",
    paymentTimedOut: "หมดเวลาตรวจสอบการชำระเงิน หากคุณชำระเงินเสร็จแล้ว สมาชิกจะเปิดใช้งานโดยอัตโนมัติภายในไม่กี่นาที",
    paymentNotSuccessful: "การชำระเงินไม่สำเร็จ กรุณาลองใหม่",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "สร้างการชำระเงินล้มเหลว",
    paymentErrorGeneric: "ข้อผิดพลาดในการชำระเงิน",
  },

  it: {
    pageTitle: "Abbonati — PNPtv!",
    pageDescription: "Scegli il tuo piano PNPtv. Sblocca contenuti esclusivi, accesso video PRIME, scoperta di utenti nelle vicinanze e altro ancora.",

    chooseYourPlan: "Scegli Il Tuo Piano",
    subtitle: "Sblocca contenuti esclusivi e funzionalità con PNPTV PRIME",

    currentTierFree: "Sei sul piano gratuito",
    currentTierMember: "Sei un Membro PNP",
    currentTierPrime: "Hai l'accesso PRIME",
    upgradeCta: "Passa a un piano superiore per sbloccare più funzionalità",
    extendCta: "Estendi o migliora il tuo piano qui sotto",

    showPricesInUSD: "Mostra prezzi in USD",
    showPricesInCOP: "Mostra prezzi in COP",

    communityMember: "Membro della Community",
    communityMemberDesc: "Funzionalità social, PNP Live & Radio, Hangouts, Nearby — canale PRIME, profili esclusivi dei creator, Ru$h per show e chiamate private a pagamento extra",
    prime: "PRIME",
    primeDesc: "Tutto di Basic + canale PNPtv! PRIME — profili esclusivi dei creator, Ru$h per show e chiamate private a pagamento extra",

    lifetime: "A vita",
    monthly: "Mensile",
    perMonth: "/mese",
    oneTimePayment: "Pagamento unico · nessun rinnovo automatico",

    bestValue: "Miglior Rapporto Qualità-Prezzo",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Tutto del piano Membro, più:",
    showBenefits: "Mostra i vantaggi",
    hideBenefits: "Nascondi i vantaggi",
    platformAccess: "Accesso alla piattaforma",
    primeAccess: "Accesso PRIME completo",
    includesAddOns: "Include:",
    addonMember: "Membro",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Chiamata privata",

    emailAddress: "Indirizzo e-mail",
    emailDesc: "Ti invieremo le credenziali di accesso e le informazioni sull'abbonamento",
    emailPlaceholder: "tu@esempio.it",
    invalidEmail: "Per favore inserisci un indirizzo e-mail valido",

    paymentMethod: "Metodo di Pagamento",
    cardPse: "Carta / Bonifico Bancario",
    cardPseDesc: "Credito, Debito",
    usdc: "Paga",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Annulla",

    or: "oppure",
    wantBestDeal: "Vuoi la migliore offerta?",
    lifetime100Desc: "Accesso a vita per i fondatori — un unico pagamento di $100 ci aiuta a completare PNPtv e ti dà accesso anticipato per sempre. Alcune funzionalità sono ancora in sviluppo.",
    checkoutLifetime100: "Vedi l'offerta Lifetime Prime",
    lifetime100NoticeTitle: "Prima di pagare — leggi",
    lifetime100NoticeFundraising: "Prezzo speciale di raccolta fondi: il tuo pagamento unico di $100 va direttamente al completamento dell'app.",
    lifetime100NoticeEarlyAccess: "Ottieni accesso anticipato a PNPtv e a ogni funzionalità che lanceremo, per sempre.",
    lifetime100NoticeInProgress: "Alcune funzionalità sono ancora in costruzione. Potresti trovare dettagli grezzi o schermate in sviluppo.",
    haveMeruCode: "Hai un codice Meru?",
    meruCodePlaceholder: "Inserisci il tuo codice Meru",
    activate: "Attiva",
    verifying: "Verifica in corso...",
    verifyingPayment: "Verifica del pagamento in corso... potrebbero volerci alcuni secondi",
    activationFailed: "Attivazione fallita",
    activationError: "Errore di attivazione",
    pleaseEnterValidEmailAbove: "Per favore inserisci un indirizzo e-mail valido sopra",

    promoHaveCode: "Hai un codice sconto?",
    promoCodePlaceholder: "Inserisci il tuo codice",
    promoApply: "Applica",
    promoApplied: "Sconto applicato",
    promoRemove: "Rimuovi",
    promoInvalid: "Questo codice non è valido o è scaduto.",

    waitingForPayment: "Elaborazione del pagamento...",
    completePaymentInWindow: "Completa il pagamento nella pagina di checkout. Questa pagina si aggiornerà automaticamente.",

    subscribeNow: "Abbonati Ora",
    processingPayment: "Elaborazione in corso...",
    goBack: "Torna Indietro",

    paymentConfirmed: "Pagamento Confermato!",
    subscriptionNowActive: "Il tuo abbonamento è ora attivo. Controlla la tua e-mail per la fattura e la guida di onboarding.",
    goToPNPtv: "Vai su PNPtv!",

    noPlansAvailable: "Nessun piano disponibile",
    failedToLoadPlans: "Impossibile caricare i piani",
    retry: "Riprova",
    paymentTimedOut: "Verifica del pagamento scaduta. Se hai completato il pagamento, il tuo abbonamento si attiverà automaticamente entro pochi minuti.",
    paymentNotSuccessful: "Il pagamento non è andato a buon fine. Per favore riprova.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Impossibile creare il pagamento",
    paymentErrorGeneric: "Errore di pagamento",
  },

  tr: {
    pageTitle: "Abone Ol — PNPtv!",
    pageDescription: "PNPtv planını seç. Özel içerikleri, PRIME video erişimini, yakınımdaki kullanıcı keşfini ve daha fazlasını aç.",

    chooseYourPlan: "Planını Seç",
    subtitle: "PNPTV PRIME ile özel içeriklerin ve özelliklerin kilidini aç",

    currentTierFree: "Ücretsiz plandası",
    currentTierMember: "PNP Üyesisin",
    currentTierPrime: "PRIME erişimine sahipsin",
    upgradeCta: "Daha fazla özellik için yükselt",
    extendCta: "Planını aşağıdan uzat veya yükselt",

    showPricesInUSD: "Fiyatları USD olarak göster",
    showPricesInCOP: "Fiyatları COP olarak göster",

    communityMember: "Topluluk Üyesi",
    communityMemberDesc: "Sosyal özellikler, PNP Live & Radio, Hangouts, Nearby — PRIME kanal, özel yaratıcı profilleri, Ru$h ile shows ve özel aramalar ek ücretlidir",
    prime: "PRIME",
    primeDesc: "Tüm Basic özellikleri + PNPtv! PRIME kanalı — özel yaratıcı profilleri, Ru$h ile shows ve özel aramalar ek ücretlidir",

    lifetime: "Ömür Boyu",
    monthly: "Aylık",
    perMonth: "/ay",
    oneTimePayment: "Tek seferlik ödeme · otomatik yenileme yok",

    bestValue: "En İyi Değer",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Üye planındaki her şey, artı:",
    showBenefits: "Faydaları göster",
    hideBenefits: "Faydaları gizle",
    platformAccess: "Platform erişimi",
    primeAccess: "Tam PRIME erişimi",
    includesAddOns: "İçerir:",
    addonMember: "Üye",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Özel Arama",

    emailAddress: "E-posta adresi",
    emailDesc: "Giriş bilgilerini ve üyelik bilgilerini e-posta ile göndereceğiz",
    emailPlaceholder: "sen@ornek.com",
    invalidEmail: "Lütfen geçerli bir e-posta adresi gir",

    paymentMethod: "Ödeme Yöntemi",
    cardPse: "Kart / Banka Transferi",
    cardPseDesc: "Kredi, Banka Kartı",
    usdc: "Öde",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "İptal",

    or: "veya",
    wantBestDeal: "En iyi fırsatı mı istiyorsun?",
    lifetime100Desc: "Kurucu ömür boyu erişim — tek seferlik $100 ödeme, PNPtv'yi bitirmemize yardımcı olurken sana sonsuza kadar erken erişim sağlar. Bazı özellikler hâlâ geliştirme aşamasında.",
    checkoutLifetime100: "Lifetime Prime fırsatına bak",
    lifetime100NoticeTitle: "Ödeme yapmadan önce — lütfen oku",
    lifetime100NoticeFundraising: "Özel fon toplama fiyatı: tek seferlik $100'ın doğrudan uygulamanın tamamlanmasına gider.",
    lifetime100NoticeEarlyAccess: "PNPtv'ye ve yayınladığımız her özelliğe sonsuza kadar erken erişim elde edersin.",
    lifetime100NoticeInProgress: "Bazı özellikler hâlâ inşa ediliyor. Pürüzlü detaylar veya geliştirme aşamasındaki ekranlarla karşılaşabilirsin.",
    haveMeruCode: "Meru kodun var mı?",
    meruCodePlaceholder: "Meru kodunu gir",
    activate: "Etkinleştir",
    verifying: "Doğrulanıyor...",
    verifyingPayment: "Ödeme doğrulanıyor... bu birkaç saniye sürebilir",
    activationFailed: "Etkinleştirme başarısız",
    activationError: "Etkinleştirme hatası",
    pleaseEnterValidEmailAbove: "Lütfen yukarıya geçerli bir e-posta adresi gir",

    promoHaveCode: "İndirim kodun var mı?",
    promoCodePlaceholder: "Kodunu gir",
    promoApply: "Uygula",
    promoApplied: "İndirim uygulandı",
    promoRemove: "Kaldır",
    promoInvalid: "Bu kod geçersiz veya süresi dolmuş.",

    waitingForPayment: "Ödemeniz işleniyor...",
    completePaymentInWindow: "Ödeme sayfasında ödemeyi tamamla. Bu sayfa otomatik olarak güncellenecek.",

    subscribeNow: "Şimdi Abone Ol",
    processingPayment: "İşleniyor...",
    goBack: "Geri Dön",

    paymentConfirmed: "Ödeme Onaylandı!",
    subscriptionNowActive: "Aboneliğin şimdi aktif. Faturan ve katılım rehberin için e-postanı kontrol et.",
    goToPNPtv: "PNPtv!'e Git",

    noPlansAvailable: "Mevcut plan yok",
    failedToLoadPlans: "Planlar yüklenemedi",
    retry: "Tekrar Dene",
    paymentTimedOut: "Ödeme doğrulaması zaman aşımına uğradı. Ödemeyi tamamladıysan, aboneliğin birkaç dakika içinde otomatik olarak aktifleşecek.",
    paymentNotSuccessful: "Ödeme başarısız oldu. Lütfen tekrar dene.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Ödeme oluşturulamadı",
    paymentErrorGeneric: "Ödeme hatası",
  },

  ru: {
    pageTitle: "Подписка — PNPtv!",
    pageDescription: "Выбери свой план PNPtv. Разблокируй эксклюзивный контент, доступ к PRIME-видео, функцию поиска рядом и многое другое.",

    chooseYourPlan: "Выбери Свой План",
    subtitle: "Разблокируй эксклюзивный контент и функции с PNPTV PRIME",

    currentTierFree: "Вы на бесплатном плане",
    currentTierMember: "Вы являетесь участником PNP",
    currentTierPrime: "У вас есть доступ PRIME",
    upgradeCta: "Обновите план, чтобы разблокировать больше функций",
    extendCta: "Продлите или обновите план ниже",

    showPricesInUSD: "Показать цены в USD",
    showPricesInCOP: "Показать цены в COP",

    communityMember: "Участник сообщества",
    communityMemberDesc: "Социальные функции, PNP Live & Radio, Hangouts, Nearby — канал PRIME, эксклюзивные профили авторов, токены шоу и приватные звонки — за отдельную плату",
    prime: "PRIME",
    primeDesc: "Все функции Basic + канал PNPtv! PRIME — эксклюзивные профили авторов, токены шоу и приватные звонки за отдельную плату",

    lifetime: "Пожизненно",
    monthly: "Ежемесячно",
    perMonth: "/мес",
    oneTimePayment: "Единовременная оплата · без автопродления",

    bestValue: "Лучшая Цена",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Всё из плана Участник, плюс:",
    showBenefits: "Показать преимущества",
    hideBenefits: "Скрыть преимущества",
    platformAccess: "Доступ к платформе",
    primeAccess: "Полный PRIME-доступ",
    includesAddOns: "Включает:",
    addonMember: "Участник",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Личный звонок",

    emailAddress: "Адрес электронной почты",
    emailDesc: "Мы отправим твои данные для входа и информацию о членстве",
    emailPlaceholder: "you@example.com",
    invalidEmail: "Пожалуйста, введи корректный адрес электронной почты",

    paymentMethod: "Способ Оплаты",
    cardPse: "Карта / Банковский Перевод",
    cardPseDesc: "Кредитная, Дебетовая",
    usdc: "Оплата",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Отмена",

    or: "или",
    wantBestDeal: "Хочешь лучшую цену?",
    lifetime100Desc: "Пожизненный доступ для основателей — единовременный платёж $100 помогает нам достроить PNPtv и даёт тебе ранний доступ навсегда. Некоторые функции ещё в разработке.",
    checkoutLifetime100: "Смотреть предложение Lifetime Prime",
    lifetime100NoticeTitle: "Перед оплатой — пожалуйста, прочти",
    lifetime100NoticeFundraising: "Специальная цена сбора средств: твой единовременный платёж $100 идёт напрямую на завершение приложения.",
    lifetime100NoticeEarlyAccess: "Ты получаешь ранний доступ к PNPtv и к каждой функции, которую мы запустим — навсегда.",
    lifetime100NoticeInProgress: "Некоторые функции ещё строятся. Ты можешь встретить сырые детали или экраны в разработке.",
    haveMeruCode: "Есть код Meru?",
    meruCodePlaceholder: "Введи свой код Meru",
    activate: "Активировать",
    verifying: "Проверка...",
    verifyingPayment: "Проверка платежа... это может занять несколько секунд",
    activationFailed: "Активация не удалась",
    activationError: "Ошибка активации",
    pleaseEnterValidEmailAbove: "Пожалуйста, введи корректный адрес электронной почты выше",

    promoHaveCode: "Есть промокод?",
    promoCodePlaceholder: "Введи свой код",
    promoApply: "Применить",
    promoApplied: "Скидка применена",
    promoRemove: "Удалить",
    promoInvalid: "Этот код недействителен или истёк срок его действия.",

    waitingForPayment: "Обработка платежа...",
    completePaymentInWindow: "Завершите оплату на странице оформления. Эта страница обновится автоматически.",

    subscribeNow: "Подписаться",
    processingPayment: "Обработка...",
    goBack: "Назад",

    paymentConfirmed: "Платёж подтверждён!",
    subscriptionNowActive: "Твоя подписка активна. Проверь электронную почту для получения счёта и руководства по началу работы.",
    goToPNPtv: "Перейти на PNPtv!",

    noPlansAvailable: "Нет доступных планов",
    failedToLoadPlans: "Не удалось загрузить планы",
    retry: "Повторить",
    paymentTimedOut: "Проверка платежа истекла. Если вы завершили оплату, ваша подписка активируется автоматически в течение нескольких минут.",
    paymentNotSuccessful: "Платёж не прошёл. Пожалуйста, попробуй снова.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Не удалось создать платёж",
    paymentErrorGeneric: "Ошибка оплаты",
  },

  nl: {
    pageTitle: "Abonneren — PNPtv!",
    pageDescription: "Kies je PNPtv-plan. Ontgrendel exclusieve content, PRIME-videotoegang, ontdekking van gebruikers in de buurt en meer.",

    chooseYourPlan: "Kies Je Plan",
    subtitle: "Ontgrendel exclusieve content en functies met PNPTV PRIME",

    currentTierFree: "Je bent op het gratis plan",
    currentTierMember: "Je bent PNP-lid",
    currentTierPrime: "Je hebt PRIME-toegang",
    upgradeCta: "Upgrade om meer functies te ontgrendelen",
    extendCta: "Verleng of verbeter je plan hieronder",

    showPricesInUSD: "Prijzen in USD weergeven",
    showPricesInCOP: "Prijzen in COP weergeven",

    communityMember: "Community-lid",
    communityMemberDesc: "Sociale functies, PNP Live & Radio, Hangouts, Nearby — PRIME-kanaal, exclusieve creatorprofielen, Ru$h voor shows en privégesprekken kosten extra",
    prime: "PRIME",
    primeDesc: "Alle Basic-functies + PNPtv! PRIME-kanaal — exclusieve creatorprofielen, Ru$h voor shows en privégesprekken kosten extra",

    lifetime: "Levenslang",
    monthly: "Maandelijks",
    perMonth: "/mnd",
    oneTimePayment: "Eenmalige betaling · geen automatische verlenging",

    bestValue: "Beste Prijs-Kwaliteit",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Alles van het Lid-plan, plus:",
    showBenefits: "Voordelen tonen",
    hideBenefits: "Voordelen verbergen",
    platformAccess: "Platformtoegang",
    primeAccess: "Volledige PRIME-toegang",
    includesAddOns: "Bevat:",
    addonMember: "Lid",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Privégesprek",

    emailAddress: "E-mailadres",
    emailDesc: "We sturen je inloggegevens en lidmaatschapsinformatie",
    emailPlaceholder: "jij@voorbeeld.nl",
    invalidEmail: "Vul een geldig e-mailadres in",

    paymentMethod: "Betaalmethode",
    cardPse: "Kaart / Bankoverschrijving",
    cardPseDesc: "Krediet, Debet",
    usdc: "Betalen",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Annuleren",

    or: "of",
    wantBestDeal: "Wil je de beste deal?",
    lifetime100Desc: "Levenslange toegang voor oprichters — één betaling van $100 helpt ons om PNPtv af te bouwen en geeft jou voor altijd vroege toegang. Sommige functies zijn nog in ontwikkeling.",
    checkoutLifetime100: "Bekijk de Lifetime Prime-deal",
    lifetime100NoticeTitle: "Voor je betaalt — lees a.u.b.",
    lifetime100NoticeFundraising: "Speciale fondsenwervingsprijs: jouw eenmalige $100 gaat direct naar het afbouwen van de app.",
    lifetime100NoticeEarlyAccess: "Je krijgt vroege toegang tot PNPtv en elke functie die we lanceren, voor altijd.",
    lifetime100NoticeInProgress: "Sommige functies worden nog gebouwd. Je kunt ruwe details of schermen in ontwikkeling tegenkomen.",
    haveMeruCode: "Heb je een Meru-code?",
    meruCodePlaceholder: "Voer je Meru-code in",
    activate: "Activeren",
    verifying: "Verifiëren...",
    verifyingPayment: "Betaling verifiëren... dit kan een paar seconden duren",
    activationFailed: "Activering mislukt",
    activationError: "Activeringsfout",
    pleaseEnterValidEmailAbove: "Vul hierboven een geldig e-mailadres in",

    promoHaveCode: "Heb je een kortingscode?",
    promoCodePlaceholder: "Voer je code in",
    promoApply: "Toepassen",
    promoApplied: "Korting toegepast",
    promoRemove: "Verwijderen",
    promoInvalid: "Deze code is ongeldig of verlopen.",

    waitingForPayment: "Betaling wordt verwerkt...",
    completePaymentInWindow: "Voltooi de betaling op de afrekenpagina. Deze pagina wordt automatisch bijgewerkt.",

    subscribeNow: "Nu Abonneren",
    processingPayment: "Verwerken...",
    goBack: "Terug",

    paymentConfirmed: "Betaling Bevestigd!",
    subscriptionNowActive: "Je abonnement is nu actief. Controleer je e-mail voor je factuur en onboardinggids.",
    goToPNPtv: "Naar PNPtv!",

    noPlansAvailable: "Geen plannen beschikbaar",
    failedToLoadPlans: "Plannen konden niet worden geladen",
    retry: "Opnieuw proberen",
    paymentTimedOut: "Betalingsverificatie verlopen. Als je de betaling hebt voltooid, wordt je abonnement automatisch geactiveerd binnen enkele minuten.",
    paymentNotSuccessful: "De betaling is niet geslaagd. Probeer het opnieuw.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Betaling kon niet worden aangemaakt",
    paymentErrorGeneric: "Betalingsfout",
  },

  vi: {
    pageTitle: "Đăng ký — PNPtv!",
    pageDescription: "Chọn gói PNPtv của bạn. Mở khóa nội dung độc quyền, truy cập video PRIME, tính năng khám phá người dùng lân cận và nhiều hơn nữa.",

    chooseYourPlan: "Chọn Gói Của Bạn",
    subtitle: "Mở khóa nội dung độc quyền và tính năng với PNPTV PRIME",

    currentTierFree: "Bạn đang dùng gói miễn phí",
    currentTierMember: "Bạn là Thành viên PNP",
    currentTierPrime: "Bạn có quyền truy cập PRIME",
    upgradeCta: "Nâng cấp để mở khóa thêm tính năng",
    extendCta: "Gia hạn hoặc nâng cấp gói bên dưới",

    showPricesInUSD: "Hiển thị giá bằng USD",
    showPricesInCOP: "Hiển thị giá bằng COP",

    communityMember: "Thành viên Cộng đồng",
    communityMemberDesc: "Tính năng xã hội, PNP Live & Radio, Hangouts, Nearby — kênh PRIME, hồ sơ độc quyền của người tạo, Ru$h cho shows và cuộc gọi riêng tư tính thêm phí",
    prime: "PRIME",
    primeDesc: "Tất cả tính năng Basic + kênh PNPtv! PRIME — hồ sơ độc quyền của người tạo, Ru$h cho shows và cuộc gọi riêng tư tính thêm phí",

    lifetime: "Trọn đời",
    monthly: "Hàng tháng",
    perMonth: "/tháng",
    oneTimePayment: "Thanh toán một lần · không tự động gia hạn",

    bestValue: "Giá Trị Nhất",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Tất cả gói Thành viên, cộng thêm:",
    showBenefits: "Xem lợi ích",
    hideBenefits: "Ẩn lợi ích",
    platformAccess: "Truy cập nền tảng",
    primeAccess: "Truy cập PRIME đầy đủ",
    includesAddOns: "Bao gồm:",
    addonMember: "Thành viên",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Cuộc gọi riêng",

    emailAddress: "Địa chỉ email",
    emailDesc: "Chúng tôi sẽ gửi thông tin đăng nhập và thông tin thành viên của bạn",
    emailPlaceholder: "ban@example.com",
    invalidEmail: "Vui lòng nhập địa chỉ email hợp lệ",

    paymentMethod: "Phương Thức Thanh Toán",
    cardPse: "Thẻ / Chuyển Khoản",
    cardPseDesc: "Tín dụng, Ghi nợ",
    usdc: "Thanh toán",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Hủy",

    or: "hoặc",
    wantBestDeal: "Muốn giá tốt nhất?",
    lifetime100Desc: "Truy cập trọn đời cho người sáng lập — thanh toán một lần $100 giúp chúng tôi hoàn thành PNPtv và cho bạn truy cập sớm mãi mãi. Một số tính năng vẫn đang được phát triển.",
    checkoutLifetime100: "Xem ưu đãi Lifetime Prime",
    lifetime100NoticeTitle: "Trước khi thanh toán — vui lòng đọc",
    lifetime100NoticeFundraising: "Giá gây quỹ đặc biệt: $100 một lần của bạn sẽ được dùng trực tiếp để hoàn thiện ứng dụng.",
    lifetime100NoticeEarlyAccess: "Bạn có quyền truy cập sớm vào PNPtv và mọi tính năng chúng tôi ra mắt, mãi mãi.",
    lifetime100NoticeInProgress: "Một số tính năng vẫn đang được xây dựng. Bạn có thể gặp chi tiết chưa hoàn thiện hoặc màn hình đang phát triển.",
    haveMeruCode: "Có mã Meru?",
    meruCodePlaceholder: "Nhập mã Meru của bạn",
    activate: "Kích hoạt",
    verifying: "Đang xác minh...",
    verifyingPayment: "Đang xác minh thanh toán... có thể mất vài giây",
    activationFailed: "Kích hoạt thất bại",
    activationError: "Lỗi kích hoạt",
    pleaseEnterValidEmailAbove: "Vui lòng nhập địa chỉ email hợp lệ ở trên",

    promoHaveCode: "Bạn có mã giảm giá không?",
    promoCodePlaceholder: "Nhập mã của bạn",
    promoApply: "Áp dụng",
    promoApplied: "Đã áp dụng giảm giá",
    promoRemove: "Xóa",
    promoInvalid: "Mã này không hợp lệ hoặc đã hết hạn.",

    waitingForPayment: "Đang xử lý thanh toán...",
    completePaymentInWindow: "Hoàn tất thanh toán trên trang thanh toán. Trang này sẽ tự động cập nhật.",

    subscribeNow: "Đăng Ký Ngay",
    processingPayment: "Đang xử lý...",
    goBack: "Quay Lại",

    paymentConfirmed: "Thanh Toán Đã Xác Nhận!",
    subscriptionNowActive: "Đăng ký của bạn đã được kích hoạt. Kiểm tra email để nhận hóa đơn và hướng dẫn bắt đầu.",
    goToPNPtv: "Đến PNPtv!",

    noPlansAvailable: "Không có gói nào",
    failedToLoadPlans: "Tải gói thất bại",
    retry: "Thử lại",
    paymentTimedOut: "Xác minh thanh toán đã hết thời gian. Nếu bạn đã hoàn tất thanh toán, đăng ký của bạn sẽ được kích hoạt tự động trong vài phút.",
    paymentNotSuccessful: "Thanh toán không thành công. Vui lòng thử lại.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Tạo thanh toán thất bại",
    paymentErrorGeneric: "Lỗi thanh toán",
  },

  ja: {
    pageTitle: "購読 — PNPtv!",
    pageDescription: "PNPtv のプランを選択。限定コンテンツ、PRIME 動画アクセス、近くのユーザー検索などをアンロックしよう。",

    chooseYourPlan: "プランを選択",
    subtitle: "PNPTV PRIME で限定コンテンツと機能をアンロック",

    currentTierFree: "無料プランをご利用中です",
    currentTierMember: "PNP メンバーです",
    currentTierPrime: "PRIME アクセスをお持ちです",
    upgradeCta: "アップグレードしてさらに多くの機能を解放",
    extendCta: "以下でプランを延長またはアップグレード",

    showPricesInUSD: "USD で価格を表示",
    showPricesInCOP: "COP で価格を表示",

    communityMember: "コミュニティメンバー",
    communityMemberDesc: "ソーシャル機能、PNP Live & Radio、Hangouts、Nearby — PRIMEチャンネル、クリエイター限定プロファイル、ショートークン、プライベート通話は別途料金",
    prime: "PRIME",
    primeDesc: "すべてのBasic機能 + PNPtv! PRIMEチャンネル — クリエイター限定プロファイル、ショートークン、プライベート通話は別途料金",

    lifetime: "生涯",
    monthly: "月払い",
    perMonth: "/月",
    oneTimePayment: "一回払い・自動更新なし",

    bestValue: "最もお得",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "メンバープランの全て、さらに：",
    showBenefits: "特典を表示",
    hideBenefits: "特典を非表示",
    platformAccess: "プラットフォームアクセス",
    primeAccess: "完全 PRIME アクセス",
    includesAddOns: "含まれる：",
    addonMember: "メンバー",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "プライベート通話",

    emailAddress: "メールアドレス",
    emailDesc: "ログイン情報とメンバーシップ情報をお送りします",
    emailPlaceholder: "you@example.com",
    invalidEmail: "有効なメールアドレスを入力してください",

    paymentMethod: "支払い方法",
    cardPse: "カード / 銀行振込",
    cardPseDesc: "クレジット、デビット",
    usdc: "支払う",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "キャンセル",

    or: "または",
    wantBestDeal: "最高のお得を求めますか？",
    lifetime100Desc: "ファウンダー生涯アクセス — $100 の一回払いが PNPtv を完成させる支援となり、あなたは永久に早期アクセスを得られます。一部の機能はまだ開発中です。",
    checkoutLifetime100: "Lifetime Prime ディールを見る",
    lifetime100NoticeTitle: "お支払い前にお読みください",
    lifetime100NoticeFundraising: "特別な資金調達価格：一回払いの $100 はアプリの完成に直接使われます。",
    lifetime100NoticeEarlyAccess: "PNPtv と私たちがリリースするすべての機能への早期アクセスを永久に取得できます。",
    lifetime100NoticeInProgress: "一部の機能はまだ構築中です。未完成のディテールや開発中の画面に出会うことがあります。",
    haveMeruCode: "Meru コードをお持ちですか？",
    meruCodePlaceholder: "Meru コードを入力",
    activate: "有効化",
    verifying: "確認中...",
    verifyingPayment: "支払いを確認中...数秒かかる場合があります",
    activationFailed: "有効化に失敗",
    activationError: "有効化エラー",
    pleaseEnterValidEmailAbove: "上に有効なメールアドレスを入力してください",

    promoHaveCode: "割引コードをお持ちですか？",
    promoCodePlaceholder: "コードを入力",
    promoApply: "適用",
    promoApplied: "割引が適用されました",
    promoRemove: "削除",
    promoInvalid: "このコードは無効か期限切れです。",

    waitingForPayment: "支払いを処理中...",
    completePaymentInWindow: "チェックアウトページで支払いを完了してください。このページは自動的に更新されます。",

    subscribeNow: "今すぐ購読",
    processingPayment: "処理中...",
    goBack: "戻る",

    paymentConfirmed: "支払い確認済み！",
    subscriptionNowActive: "サブスクリプションが有効になりました。請求書とオンボーディングガイドについてはメールをご確認ください。",
    goToPNPtv: "PNPtv! へ",

    noPlansAvailable: "利用可能なプランがありません",
    failedToLoadPlans: "プランの読み込みに失敗",
    retry: "再試行",
    paymentTimedOut: "支払いの確認がタイムアウトしました。支払いを完了した場合、サブスクリプションは数分以内に自動的に有効になります。",
    paymentNotSuccessful: "支払いが成功しませんでした。もう一度お試しください。",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "支払いの作成に失敗",
    paymentErrorGeneric: "支払いエラー",
  },

  id: {
    pageTitle: "Berlangganan — PNPtv!",
    pageDescription: "Pilih paket PNPtv kamu. Buka kunci konten eksklusif, akses video PRIME, penemuan pengguna terdekat dan lainnya.",

    chooseYourPlan: "Pilih Paketmu",
    subtitle: "Buka kunci konten eksklusif dan fitur dengan PNPTV PRIME",

    currentTierFree: "Kamu berada di paket gratis",
    currentTierMember: "Kamu adalah Anggota PNP",
    currentTierPrime: "Kamu memiliki akses PRIME",
    upgradeCta: "Tingkatkan untuk membuka lebih banyak fitur",
    extendCta: "Perpanjang atau tingkatkan paketmu di bawah",

    showPricesInUSD: "Tampilkan harga dalam USD",
    showPricesInCOP: "Tampilkan harga dalam COP",

    communityMember: "Anggota Komunitas",
    communityMemberDesc: "Fitur sosial, PNP Live & Radio, Hangouts, Nearby — saluran PRIME, profil eksklusif kreator, Ru$h untuk shows dan panggilan pribadi biaya tambahan",
    prime: "PRIME",
    primeDesc: "Semua fitur Basic + saluran PNPtv! PRIME — profil eksklusif kreator, Ru$h untuk shows dan panggilan pribadi biaya tambahan",

    lifetime: "Seumur Hidup",
    monthly: "Bulanan",
    perMonth: "/bln",
    oneTimePayment: "Pembayaran satu kali · tanpa perpanjangan otomatis",

    bestValue: "Nilai Terbaik",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "Semua dari paket Anggota, plus:",
    showBenefits: "Lihat manfaat",
    hideBenefits: "Sembunyikan manfaat",
    platformAccess: "Akses platform",
    primeAccess: "Akses PRIME penuh",
    includesAddOns: "Termasuk:",
    addonMember: "Anggota",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "Panggilan privat",

    emailAddress: "Alamat email",
    emailDesc: "Kami akan mengirim kredensial login dan informasi keanggotaan kamu",
    emailPlaceholder: "kamu@contoh.com",
    invalidEmail: "Masukkan alamat email yang valid",

    paymentMethod: "Metode Pembayaran",
    cardPse: "Kartu / Transfer Bank",
    cardPseDesc: "Kredit, Debit",
    usdc: "Bayar",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "Batal",

    or: "atau",
    wantBestDeal: "Ingin penawaran terbaik?",
    lifetime100Desc: "Akses seumur hidup untuk pendiri — pembayaran sekali $100 membantu kami menyelesaikan PNPtv sekaligus memberimu akses awal selamanya. Beberapa fitur masih dalam pengembangan.",
    checkoutLifetime100: "Lihat penawaran Lifetime Prime",
    lifetime100NoticeTitle: "Sebelum membayar — harap baca",
    lifetime100NoticeFundraising: "Harga penggalangan dana khusus: $100 satu kali-mu langsung digunakan untuk menyelesaikan aplikasi.",
    lifetime100NoticeEarlyAccess: "Kamu mendapatkan akses awal ke PNPtv dan setiap fitur yang kami luncurkan, selamanya.",
    lifetime100NoticeInProgress: "Beberapa fitur masih sedang dibangun. Kamu mungkin menemukan detail yang belum halus atau layar dalam pengembangan.",
    haveMeruCode: "Punya kode Meru?",
    meruCodePlaceholder: "Masukkan kode Meru kamu",
    activate: "Aktifkan",
    verifying: "Memverifikasi...",
    verifyingPayment: "Memverifikasi pembayaran... ini mungkin memerlukan beberapa detik",
    activationFailed: "Aktivasi gagal",
    activationError: "Kesalahan aktivasi",
    pleaseEnterValidEmailAbove: "Masukkan alamat email yang valid di atas",

    promoHaveCode: "Punya kode diskon?",
    promoCodePlaceholder: "Masukkan kode kamu",
    promoApply: "Terapkan",
    promoApplied: "Diskon diterapkan",
    promoRemove: "Hapus",
    promoInvalid: "Kode ini tidak valid atau telah kedaluwarsa.",

    waitingForPayment: "Memproses pembayaran...",
    completePaymentInWindow: "Selesaikan pembayaran di halaman checkout. Halaman ini akan diperbarui secara otomatis.",

    subscribeNow: "Berlangganan Sekarang",
    processingPayment: "Memproses...",
    goBack: "Kembali",

    paymentConfirmed: "Pembayaran Dikonfirmasi!",
    subscriptionNowActive: "Langgananmu sekarang aktif. Periksa email untuk faktur dan panduan orientasi.",
    goToPNPtv: "Ke PNPtv!",

    noPlansAvailable: "Tidak ada paket tersedia",
    failedToLoadPlans: "Gagal memuat paket",
    retry: "Coba lagi",
    paymentTimedOut: "Verifikasi pembayaran habis waktu. Jika Anda menyelesaikan pembayaran, langganan Anda akan aktif secara otomatis dalam beberapa menit.",
    paymentNotSuccessful: "Pembayaran tidak berhasil. Silakan coba lagi.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "Gagal membuat pembayaran",
    paymentErrorGeneric: "Kesalahan pembayaran",
  },

  ar: {
    pageTitle: "اشتراك — PNPtv!",
    pageDescription: "اختر خطة PNPtv الخاصة بك. افتح المحتوى الحصري وصول PRIME للفيديو واكتشاف المستخدمين القريبين والمزيد.",

    chooseYourPlan: "اختر خطتك",
    subtitle: "افتح المحتوى الحصري والميزات مع PNPTV PRIME",

    currentTierFree: "أنت على الخطة المجانية",
    currentTierMember: "أنت عضو PNP",
    currentTierPrime: "لديك وصول PRIME",
    upgradeCta: "قم بالترقية لإتاحة المزيد من الميزات",
    extendCta: "قم بتمديد خطتك أو ترقيتها أدناه",

    showPricesInUSD: "عرض الأسعار بالدولار الأمريكي",
    showPricesInCOP: "عرض الأسعار بالبيزو الكولومبي",

    communityMember: "عضو المجتمع",
    communityMemberDesc: "الميزات الاجتماعية، PNP Live & Radio، Hangouts، Nearby — قناة PRIME والملفات الشخصية الحصرية للمبدعين ورموز العروض والمكالمات الخاصة بتكلفة إضافية",
    prime: "PRIME",
    primeDesc: "جميع ميزات Basic + قناة PNPtv! PRIME — الملفات الشخصية الحصرية للمبدعين ورموز العروض والمكالمات الخاصة بتكلفة إضافية",

    lifetime: "مدى الحياة",
    monthly: "شهري",
    perMonth: "/شهر",
    oneTimePayment: "دفعة واحدة · بدون تجديد تلقائي",

    bestValue: "أفضل قيمة",
    launchRate: "✦ Intro",

    everythingInMemberPlus: "كل ما في خطة العضو، بالإضافة إلى:",
    showBenefits: "عرض المزايا",
    hideBenefits: "إخفاء المزايا",
    platformAccess: "الوصول إلى المنصة",
    primeAccess: "وصول PRIME كامل",
    includesAddOns: "يتضمن:",
    addonMember: "عضو",
    addonPrime: "PRIME",
    addonCreator: "Creator",
    addonPrivateCalls: "مكالمة خاصة",

    emailAddress: "عنوان البريد الإلكتروني",
    emailDesc: "سنرسل لك بيانات تسجيل الدخول ومعلومات العضوية",
    emailPlaceholder: "you@example.com",
    invalidEmail: "يرجى إدخال عنوان بريد إلكتروني صالح",

    paymentMethod: "طريقة الدفع",
    cardPse: "بطاقة / تحويل مصرفي",
    cardPseDesc: "ائتمان، خصم",
    usdc: "ادفع",
    // Dash and Lightning info strings removed 2026-07-31

    usdcPayment: "USDC / USDT",
    usdcDesc: "20+ networks · Stable",
    usdcComingSoon: "Coming soon",
    usdcBadge: "STABLE",
    usdcInfoText: "Pay with USDC or USDT — stable value, no price swings, accepted from any chain. Choose your preferred network at checkout.",
    usdcRedirecting: "Opening secure checkout...",
    usdcWaitingTitle: "Waiting for USDC payment",
    usdcWaitingDesc: "Complete your payment below. The page updates automatically once confirmed.",
    usdcPaymentConfirmed: "Payment confirmed!",
    usdcExpired: "Payment not completed. Please try again or contact support if you sent funds.",
    failedToCreateUsdcInvoice: "Failed to create USDC invoice",
    usdcNotConfigured: "USDC payments are not available yet. Please use Card.",
    usdcOpenCheckout: "Open payment page",

    // Dash invoice panel strings removed 2026-07-31
    cancel: "إلغاء",

    or: "أو",
    wantBestDeal: "تريد أفضل صفقة؟",
    lifetime100Desc: "وصول مدى الحياة للمؤسسين — دفعة واحدة $100 تساعدنا في إنهاء بناء PNPtv وتمنحك وصولاً مبكراً إلى الأبد. بعض الميزات لا تزال قيد التطوير.",
    checkoutLifetime100: "اطلع على عرض Lifetime Prime",
    lifetime100NoticeTitle: "قبل الدفع — يرجى القراءة",
    lifetime100NoticeFundraising: "سعر جمع تبرعات خاص: دفعتك لمرة واحدة $100 تذهب مباشرة لإنهاء التطبيق.",
    lifetime100NoticeEarlyAccess: "تحصل على وصول مبكر إلى PNPtv وكل ميزة نطلقها، إلى الأبد.",
    lifetime100NoticeInProgress: "بعض الميزات لا تزال قيد البناء. قد تواجه تفاصيل غير مصقولة أو شاشات قيد التطوير.",
    haveMeruCode: "لديك رمز Meru؟",
    meruCodePlaceholder: "أدخل رمز Meru الخاص بك",
    activate: "تفعيل",
    verifying: "جارٍ التحقق...",
    verifyingPayment: "جارٍ التحقق من الدفع... قد يستغرق هذا بضع ثوانٍ",
    activationFailed: "فشل التفعيل",
    activationError: "خطأ في التفعيل",
    pleaseEnterValidEmailAbove: "يرجى إدخال عنوان بريد إلكتروني صالح أعلاه",

    promoHaveCode: "لديك كود خصم؟",
    promoCodePlaceholder: "أدخل الكود",
    promoApply: "تطبيق",
    promoApplied: "تم تطبيق الخصم",
    promoRemove: "إزالة",
    promoInvalid: "هذا الكود غير صالح أو انتهت صلاحيته.",

    waitingForPayment: "جارٍ معالجة الدفع...",
    completePaymentInWindow: "أكمل الدفع في صفحة الدفع. ستتحدث هذه الصفحة تلقائياً.",

    subscribeNow: "اشترك الآن",
    processingPayment: "جارٍ المعالجة...",
    goBack: "العودة",

    paymentConfirmed: "تم تأكيد الدفع!",
    subscriptionNowActive: "اشتراكك الآن نشط. تحقق من بريدك الإلكتروني للحصول على الفاتورة ودليل الإعداد.",
    goToPNPtv: "الذهاب إلى PNPtv!",

    noPlansAvailable: "لا توجد خطط متاحة",
    failedToLoadPlans: "فشل تحميل الخطط",
    retry: "إعادة المحاولة",
    paymentTimedOut: "انتهت مهلة التحقق من الدفع. إذا أكملت الدفع، سيتم تفعيل اشتراكك تلقائياً خلال دقائق.",
    paymentNotSuccessful: "لم يكن الدفع ناجحاً. يرجى المحاولة مجدداً.",
    // Dash error strings removed 2026-07-31
    failedToCreatePayment: "فشل إنشاء الدفع",
    paymentErrorGeneric: "خطأ في الدفع",
  },
} as const;

export type SubscribeStrings = typeof strings.en;
export { strings as subscribe };
