# Ru$h 💎 Launch Communications Kit

Everything you need to announce Ru$h — the new internal currency of PNPtv!

---

## 1. Launch Email — Members (EN)

**Subject:** Meet Ru$h 💎 — your new PNPtv! wallet

Hi %FIRST_NAME%,

Something big just landed at PNPtv!: **Ru$h 💎** — our brand-new in-house currency.

Ru$h is how you'll pay for the things you love inside PNPtv! from now on. One place, one balance, one currency to rule them all.

**Why Ru$h?**
- 💎 **One wallet for everything** — memberships, tips, private calls, exclusive channels, content packs
- 💎 **Bulk savings** — buy 6,000 Ru$h and get **900 extra free** (15% bonus). Buy 30,000 and get **7,500 extra** (25% bonus)
- 💎 **Simple math** — 1 USD = 6 Ru$h 💎. Always.
- 💎 **Instant** — no waiting for card holds or crypto confirmations once your Ru$h is in your wallet

**Get your first Ru$h**
Tap the 💎 icon in your wallet and pick a pack. Pay with crypto (many options), Meru card/bank, or activation code.

**What's changing?**
Nothing you had before is lost — your existing token balance is now Ru$h 💎. Same balance, better name, more places to use it.

See you inside,
**PNPtv! Team**

---

## 2. Launch Email — Members (ES)

**Asunto:** Conoce Ru$h 💎 — tu nueva billetera PNPtv!

Hola %FIRST_NAME%,

Algo grande acaba de llegar a PNPtv!: **Ru$h 💎** — nuestra nueva moneda interna.

Ru$h es la forma en que pagarás por todo lo que amas dentro de PNPtv! Una billetera, un saldo, una moneda para gobernarlas a todas.

**¿Por qué Ru$h?**
- 💎 **Una billetera para todo** — membresías, propinas, llamadas privadas, canales exclusivos, contenido premium
- 💎 **Ahorros por volumen** — compra 6,000 Ru$h y recibe **900 extra gratis** (15% de bono). Compra 30,000 y recibe **7,500 extra** (25%)
- 💎 **Matemática simple** — 1 USD = 6 Ru$h 💎. Siempre.
- 💎 **Instantáneo** — sin esperas de tarjetas o confirmaciones cripto una vez que tienes Ru$h en tu billetera

**Consigue tus primeros Ru$h**
Toca el ícono 💎 en tu billetera y elige un paquete. Paga con cripto, tarjeta/PSE vía Meru, o código de activación.

**¿Qué cambia?**
Nada de lo que tenías se pierde — tu saldo actual de tokens ahora es Ru$h 💎. Mismo saldo, mejor nombre, más lugares donde usarlo.

Nos vemos adentro,
**Equipo PNPtv!**

---

## 3. Launch Email — Creators (EN)

**Subject:** Creators, meet Ru$h 💎 — spend it, tip with it, or cash it out

Hi %FIRST_NAME%,

You already earn from fans on PNPtv!. Now you have more control over what happens to those earnings.

**Introducing Ru$h 💎** — our new internal currency, and your new options as a creator:

**1. Withdraw to USDT (crypto cashout)**
Same as before but cleaner: request a payout of $50+ in USDT-TRC20 to your wallet. Admin-reviewed, usually paid within 72 hours.

**2. Convert to spendable Ru$h 💎 (NEW)**
Turn your earned USD into Ru$h 💎 at 1:1 (so $100 earnings = 600 Ru$h). Use it inside PNPtv! to:
- 💎 Book private calls with other performers
- 💎 Tip creators you love
- 💎 Buy exclusive content from other creators
- 💎 Upgrade your own PRIME membership

**Why we built this**
Because you shouldn't have to leave the platform to enjoy it. Your fans support you here — now you can support each other here, without touching a bank.

**Full audit trail**
Every Ru$h you earn, spend, or receive is logged. You can see your history any time from your dashboard.

Questions? Reply to this email.

**PNPtv! Team**

---

## 4. Launch Email — Creators (ES)

**Asunto:** Creadores, conozcan Ru$h 💎 — úsenlo, den propinas, o retírenlo

Hola %FIRST_NAME%,

Ya ganas con tus fans en PNPtv!. Ahora tienes más control sobre lo que haces con esas ganancias.

**Presentamos Ru$h 💎** — nuestra nueva moneda interna, y tus nuevas opciones como creador/a:

**1. Retirar en USDT (cripto cashout)**
Igual que antes pero más limpio: solicita un retiro de $50+ en USDT-TRC20 a tu billetera. Revisado por admin, usualmente pagado en 72 horas.

**2. Convertir a Ru$h 💎 gastable (NUEVO)**
Convierte tus ganancias en USD a Ru$h 💎 al 1:1 ($100 = 600 Ru$h). Úsalo dentro de PNPtv! para:
- 💎 Reservar llamadas privadas con otros performers
- 💎 Dar propinas a creadores que amas
- 💎 Comprar contenido exclusivo de otros
- 💎 Renovar tu propia membresía PRIME

**Por qué lo construimos**
Porque no deberías tener que salir de la plataforma para disfrutarla. Tus fans te apoyan aquí — ahora pueden apoyarse entre ustedes aquí, sin pasar por un banco.

**Trazabilidad completa**
Cada Ru$h que ganas, gastas o recibes queda registrado. Puedes ver tu historial en cualquier momento desde tu panel.

¿Preguntas? Responde este correo.

**Equipo PNPtv!**

---

## 5. AnnouncementStrip Entry (in-app banner)

Add to `apps/web/src/components/AnnouncementStrip.tsx` UPDATES list:

```ts
{
  id: 'rush-launch-2026-08',
  emoji: '💎',
  en: 'Ru$h is here! Meet PNPtv!\'s new in-house currency — bulk bonuses up to +25% Ru$h.',
  es: '¡Llegó Ru$h! Conoce la nueva moneda interna de PNPtv! — bonos por volumen hasta +25% Ru$h.',
  href: '/wallet',
  startsAt: '2026-08-03T00:00:00Z',
  endsAt: '2026-09-03T00:00:00Z',
}
```

---

## 6. FAQ (help doc / support macro)

**Q: What is Ru$h 💎?**
A: Ru$h is PNPtv!'s internal currency. It replaces "tokens" with a friendlier, more flexible unit you can use across the whole platform.

**Q: Are my old tokens gone?**
A: No — everything you had is now Ru$h 💎 at the same value. Nothing changed except the name.

**Q: What can I buy with Ru$h?**
A: Memberships, tips, private calls with performers, exclusive channels, media packs, content bundles, and gifts to other users.

**Q: How much does Ru$h cost?**
A: 1 USD = 6 Ru$h 💎. Bulk packs give you bonus Ru$h — up to +25% extra at the 30,000 tier.

**Q: How do I buy Ru$h?**
A: Open your wallet, tap 💎, and pick a pack. Pay with crypto (BTC, USDT, USDC, DASH, LTC, more), Meru card/bank, or an activation code.

**Q: I'm a creator. How do I cash out?**
A: Two options. **(1) Withdraw** — request a USDT payout to your crypto wallet, minimum $50, admin-approved. **(2) Convert to spendable Ru$h** — keep the value inside PNPtv! and spend it on other creators.

**Q: Can I gift Ru$h to a friend?**
A: Yes — from your wallet, tap "Send Ru$h" and pick a recipient.

**Q: Is there a limit on Ru$h I can hold?**
A: No cap. Buy as much as you want. The bulk bonus tops out at the 30,000 pack (+7,500 free).

**Q: How do I see my Ru$h history?**
A: In your wallet under "Recent activity" — every credit, spend, tip, and purchase is listed with source and date.

**Q: Are refunds paid in Ru$h?**
A: Refunds for Ru$h purchases go back in Ru$h. Refunds for USD purchases (memberships bought with card/crypto directly) go back the way you paid.

---

## 7. Telegram Broadcast (short)

**EN:**
> 💎 **Ru$h has arrived.**
>
> PNPtv!'s new in-house currency is live. One wallet for memberships, tips, calls, exclusive content — everything.
>
> Bulk buy bonuses up to +25% Ru$h. Creator cash-out to USDT, or spend it inside PNPtv! on other performers.
>
> Your old tokens are now Ru$h 💎 at the same value. See you in the wallet.

**ES:**
> 💎 **Llegó Ru$h.**
>
> La nueva moneda interna de PNPtv! ya está viva. Una billetera para membresías, propinas, llamadas, contenido exclusivo — todo.
>
> Bonos por volumen hasta +25% Ru$h. Los creadores pueden retirar en USDT o gastarlo dentro de PNPtv! con otros performers.
>
> Tus tokens antiguos ahora son Ru$h 💎 al mismo valor. Nos vemos en la billetera.

---

## 8. Talking points for support / DMs

- Ru$h is a **rebrand + upgrade** of the token system, not a replacement of currency you already own.
- Balances are **preserved 1:1** — nothing lost.
- **1 USD = 6 Ru$h 💎** — same rate as before.
- **Bulk bonuses:** pkg_500 = +15% bonus, pkg_1000 = +15%, pkg_5000 = +25%.
- Creators get **two new exits**: withdraw to USDT ($50 minimum), or convert earnings 1:1 to spendable Ru$h.
- Every Ru$h movement is **audit-tracked in a ledger** — full transparency.
