import React, { useState, useEffect } from "react";
import { submitCallSurvey, CallSurveyPayload } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface PostCallSurveyModalProps {
  open: boolean;
  bookingId: string | number;
  creatorName: string;
  onClose: () => void;
}

// 1..4 flame rating. Filled flames are orange; unfilled are outline grey.
// The rating scale used to be 1..5 stars; we intentionally cap at 4 flames so
// members give a decisive rating (no lukewarm "3 out of 5" default).
const FLAME_LEVELS = [1, 2, 3, 4] as const;

function FlameIcon({ filled, size = 28 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "url(#pnp-flame-grad)" : "none"}
      stroke={filled ? "#FF6A00" : "#636366"}
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pnp-flame-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FF6A00" />
          <stop offset="0.6" stopColor="#FF9F0A" />
          <stop offset="1" stopColor="#FFD60A" />
        </linearGradient>
      </defs>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 2s1.5 3 3.5 5C18 9.5 19 12 19 14.5A7 7 0 0 1 5 14.5c0-2 .8-3.7 2.5-5C9 8 10 6 10 4c1 1 2 1 2-2z"
      />
    </svg>
  );
}

function FlameRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-white/90 flex-1">{label}</span>
      <div
        className="flex gap-1"
        role="radiogroup"
        aria-label={label}
      >
        {FLAME_LEVELS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} / 4`}
            onClick={() => onChange(value === n ? 0 : n)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <FlameIcon filled={n <= value} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PostCallSurveyModal({
  open,
  bookingId,
  creatorName,
  onClose,
}: PostCallSurveyModalProps) {
  const t = useI18n();
  const [rating, setRating] = useState(0);
  const [techQuality, setTechQuality] = useState(0);
  const [performanceQuality, setPerformanceQuality] = useState(0);
  const [presentation, setPresentation] = useState(0);
  const [politeness, setPoliteness] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRating(0);
      setTechQuality(0);
      setPerformanceQuality(0);
      setPresentation(0);
      setPoliteness(0);
      setComment("");
      setSubmitted(false);
      setError(null);
    }
  }, [open]);

  const modalRef = React.useRef<HTMLDivElement>(null);

  // Escape key + focus trap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!submitting) onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const arr = Array.from(focusable).filter((el) => !el.hasAttribute("disabled"));
        if (arr.length === 0) return;
        const first = arr[0];
        const last = arr[arr.length - 1];
        if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const allRated = rating > 0 && techQuality > 0 && performanceQuality > 0 && presentation > 0 && politeness > 0;

  const handleSubmit = async () => {
    if (!allRated) return;
    setSubmitting(true);
    setError(null);
    try {
      // rating is 1..4 (capped by FLAME_LEVELS). Backend accepts 1..5 for
      // backwards compat with historical 5-star surveys; we just never send 5.
      const payload: CallSurveyPayload = {
        rating: rating as 1 | 2 | 3 | 4,
        tech_quality: techQuality as 1 | 2 | 3 | 4,
        performance_quality: performanceQuality as 1 | 2 | 3 | 4,
        presentation: presentation as 1 | 2 | 3 | 4,
        politeness: politeness as 1 | 2 | 3 | 4,
        ...(comment.trim() ? { feedback: comment.trim() } : {}),
        share_with_model: true,
      };
      await submitCallSurvey(bookingId, payload);
      setSubmitted(true);
      setTimeout(onClose, 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.creator.surveyFailedToSubmit);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={() => { if (!submitting) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t.creator.ariaPostCallSurvey}
    >
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-2xl"
        style={{
          background: "var(--pnp-surface, #1C1C1E)",
          border: "1px solid rgba(255,255,255,0.1)",
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-6" aria-live="assertive" aria-atomic="true">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,159,10,0.15)" }}
              >
                <FlameIcon filled size={32} />
              </div>
              <span className="text-white font-semibold text-lg">{t.creator.surveyThankYou}</span>
              <span className="text-sm" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                {t.creator.surveyFeedbackHelps}
              </span>
            </div>
          ) : (
            <>
              <h3 className="text-white font-semibold text-lg text-center mb-1">
                {t.creator.surveyHowWasCall}
              </h3>
              <p className="text-sm text-center mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                {t.creator.surveyWith(creatorName)}
              </p>

              <FlameRow label={t.creator.surveyOverall}     value={rating}             onChange={setRating} />
              <FlameRow label={t.creator.surveyTech}        value={techQuality}        onChange={setTechQuality} />
              <FlameRow label={t.creator.surveyPerformance} value={performanceQuality} onChange={setPerformanceQuality} />
              <FlameRow label={t.creator.surveyPresentation} value={presentation}      onChange={setPresentation} />
              <FlameRow label={t.creator.surveyPoliteness}  value={politeness}         onChange={setPoliteness} />

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t.creator.surveyPlaceholder}
                rows={3}
                maxLength={2000}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none mt-4"
                style={{
                  background: "var(--pnp-surface-hover, #2C2C2E)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#EBEBF5",
                  outline: "none",
                }}
              />

              {error && (
                <p className="text-xs text-center mt-3" style={{ color: "#FF6B6B" }}>
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!allRated || submitting}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-opacity disabled:opacity-40 btn-gradient mt-4"
              >
                {submitting ? t.creator.surveySubmitting : t.creator.surveySubmit}
              </button>

              <button
                onClick={onClose}
                className="w-full py-2 mt-2 text-sm text-center"
                style={{ color: "var(--pnp-text-secondary, #8E8E93)", background: "none", border: "none", cursor: "pointer" }}
              >
                {t.creator.surveySkip}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
