import React, { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  activateAdminUserCreator,
  getAdminLiveChannels,
  makeAdminUserCreator,
  revokeAdminUserCreator,
  setCreatorLock,
  type AdminUser,
  type AdminChannel,
  type CreatorRole,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Local SVG icons
// ---------------------------------------------------------------------------

function IconSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CREATOR_TYPES = ["performer", "streamer", "creator", "dj", "host"] as const;

const CREATOR_ROLES: Array<{ value: CreatorRole; label: string; hint: string }> = [
  {
    value: "creator",
    label: "Creator",
    hint: "Exclusive paid content (Ice / Crystal / Diamond tiers). No live streaming.",
  },
  {
    value: "performer",
    label: "Performer",
    hint: "PNP Live streaming only. No exclusive paid posts.",
  },
  {
    value: "both",
    label: "Both",
    hint: "Exclusive paid content AND PNP Live streaming.",
  },
];

// ---------------------------------------------------------------------------
// UserCreatorSection (exported)
// ---------------------------------------------------------------------------

interface UserCreatorSectionProps {
  user: AdminUser;
  onUpdated: (patch: Partial<AdminUser>) => void;
}

export function UserCreatorSection({ user, onUpdated }: UserCreatorSectionProps) {
  const t = useI18n().admin;
  const isCreator = user.role === "model" || user.role === "creator";

  const [formOpen, setFormOpen] = useState(false);
  const [creatorRole, setCreatorRole] = useState<CreatorRole | "">("");
  const [channelRef, setChannelRef] = useState("");
  const [creatorType, setCreatorType] = useState("");
  const [priceUsd, setPriceUsd] = useState("15.00");
  const [grantMonetization, setGrantMonetization] = useState(true);

  // Activation flow for users sitting in 'approved_hold' (self-service approval)
  const [activateLoading, setActivateLoading] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Creator onboarding-lock toggle
  const [lockLoading, setLockLoading] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const handleToggleLock = async () => {
    if (!user.id) return;
    setLockLoading(true);
    setLockError(null);
    try {
      const next = !user.creator_locked;
      const res = await setCreatorLock(user.id, next);
      if (res.success) {
        onUpdated({ creator_locked: res.user.creator_locked });
      } else {
        setLockError("Failed to update onboarding lock");
      }
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Failed to update onboarding lock");
    } finally {
      setLockLoading(false);
    }
  };

  const loadChannels = async () => {
    setChannelsLoading(true);
    setChannelsError(null);
    try {
      const res = await getAdminLiveChannels();
      setChannels(res.channels);
    } catch (err) {
      setChannelsError(err instanceof Error ? err.message : t.creatorSection.failedChannels);
    } finally {
      setChannelsLoading(false);
    }
  };

  const openGrantForm = () => {
    setFormOpen(true);
    setSubmitError(null);
    setSuccessMsg(null);
    setCreatorRole((user.creator_role as CreatorRole) || "");
    setChannelRef(user.live_channel || "");
    setCreatorType(user.creator_type || "");
    setPriceUsd(user.creator_price_usd != null ? String(user.creator_price_usd) : "15.00");
    setGrantMonetization(true);
    loadChannels();
  };

  const handleGrant = async () => {
    if (!creatorRole) {
      setSubmitError("Pick a role (Creator, Performer, or Both) before granting access.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMsg(null);
    try {
      const grantsPerformer = creatorRole === "performer" || creatorRole === "both";
      const payload: {
        creatorRole: CreatorRole;
        channelRef?: string;
        creatorType?: string;
        priceUsd?: number;
        grantMonetization?: boolean;
      } = {
        creatorRole,
        grantMonetization,
      };
      // Only pass channelRef when the role grants performer — backend rejects
      // channelRef on creator-only grants.
      if (channelRef && grantsPerformer) payload.channelRef = channelRef;
      if (creatorType) payload.creatorType = creatorType;
      const price = parseFloat(priceUsd);
      if (!isNaN(price)) payload.priceUsd = price;

      const res = await makeAdminUserCreator(user.id, payload);
      onUpdated(res.user);
      setSuccessMsg(t.creatorSection.grantAccess);
      setFormOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t.creatorSection.failedGrant);
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async () => {
    setActivateLoading(true);
    setActivateError(null);
    try {
      const res = await activateAdminUserCreator(user.id);
      onUpdated(res.user);
      setSuccessMsg("Creator activated.");
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : "Failed to activate creator");
    } finally {
      setActivateLoading(false);
    }
  };

  const handleRevoke = async () => {
    setRevokeLoading(true);
    setRevokeError(null);
    try {
      const res = await revokeAdminUserCreator(user.id);
      onUpdated(res.user);
      setRevokeConfirm(false);
      setSuccessMsg(t.creatorSection.revokeAccess);
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : t.creatorSection.failedRevoke);
      setRevokeConfirm(false);
    } finally {
      setRevokeLoading(false);
    }
  };

  // Channels available to assign: unassigned OR already assigned to this user
  const availableChannels = channels.filter(
    (ch) => ch.assignedUser === null || ch.assignedUser.id === user.id
  );

  return (
    <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">
        {t.creatorSection.sectionTitle}
      </h2>

      {successMsg && (
        <div className="px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400">
          {successMsg}
        </div>
      )}
      {revokeError && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {revokeError}
        </div>
      )}

      {/* Current status summary */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs text-pnp-textSecondary">{t.creatorSection.roleLabel}</span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
            isCreator
              ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
              : "bg-pnp-surface text-pnp-textSecondary border-pnp-border"
          }`}
        >
          {user.role}
        </span>

        {user.creator_status && user.creator_status !== "none" && (
          <>
            <span className="text-xs text-pnp-textSecondary">{t.creatorSection.statusLabel}</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                user.creator_status === "active"
                  ? "bg-green-500/15 text-green-400 border-green-500/20"
                  : "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
              }`}
            >
              {user.creator_status}
            </span>
          </>
        )}

        {user.creator_role && (
          <>
            <span className="text-xs text-pnp-textSecondary">Role</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                user.creator_role === "both"
                  ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                  : user.creator_role === "performer"
                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                    : "bg-pink-500/15 text-pink-300 border-pink-500/30"
              }`}
            >
              {user.creator_role === "both" ? "Both" : user.creator_role === "performer" ? "Performer" : "Creator"}
            </span>
          </>
        )}

        {user.creator_type && (
          <>
            <span className="text-xs text-pnp-textSecondary">{t.creatorSection.typeLabel}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
              {user.creator_type}
            </span>
          </>
        )}

        {user.live_channel && (
          <>
            <span className="text-xs text-pnp-textSecondary">{t.creatorSection.channelLabel}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-pnp-surface text-pnp-textPrimary border border-pnp-border">
              {user.live_channel}
            </span>
          </>
        )}

        {user.creator_price_usd != null && (
          <>
            <span className="text-xs text-pnp-textSecondary">{t.creatorSection.priceLabel}</span>
            <span className="text-xs text-pnp-textPrimary font-medium">
              ${Number(user.creator_price_usd).toFixed(2)}/mo
            </span>
          </>
        )}

        {user.creator_status === "active" && (
          <>
            <span className="text-xs text-pnp-textSecondary">Onboarding</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                user.creator_locked
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-green-500/15 text-green-400 border-green-500/20"
              }`}
            >
              {user.creator_locked ? "Locked (pending onboarding)" : "Unlocked"}
            </span>
            <button
              onClick={handleToggleLock}
              disabled={lockLoading}
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50 ${
                user.creator_locked
                  ? "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
              }`}
              title={user.creator_locked ? "Unlock creator tools (onboarding complete)" : "Lock creator tools pending onboarding"}
            >
              {lockLoading ? "…" : user.creator_locked ? "Unlock tools" : "Lock tools"}
            </button>
            {lockError && <span className="text-xs text-red-400">{lockError}</span>}
          </>
        )}
      </div>

      {/* Approved-on-hold activation banner */}
      {user.creator_status === "approved_hold" && (
        <div className="rounded-lg p-4 space-y-3 border border-amber-500/30" style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.08), rgba(230,145,56,0.08))" }}>
          <div>
            <p className="text-sm font-semibold text-white mb-1">Approved — pending activation</p>
            <p className="text-xs text-pnp-textSecondary">
              Self-service approval landed this user in <span className="font-mono">approved_hold</span>. Capabilities (live streaming, exclusive posts) stay locked until you click Activate. Use this window to confirm the role assignment and walk through the studio with them.
            </p>
          </div>
          {activateError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {activateError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleActivate}
              disabled={activateLoading}
              aria-busy={activateLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 min-h-[44px]"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {activateLoading && <IconSpinner />}
              {activateLoading ? "Activating…" : "Activate creator"}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isCreator && !formOpen && (
        <div className="flex justify-end">
          <button
            onClick={openGrantForm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors min-h-[44px]"
          >
            {t.creatorSection.grantAccess}
          </button>
        </div>
      )}

      {isCreator && !revokeConfirm && (
        <div className="flex justify-end gap-3">
          {!formOpen && (
            <button
              onClick={openGrantForm}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors min-h-[44px]"
            >
              {t.creatorSection.editSettings}
            </button>
          )}
          <button
            onClick={() => {
              setRevokeConfirm(true);
              setSuccessMsg(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors min-h-[44px]"
          >
            {t.creatorSection.revokeAccess}
          </button>
        </div>
      )}

      {/* Revoke confirm inline */}
      {revokeConfirm && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 space-y-3">
          <p className="text-sm text-red-400">
            {t.creatorSection.revokeConfirm.replace("{0}", user.username || user.id)}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setRevokeConfirm(false)}
              disabled={revokeLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-pnp-border text-pnp-textSecondary hover:bg-pnp-surfaceHover transition-colors min-h-[44px] disabled:opacity-50"
            >
              {t.shared.cancel}
            </button>
            <button
              onClick={handleRevoke}
              disabled={revokeLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors min-h-[44px] disabled:opacity-50"
            >
              {revokeLoading ? t.creatorSection.revoking : t.creatorSection.yesRevoke}
            </button>
          </div>
        </div>
      )}

      {/* Grant / Edit form */}
      {formOpen && (
        <div className="rounded-lg bg-pnp-surface border border-purple-500/20 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-pnp-textPrimary">
            {isCreator ? t.creatorSection.editSettings : t.creatorSection.grantAccess}
          </h3>

          {submitError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {submitError}
            </div>
          )}

          {/* Role (Creator / Performer / Both) — required, gates capabilities */}
          <div>
            <label className="block text-xs text-pnp-textSecondary mb-1" htmlFor="creator-role">
              Role <span className="text-red-400">*</span>
            </label>
            <select
              id="creator-role"
              value={creatorRole}
              onChange={(e) => setCreatorRole(e.target.value as CreatorRole | "")}
              aria-label="Creator role"
              style={{ fontSize: "16px" }}
              className="w-full px-3 py-2 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary focus:outline-none focus:border-purple-500/50"
            >
              <option value="">— Pick a role —</option>
              {CREATOR_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {creatorRole && (
              <p className="mt-1 text-[11px] text-pnp-textSecondary">
                {CREATOR_ROLES.find((r) => r.value === creatorRole)?.hint}
              </p>
            )}
          </div>

          {/* Channel selector */}
          <div
            className={creatorRole === "creator" ? "opacity-50 pointer-events-none" : ""}
            aria-disabled={creatorRole === "creator"}
          >
            <label className="block text-xs text-pnp-textSecondary mb-1" htmlFor="creator-channel">
              {t.creatorSection.liveChannel}
            </label>
            {channelsLoading ? (
              <div className="flex items-center gap-2 text-xs text-pnp-textSecondary">
                <IconSpinner /> {t.creatorSection.loadingChannels}
              </div>
            ) : channelsError ? (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <IconAlert /> {channelsError}
                <button onClick={loadChannels} className="underline hover:no-underline ml-1">
                  {t.shared.tryAgain}
                </button>
              </div>
            ) : (
              <select
                id="creator-channel"
                value={channelRef}
                onChange={(e) => setChannelRef(e.target.value)}
                style={{ fontSize: "16px" }} className="w-full px-3 py-2 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary focus:outline-none focus:border-purple-500/50"
              >
                <option value="">{t.creatorSection.noChannel}</option>
                {availableChannels.map((ch) => (
                  <option key={ch.id} value={ch.reference}>
                    {ch.reference}{ch.rtmpName ? ` (key: ${ch.rtmpName})` : ""}{ch.isLive ? " 🔴" : ""}
                    {ch.assignedUser?.id === user.id ? " ✓ current" : ""}
                  </option>
                ))}
                {channels.length > 0 && availableChannels.length === 0 && (
                  <option disabled value="">
                    {t.creatorSection.allAssigned}
                  </option>
                )}
              </select>
            )}
          </div>

          {/* Creator type — informational tag only; does not gate capabilities */}
          <div>
            <label className="block text-xs text-pnp-textSecondary mb-1" htmlFor="creator-type">
              {t.creatorSection.creatorType}
            </label>
            <select
              id="creator-type"
              value={creatorType}
              onChange={(e) => setCreatorType(e.target.value)}
              style={{ fontSize: "16px" }} className="w-full px-3 py-2 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary focus:outline-none focus:border-purple-500/50"
            >
              <option value="">{t.creatorSection.selectType}</option>
              {CREATOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-pnp-textSecondary">Tier label — for analytics only; does not gate features. Use Role above to control capabilities.</p>
          </div>

          {/* Subscription price */}
          <div>
            <label className="block text-xs text-pnp-textSecondary mb-1" htmlFor="creator-price">
              {t.creatorSection.subPrice}
            </label>
            <input
              id="creator-price"
              type="number"
              min="0"
              step="0.50"
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              style={{ fontSize: "16px" }} className="w-full px-3 py-2 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary focus:outline-none focus:border-purple-500/50"
            />
          </div>

          {/* Grant monetization entitlement */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input id="pnp-usercreatorsection-1"
              type="checkbox"
              checked={grantMonetization}
              onChange={(e) => setGrantMonetization(e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <span className="text-sm text-pnp-textPrimary">
              {t.creatorSection.grantLifetime}
            </span>
          </label>

          <div className="flex gap-3 justify-end pt-1">
            <button
              onClick={() => {
                setFormOpen(false);
                setSubmitError(null);
              }}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-pnp-border text-pnp-textSecondary hover:bg-pnp-surfaceHover transition-colors min-h-[44px] disabled:opacity-50"
            >
              {t.shared.cancel}
            </button>
            <button
              onClick={handleGrant}
              disabled={submitting || !creatorRole}
              aria-busy={submitting}
              title={!creatorRole ? "Pick a role to enable" : undefined}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors min-h-[44px] disabled:opacity-50"
            >
              {submitting ? t.shared.saving : isCreator ? t.shared.save : t.creatorSection.grantAccess}
            </button>
          </div>
        </div>
      )}

      {/* Creator Ru$h 💎 balance panel — visible for creators only */}
      {isCreator && <CreatorBalancePanel userId={user.id} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreatorBalancePanel — earnings ledger + admin actions
// ─────────────────────────────────────────────────────────────────────────────

interface EarningRow {
  id: string;
  amount_gross: string | number;
  amount_creator: string | number;
  amount_platform: string | number;
  status: 'pending'|'holding'|'available'|'in_payout'|'paid_out'|'void'|'refund_review';
  subscription_id: string | null;
  source_payment_id: string | null;
  is_tip: boolean;
  created_at: string;
  available_at: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface WithdrawRow {
  id: string;
  amount_usd: string | number;
  destination_currency: string;
  destination_address: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  completed_at: string | null;
  admin_notes: string | null;
  deny_reason: string | null;
}

interface BalanceResp {
  success: boolean;
  totals: {
    available_usd: string | number;
    holding_usd: string | number;
    pending_usd: string | number;
    paidout_usd: string | number;
    void_usd: string | number;
    inpayout_usd: string | number;
    row_count: string | number;
  };
  earnings: EarningRow[];
  payouts: Array<{ id: string; amount_usd: string | number; status: string; created_at: string; completed_at: string | null; notes: string | null }>;
  withdraw_requests: WithdrawRow[];
}

function usdFmt(v: string | number | null | undefined) {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return `$${n.toFixed(2)}`;
}

function rushEquiv(v: string | number | null | undefined) {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return `${Math.round(n * 6)} 💎`;
}

function CreatorBalancePanel({ userId }: { userId: string }) {
  const [data, setData] = useState<BalanceResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/webapp/admin/creators/${encodeURIComponent(userId)}/balance`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }, [userId]);

  React.useEffect(() => { load(); }, [load]);

  const doCredit = async () => {
    const amt = parseFloat(creditAmount);
    if (!(amt > 0)) { setErr('Amount must be > 0'); return; }
    if (!creditReason.trim()) { setErr('Reason required'); return; }
    setBusyRow('credit');
    try {
      const res = await fetch(`/api/webapp/admin/creators/${encodeURIComponent(userId)}/credit`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: amt, reason: creditReason.trim() }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
      setCreditAmount(''); setCreditReason(''); setShowCreditForm(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Credit failed'); }
    finally { setBusyRow(null); }
  };

  const doVoid = async (earningId: string) => {
    const reason = window.prompt('Void reason (required):');
    if (!reason?.trim()) return;
    setBusyRow(earningId);
    try {
      const res = await fetch(`/api/webapp/admin/creators/${encodeURIComponent(userId)}/void/${earningId}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Void failed'); }
    finally { setBusyRow(null); }
  };

  const doReleaseHold = async (earningId: string) => {
    if (!window.confirm('Release this holding earning to available now?')) return;
    setBusyRow(earningId);
    try {
      const res = await fetch(`/api/webapp/admin/creators/${encodeURIComponent(userId)}/release-hold/${earningId}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'admin_early_release' }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Release failed'); }
    finally { setBusyRow(null); }
  };

  return (
    <div className="mt-4 rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
          Balance · Ru$h 💎
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCreditForm(v => !v); setErr(null); }}
            className="text-xs px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 min-h-[36px]"
          >{showCreditForm ? 'Cancel' : '+ Credit'}</button>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-md bg-pnp-surface border border-pnp-border text-pnp-textSecondary hover:bg-pnp-surfaceHover min-h-[36px]"
          >Refresh</button>
        </div>
      </div>

      {err && <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">{err}</div>}
      {loading && !data && <div className="text-xs text-pnp-textSecondary">Loading…</div>}

      {showCreditForm && (
        <div className="p-3 rounded-lg bg-pnp-surface border border-pnp-border space-y-2">
          <div className="flex gap-2">
            <input id="pnp-usercreatorsection-2"
              type="number" step="0.01" min="0.01" placeholder="USD amount"
              value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)}
              className="flex-1 px-3 py-2 rounded-md bg-pnp-background border border-pnp-border text-sm"
            />
            <input id="pnp-usercreatorsection-3"
              type="text" placeholder="Reason (required)"
              value={creditReason} onChange={(e) => setCreditReason(e.target.value)}
              className="flex-[2] px-3 py-2 rounded-md bg-pnp-background border border-pnp-border text-sm"
            />
            <button
              onClick={doCredit} disabled={busyRow === 'credit'}
              className="px-4 py-2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-sm disabled:opacity-50 min-h-[44px]"
            >{busyRow === 'credit' ? 'Crediting…' : 'Credit'}</button>
          </div>
          {creditAmount && !isNaN(parseFloat(creditAmount)) && (
            <p className="text-xs text-pnp-textSecondary">
              ≈ {Math.round(parseFloat(creditAmount) * 6)} 💎 Ru$h equivalent · will be added as available immediately
            </p>
          )}
        </div>
      )}

      {data && (
        <>
          {/* Totals grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            {[
              ['Available', data.totals.available_usd, 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'],
              ['Holding', data.totals.holding_usd, 'text-amber-400 border-amber-500/30 bg-amber-500/10'],
              ['Pending', data.totals.pending_usd, 'text-blue-400 border-blue-500/30 bg-blue-500/10'],
              ['In Payout', data.totals.inpayout_usd, 'text-purple-400 border-purple-500/30 bg-purple-500/10'],
              ['Paid Out', data.totals.paidout_usd, 'text-pnp-textSecondary border-pnp-border bg-pnp-surface'],
              ['Void', data.totals.void_usd, 'text-red-400 border-red-500/30 bg-red-500/10'],
            ].map(([label, val, cls]) => (
              <div key={String(label)} className={`px-2 py-2 rounded-md border ${cls}`}>
                <div className="uppercase tracking-wider opacity-70 text-[10px]">{label}</div>
                <div className="font-mono text-sm">{usdFmt(val as string | number)}</div>
                <div className="text-[10px] opacity-60">{rushEquiv(val as string | number)}</div>
              </div>
            ))}
          </div>

          {/* Earnings table */}
          <div className="rounded-lg border border-pnp-border overflow-hidden">
            <div className="px-3 py-2 bg-pnp-surface text-xs text-pnp-textSecondary border-b border-pnp-border">
              Recent earnings ({String(data.totals.row_count)} total)
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-pnp-surface sticky top-0">
                  <tr className="text-left text-pnp-textSecondary">
                    <th className="px-2 py-1">When</th>
                    <th className="px-2 py-1">Amount</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Source</th>
                    <th className="px-2 py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.earnings.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-3 text-center text-pnp-textSecondary italic">No earnings yet</td></tr>
                  )}
                  {data.earnings.map(row => (
                    <tr key={row.id} className="border-t border-pnp-border/50 hover:bg-pnp-surfaceHover/50">
                      <td className="px-2 py-1 text-pnp-textSecondary whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-2 py-1 font-mono">
                        {usdFmt(row.amount_creator)}
                        <span className="text-pnp-textSecondary text-[10px] ml-1">({rushEquiv(row.amount_creator)})</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className={
                          row.status === 'available' ? 'text-emerald-400' :
                          row.status === 'holding'   ? 'text-amber-400'   :
                          row.status === 'paid_out'  ? 'text-pnp-textSecondary' :
                          row.status === 'void'      ? 'text-red-400 line-through' :
                          'text-blue-400'
                        }>{row.status}</span>
                        {row.is_tip && <span className="ml-1 text-[10px] text-purple-400">TIP</span>}
                      </td>
                      <td className="px-2 py-1 text-pnp-textSecondary text-[10px] max-w-[200px] truncate" title={row.source_payment_id || row.subscription_id || ''}>
                        {row.source_payment_id || (row.subscription_id ? `sub:${row.subscription_id.slice(0,8)}` : (row.metadata as { source?: string })?.source || '—')}
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {row.status === 'holding' && (
                          <button
                            onClick={() => doReleaseHold(row.id)}
                            disabled={busyRow === row.id}
                            className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-[10px] disabled:opacity-50 mr-1"
                          >Release</button>
                        )}
                        {['pending','holding','available'].includes(row.status) && (
                          <button
                            onClick={() => doVoid(row.id)}
                            disabled={busyRow === row.id}
                            className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 text-[10px] disabled:opacity-50"
                          >Void</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Withdraw requests */}
          {data.withdraw_requests.length > 0 && (
            <div className="rounded-lg border border-pnp-border overflow-hidden">
              <div className="px-3 py-2 bg-pnp-surface text-xs text-pnp-textSecondary border-b border-pnp-border">
                Withdraw requests
              </div>
              <table className="w-full text-xs">
                <thead className="bg-pnp-surface">
                  <tr className="text-left text-pnp-textSecondary">
                    <th className="px-2 py-1">When</th>
                    <th className="px-2 py-1">Amount</th>
                    <th className="px-2 py-1">To</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.withdraw_requests.map(w => (
                    <tr key={w.id} className="border-t border-pnp-border/50">
                      <td className="px-2 py-1 text-pnp-textSecondary">{new Date(w.requested_at).toLocaleDateString()}</td>
                      <td className="px-2 py-1 font-mono">{usdFmt(w.amount_usd)}</td>
                      <td className="px-2 py-1 text-[10px] text-pnp-textSecondary max-w-[240px] truncate" title={w.destination_address}>
                        {w.destination_currency.toUpperCase()} · {w.destination_address}
                      </td>
                      <td className="px-2 py-1">{w.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
