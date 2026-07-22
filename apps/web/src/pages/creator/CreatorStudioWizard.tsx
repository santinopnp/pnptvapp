import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { StepDots } from "@pnptv/ui-kit";
import { getOwnChannels, provisionCreatorDefaults, uploadCreatorMediaFile, listOwnCreatorMedia, getCreatorSetupStatus, getCreatorConsents, type CreatorChannel, type CreatorMediaItem, type ChannelVideo } from "@/lib/api";
import { UploadVideoButton } from "@/components/channels/UploadVideoButton";
import { CreatorConsents } from "@/components/creators/CreatorLayout";

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
      setProvisionError("Something went wrong. Try again.");
    } finally {
      setProvisioning(false);
    }
  }, [loadChannels]);

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
    <div className="min-h-screen" style={{ background: "var(--pnp-background, #121212)" }}>
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
        <StepDots
          total={TOTAL_STEPS}
          current={step}
          onStepClick={(n) => setStep(n as 1 | 2 | 3 | 4 | 5 | 6)}
        />

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

            {/* Monetization context: PNP Live */}
            <div
              className="mt-3.5 rounded-xl px-3.5 py-3"
              style={{ background: "rgba(212,0,122,.07)", border: "1px solid rgba(212,0,122,.25)" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#D4007A" }}>La forma más rápida de monetizar</p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                Hacer streaming en <span className="text-white font-medium">PNP Live</span> es el camino más directo: solo ponete en línea y atraé viewers a tu show. Para entrar, los usuarios necesitan tokens ya comprados. Después de <span className="text-white font-medium">15 minutos gratuitos</span> se descuenta <span className="text-white font-medium">1 token por minuto</span> de su saldo para poder quedarse.
              </p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed mt-1.5">
                También podés recibir <span className="text-white font-medium">tips en vivo</span> y agendar <span className="text-white font-medium">llamadas privadas</span> pagas. Configurás todo eso desde <span className="text-white font-medium">PNP Live</span> en el menú lateral.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Upload photos */}
        {step === 2 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={2} />
            <h2 className="text-base font-bold text-white mt-3.5">Sube tus mejores fotos</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              Aparecen en la fila de FOTOS en la parte superior de tu perfil. Elige shots que muestren tu vibra y los fetiches que te gustan.
            </p>

            <label
              className="mt-3.5 flex items-center gap-2.5 px-4 py-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
              style={{ border: "1.5px dashed rgba(212,0,122,0.5)", background: "rgba(212,0,122,0.06)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4007A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              <span className="text-xs font-semibold" style={{ color: "#D4007A" }}>
                {photoUploading ? "Subiendo…" : "Elegir fotos"}
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
                  if (failed > 0) setPhotoUploadError(`${failed} foto${failed > 1 ? "s" : ""} no se pudo subir.`);
                  setPhotoUploading(false);
                  e.target.value = "";
                }}
              />
            </label>

            {photoUploadError && (
              <p className="mt-2 text-[11px] text-red-400">{photoUploadError}</p>
            )}

            {mediaLoading && (
              <p className="mt-3 text-[11px] text-pnp-textSecondary">Cargando tus fotos…</p>
            )}
            {!mediaLoading && ownMedia.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {ownMedia.slice(0, 9).map((m) => (
                  <div key={m.id} className="aspect-square rounded-lg overflow-hidden" style={{ background: "#111" }}>
                    {(m.thumbUrl || m.url) ? (
                      <img src={m.thumbUrl || m.url || ""} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[10px] text-white/30">Foto</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!mediaLoading && ownMedia.length === 0 && !photoUploading && (
              <p className="mt-3 text-[11px] text-pnp-textSecondary">Aún no tienes fotos — sube la primera arriba.</p>
            )}

            <TipCallout>
              Elige fotos que muestren lo bueno que va a ser tu show — y los fetiches que te gustan.
            </TipCallout>
          </div>
        )}

        {/* Step 3: Upload a video to your channel */}
        {step === 3 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={3} />
            <h2 className="text-base font-bold text-white mt-3.5">Sube tu primer video</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              Los videos que subes a un canal aparecen en la fila de VIDEOS de tu perfil. Los teasers cortos venden mejor — caliente y directo al grano.
            </p>

            {channelsLoading && (
              <p className="mt-3.5 text-[11px] text-pnp-textSecondary">Cargando tus canales…</p>
            )}

            {!channelsLoading && channels.length === 0 && (
              <div className="mt-3.5 rounded-xl px-3.5 py-3" style={{ background: "#111", border: "1px solid #2A2A2A" }}>
                <p className="text-[11px] text-pnp-textSecondary">
                  Tus canales se configuran en el siguiente paso. Vuelve aquí después del paso 4 para subir videos.
                </p>
                <button
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="mt-2 self-start px-4 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "#D4007A" }}
                >
                  {provisioning ? "Configurando…" : "Configurar mis canales →"}
                </button>
              </div>
            )}

            {!channelsLoading && channels.length > 0 && (
              <>
                {channels.length > 1 && (
                  <div className="mt-3.5">
                    <p className="text-[10px] font-bold text-pnp-textSecondary mb-1.5">SUBIR A</p>
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
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#A78BFA" }}>El modelo: OnlyFans + Telegram + X en uno</p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                PNPtv fusiona tres ecosistemas que ya conocen tus fans en uno solo:
              </p>
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">𝕏</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">Posts free en tu muro = tu <span className="text-white font-medium">timeline público</span> para que te descubran.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">✈️</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">Canal de suscripción = tu <span className="text-white font-medium">canal privado de Telegram</span> — solo entran los que pagan.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0">🔒</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">Muro de videos exclusivos = tu <span className="text-white font-medium">OnlyFans</span> — membresía mensual, $5–$15/mes según tu tier.</p>
                </div>
              </div>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed mt-2">
                Un solo pago da acceso a <span className="text-white font-medium">todo</span>: canal, hangout y muro. Tus fans no tienen que comprar tres cosas distintas.
              </p>
            </div>

            <TipCallout>
              Elige teasers que vendan la vibra de tu show — cortos, calientes y directos al grano.
            </TipCallout>
          </div>
        )}

        {/* Step 4: Content distribution — mirroring + ecosystem rationale */}
        {step === 4 && (
          <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
            <StepIconSquare step={4} />
            <h2 className="text-base font-bold text-white mt-3.5">Tu muro = tu feed. Automático.</h2>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              PNPtv está diseñado para funcionar como los ecosistemas que ya conocen tus fans —
              <span className="text-white font-semibold"> X / Twitter</span> y{" "}
              <span className="text-white font-semibold">Telegram</span> — sin obligarlos a aprender algo nuevo ni sacarlos de su rutina.
            </p>

            {/* Mirroring flow visual */}
            <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1px solid #2A2A2A" }}>
              {/* Free row */}
              <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ background: "#111", borderBottom: "1px solid #1E1E1E" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#5ED1C4" }}>Post free en tu muro</p>
                  <p className="text-[11px] text-pnp-textSecondary mt-0.5">Texto, foto, video corto</p>
                </div>
                <svg className="w-4 h-4 flex-shrink-0 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] font-bold" style={{ color: "#5ED1C4" }}>Canal Gratis</p>
                  <p className="text-[10px] text-pnp-textSecondary">visible para todos</p>
                </div>
              </div>
              {/* Paid row */}
              <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ background: "#111" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#FFB454" }}>Post exclusivo en tu muro</p>
                  <p className="text-[11px] text-pnp-textSecondary mt-0.5">Video ≥ 4 min con candado</p>
                </div>
                <svg className="w-4 h-4 flex-shrink-0 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] font-bold" style={{ color: "#FFB454" }}>Canal de Pago</p>
                  <p className="text-[10px] text-pnp-textSecondary">solo suscriptores</p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-pnp-textSecondary mt-3 leading-relaxed">
              No tienes que hacer nada extra. Publicas desde tu perfil como siempre, y la app separa el contenido automáticamente. Libre = canal público. Exclusivo = canal de suscripción.
            </p>

            {/* Ecosystem analogy */}
            <div className="mt-3.5 rounded-xl px-3.5 py-3" style={{ background: "rgba(123,97,255,.07)", border: "1px solid rgba(123,97,255,.2)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A78BFA" }}>¿Por qué funciona así?</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-px">𝕏</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                    Tu <span className="text-white font-medium">canal gratis</span> es como tu timeline público en X — los fans te descubren, ven tus teasers, te siguen.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-px">✈️</span>
                  <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                    Tu <span className="text-white font-medium">canal de suscripción</span> es como tu canal privado de Telegram — solo entran los que pagan, y ahí está lo bueno.
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription unification */}
            <div className="mt-3 rounded-xl px-3.5 py-3" style={{ background: "rgba(94,209,196,.06)", border: "1px solid rgba(94,209,196,.2)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#5ED1C4" }}>Una sola suscripción</p>
              <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
                Cuando alguien se suscribe a tu perfil, automáticamente tiene acceso a tu canal de pago <span className="text-white font-medium">y</span> a tu hangout privado. No hay que comprar dos cosas. Un cobro = todo el acceso.
              </p>
            </div>

            {/* Channel list */}
            {!channelsLoading && channels.length === 0 && (
              <div className="mt-3.5 flex flex-col gap-2">
                <p className="text-[11px] text-pnp-textSecondary">Tus canales aún no están creados.</p>
                {provisionError && <p className="text-[11px] text-red-400">{provisionError}</p>}
                <button
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="self-start px-4 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "#D4007A" }}
                >
                  {provisioning ? "Configurando…" : "Crear mis canales →"}
                </button>
              </div>
            )}
            {!channelsLoading && channels.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-3.5">
                <p className="text-[10px] font-bold text-pnp-textSecondary uppercase tracking-wide mb-0.5">Tus canales</p>
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
                          {isPaid ? "Posts exclusivos → aquí automático" : "Posts free → aquí automático"}
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
                        {isPaid ? "PAGO" : "GRATIS"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <TipCallout>
              Publica teasers free con frecuencia para que el algoritmo te muestre a más gente. Reserva el contenido largo y explícito para el canal de pago — eso es lo que convierte seguidores en suscriptores.
            </TipCallout>
          </div>
        )}

        {/* Step 5: Private hangout */}
        {step === 5 && (() => {
          const subChannel = channels.find((ch) => ch.accessType === "subscription" && ch.hangoutGroupId);
          return (
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
              {subChannel?.hangoutGroupId ? (
                <button
                  onClick={() => navigate(`/hangouts/${subChannel.hangoutGroupId}`)}
                  className="mt-4 px-4 py-2.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: "rgba(94,209,196,.2)", border: "1px solid rgba(94,209,196,.4)", color: "#5ED1C4" }}
                >
                  Open My Subscriber Hangout →
                </button>
              ) : (
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-[11px] text-pnp-textSecondary">No subscriber hangout yet.</p>
                  {provisionError && <p className="text-[11px] text-red-400">{provisionError}</p>}
                  <button
                    onClick={handleProvision}
                    disabled={provisioning}
                    className="self-start px-4 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                    style={{ background: "#D4007A" }}
                  >
                    {provisioning ? "Setting up…" : "Create My Subscriber Hangout →"}
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
              accepted: { bg: "rgba(52,199,89,0.15)", color: "#34C759", label: "Accepted" },
              verified: { bg: "rgba(94,209,196,0.15)", color: "#5ED1C4", label: "Verified" },
              pending: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B", label: "Pendiente" },
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
              title: "Acuerdos de plataforma",
              items: [
                {
                  title: "Términos de Servicio",
                  description: "Reglas de uso, estándares de comunidad y resolución de disputas.",
                  status: docConsents?.terms_accepted ? "accepted" : null,
                  actionLabel: "Leer",
                  onAction: () => window.open("/terms", "_blank"),
                },
                {
                  title: "Política de Privacidad",
                  description: "Cómo PNPtv! recopila, usa y protege tus datos.",
                  status: docConsents?.privacy_accepted ? "accepted" : null,
                  actionLabel: "Leer",
                  onAction: () => window.open("/privacy", "_blank"),
                },
                {
                  title: "Términos del Programa de Creadores",
                  description: "División de ingresos (70/30), calendario de pagos, propiedad del contenido, política de desactivación.",
                  status: docConsents?.creator_terms_agreed || isDone("creator_terms") ? "accepted" : "pending",
                  actionLabel: "Ver y Aceptar",
                  onAction: () => navigate("/creators/consents"),
                },
              ],
            },
            {
              title: "Cumplimiento de contenido",
              items: [
                {
                  title: "Guías de Comunidad",
                  description: "Reglas de contenido, tipos de canales, sistema de strikes y estándares de comunidad.",
                  status: null,
                  actionLabel: "Leer",
                  onAction: () => navigate("/creators/guidelines"),
                },
                {
                  title: "Aviso de Contenido",
                  description: "Confirma que los accesorios y sustancias mostrados son simulados, solo con fines de entretenimiento.",
                  status: docConsents?.content_disclaimer ? "accepted" : "pending",
                  actionLabel: "Ver y Aceptar",
                  onAction: () => navigate("/creators/consents"),
                },
                {
                  title: "Verificación de Identidad 2257",
                  description: "Verificación de edad y cumplimiento de registros (18 U.S.C. § 2257).",
                  status: isDone("identity") ? "verified" : "pending",
                  actionLabel: isDone("identity") ? "Ver" : "Completar",
                  onAction: () => navigate("/creators/apply"),
                },
              ],
            },
          ];

          return (
            <div className="rounded-[14px] p-[18px]" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
              <StepIconSquare step={6} />
              <h2 className="text-base font-bold text-white mt-3.5">Tus documentos</h2>
              <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
                Acuerdos y registros de cumplimiento. Los que ya están firmados se muestran tal como están — no se resetean al revisar este paso.
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

      {/* ── Documents & Consents ─────────────────────────────────────────── */}
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "rgba(255,255,255,0.45)" }}>
          Documents & Consents
        </p>
        <CreatorConsents />
      </div>
    </div>
  );
}
