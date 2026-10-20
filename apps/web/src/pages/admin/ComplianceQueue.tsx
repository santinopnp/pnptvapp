import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminListContentReviews,
  adminApproveContentReview,
  adminRejectContentReview,
  adminListRemovalRequests,
  adminResolveRemovalRequest,
  adminListNcmecCases,
  adminUpdateNcmecCase,
  adminListPolicyFlags,
  adminDismissPolicyFlag,
  adminConfirmPolicyFlag,
  adminDismissUserPolicyFlags,
  type AdminPolicyFlagUser,
  type AdminContentReview,
  type AdminRemovalRequest,
  type AdminNcmecCase,
} from "@/lib/api";

type Tab = "flags" | "reviews" | "removals" | "ncmec";

const CATEGORY_NAMES: Record<string, string> = {
  off_platform_payment: "Off-app payment",
  off_platform_services: "Charging outside the app",
  off_platform_competitor: "Other platforms",
  paid_meetup: "Paid meetups",
  scam: "Scam",
  copy_paste_blast: "Copy-paste blast",
  contact_sharing: "Contact sharing",
  external_link: "External link",
  content_sales: "Selling content",
  staff_impersonation: "Posing as staff",
};

const SOURCE_NAMES: Record<string, string> = {
  dm: "DM",
  dm_blast: "DM blast",
  chat: "Chat",
  post: "Post",
  profile: "Profile",
  album_caption: "Album caption",
  channel_video: "Channel video",
};

const card: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };
const muted: React.CSSProperties = { color: "var(--pnp-text-secondary, #8E8E93)" };
const btnPrimary: React.CSSProperties = { background: "linear-gradient(135deg,#D4007A,#E69138)", color: "#fff" };
const btnGhost: React.CSSProperties = { background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" };

function timeLeft(dueAt: string): string {
  const ms = new Date(dueAt).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const label = h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((abs % 3_600_000) / 60_000)}m`;
  return ms < 0 ? `${label} overdue` : `${label} left`;
}

function Preview({ r }: { r: AdminContentReview }) {
  const url = r.post_media_urls?.[0]?.url || r.post_media_url || r.media_url || r.video_thumbnail_url;
  const type = r.post_media_urls?.[0]?.type || r.post_media_type || r.media_media_type || "image";
  if (!url) return <div className="w-full h-40 rounded-lg flex items-center justify-center text-xs" style={{ ...card, ...muted }}>No preview</div>;
  return type === "video" && r.content_type !== "channel_video"
    ? <video src={url} controls preload="metadata" className="w-full max-h-72 rounded-lg bg-black" />
    : <img src={url} alt="" className="w-full max-h-72 object-contain rounded-lg bg-black" />;
}

function PolicyFlagsTab() {
  const [users, setUsers] = useState<AdminPolicyFlagUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    adminListPolicyFlags().then((r) => setUsers(r.users)).catch(() => setError("Could not load policy flags."));
  }, []);
  useEffect(load, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, after?: (r: unknown) => void) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      after?.(r);
      load();
    } catch {
      setError("Action failed — refresh and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!users) return <p className="text-sm" style={muted}>{error || "Loading…"}</p>;
  if (!users.length) return <p className="text-sm" style={muted}>No open flags. The scanner checks new messages, posts and profiles every 5 minutes.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs" style={muted}>
        Members are grouped and sorted with creators and the highest scores first. Confirm adds a strike for off-app payment, scams and paid meetups (warn → 24h mute → review); dismiss clears a false alarm.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {notice && <p className="text-xs" style={{ color: "#5ED1C4" }}>{notice}</p>}
      {users.map((u) => (
        <div key={u.user_id} className="rounded-xl p-4 space-y-3" style={card}>
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-white">
                @{u.username || u.user_id}
                {u.is_creator && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "rgba(230,145,56,0.2)", color: "#E69138" }}>CREATOR</span>}
                {u.is_active === false && <span className="ml-2 text-[10px]" style={muted}>inactive</span>}
              </p>
              <p className="text-xs mt-0.5" style={muted}>
                Score {u.total_score} · {u.flag_count} flag{u.flag_count === 1 ? "" : "s"} · {u.strikes_30d} strike{u.strikes_30d === 1 ? "" : "s"} in 30 days
              </p>
              <div className="flex gap-1 flex-wrap mt-2">
                {u.categories.map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>{CATEGORY_NAMES[c] || c}</span>
                ))}
              </div>
            </div>
            <button
              disabled={busy === u.user_id}
              onClick={() => window.confirm(`Dismiss all ${u.flag_count} flags for @${u.username || u.user_id}?`) && act(u.user_id, () => adminDismissUserPolicyFlags(u.user_id))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={btnGhost}
            >
              Dismiss all
            </button>
          </div>
          {u.flags.map((f) => (
            <div key={f.id} className="rounded-lg p-3 space-y-2" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${f.tier === "block" ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.06)"}` }}>
              <div className="flex justify-between text-[11px]" style={muted}>
                <span>{SOURCE_NAMES[f.source] || f.source}{f.source_ref ? ` · ${f.source_ref}` : ""} · {f.categories.map((c) => CATEGORY_NAMES[c] || c).join(", ")}</span>
                <span>{new Date(f.created_at).toLocaleString()}</span>
              </div>
              {f.excerpt && <p className="text-sm text-white whitespace-pre-wrap break-words">{f.excerpt}</p>}
              {f.matched_terms.length > 0 && (
                <p className="text-[11px]" style={muted}>Matched: {f.matched_terms.map((t) => `"${t.term}"`).join(", ")}</p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={busy === f.id}
                  onClick={() => act(f.id, () => adminConfirmPolicyFlag(f.id), (r) => {
                    const strike = (r as { strike?: { strikeNumber: number; action: string } | null }).strike;
                    setNotice(strike ? `Strike ${strike.strikeNumber} logged for @${u.username || u.user_id} (${strike.action.replace("_", " ")}).` : "Marked as a violation.");
                  })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={btnPrimary}
                >
                  Confirm
                </button>
                <button disabled={busy === f.id} onClick={() => act(f.id, () => adminDismissPolicyFlag(f.id))} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={btnGhost}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ReviewsTab() {
  const [items, setItems] = useState<AdminContentReview[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminListContentReviews().then((r) => setItems(r.reviews)).catch(() => setError("Could not load the review queue."));
  }, []);
  useEffect(load, [load]);

  const decide = async (id: string, approve: boolean) => {
    const reason = approve ? undefined : window.prompt("Reason for rejection (sent to the creator):") ?? undefined;
    if (!approve && reason === undefined) return;
    setBusy(id);
    try {
      await (approve ? adminApproveContentReview(id) : adminRejectContentReview(id, reason));
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);
    } catch {
      setError("Action failed — refresh and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!items) return <p className="text-sm" style={muted}>{error || "Loading…"}</p>;
  if (!items.length) return <p className="text-sm" style={muted}>Nothing waiting for review.</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-400">{error}</p>}
      {items.map((r) => (
        <div key={r.id} className="rounded-xl p-4 space-y-3" style={card}>
          <div className="flex justify-between text-xs" style={muted}>
            <span>
              <span className="font-semibold text-white">@{r.creator_username || r.creator_id}</span>
              {" · "}{r.content_type.replace("_", " ")}
              {(r.post_is_exclusive || r.media_is_premium) && " · paid"}
            </span>
            <span>{new Date(r.submitted_at).toLocaleString()}</span>
          </div>
          <Preview r={r} />
          {(r.post_content || r.media_caption || r.video_title) && (
            <p className="text-sm text-white whitespace-pre-wrap">{r.post_content || r.media_caption || r.video_title}</p>
          )}
          <p className="text-[11px]" style={muted}>
            Check: everyone looks 18+ and is 2257-verified · no real drug use or intoxication · no prohibited themes.
          </p>
          <div className="flex gap-2">
            <button disabled={busy === r.id} onClick={() => decide(r.id, true)} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={btnPrimary}>Approve</button>
            <button disabled={busy === r.id} onClick={() => decide(r.id, false)} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={btnGhost}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RemovalsTab() {
  const [items, setItems] = useState<AdminRemovalRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListRemovalRequests("open").then((r) => setItems(r.requests)).catch(() => setError("Could not load removal requests."));
  }, []);

  const resolve = async (id: string, action: "removed" | "rejected") => {
    const note = window.prompt(action === "removed" ? "What was removed (and copies found)?" : "Why is this request rejected?");
    if (note === null) return;
    setBusy(id);
    try {
      await adminResolveRemovalRequest(id, action, note);
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);
    } catch {
      setError("Action failed — refresh and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!items) return <p className="text-sm" style={muted}>{error || "Loading…"}</p>;
  if (!items.length) return <p className="text-sm" style={muted}>No open removal requests.</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-400">{error}</p>}
      {items.map((r) => (
        <div key={r.id} className="rounded-xl p-4 space-y-2" style={{ ...card, ...(r.overdue ? { borderColor: "rgba(239,68,68,0.6)" } : {}) }}>
          <div className="flex justify-between text-xs">
            <span className="font-semibold" style={{ color: r.kind === "ncii" ? "#EF4444" : "#FFB454" }}>
              {r.kind === "ncii" ? "Non-consensual intimate image — 48h" : "Complaint — 7 business days"}
            </span>
            <span style={{ color: r.overdue ? "#EF4444" : "#8E8E93" }}>{timeLeft(r.due_at)}</span>
          </div>
          <p className="text-sm text-white">{r.requester_name} · <a className="underline" href={`mailto:${r.requester_email}`}>{r.requester_email}</a>{r.is_depicted_person && " · depicted person"}</p>
          <ul className="text-xs space-y-1">
            {r.content_urls.map((u) => <li key={u}><a href={u} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: "#E69138" }}>{u}</a></li>)}
          </ul>
          {r.description && <p className="text-xs whitespace-pre-wrap" style={muted}>{r.description}</p>}
          <div className="flex gap-2 pt-1">
            <button disabled={busy === r.id} onClick={() => resolve(r.id, "removed")} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={btnPrimary}>Mark removed</button>
            <button disabled={busy === r.id} onClick={() => resolve(r.id, "rejected")} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={btnGhost}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function NcmecTab() {
  const [items, setItems] = useState<AdminNcmecCase[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminListNcmecCases("pending_review").then((r) => setItems(r.cases)).catch(() => setError("Could not load NCMEC cases."));
  }, []);

  const update = async (id: string, status: "reported" | "not_csam") => {
    let cybertipReportId: string | undefined;
    if (status === "reported") {
      const v = window.prompt("CyberTipline report number:");
      if (!v) return;
      cybertipReportId = v.trim();
    } else if (!window.confirm("Confirm this is NOT child sexual abuse material?")) {
      return;
    }
    setBusy(id);
    try {
      await adminUpdateNcmecCase(id, { status, cybertipReportId });
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);
    } catch {
      setError("Action failed — refresh and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5" }}>
        Do not download, copy or forward suspected material. Report it at{" "}
        <a href="https://report.cybertip.org" target="_blank" rel="noopener noreferrer" className="underline">report.cybertip.org</a>{" "}
        and record the report number here. Reported accounts are preserved for 1 year and cannot be erased.
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!items ? <p className="text-sm" style={muted}>Loading…</p>
        : !items.length ? <p className="text-sm" style={muted}>No cases waiting.</p>
        : items.map((c) => (
          <div key={c.id} className="rounded-xl p-4 space-y-2" style={card}>
            <div className="flex justify-between text-xs" style={muted}>
              <span>User report {c.user_report_id || "—"} · reported user <span className="font-mono text-white">{c.reported_user_id}</span></span>
              <span>{new Date(c.created_at).toLocaleString()}</span>
            </div>
            {c.evidence_type && <p className="text-xs" style={muted}>Evidence: {c.evidence_type} {c.evidence_id}</p>}
            <div className="flex gap-2 pt-1">
              <button disabled={busy === c.id} onClick={() => update(c.id, "reported")} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={btnPrimary}>Reported to NCMEC</button>
              <button disabled={busy === c.id} onClick={() => update(c.id, "not_csam")} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={btnGhost}>Not CSAM</button>
            </div>
          </div>
        ))}
    </div>
  );
}

export default function ComplianceQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("flags");
  const tabs: { id: Tab; label: string }[] = [
    { id: "flags", label: "Policy flags" },
    { id: "reviews", label: "Pre-publication review" },
    { id: "removals", label: "Removal requests" },
    { id: "ncmec", label: "NCMEC cases" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button
        onClick={() => navigate("/admin")}
        className="flex items-center gap-2 text-sm mb-4 hover:text-pnp-accent transition-colors"
        style={muted}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Admin Dashboard
      </button>
      <h1 className="text-2xl font-bold text-white">Compliance Queue</h1>
      <p className="text-sm mt-0.5 mb-4" style={muted}>
        Off-app payment and scam flags, creator content waiting for approval, removal requests with legal deadlines, and CSAM reports for NCMEC.
      </p>
      <div className="flex gap-2 mb-5 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={tab === t.id ? btnPrimary : btnGhost}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "flags" && <PolicyFlagsTab />}
      {tab === "reviews" && <ReviewsTab />}
      {tab === "removals" && <RemovalsTab />}
      {tab === "ncmec" && <NcmecTab />}
    </div>
  );
}
