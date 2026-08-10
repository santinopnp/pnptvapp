# BRIEF · PNPtv Wallet + Ru$h — Interactive Tutorial Video

## Contexto (para vos, no aparece en el video)

PNPtv es una plataforma de contenido adulto para la comunidad PNP queer. Acabamos de lanzar **PNP Wallet + Ru$h 💎** — billetera self-custody + moneda interna — porque los métodos de pago tradicionales (tarjetas, PayPal, bancos) rechazan sistemáticamente cargos adultos y filtran metadata bochornosa en los statements. Este video es un **tutorial interactivo tap-to-advance** para bajar la fricción de onboarding y educar en un solo lugar. Va a X, IG Stories, TikTok, y como embed en pnptv.app/wallet.

## Deliverable

- **Formato**: video-carousel interactivo, **9:16 vertical**, ~15-19 pantallas (~2 min total si el usuario tapea a ritmo normal)
- **Modo**: cada pantalla requiere **tap/swipe del usuario para avanzar** — no auto-play. Progress bar arriba (X/Y). Swipe atrás permitido.
- **Idioma**: **inglés primero**, versión española paralela (todo lo que digo abajo entre paréntesis con "ES:" es el equivalente en castellano).
- **Duración por pantalla**: 4-8 segundos de contenido visible + espera indefinida del tap.

## Voz y estética

- **Tono**: cálido, confiado, sin hedging. Habla directo al usuario ("you", "tú/vos"). Nada corporativo. Ver referencia: `apps/web/src/components/payments/PayInWalletChips.tsx` líneas 155-180 (`WalletCheckoutHero`) para el registro exacto de nuestra copy.
- **NO decir**: "revolutionary", "seamless", "empowering", "financial freedom". Nada de buzzwords crypto-bro.
- **Sí decir**: real problems ("cards get declined"), real solutions ("one tap"), specific numbers ("1 USD = 6 Ru$h").
- **Marketing policy — lead with DESIRE, never fear**: nunca abrir con "tu tarjeta va a ser rechazada" o "tu banco te va a delatar" como amenaza. Abrí con lo que el usuario quiere (ver a su creator favorito, comprar contenido, tip en vivo). El problema viene después como obstáculo entre él y su deseo, no como miedo intrínseco.
- **Colores brand**: magenta `#D4007A`, orange `#E69138`, emerald `#10b981`, sobre fondo negro profundo `#13101A`. Usar los mismos gradientes que aparecen en el widget 💎.
- **Fuentes**: tipografía punk-elegante, no corporate sans-serif. Peso bold para hooks, regular para explicaciones.
- **Style visual**: mezcla de (a) screen recordings reales del widget en pnptv.app, (b) motion typography con las frases hook, (c) illustraciones simples/planas para conceptos abstractos (self-custody, cross-chain). NO stock footage de "gente diversa mirando el celular sonriendo".

## Estructura narrativa — Insight → Problem → Solution → Attribute

### Sección 1 — Hook (Pantallas 1-3)

**Pantalla 1** (Insight / Deseo — 4 seg):
> "You've been watching him for weeks. Tonight, you want to book that private call."
>
> (ES: "Llevás semanas mirándolo. Esta noche querés bookearle esa llamada privada.")
>
> Visual: screen recording de un profile de creator en pnptv.app, dedo apuntando al botón "Book Call".
>
> [Tap to continue → animated pulse en el CTA]

**Pantalla 2** (Problem — 6 seg):
> "But your card gets declined. Or your bank flags the charge. Or the statement shows something you'd rather not explain."
>
> (ES: "Pero tu tarjeta es rechazada. O el banco te bloquea el cargo. O el statement dice algo que preferís no explicar.")
>
> Visual: mockup de tarjeta con símbolo de "declined" animándose. Zoom out revela statement bancario con línea censurada.
>
> [Tap: "Ugh, yeah" / "Sí me pasa"]

**Pantalla 3** (Solution intro — 5 seg):
> "That's why we built **PNP Wallet + Ru$h 💎**. Payments made for our world."
>
> (ES: "Por eso construimos **PNP Wallet + Ru$h 💎**. Pagos hechos para nuestro mundo.")
>
> Visual: logo 💎 aparece con animación de "unlock". Fondo cambia a gradient magenta-orange.
>
> [Tap: "Show me" / "Contame más"]

### Sección 2 — Por qué crypto (Pantallas 4-5)

**Pantalla 4** (Attribute: por qué crypto — 7 seg):
> "Crypto doesn't care what you're buying. No bank in the middle. No embarrassing statements. Just you paying you, faster than a card ever could."
>
> (ES: "A crypto no le importa qué comprás. Sin bancos en el medio. Sin statements bochornosos. Solo vos pagándote a vos, más rápido que cualquier tarjeta.")
>
> Visual: comparación split-screen — izquierda: tarjeta ↔ banco ↔ merchant ↔ creator (4 pasos, lento, con "?" arriba del banco). Derecha: wallet ↔ creator (1 paso, veloz, gradient verde).
>
> [Tap: "OK, I'm in" / "Ok, dale"]

**Pantalla 5** (Objection handling: "pero yo no sé de crypto" — 6 seg):
> "You don't need to know crypto. No apps to install. No seed phrases to memorize. Just tap a button — we handle the rest."
>
> (ES: "No necesitás saber de crypto. Sin apps que instalar. Sin frases raras que memorizar. Solo tap — nosotros hacemos el resto.")
>
> Visual: screen recording — usuario abre widget 💎 → tap "Create wallet" → wallet lista en 3 segundos.
>
> [Tap: "Nice" / "Perfecto"]

### Sección 3 — Qué es PNP Wallet (Pantallas 6-7)

**Pantalla 6** (What is it — 6 seg):
> "PNP Wallet is your own crypto wallet, built into PNPtv. It's **yours** — we don't own it, we can't touch your money."
>
> (ES: "PNP Wallet es tu propia billetera cripto, integrada dentro de PNPtv. Es **tuya** — nosotros no somos dueños, no podemos tocar tu plata.")
>
> Visual: illustration — usuario sosteniendo una wallet 💎 con candado, logo PNPtv al lado con equis grande sobre el candado ("no tenemos la llave"). Palabra **"self-custody"** aparece grande.
>
> [Tap: "Got it" / "Entendido"]

**Pantalla 7** (Fund with card — el truco es que a pesar de ser cripto, cargás con tarjeta — 7 seg):
> "Fund it with your card, Apple Pay, or Google Pay. Behind the scenes it's crypto — but you never touch it if you don't want to."
>
> (ES: "Cargala con tu tarjeta, Apple Pay o Google Pay. Por atrás es cripto — pero nunca la tocás si no querés.")
>
> Visual: screen recording del botón "💳 Fund with card" → Stripe onramp UI → wallet balance sube de $0 a $30.
>
> [Tap: "Wait, so my card works?" / "Espera, ¿mi tarjeta sí funciona?"]

### Sección 4 — Qué tokens aceptamos (Pantalla 8)

**Pantalla 8** (Tokens — 6 seg):
> "Your wallet holds **USDC** (a stable dollar), **ETH** (the classic), and **Ru$h 💎** (our in-app currency). All on Base — super fast, gas is on us."
>
> (ES: "Tu billetera tiene **USDC** (un dólar estable), **ETH** (el clásico), y **Ru$h 💎** (nuestra moneda interna). Todo en Base — super rápido, el gas lo ponemos nosotros.")
>
> Visual: tres chips iguales al widget — USDC · ETH · Ru$h 💎 — con animación de contador subiendo.
>
> [Tap to continue]

### Sección 5 — Qué es Ru$h (Pantallas 9-10)

**Pantalla 9** (What is Ru$h — 6 seg):
> "Ru$h 💎 is how you tip creators, unlock content, and pay for calls. **1 USD = 6 Ru$h**. Buy them once, spend anywhere on PNPtv."
>
> (ES: "Ru$h 💎 es cómo dás tip a creators, desbloqueás contenido, y pagás llamadas. **1 USD = 6 Ru$h**. Los comprás una vez, gastás donde quieras en PNPtv.")
>
> Visual: gradient magenta-purple con el símbolo 💎 grande centrado. Contador animado: "$10 → 60 💎".
>
> [Tap: "How do I use them?" / "¿Cómo los uso?"]

**Pantalla 10** (Ru$h use cases — 7 seg):
> "Tip your favorite cammer live. Book a private call. Unlock exclusive channels. Upgrade to PRIME. All from one balance."
>
> (ES: "Tipeale a tu cammer favorito en vivo. Bookéa una llamada privada. Desbloqueá canales exclusivos. Subite a PRIME. Todo desde un solo saldo.")
>
> Visual: 4 quick cuts (~1.5 seg cada uno) — cammer recibiendo tip, botón "Book Call" con confetti, channel unlock animation, PRIME badge dorada.
>
> [Tap: "OK, let's go through the FAQ" / "Ok, vamos a las FAQ"]

### Sección 6 — FAQ interactivo (Pantallas 11-19)

Formato: cada FAQ es una pantalla con **la pregunta arriba** (font grande) y **la respuesta directa abajo** (font mediano). Ícono al costado por pregunta.

**FAQ 1 — Wrong network** (7 seg):
> **"What if I send crypto on the wrong network?"**
> ("¿Y si mando cripto en la red equivocada?")
>
> "Relax. PNPtv detects it automatically and shows a one-tap bridge inside your wallet. No support ticket needed."
>
> (ES: "Tranqui. PNPtv lo detecta automático y te muestra un botón para hacer el bridge en un tap. Sin ticket de soporte.")
>
> Visual: screen recording — usuario ve la banda naranja "⚠️ Wrong network?" en el widget → tap → bridge completed. Muy corto (2 seg).
>
> [Tap: "Next" / "Siguiente"]

**FAQ 2 — Cash out** (6 seg):
> **"Can I cash out my crypto back to dollars?"**
> ("¿Puedo sacar la cripto a dólares?")
>
> "Yes. Send USDC or ETH from your PNP Wallet to any exchange (Coinbase, Binance, Kraken) and convert to fiat. Or send to your Trust Wallet / MetaMask — you control your keys."
>
> (ES: "Sí. Enviás tu USDC o ETH desde PNP Wallet a cualquier exchange (Coinbase, Binance, Kraken) y convertís a fiat. O al Trust Wallet / MetaMask — vos controlás tus llaves.")

**FAQ 3 — Ownership** (5 seg):
> **"Does PNPtv own my wallet?"**
> ("¿PNPtv es dueño de mi billetera?")
>
> "**No.** Your wallet, your keys, your money. We can't move your funds even if we wanted to. Self-custody, always."
>
> (ES: "**No.** Tu billetera, tus llaves, tu plata. No podemos mover tus fondos ni queriendo. Self-custody, siempre.")

**FAQ 4 — Access** (5 seg):
> **"Can PNPtv access my money?"**
> ("¿PNPtv puede acceder a mi plata?")
>
> "Never. Only your wallet signs transactions. Even if PNPtv shut down tomorrow, your funds are still yours — on Base, forever."
>
> (ES: "Nunca. Solo tu billetera firma transacciones. Aunque PNPtv cerrara mañana, tus fondos siguen siendo tuyos — en Base, para siempre.")

**FAQ 5 — Refunds** (7 seg):
> **"What about refunds?"**
> ("¿Y los reembolsos?")
>
> "Standard 24-hour refund policy on subscriptions and content. For live tips, private calls and Ru$h that are already spent, refunds aren't possible — same as any live entertainment. Reach out to support if something goes wrong, we'll always talk."
>
> (ES: "Política estándar de 24h para suscripciones y contenido. Los tips en vivo, llamadas privadas y Ru$h ya gastados no tienen reembolso — igual que cualquier entretenimiento en vivo. Si algo sale mal escribinos a soporte, siempre te escuchamos.")

**FAQ 6 — Send to external wallet** (5 seg):
> **"Can I send funds out to another wallet?"**
> ("¿Puedo enviar mis fondos a otra billetera?")
>
> "Yes. Trust Wallet, MetaMask, Coinbase Wallet — copy your address from the 💎 widget and send anywhere on Base or Ethereum."
>
> (ES: "Sí. Trust Wallet, MetaMask, Coinbase Wallet — copiás tu dirección del widget 💎 y enviás a donde quieras en Base o Ethereum.")

**FAQ 7 — How to spend** (7 seg):
> **"How do I actually spend the money?"**
> ("¿Cómo gasto la plata en PNPtv?")
>
> "One tap. Anywhere you see a price on PNPtv — subscribe, tip, book, unlock — pick 'Pay from wallet' and confirm. Under 3 seconds."
>
> (ES: "Un tap. Donde veas un precio en PNPtv — subscribís, tipeás, bookeás, desbloqueás — elegís 'Pay from wallet' y confirmás. Menos de 3 segundos.")

**FAQ 8 — Ru$h → crypto reversal** (NUEVA — 8 seg):
> **"Can I convert Ru$h back to crypto?"**
> ("¿Puedo convertir Ru$h de vuelta a cripto?")
>
> "No. Ru$h 💎 is platform credit — once you buy it, it stays as Ru$h and is only spendable inside PNPtv. Think of it like a gift card. Your USDC and ETH stay crypto and are fully reversible. **Buy Ru$h only for what you plan to spend on the app.**"
>
> (ES: "No. Ru$h 💎 es crédito de la plataforma — una vez que lo comprás, queda como Ru$h y solo se gasta dentro de PNPtv. Pensalo como una gift card. Tu USDC y ETH sí quedan como cripto y son 100% reversibles. **Comprá Ru$h solo por lo que planeás gastar en la app.**")
>
> Visual: split screen — izquierda: USDC/ETH icons con flecha bidireccional (⇄) al mundo cripto. Derecha: Ru$h 💎 con flecha de una sola dirección (→) dentro de la PNPtv app, sin flecha de vuelta. Palabra clave: **"one-way"** aparece sobre el lado del Ru$h.

**FAQ 9 — Privacy** (6 seg):
> **"Is my identity linked to my wallet?"**
> ("¿Mi identidad está pegada a mi billetera?")
>
> "Your on-chain address is public (any wallet's is). But your PNPtv account uses only what you gave us — Telegram, email, or a passkey. No real-name KYC required."
>
> (ES: "Tu dirección on-chain es pública (todas lo son). Pero tu cuenta PNPtv solo usa lo que nos diste — Telegram, email o passkey. No pedimos KYC de nombre real.")

**FAQ 10 — Existing wallet users** (5 seg):
> **"I already have MetaMask / Trust. Can I use it?"**
> ("Ya tengo MetaMask / Trust. ¿La puedo usar?")
>
> "Absolutely. Tap **'+ Connect Trust / MetaMask'** in the widget. Your existing wallet works for every payment on PNPtv."
>
> (ES: "Absolutamente. Tap en **'+ Connect Trust / MetaMask'** en el widget. Tu billetera existente funciona para todo pago en PNPtv.")

**FAQ 11 — Fees** (5 seg):
> **"What are the fees?"**
> ("¿Qué comisiones hay?")
>
> "Gas is free on Base — we sponsor it. Card top-ups have a ~1% fee from the payment provider. Ru$h and PNPtv spending: zero fees."
>
> (ES: "El gas en Base es gratis — lo sponsoreamos. Cargar con tarjeta tiene ~1% del provider de pago. Gastar Ru$h en PNPtv: sin comisión.")

**FAQ 12 — Speed** (5 seg):
> **"How fast are payments?"**
> ("¿Qué tan rápido son los pagos?")
>
> "Ru$h tips: instant. Card top-up: 30 seconds. External withdrawal to your wallet: 5 seconds on Base. Bridging Ethereum → Base: 15 min."
>
> (ES: "Tips en Ru$h: instantáneo. Cargar con tarjeta: 30 seg. Retirar a wallet externa: 5 seg en Base. Bridge Ethereum → Base: 15 min.")

**FAQ 13 — If PNPtv shuts down** (7 seg):
> **"What if PNPtv shuts down someday?"**
> ("¿Qué pasa si PNPtv cierra algún día?")
>
> "Your USDC and ETH are on Base blockchain, not our servers. Export your private key from the widget → import to MetaMask → your funds are still there, forever. Ru$h 💎 is platform-internal though — spend it before then."
>
> (ES: "Tu USDC y ETH están en la blockchain Base, no en nuestros servidores. Exportás tu private key del widget → importás a MetaMask → tus fondos siguen ahí, para siempre. Ru$h 💎 sí es interno de la plataforma — gastalo antes.")

### Sección 7 — CTA Final (Pantalla 20)

**Pantalla 20** (7 seg + CTA):
> "Ready?"
>
> (ES: "¿Listo?")
>
> Visual: fondo gradient magenta → emerald, logo 💎 grande centrado con pulse animation.
>
> **CTA button grande al centro**: "💎 Open my wallet" (ES: "💎 Abrir mi billetera")
>
> Tap del CTA → link a `https://pnptv.app` con auto-open del widget wallet.
>
> Debajo del CTA en font más chico: "Or scan this QR from mobile" con QR code a pnptv.app.

---

## Requerimientos técnicos

- **Formato de export**: MP4 H.264 vertical 1080x1920 + versión square 1080x1080 para X posts + versión landscape 1920x1080 para YouTube shorts.
- **Interactividad**: implementación como **HTML5 + Rive/Lottie/CSS animations** dentro de un container tap-to-advance, o como Storyline/Reveal.js. Debe funcionar embebido en pnptv.app/wallet-tour y como link independiente. Fallback: si el reproductor no soporta interactividad, auto-advance a 6 seg por pantalla.
- **Progress bar**: barra de segmentos arriba estilo Instagram Stories, tap-to-jump entre pantallas visitadas.
- **Analytics hooks**: cada tap debe disparar un evento (screen_view + tap_advance) para poder medir dónde abandonan los usuarios. Compatible con nuestro `/api/webhooks/tester-report` para telemetría.
- **Responsive**: renderiza clean en pantallas de 360x640 (mínimo) hasta 428x926 (iPhone Pro Max).

## Referencia visual de la app real (para grabar screen recordings)

- Widget 💎 en vivo: pnptv.app (necesitás loggearte con cuenta test — te paso credenciales si querés)
- Componentes brand: `apps/web/src/components/payments/PayInWalletChips.tsx`, `apps/web/src/components/mainstage/`, `apps/web/src/pages/Subscribe.tsx`
- Wrong-network bridge en acción: pnptv.app > widget 💎 > banda naranja "¿Wrong network?" (aparece si hay ETH stuck en mainnet)

## Success metrics (para vos, no en el video)

Cuando salga:
1. Completion rate por pantalla (¿dónde abandonan?)
2. Tap-through en el CTA final (goal: >30%)
3. Wallet creations dentro de las 24h post-view (goal: +40% vs baseline)
4. Ru$h purchases dentro de las 72h post-view (goal: +25%)

---

## Notas de iteración

- Si el video sale muy largo, podemos **cortar** las FAQ 9, 11, 12 (privacy, fees, speed) — son buenas pero no bloqueantes.
- Si Claude Design pide referencias adicionales de tono, mostrale `apps/backend/scripts/broadcast-rush-launch-*.js` para copy directa a usuarios.
- Versión ES no es traducción literal — usar el equivalente natural en cada pantalla (los que puse entre paréntesis son borradores, ajustar según flujo).
