import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useI18n } from "@/lib/i18n";
import { submitRemovalRequest, type RemovalRequestKind } from "@/lib/api";

/**
 * Public removal request form (no login). Feeds the admin Compliance Queue:
 * non-consensual intimate imagery is due in 48 hours (TAKE IT DOWN Act),
 * other requests from depicted people in 7 business days.
 */
export default function TakedownRequestPage() {
  const i18n = useI18n();
  const t = i18n.safety;
  const [kind, setKind] = useState<RemovalRequestKind>("ncii");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [urls, setUrls] = useState("");
  const [description, setDescription] = useState("");
  const [depicted, setDepicted] = useState(false);
  const [goodFaith, setGoodFaith] = useState(false);
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);

  const contentUrls = urls.split(/\s+/).map((u) => u.trim()).filter(Boolean);
  const canSubmit = name.trim() && email.trim() && contentUrls.length && signature.trim() && (kind !== "ncii" || goodFaith);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const res = await submitRemovalRequest({
        kind, name, email, contentUrls, description, isDepictedPerson: depicted, goodFaith, signature,
      });
      setDueAt(res.dueAt);
    } catch {
      setError(t.takedownError);
    } finally {
      setSending(false);
    }
  };

  const input = "w-full rounded-xl px-3 py-2.5 text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-white/30";

  return (
    <>
      <Helmet>
        <title>{t.takedownTitle} — PNPtv!</title>
      </Helmet>
      <div className="min-h-dvh px-4 py-10" style={{ background: "var(--pnp-background, #121212)", color: "#fff" }}>
        <div className="max-w-lg mx-auto space-y-5">
          <h1 className="text-xl font-bold">{t.takedownTitle}</h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{t.takedownIntro}</p>

          {dueAt ? (
            <div className="rounded-2xl p-4 text-sm space-y-1" style={{ background: "rgba(94,209,196,0.08)", border: "1px solid rgba(94,209,196,0.3)" }}>
              <p>{t.takedownDone} {new Date(dueAt).toLocaleString(i18n.lang === "es" ? "es" : undefined)}.</p>
              <p style={{ color: "rgba(255,255,255,0.65)" }}>{t.takedownDoneEmail}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold mb-1">{t.takedownKindLabel}</legend>
                {(["ncii", "complaint"] as const).map((k) => (
                  <label key={k} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="mt-1" />
                    <span>{k === "ncii" ? t.takedownKindNcii : t.takedownKindComplaint}</span>
                  </label>
                ))}
              </fieldset>

              <label className="block space-y-1 text-sm">
                <span>{t.takedownName}</span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{t.takedownEmail}</span>
                <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{t.takedownUrls}</span>
                <textarea className={input} rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} required />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{t.takedownDescription}</span>
                <textarea className={input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={depicted} onChange={(e) => setDepicted(e.target.checked)} className="mt-1" />
                <span>{t.takedownDepicted}</span>
              </label>
              {kind === "ncii" && (
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} className="mt-1" />
                  <span>{t.takedownGoodFaith}</span>
                </label>
              )}

              <label className="block space-y-1 text-sm">
                <span>{t.takedownSignature}</span>
                <input className={input} value={signature} onChange={(e) => setSignature(e.target.value)} required />
              </label>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={!canSubmit || sending}
                className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
              >
                {sending ? t.takedownSending : t.takedownSubmit}
              </button>
            </form>
          )}

          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            {t.takedownCsam}{" "}
            <a href="https://report.cybertip.org" target="_blank" rel="noopener noreferrer" className="underline">report.cybertip.org</a>
          </p>
        </div>
      </div>
    </>
  );
}
