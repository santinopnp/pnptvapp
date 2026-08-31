import { useState, useEffect, useCallback } from "react";
import {
  getCreatorEligibility,
  getCreatorDashboard,
  getCreatorEarnings,
  getWithdrawableAmount,
  getWithdrawalHistory,
  type CreatorEligibility,
  type CreatorDashboard as DashboardData,
  type ModelEarnings,
  type ModelWithdrawal,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export interface CreatorDataResult {
  eligibility: CreatorEligibility | null;
  dashboard: (DashboardData & { success: boolean }) | null;
  earnings: ModelEarnings | null;
  withdrawable: number;
  withdrawals: ModelWithdrawal[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** True when the authenticated creator has an active Crystal Creator pass.
   *  TODO(backend): confirm getCreatorDashboard returns crystalCreator field. */
  crystalCreator: boolean;
  /** ISO timestamp string when the Crystal pass expires, "infinity" for lifetime passes, or null if not active.
   *  TODO(backend): confirm getCreatorDashboard returns crystalActiveUntil field. */
  crystalActiveUntil: string | null;
}

export function useCreatorData(): CreatorDataResult {
  const { isAuthenticated } = useAuth();
  const [eligibility, setEligibility] = useState<CreatorEligibility | null>(null);
  const [dashboard, setDashboard] = useState<(DashboardData & { success: boolean }) | null>(null);
  const [earnings, setEarnings] = useState<ModelEarnings | null>(null);
  const [withdrawable, setWithdrawable] = useState<number>(0);
  const [withdrawals, setWithdrawals] = useState<ModelWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eligResult, dashResult] = await Promise.allSettled([
        getCreatorEligibility(),
        getCreatorDashboard(),
      ]);

      const eligRes = eligResult.status === "fulfilled" ? eligResult.value : null;
      const dashRes = dashResult.status === "fulfilled" ? dashResult.value : null;

      if (eligRes) setEligibility(eligRes);
      if (dashRes) setDashboard(dashRes);

      if (eligResult.status === "rejected" && dashResult.status === "rejected") {
        setError(
          eligResult.reason instanceof Error
            ? eligResult.reason.message
            : "Failed to load creator data"
        );
      }

      if (dashRes?.creatorStatus === "active") {
        const [earningsRes, withdrawableRes, historyRes] = await Promise.allSettled([
          getCreatorEarnings(),
          getWithdrawableAmount(),
          getWithdrawalHistory(),
        ]);
        if (earningsRes.status === "fulfilled" && earningsRes.value.success) {
          setEarnings(earningsRes.value as unknown as ModelEarnings);
        }
        if (withdrawableRes.status === "fulfilled" && withdrawableRes.value.success) {
          setWithdrawable(withdrawableRes.value.data.withdrawable.amount);
        }
        if (historyRes.status === "fulfilled" && historyRes.value.success) {
          setWithdrawals(historyRes.value.data.withdrawals);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load creator data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      reload();
    }
  }, [isAuthenticated, reload]);

  // Extract Crystal Creator fields from dashboard response.
  // These are denormalized from crystal_creator_passes by the backend.
  // Default to false/null until the backend ships the fields.
  const dashAny = dashboard as (DashboardData & { success: boolean; crystalCreator?: boolean; crystalActiveUntil?: string | null }) | null;
  const crystalCreator: boolean = dashAny?.crystalCreator === true;
  const crystalActiveUntil: string | null = dashAny?.crystalActiveUntil ?? null;

  return { eligibility, dashboard, earnings, withdrawable, withdrawals, loading, error, reload, crystalCreator, crystalActiveUntil };
}
