import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { getCreatorModerationHistory, type CreatorModerationHistory, type CreatorModerationStrike } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function actionLabel(action: CreatorModerationStrike["action_taken"], es: boolean): string {
  if (es) {
    switch (action) {
      case "warn": return "Advertencia";
      case "mute_24h": return "Silencio 24 h";
      case "ban": return "Ban";
      case "strip_only": return "Contenido retirado";
      default: return String(action);
    }
  }
  switch (action) {
    case "warn": return "Warning";
    case "mute_24h": return "24h mute";
    case "ban": return "Ban";
    case "strip_only": return "Content removed";
    default: return String(action);
  }
}

function actionColor(action: CreatorModerationStrike["action_taken"]): string {
  switch (action) {
    case "warn": return "#FFB454";
    case "mute_24h": return "#FF9F0A";
    case "ban": return "#FF453A";
    case "strip_only": return "#5AC8FA";
    default: return "#8E8E93";
  }
}

function fmtDate(iso: string | null, lang: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === "es" ? "es-CO" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch { return iso; }
}

function fmtCountdown(secondsRemaining: number, es: boolean): string {
  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor((secondsRemaining % 3600) / 60);
  if (h > 0) return es ? `${h} h ${m} min` : `${h}h ${m}m`;
  return es ? `${m} min` : `${m}m`;
}

export default function CreatorNotices() {
  const { lang } = useI18n();
  const es = lang === "es";
  const [data, setData] = useState<CreatorModerationHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCreatorModerationHistory()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Helmet>
        <title>{es ? "Avisos — Creator Studio" : "Notices — Creator Studio"} — PNPtv!</title>
      </Helmet>
      <div className="p-4 lg:p-6 max-w-2xl mx-auto">
        <header className="mb-5">
          <h1 className="text-xl font-bold text-white">
            {es ? "Avisos y estado de moderación" : "Notices & moderation status"}
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {es
              ? "Aquí ves cualquier advertencia, silenciamiento o suspensión asociada a tu cuenta. Nada aquí se comparte con otros usuarios."
              : "Any warning, mute, or suspension tied to your account. Nothing shown here is visible to other users."}
          </p>
        </header>

        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-20 rounded-xl bg-white/5" />
            <div className="h-16 rounded-xl bg-white/5" />
            <div className="h-16 rounded-xl bg-white/5" />
          </div>
        )}

        {!loading && error && (
          <div className="p-4 rounded-xl" style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.3)" }}>
            <p className="text-sm" style={{ color: "#FF453A" }}>
              {es ? "No se pudo cargar tu historial. Intentá de nuevo más tarde." : "Could not load your history. Please try again later."}
            </p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            {/* Active suspension banner */}
            {data.suspension.active && (
              <section
                className="p-4 rounded-xl"
                style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.35)" }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0" aria-hidden>⛔</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: "#FF453A" }}>
                      {es ? "Tu cuenta de creador está suspendida" : "Your creator account is suspended"}
                    </p>
                    {data.suspension.until_iso && (
                      <p className="text-xs mt-1 text-white/85">
                        {data.suspension.until_iso === "infinity"
                          ? (es ? "Sin fecha de reactivación programada." : "No reinstatement date set.")
                          : es
                            ? `Hasta ${fmtDate(data.suspension.until_iso, lang)}`
                            : `Until ${fmtDate(data.suspension.until_iso, lang)}`}
                      </p>
                    )}
                    {data.suspension.reason && (
                      <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        {es ? "Motivo:" : "Reason:"} {data.suspension.reason}
                      </p>
                    )}
                    <Link
                      to="/appeal"
                      className="inline-block mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
                    >
                      {es ? "Presentar apelación →" : "File an appeal →"}
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* Active mute banner */}
            {data.activeMute.active && data.activeMute.seconds_remaining !== null && (
              <section
                className="p-4 rounded-xl"
                style={{ background: "rgba(255,159,10,0.1)", border: "1px solid rgba(255,159,10,0.35)" }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0" aria-hidden>🔇</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: "#FF9F0A" }}>
                      {es ? "Silenciado temporalmente" : "Temporarily muted"}
                    </p>
                    <p className="text-xs mt-1 text-white/85">
                      {es
                        ? `No podés publicar ni transmitir por ${fmtCountdown(data.activeMute.seconds_remaining, true)}.`
                        : `You can't post or broadcast for ${fmtCountdown(data.activeMute.seconds_remaining, false)}.`}
                    </p>
                    {data.activeMute.until_iso && (
                      <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        {es ? "Termina:" : "Ends:"} {fmtDate(data.activeMute.until_iso, lang)}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Content compliance status */}
            {data.contentCompliance.status && data.contentCompliance.status !== "compliant" && (
              <section
                className="p-4 rounded-xl"
                style={{ background: "rgba(90,200,250,0.08)", border: "1px solid rgba(90,200,250,0.3)" }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0" aria-hidden>📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">
                      {es ? "Estado de cumplimiento de contenido" : "Content compliance status"}
                    </p>
                    <p className="text-xs mt-1 text-white/85 capitalize">
                      {data.contentCompliance.status.replace(/_/g, " ")}
                    </p>
                    {data.contentCompliance.deadline_iso && (
                      <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        {es ? "Fecha límite:" : "Deadline:"} {fmtDate(data.contentCompliance.deadline_iso, lang)}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Strikes history */}
            <section>
              <h2 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                {es ? "Historial de advertencias" : "Warning history"}
              </h2>
              {data.strikes.length === 0 ? (
                <div className="p-4 rounded-xl" style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.28)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl" aria-hidden>✅</span>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {es ? "Historial limpio" : "You're in good standing"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        {es ? "No hay advertencias ni sanciones registradas." : "No warnings or sanctions on record."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.strikes.map((s) => {
                    const color = actionColor(s.action_taken);
                    const isCleared = s.cleared;
                    return (
                      <li
                        key={s.id}
                        className="p-3 rounded-xl"
                        style={{
                          background: isCleared ? "rgba(255,255,255,0.03)" : `rgba(${color === "#FFB454" ? "255,180,84" : color === "#FF9F0A" ? "255,159,10" : color === "#FF453A" ? "255,69,58" : "90,200,250"},0.08)`,
                          border: `1px solid ${isCleared ? "rgba(255,255,255,0.08)" : color + "40"}`,
                          opacity: isCleared ? 0.65 : 1,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                style={{
                                  background: color + "22",
                                  color,
                                  border: `1px solid ${color}55`,
                                }}
                              >
                                {actionLabel(s.action_taken, es)}
                              </span>
                              <span className="text-[11px] text-white/60">
                                #{s.strike_number}
                              </span>
                              {isCleared && (
                                <span
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{
                                    background: "rgba(52,199,89,0.15)",
                                    color: "#34C759",
                                    border: "1px solid rgba(52,199,89,0.35)",
                                  }}
                                >
                                  {es ? "Retirado" : "Cleared"}
                                </span>
                              )}
                              {s.appeal_status && (
                                <span
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{
                                    background: s.appeal_status === "approved"
                                      ? "rgba(52,199,89,0.15)"
                                      : s.appeal_status === "rejected"
                                        ? "rgba(255,69,58,0.15)"
                                        : "rgba(90,200,250,0.15)",
                                    color: s.appeal_status === "approved"
                                      ? "#34C759"
                                      : s.appeal_status === "rejected"
                                        ? "#FF453A"
                                        : "#5AC8FA",
                                    border: `1px solid ${s.appeal_status === "approved" ? "rgba(52,199,89,0.35)" : s.appeal_status === "rejected" ? "rgba(255,69,58,0.35)" : "rgba(90,200,250,0.35)"}`,
                                  }}
                                >
                                  {es
                                    ? `Apelación: ${s.appeal_status === "pending" ? "Pendiente" : s.appeal_status === "approved" ? "Aprobada" : "Rechazada"}`
                                    : `Appeal: ${s.appeal_status}`}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white mt-1.5 capitalize">
                              {s.category.replace(/_/g, " ")}
                            </p>
                            <p className="text-[11px] mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                              {fmtDate(s.created_at, lang)}
                              {isCleared && s.cleared_at && (es ? ` · retirado ${fmtDate(s.cleared_at, lang)}` : ` · cleared ${fmtDate(s.cleared_at, lang)}`)}
                            </p>
                          </div>
                          {!isCleared && !s.appeal_status && (
                            <Link
                              to="/appeal"
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg self-start flex-shrink-0"
                              style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}
                            >
                              {es ? "Apelar" : "Appeal"}
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Footer info */}
            <p className="text-[11px] leading-relaxed mt-4" style={{ color: "rgba(255,255,255,0.4)" }}>
              {es
                ? "Las advertencias caducan 30 días después de emitidas si no ocurren nuevas infracciones. Si creés que hubo un error, presentá una apelación con el detalle del contexto."
                : "Warnings expire 30 days after issue if no new infractions occur. If you believe a strike was in error, file an appeal with context."}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
