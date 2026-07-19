import React, { useState, useEffect } from "react";
import { submitCallSurvey, CallSurveyPayload } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface PostCallSurveyModalProps {
  open: boolean;
  bookingId: string | number;
  creatorName: string;
  onClose: () => void;
}

function StarRow({
  label,
  value,
  onChange,
  size = 24,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className="text-xs w-28 flex-none"
        style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
      >
        {label}
      </span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(value === star ? 0 : star)}
            className="flex items-center justify-center transition-transform hover:scale-110 focus-visible:outline-none"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              minWidth: size + 8,
              minHeight: size + 8,
            }}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            <svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill={star <= value ? "#FFD60A" : "none"}
              stroke={star <= value ? "#FFD60A" : "#636366"}
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
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
  const [feedback, setFeedback] = useState("");
  const [techImprovement, setTechImprovement] = useState("");
  const [appFeedback, setAppFeedback] = useState("");
  const [equipmentFeedback, setEquipmentFeedback] = useState("");
  const [shareWithModel, setShareWithModel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset all state each time the modal opens
  useEffect(() => {
    if (open) {
      setRating(0);
      setTechQuality(0);
      setPerformanceQuality(0);
      setPresentation(0);
      setPoliteness(0);
      setFeedback("");
      setTechImprovement("");
      setAppFeedback("");
      setEquipmentFeedback("");
      setShareWithModel(false);
      setSubmitted(false);
      setError(null);
    }
  }, [open]);

  const modalRef = React.useRef<HTMLDivElement>(null);

  // Escape key handler + focus trap
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
        const focusableArr = Array.from(focusable).filter(
          (el) => !el.hasAttribute("disabled")
        );
        if (focusableArr.length === 0) return;
        const first = focusableArr[0];
        const last = focusableArr[focusableArr.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: CallSurveyPayload = {
        rating: rating as 1 | 2 | 3 | 4 | 5,
        ...(techQuality > 0
          ? { tech_quality: techQuality as 1 | 2 | 3 | 4 | 5 }
          : {}),
        ...(performanceQuality > 0
          ? { performance_quality: performanceQuality as 1 | 2 | 3 | 4 | 5 }
          : {}),
        ...(presentation > 0
          ? { presentation: presentation as 1 | 2 | 3 | 4 | 5 }
          : {}),
        ...(politeness > 0
          ? { politeness: politeness as 1 | 2 | 3 | 4 | 5 }
          : {}),
        ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
        ...(techImprovement.trim()
          ? { tech_improvement: techImprovement.trim() }
          : {}),
        ...(appFeedback.trim() ? { app_feedback: appFeedback.trim() } : {}),
        ...(equipmentFeedback.trim()
          ? { equipment_feedback: equipmentFeedback.trim() }
          : {}),
        share_with_model: shareWithModel,
      };
      await submitCallSurvey(bookingId, payload);
      setSubmitted(true);
      setTimeout(onClose, 2500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t.creator.surveyFailedToSubmit
      );
    } finally {
      setSubmitting(false);
    }
  };

  const textareaStyle: React.CSSProperties = {
    background: "var(--pnp-surface-hover, #2C2C2E)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#EBEBF5",
    outline: "none",
  };

  const sectionHeading = (title: string) => (
    <p
      className="text-xs font-semibold uppercase tracking-wide mb-2"
      style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
    >
      {title}
    </p>
  );

  const divider = (
    <div
      style={{
        borderTop: "1px solid rgba(255,255,255,0.08)",
        margin: "16px 0",
      }}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={() => {
        if (!submitting) onClose();
      }}
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
            <div
              className="flex flex-col items-center gap-3 py-6"
              aria-live="assertive"
              aria-atomic="true"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(52,199,89,0.15)" }}
              >
                <svg
                  width="28"
                  height="28"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#34C759"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <span className="text-white font-semibold text-lg">
                {t.creator.surveyThankYou}
              </span>
              <span
                className="text-sm"
                style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
              >
                {t.creator.surveyFeedbackHelps}
              </span>
            </div>
          ) : (
            <>
              <h3 className="text-white font-semibold text-lg text-center mb-1">
                {t.creator.surveyHowWasCall}
              </h3>
              <p
                className="text-sm text-center mb-5"
                style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
              >
                {t.creator.surveyWith(creatorName)}
              </p>

              {/* Section 1 — Overall rating (required) */}
              {sectionHeading("Overall Experience")}
              <div
                className="flex justify-center gap-1 mb-1"
                role="radiogroup"
                aria-label={t.creator.ariaRateYourCall}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    role="radio"
                    aria-checked={rating === star}
                    onClick={() => setRating(rating === star ? 0 : star)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C1C1E] rounded-lg"
                    style={{ background: "none", border: "none", cursor: "pointer" }}
                    aria-label={
                      star === 1
                        ? t.creator.ariaStar(star)
                        : t.creator.ariaStars(star)
                    }
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill={star <= rating ? "#FFD60A" : "none"}
                      stroke={star <= rating ? "#FFD60A" : "#636366"}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                ))}
              </div>

              {divider}

              {/* Section 2 — Category ratings (optional) */}
              {sectionHeading("Rate specific aspects (optional)")}
              <StarRow
                label="Tech Quality"
                value={techQuality}
                onChange={setTechQuality}
              />
              <StarRow
                label="Performance"
                value={performanceQuality}
                onChange={setPerformanceQuality}
              />
              <StarRow
                label="Presentation"
                value={presentation}
                onChange={setPresentation}
              />
              <StarRow
                label="Politeness"
                value={politeness}
                onChange={setPoliteness}
              />

              {divider}

              {/* Section 3 — Open-ended questions (optional) */}
              {sectionHeading("Help us improve (optional)")}
              <div className="flex flex-col gap-3">
                <textarea
                  value={techImprovement}
                  onChange={(e) => setTechImprovement(e.target.value)}
                  placeholder="What could be improved in the tech quality? (video, audio, connection...)"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
                  style={textareaStyle}
                />
                <textarea
                  value={appFeedback}
                  onChange={(e) => setAppFeedback(e.target.value)}
                  placeholder="Any feedback about the PNPtv app itself?"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
                  style={textareaStyle}
                />
                <textarea
                  value={equipmentFeedback}
                  onChange={(e) => setEquipmentFeedback(e.target.value)}
                  placeholder="Feedback about the creator's equipment or setup?"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
                  style={textareaStyle}
                />
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={t.creator.surveyPlaceholder}
                  rows={2}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
                  style={textareaStyle}
                />
              </div>

              {divider}

              {/* Section 4 — Share with creator */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={shareWithModel}
                  onChange={(e) => setShareWithModel(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-yellow-400 flex-none"
                  style={{ cursor: "pointer" }}
                />
                <div>
                  <span className="text-sm text-white">
                    Share this feedback with {creatorName}
                  </span>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
                  >
                    They'll see your ratings and written responses. Your
                    identity will be shown as your username.
                  </p>
                </div>
              </label>

              {error && (
                <p
                  className="text-xs text-center mt-4"
                  style={{ color: "#FF6B6B" }}
                >
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={rating < 1 || submitting}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-opacity disabled:opacity-40 btn-gradient mt-5"
              >
                {submitting ? t.creator.surveySubmitting : "Submit Feedback"}
              </button>

              <button
                onClick={onClose}
                className="w-full py-2 mt-2 text-sm text-center"
                style={{
                  color: "var(--pnp-text-secondary, #8E8E93)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
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
