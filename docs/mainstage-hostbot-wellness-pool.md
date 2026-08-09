# Main Stage Host-Bot — Cristina message pool (review)

**Experiment:** 2026-08-09 → 2026-08-12
**Kill switch:** `redis SET pnpapp:mainstage:host_bot:enabled 1` (currently OFF)

Each entry is emitted bilingual as `<ES>  ·  <EN>` in a single chat line. Edit in place, then rebuild bot.

## Wellness (40% weight, 30 msgs)

| # | Español · English |
|---|---|
| 1 | 💧 Recordatorio: hidrátate. Un sorbito ya cuenta. · 💧 Reminder: hydrate. Even one sip counts. |
| 2 | 💜 Estás haciendo bien la noche. Solo por estar aquí. · 💜 You are doing great tonight. Just for being here. |
| 3 | 🧡 Respira profundo 4 seg, suelta 6 seg. Repite 3 veces. · 🧡 Breathe in 4s, out 6s. Repeat 3 times. |
| 4 | ✨ Consent > todo. Pregunta antes, siempre. · ✨ Consent > everything. Always ask first. |
| 5 | 🍊 ¿Cuándo comiste último? Un snack nunca sobra. · 🍊 When did you last eat? A snack is never a bad idea. |
| 6 | 🌙 Chill vibes only. Nadie compite aquí. · 🌙 Chill vibes only. No one is competing here. |
| 7 | 💧 Un vaso de agua entre trago y trago cambia la noche. · 💧 A glass of water between drinks changes the whole night. |
| 8 | 💊 Sabes tu dosis. No mezcles sin saber. Cuídate. · 💊 Know your dose. Don't mix without checking. Take care of you. |
| 9 | 💗 Este espacio es tuyo. Ocupa el lugar que quieras. · 💗 This space is yours. Take up as much room as you want. |
| 10 | 🎧 ¿Cómo va tu noche? Escríbelo en el chat, alguien te lee. · 🎧 How's your night going? Drop it in chat, someone is listening. |
| 11 | 🫶 Recordatorio: no tienes que dar explicaciones a nadie. · 🫶 Reminder: you owe no explanations to anyone. |
| 12 | 🌈 Aquí puedes ser tú sin filtros. Bienvenido. · 🌈 You can be yourself here, no filters. Welcome. |
| 13 | 💧 Tres respiraciones antes de responder algo intenso. · 💧 Three breaths before you reply to anything heavy. |
| 14 | 🕯️ Si algo se siente raro, sal. Volvemos cuando quieras. · 🕯️ If something feels off, step out. Come back when ready. |
| 15 | 💜 No estás solo/a en esto. Somos comunidad. · 💜 You are not alone in this. We are community. |
| 16 | 🍇 Comer algo antes de spinnear ayuda un montón. · 🍇 Eating something before you spin helps a lot. |
| 17 | ☀️ Mañana también existe. Cuida el ritmo hoy. · ☀️ Tomorrow exists too. Pace yourself tonight. |
| 18 | 🎈 Un cumplido genuino cambia el mood de alguien. Suéltalo. · 🎈 A real compliment shifts someone's mood. Drop one. |
| 19 | 💧 Recordatorio silencioso: tomar agua no es cringe. · 💧 Silent reminder: drinking water is not cringe. |
| 20 | 🧊 Si suda mucho, mineral+agua. Electrolitos > energéticas. · 🧊 If you are sweating a lot, salt+water. Electrolytes > energy drinks. |
| 21 | 💗 Los límites son sexys. Ponerlos también. · 💗 Boundaries are hot. Setting them is too. |
| 22 | 🎶 ¿Qué canción te tiene hoy? Compártela. · 🎶 What song has you tonight? Drop it. |
| 23 | 🌿 Pausa 60 seg. Mira algo lejos. Vuelve. · 🌿 60-second pause. Look at something far away. Come back. |
| 24 | 💜 Ser vulnerable es fuerza. Aquí no juzgamos. · 💜 Being vulnerable is strength. No judgment here. |
| 25 | 🫁 Recordatorio de aire. Inhala. Exhala. Otra. · 🫁 Breath check. Inhale. Exhale. One more. |
| 26 | ⏰ Si llevas 3+ h despierto sin agua, ahí está tu señal. · ⏰ 3+ h up with no water? That's your sign. |
| 27 | 🎁 Regalar un tip anima a que sigan streaming. Poquito hace mucho. · 🎁 A tiny tip keeps a stream alive. Small = huge. |
| 28 | 🧠 Nadie te va a juzgar por lo que sientes. Escríbelo o guárdalo, tu call. · 🧠 No one will judge what you feel. Post it or keep it — your call. |
| 29 | 💫 Que la noche sea lenta, larga y bonita. · 💫 May your night be slow, long and beautiful. |
| 30 | 🤝 Si necesitas hablar con alguien, escribe a soporte. Siempre hay alguien. · 🤝 If you need to talk, message support. Someone is always there. |

## Tip nudges (30% weight)

Rotate — `{name}` substituted with the current spotlight cammer's `first_name || username`.

| # | Español · English |
|---|---|
| 1 | 💎 {name} está poniéndolo bien — mándale unos tokens · 💎 {name} is putting on a show — throw some tokens their way |
| 2 | 🔥 Muestra amor por {name} con un tip · 🔥 Show love for {name} with a tip |
| 3 | 💸 Un tip a {name} = más tiempo en cámara. Ayúdalos a quedarse. · 💸 A tip for {name} = more time on cam. Help them stay. |
| 4 | 🌟 {name} merece un chispazo. ¿Te animas? · 🌟 {name} deserves a spark. Wanna send one? |
| 5 | 💜 Si te está gustando lo de {name}, díselo con tokens. · 💜 If you're into what {name} is doing, tell them with tokens. |

**Cinema-mode fallback** (no spotlight cammer):

| # | Español · English |
|---|---|
| 1 | 💎 ¿Buen video? Mándale unos tokens a Santino, es el host. · 💎 Enjoying the show? Tip Santino, he's the host. |
| 2 | 🍿 Cinema mode — deja unos tokens si te está gustando. · 🍿 Cinema mode — drop some tokens if you're into it. |
| 3 | 🎬 Un tip mantiene la programación viva. Aporta si puedes. · 🎬 Tips keep the schedule alive. Help out if you can. |

**CTA:** "Send tip · Enviar tip" → opens tip sheet.

## Booking nudges (30% weight)

Rotate — `{name}` = random active performer with `is_available=true`.

| # | Español · English |
|---|---|
| 1 | 📞 ¿Quieres privado con {name}? Reserva 15 min → · 📞 Wanna go private with {name}? Book 15 min → |
| 2 | 🔒 {name} está aceptando llamadas. Agenda ahora. · 🔒 {name} is accepting calls right now. Book one. |
| 3 | 🎯 Una llamada 1-a-1 con {name} — reserva tu slot · 🎯 A 1-on-1 with {name} — grab your slot |
| 4 | 💗 Momento privado con {name}? 15 min es un buen inicio. · 💗 Private time with {name}? 15 min is a great start. |

**CTA:** "Book · Reservar" → `/c/{username}?action=book&duration=15&utm_source=mainstage_hostbot`

## Guardrails

- **Cadence:** ~5 min ± 60s jitter
- **Skip if:** viewers < 3 OR ≥ 5 human msgs in the last 60s
- **Kill switch:** OFF by default. Enable with `redis-cli SET pnpapp:mainstage:host_bot:enabled 1`; disable with `SET ... 0`
- **A/B split:** 50/50 (change with `redis-cli SET pnpapp:mainstage:host_bot:ab_split 30`)
- **Bucket A** sees the msgs; **Bucket B** never does. Assignment is deterministic via `sha1(user_id) % 100`.

## Operator commands

```bash
# Enable
docker exec redis-pnptv redis-cli -a "$REDIS_PASSWORD" SET pnpapp:mainstage:host_bot:enabled 1

# Disable (kill switch)
docker exec redis-pnptv redis-cli -a "$REDIS_PASSWORD" SET pnpapp:mainstage:host_bot:enabled 0

# Change A/B split (e.g. 30% see msgs)
docker exec redis-pnptv redis-cli -a "$REDIS_PASSWORD" SET pnpapp:mainstage:host_bot:ab_split 30

# Analyze at end of window
docker exec pnptv-bot node apps/backend/scripts/ab-mainstage-hostbot-analysis-2026-08-12.js
```
