/**
 * MySubscriptions — /my-subscriptions
 *
 * Shows the authenticated user's active Channel Passes with renew/cancel actions.
 * Linked from the avatar dropdown and from Channel Pass "active" badges on creator
 * profiles.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Ticket, RefreshCw, X, ChevronLeft, Loader2, Users } from "lucide-react";
import {
  getUserChannelPasses,
  checkoutChannelPass,
  cancelChannelPass,
  getWalletBalance,
  type UserChannelPass,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { BuyTokensModal } from "@/components/BuyTokensModal";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Subscription card ─────────────────────────────────────────────────────────

interface SubCardProps {
  sub: UserChannelPass;
  walletBalance: number | null;
  onRenewed: (updated: UserChannelPass) => void;
  onCancelled: (subscriptionId: string) => void;
  onNeedTopUp: () => void;
}

function SubCard({ sub, walletBalance, onRenewed, onCancelled, onNeedTopUp }: SubCardProps) {
  const [renewLoading, setRenewLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCancelled = sub.status === "cancelled";
  const isExpired = sub.status === "expired";
  const daysUrgent = sub.days_left < 7;
  const rushPrice = Math.round(sub.price_usd * 6);

  const handleRenew = async () => {
    setError(null);
    if (walletBalance !== null && walletBalance < rushPrice) {
      onNeedTopUp();
      return;
    }
    setRenewLoading(true);
    try {
      const res = await checkoutChannelPass(sub.creator_id, "rush");
      if (res.success && res.expires_at) {
        onRenewed({
          ...sub,
          expires_at: res.expires_at,
          days_left: Math.ceil((new Date(res.expires_at).getTime() - Date.now()) / 86400000),
          status: "active",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Renewal failed";
      if (msg.includes("INSUFFICIENT_FUNDS") || msg.includes("balance")) {
        onNeedTopUp();
      } else {
        setError(msg);
      }
    } finally {
      setRenewLoading(false);
    }
  };

  const handleCancel = async () => {
    setError(null);
    setCancelLoading(true);
    try {
      await cancelChannelPass(sub.subscription_id);
      onCancelled(sub.subscription_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelLoading(false);
      setConfirmCancel(false);
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--pnp-surface, #1E1E1E)",
        border: `1px solid ${isCancelled || isExpired ? "rgba(255,255,255,0.06)" : daysUrgent ? "rgba(255,180,84,0.25)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        <UserAvatar
          userId={sub.creator_id}
          photoUrl={sub.creator_avatar || undefined}
          displayName={sub.creator_username || "Creator"}
          size="md"
          showOnline={false}
          linkToProfile={false}
        />
        <div className="flex-1 min-w-0">
          <Link
            to={`/c/${encodeURIComponent(sub.creator_username)}`}
            className="text-sm font-bold text-white hover:underline truncate block"
          >
            @{sub.creator_username}
          </Link>
          <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            ${sub.price_usd.toFixed(2)}/mo · Channel Pass
          </p>
        </div>
        {/* Status badge */}
        {(isCancelled || isExpired) ? (
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}
          >
            {isCancelled ? "Cancelled" : "Expired"}
          </span>
        ) : daysUrgent ? (
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,180,84,0.15)", color: "#FFB454" }}
          >
            Expires soon
          </span>
        ) : (
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(52,199,89,0.12)", color: "#34C759" }}
          >
            Active
          </span>
        )}
      </div>

      {/* Access info row */}
      <div className="px-4 pb-3 flex items-center justify-between gap-2 text-xs"
        style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
        <span>
          {isCancelled
            ? `Access until ${fmtDate(sub.expires_at)}`
            : isExpired
            ? `Expired ${fmtDate(sub.expires_at)}`
            : `Active until ${fmtDate(sub.expires_at)} (${sub.days_left}d left)`}
        </span>
        <span className="text-[11px]">Started {fmtDate(sub.started_at)}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs text-red-400"
          style={{ background: "rgba(239,68,68,0.1)" }}>
          {error}
        </div>
      )}

      {/* Actions */}
      {!isExpired && (
        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
          {/* Renew — only when expiring soon and not cancelled */}
          {daysUrgent && !isCancelled && (
            <button
              type="button"
              onClick={handleRenew}
              disabled={renewLoading}
              className="flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {renewLoading ? (
                <><Loader2 size={14} className="animate-spin" /> Renewing…</>
              ) : (
                <><RefreshCw size={13} /> Renew now · {rushPrice} 💎</>
              )}
            </button>
          )}

          {/* Cancel — shown while still active and not already cancelled */}
          {!isCancelled && (
            confirmCancel ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  You'll keep access until {fmtDate(sub.expires_at)}. Cancel?
                </span>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="flex items-center gap-1 min-h-[36px] px-3 rounded-lg text-xs font-semibold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors disabled:opacity-60"
                >
                  {cancelLoading ? <Loader2 size={12} className="animate-spin" /> : "Yes, cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors"
                  style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors"
                style={{ color: "var(--pnp-text-secondary, #8E8E93)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <X size={12} /> Cancel
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MySubscriptions() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [subs, setSubs] = useState<UserChannelPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, balRes] = await Promise.all([
        getUserChannelPasses(),
        getWalletBalance().catch(() => null),
      ]);
      setSubs(items);
      if (balRes?.success) setWalletBalance(balRes.balance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your subscriptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { navigate("/login"); return; }
    load();
  }, [isAuthenticated, load, navigate]);

  const handleRenewed = useCallback((updated: UserChannelPass) => {
    setSubs((prev) => prev.map((s) => s.subscription_id === updated.subscription_id ? updated : s));
  }, []);

  const handleCancelled = useCallback((subscriptionId: string) => {
    setSubs((prev) =>
      prev.map((s) =>
        s.subscription_id === subscriptionId ? { ...s, status: "cancelled" as const } : s
      )
    );
  }, []);

  return (
    <>
      <Helmet>
        <title>My Subscriptions — PNPtv!</title>
      </Helmet>

      <div className="page-container max-w-lg mx-auto py-6 px-4 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <ChevronLeft size={18} className="text-white" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">My Subscriptions</h1>
            <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              Channel Passes you've purchased
            </p>
          </div>
          {walletBalance !== null && (
            <div className="ml-auto text-xs font-semibold"
              style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              💎 {walletBalance} Ru$h
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl animate-pulse"
                style={{ background: "var(--pnp-surface, #1E1E1E)" }}
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div
            className="rounded-2xl p-6 text-center space-y-3"
            style={{ background: "var(--pnp-surface, #1E1E1E)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={load}
              className="min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && subs.length === 0 && (
          <div
            className="rounded-2xl p-8 text-center space-y-4"
            style={{ background: "var(--pnp-surface, #1E1E1E)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: "rgba(212,0,122,0.1)", border: "1px solid rgba(212,0,122,0.2)" }}>
              <Ticket size={24} style={{ color: "#D4007A" }} />
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-1">No Channel Passes yet</p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                Explore creators to find someone you'd love to support. Channel Passes give you full access to their exclusive content, DMs, and videos.
              </p>
            </div>
            <Link
              to="/models"
              className="inline-flex items-center gap-2 min-h-[44px] px-6 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              <Users size={15} />
              Explore creators
            </Link>
          </div>
        )}

        {/* Subscription list */}
        {!loading && !error && subs.length > 0 && (
          <div className="space-y-3">
            {subs.map((sub) => (
              <SubCard
                key={sub.subscription_id}
                sub={sub}
                walletBalance={walletBalance}
                onRenewed={handleRenewed}
                onCancelled={handleCancelled}
                onNeedTopUp={() => setShowTopUp(true)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Top-up modal */}
      {showTopUp && (
        <BuyTokensModal
          isOpen={showTopUp}
          onClose={() => setShowTopUp(false)}
          onSuccess={(newBalance) => {
            if (typeof newBalance === "number") setWalletBalance(newBalance);
            setShowTopUp(false);
          }}
        />
      )}
    </>
  );
}
