# SOBERANÍA TECNOLÓGICA Y GESTIÓN ÉTICA DEL TALENTO:
## Hacia un Nuevo Paradigma de Recursos Humanos en el Trabajo Sexual
### El Caso PNPtv como Modelo de Deber de Cuidado (Duty of Care) Aplicado — Versión con Auditoría Técnica del Repositorio

**Tesis / Trabajo de Investigación — Edición Revisada**  
Preparada con acceso directo al repositorio de código de producción (agosto 2026)

---

## Nota editorial a esta versión

La tesis original (2026) declaraba explícitamente su principal limitación: no tuvo acceso al código fuente de PNPtv y todas las afirmaciones sobre su implementación tecnológica debían leerse como "narrativa declarada por el proyecto, no como hecho técnico verificado." Esta edición revisada corrige esa brecha: el repositorio de producción en `/opt/pnptvapp` fue auditado directamente, permitiendo contrastar cada uno de los principios declarados por PNPtv con los módulos efectivamente desplegados en producción. Los hallazgos transforman la columna "Estado de verificación" de la Tabla 4.4 de su estado anterior (100% declarativo) a un mapa de confirmaciones parciales y brechas identificadas con precisión técnica.

---

## Resumen

Este trabajo examina la reconfiguración de la Administración de Recursos Humanos (RH) cuando se aplica a un sector históricamente excluido de la protección laboral formal: el trabajo sexual. La versión revisada incorpora una auditoría técnica directa del repositorio de producción del proyecto PNPtv, lo que permite reemplazar la hipótesis de coherencia interna formulada en la edición original por evidencia empírica de implementación. Se concluye que PNPtv ha materializado en código los pilares centrales del Deber de Cuidado —verificación de identidad (§ 2257), bienestar por reducción de daño, protección financiera multicadena, moderación de contenido con umbrales contextualizados al PNP y arquitectura de autenticación sin contraseña— mientras mantiene brechas identificadas en geobloqueo por creador, Identidad Autosoberana (SSI/DIDs) y estructura cooperativa formal. Estas brechas no invalidan el modelo; las definen como la agenda de implementación futura con mayor impacto sobre la soberanía del trabajador.

**Palabras clave:** Recursos Humanos, trabajo sexual, Deber de Cuidado, identidad autosoberana, verificación § 2257, bienestar y reducción de daños, PNPtv, descriminalización.

---

## 1. Introducción

### 1.1 Planteamiento del problema

La digitalización de la economía global ha trasladado al ciberespacio una vasta proporción de las relaciones laborales, replicando e intensificando desigualdades estructurales preexistentes. En el trabajo sexual —y, más ampliamente, en la creación de contenido para adultos— esta precarización asume dimensiones de riesgo vital: agresiones físicas, crisis de salud mental, consumo problemático de sustancias y una exposición digital permanente raramente gestionada con instrumentos de cuidado laboral.

La pregunta que estructura este trabajo es la que formuló el equipo fundador de PNPtv como catalizador de su proyecto: ¿cómo se adaptan las herramientas del management corporativo —atracción de talento, onboarding, compensación, seguridad ocupacional— para dignificar, blindar y potenciar la carrera de un trabajador sexual sin traicionar su autonomía?

### 1.2 Metodología y alcance de la revisión técnica

Esta edición revisada emplea análisis de código fuente directo como metodología complementaria al análisis documental de la edición original. Se auditaron los siguientes módulos del repositorio de producción (`/opt/pnptvapp`):

- `apps/backend/services/` — 90+ servicios de negocio
- `apps/backend/bot/api/` — controladores, rutas y middleware
- `apps/backend/config/` — configuración de monetización, acceso y moderación
- `apps/web/src/pages/` — interfaz de usuario, páginas de bienestar y onboarding
- `apps/backend/models/` — modelos de datos y esquemas

El análisis distingue entre: (a) **implementado y verificado en código**, (b) **arquitectura declarada con dependencia de credenciales de entorno** y (c) **no implementado / brecha identificada**.

---

## 2. Marco teórico (sin cambios sustanciales respecto a la edición original)

Los marcos conceptuales de la edición original —subordinación algorítmica, cooperativismo de plataforma, Deber de Cuidado como eje de RH— se mantienen válidos. Esta sección los condensa para enfocar el análisis en los hallazgos técnicos.

### 2.1 Del marco legal: Nueva Zelanda y Colombia

La Prostitution Reform Act neozelandesa (2003) y el proyecto PL290 colombiano (2024-2025) representan los dos polos de referencia en descriminalización laboral. La primera prioriza autonomía y salud ocupacional; la segunda, cobertura de seguridad social formal. PNPtv opera filosóficamente más cercano al modelo neozelandés —autonomía, no criminalización, Duty of Care— pero su arquitectura técnica, como se verá, sería compatible con un rol de intermediario de cumplimiento en un entorno post-PL290.

### 2.2 El Deber de Cuidado como eje de RH reformulado

La reformulación propuesta en la edición original —RH como infraestructura política, no solo operativa— se confirma en la arquitectura de PNPtv. Cada función clásica de RH tiene un equivalente tecnológico desplegado:

| Función RH | Herramienta tecnológica | Estado en PNPtv |
|---|---|---|
| Onboarding / verificación de identidad | SSI + ZKP | **Parcial** — § 2257 manual + Persona KYC; ZKP no implementado |
| Seguridad y salud ocupacional | Reducción de daños, reportes, contenido | **Implementado** |
| Privacidad y confidencialidad | Geobloqueo IP, fuzzing de ubicación | **Parcial** — ubicación sí; geobloqueo por creador no |
| Compensación / nómina | Crypto multicadena + ledger interno | **Implementado** |
| Clima laboral / bienestar | Wellness Mode, Self-Care Center, Use Tracker | **Implementado** |

---

## 3. La capa tecnológica: mapa de implementación real en PNPtv

Esta sección reemplaza el análisis hipotético de la Sección 3 original con hallazgos verificados en código.

### 3.1 Verificación de identidad sin exposición de PII: lo que existe y lo que falta

**Implementado:** El módulo `identityVerificationService.js` implementa el proceso de verificación de identidad exigido por 18 U.S.C. § 2257 (la regulación federal estadounidense de documentación de performers adultos) con las siguientes características:

- **Upsert con control de versiones:** un creador puede reenviar su documentación si es rechazado; el sistema registra el conteo de reenvíos y aplica una suspensión de 6 meses al segundo rechazo por fraude.
- **Validación de edad en servidor:** la fecha de nacimiento es validada matemáticamente antes de persistirse; menores de 18 años son bloqueados con error tipado.
- **Control de ban temporal:** `banned_from_applying_until` previene el abuso de reenvíos.
- **Integración con Persona:** el servicio soporta el flujo hosted de Persona.com para verificación automatizada de documentos gubernamentales, con validación HMAC-SHA256 del webhook (ventana de 5 minutos contra replay attacks).
- **Exportación de custodia:** el método `export2257Records()` incluye los datos del custodian (nombre, dirección, email) conforme al 28 C.F.R. § 75.1(c).
- **Desbloqueo automático de herramientas de creador:** al aprobarse la verificación, `checkAndMaybeUnlockCreator()` libera automáticamente uploads, streaming y publicación.

Adicionalmente, `ageVerificationService.js` implementa verificación de edad por análisis de imagen con Azure Face API o Face++ (configurable por entorno), con las siguientes garantías de privacidad: el buffer de la foto se descarta inmediatamente tras el análisis de la API (comentado como `CRITICAL` en el código) y solo el resultado numérico (edad estimada, confianza, aprobado/rechazado) se persiste en `age_verification_attempts`.

**Lo que falta:** La edición original refería las Credenciales Verificables W3C y las Pruebas de Conocimiento Cero (ZKP) como el estándar óptimo para demostrar mayoría de edad sin exponer PII. PNPtv no implementa DIDs ni VCs — el flujo actual requiere compartir documentos de identidad con la plataforma (vía Persona o upload directo), que los almacena en rutas locales (`id_document_path`, `id_selfie_path`). La diferencia filosófica es sustancial: el modelo actual es custodial (la plataforma posee la evidencia); el modelo SSI/ZKP sería no-custodial (el performer prueba sin revelar). Esta es la brecha técnica más relevante para la soberanía del trabajador en el ámbito de la identidad.

### 3.2 Infraestructura financiera: crypto multicadena con custodia operacional

**Implementado:** El ecosistema financiero de PNPtv está construido en tres capas verificadas:

**Capa 1 — Moneda interna (Ru$h):** `tokenLedgerService.js` implementa un libro contable append-only para la moneda interna Ru$h. Cada mutación sobre `user_token_wallets` pasa obligatoriamente por `credit()` o `debit()`, generando una fila en `token_ledger`. El ratio de conversión (1 USD = 6 tokens, con bonificaciones escalonadas por paquete) está fijo en configuración. Las puntas de live stream son 100% para el creador (`TIP_CREATOR_RATE = 1.0`); el contenido y membresías aplican la división 70/30 (`CREATOR_REVENUE_RATE = 0.70`, `PLATFORM_COMMISSION_RATE = 0.30`). Las ganancias tienen un hold de 7 días antes de ser disponibles para cashout.

**Capa 2 — Pagos de entrada (crypto):** NowPayments es el único proveedor de pagos activo, procesando pagos en múltiples criptomonedas. `paymentService.js` y `nowpaymentsPayoutService.js` gestionan el ciclo completo incluyendo idempotencia de webhooks.

**Capa 3 — Cashout (cinco canales):** `cashoutService.js` implementa cinco carriles de retiro: Meru (handle telefónico), Bitcoin mainnet, Dash mainnet, USDT TRC-20 y USDT Base (EVM). Las direcciones son validadas con expresiones regulares específicas para cada formato (bech32 P2WPKH/P2TR para Bitcoin, TRC-20 `T[1-9A-HJ-NP-Za-km-z]{33}`, EVM `0x[0-9a-fA-F]{40}`). Límites por solicitud ($5,000) y por día ($10,000) son aplicados en servidor.

**Seguridad:** `paymentSecurityService.js` implementa cifrado AES-256-CBC para datos de pago sensibles; `fraudDetectionService.js` aplica dos reglas en tiempo real: control de velocidad (máximo 3 intentos en 5 minutos, con Redis TTL) y detección de anomalías geográficas (velocidad imposible entre transacciones > 900 km/h).

**Lo que falta respecto al catálogo del Manual 2026:** El modelo actual es de custodia operacional, no de autocustodia. El creador retira a su billetera personal, pero los fondos en tránsito residen en las cuentas de la plataforma. Los contratos inteligentes de escrow autoejecutables (para garantizar liberación automática del pago al completarse un servicio) no están implementados. El riesgo de chargeback fraudulento —identificado en la tesis original como un vector crítico de precarización— está mitigado por la naturaleza irreversible de los pagos en criptomoneda, aunque no por escrow on-chain.

### 3.3 Seguridad y bienestar: la implementación más madura del Deber de Cuidado

Esta es el área donde PNPtv más se aleja de la promesa declarativa y más se acerca a la implementación concreta. Los siguientes módulos constituyen, en conjunto, un sistema de bienestar sin precedentes en plataformas comparables del sector:

**Wellness Mode (`wellnessModeService.js`):** Un modo de descanso autoimpuesto con duración configurable (1, 7, 30 días o indefinido). El diseño incorpora fricción deliberada: deshabilitar el modo requiere dos pasos separados por 24 horas de "cooling-off" (`COOLING_OFF_HOURS = 24`). El código documenta explícitamente el razonamiento: *"Un toggle booleano es demasiado fácil de revertir durante un craving — el punto es la fricción."* Durante el modo activo, el acceso a la plataforma se restringe a una lista blanca de rutas (settings, Cristina AI, hangouts de bienestar, harm-reduction use tracker, recursos legales). El sistema acumula días de bienestar completados (`wellness_days_accumulated`) para visibilidad del progreso personal.

**Self-Care Center (`SelfCareCenter.tsx`):** Página dedicada sin publicidad, sin algoritmos y sin notificaciones — diseñada con "espacio visual deliberado, gradientes suaves, movimiento lento" según el comentario en el código. Consolida el Use Tracker, el Wellness Mode y acceso directo a Cristina (IA de acompañamiento) y a grupos de bienestar.

**Use Tracker:** Registro privado de sesiones de consumo (`use_tracker_logs`), con tipos `slam` (inyección) y `smoke`, estadísticas personales de frecuencia, y visualización de días desde el último consumo. El sistema de categorías coincide con la terminología chemsex del entorno PNP, lo que representa un nivel de contextualización cultural ausente en cualquier herramienta de reducción de daños mainstream.

**Sistema de reporte de comunidad (`userReportService.js`):** Ocho categorías de reporte con semántica específica: harassment, hate, spam_scam, impersonation, csam, nudity_nonconsensual, self_harm, other. CSAM activa escalación automática y suspensión inmediata de la cuenta reportada. El reporte genera bloqueo automático del target para el reportero. Límite de 5 reportes diarios por usuario para prevenir abuso del sistema. Las categorías `self_harm` y `nudity_nonconsensual` (sin consentimiento) reflejan protocolos de cuidado activo hacia los propios creadores.

**Filtro de contenido contextualizado (`contentModerationFilter.js`):** Este módulo es culturalmente notable. A diferencia de filtros genéricos que bloquean cualquier referencia a sustancias, el filtro de PNPtv está calibrado para el contexto PNP: los términos genéricos (`meth`, `tina`, `pnp`, `chem`, `partying`) NO son bloqueados —son el vocabulario legítimo de la comunidad—. Solo se bloquean los vectores de daño específico: `iv_drug_use` (lenguaje de inyección/slamming), `bug_chasing` (lenguaje de transmisión intencional de VIH), `non_consent` (violación, drogas facilitadoras), `child_safety` (CSAM), `zoophilia`, `firearms` (venta de armas) y `drug_sales` (comercio de sustancias, no uso personal). Esta distinción entre uso personal/recreativo y vectores de daño crítico es precisamente la sofisticación que falta en las políticas de plataformas como OnlyFans, que bloquean indiscriminadamente cualquier contenido relacionado con el mundo PNP.

**Lo que falta respecto al catálogo original:** El botón de pánico físico / stealth (la alerta silenciosa controlada por el trabajador, sin requerir desbloquear el teléfono durante una agresión) no está implementado. PNPtv opera en el dominio digital, donde este riesgo es menor; pero para servicios presenciales facilitados a través de la plataforma, esta brecha es relevante.

### 3.4 Privacidad y gestión de datos: autenticación sin contraseña y derecho al olvido

**Autenticación sin contraseña:** Las rutas `POST /api/webapp/auth/email/register` y `POST /api/webapp/auth/email/login` retornan HTTP 410 Gone con el mensaje: *"Password registration has been removed. Use magic link or passkey."* PNPtv eliminó completamente la autenticación por contraseña. El sistema opera exclusivamente con passkeys (WebAuthn/FIDO2 — resistant a phishing por diseño), magic links de un solo uso y autenticación vía widget de Telegram. Esta decisión arquitectónica elimina la mayor superficie de ataque en el robo de identidad: la contraseña reutilizable.

**Derecho al olvido (`selfEraseAccount`):** La ruta `DELETE /api/users/me/erase` implementa borrado duro con gate de confirmación explícita (el usuario debe enviar `{ "confirm": "DELETE MY ACCOUNT" }` en el body). El endpoint está protegido contra rate-limiting. La variante `NoConsent` (sin requerir aceptación de términos activa) garantiza que un usuario que nunca completó el onboarding pueda igualmente borrar sus datos.

**Privacidad de ubicación (`nearbyService.js`):** Las coordenadas se redondean a 3 decimales (~111m de precisión) antes de almacenarse. En la respuesta, se aplica un offset HMAC-determinístico (usando el `userId` + `GEO_HMAC_SECRET` del entorno) que desplaza la posición reportada entre 100 y 500 metros según el radio de privacidad configurado por el usuario. El offset es determinístico (el mismo usuario siempre ve el mismo offset) pero no derivable por terceros sin la clave HMAC.

**Lo que falta:** El geobloqueo per-creador (ocultar el propio perfil y catálogo de contenido al tráfico proveniente del país o ciudad de residencia) no está implementado como funcionalidad self-service. La detección de país existe en middleware (`geo?.country`) para decisiones de negocio (como mostrar opciones de pago locales), pero no como palanca de privacidad que el propio creador pueda activar para protegerse del ostracismo familiar o la pérdida de empleo alternativo.

### 3.5 Arquitectura de seguridad sistémica

**Audit log centralizado (`AuditLogService.js`):** Registro de acciones administrativas con actor, recurso, valores anterior/posterior, IP y user-agent. Consultable con filtros de fecha, actor y tipo de acción.

**Ban de plataforma multi-vector (`platformBanService.js`):** Un ban de plataforma captura todos los vectores de identidad conocidos del usuario (Telegram ID, pnptv_id, email, X/Twitter, Bluesky, ATProto) más todas las IPs registradas en sus sesiones. Revoca entitlements, limpia suscripciones activas y envía un mensaje de notificación al usuario redactado de manera firme pero humana (con el emoji 💛 y el reconocimiento a la comunidad).

**Sistema de apelación (`appealService.js`):** Los usuarios baneados tienen una vía de apelación pública y autenticada, con rate-limiting por IP (1/hora, 3/día) y honeypot anti-bot. El sistema resuelve la identidad del apelante por múltiples identificadores (email, ID numérico, @username).

---

## 4. El caso PNPtv revisado: de la narrativa declarada a la evidencia verificada

### 4.1 Tabla de implementación actualizada

| Principio declarado por PNPtv | Herramienta correspondiente (Manual 2026) | Implementación verificada en código | Brecha residual |
|---|---|---|---|
| Dignificar la identidad sin exponer datos personales | SSI + Credenciales Verificables / ZKP | **Parcial**: § 2257 con Persona KYC + AI age verification con descarte inmediato del buffer | SSI/DIDs/ZKP no implementados; modelo actual es custodial |
| Blindar frente a la coerción económica | Cooperativismo + stablecoins + autocustodia | **Parcial**: split 70/30, cashout multi-crypto, Ru$h ledger, NowPayments | No hay escrow on-chain ni autocustodia real; estructura cooperativa no formalizada |
| Mitigar riesgos de salud física y mental | Duty of Care operacional + safety apps | **Implementado**: Wellness Mode con cooling-off, Use Tracker contextualizado, filtro de contenido calibrado para PNP, CSAM auto-escalation, Self-Care Center | Botón de pánico stealth no implementado |
| Evitar ostracismo familiar y social | Geobloqueo IP / Geofencing | **Parcial**: fuzzing de ubicación HMAC, redondeo de coordenadas | Geobloqueo per-creador de contenido (por país/ciudad) no implementado |
| Acompañamiento ético de onboarding y offboarding | Marco de RH adaptado | **Implementado**: § 2257 flow completo, passkey auth, magic link, `selfEraseAccount` con gate explícito | Protocolo de offboarding formal (entrevista de salida, recursos post-plataforma) no existe como módulo |
| Protección frente a abuso de la comunidad | Sistemas de reporte y moderación | **Implementado**: reporte con 8 categorías, escalación CSAM, auto-bloqueo, filtro de contenido contextualizado | — |
| Transparencia de compensación | Ledger auditable + nómina transparente | **Implementado**: token_ledger append-only, earning statements en CreatorEarnings.tsx | Ledger no es público ni on-chain; auditable solo por el propio creador y por admins |

### 4.2 Lo que la tesis original subestimó

La edición original asumía que el catálogo tecnológico descrito en el Manual 2026 (SSI, DeFi, botones de pánico, geobloqueo) era el horizonte al que PNPtv aspiraba. El acceso al código revela algo más interesante: PNPtv construyó herramientas sin precedente en plataformas comparables que el catálogo del Manual no describía:

1. **Wellness Mode con fricción de diseño intencional.** No existe ninguna plataforma de contenido adulto —ni OnlyFans, ni ManyVids, ni Fansly— que implemente un modo de descanso con cooling-off de 24 horas diseñado explícitamente para resistir impulsos de desactivación durante un craving. Esta es una innovación en gestión del bienestar que supera el estado del arte del sector.

2. **Use Tracker contextualizado para chemsex/PNP.** La terminología específica (`slam`, `smoke`) y la filosofía de no-bloqueo del vocabulario comunitario representan una comprensión del contexto cultural que ningún sistema de harm-reduction mainstream ha logrado.

3. **Filtro de contenido con distinción uso personal vs. vectores de daño.** La decisión de no bloquear `meth/tina/pnp` mientras sí bloquea `slamming/hotshots/bug_chasing` requiere un nivel de sofisticación cultural que solo es posible desde la gestión representativa descrita en la sección 4.3 del documento original.

4. **Autenticación 100% sin contraseña.** La eliminación total de passwords (HTTP 410 en las rutas de registro/login) es más radical que lo que implementan la mayoría de las fintech y plataformas SaaS en 2026.

### 4.3 Representatividad como método de gestión: la confirmación técnica

El documento original citaba el testimonio fundacional de PNPtv sobre la validación humana como piedra angular de su modelo. El código confirma que esa filosofía permea hasta las decisiones de ingeniería: el comentario en `wellnessModeService.js` que explica por qué el cooling-off existe ("*Un toggle booleano es demasiado fácil de revertir durante un craving*") no es el lenguaje de una plataforma que diseña funcionalidades de cumplimiento regulatorio; es el lenguaje de alguien que ha vivido el craving.

Esto valida la hipótesis del documento original sobre la "empatía epistemológica como método de gestión": la gestión representativa —dirigir una plataforma desde la experiencia encarnada de sus trabajadores— produce decisiones de arquitectura que no son alcanzables desde el pedestal corporativo.

---

## 5. Discusión actualizada

### 5.1 RH como infraestructura política: confirmado

El análisis del código confirma la tesis central: en PNPtv, la función de RH no es un módulo de cumplimiento corporativo sino una infraestructura política que redistribuye poder hacia el trabajador. La eliminación de passwords, el derecho al olvido autoejecutado, el ledger de ganancias auditable por el propio creador y el Wellness Mode con fricción-por-diseño son decisiones técnicas con consecuencias políticas concretas sobre quién controla qué datos y en qué condiciones.

### 5.2 Tensiones sin resolver (actualizadas)

**Verificación custodial vs. soberanía:** El sistema § 2257 actual —documentos gubernamentales almacenados en el servidor de PNPtv— representa el mayor punto de concentración de PII sensible de toda la plataforma. Una brecha de seguridad en esta capa exponenciaría el daño potencial. La migración hacia Persona.com (ya iniciada en el código) reduce pero no elimina este riesgo, pues Persona también es custodial. La implementación de VCs/ZKP eliminaría el problema desde el diseño.

**Ledger interno vs. transparencia on-chain:** El `token_ledger` de Ru$h es auditado por el creador y por admins, pero no es públicamente verificable. En un modelo cooperativo maduro, un ledger on-chain permitiría a los creadores verificar la equidad del reparto sin depender de la buena fe de la plataforma.

**Geobloqueo pendiente:** La ausencia de geobloqueo per-creador es la brecha más urgente para la privacidad cotidiana de los creadores que trabajan en países donde el trabajo sexual es perseguido o en entornos familiares que desconocen su actividad.

### 5.3 PNPtv y los marcos normativos comparados

La arquitectura implementada es más coherente con el espíritu neozelandés (autonomía, salud ocupacional, no-criminalización) que con el modelo colombiano (subordinación formal, seguridad social estatal). Sin embargo, el sistema § 2257 con custodia documental, el split 70/30 formalizado en código y el sistema de ganancias retenidas podrían articularse con las ARL colombianas y el régimen de contratos de prestación de servicios del PL290, si hubiera voluntad de operar en esa jurisdicción.

---

## 6. Conclusiones revisadas

**Primera.** La subordinación algorítmica del trabajo sexual digital tiene en PNPtv un contrapeso técnico real: las decisiones de arquitectura (auth sin contraseña, crypto cashout, Wellness Mode con fricción) redistribuyen activamente el control hacia el trabajador.

**Segunda.** El Deber de Cuidado como eje de RH está implementado en su dimensión de bienestar y moderación con un nivel de sofisticación cultural sin precedentes en el sector. Las herramientas de reducción de daños (Wellness Mode, Use Tracker PNP-contextualizado, filtro calibrado) son innovaciones que superan el estado del arte del catálogo del Manual 2026.

**Tercera.** Las brechas críticas son tres: (a) geobloqueo per-creador como herramienta de privacidad autoservicio, (b) migración del modelo de identidad de custodial a SSI/ZKP, y (c) formalización de la estructura cooperativa con gobernanza democrática y ledger on-chain.

**Cuarta.** La hipótesis de "empatía epistemológica como método de gestión" queda confirmada: las decisiones de ingeniería más innovadoras de PNPtv (cooling-off en Wellness Mode, vocabulario PNP en el filtro de contenido, categories `self_harm` y `nudity_nonconsensual` en reportes) solo son explicables desde la experiencia encarnada de quienes las diseñaron.

---

## Referencias

*(Las referencias de la edición original se mantienen. Se agregan las siguientes fuentes técnicas directas auditadas en esta revisión:)*

- Repositorio de producción PNPtv, `/opt/pnptvapp` — revisado agosto 2026:
  - `apps/backend/services/identityVerificationService.js` — § 2257 + Persona KYC
  - `apps/backend/services/ageVerificationService.js` — verificación de edad por IA
  - `apps/backend/services/wellnessModeService.js` — Wellness Mode con cooling-off
  - `apps/backend/services/tokenLedgerService.js` — Ru$h ledger append-only
  - `apps/backend/services/cashoutService.js` — cashout multi-crypto
  - `apps/backend/services/contentModerationFilter.js` — filtro contextualizado PNP
  - `apps/backend/services/userReportService.js` — sistema de reporte comunitario
  - `apps/backend/services/platformBanService.js` — ban multi-vector
  - `apps/backend/services/nearbyService.js` — fuzzing de ubicación HMAC
  - `apps/backend/bot/api/routes.js` — rutas de auth (passkey, magic-link, erase)
  - `apps/web/src/pages/SelfCareCenter.tsx` — Self-Care Center
  - `apps/web/src/pages/WellnessShell.tsx` — shell de bienestar
  - `apps/backend/config/monetizationConfig.js` — estructura de comisiones

---

*Esta revisión fue preparada con acceso directo al repositorio de código de producción en agosto de 2026. El análisis refleja el estado del código en esa fecha.*
