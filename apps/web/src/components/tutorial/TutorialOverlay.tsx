import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { tutorialContent } from "@/lib/tutorialContent";
import { TutorialSlideView } from "./TutorialSlide";
import { TutorialProgress } from "./TutorialProgress";

interface TutorialOverlayProps {
  section: string;
  onDismiss: () => void;
  onDismissForever?: () => void;
}

// ─── Welcome video chapters ────────────────────────────────────────────────
const VIDEO_CHAPTERS = [
  { t: 0,   label: { en: "Overview", es: "Resumen" } },
  { t: 242, label: { en: "Feed", es: "Feed" } },
  { t: 305, label: { en: "Hangouts", es: "Hangouts" } },
  { t: 357, label: { en: "Main Stage", es: "Main Stage" } },
  { t: 460, label: { en: "Connect", es: "Connect" } },
  { t: 526, label: { en: "Channels", es: "Canales" } },
  { t: 617, label: { en: "Live", es: "Live" } },
  { t: 674, label: { en: "Top Menu", es: "Menú" } },
  { t: 726, label: { en: "Cristina AI", es: "Cristina AI" } },
  { t: 886, label: { en: "Ru$h Wallet", es: "Ru$h Wallet" } },
];

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function WelcomeVideoOverlay({ onDismiss, onDismissForever, lang }: {
  onDismiss: () => void;
  onDismissForever?: () => void;
  lang: "en" | "es";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [exiting, setExiting] = useState(false);
  const es = lang === "es";

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const close = useCallback(() => {
    setExiting(true);
    videoRef.current?.pause();
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const seekTo = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      videoRef.current.play().catch(() => {});
    }
  };

  const activeChapter = VIDEO_CHAPTERS.reduce((acc, ch) =>
    currentTime >= ch.t ? ch : acc, VIDEO_CHAPTERS[0]);

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col ${exiting ? "tutorial-overlay-exit" : "tutorial-overlay-enter"}`}
      style={{ background: "rgba(0,0,0,0.96)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <div>
          <p className="text-xs text-white/50 uppercase tracking-wider">{es ? "Tutorial PNPtv!" : "PNPtv! Tutorial"}</p>
          <p className="text-sm font-semibold text-white">{activeChapter.label[lang]}</p>
        </div>
        <button onClick={close} className="p-2 rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Video */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-0 min-h-0">
        <video
          ref={videoRef}
          src="/tutorial/welcome.mp4"
          controls
          playsInline
          className="h-full w-full object-contain"
          style={{ maxHeight: "100%", background: "#000" }}
          onTimeUpdate={() => setCurrentTime(Math.floor(videoRef.current?.currentTime ?? 0))}
        />
      </div>

      {/* Chapters */}
      <div className="flex-shrink-0 px-3 py-2 overflow-x-auto">
        <div className="flex gap-2 pb-1" style={{ minWidth: "max-content" }}>
          {VIDEO_CHAPTERS.map((ch) => {
            const active = activeChapter.t === ch.t;
            return (
              <button
                key={ch.t}
                onClick={() => seekTo(ch.t)}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? "bg-[#D4007A] text-white"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                <span className="opacity-60 mr-1">{fmt(ch.t)}</span>
                {ch.label[lang]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pb-4 pt-1">
        {onDismissForever && (
          <button
            onClick={() => { setExiting(true); setTimeout(onDismissForever!, 300); }}
            className="text-xs text-white/30 hover:text-white/60 transition"
          >
            {es ? "No mostrar de nuevo" : "Don't show again"}
          </button>
        )}
        <button
          onClick={close}
          className="ml-auto px-4 py-2 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 transition"
        >
          {es ? "Cerrar" : "Close"}
        </button>
      </div>
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

export function TutorialOverlay({ section, onDismiss, onDismissForever }: TutorialOverlayProps) {
  const { user } = useAuth();
  const lang = user?.language === "es" ? "es" : "en";

  // Welcome video gets its own full-screen video player
  if (section === "welcome-video") {
    return <WelcomeVideoOverlay onDismiss={onDismiss} onDismissForever={onDismissForever} lang={lang as "en" | "es"} />;
  }

  const content = tutorialContent[section];
  const slides = content?.slides ?? [];
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [exiting, setExiting] = useState(false);

  const touchStartX = useRef(0);

  // Lock body scroll while overlay is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const close = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const next = useCallback(() => {
    if (index >= slides.length - 1) {
      close();
    } else {
      setDirection("right");
      setIndex((i) => i + 1);
    }
  }, [index, slides.length, close]);

  const back = useCallback(() => {
    if (index > 0) {
      setDirection("left");
      setIndex((i) => i - 1);
    }
  }, [index]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) < 50) return;
    if (dx > 0) next();
    else back();
  }, [next, back]);

  if (!content) return null;

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 ${exiting ? "tutorial-overlay-exit" : "tutorial-overlay-enter"}`}
      style={{ background: "rgba(0, 0, 0, 0.80)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="tutorial-glass-card w-full max-w-sm p-6">
        <TutorialSlideView
          slide={slides[index]}
          direction={direction}
          lang={lang as "en" | "es"}
        />
        <div className="mt-6">
          <TutorialProgress
            current={index}
            total={slides.length}
            onBack={back}
            onNext={next}
            onSkip={close}
            lang={lang as "en" | "es"}
          />
          {onDismissForever && (
            <button
              onClick={() => {
                setExiting(true);
                setTimeout(onDismissForever, 300);
              }}
              className="w-full mt-3 py-2 text-xs text-white/40 hover:text-white/70 transition-colors text-center"
            >
              {lang === "es" ? "No mostrar de nuevo" : "Don't show again"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
