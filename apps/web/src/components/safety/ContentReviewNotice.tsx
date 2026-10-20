import React, { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { installApiResponseEvents, onContentPendingReview } from "@/lib/apiResponseEvents";

/** Tells a creator their upload is waiting for pre-publication review. */
export function ContentReviewNotice() {
  const t = useI18n().safety;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    installApiResponseEvents();
    let timer: number | undefined;
    const off = onContentPendingReview(() => {
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 8000);
    });
    return () => { off(); window.clearTimeout(timer); };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed left-4 right-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl p-4 shadow-lg"
      style={{ background: "linear-gradient(160deg,#1a1a2e 0%,#0f0f1a 100%)", border: "1px solid rgba(230,145,56,0.4)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white">{t.reviewNoticeTitle}</p>
          <p className="text-xs mt-1" style={{ color: "#8E8E93" }}>{t.reviewNoticeBody}</p>
        </div>
        <button onClick={() => setVisible(false)} aria-label="Close" className="text-white/50 hover:text-white text-lg leading-none">×</button>
      </div>
    </div>
  );
}
