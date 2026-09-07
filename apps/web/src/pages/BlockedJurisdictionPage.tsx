import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { submitGeoBypass } from "@/lib/api";

const JURISDICTION_LABELS: Record<string, string> = {
  CO: "Colombia",
  TX: "Texas",
  LA: "Louisiana",
  UT: "Utah",
  VA: "Virginia",
  IN: "Indiana",
  AR: "Arkansas",
  MS: "Mississippi",
  NC: "North Carolina",
  TN: "Tennessee",
  FL: "Florida",
  GB: "the United Kingdom",
};

export default function BlockedJurisdictionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jurisdiction = searchParams.get("j");
  const isColombia = searchParams.get("reason") === "colombia" || jurisdiction === "CO";
  const jurisdictionLabel = jurisdiction ? (JURISDICTION_LABELS[jurisdiction] || jurisdiction) : null;

  const [bypassing, setBypassing] = useState(false);
  const [bypassError, setBypassError] = useState<string | null>(null);

  async function handleSelfCertify() {
    setBypassing(true);
    setBypassError(null);
    try {
      const res = await submitGeoBypass();
      if (res.success) {
        navigate("/", { replace: true });
      } else {
        setBypassError("Could not confirm your location. Please try again.");
      }
    } catch {
      setBypassError("Could not confirm your location. Please try again.");
    } finally {
      setBypassing(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Not available in your region — PNPtv!</title>
      </Helmet>
      <div
        className="min-h-dvh flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "var(--pnp-background, #121212)", color: "#fff" }}
      >
        <div className="max-w-sm w-full space-y-5">
          <div
            className="mx-auto flex items-center justify-center rounded-full"
            style={{ width: 56, height: 56, background: "rgba(230,145,56,0.12)" }}
            aria-hidden="true"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#E69138" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M4.5 19.5h15c1.4 0 2.28-1.5 1.6-2.75l-7.5-13c-.7-1.2-2.5-1.2-3.2 0l-7.5 13c-.68 1.25.2 2.75 1.6 2.75z" />
            </svg>
          </div>

          <h1 className="text-lg font-bold">Not available in your region</h1>

          <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
            PNPtv! is not currently available
            {jurisdictionLabel ? ` in ${jurisdictionLabel}` : " in your region"} due to local
            age-verification requirements.
          </p>

          {isColombia && (
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
              Existing members and Socios Colombia keep their access — log in with your account
              if you already have one.
            </p>
          )}

          <div
            className="rounded-2xl p-4 space-y-3 text-left"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              If you believe this is a mistake — for example your mobile carrier or VPN routes
              your connection through a restricted region — you can confirm your actual location.
            </p>
            <button
              onClick={handleSelfCertify}
              disabled={bypassing}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {bypassing ? "Confirming…" : "I'm not actually in a restricted region"}
            </button>
            {bypassError && (
              <p className="text-xs" style={{ color: "#FF453A" }}>{bypassError}</p>
            )}
          </div>

          <button
            onClick={() => navigate("/login")}
            className="text-xs underline"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Already have an account? Log in
          </button>
        </div>
      </div>
    </>
  );
}
