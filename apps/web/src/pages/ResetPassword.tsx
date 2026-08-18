import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

// Password login was retired in favor of magic-link + passkey. This page
// used to POST /api/webapp/auth/reset-password (now 410 Gone). Kept as a
// friendly redirect so bookmarks and old reset-link emails don't 404.
const RP = {
  en: {
    title: "Password sign-in was retired",
    body: "PNPtv now uses magic links and passkeys — no passwords, nothing to reset. Head back to sign in with your email or passkey.",
    cta: "Go to Sign In",
  },
  es: {
    title: "El inicio de sesión con contraseña fue retirado",
    body: "PNPtv ahora usa enlaces mágicos y llaves de acceso — sin contraseñas, nada que restablecer. Vuelve al inicio de sesión con tu correo o llave.",
    cta: "Ir al inicio de sesión",
  },
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const i18n = useI18n();
  const s = RP[i18n.lang === "es" ? "es" : "en"];

  return (
    <div className="min-h-dvh flex items-center justify-center bg-pnp-background px-4">
      <div className="glass-card-sm p-6 max-w-sm w-full space-y-4 text-center">
        <h1 className="text-lg font-bold text-white">{s.title}</h1>
        <p className="text-sm text-white/70 leading-relaxed">{s.body}</p>
        <button
          onClick={() => navigate("/login")}
          className="btn-gradient w-full py-2.5 rounded-xl text-sm font-bold text-white mt-2"
        >
          {s.cta}
        </button>
      </div>
    </div>
  );
}
