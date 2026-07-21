import React from "react";

export interface StepDotsProps {
  /** Total number of steps. */
  total: number;
  /** 1-indexed current step. */
  current: number;
  /** Omit to render non-interactive dots (e.g. a gated payment flow). */
  onStepClick?: (step: number) => void;
  className?: string;
}

/**
 * 30px numbered step-dot row — current = pink→purple gradient, done = pink-tinted,
 * todo = dark. Shared across CreatorStudioWizard, PayWithCryptoWizard, and
 * CryptoOnboardingWizard so the three wizards stay visually identical.
 */
export function StepDots({ total, current, onStepClick, className }: StepDotsProps) {
  return (
    <div className={`flex gap-1.5 ${className ?? ""}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const isCurrent = n === current;
        const isDone = n < current;
        const style = isCurrent
          ? { background: "linear-gradient(135deg,#D4007A,#7B61FF)", color: "#fff" }
          : isDone
            ? { background: "rgba(212,0,122,.18)", color: "#FF4DA6" }
            : { background: "#1E1E1E", color: "rgba(255,255,255,.35)" };

        if (!onStepClick) {
          return (
            <div
              key={n}
              className="w-[30px] h-[30px] rounded-full text-xs font-bold flex items-center justify-center"
              style={style}
              aria-current={isCurrent ? "step" : undefined}
            >
              {n}
            </div>
          );
        }

        return (
          <button
            key={n}
            type="button"
            onClick={() => onStepClick(n)}
            className="w-[30px] h-[30px] rounded-full text-xs font-bold flex items-center justify-center transition-colors"
            style={style}
            aria-label={`Go to step ${n}`}
            aria-current={isCurrent ? "step" : undefined}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
