import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Sparkles, TrendingUp, HandCoins, Users, Clock, Star, Trash2, Phone } from "lucide-react";
import {
  adminDeleteFeaturedCreator,
  adminListFeaturedCreators,
  adminListIntroCallOptIn,
  adminSetIntroCallOptIn,
  adminUpsertFeaturedCreator,
  type FeaturedCreatorAdminPick,
  type IntroCallOptInRow,
} from "@/lib/api";

interface Segments {
  total: number;
  never_engaged: number;
  engaged: number;
  dormant: number;
  heavy_consumers: number;
}

interface MemberRow {
  id: string;
  username: string | null;
  first_name: string | null;
  photo_file_id: string | null;
  email: string | null;
  last_active: string | null;
  pnptv_fam_since: string | null;
  pnptv_fam_welcome_seen_at: string | null;
  pnptv_fam_benefits_seen_at: string | null;
  event_count: number;
  cents_credited: number;
}

interface MemberProfile {
  id: string;
  username: string | null;
  firstName: string | null;
  email: string | null;
  telegram: string | null;
  isPnptvFam: boolean;
  isWhalePig: boolean;
  famSince: string | null;
  welcomeSeenAt: string | null;
  benefitsSeenAt: string | null;
  feedLayout: { mode: string; shortcuts: Array<{ type: string; ref: string | null; label: string | null }> };
  lastActive: string | null;
  createdAt: string | null;
  lifecycleStage: string;
  events: { total: number; last7d: number; lastEventAt: string | null };
  credits: { count: number; centsTotal: number; cents30d: number };
  topCreatorsSupported: Array<{ creatorId: string; username: string; firstName: string | null; photoUrl: string | null; credits: number; cents: number }>;
  upsellFunnel: { views: number; clicks: number; gifted: number };
  recentEvents: Array<{ event_type: string; payload: Record<string, unknown>; occurred_at: string }>;
}

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function relativeDays(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function stageColor(stage: string): string {
  switch (stage) {
    case "engaged": return "#34C759";
    case "active": return "#5ED1C4";
    case "fresh": return "#FFB454";
    case "dormant": return "#8E8E93";
    default: return "#EBEBF5";
  }
}

type CrmTab = "crm" | "featured" | "intro_call";

export default function PnpFamCrm() {
  const [activeTab, setActiveTab] = useState<CrmTab>("crm");
  const [segments, setSegments] = useState<Segments | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/pnp-fam/segments", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/pnp-fam/members", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([segRes, memRes]) => {
        if (cancelled) return;
        setSegments(segRes?.segments || null);
        setMembers(memRes?.members || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/pnp-fam/members/${encodeURIComponent(selected)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setProfile(json?.profile || null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const segCards = useMemo(() => {
    if (!segments) return [];
    return [
      { key: "total", label: "Total Fam", value: segments.total, Icon: Users, color: "#EBEBF5" },
      { key: "engaged", label: "Engaged (7d + 20 events)", value: segments.engaged, Icon: TrendingUp, color: "#34C759" },
      { key: "dormant", label: "Dormant (30d+)", value: segments.dormant, Icon: Clock, color: "#FF9F0A" },
      { key: "heavy", label: "Heavy consumers ($50+)", value: segments.heavy_consumers, Icon: HandCoins, color: "#FFB454" },
      { key: "never", label: "Never engaged", value: segments.never_engaged, Icon: Sparkles, color: "#8E8E93" },
    ];
  }, [segments]);

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto" style={{ color: "#EBEBF5" }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #ffb27a, #ffe8d6)", color: "#2a0f08" }}>
          <Crown size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black">PNP Fam CRM</h1>
          <p className="text-sm opacity-70">Lifecycle + creator-compensation ledger for the inner circle.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        {[
          { id: "crm" as const, label: "Fam CRM", Icon: Users },
          { id: "featured" as const, label: "Featured of the Day", Icon: Star },
          { id: "intro_call" as const, label: "Intro-Call Opt-in", Icon: Phone },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === id ? "border-pnp-accent text-white" : "border-transparent text-white/60 hover:text-white"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "featured" && <FeaturedOfTheDayTab />}

      {activeTab === "intro_call" && <IntroCallOptInTab />}

      {activeTab === "crm" && (
        <>
      {/* Segment cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {segCards.map((c) => (
          <div key={c.key} className="rounded-2xl p-4" style={{ background: "rgba(28,28,30,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-2">
              <c.Icon size={16} style={{ color: c.color }} />
              <span className="text-[11px] uppercase tracking-wider opacity-70">{c.label}</span>
            </div>
            <div className="text-3xl font-black" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4">
        {/* Members table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(28,28,30,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="font-bold text-sm uppercase tracking-wider">Members</span>
            <span className="text-xs opacity-70">{members.length}</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm opacity-70">Loading…</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-sm opacity-70">No Fam members yet.</div>
          ) : (
            <ul className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
              {members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${selected === m.id ? "bg-white/10" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #ffb27a, #ffe8d6)", color: "#2a0f08", fontWeight: 800 }}>
                        {(m.first_name || m.username || "?").trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate">@{m.username || m.id}</div>
                        <div className="text-[11px] opacity-70">
                          {m.event_count} events · {centsToUsd(m.cents_credited)} credited
                        </div>
                      </div>
                      <div className="text-[10px] opacity-60 shrink-0">{relativeDays(m.last_active)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Profile detail */}
        <div className="rounded-2xl p-4" style={{ background: "rgba(28,28,30,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {!selected ? (
            <div className="p-8 text-center text-sm opacity-70">Select a member to view their CRM profile.</div>
          ) : !profile ? (
            <div className="p-8 text-center text-sm opacity-70">Loading profile…</div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link to={`/profile/${profile.id}`} className="text-lg font-black hover:underline">
                    @{profile.username || profile.id}
                  </Link>
                  <div className="text-xs opacity-70">
                    Fam since {profile.famSince ? new Date(profile.famSince).toLocaleDateString() : "—"} · last active {relativeDays(profile.lastActive)}
                  </div>
                  <div className="text-[11px] opacity-60 mt-0.5">
                    {profile.email || "(no email)"} · TG {profile.telegram || "—"}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0" style={{ background: `${stageColor(profile.lifecycleStage)}22`, color: stageColor(profile.lifecycleStage), border: `1px solid ${stageColor(profile.lifecycleStage)}55` }}>
                  {profile.lifecycleStage}
                </span>
              </div>

              {/* Onboarding state */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <StatCell label="Welcome" value={profile.welcomeSeenAt ? "✓ seen" : "pending"} accent={!profile.welcomeSeenAt ? "#FFB454" : "#34C759"} />
                <StatCell label="Benefits" value={profile.benefitsSeenAt ? "✓ seen" : "pending"} accent={!profile.benefitsSeenAt ? "#FFB454" : "#34C759"} />
                <StatCell label="Feed mode" value={profile.feedLayout.mode} />
              </div>

              {/* Credits + engagement */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <StatCell label="Events (all)" value={String(profile.events.total)} />
                <StatCell label="Events (7d)" value={String(profile.events.last7d)} />
                <StatCell label="Credited (all)" value={centsToUsd(profile.credits.centsTotal)} accent="#FFB454" />
              </div>

              {/* Top creators supported */}
              <div>
                <div className="text-[11px] uppercase tracking-wider opacity-70 mb-2">Top creators supported</div>
                {profile.topCreatorsSupported.length === 0 ? (
                  <div className="text-sm opacity-60">No creator credits yet.</div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {profile.topCreatorsSupported.map((c) => (
                      <li key={c.creatorId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                          {(c.firstName || c.username || "?").trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 text-sm truncate">@{c.username}</div>
                        <div className="text-[11px] opacity-70">{c.credits} credits</div>
                        <div className="text-sm font-bold shrink-0" style={{ color: "#FFB454" }}>{centsToUsd(c.cents)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Upsell funnel */}
              <div>
                <div className="text-[11px] uppercase tracking-wider opacity-70 mb-2">Crystal upsell funnel</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <StatCell label="Views" value={String(profile.upsellFunnel.views)} />
                  <StatCell label="Clicks" value={String(profile.upsellFunnel.clicks)} />
                  <StatCell label="Gifted" value={String(profile.upsellFunnel.gifted)} accent="#D8B9FF" />
                </div>
              </div>

              {/* Recent events */}
              <div>
                <div className="text-[11px] uppercase tracking-wider opacity-70 mb-2">Recent events</div>
                {profile.recentEvents.length === 0 ? (
                  <div className="text-sm opacity-60">No events logged yet.</div>
                ) : (
                  <ul className="flex flex-col gap-1 text-[12px] font-mono">
                    {profile.recentEvents.map((e, i) => (
                      <li key={i} className="flex justify-between gap-3 px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <span className="opacity-80">{e.event_type}</span>
                        <span className="opacity-60 shrink-0">{new Date(e.occurred_at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function todayIsoUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function FeaturedOfTheDayTab() {
  const [picks, setPicks] = useState<FeaturedCreatorAdminPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(todayIsoUtc());
  const [creatorId, setCreatorId] = useState("");
  const [pitchEn, setPitchEn] = useState("");
  const [pitchEs, setPitchEs] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [ctaIntroCall, setCtaIntroCall] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListFeaturedCreators();
      setPicks(res.picks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load picks");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const editPick = (p: FeaturedCreatorAdminPick) => {
    setDate(p.date.slice(0, 10));
    setCreatorId(p.creator_id);
    setPitchEn(p.pitch_en);
    setPitchEs(p.pitch_es);
    setMediaUrl(p.media_url || "");
    setCtaIntroCall(!!p.cta_intro_call);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminUpsertFeaturedCreator(date, {
        creatorId: creatorId.trim(),
        pitchEn: pitchEn.trim(),
        pitchEs: pitchEs.trim(),
        mediaUrl: mediaUrl.trim() || null,
        ctaIntroCall,
      });
      setCreatorId(""); setPitchEn(""); setPitchEs(""); setMediaUrl(""); setCtaIntroCall(false);
      await load();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Save failed";
      const friendly = raw === "not_crystal_creator"
        ? "This user is not an active Crystal Creator. Featured Model of the Day is Crystal-only."
        : raw === "missing_required_fields"
        ? "Fill in creator, English pitch, and Spanish pitch."
        : raw === "invalid_date_format"
        ? "Date must be YYYY-MM-DD."
        : raw;
      setError(friendly);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: string) => {
    if (!confirm(`Delete featured pick for ${d}?`)) return;
    try {
      await adminDeleteFeaturedCreator(d.slice(0, 10));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
      {/* Editor */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(28,28,30,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="text-sm font-bold uppercase tracking-wider">Schedule a pick</div>
        <label className="block text-xs opacity-70">Date (UTC)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm" />
        </label>
        <label className="block text-xs opacity-70">Creator user ID — must be an active Crystal Creator
          <input type="text" value={creatorId} onChange={(e) => setCreatorId(e.target.value)} placeholder="uuid or numeric id…" className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm font-mono" />
        </label>
        <label className="block text-xs opacity-70">Pitch (English) — 1–2 lines
          <textarea value={pitchEn} onChange={(e) => setPitchEn(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm" />
        </label>
        <label className="block text-xs opacity-70">Pitch (Español)
          <textarea value={pitchEs} onChange={(e) => setPitchEs(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm" />
        </label>
        <label className="block text-xs opacity-70">Media URL (optional MP4/WebM loop or image) — falls back to creator cover
          <input type="text" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm font-mono" />
        </label>
        <label className="flex items-center gap-2 text-xs opacity-90 cursor-pointer">
          <input type="checkbox" checked={ctaIntroCall} onChange={(e) => setCtaIntroCall(e.target.checked)} />
          Show "Book a free 15-min intro call" secondary CTA
        </label>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <button type="button" onClick={submit} disabled={saving || !creatorId || !pitchEn || !pitchEs} className="w-full py-2.5 rounded-lg font-bold text-sm text-white btn-gradient disabled:opacity-50">
          {saving ? "Saving…" : "Save pick"}
        </button>
        <p className="text-[11px] opacity-60">Upserts by date — re-saving the same date overwrites.</p>
      </div>

      {/* Existing picks */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(28,28,30,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="font-bold text-sm uppercase tracking-wider">Scheduled + recent picks</span>
          <span className="text-xs opacity-70">{picks.length}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm opacity-70">Loading…</div>
        ) : picks.length === 0 ? (
          <div className="p-8 text-center text-sm opacity-70">No picks yet — fallback rotation is active.</div>
        ) : (
          <ul className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
            {picks.map((p) => (
              <li key={p.date} className="px-4 py-3 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs opacity-70 font-mono">{p.date.slice(0, 10)}</div>
                    <div className="text-sm font-bold mt-0.5">{p.first_name || p.username || p.creator_id.slice(0, 8)}</div>
                    <div className="text-xs opacity-70">@{p.username}</div>
                    <div className="text-[12px] mt-1 opacity-90 line-clamp-2">{p.pitch_en}</div>
                    {p.cta_intro_call && (
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(94,209,196,0.2)", color: "#5ED1C4" }}>+ intro call CTA</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button type="button" onClick={() => editPick(p)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Edit</button>
                    <button type="button" onClick={() => remove(p.date)} className="text-xs px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 flex items-center gap-1">
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IntroCallOptInTab() {
  const [rows, setRows] = useState<IntroCallOptInRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addId, setAddId] = useState("");
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListIntroCallOptIn();
      setRows(res.optedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (userId: string, enabled: boolean) => {
    setBusyUser(userId);
    try {
      await adminSetIntroCallOptIn(userId, enabled);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setBusyUser(null);
    }
  };

  const addUser = async () => {
    const id = addId.trim();
    if (!id) return;
    await toggle(id, true);
    setAddId("");
  };

  const active = rows.filter((r) => r.is_active);
  const inactive = rows.filter((r) => !r.is_active);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5" style={{ background: "rgba(28,28,30,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold uppercase tracking-wider">Add creator</div>
            <p className="text-[12px] opacity-70">Grants a $0/15-min intro service. User ID (UUID or numeric).</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            placeholder="user id…"
            className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm font-mono"
          />
          <button
            type="button"
            onClick={addUser}
            disabled={!addId.trim()}
            className="px-4 py-2 rounded-lg font-bold text-sm text-white btn-gradient disabled:opacity-50"
          >
            Enable
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(28,28,30,0.85)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="font-bold text-sm uppercase tracking-wider">Currently opted in</span>
          <span className="text-xs opacity-70">{active.length}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm opacity-70">Loading…</div>
        ) : active.length === 0 ? (
          <div className="p-8 text-center text-sm opacity-70">No creators opted in.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {active.map((r) => (
              <li key={r.user_id} className="px-4 py-2.5 flex items-center gap-3">
                {r.photo_url ? (
                  <img src={r.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">{(r.username || "?").slice(0, 2).toUpperCase()}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{r.first_name || r.username || r.user_id.slice(0, 8)}</div>
                  <div className="text-[11px] opacity-60 truncate font-mono">@{r.username || "—"} · {r.user_id}</div>
                </div>
                {r.is_pnptv_fam && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,178,122,0.2)", color: "#ffb27a" }}>FAM</span>
                )}
                <button
                  type="button"
                  onClick={() => toggle(r.user_id, false)}
                  disabled={busyUser === r.user_id}
                  className="text-xs px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-50"
                >
                  {busyUser === r.user_id ? "…" : "Disable"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {inactive.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(28,28,30,0.5)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wider opacity-70">Previously opted in</span>
            <span className="text-xs opacity-50">{inactive.length}</span>
          </div>
          <ul className="divide-y divide-white/5">
            {inactive.map((r) => (
              <li key={r.user_id} className="px-4 py-2 flex items-center gap-3 opacity-70">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{r.first_name || r.username || r.user_id.slice(0, 8)}</div>
                  <div className="text-[11px] opacity-60 truncate font-mono">@{r.username || "—"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(r.user_id, true)}
                  disabled={busyUser === r.user_id}
                  className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50"
                >
                  Re-enable
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-[10px] uppercase tracking-wider opacity-60">{label}</div>
      <div className="text-base font-bold mt-0.5" style={{ color: accent || "#EBEBF5" }}>{value}</div>
    </div>
  );
}
