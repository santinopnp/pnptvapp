import React, { useEffect, useRef, useState } from "react";
import { getCryptoGuideStatus, saveCryptoGuideProgress, completeCryptoGuide } from "@/lib/api";
import { WALLETS, type WalletKey } from "@/lib/cryptoWallets";

type Lang = "en" | "es";

const MM_SRC = "/crypto-tutorial/metamask-setup.mp4";
const TW_SRC = "/crypto-tutorial/truewallet-setup.mp4";

// ── Copy tables ─────────────────────────────────────────────────────────────

const T = {
  eyebrow:    { en: "GETTING STARTED",                            es: "PARA EMPEZAR" },
  readyStartPay: { en: "Ready — Start Payment →",                 es: "Listo — Iniciar Pago →" },
  skipGuide:   { en: "Skip guide",                                 es: "Omitir guía" },
  title:      { en: "How to pay in PNPtv with crypto",            es: "Cómo pagar en PnP con criptomonedas" },
  subtitle:   { en: "5 quick steps: pick a wallet, install it, load it with crypto, and pay — memberships, calls and Ru$h land in your account automatically.",
                es: "5 pasos: elige una wallet, instálala, cárgala con cripto y paga — la membresía, las llamadas y Ru$h llegan a tu cuenta automáticamente." },
  stepOf:     { en: (n: number) => `Step ${n} of 5`,              es: (n: number) => `Paso ${n} de 5` },
  stepTitle: {
    en: { 1: "Pick your wallet", 2: "Install & create", 3: "Buy your crypto", 4: "Pay in PNPtv", 5: "Automatic delivery" },
    es: { 1: "Elige tu wallet", 2: "Instala y créala", 3: "Compra tu cripto", 4: "Paga en PnP", 5: "Entrega automática" },
  },
  back:       { en: "← Back",                                     es: "← Atrás" },
  nextStep:   { en: "Next →",                                     es: "Siguiente →" },
  pickAWallet:{ en: "Pick a wallet above",                        es: "Elige una wallet arriba" },
  startOver:  { en: "Start over",                                 es: "Empezar de nuevo" },
  inTheApp:   { en: "IN THE APP",                                 es: "EN LA APP" },
  tapPlay:    { en: "Tap play to see the action",                 es: "Toca play para ver la acción" },

  // Step 1 — Pick wallet
  s1Intro: {
    en: "A wallet is your digital pocket. It's an app on your phone or a Chrome extension where you keep your crypto. It's free, takes ~2 minutes to set up, and it belongs only to you — no bank in the middle.",
    es: "Una wallet es tu billetera digital. Es una app en tu teléfono o una extensión de Chrome donde guardas tu cripto. Es gratis, toma ~2 minutos, y solo te pertenece a ti — sin banco en medio.",
  },
  s1TipLabel: { en: "TIP",  es: "TIP" },
  s1TipBody: {
    en: "Both work great. If you'll pay mostly from your phone, pick Trust Wallet. If you'll use the browser, pick MetaMask.",
    es: "Las dos funcionan bien. Si vas a pagar sobre todo desde el teléfono, elige Trust Wallet. Si usarás el navegador, MetaMask.",
  },
  tagTrust:    { en: "BEST FOR MOBILE",           es: "MEJOR PARA MÓVIL" },
  tagMM:       { en: "BEST FOR WEB & BROWSER",    es: "MEJOR PARA WEB Y NAVEGADOR" },
  descTrust: {
    en: "Made for the phone. Accepts Google Pay, cards, bank transfer and moving balance from Binance or Coinbase.",
    es: "Pensada para el teléfono. Acepta Google Pay, tarjeta, transferencia y traer saldo desde Binance o Coinbase.",
  },
  descMM: {
    en: "The most used wallet for connecting to websites. Buy with card via providers like Transak, Banxa or Robinhood Connect.",
    es: "La más usada para conectarse a webs. Compra con tarjeta a través de proveedores como Transak, Banxa o Robinhood Connect.",
  },

  // Step 2 — Install / Create (recreated UI)
  s2Head: {
    en: "You picked ",
    es: "Elegiste ",
  },
  s2WhyNoVideo: {
    en: ". This part isn't a video for a reason: it shows your password and your 12-word secret. Nobody should ever film that — not even us. Here's what you'll see step by step.",
    es: ". Esta parte no lleva video a propósito: muestra tu contraseña y tu frase de 12 palabras. Nadie debería grabar eso — ni nosotros. Aquí ves paso a paso qué verás.",
  },
  s2RedLabel: { en: "⚠ NEVER SHARE THIS",  es: "⚠ NUNCA COMPARTAS ESTO" },
  s2RedBody: {
    en: "Nobody from PNPtv will ever ask for your 12 words. Not by DM, not by email, not by phone. If someone does, it's a scam.",
    es: "Nadie de PNPtv te pedirá jamás tu frase de 12 palabras. Ni por DM, ni por email, ni por teléfono. Si te la piden, es estafa.",
  },
  s2InstallHint: {
    en: "Install from the official store (App Store, Google Play or Chrome Web Store). Only use official links — anything else in chat is a scam.",
    es: "Instala desde la tienda oficial (App Store, Google Play o Chrome Web Store). Solo usa enlaces oficiales — cualquier otra cosa en chat es estafa.",
  },
  s2MockCreateT: { en: "Create your wallet", es: "Crea tu wallet" },
  s2MockCreateD: {
    en: "Open the app and tap \"Create a new wallet\".",
    es: "Abre la app y toca \"Crear una wallet nueva\".",
  },
  s2MockCreatePrimary: { en: "Create a new wallet",  es: "Crear una wallet nueva" },
  s2MockCreateSecondary: { en: "I already have one", es: "Ya tengo una wallet" },

  s2MockPassT: { en: "Set a password",     es: "Crea una contraseña" },
  s2MockPassD: {
    en: "This only protects the app on this phone. Write it down where you'll remember it.",
    es: "Solo protege esta app en este teléfono. Escríbela donde la recuerdes.",
  },
  s2MockPassCont: { en: "Continue", es: "Continuar" },

  s2MockPhraseT: { en: "Save your 12-word phrase", es: "Guarda tu frase de 12 palabras" },
  s2MockPhraseD: {
    en: "These 12 words are the only way to recover your money if you lose the phone. On paper — never in photos, never in chats.",
    es: "Son 12 palabras: la única forma de recuperar tu dinero si pierdes el teléfono. En papel, nunca en fotos ni en chats.",
  },
  s2MockPhraseNote: {
    en: "The real ones you'll see will be different.",
    es: "Las palabras reales que verás serán distintas.",
  },
  s2MockConfirmT: { en: "Confirm the phrase", es: "Confirma la frase" },
  s2MockConfirmD: {
    en: "The app asks you to tap some words in order to check you saved it correctly.",
    es: "La app te pide repetir algunas palabras en orden para comprobar que la guardaste.",
  },

  // Step 3 — Buy your crypto
  s3Intro: {
    en: "As soon as you open your wallet it will ask you to add funds. Do it right away — without a balance you can't pay. Start with $20–50 to try it out.",
    es: "Nada más abrir tu wallet te pedirá agregar fondos. Hazlo de una: sin saldo no hay pago. Empieza con 20–50 US$ para probar.",
  },
  s3TokenHeader: { en: "Which token to buy?", es: "¿Qué token comprar?" },
  s3TokenSub: {
    en: "Any of these works. Stablecoins (USDT, USDC) are the safest because their value doesn't move.",
    es: "Cualquiera te sirve. Las stablecoins (USDT, USDC) son las más seguras porque su valor no se mueve.",
  },
  s3NetworkHeader: { en: "Pick the right network", es: "Elige la red correcta" },
  s3NetworkRule: {
    en: "Golden rule: the network you buy on is the network you pick in PNPtv. Same token on the wrong network = money lost.",
    es: "Regla de oro: la red que compras es la red que eliges en PnP. Mismo token en la red equivocada = dinero perdido.",
  },
  s3NetworkWarn: {
    en: "Cheap networks (Solana, BSC, Base, Polygon) are perfect for small payments. Avoid Ethereum for anything under $100 — the fee eats your money.",
    es: "Las redes baratas (Solana, BSC, Base, Polygon) son perfectas para pagos pequeños. Evita Ethereum para montos menores a 100 US$ — la comisión se come tu dinero.",
  },
  s3PayHeader: { en: "Payment methods", es: "Medios de pago" },
  s3PaySub: {
    en: "Which options show up depends on your country and the wallet you picked.",
    es: "Los medios que aparecen dependen de tu país y de la wallet que elegiste.",
  },
  s3RateHeader:  { en: "Example: best rate wins",      es: "Ejemplo de mejor tasa" },
  s3RateSub: {
    en: "For the same $100, providers give you different amounts. Always pick the one with the best rate.",
    es: "Por los mismos 100 US$, cada proveedor entrega un monto distinto. Elige siempre el de mejor tarifa.",
  },
  s3RateBest:    { en: "BEST RATE",                    es: "MEJOR TARIFA" },
  s3RateSafe:    { en: "MOST TRUSTED",                 es: "MÁS CONFIABLE" },
  s3RateDelta:   { en: (d: string) => `Difference: ${d} more crypto for the same money.`,
                   es: (d: string) => `Diferencia: ${d} más de cripto por el mismo dinero.` },
  s3KycHead: {
    en: "From here you pay like you would anywhere",
    es: "Desde aquí pagas como siempre",
  },
  s3KycBody: {
    en: "The payment provider takes over the screen: email, code, card or bank details. PNPtv and your wallet never see your banking info. Small card purchases usually go through without ID; bigger amounts, bank transfers or certain providers may ask for ID + selfie by law. If it happens and you don't want to, lower the amount or switch providers. Card = minutes. Bank transfer = hours.",
    es: "El proveedor toma la pantalla: correo, código, tarjeta o banco. PnP y tu wallet no ven datos bancarios. Compras pequeñas con tarjeta normalmente sin ID; montos altos, transferencias o ciertos proveedores piden ID + selfie por requisito legal. Si te lo piden y no quieres, baja el monto o cambia de proveedor. Tarjeta = minutos. Transferencia = horas.",
  },

  // Step 4 — Pay in PnP
  s4Intro: {
    en: "On the PNPtv checkout screen pick Now Payments, then the same token and the same network you bought, and tap your wallet icon: MetaMask or Trust Wallet.",
    es: "En la pantalla de pago de PnP elige Now Payments, luego el mismo token y la misma red que compraste, y toca el icono de tu wallet: MetaMask o Trust Wallet.",
  },
  s4Callout: {
    en: (ex: string) => `Concrete example: ${ex}`,
    es: (ex: string) => `Ejemplo concreto: ${ex}`,
  },
  s4Example: {
    en: "you bought USDC on Solana → in PNPtv pick USDC (Solana). Match the network. Every time.",
    es: "compraste USDC en Solana → en PnP eliges USDC (Solana). Igualas la red. Siempre.",
  },

  // Step 5 — Done
  s5DoneTitle: { en: "Done — no more steps",   es: "Listo — no hay más pasos" },
  s5DoneBody: {
    en: "PNPtv detects your payment automatically. You don't have to send screenshots, tickets or receipts.",
    es: "PnP detecta tu pago automáticamente. No tienes que mandar capturas, tickets ni recibos.",
  },
  s5Row1: { en: "Your membership activates on its own",   es: "Tu membresía se activa sola" },
  s5Row2: { en: "Your calls get credited",                es: "Tus llamadas quedan acreditadas" },
  s5Row3: { en: "Your Ru$h appears in your account",      es: "Tu Ru$h aparece en tu cuenta" },
  s5RewardLine: {
    en: "🎁 You got 30 free Ru$h to spend with Santino for completing the tutorial.",
    es: "🎁 Ganaste 30 Ru$h gratis para usar con Santino por completar el tutorial.",
  },
  s5FooterNote: {
    en: "It takes a few minutes depending on the network. If it's been over an hour, contact support with the Payment ID from NOWPayments.",
    es: "Tarda minutos según la red. Si pasa más de una hora, contacta a soporte con el Payment ID de NOWPayments.",
  },
} as const;

// ── Wallet display data ─────────────────────────────────────────────────────

type WalletMeta = { key: WalletKey; name: string; letter: string; grad: string; tag: Record<Lang, string>; desc: Record<Lang, string> };

const WALLET_META: Record<WalletKey, WalletMeta> = {
  trust: {
    key: "trust",
    name: "Trust Wallet",
    letter: "T",
    grad: "linear-gradient(135deg,#3375BB,#5FA9EE)",
    tag: T.tagTrust,
    desc: T.descTrust,
  },
  metamask: {
    key: "metamask",
    name: "MetaMask",
    letter: "M",
    grad: "linear-gradient(135deg,#F6851B,#E2761B)",
    tag: T.tagMM,
    desc: T.descMM,
  },
};

// ── Video windows (verified frame-by-frame, in seconds) ──────────────────────
type Clip = { src: string; start: number; end: number; title: Record<Lang, string>; desc: Record<Lang, string>; caption: Record<Lang, string> };

const BUY_CLIPS: Record<WalletKey, Clip[]> = {
  metamask: [
    { src: MM_SRC, start: 125, end: 132,
      title: { en: "Open MetaMask — it asks to add funds", es: "Abre MetaMask: te pide agregar fondos" },
      desc:  { en: "As soon as you enter, \"Deposit funds in your wallet\" shows up. Tap \"Add funds\" — that's where the purchase starts.",
               es: "Nada más entrar aparece \"Deposita fondos en tu billetera\". Toca \"Agregar fondos\" — ahí empieza la compra." },
      caption: { en: "Home screen → Add funds button", es: "Pantalla de inicio → botón Agregar fondos" } },
    { src: MM_SRC, start: 137, end: 144,
      title: { en: "Pick the token you'll buy", es: "Elige el token que vas a comprar" },
      desc:  { en: "\"Select a token\" opens with the full list: MetaMask USD, Ethereum, Bitcoin, Solana, Tether USD, USD Coin… Use the search to get there fast.",
               es: "Se abre \"Selecciona un token\" con la lista completa: MetaMask USD, Ethereum, Bitcoin, Solana, Tether USD, USD Coin… Usa el buscador para llegar rápido." },
      caption: { en: "Select a token → search", es: "Selecciona un token → buscador" } },
    { src: MM_SRC, start: 145, end: 150,
      title: { en: "Check the network of each token", es: "Fíjate en la red de cada token" },
      desc:  { en: "Type \"usdc\" and several identical rows appear: it's the same token on different networks. Look at the small logo on each row and pick the network you'll use in PNPtv.",
               es: "Al escribir \"usdc\" salen varias filas iguales: es el mismo token en distintas redes. Mira el logo pequeño de cada fila y elige la red que vas a usar en PnP." },
      caption: { en: "USDC repeats = one row per network", es: "USDC repetido = una fila por red" } },
    { src: MM_SRC, start: 151, end: 158,
      title: { en: "Type the amount", es: "Escribe el monto" },
      desc:  { en: "Top reads \"Buy USDC on Base\": token + network confirmed. Here it's $100; you can start with $20–30.",
               es: "Arriba se lee \"Comprar USDC en Base\": token y red confirmados. Aquí se compran 100 US$; puedes empezar con 20–30 US$." },
      caption: { en: "Buy USDC on Base · $100", es: "Comprar USDC en Base · 100 US$" } },
    { src: MM_SRC, start: 158, end: 163,
      title: { en: "Pick your payment method", es: "Elige el medio de pago" },
      desc:  { en: "The \"Debit or Credit\" selector opens the methods available in your country: debit or credit card and, depending on region, Apple Pay or Google Pay.",
               es: "El selector \"Debit or Credit\" abre los medios disponibles en tu país: tarjeta débito o crédito y, según la zona, Apple Pay o Google Pay." },
      caption: { en: "Debit or Credit → available methods", es: "Debit or Credit → medios disponibles" } },
    { src: MM_SRC, start: 163, end: 168.5,
      title: { en: "Compare providers, take the best rate", es: "Compara proveedores y quédate con la mejor tasa" },
      desc:  { en: "MetaMask doesn't sell: it shows providers. For the same $100, Banxa gives 99.78 USDC (\"best rate\") and Robinhood Connect 98.52 USDC. Pick the best rate.",
               es: "MetaMask no vende: muestra proveedores. Por los mismos 100 US$, Banxa entrega 99,78 USDC (\"mejor tarifa\") y Robinhood Connect 98,52 USDC. Toca el de mejor tarifa." },
      caption: { en: "Banxa 99.78 USDC vs Robinhood 98.52 USDC", es: "Banxa 99,78 USDC vs Robinhood 98,52 USDC" } },
    { src: MM_SRC, start: 168.5, end: 178,
      title: { en: "The provider takes over", es: "El proveedor toma el control" },
      desc:  { en: "On confirm \"Powered by Banxa\" appears and the screen becomes the provider's: email, code, and card or bank details. Every person pays with their own method — like any online purchase.",
               es: "Al confirmar aparece \"Desarrollado por Banxa\" y la pantalla pasa a ser del proveedor: correo, código y datos de tarjeta o banco. Cada persona paga con su propio medio, como en cualquier compra online." },
      caption: { en: "Powered by Banxa → preparing your order", es: "Desarrollado por Banxa → preparando tu pedido" } },
  ],
  trust: [
    { src: TW_SRC, start: 14.5, end: 19,
      title: { en: "Open Trust Wallet and tap \"Fund your wallet\"", es: "Abre True Wallet y toca \"Fund your wallet\"" },
      desc:  { en: "The moment the wallet is ready \"Brilliant, your wallet is ready!\" appears with the green button. Do it right away — no balance, no payment.",
               es: "En cuanto la wallet está lista aparece \"Brilliant, your wallet is ready!\" con el botón verde. Hazlo de una: sin saldo no hay pago." },
      caption: { en: "Wallet ready → Fund your wallet", es: "Wallet lista → Fund your wallet" } },
    { src: TW_SRC, start: 19, end: 25,
      title: { en: "See every payment method", es: "Mira todos los medios de pago" },
      desc:  { en: "Google Pay recommended up top, then bringing balance from Binance or Coinbase, and \"All payment methods\" for card and bank transfer.",
               es: "Google Pay arriba como recomendado, luego traer saldo desde Binance o Coinbase, y \"All payment methods\" para tarjeta y transferencia." },
      caption: { en: "Google Pay · Binance · Coinbase · card", es: "Google Pay · Binance · Coinbase · tarjeta" } },
    { src: TW_SRC, start: 25, end: 32,
      title: { en: "Type the amount", es: "Escribe el monto" },
      desc:  { en: "$50 turns into ~49.4 USDT. Below you pick \"Pay with: Card\" or another method.",
               es: "50 US$ se convierten en ~49,4 USDT. Abajo eliges \"Pay with: Card\" u otro medio." },
      caption: { en: "$50 ≈ 49.4 USDT · Pay with Card", es: "50 USD ≈ 49,4 USDT · Pay with Card" } },
    { src: TW_SRC, start: 29, end: 37,
      title: { en: "Pick the token", es: "Elige el token" },
      desc:  { en: "In \"Select Crypto\" use the Stables tab to only see stablecoins (USDT, USDC): the ones whose price doesn't move.",
               es: "En \"Select Crypto\" usa la pestaña Stables para ver solo stablecoins (USDT, USDC): son las que no cambian de precio." },
      caption: { en: "Select Crypto → Stables tab", es: "Select Crypto → pestaña Stables" } },
    { src: TW_SRC, start: 106, end: 114,
      title: { en: "Pick the right network", es: "Elige la red correcta" },
      desc:  { en: "Searching \"usdt\" shows the same token repeated: each row is a different network (look at the small logo above the icon). Pick the same one you'll pick at PNPtv checkout.",
               es: "Al buscar \"usdt\" aparece el mismo token repetido: cada fila es una red distinta (mira el logo pequeño sobre el icono). Escoge la misma que vas a elegir en el checkout de PnP." },
      caption: { en: "USDT on many networks — check the tiny logo", es: "USDT en varias redes — mira el logo pequeño" } },
    { src: TW_SRC, start: 115.5, end: 120,
      title: { en: "Your portfolio, empty at first", es: "Así se ve tu portafolio" },
      desc:  { en: "This is the screen where your balance will show. While the payment is processing Ru$h still shows 0.00. Once the provider releases the purchase (minutes with card), the amount appears here and you can pay in PNPtv.",
               es: "Esta es la pantalla donde aparecerá tu saldo: mientras el pago se procesa tu Ru$h sigue en 0,00. Cuando el proveedor libera la compra (minutos con tarjeta), el monto aparece aquí y ya puedes pagar en PnP." },
      caption: { en: "Empty portfolio → your balance will appear here", es: "Portafolio vacío → aquí aparecerá tu saldo" } },
  ],
};

const PAY_CLIPS: Record<WalletKey, Clip[]> = {
  metamask: [
    { src: TW_SRC, start: 118, end: 127,
      title: { en: "In PNPtv: pick token, network and your wallet", es: "En PnP: elige token, red y tu wallet" },
      desc:  { en: "On the payment screen tap \"Pay with Ru$h\", pick the same token and network you bought, then the MetaMask icon (the orange fox).",
               es: "En la pantalla de pago toca \"Pagar con Ru$h\", elige el mismo token y red que compraste y luego el icono de MetaMask (el zorro naranja)." },
      caption: { en: "PNPtv checkout: Ru$h + MetaMask / Trust Wallet icons", es: "Checkout de PnP: Ru$h + iconos MetaMask / True Wallet" } },
    { src: MM_SRC, start: 236, end: 243,
      title: { en: "NOWPayments shows exact amount and network", es: "NOWPayments muestra monto exacto y red" },
      desc:  { en: "NOWPayments opens with the exact amount (15.98 USDT), the address, the QR and the network. Under \"Deposit with\" the MetaMask fox appears — tap it.",
               es: "Se abre NOWPayments con el monto exacto (15,98 USDT), la dirección, el QR y la red. En \"Deposit with\" aparece el zorro de MetaMask: tócalo." },
      caption: { en: "Send deposit · Deposit with MetaMask", es: "Send deposit · Deposit with MetaMask" } },
    { src: MM_SRC, start: 244, end: 252,
      title: { en: "Confirm the send in MetaMask", es: "Confirma el envío en MetaMask" },
      desc:  { en: "MetaMask opens the confirmation sheet with the source account, destination address and network (BNB Chain). Check the network matches and tap Confirm.",
               es: "MetaMask abre la hoja de confirmación con la cuenta de origen, la dirección de destino y la red (BNB Chain). Revisa que la red coincida y toca Confirmar." },
      caption: { en: "From / To / Network: BNB Chain → Confirm", es: "De / Para / Red: BNB Chain → Confirmar" } },
  ],
  trust: [
    { src: TW_SRC, start: 118, end: 127,
      title: { en: "In PNPtv: pick token, network and your wallet", es: "En PnP: elige token, red y tu wallet" },
      desc:  { en: "On the payment screen tap \"Pay with Ru$h\", pick the same token and network you bought, then the Trust Wallet icon (or MetaMask if that's what you use).",
               es: "En la pantalla de pago toca \"Pagar con Ru$h\", elige el mismo token y red que compraste y luego el icono de True Wallet (o MetaMask si usas esa)." },
      caption: { en: "PNPtv checkout: Ru$h + MetaMask / Trust Wallet icons", es: "Checkout de PnP: Ru$h + iconos MetaMask / True Wallet" } },
    { src: TW_SRC, start: 146.5, end: 151,
      title: { en: "NOWPayments shows exact amount and network", es: "NOWPayments muestra monto exacto y red" },
      desc:  { en: "The exact amount shows (15.98 USDT), the address, the QR and the note \"Send USDT on the BSC blockchain\". Send that amount on that network: less or on another network = payment not credited.",
               es: "Aparece el monto exacto (15,98 USDT), la dirección, el QR y el aviso \"Send USDT on the BSC blockchain\". Envía ese monto por esa red: si mandas menos o por otra red, el pago no se acredita." },
      caption: { en: "Send USDT on the BSC blockchain", es: "Send USDT on the BSC blockchain" } },
    { src: TW_SRC, start: 151, end: 157.5,
      title: { en: "Connect the wallet and confirm", es: "Conecta la wallet y confirma" },
      desc:  { en: "\"Connect Wallet\" opens with your installed wallets — tap Trust Wallet (or MetaMask) and approve the connection and the send in the app.",
               es: "Se abre \"Connect Wallet\" con las wallets instaladas — tocas True Wallet (o MetaMask) y apruebas la conexión y el envío en la app." },
      caption: { en: "Connect Wallet → Continue in Trust Wallet", es: "Connect Wallet → Continue in Trust Wallet" } },
  ],
};

// ── Static data ────────────────────────────────────────────────────────────

const TOKENS: { name: string; short: string; color: string; badge: Record<Lang, string>; badgeBg: string; badgeBorder: string; badgeColor: string; pros: Record<Lang, string> }[] = [
  { name: "USDT (Tether)",  short: "USDT", color: "#26A17B",
    badge: { en: "MOST ACCEPTED", es: "MÁS ACEPTADA" },
    badgeBg: "rgba(94,209,196,.15)", badgeBorder: "rgba(94,209,196,.5)", badgeColor: "#5ED1C4",
    pros: { en: "The stablecoin with the most liquidity, available on almost every network. Always ~$1, so what you buy is what you pay. Safest pick if unsure.",
            es: "La stablecoin con más liquidez y disponible en casi todas las redes. Siempre vale ~1 US$, así que lo que compras es lo que pagas. Es la opción más segura si dudas." } },
  { name: "USDC (Circle)",  short: "USDC", color: "#2775CA",
    badge: { en: "MOST REGULATED", es: "MÁS REGULADA" },
    badgeBg: "rgba(123,97,255,.15)", badgeBorder: "rgba(123,97,255,.5)", badgeColor: "#A78BFA",
    pros: { en: "Also ~$1, backed 1:1 and audited. Usually the best card-purchase rates. The favorite on Solana and Base thanks to rock-bottom fees.",
            es: "También vale ~1 US$, respaldada 1:1 y auditada. Suele tener mejores tasas de compra con tarjeta y es la favorita en Solana y Base por sus comisiones bajísimas." } },
  { name: "ETH (Ethereum)", short: "ETH",  color: "#8C8CF0",
    badge: { en: "PRICE MOVES", es: "PRECIO VARIABLE" },
    badgeBg: "rgba(255,180,84,.15)", badgeBorder: "rgba(255,180,84,.5)", badgeColor: "#FFB454",
    pros: { en: "Useful if you already have it. Its price moves up and down, so the amount you see today may not be enough tomorrow. A stablecoin is nicer for paying.",
            es: "Útil si ya la tienes. Su precio sube y baja, así que el monto que ves hoy puede no alcanzar mañana. Para pagar en PnP conviene más una stablecoin." } },
  { name: "SOL / BNB",      short: "SOL",  color: "#5ED1C4",
    badge: { en: "FAST & CHEAP", es: "RÁPIDAS Y BARATAS" },
    badgeBg: "rgba(34,197,94,.15)", badgeBorder: "rgba(34,197,94,.5)", badgeColor: "#22C55E",
    pros: { en: "Their networks charge cents per transaction, but their price also fluctuates. Nice if you already hold them.",
            es: "Sus redes cobran centavos por transacción, pero su precio también fluctúa. Buena opción cuando ya las tienes en la wallet." } },
];

const NETWORKS: { name: string; note: Record<Lang, string>; fee: string; feeColor: string }[] = [
  { name: "Solana",
    note: { en: "Super fast and very cheap. Ideal for USDC.", es: "Rapidísima y muy barata. Ideal para USDC." },
    fee: "~$0.01", feeColor: "#22C55E" },
  { name: "BNB Smart Chain (BSC)",
    note: { en: "Widely used for USDT. Minimum fee.", es: "Muy usada para USDT. Comisión mínima." },
    fee: "~$0.20", feeColor: "#22C55E" },
  { name: "Base / Polygon",
    note: { en: "Cheap and reliable, a solid middle ground.", es: "Baratas y confiables, buen punto medio." },
    fee: "~$0.10", feeColor: "#5ED1C4" },
  { name: "Ethereum",
    note: { en: "The best-known network but the priciest. Avoid it for small amounts.", es: "La más conocida, pero la más cara. Evítala para montos pequeños." },
    fee: "$2–10",  feeColor: "#EF4444" },
];

const PAY_METHODS: Record<WalletKey, Record<Lang, string[]>> = {
  metamask: {
    en: ["Debit card", "Credit card", "Apple Pay / Google Pay*", "Bank transfer*", "Transak · Banxa · Robinhood"],
    es: ["Tarjeta débito", "Tarjeta crédito", "Apple Pay / Google Pay*", "Transferencia bancaria*", "Transak · Banxa · Robinhood"],
  },
  trust: {
    en: ["Google Pay", "Debit / credit card", "Bank transfer", "From Binance", "From Coinbase"],
    es: ["Google Pay", "Tarjeta débito / crédito", "Transferencia bancaria", "Desde Binance", "Desde Coinbase"],
  },
};

const SAMPLE_WORDS = ["brisa", "oceano", "tigre", "arce", "coral", "plaza", "brasa", "cuarzo", "lunar", "cedro", "vivido", "ambar"];

// ── Shared video load queue (one <video> at a time) ─────────────────────────

const _q: HTMLVideoElement[] = [];
let _loading: HTMLVideoElement | null = null;
let _qTimer: ReturnType<typeof setTimeout> | null = null;

function _loadNext() {
  const v = _q.shift();
  if (!v) { _loading = null; return; }
  _loading = v;
  v.preload = "auto";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v.src = (v as any).__srcWanted;
  v.load();
  if (_qTimer) clearTimeout(_qTimer);
  _qTimer = setTimeout(() => _advanceQueue(v), 4000);
}

function _advanceQueue(v: HTMLVideoElement) {
  if (_loading !== v) return;
  if (_qTimer) { clearTimeout(_qTimer); _qTimer = null; }
  _loading = null;
  _loadNext();
}

function _enqueue(v: HTMLVideoElement) {
  _q.push(v);
  if (!_loading) _loadNext();
}

// ── VideoClip: phone-framed video that loops between [start, end] ────────────

function VideoClip({ src, start, end, caption, lang }: { src: string; start: number; end: number; caption: string; lang: Lang }) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const fbRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    v.muted = true;
    v.loop = true;
    v.controls = true;
    v.playsInline = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vv = v as any;
    vv.__srcWanted = src;
    vv.__start = start;
    vv.__end = end;

    const hideFallback = () => { if (fbRef.current) fbRef.current.style.display = "none"; };
    const primeAndPlay = () => {
      hideFallback();
      if (!vv.__primed) {
        vv.__primed = true;
        try { v.currentTime = start; } catch { /* ignore */ }
      }
      v.play().catch(() => { /* autoplay blocked; user can tap play */ });
    };
    const onTimeUpdate = () => {
      if (v.currentTime >= end || v.currentTime < start - 1) {
        try { v.currentTime = start; } catch { /* ignore */ }
      }
    };
    const onCanPlay = () => { primeAndPlay(); _advanceQueue(v); };
    const onError = () => _advanceQueue(v);

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("loadedmetadata", primeAndPlay);
    v.addEventListener("playing", hideFallback);
    v.addEventListener("loadeddata", hideFallback);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("error", onError);
    _enqueue(v);

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("loadedmetadata", primeAndPlay);
      v.removeEventListener("playing", hideFallback);
      v.removeEventListener("loadeddata", hideFallback);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("error", onError);
    };
  }, [src, start, end]);

  return (
    <div style={{ maxWidth: 250, margin: "0 auto", border: "6px solid #1c1c1c", borderRadius: 24, overflow: "hidden", background: "#000", position: "relative" }}>
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 2, display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 99, background: "rgba(0,0,0,.65)", fontSize: 8, fontWeight: 700, letterSpacing: ".08em", color: "#fff" }}>
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 99, background: "#EF4444", animation: "pnpPulseDot 1.4s ease-in-out infinite" }} />
        {T.inTheApp[lang]}
      </div>
      <video ref={vidRef} style={{ width: "100%", aspectRatio: "412 / 848", objectFit: "cover", display: "block", background: "#000" }} />
      <div ref={fbRef} data-fallback style={{ position: "absolute", inset: 0, background: "#0d0d0d", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#A1A1A3", fontSize: 10, textAlign: "center", padding: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 99, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>▶</div>
        <div style={{ maxWidth: 180, lineHeight: 1.4 }}>{caption}</div>
        <div style={{ opacity: 0.7 }}>{T.tapPlay[lang]}</div>
      </div>
    </div>
  );
}

// ── Setup mocks (Step 2, no video) ──────────────────────────────────────────

function MockCard({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #2A2A2A", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 99, background: "linear-gradient(135deg,#D4007A,#7B61FF)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function MockCreate({ lang, wallet }: { lang: Lang; wallet: WalletMeta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: "12px 0" }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: wallet.grad, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>{wallet.letter}</div>
      <button disabled style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#D4007A,#7B61FF)", color: "#fff", fontSize: 12, fontWeight: 700, opacity: 0.9, cursor: "not-allowed" }}>{T.s2MockCreatePrimary[lang]}</button>
      <button disabled style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "#e5e5e7", fontSize: 12, fontWeight: 500, cursor: "not-allowed" }}>{T.s2MockCreateSecondary[lang]}</button>
    </div>
  );
}

function MockPassword({ lang }: { lang: Lang }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ height: 32, borderRadius: 8, background: "#161616", border: "1px solid #2A2A2A", display: "flex", alignItems: "center", padding: "0 10px", color: "#e5e5e7", letterSpacing: 4, fontSize: 14 }}>••••••••</div>
      <div style={{ height: 32, borderRadius: 8, background: "#161616", border: "1px solid #2A2A2A", display: "flex", alignItems: "center", padding: "0 10px", color: "#e5e5e7", letterSpacing: 4, fontSize: 14 }}>••••••••</div>
      <button disabled style={{ marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#D4007A,#7B61FF)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "not-allowed" }}>{T.s2MockPassCont[lang]}</button>
    </div>
  );
}

function MockPhrase({ lang }: { lang: Lang }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {SAMPLE_WORDS.map((word, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: "#161616", border: "1px solid #2A2A2A", borderRadius: 8, fontSize: 9 }}>
            <span style={{ color: "#6b6b70" }}>{i + 1}.</span>
            <span style={{ color: "#e5e5e7", fontWeight: 500 }}>{word}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 10, color: "#6b6b70", fontStyle: "italic" }}>{T.s2MockPhraseNote[lang]}</p>
    </div>
  );
}

function MockConfirm() {
  const slots = [1, 2, 3];
  const chips = ["oceano", "brasa", "cedro", "plaza"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {slots.map((n) => (
          <div key={n} style={{ width: 52, height: 28, borderRadius: 6, border: "1.5px dashed #3a3a3a" }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {chips.map((w) => (
          <span key={w} style={{ padding: "5px 10px", borderRadius: 99, background: "#161616", border: "1px solid #2A2A2A", color: "#c9c9cc", fontSize: 10 }}>{w}</span>
        ))}
      </div>
    </div>
  );
}

// ── Callouts ────────────────────────────────────────────────────────────────

function Callout({ tone, label, children }: { tone: "tip" | "warn" | "info" | "gold"; label: string; children: React.ReactNode }) {
  const palette = {
    tip:  { border: "#FFB454", bg: "rgba(255,180,84,.10)",  color: "#FFB454" },
    warn: { border: "#EF4444", bg: "rgba(239,68,68,.10)",   color: "#FF9B9B" },
    info: { border: "#7B61FF", bg: "rgba(123,97,255,.10)",  color: "#A78BFA" },
    gold: { border: "#FFB454", bg: "rgba(255,180,84,.10)",  color: "#FFB454" },
  }[tone];
  return (
    <div style={{ borderLeft: `3px solid ${palette.border}`, background: palette.bg, borderRadius: 8, padding: "10px 12px" }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: palette.color }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#e5e5e7", lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

// ── Main wizard ─────────────────────────────────────────────────────────────

export function CryptoOnboardingWizard({
  lang,
  onConfirm,
  onSkip,
}: {
  lang: Lang;
  /** When provided, adds a "Ready — Start Payment →" CTA + a "Skip guide" link.
   *  Used by the paywall auto-launch modal to hand control back to the NP flow. */
  onConfirm?: () => void;
  onSkip?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [walletKey, setWalletKey] = useState<WalletKey | null>(null);
  const [rewarded, setRewarded] = useState<boolean | null>(null);
  const loadedRef = useRef(false);
  const completeRef = useRef(false);

  // Resume server-side progress (only jumps forward).
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    getCryptoGuideStatus().then((s) => {
      // Already completed on a previous visit — skip the auto-complete effect
      // so re-opening the wizard doesn't hammer the endpoint on every mount.
      if (s.completedAt) {
        completeRef.current = true;
        setRewarded(!!s.rewardGrantedAt);
      }
      const svc = Number(s.progressStep || 0);
      // Old data may go up to 7 (previous 8-screen wizard). Cap to 5.
      const target = Math.max(1, Math.min(5, svc)) as 1 | 2 | 3 | 4 | 5;
      if (target > step) setStep(target);
    }).catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist step forward.
  useEffect(() => {
    if (!loadedRef.current) return;
    saveCryptoGuideProgress(step).catch(() => { /* ignore */ });
  }, [step]);

  // Fire completion once when the user lands on step 5.
  useEffect(() => {
    if (step !== 5 || completeRef.current) return;
    completeRef.current = true;
    completeCryptoGuide().then((r) => setRewarded(!!r.rewarded)).catch(() => { /* ignore */ });
  }, [step]);

  const wallet = walletKey ? WALLET_META[walletKey] : null;
  const pickedInstall = walletKey ? WALLETS[walletKey] : null;

  const go = (n: 1 | 2 | 3 | 4 | 5) => setStep(n);
  const goBack = () => {
    if (step === 2) { setWalletKey(null); setStep(1); return; }
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5);
  };
  const goNext = () => {
    if (step === 5) { setStep(1); setWalletKey(null); return; }
    if (step === 1 && !walletKey) return;
    setStep((s) => Math.min(5, s + 1) as 1 | 2 | 3 | 4 | 5);
  };
  const pickWallet = (k: WalletKey) => { setWalletKey(k); setStep(2); };
  const goDot = (n: 1 | 2 | 3 | 4 | 5) => { if (n === 1 || walletKey) setStep(n); };

  const nextBg = step === 5 ? "linear-gradient(90deg,#2DD4BF,#22D3EE)" : "linear-gradient(135deg,#D4007A,#7B61FF)";
  const nextColor = step === 5 ? "#04252b" : "#fff";
  const nextLabel = step === 5 ? T.startOver[lang] : (step === 1 ? T.pickAWallet[lang] : T.nextStep[lang]);
  const nextDisabled = step === 1 && !walletKey;

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "12px 0 60px", color: "#fff", fontFamily: "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace", background: "transparent" }}>
      <style>{`@keyframes pnpPulseDot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.55; } }`}</style>

      {/* ── Chrome ─────────────────────────────────────────────────── */}
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "#D4007A" }}>{T.eyebrow[lang]}</p>
      <h1 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>{T.title[lang]}</h1>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#A1A1A3", lineHeight: 1.6 }}>{T.subtitle[lang]}</p>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>
          {T.stepOf[lang](step)} · <span style={{ color: "#A1A1A3", fontWeight: 500 }}>{T.stepTitle[lang][step]}</span>
        </p>
        <div style={{ height: 5, borderRadius: 99, background: "#1E1E1E", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${step * 20}%`, borderRadius: 99, background: "linear-gradient(90deg,#D4007A,#7B61FF)", transition: "width .3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          {([1, 2, 3, 4, 5] as const).map((n) => {
            const state = n === step ? "current" : n < step ? "done" : "pending";
            const bg = state === "current" ? "linear-gradient(135deg,#D4007A,#7B61FF)" : state === "done" ? "rgba(212,0,122,.2)" : "#1E1E1E";
            const color = state === "current" ? "#fff" : state === "done" ? "#FF4DA6" : "#6b6b70";
            const disabled = n !== 1 && !walletKey;
            return (
              <button key={n} onClick={() => goDot(n)} disabled={disabled}
                style={{ flex: 1, height: 28, borderRadius: 99, background: bg, color, fontSize: 11, fontWeight: 700, border: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        {step === 1 && <Step1 lang={lang} pick={pickWallet} />}
        {step === 2 && wallet && <Step2 lang={lang} wallet={wallet} install={pickedInstall} />}
        {step === 3 && wallet && <Step3 lang={lang} wallet={wallet} />}
        {step === 4 && wallet && <Step4 lang={lang} wallet={wallet} />}
        {step === 5 && <Step5 lang={lang} rewarded={rewarded} />}
      </div>

      {/* ── Footer nav ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
        <button onClick={goBack} disabled={step === 1}
          style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "#161616", color: "#e5e5e7", fontSize: 13, fontWeight: 600, cursor: step === 1 ? "not-allowed" : "pointer", opacity: step === 1 ? 0.35 : 1, fontFamily: "inherit" }}>
          {T.back[lang]}
        </button>
        <button onClick={goNext} disabled={nextDisabled}
          style={{ flex: 2, padding: "12px 14px", borderRadius: 10, border: "none", background: nextBg, color: nextColor, fontSize: 13, fontWeight: 700, cursor: nextDisabled ? "not-allowed" : "pointer", opacity: nextDisabled ? 0.35 : 1, fontFamily: "inherit" }}>
          {nextLabel}
        </button>
      </div>

      {onConfirm && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onConfirm}
            style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2DD4BF,#22D3EE)", color: "#04252b", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
          >
            {T.readyStartPay[lang]}
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              style={{ width: "100%", padding: "8px 14px", borderRadius: 10, border: "none", background: "transparent", color: "#8E8E93", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
            >
              {T.skipGuide[lang]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 1 ──────────────────────────────────────────────────────────────────

function Step1({ lang, pick }: { lang: Lang; pick: (k: WalletKey) => void }) {
  return (
    <>
      <Card>
        <p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.7 }}>{T.s1Intro[lang]}</p>
      </Card>
      {(["trust", "metamask"] as const).map((k) => {
        const w = WALLET_META[k];
        return (
          <button key={k} onClick={() => pick(k)}
            style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 16, borderRadius: 14, background: "#161616", border: "1px solid #2A2A2A", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "border-color .2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#7B61FF")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A2A")}>
            <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 10, background: w.grad, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>{w.letter}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>{w.name}</p>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "#5ED1C4" }}>{w.tag[lang]}</span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{w.desc[lang]}</p>
            </div>
          </button>
        );
      })}
      <Callout tone="tip" label={T.s1TipLabel[lang]}>{T.s1TipBody[lang]}</Callout>
    </>
  );
}

// ── Step 2 ──────────────────────────────────────────────────────────────────

function Step2({ lang, wallet, install }: { lang: Lang; wallet: WalletMeta; install: typeof WALLETS[WalletKey] | null }) {
  return (
    <>
      <Card>
        <p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.7 }}>
          {T.s2Head[lang]}<b style={{ color: "#fff" }}>{wallet.name}</b>{T.s2WhyNoVideo[lang]}
        </p>
      </Card>
      {install && (
        <Card>
          <p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.7 }}>{T.s2InstallHint[lang]}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <StoreLink href={install.ios}     label="App Store" />
            <StoreLink href={install.android} label="Google Play" />
            <StoreLink href={install.chrome}  label="Chrome Web Store" />
          </div>
        </Card>
      )}
      <MockCard n={1} title={T.s2MockCreateT[lang]}  desc={T.s2MockCreateD[lang]}><MockCreate lang={lang} wallet={wallet} /></MockCard>
      <MockCard n={2} title={T.s2MockPassT[lang]}    desc={T.s2MockPassD[lang]}><MockPassword lang={lang} /></MockCard>
      <MockCard n={3} title={T.s2MockPhraseT[lang]}  desc={T.s2MockPhraseD[lang]}><MockPhrase lang={lang} /></MockCard>
      <MockCard n={4} title={T.s2MockConfirmT[lang]} desc={T.s2MockConfirmD[lang]}><MockConfirm /></MockCard>
      <Callout tone="warn" label={T.s2RedLabel[lang]}>{T.s2RedBody[lang]}</Callout>
    </>
  );
}

function StoreLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "#0d0d0d", border: "1px solid #2A2A2A", color: "#fff", fontSize: 12, textDecoration: "none", fontFamily: "inherit" }}>
      <span>{label}</span>
      <span style={{ color: "#A78BFA" }}>↗</span>
    </a>
  );
}

// ── Step 3 ──────────────────────────────────────────────────────────────────

function Step3({ lang, wallet }: { lang: Lang; wallet: WalletMeta }) {
  const clips = BUY_CLIPS[wallet.key];
  return (
    <>
      <Card>
        <p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.7 }}>{T.s3Intro[lang]}</p>
      </Card>

      {clips.map((c, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "#161616", border: "1px solid #2A2A2A", borderRadius: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 99, background: "linear-gradient(135deg,#D4007A,#7B61FF)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>{c.title[lang]}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{c.desc[lang]}</p>
            </div>
          </div>
          <VideoClip src={c.src} start={c.start} end={c.end} caption={c.caption[lang]} lang={lang} />
          <p style={{ margin: 0, fontSize: 10, color: "#6b6b70", textAlign: "center" }}>{c.caption[lang]}</p>
        </div>
      ))}

      <h3 style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>{T.s3TokenHeader[lang]}</h3>
      <p style={{ margin: 0, fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{T.s3TokenSub[lang]}</p>
      {TOKENS.map((t) => (
        <div key={t.short} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14, background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12 }}>
          <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 99, background: t.color, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.short}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>{t.name}</p>
              <span style={{ padding: "2px 6px", borderRadius: 99, background: t.badgeBg, border: `1px solid ${t.badgeBorder}`, color: t.badgeColor, fontSize: 8, fontWeight: 700, letterSpacing: ".06em" }}>{t.badge[lang]}</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "#c9c9cc", lineHeight: 1.6 }}>{t.pros[lang]}</p>
          </div>
        </div>
      ))}

      <h3 style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>{T.s3NetworkHeader[lang]}</h3>
      <Card><p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.7 }}>{T.s3NetworkRule[lang]}</p></Card>
      {NETWORKS.map((n) => (
        <div key={n.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: "#161616", border: "1px solid #2A2A2A", borderRadius: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>{n.name}</p>
            <p style={{ margin: "3px 0 0", fontSize: 10, color: "#A1A1A3", lineHeight: 1.5 }}>{n.note[lang]}</p>
          </div>
          <span style={{ alignSelf: "center", fontSize: 12, fontWeight: 700, color: n.feeColor }}>{n.fee}</span>
        </div>
      ))}
      <Callout tone="warn" label="⚠">{T.s3NetworkWarn[lang]}</Callout>

      <h3 style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>{T.s3PayHeader[lang]}</h3>
      <p style={{ margin: 0, fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{T.s3PaySub[lang]}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PAY_METHODS[wallet.key][lang].map((m) => (
          <span key={m} style={{ padding: "6px 12px", borderRadius: 99, background: "#161616", border: "1px solid #2A2A2A", color: "#e5e5e7", fontSize: 10, fontWeight: 500 }}>{m}</span>
        ))}
      </div>

      <h3 style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>{T.s3RateHeader[lang]}</h3>
      <p style={{ margin: 0, fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{T.s3RateSub[lang]}</p>
      <div style={{ padding: 14, background: "rgba(94,209,196,.07)", border: "1px solid rgba(94,209,196,.35)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>Banxa</p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "#5ED1C4" }}>99.78 USDC</p>
          </div>
          <span style={{ padding: "3px 8px", borderRadius: 99, background: "rgba(94,209,196,.25)", color: "#5ED1C4", fontSize: 8, fontWeight: 700, letterSpacing: ".06em" }}>{T.s3RateBest[lang]}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.75 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>Robinhood Connect</p>
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "#A1A1A3" }}>98.52 USDC</p>
          </div>
          <span style={{ padding: "3px 8px", borderRadius: 99, background: "rgba(255,255,255,.10)", color: "#c9c9cc", fontSize: 8, fontWeight: 700, letterSpacing: ".06em" }}>{T.s3RateSafe[lang]}</span>
        </div>
        <p style={{ margin: 0, fontSize: 10, color: "#5ED1C4", fontWeight: 500 }}>{T.s3RateDelta[lang]("1.26 USDC")}</p>
      </div>

      <h3 style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 700, color: "#fff" }}>{T.s3KycHead[lang]}</h3>
      <Card><p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.7 }}>{T.s3KycBody[lang]}</p></Card>
    </>
  );
}

// ── Step 4 ──────────────────────────────────────────────────────────────────

function Step4({ lang, wallet }: { lang: Lang; wallet: WalletMeta }) {
  const clips = PAY_CLIPS[wallet.key];
  return (
    <>
      <Card><p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.7 }}>{T.s4Intro[lang]}</p></Card>
      {clips.map((c, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "#161616", border: "1px solid #2A2A2A", borderRadius: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 99, background: "linear-gradient(135deg,#D4007A,#7B61FF)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>{c.title[lang]}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{c.desc[lang]}</p>
            </div>
          </div>
          <VideoClip src={c.src} start={c.start} end={c.end} caption={c.caption[lang]} lang={lang} />
          <p style={{ margin: 0, fontSize: 10, color: "#6b6b70", textAlign: "center" }}>{c.caption[lang]}</p>
        </div>
      ))}
      <Callout tone="gold" label="✦">{T.s4Callout[lang](T.s4Example[lang])}</Callout>
    </>
  );
}

// ── Step 5 ──────────────────────────────────────────────────────────────────

function Step5({ lang, rewarded }: { lang: Lang; rewarded: boolean | null }) {
  const rows = [T.s5Row1[lang], T.s5Row2[lang], T.s5Row3[lang]];
  return (
    <>
      <div style={{ padding: 20, borderRadius: 14, background: "rgba(45,212,191,.08)", border: "1px solid rgba(45,212,191,.35)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
        <div style={{ width: 42, height: 42, borderRadius: 99, background: "linear-gradient(135deg,#2DD4BF,#22D3EE)", color: "#04252b", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>{T.s5DoneTitle[lang]}</p>
        <p style={{ margin: 0, fontSize: 12, color: "#c9c9cc", lineHeight: 1.6 }}>{T.s5DoneBody[lang]}</p>
      </div>
      {rows.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#161616", border: "1px solid #2A2A2A", borderRadius: 10 }}>
          <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 99, background: "#22C55E" }} />
          <p style={{ margin: 0, fontSize: 12, color: "#e5e5e7" }}>{label}</p>
        </div>
      ))}
      {rewarded && (
        <div style={{ padding: 12, borderRadius: 10, background: "rgba(255,180,84,.10)", border: "1px solid rgba(255,180,84,.35)" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#FFB454", fontWeight: 700 }}>{T.s5RewardLine[lang]}</p>
        </div>
      )}
      <p style={{ margin: "8px 0 0", fontSize: 11, color: "#6b6b70", lineHeight: 1.6 }}>{T.s5FooterNote[lang]}</p>
    </>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, background: "#161616", border: "1px solid #2A2A2A", borderRadius: 14 }}>
      {children}
    </div>
  );
}
