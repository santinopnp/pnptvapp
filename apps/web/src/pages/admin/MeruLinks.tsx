import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { DataTable } from "@/components/admin/DataTable";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { Badge } from "@pnptv/ui-kit";
import {
  getMeruLinkStats,
  listMeruLinks,
  addMeruLinks,
  deleteMeruLink,
  listNequiActivations,
  activateNequiPayment,
  type MeruLink,
  type MeruLinkStat,
  type NequiActivation,
} from "@/lib/api";

type NequiStatusFilter = "pending" | "activated" | "rejected" | "all";

// ─── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "available" | "used";

interface FilterState {
  product: string;
  status: StatusFilter;
}

const EMPTY_FILTERS: FilterState = { product: "all", status: "all" };

// Curated list of products that can be added via the admin panel. Extend
// this table when a new Meru-backed product is introduced. The `code` is what
// gets stored in meru_payment_links.product (always lowercase — every read
// path filters on lowercase). The `label` is what admins see in the dropdown.
const PRODUCT_PRESETS: Array<{ code: string; label: string; hint: string }> = [
  { code: "lifetime100",  label: "Lifetime Pass — $100",         hint: "One-time PRIME membership" },
  { code: "tokens_250",   label: "Ru$h Pack — $250 → 1,500 Ru$h", hint: "Card/PSE Ru$h purchase" },
  { code: "tokens_500",   label: "Ru$h Pack — $500 → 3,000 Ru$h", hint: "Card/PSE Ru$h purchase" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncateUrl(url: string, max = 40): string {
  if (url.length <= max) return url;
  return url.slice(0, max) + "…";
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function MeruLinks() {
  const t = useI18n().admin;

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"meru" | "nequi">("meru");

  const [stats, setStats] = useState<MeruLinkStat[]>([]);
  const [links, setLinks] = useState<MeruLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [addProduct, setAddProduct] = useState("");
  const [addRawUrls, setAddRawUrls] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<MeruLink | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // ── Nequi Negocios state ──────────────────────────────────────────────────
  const [nequiActivations, setNequiActivations] = useState<NequiActivation[]>([]);
  const [nequiLoading, setNequiLoading] = useState(false);
  const [nequiError, setNequiError] = useState<string | null>(null);
  const [nequiFilter, setNequiFilter] = useState<NequiStatusFilter>("pending");
  const [nequiGrantTarget, setNequiGrantTarget] = useState<NequiActivation | null>(null);
  const [nequiGrantLoading, setNequiGrantLoading] = useState(false);
  const [nequiGrantSuccess, setNequiGrantSuccess] = useState<string | null>(null);

  // ── Derived product list for filter dropdown ──────────────────────────────

  const knownProducts = useMemo(() => {
    const set = new Set(links.map((l) => l.product));
    return Array.from(set).sort();
  }, [links]);

  // ── Filtered links ────────────────────────────────────────────────────────

  const filteredLinks = useMemo(() => {
    let result = [...links];
    if (filters.product !== "all") {
      result = result.filter((l) => l.product === filters.product);
    }
    if (filters.status === "available") {
      result = result.filter((l) => !l.is_used);
    } else if (filters.status === "used") {
      result = result.filter((l) => l.is_used);
    }
    return result;
  }, [links, filters]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, linksRes] = await Promise.all([
        getMeruLinkStats(),
        listMeruLinks(),
      ]);
      setStats(statsRes.stats ?? []);
      setLinks(linksRes.links ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Meru links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Nequi load ────────────────────────────────────────────────────────────

  const loadNequi = useCallback(async () => {
    setNequiLoading(true);
    setNequiError(null);
    try {
      const res = await listNequiActivations(nequiFilter);
      setNequiActivations(res.activations ?? []);
    } catch (err) {
      setNequiError(err instanceof Error ? err.message : "Failed to load Nequi activations");
    } finally {
      setNequiLoading(false);
    }
  }, [nequiFilter]);

  useEffect(() => {
    if (activeTab === "nequi") loadNequi();
  }, [activeTab, loadNequi]);

  const handleNequiGrant = useCallback(async () => {
    if (!nequiGrantTarget) return;
    setNequiGrantLoading(true);
    setNequiGrantSuccess(null);
    setNequiError(null);
    try {
      await activateNequiPayment(nequiGrantTarget.id);
      setNequiGrantSuccess(`Access granted to ${nequiGrantTarget.email}`);
      setNequiGrantTarget(null);
      await loadNequi();
    } catch (err) {
      setNequiError(err instanceof Error ? err.message : "Failed to grant access");
      setNequiGrantTarget(null);
    } finally {
      setNequiGrantLoading(false);
    }
  }, [nequiGrantTarget, loadNequi]);

  // ── Copy URL ──────────────────────────────────────────────────────────────

  const handleCopy = useCallback((link: MeruLink) => {
    navigator.clipboard.writeText(link.url).then(() => {
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {
      // Fallback: select a temporary input
      const el = document.createElement("textarea");
      el.value = link.url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  // ── Add links ─────────────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    setAddError(null);
    setAddSuccess(null);

    if (!addProduct.trim()) {
      setAddError("Select a product before adding links.");
      return;
    }

    const rawLines = addRawUrls
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0) {
      setAddError("Paste at least one URL.");
      return;
    }
    if (rawLines.length > 100) {
      setAddError("Maximum 100 links per batch. Split into multiple submissions.");
      return;
    }

    setAddLoading(true);
    try {
      const res = await addMeruLinks(addProduct.trim(), rawLines);
      setAddSuccess(`${res.added} link${res.added !== 1 ? "s" : ""} added successfully.`);
      setAddRawUrls("");
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add links");
    } finally {
      setAddLoading(false);
    }
  }, [addProduct, addRawUrls, load]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteMeruLink(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete link");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, load]);

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns = [
    {
      key: "product",
      header: "Product",
      render: (row: MeruLink) => (
        <span className="font-mono text-xs text-pnp-textPrimary">{row.product}</span>
      ),
    },
    {
      key: "url",
      header: "URL",
      render: (row: MeruLink) => (
        <button
          onClick={() => handleCopy(row)}
          title={row.url}
          className="group flex items-center gap-1.5 text-left"
        >
          <span className="font-mono text-xs text-pnp-accent group-hover:underline">
            {truncateUrl(row.url)}
          </span>
          {copiedId === row.id ? (
            <svg className="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-pnp-textSecondary opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: MeruLink) =>
        row.is_used ? (
          <Badge variant="error">Used</Badge>
        ) : (
          <Badge variant="success">Available</Badge>
        ),
    },
    {
      key: "used_by",
      header: "Used By",
      render: (row: MeruLink) => {
        if (!row.is_used) return <span className="text-pnp-textSecondary text-xs">—</span>;
        return (
          <div>
            {row.used_by_username && (
              <span className="text-xs text-pnp-textPrimary font-medium">@{row.used_by_username}</span>
            )}
            {row.used_by && (
              <span className="block font-mono text-[10px] text-pnp-textSecondary mt-0.5">{row.used_by}</span>
            )}
            {!row.used_by_username && !row.used_by && (
              <span className="text-pnp-textSecondary text-xs">—</span>
            )}
          </div>
        );
      },
    },
    {
      key: "used_at",
      header: "Used At",
      render: (row: MeruLink) => (
        <span className="text-xs text-pnp-textSecondary">{formatDate(row.used_at)}</span>
      ),
    },
    {
      key: "created_at",
      header: "Added",
      render: (row: MeruLink) => (
        <span className="text-xs text-pnp-textSecondary">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row: MeruLink) =>
        row.is_used ? null : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
            className="text-xs text-red-400 hover:underline"
          >
            Delete
          </button>
        ),
    },
  ];

  // ── Stats totals ──────────────────────────────────────────────────────────

  const totals = useMemo(
    () =>
      stats.reduce(
        (acc, s) => ({
          total: acc.total + s.total,
          used: acc.used + s.used,
          available: acc.available + s.available,
        }),
        { total: 0, used: 0, available: 0 }
      ),
    [stats]
  );

  const hasActiveFilters = filters.product !== "all" || filters.status !== "all";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pnp-textPrimary">{t.meruLinks.title}</h1>
          <p className="text-sm text-pnp-textSecondary mt-1">
            {t.meruLinks.subtitle}
          </p>
        </div>
        <button
          onClick={activeTab === "meru" ? load : loadNequi}
          disabled={activeTab === "meru" ? loading : nequiLoading}
          className="px-3 py-2 rounded-lg border border-pnp-border text-xs text-pnp-textSecondary hover:text-pnp-textPrimary hover:border-pnp-accent/50 disabled:opacity-50 transition-colors"
        >
          {(activeTab === "meru" ? loading : nequiLoading) ? t.shared.loading : t.shared.refresh}
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-pnp-border pb-1">
        {(["meru", "nequi"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
              activeTab === tab
                ? "text-pnp-textPrimary border-b-2 border-pnp-accent"
                : "text-pnp-textSecondary hover:text-pnp-textPrimary"
            }`}
          >
            {tab === "meru" ? "Meru Links" : "Nequi Negocios"}
            {tab === "nequi" && nequiActivations.filter((a) => a.status === "pending").length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold">
                {nequiActivations.filter((a) => a.status === "pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && activeTab === "meru" && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t.shared.dismiss}</button>
        </div>
      )}
      {nequiError && activeTab === "nequi" && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {nequiError}
          <button onClick={() => setNequiError(null)} className="ml-2 underline">{t.shared.dismiss}</button>
        </div>
      )}
      {nequiGrantSuccess && activeTab === "nequi" && (
        <div className="px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400">
          {nequiGrantSuccess}
          <button onClick={() => setNequiGrantSuccess(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* ════════════════════════════ NEQUI NEGOCIOS TAB ════════════════════ */}
      {activeTab === "nequi" && (
        <div className="space-y-4">
          {/* How-to note */}
          <div className="px-4 py-3 rounded-xl bg-orange-500/8 border border-orange-500/20 text-sm text-orange-300 leading-relaxed">
            <strong>Flujo:</strong> Comprador paga en Nequi → aterriza en <code className="font-mono text-xs">/nequinegocios</code> → ingresa su correo → aparece aquí.
            Verifica en el dashboard de Wompi y haz clic en <strong>Grant Access</strong>.
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-pnp-textSecondary">Estado:</span>
            {(["pending", "activated", "all"] as NequiStatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setNequiFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  nequiFilter === s
                    ? "bg-pnp-accent text-white"
                    : "border border-pnp-border text-pnp-textSecondary hover:text-pnp-textPrimary"
                }`}
              >
                {s === "pending" ? "Pendientes" : s === "activated" ? "Activados" : "Todos"}
              </button>
            ))}
          </div>

          {/* Activations table */}
          {nequiLoading ? (
            <p className="text-sm text-pnp-textSecondary py-8 text-center">Cargando…</p>
          ) : nequiActivations.length === 0 ? (
            <p className="text-sm text-pnp-textSecondary py-8 text-center">No hay registros.</p>
          ) : (
            <div className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-pnp-border bg-pnp-background">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-pnp-textSecondary">Email</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-pnp-textSecondary">Wompi Ref.</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-pnp-textSecondary">Wompi Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-pnp-textSecondary">Estado</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-pnp-textSecondary">Fecha</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-pnp-textSecondary"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pnp-border">
                    {nequiActivations.map((row) => (
                      <tr key={row.id} className="hover:bg-pnp-background/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-xs text-pnp-textPrimary font-medium">{row.email}</div>
                          {row.username && <div className="text-[10px] text-pnp-textSecondary">@{row.username}</div>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-pnp-textSecondary">{row.wompi_reference || "—"}</td>
                        <td className="px-4 py-3">
                          {row.wompi_status === "APPROVED" ? (
                            <Badge variant="success">APPROVED</Badge>
                          ) : row.wompi_status ? (
                            <Badge variant="warning">{row.wompi_status}</Badge>
                          ) : (
                            <span className="text-pnp-textSecondary text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.status === "activated" ? (
                            <Badge variant="success">Activado</Badge>
                          ) : row.status === "rejected" ? (
                            <Badge variant="error">Rechazado</Badge>
                          ) : (
                            <Badge variant="warning">Pendiente</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-pnp-textSecondary whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-3">
                          {row.status === "pending" && (
                            <button
                              onClick={() => setNequiGrantTarget(row)}
                              className="px-3 py-1.5 rounded-lg bg-pnp-accent/10 border border-pnp-accent/30 text-pnp-accent text-xs font-semibold hover:bg-pnp-accent/20 transition-colors whitespace-nowrap"
                            >
                              Grant Access
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════ MERU LINKS TAB ════════════════════════ */}
      {activeTab === "meru" && <>

      {/* ─── Stats row ────────────────────────────────────────────────────── */}
      {!loading && stats.length > 0 && (
        <div className="space-y-3">
          {/* All-products totals */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-pnp-border bg-pnp-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-pnp-textPrimary">{totals.total}</p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">{t.meruLinks.totalLinks}</p>
            </div>
            <div className="rounded-xl border border-pnp-border bg-pnp-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-green-400">{totals.available}</p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">{t.meruLinks.available}</p>
            </div>
            <div className="rounded-xl border border-pnp-border bg-pnp-surface px-4 py-3 text-center">
              <p className="text-2xl font-bold text-pnp-textSecondary">{totals.used}</p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">{t.meruLinks.used}</p>
            </div>
          </div>

          {/* Per-product breakdown */}
          <div className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-pnp-border">
              <p className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wide">{t.meruLinks.byProduct}</p>
            </div>
            <div className="divide-y divide-pnp-border">
              {stats.map((s) => (
                <div key={s.product} className="flex items-center gap-4 px-4 py-3">
                  <span className="font-mono text-sm text-pnp-textPrimary flex-1">{s.product}</span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-pnp-textSecondary">
                      Total: <span className="font-semibold text-pnp-textPrimary">{s.total}</span>
                    </span>
                    <span className="text-green-400">
                      Available: <span className="font-semibold">{s.available}</span>
                    </span>
                    <span className="text-pnp-textSecondary">
                      Used: <span className="font-semibold">{s.used}</span>
                    </span>
                    <div className="w-20 h-1.5 rounded-full bg-pnp-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-pnp-accent"
                        style={{ width: s.total > 0 ? `${Math.round((s.used / s.total) * 100)}%` : "0%" }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Add links form ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-pnp-border bg-pnp-surface p-4 space-y-3">
        <p className="text-sm font-semibold text-pnp-textPrimary">{t.meruLinks.addNewLinks}</p>

        {addError && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {addError}
          </div>
        )}
        {addSuccess && (
          <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400">
            {addSuccess}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {/* Product selector — curated dropdown so admins can't create typos
              like "Lifetime100" (which silently orphans paid inventory from
              every read query). */}
          <div className="flex flex-col gap-1 min-w-[260px]">
            <label className="text-xs text-pnp-textSecondary">{t.meruLinks.product}</label>
            <select
              value={addProduct}
              onChange={(e) => setAddProduct(e.target.value)}
              className="px-3 py-2 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-sm focus:outline-none focus:border-pnp-accent transition-colors"
              style={{ fontSize: "16px" }}
            >
              <option value="">— {t.meruLinks.productPlaceholder} —</option>
              {PRODUCT_PRESETS.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
              {/* Surface any product already in DB that isn't in the preset table
                  (legacy or ad-hoc) so admins can still add more of the same. */}
              {knownProducts
                .filter((p) => !PRODUCT_PRESETS.some((pp) => pp.code === p))
                .map((p) => (
                  <option key={p} value={p}>{p} (legacy)</option>
                ))}
            </select>
            {addProduct && (
              <p className="text-[11px] text-pnp-textSecondary/70">
                {PRODUCT_PRESETS.find((p) => p.code === addProduct)?.hint ??
                  "Legacy product — added links go straight into the same pool."}
              </p>
            )}
          </div>
        </div>

        {/* URL textarea */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-pnp-textSecondary">
            {t.meruLinks.urlsLabel}
          </label>
          <textarea
            value={addRawUrls}
            onChange={(e) => setAddRawUrls(e.target.value)}
            placeholder={"https://pay.getmeru.com/AbCdEf\nhttps://pay.getmeru.com/GhIjKl"}
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-sm font-mono placeholder:text-pnp-textSecondary focus:outline-none focus:border-pnp-accent transition-colors resize-y"
            style={{ fontSize: "14px" }}
          />
          <p className="text-[11px] text-pnp-textSecondary">
            {addRawUrls.split("\n").filter((l) => l.trim()).length} URL
            {addRawUrls.split("\n").filter((l) => l.trim()).length !== 1 ? "s" : ""} entered
            {" · "}
            <span className="text-pnp-textSecondary/70">
              The code is auto-extracted from the last path segment (e.g. <span className="font-mono">LWu_pc</span>). Randomizer picks one at reservation time.
            </span>
          </p>
        </div>

        <button
          onClick={handleAdd}
          disabled={addLoading}
          className="px-4 py-2 rounded-lg bg-pnp-accent text-white text-sm font-medium hover:bg-pnp-accent/80 disabled:opacity-50 transition-colors"
        >
          {addLoading ? t.meruLinks.adding : t.meruLinks.addLinks}
        </button>
      </div>

      {/* ─── Filter bar ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-pnp-border bg-pnp-surface px-4 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Product filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-pnp-textSecondary whitespace-nowrap">{t.meruLinks.product}</label>
            <select
              value={filters.product}
              onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
              className="px-2 py-1.5 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-xs focus:outline-none focus:border-pnp-accent transition-colors"
            >
              <option value="all">{t.shared.all}</option>
              {knownProducts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-pnp-textSecondary whitespace-nowrap">{t.shared.status}</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as StatusFilter }))}
              className="px-2 py-1.5 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-xs focus:outline-none focus:border-pnp-accent transition-colors"
            >
              <option value="all">{t.shared.all}</option>
              <option value="available">{t.meruLinks.available}</option>
              <option value="used">{t.meruLinks.used}</option>
            </select>
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-pnp-border text-xs text-pnp-textSecondary hover:text-pnp-textPrimary hover:border-pnp-accent/50 transition-colors whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {t.shared.clearFilters}
            </button>
          )}

          {/* Count */}
          <span className="ml-auto text-xs text-pnp-textSecondary whitespace-nowrap">
            {loading ? (
              "Loading…"
            ) : hasActiveFilters ? (
              <>
                Showing{" "}
                <span className="font-semibold text-pnp-textPrimary">{filteredLinks.length}</span>
                {" "}of{" "}
                <span className="font-semibold text-pnp-textPrimary">{links.length}</span>
                {" "}links
              </>
            ) : (
              <>
                <span className="font-semibold text-pnp-textPrimary">{links.length}</span>
                {" "}link{links.length !== 1 ? "s" : ""}
              </>
            )}
          </span>
        </div>
      </div>

      {/* ─── Table ────────────────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={filteredLinks}
        loading={loading}
        emptyMessage={
          hasActiveFilters
            ? t.meruLinks.noLinksFilter
            : t.meruLinks.noLinksYet
        }
        getRowId={(row) => row.id}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!deleteTarget}
        title={t.meruLinks.deleteMeruLink}
        message={`Delete the link for product "${deleteTarget?.product ?? ""}"?\n\n${deleteTarget?.url ?? ""}\n\nThis cannot be undone.`}
        confirmLabel={t.shared.delete}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteLoading}
      />

      </> /* end Meru tab */}

      {/* Nequi grant confirmation */}
      <ConfirmModal
        open={!!nequiGrantTarget}
        title="Grant Lifetime Access"
        message={`Grant lifetime PRIME membership to:\n\n${nequiGrantTarget?.email ?? ""}\n\nWompi Reference: ${nequiGrantTarget?.wompi_reference ?? "N/A"}\nWompi Status: ${nequiGrantTarget?.wompi_status ?? "N/A"}\n\nMake sure you have verified payment in the Wompi dashboard before proceeding.`}
        confirmLabel="Yes, Grant Access"
        variant="default"
        onConfirm={handleNequiGrant}
        onCancel={() => setNequiGrantTarget(null)}
        loading={nequiGrantLoading}
      />
    </div>
  );
}
