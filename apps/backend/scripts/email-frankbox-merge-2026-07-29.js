const emailService = require('../services/emailservice');

const TO = 'dasilvafrankbox@gmail.com';
const SUBJECT = 'Tu cuenta PNPtv! ya está unificada — PRIME restaurado';

const html = `
<p>Hola Frankbox,</p>

<p>Detectamos que tenías tres cuentas separadas en PNPtv! (una por email, otra por Telegram, y una tercera antigua). Como la membresía PRIME estaba en solo una de ellas, al iniciar sesión por el otro método aparecías como usuario gratis.</p>

<p>Ya lo arreglamos: las tres cuentas fueron fusionadas en una sola. Ahora puedes entrar con <strong>cualquiera</strong> de tus dos métodos (email o Telegram) y verás tu PRIME activo en ambos.</p>

<p>No tienes que hacer nada. Si notas algo raro (perfil, publicaciones, seguidores), respóndenos a este correo y lo revisamos.</p>

<p>Un abrazo,<br/>
Equipo PNPtv!</p>
`;

const text = `Hola Frankbox,

Detectamos que tenías tres cuentas separadas en PNPtv! (una por email, otra por Telegram, y una tercera antigua). Como la membresía PRIME estaba en solo una de ellas, al iniciar sesión por el otro método aparecías como usuario gratis.

Ya lo arreglamos: las tres cuentas fueron fusionadas en una sola. Ahora puedes entrar con cualquiera de tus dos métodos (email o Telegram) y verás tu PRIME activo en ambos.

No tienes que hacer nada. Si notas algo raro (perfil, publicaciones, seguidores), respóndenos a este correo y lo revisamos.

Un abrazo,
Equipo PNPtv!`;

(async () => {
  try {
    const result = await emailService.send({
      to: TO,
      subject: SUBJECT,
      html,
      text,
      from: 'PNPtv Soporte <support@pnptv.app>',
    });
    console.log('SEND_RESULT:', JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('SEND_ERROR:', err.message);
    process.exit(1);
  }
})();
