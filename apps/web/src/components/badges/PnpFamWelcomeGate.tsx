import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getProfile } from "@/lib/api";
import { PnpFamWelcomeModal } from "./PnpFamWelcomeModal";
import { PnpFamBenefitsModal } from "./PnpFamBenefitsModal";
import { PnpFamFeedCustomizer, type Shortcut } from "./PnpFamFeedCustomizer";

/**
 * Sequences the PNP Fam onboarding "one breathtaking moment":
 *
 *   1. Welcome modal  (auto when pnptvFamWelcomePending===true)
 *   2. Benefits modal (auto when pnptvFamBenefitsPending===true, right after
 *      welcome dismisses in the same session for maximum impact)
 *   3. Feed customizer (only if the user tapped "Set up my feed" in the
 *      benefits modal; skipping the benefits modal also skips this step)
 *
 * Preview mode — `?preview=pnp-fam-welcome` — walks Santino through the
 * entire sequence with no persistence. Used for canary approval.
 *
 * After each real dismissal the DB flag is set; the modal never fires again
 * for that user. Feed customizer is optional at any time later via the
 * feed header's "Customize" button.
 */
type Stage = "idle" | "welcome" | "benefits" | "customizer";

export function PnpFamWelcomeGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewParam = searchParams.get("preview") === "pnp-fam-welcome";

  const [stage, setStage] = useState<Stage>("idle");
  const [initialShortcuts, setInitialShortcuts] = useState<Shortcut[]>([]);

  const clearPreviewParam = useCallback(() => {
    if (!previewParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete("preview");
    setSearchParams(next, { replace: true });
  }, [previewParam, searchParams, setSearchParams]);

  // Kick off — one profile GET decides which stage (if any) to enter.
  useEffect(() => {
    if (previewParam) {
      setStage("welcome");
      return;
    }
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    getProfile()
      .then((res) => {
        if (cancelled) return;
        const p = res?.profile as
          | (typeof res.profile & { pnptvFamBenefitsPending?: boolean })
          | undefined;
        if (!p) return;
        if (p.pnptvFamWelcomePending === true) setStage("welcome");
        else if (p.pnptvFamBenefitsPending === true) setStage("benefits");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [previewParam, isAuthenticated, isLoading]);

  const handleWelcomeClose = useCallback(() => {
    // Move straight into benefits — same session, one moment.
    setStage("benefits");
  }, []);

  const handleBenefitsEnter = useCallback(async () => {
    // Fetch existing layout so customizer can hydrate before opening.
    if (!previewParam) {
      try {
        const res = await fetch("/api/pnp-fam/layout", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.layout?.shortcuts)) setInitialShortcuts(json.layout.shortcuts);
        }
      } catch (_) {}
    }
    setStage("customizer");
  }, [previewParam]);

  const handleBenefitsSkip = useCallback(() => {
    setStage("idle");
    clearPreviewParam();
  }, [clearPreviewParam]);

  const handleCustomizerSave = useCallback(
    async (shortcuts: Shortcut[]) => {
      if (!previewParam) {
        try {
          await fetch("/api/pnp-fam/layout", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "fam", shortcuts }),
          });
        } catch (_) {}
      }
      setStage("idle");
      clearPreviewParam();
    },
    [previewParam, clearPreviewParam]
  );

  const handleCustomizerSkip = useCallback(() => {
    setStage("idle");
    clearPreviewParam();
  }, [clearPreviewParam]);

  return (
    <>
      <PnpFamWelcomeModal
        open={stage === "welcome"}
        onClose={handleWelcomeClose}
        previewOnly={previewParam}
      />
      <PnpFamBenefitsModal
        open={stage === "benefits"}
        onEnter={handleBenefitsEnter}
        onSkip={handleBenefitsSkip}
        previewOnly={previewParam}
      />
      <PnpFamFeedCustomizer
        open={stage === "customizer"}
        initialShortcuts={initialShortcuts}
        onSave={handleCustomizerSave}
        onSkip={handleCustomizerSkip}
        previewOnly={previewParam}
      />
    </>
  );
}

export default PnpFamWelcomeGate;
