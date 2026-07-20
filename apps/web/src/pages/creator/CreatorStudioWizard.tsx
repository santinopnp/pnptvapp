import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getOwnChannels, type CreatorChannel } from "@/lib/api";

const WIZARD_STORAGE_KEY = "pnptv_studio_wizard_v1";
const TOTAL_STEPS = 5;

type StepIcon = {
  color: string;
  bg: string;
  path: string;
};

const STEP_ICONS: Record<number, StepIcon> = {
  1: { color: "#A78BFA", bg: "rgba(123,97,255,.15)", path: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" },
  2: { color: "#FF4DA6", bg: "rgba(212,0,122,.15)", path: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" },
  3: { color: "#22C55E", bg: "rgba(34,197,94,.15)", path: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  4: { color: "#FFB454", bg: "rgba(255,180,84,.15)", path: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  5: { color: "#5ED1C4", bg: "rgba(94,209,196,.15)", path: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
};

function StepIconSquare({ step }: { step: number }) {
  const icon = STEP_ICONS[step];
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: icon.bg }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={icon.color} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
      </svg>
    </div>
  );
}

function TipCallout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-3.5 rounded-r-lg px-3 py-2.5"
      style={{ borderLeft: "2px solid #FFB454", background: "rgba(255,180,84,.07)" }}
    >
      <p className="text-[11px] font-bold" style={{ color: "#FFB454" }}>TIP</p>
      <p className="text-[11px] mt-1 leading-relaxed text-pnp-textSecondary">{children}</p>
    </div>
  );
}

export default function CreatorStudioWizard() {
  const navigate = useNavigate();

  const [wizardDone, setWizardDone] = useState(() => {
    try { return localStorage.getItem(WIZARD_STORAGE_KEY) === "done"; } catch { return false; }
  });
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [channels, setChannels] = useState<CreatorChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);

  useEffect(() => {
    if (step !== 4 || channels.length > 0) return;
    setChannelsLoading(true);
    getOwnChannels()
      .then((res) => { if (res.success) setChannels(res.channels); })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, [step, channels.length]);

  const finishWizard = useCallback(() => {
    try { localStorage.setItem(WIZARD_STORAGE_KEY, "done"); } catch { /* ignore */ }
    setWizardDone(true);
    navigate("/creators");
  }, [navigate]);

  const goToProfileContent = () => navigate("/creators/content");

  const wizNext = () => {
    if (step === TOTAL_STEPS) { finishWizard(); return; }
    setStep((s) => (Math.min(s + 1, TOTAL_STEPS) as typeof s));
  };
  const wizBack = () => setStep((s) => (Math.max(s - 1, 1) as typeof s));

  if (wizardDone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: "var(--pnp-bg)" }}>
        <Helmet><title>Creator Studio — PNPtv!</title></Helmet>
        <p className="text-sm text-pnp-textSecondary">You've already finished the setup wizard.</p>
        <button
          onClick={() => { setStep(1); setWizardDone(false); }}
          className="text-sm font-semibold text-pnp-accent"
        >
          Run it again →
        </button>
        <button onClick={() => navigate("/creators")} className="text-xs text-pnp-textSecondary hover:text-white/60 transition-colors">
          ← Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--pnp-bg)" }}>
      <Helmet><title>Creator Studio — Get set up to sell — PNPtv!</title></Helmet>
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">

        {/* Header */}
        <div>
          <p className="text-[10px] font-bold tracking-[.12em]" style={{ color: "#D4007A" }}>CREATOR STUDIO</p>
          <h1 className="text-xl font-bold text-white mt-1">Get set up to sell</h1>
          <p className="text-xs text-pnp-textSecondary mt-1">Step {step} of {TOTAL_STEPS}</p>
        </div>

        {/* Progress bar */}
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "#1E1E1E" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%`, background: "linear-gradient(90deg,#D4007A,#7B61FF)" }}
          />
        </div>

        {/* Step dots */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => {
            const isCurrent = n === step;
            const isDone = n < step;
            return (
              <button
                key={n}
                onClick={() => setStep(n as typeof step)}
                className="w-[30px] h-[30px] rounded-full text-xs font-bold flex items-center justify-center transition-colors"
                style={
                  isCurrent
                    ? { background: "linear-gradient(135deg,#D4007A,#7B61FF)", color: "#fff" }
                    : isDone
                      ? { background: "rgba(212,0,122,.18)", color: "#FF4DA6" }
                      : { background: "#1E1E1E", color: "rgba(255,255,255,.35)" }
                }
                aria-label={`Go to step ${n}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* Step 1: Download OBS */}
        {step === 1 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={1} />
            <h2 className="text-base font-bold text-white mt-3.5">Download OBS</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              OBS Studio is the free app you&apos;ll use to stream your live shows on PNPtv. Install it on your computer — once you have it, hit Next.
            </p>
            <a
              href="https://obsproject.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3.5 px-4 py-2.5 rounded-lg text-xs font-bold"
              style={{ border: "1px solid rgba(123,97,255,.5)", background: "rgba(123,97,255,.12)", color: "#A78BFA" }}
            >
              Download OBS Studio ↗
            </a>
          </div>
        )}

        {/* Step 2: Mark pics as featured */}
        {step === 2 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={2} />
            <h2 className="text-base font-bold text-white mt-3.5">Mark your best pics as featured</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              Pick up to 10 pics from your feed — they&apos;ll show in the FOTOS row at the top of your profile.
            </p>
            <button
              onClick={goToProfileContent}
              className="mt-3.5 px-4 py-2.5 rounded-lg text-xs font-bold text-white"
              style={{ background: "#D4007A" }}
            >
              Choose pics on my profile →
            </button>
            <TipCallout>
              Choose pics that show how good your show is gonna be — and the fetishes you&apos;re into.
            </TipCallout>
            <p className="text-[11px] text-white/30 mt-3">When you&apos;re done, come back to the wizard and hit Next.</p>
          </div>
        )}

        {/* Step 3: Choose featured videos */}
        {step === 3 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={3} />
            <h2 className="text-base font-bold text-white mt-3.5">Choose your featured videos</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              Pick up to 5 videos — they&apos;ll show in the VIDEOS row on your profile, right under your pics.
            </p>
            <button
              onClick={goToProfileContent}
              className="mt-3.5 px-4 py-2.5 rounded-lg text-xs font-bold text-white"
              style={{ background: "#D4007A" }}
            >
              Choose videos on my profile →
            </button>
            <TipCallout>
              Pick teasers that sell the vibe of your shows — short, hot, and straight to the point.
            </TipCallout>
            <p className="text-[11px] text-white/30 mt-3">Then return to the wizard and hit Next.</p>
          </div>
        )}

        {/* Step 4: Two channels */}
        {step === 4 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={4} />
            <h2 className="text-base font-bold text-white mt-3.5">Your two channels</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              You&apos;ve been given two channels to upload content — one free and one paid. Change the look, description and price in Settings.
            </p>

            <div className="flex flex-col gap-1.5 mt-3.5">
              {channelsLoading && (
                <p className="text-[11px] text-pnp-textSecondary">Loading your channels…</p>
              )}
              {!channelsLoading && channels.length === 0 && (
                <p className="text-[11px] text-pnp-textSecondary">No channels found yet.</p>
              )}
              {channels.map((ch) => {
                const isPaid = ch.accessType === "paid";
                return (
                  <div
                    key={ch.id}
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
                    style={{ border: "1px solid #2A2A2A", background: "#111" }}
                  >
                    <div
                      className="w-8 h-8 rounded-[10px] flex-shrink-0"
                      style={{
                        background: isPaid
                          ? "linear-gradient(135deg,#FFB454,#D4007A)"
                          : "linear-gradient(135deg,#5ED1C4,#7B61FF)",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{ch.name}</p>
                      <p className="text-[10px] text-pnp-textSecondary mt-0.5 truncate">
                        {isPaid ? "Full videos · you set the price" : "Post previews here to boost sales"}
                      </p>
                    </div>
                    <span
                      className="px-2 py-1 rounded-full text-[8px] font-bold tracking-[.06em] flex-shrink-0"
                      style={
                        isPaid
                          ? { background: "rgba(255,180,84,.15)", color: "#FFB454" }
                          : { background: "rgba(94,209,196,.15)", color: "#5ED1C4" }
                      }
                    >
                      {isPaid ? "PAID" : "FREE"}
                    </span>
                  </div>
                );
              })}
            </div>

            <TipCallout>
              Share previews of your videos in the free channel to boost your sales.
            </TipCallout>

            <p className="text-[11px] font-bold text-pnp-textSecondary mt-3.5 mb-1.5">
              Every video in your channels is automatically shared to:
            </p>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/80">✓ Main Stage chat</span>
              <span className="text-[11px] text-white/80">✓ PNPtv official feed</span>
              <span className="text-[11px] text-white/80">✓ Your personal hangout</span>
            </div>
          </div>
        )}

        {/* Step 5: Private hangout */}
        {step === 5 && (
          <div className="rounded-[14px] p-[18px]" style={{ border: "1px solid rgba(94,209,196,.35)", background: "rgba(94,209,196,.06)" }}>
            <StepIconSquare step={5} />
            <h2 className="text-base font-bold text-white mt-3.5">Your private hangout</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              This hangout is invisible and automatically adds your active paid members — from your paid channel or your profile subscription.
            </p>
            <p className="text-xs text-pnp-textSecondary mt-2.5 leading-relaxed">
              Use it to engage with your clients and upsell add-ons:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {["Calls", "Private shows", "Custom videos", "Tips"].map((chip) => (
                <span
                  key={chip}
                  className="px-3 py-1.5 rounded-full text-[10px] font-semibold text-white"
                  style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex gap-2">
          <button
            onClick={wizBack}
            disabled={step === 1}
            className="flex-1 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-35"
            style={{ border: "1px solid rgba(255,255,255,.15)", background: "#161616" }}
          >
            ← Back
          </button>
          <button
            onClick={wizNext}
            className="flex-[2] py-3 rounded-lg text-sm font-bold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
          >
            {step === TOTAL_STEPS ? "Finish" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
