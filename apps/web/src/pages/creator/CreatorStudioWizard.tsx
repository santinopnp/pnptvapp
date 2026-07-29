import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { StepDots } from "@pnptv/ui-kit";
import { getOwnChannels, provisionCreatorDefaults, uploadCreatorMediaFile, listOwnCreatorMedia, getCreatorSetupStatus, getCreatorConsents, type CreatorChannel, type CreatorMediaItem, type ChannelVideo } from "@/lib/api";
import { UploadVideoButton } from "@/components/channels/UploadVideoButton";
import { CreatorConsents } from "@/components/creators/CreatorLayout";
import { useI18n } from "@/lib/i18n";

const WIZARD_STORAGE_KEY = "pnptv_studio_wizard_v1";
const TOTAL_STEPS = 6;

type StepIcon = {
  color: string;
  bg: string;
  path: string;
};

const STEP_ICONS: Record<number, StepIcon> = {
  1: { color: "#7B61FF", bg: "rgba(123,97,255,.15)", path: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" },
  2: { color: "#FF4DA6", bg: "rgba(212,0,122,.15)", path: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" },
  3: { color: "#22C55E", bg: "rgba(34,197,94,.15)", path: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  4: { color: "#FFB454", bg: "rgba(255,180,84,.15)", path: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  5: { color: "#5ED1C4", bg: "rgba(94,209,196,.15)", path: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  6: { color: "#D4007A", bg: "rgba(212,0,122,.15)", path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
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
  const { creator: t } = useI18n();

  const [wizardDone, setWizardDone] = useState(() => {
    try { return localStorage.getItem(WIZARD_STORAGE_KEY) === "done"; } catch { return false; }
  });
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  const [channels, setChannels] = useState<CreatorChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Step 2 — photo upload
  const [ownMedia, setOwnMedia] = useState<CreatorMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  // Step 3 — video upload
  const [step3ChannelId, setStep3ChannelId] = useState<number | null>(null);

  // Step 6 — documents
  const [docSetupItems, setDocSetupItems] = useState<Array<{ key: string; done: boolean }>>([]);
  const [docConsents, setDocConsents] = useState<{
    terms_accepted?: boolean;
    privacy_accepted?: boolean;
    creator_terms_agreed?: boolean;
    content_disclaimer?: boolean;
  } | null>(null);

  const loadChannels = useCallback(() => {
    setChannelsLoading(true);
    getOwnChannels()
      .then((res) => { if (res.success) setChannels(res.channels); })
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    loadChannels();
  }, [step, loadChannels]);

  useEffect(() => {
    if (step !== 2) return;
    setMediaLoading(true);
    listOwnCreatorMedia()
      .then((res) => { if (res.success) setOwnMedia(res.items.filter((m) => m.type === "photo")); })
      .catch(() => {})
      .finally(() => setMediaLoading(false));
  }, [step]);

  useEffect(() => {
    if (step !== 3 || channels.length === 0 || step3ChannelId !== null) return;
    setStep3ChannelId(channels[0].id);
  }, [step, channels, step3ChannelId]);

  useEffect(() => {
    if (step !== 6) return;
    getCreatorSetupStatus()
      .then(res => { if (res?.items) setDocSetupItems(res.items); })
      .catch(() => {});
    getCreatorConsents()
      .then(res => { if (res?.success) setDocConsents(res.consents ?? res); })
      .catch(() => {});
  }, [step]);

  const handleProvision = useCallback(async () => {
    setProvisioning(true);
    setProvisionError(null);
    try {
      await provisionCreatorDefaults();
      loadChannels();
    } catch {
      setProvisionError(t.wizProvisionError);
    } finally {
      setProvisioning(false);
    }
  }, [loadChannels, t]);

  const finishWizard = useCallback(() => {
    try { localStorage.setItem(WIZARD_STORAGE_KEY, "done"); } catch { /* ignore */ }
    setWizardDone(true);
    navigate("/creators");
  }, [navigate]);

  const wizNext = () => {
    if (step === TOTAL_STEPS) { finishWizard(); return; }
    setStep((s) => (Math.min(s + 1, TOTAL_STEPS) as 1 | 2 | 3 | 4 | 5 | 6));
  };
  const wizBack = () => setStep((s) => (Math.max(s - 1, 1) as 1 | 2 | 3 | 4 | 5 | 6));

  if (wizardDone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: "var(--pnp-background, #121212)" }}>
        <Helmet><title>{t.wizPageTitle}</title></Helmet>
        <p className="text-sm text-pnp-textSecondary">{t.wizAlreadyDone}</p>
        <button
          onClick={() => { setStep(1); setWizardDone(false); }}
          className="text-sm font-semibold text-pnp-accent"
        >
          {t.wizRunAgain}
        </button>
        <button onClick={() => navigate("/creators")} className="text-xs text-pnp-textSecondary hover:text-white/60 transition-colors">
          {t.wizBackToDashboard}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--pnp-background, #121212)" }}>
      <Helmet><title>{t.wizPageTitleSetup}</title></Helmet>
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">

        {/* Header */}
        <div>
          <p className="text-[10px] font-bold tracking-[.12em]" style={{ color: "#D4007A" }}>{t.wizHeaderTag}</p>
          <h1 className="text-xl font-bold text-white mt-1">{t.wizTitle}</h1>
          <p className="text-xs text-pnp-textSecondary mt-1">{t.wizStepOf(step, TOTAL_STEPS)}</p>
        </div>

        {/* Progress bar */}
        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "#1E1E1E" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%`, background: "linear-gradient(90deg,#D4007A,#7B61FF)" }}
          />
        </div>

        {/* Step dots */}
        <StepDots
          total={TOTAL_STEPS}
          current={step}
          onStepClick={(n) => setStep(n as 1 | 2 | 3 | 4 | 5 | 6)}
        />

        {/* Step 1: Download OBS */}
        {step === 1 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={1} />
            <h2 className="text-base font-bold text-white mt-3.5">{t.wizStep1Title}</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              {t.wizStep1Body}
            </p>
            <a
              href="https://obsproject.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3.5 px-4 py-2.5 rounded-lg text-xs font-bold"
              style={{ border: "1px solid rgba(123,97,255,.5)", background: "rgba(123,97,255,.12)", color: "#A78BFA" }}
            >
              {t.wizStep1DownloadBtn}
            </a>

            {/* Monetization context: PNP Live */}
            <div
              className="mt-3.5 rounded-xl px-3.5 py-3"
              style={{ background: "rgba(212,0,122,.07)", border: "1px solid rgba(212,0,122,.25)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#D4007A" }}>{t.wizStep1MonetizeTag}</p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                {t.wizStep1MonetizeBody1Pre}<span className="text-white font-medium">{t.wizStep1MonetizeBody1Live}</span>{t.wizStep1MonetizeBody1Mid}<span className="text-white font-medium">{t.wizStep1MonetizeBody1Free}</span>{t.wizStep1MonetizeBody1Post}<span className="text-white font-medium">{t.wizStep1MonetizeBody1Rate}</span>{t.wizStep1MonetizeBody1End}
              </p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed mt-1.5">
                {t.wizStep1MonetizeBody2Pre}<span className="text-white font-medium">{t.wizStep1MonetizeBody2Tips}</span>{t.wizStep1MonetizeBody2Mid}<span className="text-white font-medium">{t.wizStep1MonetizeBody2Calls}</span>{t.wizStep1MonetizeBody2Post}<span className="text-white font-medium">{t.wizStep1MonetizeBody2PnpLive}</span>{t.wizStep1MonetizeBody2End}
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Upload photos */}
        {step === 2 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={2} />
            <h2 className="text-base font-bold text-white mt-3.5">{t.wizStep2Title}</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              {t.wizStep2Body}
            </p>

            <label
              className="mt-3.5 flex items-center gap-2.5 px-4 py-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
              style={{ border: "1.5px dashed rgba(212,0,122,0.5)", background: "rgba(212,0,122,0.06)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4007A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              <span className="text-xs font-semibold" style={{ color: "#D4007A" }}>
                {photoUploading ? t.wizStep2UploadingLabel : t.wizStep2ChooseLabel}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={photoUploading}
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  setPhotoUploading(true);
                  setPhotoUploadError(null);
                  let failed = 0;
                  const newItems: CreatorMediaItem[] = [];
                  for (const file of files) {
                    try {
                      const res = await uploadCreatorMediaFile(file);
                      newItems.push(res.item);
                    } catch {
                      failed++;
                    }
                  }
                  setOwnMedia((prev) => [...newItems, ...prev]);
                  if (failed > 0) setPhotoUploadError(t.wizStep2UploadFailed(failed));
                  setPhotoUploading(false);
                  e.target.value = "";
                }}
              />
            </label>

            {photoUploadError && (
              <p className="mt-2 text-[11px] text-red-400">{photoUploadError}</p>
            )}

            {mediaLoading && (
              <p className="mt-3 text-[11px] text-pnp-textSecondary">{t.wizStep2Loading}</p>
            )}
            {!mediaLoading && ownMedia.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {ownMedia.slice(0, 9).map((m) => (
                  <div key={m.id} className="aspect-square rounded-lg overflow-hidden" style={{ background: "#111" }}>
                    {(m.thumbUrl || m.url) ? (
                      <img src={m.thumbUrl || m.url || ""} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[10px] text-white/30">{t.wizStep2PhotoAlt}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!mediaLoading && ownMedia.length === 0 && !photoUploading && (
              <p className="mt-3 text-[11px] text-pnp-textSecondary">{t.wizStep2EmptyState}</p>
            )}

            <TipCallout>
              {t.wizStep2Tip}
            </TipCallout>
          </div>
        )}

        {/* Step 3: Upload a video to your channel */}
        {step === 3 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={3} />
            <h2 className="text-base font-bold text-white mt-3.5">{t.wizStep3Title}</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              {t.wizStep3Body}
            </p>

            {channelsLoading && (
              <p className="mt-3.5 text-[11px] text-pnp-textSecondary">{t.wizStep3LoadingChannels}</p>
            )}

            {!channelsLoading && channels.length === 0 && (
              <div className="mt-3.5 rounded-xl px-3.5 py-3" style={{ background: "#111", border: "1px solid #2A2A2A" }}>
                <p className="text-[11px] text-pnp-textSecondary">
                  {t.wizStep3ChannelsEmpty}
                </p>
                <button
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="mt-2 self-start px-4 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "#D4007A" }}
                >
                  {provisioning ? t.wizStep3ProvisioningBtn : t.wizStep3ProvisionBtn}
                </button>
              </div>
            )}

            {!channelsLoading && channels.length > 0 && (
              <>
                {channels.length > 1 && (
                  <div className="mt-3.5">
                    <p className="text-[10px] font-bold text-pnp-textSecondary mb-1.5">{t.wizStep3UploadToLabel}</p>
                    <div className="flex flex-col gap-1.5">
                      {channels.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setStep3ChannelId(ch.id)}
                          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-all"
                          style={{
                            border: step3ChannelId === ch.id ? "1px solid rgba(212,0,122,0.6)" : "1px solid #2A2A2A",
                            background: step3ChannelId === ch.id ? "rgba(212,0,122,0.08)" : "#111",
                          }}
                        >
                          <div
                            className="w-6 h-6 rounded-lg flex-shrink-0"
                            style={{
                              background: (ch.accessType === "subscription" || ch.accessType === "paid")
                                ? "linear-gradient(135deg,#FFB454,#D4007A)"
                                : "linear-gradient(135deg,#5ED1C4,#7B61FF)",
                            }}
                          />
                          <span className="text-xs font-semibold text-white truncate">{ch.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step3ChannelId !== null && (() => {
                  const ch = channels.find((c) => c.id === step3ChannelId);
                  if (!ch) return null;
                  return (
                    <div className="mt-3.5">
                      <UploadVideoButton
                        channelId={ch.id}
                        channelName={ch.name}
                        channelSlug={ch.slug}
                        accessType={ch.accessType as "free" | "subscription" | "prime" | "paid"}
                        pricePerMonth={ch.priceUsd ?? null}
                        creatorUsername={ch.creatorUsername ?? null}
                        onPublished={(_video: ChannelVideo) => {}}
                        variant="pill"
                      />
                    </div>
                  );
                })()}
              </>
            )}

            {/* Monetization model callout */}
            <div
              className="mt-3.5 rounded-xl px-3.5 py-3"
              style={{ background: "rgba(123,97,255,.07)", border: "1px solid rgba(123,97,255,.25)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#A78BFA" }}>{t.wizStep3EcosystemTag}</p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                {t.wizStep3EcosystemIntro}
              </p>
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">𝕏</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">{t.wizStep3EcosystemXPre}<span className="text-white font-medium">{t.wizStep3EcosystemXBold}</span>{t.wizStep3EcosystemXPost}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">✈️</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">{t.wizStep3EcosystemSubPre}<span className="text-white font-medium">{t.wizStep3EcosystemSubBold}</span>{t.wizStep3EcosystemSubPost}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">🔒</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">{t.wizStep3EcosystemOnlyPre}<span className="text-white font-medium">{t.wizStep3EcosystemOnlyBold}</span>{t.wizStep3EcosystemOnlyPost}</p>
                </div>
              </div>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed mt-2">
                {t.wizStep3EcosystemUnifiedPre}<span className="text-white font-medium">{t.wizStep3EcosystemUnifiedBold}</span>{t.wizStep3EcosystemUnifiedPost}
              </p>
            </div>

            <TipCallout>
              {t.wizStep3Tip}
            </TipCallout>
          </div>
        )}

        {/* Step 4: Content distribution — mirroring + ecosystem rationale */}
        {step === 4 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={4} />
            <h2 className="text-base font-bold text-white mt-3.5">{t.wizStep4Title}</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              {t.wizStep4Body1}
              <span className="text-white font-semibold">{t.wizStep4BodyX}</span>{t.wizStep4BodyAnd}
              <span className="text-white font-semibold">{t.wizStep4BodyTelegram}</span>{t.wizStep4BodyEnd}
            </p>

            {/* Mirroring flow visual */}
            <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1px solid #2A2A2A" }}>
              {/* Free row */}
              <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ background: "#111", borderBottom: "1px solid #1E1E1E" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#5ED1C4" }}>{t.wizStep4FreeTag}</p>
                  <p className="text-[11px] text-pnp-textSecondary mt-0.5">{t.wizStep4FreeSubtag}</p>
                </div>
                <svg className="w-4 h-4 flex-shrink-0 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] font-bold" style={{ color: "#5ED1C4" }}>{t.wizStep4FreeArrow}</p>
                  <p className="text-[10px] text-pnp-textSecondary">{t.wizStep4FreeVisible}</p>
                </div>
              </div>
              {/* Paid row */}
              <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ background: "#111" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#FFB454" }}>{t.wizStep4PaidTag}</p>
                  <p className="text-[11px] text-pnp-textSecondary mt-0.5">{t.wizStep4PaidSubtag}</p>
                </div>
                <svg className="w-4 h-4 flex-shrink-0 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] font-bold" style={{ color: "#FFB454" }}>{t.wizStep4PaidArrow}</p>
                  <p className="text-[10px] text-pnp-textSecondary">{t.wizStep4PaidVisible}</p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-pnp-textSecondary mt-3 leading-relaxed">
              {t.wizStep4Explanation}
            </p>

            {/* Ecosystem analogy */}
            <div className="mt-3.5 rounded-xl px-3.5 py-3" style={{ background: "rgba(123,97,255,.07)", border: "1px solid rgba(123,97,255,.2)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A78BFA" }}>{t.wizStep4WhyWorksTag}</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-px">𝕏</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                    {t.wizStep4WhyBody1Pre}<span className="text-white font-medium">{t.wizStep4WhyBody1Bold}</span>{t.wizStep4WhyBody1Post}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-px">✈️</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                    {t.wizStep4WhyBody2Pre}<span className="text-white font-medium">{t.wizStep4WhyBody2Bold}</span>{t.wizStep4WhyBody2Post}
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription unification */}
            <div className="mt-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(94,209,196,.06)", border: "1px solid rgba(94,209,196,.2)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#5ED1C4" }}>{t.wizStep4OneSubTag}</p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                {t.wizStep4OneSubBodyPre}<span className="text-white font-medium">{t.wizStep4OneSubBodyBold}</span>{t.wizStep4OneSubBodyPost}
              </p>
            </div>

            {/* Channel list */}
            {!channelsLoading && channels.length === 0 && (
              <div className="mt-3.5 flex flex-col gap-2">
                <p className="text-[11px] text-pnp-textSecondary">{t.wizStep4ChannelsMissing}</p>
                {provisionError && <p className="text-[11px] text-red-400">{provisionError}</p>}
                <button
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="self-start px-4 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "#D4007A" }}
                >
                  {provisioning ? t.wizStep3ProvisioningBtn : t.wizStep4CreateChannelsBtn}
                </button>
              </div>
            )}
            {!channelsLoading && channels.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-3.5">
                <p className="text-[10px] font-bold text-pnp-textSecondary uppercase tracking-wide mb-0.5">{t.wizStep4YourChannelsHeader}</p>
                {channels.map((ch) => {
                  const isPaid = ch.accessType === "subscription" || ch.accessType === "paid";
                  return (
                    <div
                      key={ch.id}
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                      style={{ border: "1px solid #2A2A2A", background: "#111" }}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex-shrink-0"
                        style={{
                          background: isPaid
                            ? "linear-gradient(135deg,#FFB454,#D4007A)"
                            : "linear-gradient(135deg,#5ED1C4,#7B61FF)",
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{ch.name}</p>
                        <p className="text-[10px] text-pnp-textSecondary mt-0.5 truncate">
                          {isPaid ? t.wizStep4PaidPostsHint : t.wizStep4FreePostsHint}
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
                        {isPaid ? t.wizStep4PaidBadge : t.wizStep4FreeBadge}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <TipCallout>
              {t.wizStep4Tip}
            </TipCallout>
          </div>
        )}

        {/* Step 5: Private hangout */}
        {step === 5 && (() => {
          const subChannel = channels.find((ch) => ch.accessType === "subscription" && ch.hangoutGroupId);
          const chips = [t.wizStep5ChipCalls, t.wizStep5ChipPrivateShows, t.wizStep5ChipCustomVideos, t.wizStep5ChipTips];
          return (
            <div className="rounded-[14px] p-[18px]" style={{ border: "1px solid rgba(94,209,196,.35)", background: "rgba(94,209,196,.06)" }}>
              <StepIconSquare step={5} />
              <h2 className="text-base font-bold text-white mt-3.5">{t.wizStep5Title}</h2>
              <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
                {t.wizStep5Body}
              </p>
              <p className="text-xs text-pnp-textSecondary mt-2.5 leading-relaxed">
                {t.wizStep5Upsell}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="px-3 py-1.5 rounded-full text-[10px] font-semibold text-white"
                    style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
              {subChannel?.hangoutGroupId ? (
                <button
                  onClick={() => navigate(`/hangouts/${subChannel.hangoutGroupId}`)}
                  className="mt-4 px-4 py-2.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: "rgba(94,209,196,.2)", border: "1px solid rgba(94,209,196,.4)", color: "#5ED1C4" }}
                >
                  {t.wizStep5OpenHangoutBtn}
                </button>
              ) : (
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-[11px] text-pnp-textSecondary">{t.wizStep5NoHangout}</p>
                  {provisionError && <p className="text-[11px] text-red-400">{provisionError}</p>}
                  <button
                    onClick={handleProvision}
                    disabled={provisioning}
                    className="self-start px-4 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                    style={{ background: "#D4007A" }}
                  >
                    {provisioning ? t.wizStep5CreatingBtn : t.wizStep5CreateHangoutBtn}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Step 6: Documents & Compliance */}
        {step === 6 && (() => {
          const isDone = (key: string) => docSetupItems.find(i => i.key === key)?.done ?? null;

          const statusBadge = (status: "accepted" | "verified" | "pending" | null) => {
            if (!status) return null;
            const colors = {
              accepted: { bg: "rgba(52,199,89,0.15)", color: "#34C759", label: t.wizStep6StatusAccepted },
              verified: { bg: "rgba(94,209,196,0.15)", color: "#5ED1C4", label: t.wizStep6StatusVerified },
              pending: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B", label: t.wizStep6StatusPending },
            };
            const c = colors[status];
            return (
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.color }}>
                {c.label}
              </span>
            );
          };

          const sections: Array<{
            title: string;
            items: Array<{
              title: string;
              description: string;
              status: "accepted" | "verified" | "pending" | null;
              actionLabel: string;
              onAction: () => void;
            }>;
          }> = [
            {
              title: t.wizStep6PlatformSection,
              items: [
                {
                  title: t.wizStep6TermsOfService,
                  description: t.wizStep6TosDesc,
                  status: docConsents?.terms_accepted ? "accepted" : null,
                  actionLabel: t.wizStep6ReadBtn,
                  onAction: () => window.open("/terms", "_blank"),
                },
                {
                  title: t.wizStep6PrivacyPolicy,
                  description: t.wizStep6PpDesc,
                  status: docConsents?.privacy_accepted ? "accepted" : null,
                  actionLabel: t.wizStep6ReadBtn,
                  onAction: () => window.open("/privacy", "_blank"),
                },
                {
                  title: t.wizStep6CreatorTerms,
                  description: t.wizStep6CreatorTermsDesc,
                  status: docConsents?.creator_terms_agreed || isDone("creator_terms") ? "accepted" : "pending",
                  actionLabel: t.wizStep6ViewAcceptBtn,
                  onAction: () => navigate("/creators/consents"),
                },
              ],
            },
            {
              title: t.wizStep6ContentSection,
              items: [
                {
                  title: t.wizStep6CommunityGuidelines,
                  description: t.wizStep6CommunityGuidelinesDesc,
                  status: null,
                  actionLabel: t.wizStep6ReadBtn,
                  onAction: () => navigate("/creators/guidelines"),
                },
                {
                  title: t.wizStep6ContentNotice,
                  description: t.wizStep6ContentNoticeDesc,
                  status: docConsents?.content_disclaimer ? "accepted" : "pending",
                  actionLabel: t.wizStep6ViewAcceptBtn,
                  onAction: () => navigate("/creators/consents"),
                },
                {
                  title: t.wizStep6Verification2257,
                  description: t.wizStep6Verification2257Desc,
                  status: isDone("identity") ? "verified" : "pending",
                  actionLabel: isDone("identity") ? t.wizStep6ViewBtn : t.wizStep6CompleteBtn,
                  onAction: () => navigate("/creators/apply"),
                },
              ],
            },
          ];

          return (
            <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
              <StepIconSquare step={6} />
              <h2 className="text-base font-bold text-white mt-3.5">{t.wizStep6Title}</h2>
              <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
                {t.wizStep6Body}
              </p>

              <div className="mt-4 space-y-4">
                {sections.map(section => (
                  <div key={section.title} className="space-y-2">
                    <p className="text-[10px] font-bold text-pnp-textSecondary uppercase tracking-wider px-1">{section.title}</p>
                    {section.items.map(item => (
                      <div
                        key={item.title}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(212,0,122,0.1)" }}>
                          <svg className="w-4 h-4" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white leading-tight">{item.title}</p>
                          <p className="text-[10px] text-pnp-textSecondary mt-0.5 leading-relaxed">{item.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {statusBadge(item.status)}
                          <button
                            onClick={item.onAction}
                            className="text-[10px] font-semibold transition-colors hover:opacity-80"
                            style={{ color: "#D4007A" }}
                          >
                            {item.actionLabel} →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Footer nav */}
        <div className="flex gap-2">
          <button
            onClick={wizBack}
            disabled={step === 1}
            className="flex-1 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-35"
            style={{ border: "1px solid rgba(255,255,255,.15)", background: "#161616" }}
          >
            {t.wizBackBtn}
          </button>
          <button
            onClick={wizNext}
            className="flex-[2] py-3 rounded-lg text-sm font-bold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
          >
            {step === TOTAL_STEPS ? t.wizFinishBtn : t.wizNextBtn}
          </button>
        </div>
      </div>

      {/* ── Documents & Consents ─────────────────────────────────────────── */}
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t.wizDocsConsentsFooter}
        </p>
        <CreatorConsents />
      </div>
    </div>
  );
}
