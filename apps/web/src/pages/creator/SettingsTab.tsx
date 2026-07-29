import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  getCreatorWallet,
  saveCreatorWallet,
  saveStreamRules,
  toggleCreatorSubscription,
  listCreatorMedia,
  updateCreatorMedia,
  deleteCreatorMedia,
  reorderCreatorMedia,
  listCreatorRecordings,
  deleteRecording,
  updateRecording,
  uploadAvatar,
  uploadCreatorMediaFile,
  uploadCreatorVideoFile,
  uploadCreatorVideoChunked,
  getVideoUploadResume,
  clearVideoUploadResume,
  updateProfile,
  getProfile,
  getCreatorEligibilityStatus,
  getCreatorManual,
  saveCreatorManual,
  suggestCreatorManualAI,
  setCreatorPrice,
  type CreatorDashboard as DashboardData,
  type CreatorMediaItem,
  type StreamRecording,
  type ChunkUploadProgress,
  type CreatorLiveEligibility,
} from "@/lib/api";
import { type CreatorStrings } from "@/lib/i18n/creator";

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface SettingsTabProps {
  dashboard: DashboardData & { success: boolean };
  t: CreatorStrings;
}

const DASH_ADDRESS_RE = /^[X7][1-9A-HJ-NP-Za-km-z]{33}$/;

export function SettingsTab({ dashboard, t }: SettingsTabProps) {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const creatorRole = (authUser as (typeof authUser & { creator_role?: string }) | null)?.creator_role ?? null;

  // Live eligibility state — drives membership toggle gate
  const [liveEligibility, setLiveEligibility] = useState<CreatorLiveEligibility | null>(null);
  useEffect(() => {
    getCreatorEligibilityStatus()
      .then((res) => setLiveEligibility(res as CreatorLiveEligibility))
      .catch(() => {});
  }, []);

  // Per-lane payout destinations. Creators save multiple and pick a lane at
  // cashout time. Empty fields are not sent on save.
  const [meruAccount, setMeruAccount]         = useState<string>("");
  const [btcAddress, setBtcAddress]           = useState<string>("");
  const [dashAddress, setDashAddress]         = useState<string>("");
  const [usdtTronAddress, setUsdtTronAddress] = useState<string>("");
  const [usdtBaseAddress, setUsdtBaseAddress] = useState<string>("");
  // Bre-B (Colombia): interoperable instant payment key registered with the
  // creator's bank. Payload stored as { key, key_type }.
  const [breBKey, setBreBKey]                 = useState<string>("");
  const [breBKeyType, setBreBKeyType]         = useState<"phone" | "cedula" | "email">("phone");
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletSuccess, setWalletSuccess] = useState<string | null>(null);

  // ── Stage name + location state ──────────────────────────────────────────────
  const [stageName, setStageName] = useState<string>(authUser?.firstName ?? "");
  const [locationCountry, setLocationCountry] = useState<string>("");
  const [profileInfoSaving, setProfileInfoSaving] = useState(false);
  const [profileInfoError, setProfileInfoError] = useState<string | null>(null);
  const [profileInfoSuccess, setProfileInfoSuccess] = useState<string | null>(null);

  // Load stage name + country on mount — bio is managed in Content → Profile.
  useEffect(() => {
    getProfile().then((res) => {
      if (res.success) {
        setStageName(res.profile.firstName || authUser?.firstName || "");
        setLocationCountry(res.profile.country ?? "");
      }
    }).catch(() => {/* non-fatal */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Price editor ─────────────────────────────────────────────────────────────
  // 2026-07-24: Ice/Crystal/Diamond tiers deprecated. Creators now set their
  // own monthly price in [$1, $500]. Value mirrors to their canonical paid
  // channel automatically via CreatorService.updateCreatorPrice.
  const PRICE_MIN = 1;
  const PRICE_MAX = 500;
  const [priceInput, setPriceInput] = useState<string>(
    dashboard.priceUsd != null ? String(dashboard.priceUsd) : "10"
  );
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSuccess, setPriceSuccess] = useState<string | null>(null);

  const handleSavePrice = async () => {
    setPriceError(null);
    setPriceSuccess(null);
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price < PRICE_MIN || price > PRICE_MAX) {
      setPriceError(`Price must be between $${PRICE_MIN} and $${PRICE_MAX}.`);
      return;
    }
    setPriceSaving(true);
    try {
      await setCreatorPrice(price);
      setPriceInput(String(price));
      setPriceSuccess(`Price updated to $${price.toFixed(2)}/mo.`);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : "Failed to update price.");
    } finally {
      setPriceSaving(false);
    }
  };

  // ── Album / media state ──────────────────────────────────────────────────────
  const [albumItems, setAlbumItems] = useState<CreatorMediaItem[]>([]);
  const [albumLoading, setAlbumLoading] = useState(true);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [albumSuccess, setAlbumSuccess] = useState<string | null>(null);

  const mediaFileInputRef = useRef<HTMLInputElement>(null);

  // Add-form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<"photo" | "video">("photo");
  const [addCaption, setAddCaption] = useState("");
  const [addPremium, setAddPremium] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addFilePreview, setAddFilePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ChunkUploadProgress | null>(null);
  const [videoResume, setVideoResume] = useState<{ uploadId: string; chunksUploaded: number } | null>(null);

  // Profile photo state
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState<string | null>(null);
  const [profilePhotoSuccess, setProfilePhotoSuccess] = useState<string | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);

  // User manual state — public "how to book / what to expect" markdown
  const MANUAL_MAX = 5000;
  const [manualMarkdown, setManualMarkdown] = useState<string>("");
  const [manualLoading, setManualLoading] = useState<boolean>(true);
  const [manualSaving, setManualSaving] = useState<boolean>(false);
  const [manualAiLoading, setManualAiLoading] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);

  useEffect(() => {
    const userId = authUser?.id ? String(authUser.id) : null;
    if (!userId) { setManualLoading(false); return; }
    getCreatorManual(userId)
      .then((res) => { setManualMarkdown(res.markdown || ""); })
      .catch(() => { /* 404 first time = no manual yet */ })
      .finally(() => setManualLoading(false));
  }, [authUser?.id]);

  const handleGenerateManualAI = useCallback(async () => {
    setManualAiLoading(true);
    setManualError(null);
    setManualSuccess(null);
    try {
      const res = await suggestCreatorManualAI();
      if (res.success && res.markdown) {
        setManualMarkdown(res.markdown);
        setManualSuccess("Draft generated. Edit and save to publish.");
      } else {
        setManualError("AI could not draft a manual right now. Try again in a moment.");
      }
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "AI suggestion failed");
    } finally {
      setManualAiLoading(false);
    }
  }, []);

  const handleSaveManual = useCallback(async () => {
    if (manualMarkdown.length > MANUAL_MAX) {
      setManualError(`Too long — max ${MANUAL_MAX} characters.`);
      return;
    }
    setManualSaving(true);
    setManualError(null);
    setManualSuccess(null);
    try {
      await saveCreatorManual(manualMarkdown);
      setManualSuccess(t.settingsSavedShort);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : t.settingsSaveFailedGeneric);
    } finally {
      setManualSaving(false);
    }
  }, [manualMarkdown, t]);

  const loadAlbum = useCallback(async () => {
    const userId = authUser?.id ? String(authUser.id) : null;
    if (!userId) { setAlbumLoading(false); return; }
    setAlbumLoading(true);
    setAlbumError(null);
    try {
      const res = await listCreatorMedia(userId);
      setAlbumItems(res.items || []);
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : "Failed to load album.");
    } finally {
      setAlbumLoading(false);
    }
  }, [authUser?.id]);

  useEffect(() => { loadAlbum(); }, [loadAlbum]);

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfilePhotoError(null);
    setProfilePhotoSuccess(null);
    setProfilePhotoPreview(URL.createObjectURL(file));
    setProfilePhotoUploading(true);
    try {
      await uploadAvatar(file);
      setProfilePhotoSuccess("Profile photo updated.");
    } catch (err) {
      setProfilePhotoError(err instanceof Error ? err.message : "Upload failed.");
      setProfilePhotoPreview(null);
    } finally {
      setProfilePhotoUploading(false);
    }
  };

  const handleSaveProfileInfo = async () => {
    setProfileInfoError(null);
    setProfileInfoSuccess(null);
    const trimmedName = stageName.trim();
    const trimmedCountry = locationCountry.trim();
    if (!trimmedName) {
      setProfileInfoError("Stage name is required.");
      return;
    }
    if (trimmedName.length > 100) {
      setProfileInfoError("Stage name must be 100 characters or fewer.");
      return;
    }
    if (trimmedCountry.length > 100) {
      setProfileInfoError("Country must be 100 characters or fewer.");
      return;
    }
    setProfileInfoSaving(true);
    try {
      await updateProfile({
        firstName: trimmedName,
        ...(trimmedCountry ? { country: trimmedCountry } : {}),
      });
      setProfileInfoSuccess("Profile info saved.");
    } catch (err) {
      setProfileInfoError(err instanceof Error ? err.message : "Failed to save profile info.");
    } finally {
      setProfileInfoSaving(false);
    }
  };

  const handleAddMedia = async () => {
    setAlbumError(null);
    setAlbumSuccess(null);
    if (!addFile) { setAlbumError("Please select a file."); return; }
    setAddSaving(true);
    try {
      if (addType === "photo") {
        await uploadCreatorMediaFile(addFile, addCaption.trim() || undefined, addPremium || undefined);
      } else {
        await uploadCreatorVideoChunked(addFile, {
          caption: addCaption.trim() || undefined,
          isPremium: addPremium || undefined,
          resumeUploadId: videoResume?.uploadId,
          resumeChunksDone: videoResume?.chunksUploaded,
          onProgress: (p) => setUploadProgress(p),
        });
        setVideoResume(null);
      }
      setAlbumSuccess("Media added.");
      setAddFile(null);
      setAddFilePreview(null);
      setAddCaption("");
      setAddPremium(false);
      setShowAddForm(false);
      await loadAlbum();
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : "Failed to upload.");
    } finally {
      setAddSaving(false);
      setUploadProgress(null);
    }
  };

  const handleTogglePremium = async (item: CreatorMediaItem) => {
    try {
      await updateCreatorMedia(item.id, { isPremium: !item.isPremium });
      setAlbumItems((prev) => prev.map((m) => m.id === item.id ? { ...m, isPremium: !m.isPremium } : m));
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : "Failed to update.");
    }
  };

  const handleDeleteMedia = async (id: string) => {
    try {
      await deleteCreatorMedia(id);
      setAlbumItems((prev) => prev.filter((m) => m.id !== id));
      setAlbumSuccess(t.settingsDeleted);
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : t.settingsAlbumDeleteFailed);
    }
  };

  const handleMoveItem = async (index: number, direction: -1 | 1) => {
    const newItems = [...albumItems];
    const target = index + direction;
    if (target < 0 || target >= newItems.length) return;
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    const reordered = newItems.map((m, i) => ({ ...m, sortOrder: i }));
    setAlbumItems(reordered);
    try {
      await reorderCreatorMedia(reordered.map((m) => ({ id: m.id, sort_order: m.sortOrder ?? 0 })));
    } catch {
      // revert on failure
      await loadAlbum();
    }
  };

  // ── My Replays ─────────────────────────────────────────────────────────────
  const [myRecordings, setMyRecordings] = useState<StreamRecording[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(true);
  const [recordingsError, setRecordingsError] = useState<string | null>(null);

  const loadRecordings = useCallback(async () => {
    const userId = authUser?.id ? String(authUser.id) : null;
    if (!userId) { setRecordingsLoading(false); return; }
    setRecordingsLoading(true);
    setRecordingsError(null);
    try {
      const res = await listCreatorRecordings(userId);
      setMyRecordings(res.recordings || []);
    } catch (err) {
      setRecordingsError(err instanceof Error ? err.message : "Failed to load recordings.");
    } finally {
      setRecordingsLoading(false);
    }
  }, [authUser?.id]);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  const handleDeleteRecording = async (id: string) => {
    setRecordingsError(null);
    try {
      await deleteRecording(id);
      setMyRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setRecordingsError(err instanceof Error ? err.message : "Failed to delete recording.");
    }
  };

  // ── Inline recording edit ──────────────────────────────────────────────────
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditRec = (rec: StreamRecording) => {
    setEditingRecId(rec.id);
    setEditTitle(rec.title ?? "");
    setEditDescription(rec.description ?? "");
    setEditError(null);
  };

  const cancelEditRec = () => {
    setEditingRecId(null);
    setEditError(null);
  };

  const saveEditRec = async (id: string) => {
    setEditError(null);
    if (editTitle.length > 120) { setEditError("Title must be 120 characters or fewer."); return; }
    if (editDescription.length > 2000) { setEditError("Description must be 2000 characters or fewer."); return; }
    setEditSaving(true);
    try {
      const res = await updateRecording(id, { title: editTitle, description: editDescription });
      setMyRecordings((prev) =>
        prev.map((r) => r.id === id ? { ...r, title: res.title, description: res.description } : r)
      );
      setEditingRecId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setEditSaving(false);
    }
  };

  // Membership toggle state
  const [subscriptionPaused, setSubscriptionPaused] = useState<boolean>(
    dashboard.subscriptionPaused ?? false
  );
  const [subToggling, setSubToggling] = useState(false);
  const [subToggleError, setSubToggleError] = useState<string | null>(null);

  const handleToggleSubscription = async () => {
    const confirmed = window.confirm(
      subscriptionPaused
        ? 'Enable new memberships? Members can now subscribe to your content.'
        : 'Pause new memberships? Existing subscribers keep access until their period ends.'
    );
    if (!confirmed) return;
    setSubToggleError(null);
    setSubToggling(true);
    const prev = subscriptionPaused;
    setSubscriptionPaused(!prev);
    try {
      const res = await toggleCreatorSubscription();
      if (res.success) {
        setSubscriptionPaused(res.subscriptionPaused);
      } else {
        setSubscriptionPaused(prev);
        setSubToggleError(res.error || "Failed to update setting.");
      }
    } catch (err) {
      setSubscriptionPaused(prev);
      setSubToggleError(err instanceof Error ? err.message : "Failed to update setting.");
    } finally {
      setSubToggling(false);
    }
  };

  // Stream rules state
  const STREAM_RULES_MAX = 2000;
  const [streamRules, setStreamRules] = useState<string>(
    dashboard.streamRules ?? ""
  );
  const [streamRulesSaving, setStreamRulesSaving] = useState(false);
  const [streamRulesError, setStreamRulesError] = useState<string | null>(null);
  const [streamRulesSuccess, setStreamRulesSuccess] = useState<string | null>(null);

  const handleSaveStreamRules = async () => {
    setStreamRulesError(null);
    setStreamRulesSuccess(null);
    if (streamRules.length > STREAM_RULES_MAX) {
      setStreamRulesError(`Rules must be at most ${STREAM_RULES_MAX} characters.`);
      return;
    }
    setStreamRulesSaving(true);
    try {
      const res = await saveStreamRules(streamRules);
      if (res.success) {
        setStreamRulesSuccess("Stream rules saved.");
        setStreamRules(res.rules ?? "");
      } else {
        setStreamRulesError((res as { error?: string }).error || "Failed to save stream rules.");
      }
    } catch (err) {
      setStreamRulesError(err instanceof Error ? err.message : "Failed to save stream rules.");
    } finally {
      setStreamRulesSaving(false);
    }
  };

  // Load wallet data
  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    try {
      const res = await getCreatorWallet();
      if (res.success) {
        const d = res.destinations || {};
        setMeruAccount(d.meru?.handle      || res.meruAccount  || "");
        setBtcAddress(d.btc?.address       || "");
        setDashAddress(d.dash?.address     || res.dashAddress  || "");
        setUsdtTronAddress(d.usdt_tron?.address || "");
        setUsdtBaseAddress(d.usdt_base?.address || "");
        if (d.bre_b?.key) {
          setBreBKey(d.bre_b.key);
          setBreBKeyType(d.bre_b.key_type || "phone");
        }
      }
    } catch {
      // Non-critical
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // Each lane is sent only when its field is non-empty. Validation runs
  // client-side first (cheap feedback) and is re-run server-side.
  const handleSaveWallet = async () => {
    setWalletError(null);
    setWalletSuccess(null);

    const destinations: Parameters<typeof saveCreatorWallet>[0]["destinations"] = {};
    const meru = meruAccount.trim();
    const btc  = btcAddress.trim();
    const dash = dashAddress.trim();
    const trc  = usdtTronAddress.trim();
    const bas  = usdtBaseAddress.trim();

    if (meru) {
      if (!/^(\+?[0-9]{7,15}|[a-zA-Z0-9._-]{3,50})$/.test(meru)) {
        setWalletError("Invalid Meru handle. Use international phone (+57…) or alphanumeric username (3–50 chars).");
        return;
      }
      destinations!.meru = { handle: meru };
    }
    if (btc) {
      if (!/^bc1[ac-hj-np-z02-9]{6,87}$/.test(btc) && !/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(btc)) {
        setWalletError("Invalid BTC mainnet address. Use bc1… (segwit) or 1…/3… (legacy).");
        return;
      }
      destinations!.btc = { address: btc };
    }
    if (dash) {
      if (!DASH_ADDRESS_RE.test(dash)) {
        setWalletError("Invalid Dash address. Starts with X (or 7) and is 34 characters long.");
        return;
      }
      destinations!.dash = { address: dash };
    }
    if (trc) {
      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trc)) {
        setWalletError("Invalid USDT-TRON address. Starts with T, 34 characters.");
        return;
      }
      destinations!.usdt_tron = { address: trc };
    }
    if (bas) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(bas)) {
        setWalletError("Invalid USDT-Base address. Starts with 0x, 42 characters.");
        return;
      }
      destinations!.usdt_base = { address: bas };
    }
    const breB = breBKey.trim();
    if (breB) {
      const invalid =
        (breBKeyType === "phone"  && !/^\+?[0-9]{10,15}$/.test(breB)) ||
        (breBKeyType === "cedula" && !/^[0-9]{6,12}$/.test(breB)) ||
        (breBKeyType === "email"  && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(breB));
      if (invalid) {
        setWalletError(
          breBKeyType === "phone"
            ? "Llave Bre-B (celular) inválida. Usa 10 a 15 dígitos (ej: 3001234567 o +573001234567)."
            : breBKeyType === "cedula"
              ? "Llave Bre-B (cédula) inválida. Usa 6 a 12 dígitos."
              : "Llave Bre-B (email) inválida."
        );
        return;
      }
      destinations!.bre_b = { key: breB, key_type: breBKeyType };
    }

    if (Object.keys(destinations!).length === 0) {
      setWalletError(t.settingsWalletAtLeastOne);
      return;
    }

    setWalletSaving(true);
    try {
      const res = await saveCreatorWallet({ destinations });
      if (res.success) {
        setWalletSuccess(t.settingsWalletSavedOk);
      } else {
        setWalletError(res.error || t.settingsWalletSaveFailed);
      }
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : t.settingsWalletSaveFailed);
    } finally {
      setWalletSaving(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ─── TU PERFIL ─────────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest px-1 pt-1" style={{ color: "rgba(255,255,255,0.3)" }}>{t.settingsSectionYourProfile}</p>

      {/* Profile Photo */}
      <div className="glass-card-sm p-5">
        <p className="text-sm font-semibold text-white mb-1">{t.settingsProfilePhotoTitle}</p>
        <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {t.settingsProfilePhotoDesc}
        </p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-white/5 border border-white/10">
            {(profilePhotoPreview || authUser?.photoUrl) ? (
              <img src={profilePhotoPreview || authUser?.photoUrl!} alt={t.settingsProfilePhotoAlt} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20 text-xl">
                {authUser?.username?.[0]?.toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              style={{ background: "rgba(212,0,122,0.15)", color: "#D4007A", border: "1px solid rgba(212,0,122,0.3)" }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {profilePhotoUploading ? t.settingsProfilePhotoUploading : t.settingsProfilePhotoChangeBtn}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                onChange={handleProfilePhotoChange} disabled={profilePhotoUploading} />
            </label>
            <p className="text-[10px] mt-1.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.settingsProfilePhotoHint}</p>
          </div>
        </div>
        {profilePhotoSuccess && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(94,209,196,0.1)", color: "#5ED1C4" }}>{profilePhotoSuccess}</div>
        )}
        {profilePhotoError && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>{profilePhotoError}</div>
        )}
      </div>

      {/* Stage Name & Location */}
      <div className="glass-card-sm p-5">
        <p className="text-sm font-semibold text-white mb-1">{t.settingsStageNameCardTitle}</p>
        <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {t.settingsStageNameCardDesc}
        </p>
        <div className="space-y-3">
          <div>
            <label htmlFor="settings-stage-name" className="block text-xs font-medium text-white/70 mb-1">
              {t.settingsStageNameLabel} <span style={{ color: "#D4007A" }}>*</span>
            </label>
            <input
              id="settings-stage-name"
              type="text"
              value={stageName}
              onChange={(e) => { setStageName(e.target.value); setProfileInfoError(null); setProfileInfoSuccess(null); }}
              placeholder={t.settingsStageNamePlaceholder}
              maxLength={100}
              className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          </div>
          <div>
            <label htmlFor="settings-country" className="block text-xs font-medium text-white/70 mb-1">
              {t.settingsCountryLabel}
            </label>
            <input
              id="settings-country"
              type="text"
              value={locationCountry}
              onChange={(e) => { setLocationCountry(e.target.value); setProfileInfoError(null); setProfileInfoSuccess(null); }}
              placeholder={t.settingsCountryPlaceholder}
              maxLength={100}
              className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          </div>
        </div>
        {profileInfoSuccess && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(94,209,196,0.1)", color: "#5ED1C4" }}>
            {profileInfoSuccess}
          </div>
        )}
        {profileInfoError && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
            {profileInfoError}
          </div>
        )}
        <button
          onClick={handleSaveProfileInfo}
          disabled={profileInfoSaving || !stageName.trim()}
          className="mt-4 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}
        >
          {profileInfoSaving ? t.settingsSavingLabel : t.settingsSaveProfileBtn}
        </button>
      </div>

      {/* ─── MEMBRESÍAS ────────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest px-1 pt-2" style={{ color: "rgba(255,255,255,0.3)" }}>{t.settingsSectionMemberships}</p>

      {/* Membership toggle */}
      <div className="glass-card-sm p-5">
        {liveEligibility && !liveEligibility.canPostExclusive ? (
          /* Ice tier — show locked state with progress indicator */
          <div>
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(212,0,122,0.12)", border: "1px solid rgba(212,0,122,0.25)" }}
              >
                <svg className="w-4 h-4" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{t.settingsAcceptNewMemberships}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {t.settingsGetFollowersToUnlock(10)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.settingsFollowersProgress}</span>
                <span className="text-[11px] font-semibold text-white">{liveEligibility.followersCount ?? 0}/10</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(((liveEligibility.followersCount ?? 0) / 10) * 100, 100)}%`,
                    background: "linear-gradient(to right, #D4007A, #E69138)",
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Crystal / Diamond tier — show toggle */
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{t.settingsAcceptNewMemberships}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {subscriptionPaused
                    ? t.settingsMembershipsPausedDesc
                    : t.settingsMembershipsActiveDesc}
                </p>
              </div>
              <button
                onClick={handleToggleSubscription}
                disabled={subToggling}
                aria-pressed={!subscriptionPaused}
                className="relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 focus:outline-none"
                style={{
                  background: subscriptionPaused
                    ? "rgba(255,255,255,0.12)"
                    : "linear-gradient(135deg, #D4007A, #E69138)",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: subscriptionPaused ? "translateX(0)" : "translateX(24px)" }}
                />
              </button>
            </div>
            {subToggleError && (
              <p className="mt-2 text-xs text-red-300">{subToggleError}</p>
            )}
          </div>
        )}
      </div>

      {/* ─── COBROS ────────────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest px-1 pt-2" style={{ color: "rgba(255,255,255,0.3)" }}>{t.settingsSectionPayouts}</p>

      {/* Payout Destinations */}
      <div className="glass-card-sm p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-white">{t.settingsPayoutDestinationsCardTitle}</p>
          <button
            onClick={() => navigate("/creators/payouts")}
            className="text-[11px] font-semibold flex-shrink-0"
            style={{ color: "#5ED1C4" }}
          >
            {t.settingsRequestPayoutLink}
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {t.settingsPayoutDestinationsDesc}
        </p>

        {walletLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-white mb-1">📱 Meru</label>
              <input
                type="text"
                value={meruAccount}
                onChange={(e) => { setMeruAccount(e.target.value); setWalletError(null); setWalletSuccess(null); }}
                placeholder={t.settingsMeruPlaceholder}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-white mb-1">₿ Bitcoin</label>
              <input
                type="text"
                value={btcAddress}
                onChange={(e) => { setBtcAddress(e.target.value); setWalletError(null); setWalletSuccess(null); }}
                placeholder="bc1q... or 1.../3..."
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg text-sm font-mono text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-white mb-1">🥷 Dash</label>
              <input
                type="text"
                value={dashAddress}
                onChange={(e) => { setDashAddress(e.target.value); setWalletError(null); setWalletSuccess(null); }}
                placeholder="X... (34 chars, mainnet)"
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg text-sm font-mono text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
              />
            </div>

            {/* USDT — TRON */}
            <div>
              <label className="block text-xs font-semibold text-white mb-1">💵 USDT — TRON (TRC-20)</label>
              <input
                type="text"
                value={usdtTronAddress}
                onChange={(e) => { setUsdtTronAddress(e.target.value); setWalletError(null); setWalletSuccess(null); }}
                placeholder="T... (34 chars)"
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg text-sm font-mono text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
              />
            </div>

            {/* USDT — Base */}
            <div>
              <label className="block text-xs font-semibold text-white mb-1">💵 USDT — Base (EVM)</label>
              <input
                type="text"
                value={usdtBaseAddress}
                onChange={(e) => { setUsdtBaseAddress(e.target.value); setWalletError(null); setWalletSuccess(null); }}
                placeholder="0x... (42 chars)"
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3 py-2 rounded-lg text-sm font-mono text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Bre-B (Colombia) — Banrep interoperable instant-payment key */}
            <div>
              <label className="block text-xs font-semibold text-white mb-1">
                🇨🇴 {t.settingsBreBKeyLabel} <span className="font-normal text-white/50">{t.settingsBreBKeyRegion}</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={breBKeyType}
                  onChange={(e) => { setBreBKeyType(e.target.value as "phone" | "cedula" | "email"); setWalletError(null); setWalletSuccess(null); }}
                  className="px-2 py-2 rounded-lg text-xs text-white bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
                >
                  <option value="phone">{t.settingsBreBKeyPhone}</option>
                  <option value="cedula">{t.settingsBreBKeyCedula}</option>
                  <option value="email">{t.settingsBreBKeyEmail}</option>
                </select>
                <input
                  type="text"
                  value={breBKey}
                  onChange={(e) => { setBreBKey(e.target.value); setWalletError(null); setWalletSuccess(null); }}
                  placeholder={breBKeyType === "phone" ? t.settingsBreBKeyPhoneEg : breBKeyType === "cedula" ? t.settingsBreBKeyCedulaEg : t.settingsBreBKeyEmailEg}
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
                />
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                {t.settingsBreBKeyHint}
              </p>
            </div>
          </div>
        )}

        {walletSuccess && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(94,209,196,0.1)", color: "#5ED1C4" }}>
            {walletSuccess}
          </div>
        )}
        {walletError && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
            {walletError}
          </div>
        )}

        <button
          onClick={handleSaveWallet}
          disabled={walletSaving || walletLoading}
          className="mt-4 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}
        >
          {walletSaving ? t.settingsSavingLabel : t.settingsSaveDestinationsBtn}
        </button>
      </div>

      {/* Monthly subscription price editor (replaces the deprecated
          Ice/Crystal/Diamond tier switcher, 2026-07-24). */}
      {dashboard.creatorType !== "full_time" && (
        <div className="glass-card-sm p-5">
          <p className="text-sm font-semibold text-white mb-1">{t.settingsPriceCardTitle}</p>
          <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.settingsPriceCardDesc(PRICE_MIN, PRICE_MAX)}
          </p>
          <div className="flex items-stretch gap-2">
            <div className="flex items-center rounded-lg px-3 flex-1 gap-2 border" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}>
              <span className="text-sm font-bold text-white/70">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={PRICE_MIN}
                max={PRICE_MAX}
                step="0.01"
                value={priceInput}
                onChange={(e) => { setPriceInput(e.target.value); setPriceError(null); setPriceSuccess(null); }}
                disabled={priceSaving}
                className="flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder-white/30 disabled:opacity-50"
                placeholder="10.00"
              />
              <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>USD / mo</span>
            </div>
            <button
              onClick={handleSavePrice}
              disabled={priceSaving}
              className="px-5 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {priceSaving ? t.settingsSavingShortLabel : t.settingsSavePriceBtn}
            </button>
          </div>
          {priceSuccess && (
            <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(52,199,89,0.14)", color: "#34C759" }}>
              {priceSuccess}
            </div>
          )}
          {priceError && (
            <div className="mt-3 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
              {priceError}
            </div>
          )}
        </div>
      )}

      {/* ─── MI SHOW (performer/both only) ───────────────────────────────────── */}
      {(creatorRole === "performer" || creatorRole === "both") && (
        <p className="text-[10px] font-bold uppercase tracking-widest px-1 pt-2" style={{ color: "rgba(255,255,255,0.3)" }}>{t.settingsSectionMyShow}</p>
      )}

      {/* Stream Rules — performer/both only */}
      {(creatorRole === "performer" || creatorRole === "both") && (
      <div className="glass-card-sm p-5">
        <p className="text-sm font-semibold text-white mb-1">{t.settingsStreamRulesCardTitle}</p>
        <p className="text-xs mb-3" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {t.settingsStreamRulesCardDesc}
        </p>
        <div className="relative">
          <textarea
            value={streamRules}
            onChange={(e) => {
              setStreamRules(e.target.value);
              setStreamRulesError(null);
              setStreamRulesSuccess(null);
            }}
            placeholder={"e.g. No screenshots. Respect my boundaries. Tip before making requests."}
            rows={6}
            maxLength={STREAM_RULES_MAX}
            className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30 transition-colors resize-none leading-relaxed"
          />
          <span
            className="absolute bottom-2 right-3 text-xs select-none"
            style={{ color: streamRules.length > STREAM_RULES_MAX * 0.9 ? "#E69138" : "#8E8E93" }}
          >
            {streamRules.length} / {STREAM_RULES_MAX}
          </span>
        </div>

        {streamRulesSuccess && (
          <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(94,209,196,0.1)", color: "#5ED1C4" }}>
            {streamRulesSuccess}
          </div>
        )}
        {streamRulesError && (
          <div className="mt-2 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
            {streamRulesError}
          </div>
        )}

        <button
          onClick={handleSaveStreamRules}
          disabled={streamRulesSaving || streamRules.length > STREAM_RULES_MAX}
          className="mt-3 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}
        >
          {streamRulesSaving ? t.settingsSavingLabel : t.settingsSaveRulesBtn}
        </button>
      </div>
      )}

      {/* ─── MI CONTENIDO ─────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest px-1 pt-2" style={{ color: "rgba(255,255,255,0.3)" }}>{t.settingsSectionMyContent}</p>

      {/* My Replays */}
      <div className="glass-card-sm p-5">
        <p className="text-sm font-semibold text-white mb-1">{t.settingsReplaysCardTitle}</p>
        <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          Grabaciones de tus streams. Disponibles 7 días tras el stream. Los suscriptores las ven con acceso especial; siempre puedes ver y eliminar las tuyas.
        </p>

        {recordingsError && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
            {recordingsError}
          </div>
        )}

        {recordingsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />)}
          </div>
        ) : myRecordings.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.settingsRecordingsEmpty}</p>
        ) : (
          <div className="space-y-2">
            {myRecordings.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg overflow-hidden"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {/* Row: thumb + meta + actions */}
                <div className="flex items-center gap-2 p-2.5">
                  {/* Thumbnail */}
                  <div
                    className="w-14 h-9 flex-shrink-0 rounded overflow-hidden"
                    style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }}
                  >
                    {rec.thumbUrl ? (
                      <img src={rec.thumbUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-4 h-4 opacity-30" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path d="M2 6a2 2 0 012-2h6l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {rec.title || `${fmtDate(rec.startedAt)} \u2014 ${fmtDuration(rec.durationSeconds)}`}
                    </p>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                      {fmtBytes(rec.sizeBytes)}
                      {rec.endedAt && ` · Expira ${fmtDate(new Date(new Date(rec.endedAt).getTime() + 7 * 86400000).toISOString())}`}
                    </p>
                  </div>
                  {/* Edit icon */}
                  <button
                    onClick={() => editingRecId === rec.id ? cancelEditRec() : openEditRec(rec)}
                    className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                    style={{ color: editingRecId === rec.id ? "#5ED1C4" : "rgba(255,255,255,0.3)" }}
                    aria-label={t.settingsEditRecordingAria}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414V18h1.586a2 2 0 001.414-.586l6.586-6.586" />
                    </svg>
                  </button>
                  {rec.manifestUrl && (
                    <a
                      href={rec.manifestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
                      style={{ background: "rgba(94,209,196,0.1)", color: "#5ED1C4" }}
                    >
                      Preview
                    </a>
                  )}
                  <button
                    onClick={() => handleDeleteRecording(rec.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-red-400/60 hover:text-red-400 transition-colors"
                    aria-label={t.settingsDeleteRecordingAria}
                  >
                    &times;
                  </button>
                </div>

                {/* Inline edit form */}
                {editingRecId === rec.id && (
                  <div className="px-2.5 pb-2.5 space-y-2">
                    {editError && (
                      <p className="text-[10px] text-red-400">{editError}</p>
                    )}
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={120}
                      placeholder="Title (optional)"
                      className="w-full px-2.5 py-1.5 rounded text-xs text-white bg-black/30 border border-white/10 focus:outline-none focus:border-white/30"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      maxLength={2000}
                      placeholder="Description (optional)"
                      rows={2}
                      className="w-full px-2.5 py-1.5 rounded text-xs text-white bg-black/30 border border-white/10 focus:outline-none focus:border-white/30 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEditRec(rec.id)}
                        disabled={editSaving}
                        className="px-3 py-1 rounded text-[10px] font-semibold disabled:opacity-50 transition-colors"
                        style={{ background: "rgba(94,209,196,0.15)", color: "#5ED1C4" }}
                      >
                        {editSaving ? t.settingsSavingLabel : t.pkgSaveBtn}
                      </button>
                      <button
                        onClick={cancelEditRec}
                        className="px-3 py-1 rounded text-[10px] font-semibold transition-colors"
                        style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Album */}
      <div className="glass-card-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-white">{t.settingsMyAlbum}</p>
          <button
            onClick={() => { setShowAddForm((v) => !v); setAlbumError(null); setAlbumSuccess(null); setAddFile(null); setAddFilePreview(null); setAddCaption(""); setAddPremium(false); setUploadProgress(null); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(212,0,122,0.15)", color: "#D4007A", border: "1px solid rgba(212,0,122,0.3)" }}
          >
            {showAddForm ? t.settingsCancelBtn : t.settingsAddBtn}
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          Fotos y videos en tu tarjeta de creador y galería de perfil. Los items premium aparecen difuminados para no-suscriptores.
        </p>

        {/* Add form */}
        {showAddForm && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* Type toggle */}
            <div className="flex gap-2 mb-3">
              {(["photo", "video"] as const).map((typ) => (
                <button key={typ} onClick={() => { setAddType(typ); setAddFile(null); setAddFilePreview(null); if (mediaFileInputRef.current) mediaFileInputRef.current.value = ""; }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: addType === typ ? "linear-gradient(135deg,#D4007A,#E69138)" : "rgba(255,255,255,0.05)",
                    color: addType === typ ? "#fff" : "#8E8E93",
                    border: addType === typ ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
                  }}>
                  {typ === "photo" ? t.settingsPhotoLabel : t.settingsVideoLabel}
                </button>
              ))}
            </div>

            {/* File picker */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => mediaFileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && mediaFileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg cursor-pointer transition-colors mb-3"
              style={{ border: "1.5px dashed rgba(255,255,255,0.12)", background: addFile ? "rgba(94,209,196,0.05)" : "rgba(255,255,255,0.02)" }}>
              {addFilePreview && addType === "photo" ? (
                <img src={addFilePreview} alt={t.settingsPreviewAlt} className="w-24 h-24 object-cover rounded-lg mb-1" />
              ) : addFile ? (
                <div className="flex flex-col items-center gap-1">
                  <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-teal-400">{addFile.name}</span>
                  <span className="text-[10px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{(addFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              ) : (
                <>
                  <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {addType === "photo" ? t.settingsPickPhotoLabel : t.settingsPickVideoLabel}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {addType === "photo" ? "JPG · PNG · WebP · máx 10 MB" : "MP4 · MOV · WebM · máx 500 MB"}
                  </span>
                </>
              )}
            </div>
            <input
              ref={mediaFileInputRef}
              type="file"
              accept={addType === "photo" ? "image/jpeg,image/png,image/webp,image/heic,image/heif" : "video/mp4,video/quicktime,video/webm"}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setAddFile(f);
                if (addType === "photo") setAddFilePreview(URL.createObjectURL(f));
                else setAddFilePreview(null);
                if (addType === "video") {
                  const resume = getVideoUploadResume(f);
                  setVideoResume(resume);
                } else {
                  setVideoResume(null);
                }
                // Reset input value so same file can be re-selected after cancel
                e.target.value = "";
              }}
            />

            {/* Caption */}
            <input type="text" value={addCaption} onChange={(e) => setAddCaption(e.target.value)}
              placeholder="Caption (optional)" maxLength={160}
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30 mb-3" />

            {/* Premium toggle */}
            <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
              <input type="checkbox" checked={addPremium} onChange={(e) => setAddPremium(e.target.checked)} className="w-4 h-4 rounded accent-pink-600" />
              <span className="text-xs text-white/80">Premium (solo suscriptores)</span>
            </label>

            {addType === "video" && uploadProgress && (
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  <span>Subiendo… {uploadProgress.pct}%</span>
                  <span>{uploadProgress.doneChunks} / {uploadProgress.totalChunks} partes</span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.pct}%`, background: "linear-gradient(90deg,#D4007A,#E69138)" }}
                  />
                </div>
              </div>
            )}
            {addType === "video" && !uploadProgress && videoResume && (
              <p className="text-xs px-3 py-2 rounded-lg mb-3" style={{ background: "rgba(212,0,122,0.08)", color: "#D4007A" }}>
                Subida anterior puede retomarse — selecciona el mismo archivo y toca Subir.
              </p>
            )}
            <button onClick={handleAddMedia} disabled={addSaving || !addFile || uploadProgress !== null}
              className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#D4007A,#E69138)", color: "#fff" }}>
              {addSaving ? (addType === "video" ? t.settingsUploadingVideoLabel : t.settingsUploadingLabel) : t.settingsUploadBtn}
            </button>
          </div>
        )}

        {albumSuccess && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(94,209,196,0.1)", color: "#5ED1C4" }}>
            {albumSuccess}
          </div>
        )}
        {albumError && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
            {albumError}
          </div>
        )}

        {albumLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />)}
          </div>
        ) : albumItems.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.settingsAlbumEmpty}</p>
        ) : (
          <div className="space-y-2">
            {albumItems.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2.5 rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                  {(item.thumbUrl || item.url) ? (
                    item.type === "video" ? (
                      <video src={(item.thumbUrl || item.url) as string} className="w-full h-full object-cover" muted playsInline preload="none" />
                    ) : (
                      <img src={(item.thumbUrl || item.url) as string} alt="" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">?</div>
                  )}
                </div>
                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {item.type === "video" ? t.settingsVideoLabel : t.settingsPhotoLabel}
                    {item.caption ? ` — ${item.caption}` : ""}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: item.isPremium ? "#E69138" : "#8E8E93" }}>
                    {item.isPremium ? t.settingsPremiumLabel : t.settingsFreeLabel}
                  </p>
                </div>
                {/* Controls */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleMoveItem(idx, -1)}
                    disabled={idx === 0}
                    className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white/70 disabled:opacity-20 transition-colors"
                    aria-label={t.settingsMoveUpAria}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMoveItem(idx, 1)}
                    disabled={idx === albumItems.length - 1}
                    className="w-6 h-6 rounded flex items-center justify-center text-white/40 hover:text-white/70 disabled:opacity-20 transition-colors"
                    aria-label={t.settingsMoveDownAria}
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => handleTogglePremium(item)}
                    className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
                    style={
                      item.isPremium
                        ? { background: "rgba(230,145,56,0.15)", color: "#E69138" }
                        : { background: "rgba(255,255,255,0.06)", color: "var(--pnp-text-secondary, #8E8E93)" }
                    }
                  >
                    {item.isPremium ? t.settingsUnlockBtn : t.settingsLockBtn}
                  </button>
                  <button
                    onClick={() => handleDeleteMedia(item.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-red-400/60 hover:text-red-400 transition-colors"
                    aria-label={t.settingsDeleteAria}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── About me ───────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6"
        style={{
          background: "var(--pnp-surface, #1e1e1e)",
          border: "1px solid var(--pnp-border, #2a2a2a)",
        }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">{t.settingsAboutMeTitle}</h2>
          <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {manualMarkdown.length} / {MANUAL_MAX}
          </span>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {t.settingsAboutMeDesc}
        </p>

        <textarea
          value={manualMarkdown}
          onChange={(e) => setManualMarkdown(e.target.value.slice(0, MANUAL_MAX))}
          disabled={manualLoading || manualAiLoading}
          rows={14}
          placeholder={manualLoading ? t.settingsAboutMePlaceholderLoading : t.settingsAboutMePlaceholder}
          className="w-full rounded-lg p-3 text-sm font-mono text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
          style={{
            background: "var(--pnp-bg, #121212)",
            border: "1px solid var(--pnp-border, #2a2a2a)",
            resize: "vertical",
          }}
        />

        {manualError && (
          <p className="mt-3 text-sm" style={{ color: "#FF453A" }}>{manualError}</p>
        )}
        {manualSuccess && (
          <p className="mt-3 text-sm" style={{ color: "#34C759" }}>{manualSuccess}</p>
        )}

        <div className="flex flex-wrap gap-3 mt-4">
          <button
            type="button"
            onClick={handleGenerateManualAI}
            disabled={manualAiLoading || manualSaving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #D4007A, #E69138)",
            }}
          >
            {manualAiLoading ? t.settingsAboutMeAILoading : t.settingsAboutMeAIBtn}
          </button>
          <button
            type="button"
            onClick={handleSaveManual}
            disabled={manualSaving || manualAiLoading || manualLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--pnp-accent, #D4007A)" }}
          >
            {manualSaving ? t.settingsSavingShortLabel : t.settingsSaveAboutBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
