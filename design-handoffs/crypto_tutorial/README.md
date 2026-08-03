# Handoff: PnP — Tutorial de criptomonedas (True Wallet / MetaMask)

## Overview
Wizard de 5 pasos, en español, que lleva a un usuario nuevo en cripto desde “no tengo wallet” hasta “pagué en PnP y recibí mi membresía”. Cada paso operativo muestra un **clip real de pantalla en bucle** (segmento recortado de dos grabaciones reales), no capturas estáticas: el usuario ve el movimiento y dónde se toca.

Contenido cubierto: elección de wallet, creación de wallet (recreada en UI porque no se graba por seguridad), compra de cripto dentro de la wallet, por qué varían los proveedores y cuándo piden KYC, cómo elegir la red correcta, comparación de tasas, checkout de PnP con Now Payments (iconos MetaMask / True Wallet) y entrega automática de membresías/llamadas/tokens.

## About the Design Files
`Crypto Tutorial Wizard.dc.html` es una **referencia de diseño creada en HTML** (prototipo de look & behavior), **no** código de producción para copiar tal cual. Usa un runtime propio de plantillas (`support.js`, `<x-dc>`, `sc-if` / `sc-for`, huecos `{{ }}`). Ignora la mecánica del runtime: lee el markup con estilos inline para lo visual y la clase `class Component` (al final del archivo) para estado y comportamiento.

La tarea es **recrear este diseño en el entorno del codebase destino** (React, Vue, React Native, etc.) con sus patrones y librerías. Si no existe frontend, elegir el framework más adecuado.

## Fidelity
**Alta fidelidad.** Colores, tipografía, espaciado, radios y copy en español son intención final. Los dos `.mp4` son material real y deben mantenerse (o reemplazarse por grabaciones nuevas con los mismos momentos).

## Screens / Views
Un solo contenedor: columna centrada, `max-width: 520px`, `padding: 32px 16px 60px`, fondo `#0a0a0a`.

### Chrome del wizard (siempre visible)
- Eyebrow `GETTING STARTED`: 10px, 700, `letter-spacing: .12em`, `#D4007A`
- Título `Cómo pagar en PnP con criptomonedas`: 24px, 700, `#fff`, line-height 1.25
- Subtítulo explicativo: 12px, `#A1A1A3`, line-height 1.6
- Línea de estado `Paso N de 5 · <título del paso>`: 12px, 700, `#fff`
- Barra de progreso: alto 5px, radio 99px, track `#1E1E1E`, fill `linear-gradient(90deg,#D4007A,#7B61FF)`, `width = paso × 20%`, `transition: width .3s`
- 5 dots numerados de 28px: actual = `linear-gradient(135deg,#D4007A,#7B61FF)` + texto `#fff`; completado = `rgba(212,0,122,.2)` + `#FF4DA6`; pendiente = `#1E1E1E` + `#6b6b70`. Clic salta de paso (solo si ya hay wallet elegida)
- Footer: `← Atrás` (flex 1, borde `rgba(255,255,255,.15)`, fondo `#161616`) + botón primario (flex 2, gradiente marca; en paso 5 gradiente teal `linear-gradient(90deg,#2DD4BF,#22D3EE)` con texto `#04252b`). Ambos al 35% de opacidad y deshabilitados en el paso 1.

### Paso 1 — Elige tu wallet
- Card explicativa (`#161616`, borde `#2A2A2A`, radio 14, padding 16): “Una wallet es tu billetera digital”.
- Dos botones-card idénticos (radio 14, padding 16, gap 10): cuadrado de 44px con gradiente de marca de la wallet + nombre 15px/700 + tag 10px/700 `letter-spacing .06em` `#5ED1C4` + descripción 11px `#A1A1A3`.
  - **True Wallet** — gradiente `linear-gradient(135deg,#3375BB,#5FA9EE)`, tag `MEJOR PARA MÓVIL`.
  - **MetaMask** — gradiente `linear-gradient(135deg,#F6851B,#E2761B)`, tag `MEJOR PARA WEB Y NAVEGADOR`.
  - Al tocar: fija la wallet y avanza al paso 2. Hover: borde `#7B61FF`.
- Callout TIP: borde izquierdo 3px `#FFB454`, fondo `rgba(255,180,84,.1)`, radio 8.

### Paso 2 — Instala y créala (UI recreada, sin video)
Cabecera con la wallet elegida + nota de por qué no hay video (privacidad: contraseña y frase secreta). Luego 4 cards numeradas; cada una incluye una **recreación de la pantalla** sobre fondo `#0d0d0d`, borde `#2A2A2A`, radio 12:
1. **Crear wallet** — logo 40px + botón primario “Crear una wallet nueva” + botón secundario “Ya tengo una wallet”.
2. **Contraseña / código** — dos campos de 32px (`#161616`, borde `#2A2A2A`) con `••••••••` (`letter-spacing: 4px`) + botón “Continuar”.
3. **Frase de 12 palabras** — grid `repeat(3,1fr)`, gap 6, chips 9px con índice en `#6b6b70`. Palabras de ejemplo (`brisa, oceano, tigre, arce, coral, plaza, brasa, cuarzo, lunar, cedro, vivido, ambar`) + aviso de que las reales serán distintas.
4. **Confirmar frase** — 3 slots vacíos (52×28, borde discontinuo `#3a3a3a`) + chips pill seleccionables.
- Callout rojo: borde 3px `#EF4444`, fondo `rgba(239,68,68,.1)` — “nadie de PnP pedirá tu frase secreta”.

### Paso 3 — Compra tu cripto
- Card intro: invitar a comprar en cuanto abre la wallet (20–50 US$ para empezar).
- **6 clip-cards** (ver “Clips” abajo), cada una: badge numerado 24px + título 13px/700 + descripción 11px `#A1A1A3` + marco tipo teléfono + caption 10px `#6b6b70` centrado.
- **¿Qué token comprar?** — 4 cards con círculo de 26px, nombre 13px/700, badge pill 8px/700 y párrafo de ventajas: USDT (`#26A17B`, MÁS ACEPTADA), USDC (`#2775CA`, MÁS REGULADA), ETH (`#8C8CF0`, PRECIO VARIABLE), SOL/BNB (`#5ED1C4`, RÁPIDAS Y BARATAS).
- **Elegir la red correcta** — regla de oro (“la red que compras es la red que eliges en PnP”) + 4 filas red/comisión: Solana ~0,01 US$ (`#22C55E`), BSC ~0,20 US$ (`#22C55E`), Base/Polygon ~0,10 US$ (`#5ED1C4`), Ethereum 2–10 US$ (`#EF4444`). Callout rojo de advertencia.
- **Medios de pago** — chips pill según wallet. MetaMask: tarjeta débito, tarjeta crédito, Apple/Google Pay*, transferencia*, “Transak · Banxa · Robinhood”. True Wallet: Google Pay, tarjeta, transferencia, desde Binance, desde Coinbase.
- **Ejemplo de mejor tasa** — card teal (`rgba(94,209,196,.07)`, borde `rgba(94,209,196,.35)`): Banxa 99,78 USDC (MEJOR TARIFA, destacada) vs Robinhood Connect 98,52 USDC (MÁS CONFIABLE); diferencia 1,26 USDC.
- **Desde aquí pagas como siempre** — el proveedor toma la pantalla (correo, código, tarjeta o banco); PnP y la wallet no ven datos bancarios. Bloque KYC: compras pequeñas con tarjeta normalmente sin ID; montos altos, transferencias o ciertos proveedores piden ID + selfie por requisito legal propio; alternativa: bajar el monto o cambiar de proveedor. Tarjeta = minutos, transferencia = horas.

### Paso 4 — Paga en PnP
- Card intro: elegir **Now Payments**, luego el **mismo token y la misma red** que compraste, y tocar el icono de MetaMask o True Wallet.
- 3 clip-cards (ver abajo).
- Callout gold con el ejemplo: compraste USDC en Solana → en PnP eliges USDC (Solana).

### Paso 5 — Entrega automática
- Card teal con check 42px: “Listo — no hay más pasos”.
- 3 filas (`#161616`, borde `#2A2A2A`, radio 10) con punto verde `#22C55E`: membresía se activa sola / llamadas acreditadas / tokens en la cuenta.
- Nota final 11px `#6b6b70`: tarda minutos según la red; si pasa más de una hora, contactar soporte con el Payment ID de NOWPayments.

## Clips (lo esencial de este diseño)
Marco: contenedor `max-width: 250px`, centrado, `border: 6px solid #1c1c1c`, `border-radius: 24px`, `overflow: hidden`, fondo `#000`, `position: relative`.
Video: `width: 100%`, `aspect-ratio: 412/848`, `object-fit: cover`, `muted`, `loop`, `playsInline`, `controls`.
Badge superior izquierdo: pill `rgba(0,0,0,.65)` con punto rojo `#EF4444` que pulsa (`@keyframes pulseDot`, 1.4s) + texto `EN LA APP` 8px/700.
Overlay de fallback (mientras no hay media): fondo `#0d0d0d`, `pointer-events: none`, círculo con ▶ + caption + “Toca play para ver la acción”; se oculta en `loadeddata` / `playing`.
Comportamiento: cada clip apunta al mismo `.mp4` pero reproduce solo su ventana `[start, end]`; en `timeupdate`, si `currentTime >= end` vuelve a `start`. La posición se “ceba” **una sola vez** (flag `__primed`) para no romper el scrub del usuario. La carga se serializa en una cola (un video a la vez, timeout 4s) porque varios `<video>` del mismo archivo en paralelo se quedan en `readyState 0`.

### Ventanas de tiempo (segundos) — verificadas frame a frame
**`assets/truewallet-setup.mp4`** (164 s)
| Uso | Ventana | Qué se ve |
|---|---|---|
| P3 clip 1 | 14.5–19 | “Brilliant, your wallet is ready!” + botón verde Fund your wallet |
| P3 clip 2 | 19–25 | Medios de pago: Google Pay, Binance, Coinbase, All payment methods |
| P3 clip 3 | 25–32 | 50 USD ≈ 49,4 USDT, Pay with Card, teclado, Continue |
| P3 clip 4 | 29–37 | Select Crypto (pestañas All / Top 100 / Stables / Watchlist) |
| P3 clip 5 | 106–114 | Búsqueda “usdt”: mismo token repetido, una fila por red |
| P3 clip 6 | 115.5–120 | Portafolio vacío “Get started by adding some crypto” (0,00) |
| P4 clip 1 (ambas wallets) | 118–127 | Checkout de PnP: tokens USDT/USDC/ETH + iconos MetaMask / Trust Wallet |
| P4 clip 2 (True Wallet) | 146.5–151 | nowpayments.io: 15,98 USDT, dirección, QR, “Send USDT on the BSC blockchain” |
| P4 clip 3 (True Wallet) | 151–157.5 | Connect Wallet (Trust Wallet INSTALLED, MetaMask) → “Continue in Trust Wallet” |

**`assets/metamask-setup.mp4`** (253 s)
| Uso | Ventana | Qué se ve |
|---|---|---|
| P3 clip 1 | 125–132 | “Deposita fondos en tu billetera” + botón Agregar fondos |
| P3 clip 2 | 137–144 | “Selecciona un token” con la lista completa |
| P3 clip 3 | 145–150 | Búsqueda “usdc”: varias filas = varias redes |
| P3 clip 4 | 151–158 | “Comprar USDC en Base”, 100 US$, Debit or Credit |
| P3 clip 5 | 158–163 | Selector de medio de pago |
| P3 clip 6 | 163–168.5 | Proveedores: Banxa 99,78 USDC (mejor tarifa) / Robinhood 98,52 USDC |
| P3 clip 7 | 168.5–178 | “Desarrollado por Banxa” → preparando el pedido (el proveedor toma el control) |
| P4 clip 2 (MetaMask) | 236–243 | NOWPayments “Send deposit”, QR, Deposit with (zorro MetaMask) |
| P4 clip 3 (MetaMask) | 244–252 | Hoja de confirmación de MetaMask: De / Para / Red BNB Chain → Confirmar |

## Interactions & Behavior
- Elegir wallet en el paso 1 → fija `wallet` y salta al paso 2. Todo el contenido de los pasos 2–4 (pasos de setup, clips, medios de pago) es dependiente de `wallet`.
- `← Atrás` desde el paso 2 borra la wallet y vuelve al paso 1; en el resto, `step - 1`.
- Botón primario: `step + 1`; en el paso 5 dice “Empezar de nuevo” y resetea (`step: 1, wallet: null`).
- Dots: navegación directa (bloqueada a paso ≠ 1 si aún no hay wallet).
- Únicas animaciones: `width` de la barra de progreso (.3s) y el punto rojo pulsante de los clips.
- Los clips autoreproducen en silencio y en bucle dentro de su ventana; con `controls` el usuario puede pausar y hacer scrub.

## State Management
```
step: 1..5                  // paso actual
wallet: null | 'true' | 'metamask'
```
Derivados: etiqueta y título del paso, ancho de la barra, estado de los dots, pasos de setup, arrays de clips, chips de medios de pago, textos de la wallet elegida.
Por-video (en el DOM, no en el estado de React): `__start`, `__end`, `__primed`, `__loaded`, `__bound` y la cola de carga.
No hay fetching de datos.

## Design Tokens
- Fondos: app `#0a0a0a`; card `#161616`; card anidada / recreación `#0d0d0d`; bisel de teléfono `#1c1c1c`; negro puro `#000`
- Bordes: `#2A2A2A`; discontinuo `#3a3a3a`
- Texto: primario `#fff`; secundario `#A1A1A3`; apagado `#6b6b70`; cuerpo `#e5e5e7` / `#c9c9cc`
- Marca: rosa `#D4007A` (acento `#FF4DA6`), púrpura `#7B61FF` (acento `#A78BFA`), gradiente `linear-gradient(135deg,#D4007A,#7B61FF)`
- Semánticos: teal `#5ED1C4` / `#2DD4BF` / `#22D3EE` (texto sobre teal `#04252b`), gold `#FFB454`, verde `#22C55E`, rojo `#EF4444`
- Tipografía: **Roboto Mono** 400/500/700 en todo. Escala: 24 / 17 / 16 / 15 / 13 / 12 / 11 / 10 / 9 px
- Radios: cards 14, cards internas 10–12, botones 8–10, pills 99, marco de teléfono 24 (bisel 6px)
- Espaciado: gap entre cards 10–14; padding de cards 14–18; separación entre secciones 22–26

## Assets
- `assets/truewallet-setup.mp4` — grabación real de True Wallet + checkout de PnP + NOWPayments (164 s)
- `assets/metamask-setup.mp4` — grabación real de MetaMask + NOWPayments + confirmación (253 s)
- Fuente: Roboto Mono (Google Fonts)
- Sin imágenes estáticas: todo el material visual sale de los dos videos o son recreaciones en HTML/CSS

## Cómo continuar con Claude Code (CLI)
1. Descarga y descomprime esta carpeta dentro del repo destino.
2. En la raíz del repo: `claude` y luego, por ejemplo:
   `Lee design_handoff_crypto_tutorial/README.md y recrea el wizard en <framework> siguiendo los patrones existentes del repo. Empieza por el chrome del wizard y el paso 1.`
3. Pídele que implemente **un paso por commit** y que reutilice los componentes existentes (cards, botones, callouts) en lugar de crear nuevos.
4. El componente de clip (video con ventana `[start,end]`, cola de carga y `__primed`) conviene extraerlo como componente reutilizable con props `src`, `start`, `end`, `caption`.

## Files
- `Crypto Tutorial Wizard.dc.html` — prototipo completo (markup con estilos inline + `class Component` al final con estado, datos de clips y copy)
- `support.js` — runtime del prototipo (solo para poder abrirlo en el navegador; no portar)
- `assets/metamask-setup.mp4`, `assets/truewallet-setup.mp4`
