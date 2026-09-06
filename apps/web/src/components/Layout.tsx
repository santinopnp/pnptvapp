import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";

// ── Feature flag — set to false to re-enable live streaming ──────────────────
const STREAMS_DEPRECATED = false;
import { createPortal } from "react-dom";
import { Outlet, NavLink, useNavigate, useLocation, useMatch, Navigate, Link } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { AnnouncementStrip } from "./AnnouncementStrip";
import { VerificationGate } from "./VerificationGate";
import { useAuth } from "@/hooks/useAuth";
import { useTelegram } from "@/hooks/useTelegram";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useOrientation } from "@/hooks/useOrientation";
const CristinaWidget = lazy(() => import("@/components/CristinaWidget").then((m) => ({ default: m.CristinaWidget })));

import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatar } from "@/components/UserAvatar";
import { AdSlot } from "@/components/AdSlot";
import { FeaturedModelInterstitial, PnpFamWelcomeGate } from "@/components/badges/PnpFamWelcomeGate";
import { Toast } from "@/components/Toast";
import { useNearbyToggle } from "@/components/NearbyBadge";
import { getMessageThreads, getHangoutGroups, markThreadAsRead, getProfile, getForYouRecommendations, followUser, getCryptoGuideStatus, getPublicCreatorProfile, toggleSuperGod, type MessageThread, type HangoutGroup, type ForYouRecommendations, type ForYouSuggestedCreator, type ForYouSuggestedFollow, type ForYouContextHint, type CryptoGuideStatus, type CreatorPublicProfile } from "@/lib/api";
import { useTier } from "@/hooks/useTier";
import { useI18n } from "@/lib/i18n";
import { connectSocket } from "@/lib/socket";
import { MediaMessage } from "@/components/hangouts/MediaMessage";
import { TIP_PRESETS_USD, TIP_PRESETS_RUSH, WalletTypeIcon, getPreferredWallet } from "@/components/payments/PayInWalletChips";

// Duplicated string (not imported) to keep the FAB in the main bundle without
// pulling in the lazy PayInWalletChips chunk. Keep in sync with the export in
// PayInWalletChips.tsx — the dispatcher and listener must agree on the name.
const PREFERRED_WALLET_EVENT = "pnptv:preferred-wallet-changed";
// Dispatched by desktop-sidebar + mobile-drawer "Wallet" nav items so any
// surface can pop the WalletHomeSheet without changing routes. WalletFloater
// listens and calls setOpen(true).
const OPEN_WALLET_EVENT = "pnptv:open-wallet";
import { useWallets } from "@privy-io/react-auth";
import { SelfCamFloater } from "@/components/mainstage/SelfCamFloater";
import { ThreadListView, DmChatView } from "@/pages/DirectMessages";

const SIDEBAR_DM_BASE = import.meta.env.VITE_API_URL || "";

// ── FlashBanner ───────────────────────────────────────────────────────────────
// Reads a one-shot message stashed by another route (e.g. HangoutInviteRedirect
// when the invite is invalid) from sessionStorage["pnptv:flash"] and shows it
// for 5s. Self-contained so any future redirect can drop a flash message
// without touching the toast/notifications system.

type FlashPayload = { type?: "error" | "success" | "info"; message: string };

function FlashBanner() {
  const [flash, setFlash] = useState<FlashPayload | null>(null);

  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("pnptv:flash"); } catch {}
    if (!raw) return;
    try { sessionStorage.removeItem("pnptv:flash"); } catch {}
    let parsed: FlashPayload | null = null;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.message === "string") parsed = obj;
    } catch {
      // Allow plain string payloads too — be lenient about producers.
      parsed = { message: raw };
    }
    if (!parsed) return;
    setFlash(parsed);
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!flash) return null;

  const accent =
    flash.type === "success" ? "border-green-500/50 bg-green-500/15 text-green-200"
    : flash.type === "info"  ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
    : "border-red-500/50 bg-red-500/15 text-red-200";

  return (
    <div
      role="alert"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] max-w-sm px-4 py-2.5 rounded-2xl border backdrop-blur-md text-sm shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-200 ${accent}`}
    >
      <span className="flex-1">{flash.message}</span>
      <button
        type="button"
        onClick={() => setFlash(null)}
        className="text-white/70 hover:text-white"
        aria-label="Dismiss message"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── HamburgerIcon / CloseIcon ─────────────────────────────────────────────────

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="3" y="3" width="7" height="18" rx="1.5" />
      <path strokeLinecap="round" d="M14 6h7M14 10h7M14 14h5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Conversation Hub helpers ──────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

interface ConversationItem {
  type: "dm" | "hangout";
  id: string;
  name: string;
  photoUrl: string | null;
  lastMessage: string | null;
  lastActivity: string;
  unreadCount: number;
  memberCount?: number;
  hasActiveCall?: boolean;
  path: string;
}

interface MobileConversationListProps {
  filter: "all" | "dms" | "hangouts";
  threads: MessageThread[];
  hangoutGroups: HangoutGroup[];
  hangoutGroupsLoading: boolean;
  onNavigate: (path: string, type: "dm" | "hangout") => void;
  noConversationsLabel: string;
}

function MobileConversationList({
  filter,
  threads,
  hangoutGroups,
  hangoutGroupsLoading,
  onNavigate,
  noConversationsLabel,
}: MobileConversationListProps) {
  const dmItems: ConversationItem[] = threads.map((th) => ({
    type: "dm",
    id: th.userId ?? th.partnerId,
    name: (th.firstName ?? th.partnerFirstName) || (th.username ?? th.partnerUsername),
    photoUrl: th.photoUrl ?? th.partnerPhoto,
    lastMessage: th.lastMessage,
    lastActivity: th.lastMessageAt,
    unreadCount: th.unreadCount ?? th.unread,
    path: `/dm/${th.userId ?? th.partnerId}`,
  }));

  const hangoutItems: ConversationItem[] = hangoutGroups.map((g) => ({
    type: "hangout",
    id: String(g.id),
    name: g.name,
    photoUrl: g.avatarUrl,
    lastMessage: g.lastMessage,
    lastActivity: g.createdAt,
    unreadCount: g.unreadCount ?? 0,
    memberCount: g.memberCount,
    hasActiveCall: g.hasActiveCall,
    path: `/chat/${g.id}`,
  }));

  let items: ConversationItem[] = [];
  if (filter === "dms") {
    items = dmItems;
  } else if (filter === "hangouts") {
    items = hangoutItems;
  } else {
    // Merge and sort by most recent activity
    items = [...dmItems, ...hangoutItems].sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }

  const isLoading = filter !== "dms" && hangoutGroupsLoading && hangoutItems.length === 0;

  if (isLoading) {
    return (
      <div className="space-y-2 pb-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-1 py-2 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/10 rounded w-28" />
              <div className="h-2.5 bg-white/10 rounded w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-pnp-textSecondary/50 text-center py-4 px-2">
        {noConversationsLabel}
      </p>
    );
  }

  return (
    <div className="space-y-0.5 flex-1 overflow-y-auto pb-1">
      {items.map((item) => (
        <button
          key={`${item.type}-${item.id}`}
          onClick={() => onNavigate(item.path, item.type)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-pnp-surface transition-colors text-left"
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {item.photoUrl &&
            (item.photoUrl.startsWith("/") || item.photoUrl.startsWith("http")) ? (
              <img
                src={item.photoUrl}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty("display");
                }}
              />
            ) : null}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{
                background: item.type === "hangout" ? "rgba(212,0,122,0.15)" : "rgba(212,0,122,0.2)",
                color: "#D4007A",
                display:
                  item.photoUrl &&
                  (item.photoUrl.startsWith("/") || item.photoUrl.startsWith("http"))
                    ? "none"
                    : undefined,
              }}
            >
              {item.type === "hangout" ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              ) : (
                (item.name || "?")[0].toUpperCase()
              )}
            </div>
            {/* Active call indicator */}
            {item.hasActiveCall && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-pnp-background bg-green-500" />
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-sm truncate ${
                  item.unreadCount > 0 ? "font-semibold text-pnp-textPrimary" : "font-medium text-pnp-textSecondary"
                }`}
              >
                {item.name}
              </span>
              <span className="text-[10px] text-pnp-textSecondary/50 flex-shrink-0">
                {timeAgo(item.lastActivity)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <span className="text-xs text-pnp-textSecondary/60 truncate">
                {item.lastMessage
                  ? item.lastMessage
                  : item.memberCount !== undefined
                    ? `${item.memberCount} members`
                    : ""}
              </span>
              {item.unreadCount > 0 && (
                <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1" style={{ background: "#D4007A" }}>
                  {item.unreadCount > 9 ? "9+" : item.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── SidebarDmChat ─────────────────────────────────────────────────────────────

interface SidebarDmMessage {
  id: number;
  sender_id: string;
  recipient_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  media_mime?: string | null;
  media_thumb_url?: string | null;
  is_read: boolean;
  created_at: string;
}

interface SidebarDmChatProps {
  userId: string;
  myDbId: string;
  onBack: () => void;
}

function SidebarDmChat({ userId, myDbId, onBack }: SidebarDmChatProps) {
  const [messages, setMessages] = useState<SidebarDmMessage[]>([]);
  const dmNavigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [partnerPhoto, setPartnerPhoto] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const lastTypingEmit = useRef(0);
  const hasFetched = useRef<string | null>(null);

  useEffect(() => {
    if (hasFetched.current === userId) return;
    hasFetched.current = userId;

    // Fetch partner info
    fetch(`${SIDEBAR_DM_BASE}/api/webapp/dm/user/${userId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.success && data.user) {
          setPartnerName(data.user.first_name || data.user.username || "");
          setPartnerPhoto(data.user.photo_file_id || null);
        }
      })
      .catch(() => {});

    // Fetch messages
    fetch(`${SIDEBAR_DM_BASE}/api/webapp/dm/conversation/${userId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        if (data.success) {
          setMessages(data.messages || []);
          setHasMore((data.messages || []).length >= 30);
        }
      })
      .catch(() => {
        setChatError("Failed to load messages");
      })
      .finally(() => {
        setIsLoading(false);
      });

    markThreadAsRead(userId).catch(() => {});
  }, [userId]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 50);
    }
  }, [isLoading]);

  // Socket: real-time incoming messages
  useEffect(() => {
    const socket = connectSocket();

    const onDmMessage = (msg: SidebarDmMessage) => {
      if (String(msg.sender_id) !== String(userId)) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      markThreadAsRead(userId).catch(() => {});
    };

    const onDmSent = (data: { success: boolean; message?: SidebarDmMessage }) => {
      if (!data.message) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message!.id)) return prev;
        return [...prev, data.message!];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    const onDmTyping = (data: { from: string }) => {
      if (String(data.from) !== String(userId)) return;
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 3000);
    };

    socket.on("dm:message", onDmMessage);
    socket.on("dm:sent", onDmSent);
    socket.on("dm:typing", onDmTyping);

    return () => {
      socket.off("dm:message", onDmMessage);
      socket.off("dm:sent", onDmSent);
      socket.off("dm:typing", onDmTyping);
    };
  }, [userId]);

  const emitTyping = () => {
    const now = Date.now();
    if (now - lastTypingEmit.current < 2000) return;
    lastTypingEmit.current = now;
    const socket = connectSocket();
    socket.emit("dm:typing", { recipientId: userId });
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() && !mediaFile) return;
    if (sendingMessage) return;
    setSendingMessage(true);
    setChatError(null);
    try {
      if (mediaFile) {
        const formData = new FormData();
        formData.append("media", mediaFile);
        if (messageInput.trim()) formData.append("content", messageInput.trim());
        const res = await fetch(`${SIDEBAR_DM_BASE}/api/webapp/dm/media/${userId}`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Failed to send media");
        }
        const data = await res.json();
        if (data.message) {
          setMessages((prev) => prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]);
        }
        setMediaFile(null);
        if (mediaPreview) { URL.revokeObjectURL(mediaPreview); setMediaPreview(null); }
        setMessageInput("");
      } else {
        const res = await fetch(`${SIDEBAR_DM_BASE}/api/webapp/dm/send/${userId}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageInput.trim() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Failed to send");
        }
        const data = await res.json();
        if (data.message) {
          setMessages((prev) => prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]);
        }
        setMessageInput("");
      }
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    if (file.type.startsWith("image/")) {
      setMediaPreview(URL.createObjectURL(file));
    } else {
      setMediaPreview(null);
    }
    e.target.value = "";
  };

  const cancelMedia = () => {
    setMediaFile(null);
    if (mediaPreview) { URL.revokeObjectURL(mediaPreview); setMediaPreview(null); }
  };

  const loadMoreMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await fetch(
        `${SIDEBAR_DM_BASE}/api/webapp/dm/conversation/${userId}?cursor=${encodeURIComponent(oldest.created_at)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...(data.messages || []), ...prev]);
        setHasMore((data.messages || []).length >= 30);
      }
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-pnp-border flex-shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 active:scale-95 transition-all flex-shrink-0"
          aria-label="Back to conversations"
        >
          <svg className="w-4 h-4 text-pnp-textPrimary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Partner avatar — clickable to profile */}
        <button onClick={() => dmNavigate(`/profile/${userId}`)} className="relative flex-shrink-0 cursor-pointer">
          {partnerPhoto && (partnerPhoto.startsWith("/") || partnerPhoto.startsWith("http")) ? (
            <img src={partnerPhoto} alt="" className="w-8 h-8 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty("display"); }} />
          ) : null}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
              background: "rgba(212,0,122,0.2)",
              color: "#D4007A",
              display: partnerPhoto && (partnerPhoto.startsWith("/") || partnerPhoto.startsWith("http")) ? "none" : undefined,
            }}
          >
            {(partnerName || "?")[0].toUpperCase()}
          </div>
        </button>

        <span onClick={() => dmNavigate(`/profile/${userId}`)} className="text-sm font-semibold text-pnp-textPrimary truncate flex-1 min-w-0 cursor-pointer hover:underline">
          {partnerName || "Conversation"}
        </span>
      </div>

      {/* Error banner */}
      {chatError && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 flex-shrink-0">
          <p className="text-xs text-red-400">{chatError}</p>
        </div>
      )}

      {/* Messages area */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop < 60 && hasMore && !loadingMore) loadMoreMessages();
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-white/20 border-t-pnp-accent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-4">
              <p className="text-lg mb-1">💬</p>
              <p className="text-xs text-pnp-textSecondary">Start a conversation!</p>
            </div>
          </div>
        ) : (
          <>
            {loadingMore && (
              <div className="flex justify-center py-1">
                <svg className="w-4 h-4 text-pnp-accent animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = String(msg.sender_id) === String(myDbId);
              const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={msg.id} className={`flex gap-1.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`max-w-[85%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-2.5 py-1.5 text-xs break-words ${isMe ? "text-white rounded-br-md" : "bg-white/10 text-white rounded-bl-md"}`}
                      style={isMe ? { background: "linear-gradient(135deg, #D4007A, #E69138)" } : undefined}
                    >
                      {msg.media_url && msg.media_type && (
                        <div className="mb-1">
                          <MediaMessage
                            mediaUrl={msg.media_url}
                            mediaType={msg.media_type}
                            thumbUrl={msg.media_thumb_url}
                            onExpandImage={(url) => setLightboxUrl(url)}
                            isMe={isMe}
                          />
                        </div>
                      )}
                      {msg.content && <p>{msg.content}</p>}
                      <p className={`text-[9px] mt-0.5 ${isMe ? "text-white/60" : "text-pnp-textSecondary"}`}>{timeStr}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator */}
      {isTyping && (
        <div className="px-3 py-1 flex-shrink-0">
          <p className="text-[10px] text-pnp-textSecondary italic">{partnerName || "User"} is typing...</p>
        </div>
      )}

      {/* Media preview */}
      {mediaFile && (
        <div className="px-2 py-1.5 border-t border-pnp-border flex items-center gap-2 flex-shrink-0">
          {mediaPreview ? (
            <img src={mediaPreview} alt="" className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-pnp-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          )}
          <span className="text-[10px] text-pnp-textSecondary flex-1 truncate">{mediaFile.name}</span>
          <button onClick={cancelMedia} className="text-red-400 text-[10px] font-semibold">Remove</button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-1.5 px-2 py-2 border-t border-pnp-border flex-shrink-0" style={{ background: "var(--pnp-surface, #1C1C1E)" }}>
        <input id="pnp-layout-1"
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={handleMediaSelect}
        />
        <button
          type="button"
          onClick={() => mediaInputRef.current?.click()}
          className="p-1.5 rounded-full text-pnp-textSecondary hover:text-white hover:bg-white/10 active:scale-90 transition-all flex-shrink-0"
          aria-label="Attach media"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
        </button>

        <textarea id="pnp-layout-2"
          value={messageInput}
          onChange={(e) => { setMessageInput(e.target.value); emitTyping(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
          }}
          placeholder="Type a message..."
          className="flex-1 bg-white/5 text-white placeholder-pnp-textSecondary rounded-2xl px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-pnp-accent/50 max-h-20"
          rows={1}
          style={{ minHeight: "36px", fontSize: "16px" }}
        />

        <button
          type="button"
          onClick={handleSendMessage}
          disabled={sendingMessage || (!messageInput.trim() && !mediaFile)}
          className="p-1.5 rounded-full text-white active:scale-90 transition-all flex-shrink-0 disabled:opacity-30"
          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
          aria-label="Send message"
        >
          {sendingMessage ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function Layout() {
  const { isAuthenticated, isAdmin, isSuperGod, isSuperGodEligible, user, isLoading, logout, refreshUser } = useAuth();
  const [godToggling, setGodToggling] = useState(false);
  const handleToggleGod = useCallback(async () => {
    if (godToggling) return;
    setGodToggling(true);
    try {
      await toggleSuperGod(!isSuperGod);
      await refreshUser();
    } catch (err) {
      console.error("[GOD MODE] toggle failed:", err);
    } finally {
      setGodToggling(false);
    }
  }, [godToggling, isSuperGod, refreshUser]);
  const { tier, isPrime, isMember } = useTier();
  const { isTelegram } = useTelegram();
  useViewportHeight();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useI18n();
  // Latches to true on first render at /main-stage with a valid guest session
  // in sessionStorage. Stays true for the life of the Layout instance so
  // subsequent re-renders don't bounce the guest to /login after MainStage
  // consumes (deletes) the sessionStorage key.
  const mainStageGuestLatchRef = useRef<boolean>(false);
  const [cruiseMode, setCruiseMode] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [hangoutGroups, setHangoutGroups] = useState<HangoutGroup[]>([]);
  const [conversationFilter, setConversationFilter] = useState<"all" | "dms" | "hangouts">("all");
  const [hangoutGroupsLoading, setHangoutGroupsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inlineDmUserId, setInlineDmUserId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ users: any[]; creators: any[]; channels: any[]; hangouts: any[]; posts: any[] } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [searchTab, setSearchTab] = useState<"all"|"members"|"creators"|"channels"|"hangouts"|"posts">("all");
  const [searchFullResults, setSearchFullResults] = useState<{ users: any[]; creators: any[]; channels: any[]; hangouts: any[]; posts: any[] } | null>(null);
  const [searchFullLoading, setSearchFullLoading] = useState(false);
  const [isDmPanelOpen, setIsDmPanelOpen] = useState(false);
  const [dmPartnerId, setDmPartnerId] = useState<string | null>(null);
  const [dmPanelPos, setDmPanelPos] = useState({ top: 0, left: 0 });
  const dmButtonRef = useRef<HTMLButtonElement>(null);
  const dmPanelRef = useRef<HTMLDivElement>(null);
  const [searchPanelPos, setSearchPanelPos] = useState({ top: 0, left: 0 });
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const { enabled: nearbyEnabled, toggle: toggleNearby } = useNearbyToggle();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const isLandscape = useOrientation();
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 1024 : false);
  const [showAgeGate, setShowAgeGate] = useState(() => {
    try { return !localStorage.getItem("pnptv:age_confirmed"); } catch { return false; }
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setCruiseMode((e as CustomEvent).detail as boolean);
    window.addEventListener("pnp-cruise-mode", handler);
    return () => window.removeEventListener("pnp-cruise-mode", handler);
  }, []);

  const ADULT_ROUTES = ["/live", "/models", "/stream", "/creators"];
  useEffect(() => {
    const isAdultRoute = ADULT_ROUTES.some((r) => location.pathname.startsWith(r));
    if (isAdultRoute && !localStorage.getItem("pnptv:age_confirmed")) {
      setShowAgeGate(true);
    }
  }, [location.pathname]);

  const sidebarSections = [
    {
      label: "DISCOVER",
      items: [
        {
          to: "/",
          label: t.nav.feed || "Home Feed",
          end: true,
          checkActive: (p: string, s: string) => p === "/" && !s.includes("view=hangouts"),
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
        },
        ...(!STREAMS_DEPRECATED ? [{
          to: "/live",
          label: "Live",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>,
        }] : []),
        {
          to: "/nearby?mode=calls",
          label: "Performers",
          checkActive: (p: string, s: string) => p === "/nearby" && s.includes("mode=calls"),
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
        },
        {
          to: "/channels",
          label: t.nav.channels || "Channels",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m-4.875-3h16.5a1.125 1.125 0 000-2.25H3.375a1.125 1.125 0 000 2.25zm0-12.75h16.5a1.125 1.125 0 000-2.25H3.375a1.125 1.125 0 000 2.25zm0 6h16.5a1.125 1.125 0 000-2.25H3.375a1.125 1.125 0 000 2.25z" /></svg>,
        },
        {
          to: "/nearby",
          label: t.nav.nearby || "Nearby",
          checkActive: (p: string, s: string) => p === "/nearby" && !s.includes("mode=calls"),
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
        },
      ],
    },
    {
      label: "COMMUNITY",
      items: [
        {
          to: "/?view=hangouts",
          label: t.nav.hangouts || "Hangouts",
          checkActive: (p: string, s: string) => p === "/" && s.includes("view=hangouts"),
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
        },
        {
          to: "/dm",
          isDm: true,
          label: t.nav.inbox || "Inbox",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>,
        },
        {
          to: "/main-stage",
          label: "Main Stage",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125C2.25 18.375 1.875 18 1.875 17.25v-1.5a.75.75 0 01.75-.75h.375M3 10.5h18M3 7.5h18M12 3v3m3-3v3m-6-3v3" /></svg>,
        },
      ],
    },
    {
      label: "YOU",
      items: [
        {
          to: "/wallet",
          isWallet: true,
          label: "Wallet",
          icon: <span className="text-base leading-none shrink-0" aria-hidden="true">💎</span>,
        },
        {
          to: "/profile",
          label: "My Profile",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
        },
        {
          to: "/my-access",
          label: t.nav.myAccess || "My Access",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>,
        },
        {
          to: "/my-subscriptions",
          label: "My Subscriptions",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" /></svg>,
        },
        {
          to: "/subscribe",
          label: "Subscribe",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>,
        },
        {
          to: "/badges",
          label: "Badges",
          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" /></svg>,
        },
      ],
    },
  ];

  const secondaryLinks = [
    {
      to: "/settings",
      label: t.nav.settings || "Settings",
      icon: <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      to: "/support",
      label: t.nav.help || "Help",
      icon: <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>,
    },
  ];

  const mobileSecondaryLinks = [
    { to: "/support", label: t.nav.help || "Help" },
    { to: "/settings", label: t.nav.settings || "Settings" },
    { to: "/about", label: "About" },
    { to: "/community-resources", label: "Community" },
  ];

  // Close mobile menu on route change and reset inline DM
  useEffect(() => {
    setMobileMenuOpen(false);
    setInlineDmUserId(null);
  }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
        setInlineDmUserId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!isDmPanelOpen) return;
    const onMouse = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!dmButtonRef.current?.contains(t) && !dmPanelRef.current?.contains(t)) setIsDmPanelOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    return () => document.removeEventListener("mousedown", onMouse);
  }, [isDmPanelOpen]);

  useEffect(() => {
    if (!isDmPanelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsDmPanelOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDmPanelOpen]);

  useEffect(() => {
    if (!isDmPanelOpen || !isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onVVChange = () => {
      const panel = dmPanelRef.current;
      if (!panel) return;
      const keyboardH = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      panel.style.bottom = `${keyboardH}px`;
      panel.style.height = `${vv.height * 0.96}px`;
    };
    vv.addEventListener("resize", onVVChange);
    vv.addEventListener("scroll", onVVChange);
    onVVChange();
    return () => {
      vv.removeEventListener("resize", onVVChange);
      vv.removeEventListener("scroll", onVVChange);
      const panel = dmPanelRef.current;
      if (panel) { panel.style.bottom = ""; panel.style.height = ""; }
    };
  }, [isDmPanelOpen, isMobile]);

  // Fetch profile data when mobile menu opens
  useEffect(() => {
    if (!mobileMenuOpen || profileData) return;
    getProfile().then((r) => { if (r.success) setProfileData(r.profile); }).catch(() => {});
  }, [mobileMenuOpen, profileData]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Fetch hangout groups on mount (for unread badge) and when mobile menu opens
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetch = () => {
      setHangoutGroupsLoading(true);
      getHangoutGroups()
        .then((res) => { if (res.success) setHangoutGroups(res.groups); })
        .catch(() => {})
        .finally(() => setHangoutGroupsLoading(false));
    };
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchThreads = () => {
      getMessageThreads()
        .then((res) => {
          if (res.success) {
            setThreads(res.threads);
            setDmUnread(res.threads.filter((th) => (th.unreadCount ?? th.unread) > 0).length);
          }
        })
        .catch(() => {});
    };
    fetchThreads();
    const interval = setInterval(fetchThreads, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Debounced live-preview search (4 results per category)
  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/webapp/search?q=${encodeURIComponent(searchQuery.trim())}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.success !== false) {
            setSearchResults({
              users: data.users || [],
              creators: data.creators || [],
              channels: data.channels || [],
              hangouts: data.hangouts || [],
              posts: data.posts || [],
            });
          }
        })
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen]);

  // Full search triggered on Enter
  const handleSearchSubmit = () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearchSubmitted(true);
    setSearchTab("all");
    setSearchFullLoading(true);
    fetch(`/api/webapp/search?q=${encodeURIComponent(q)}&full=1`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success !== false) {
          setSearchFullResults({
            users: data.users || [],
            creators: data.creators || [],
            channels: data.channels || [],
            hangouts: data.hangouts || [],
            posts: data.posts || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setSearchFullLoading(false));
  };

  const handleSearchClose = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults(null);
    setSearchSubmitted(false);
    setSearchFullResults(null);
    setSearchTab("all");
  };

  const handleLogout = () => {
    if (window.confirm("Sign out of PNPtv?")) {
      logout();
    }
  };

  // Show loading state briefly to avoid flash
  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-pnp-background">
        <div className="w-8 h-8 rounded-full border-2 border-[#D4007A] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Unauthenticated: send users to the real login screen, preserving where
  // they were trying to go so post-login return still works.
  // Exception: /main-stage with a valid guest session in sessionStorage —
  // guests redeemed an invite and already accepted terms + confirmed age on
  // the invite form, so they must not be bounced to /login. We latch the
  // decision in a ref because MainStage clears sessionStorage on mount; a
  // subsequent re-render of Layout would otherwise see an empty storage and
  // bounce the guest mid-session.
  if (!isAuthenticated) {
    if (location.pathname === "/main-stage") {
      if (!mainStageGuestLatchRef.current) {
        try {
          const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("pnptv:ms:guest") : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.token && parsed?.livekitUrl && parsed?.roomName) {
              mainStageGuestLatchRef.current = true;
            }
          }
        } catch { /* noop */ }
      }
    }
    if (!mainStageGuestLatchRef.current) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
    }
  }

  return (
    <div className="app-shell bg-pnp-background">
      {/* ── Desktop sidebar ─────────────────────────────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-72 lg:flex-col border-r border-pnp-border glass-nav">
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-pnp-border">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/logo-lockup.webp" alt="PNPtv!" className="h-9 w-auto shrink-0 object-contain" />
          </div>
          <div className="flex items-center gap-1">
            {/* Search */}
            <button
              ref={searchButtonRef}
              onClick={() => {
                if (!searchOpen && searchButtonRef.current) {
                  const r = searchButtonRef.current.getBoundingClientRect();
                  setSearchPanelPos({ top: r.bottom + 8, left: r.right + 8 });
                }
                setSearchOpen(true);
              }}
              className="p-2 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors"
              aria-label="Search"
              title="Search"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            {/* DM */}
            <button
              ref={dmButtonRef}
              onClick={() => {
                if (!isDmPanelOpen && dmButtonRef.current) {
                  const r = dmButtonRef.current.getBoundingClientRect();
                  setDmPanelPos({ top: r.bottom + 8, left: r.right + 8 });
                }
                setDmPartnerId(null);
                setIsDmPanelOpen(v => !v);
              }}
              className="relative p-2 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors"
              aria-label="Messages"
              title="Direct Messages"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {dmUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-[#D4007A] rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                  {dmUnread > 9 ? "9+" : dmUnread}
                </span>
              )}
            </button>
            <NotificationBell />
            {/* GOD MODE toggle — icon-only when OFF, animated badge when ON */}
            {isSuperGodEligible && (
              isSuperGod ? (
                <button
                  type="button"
                  onClick={handleToggleGod}
                  disabled={godToggling}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider text-white transition-opacity shadow-[0_0_8px_rgba(212,0,122,0.6)] animate-pulse ${godToggling ? "opacity-50" : "hover:opacity-100"}`}
                  style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                  title="GOD MODE ON — click to disable and behave as a normal user"
                >
                  GOD MODE
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleGod}
                  disabled={godToggling}
                  className={`p-2 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors ${godToggling ? "opacity-50" : ""}`}
                  aria-label="Enable god mode"
                  title="GOD MODE OFF — click to re-enable bypass"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              )
            )}
            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto" aria-label="Primary navigation" translate="no" lang="en">
          {sidebarSections.map((section, idx) => (
            <div key={section.label} className={idx > 0 ? "mt-5" : ""}>
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-pnp-textSecondary/40 select-none">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isItemActive = item.checkActive
                    ? item.checkActive(location.pathname, location.search)
                    : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                  const baseClasses = "flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-sm font-medium transition-colors";
                  const activeClasses = "nav-active";
                  const inactiveClasses = "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface";

                  if ((item as any).isDm) {
                    return (
                      <button
                        key={item.to}
                        onClick={() => { setDmPartnerId(null); setIsDmPanelOpen(true); }}
                        className={`${baseClasses} ${isDmPanelOpen ? activeClasses : inactiveClasses}`}
                      >
                        {item.icon}
                        <span className="flex-1 text-left">{item.label}</span>
                        {dmUnread > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4007A] text-white text-[10px] font-bold flex items-center justify-center">
                            {dmUnread > 9 ? "9+" : dmUnread}
                          </span>
                        )}
                      </button>
                    );
                  }

                  if ((item as any).isWallet) {
                    return (
                      <button
                        key={item.to}
                        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_WALLET_EVENT))}
                        className={`${baseClasses} ${inactiveClasses}`}
                      >
                        {item.icon}
                        <span className="flex-1 text-left">{item.label}</span>
                      </button>
                    );
                  }

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={(item as any).end}
                      className={() => `${baseClasses} ${isItemActive ? activeClasses : inactiveClasses}`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Divider */}
          <div className="my-4 h-px bg-pnp-border" />

          {/* Secondary links — Settings & Help */}
          <div className="space-y-0.5">
            {secondaryLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }: { isActive: boolean }) =>
                  `flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    isActive
                      ? "text-pnp-textPrimary bg-pnp-surface"
                      : "text-pnp-textSecondary/60 hover:text-pnp-textSecondary hover:bg-pnp-surface"
                  }`
                }
              >
                {link.icon}
                <span>{link.label}</span>
              </NavLink>
            ))}
          </div>

          {/* Creator Studio & Admin — only shown to eligible users */}
          {(user?.creator_status === "active" || isAdmin) && (
            <>
              <div className="mt-4 mb-1 h-px bg-pnp-border" />
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-pnp-textSecondary/40 select-none">
                STUDIO
              </div>
              <div className="space-y-0.5">
                {(user?.creator_status === "active" || isAdmin) && (
                  <NavLink
                    to="/creators"
                    className={({ isActive }: { isActive: boolean }) =>
                      `flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? "nav-active" : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                      }`
                    }
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" /></svg>
                    <span>{t.nav.creatorStudio || "Creator Studio"}</span>
                  </NavLink>
                )}
                {isAdmin && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }: { isActive: boolean }) =>
                      `flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? "nav-active" : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                      }`
                    }
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>
                    <span>{t.nav.admin || "Admin"}</span>
                  </NavLink>
                )}
              </div>
            </>
          )}
        </nav>

        {/* User profile card + language */}
        <div className="p-4 border-t border-pnp-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-3 flex-1 min-w-0 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              {user?.photoUrl && (user.photoUrl.startsWith("/") || user.photoUrl.startsWith("http")) ? (
                <img
                  src={user.photoUrl}
                  alt={user.displayName || "Profile"}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty("display"); }}
                />
              ) : null}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff", display: (user?.photoUrl && (user.photoUrl.startsWith("/") || user.photoUrl.startsWith("http"))) ? "none" : undefined }}
              >
                {(user?.displayName || t.nav.user)[0].toUpperCase()}
              </div>
              <span className="text-sm text-pnp-textSecondary truncate">
                {user?.displayName || t.nav.user}
              </span>
            </button>

          </div>
        </div>
      </aside>

      {/* ── Mobile topbar ────────────────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 h-14 flex items-center justify-between px-3 glass-nav border-b border-pnp-border">
        {/* Left: logo + optional GOD MODE badge (click to toggle) */}
        <div className="flex items-center gap-2">
          <img src="/logo-lockup.webp" alt="PNPtv!" className="h-8 w-auto max-w-[110px] object-contain" />
          {isSuperGodEligible && (
            <button
              type="button"
              onClick={handleToggleGod}
              disabled={godToggling}
              className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider text-white transition-opacity ${
                isSuperGod ? "shadow-[0_0_8px_rgba(212,0,122,0.6)] animate-pulse" : "opacity-70"
              } ${godToggling ? "opacity-50" : "hover:opacity-100"}`}
              style={{
                background: isSuperGod
                  ? "linear-gradient(135deg,#D4007A,#E69138)"
                  : "#4B5563",
              }}
              title={isSuperGod
                ? "GOD MODE ON — click to disable"
                : "GOD MODE OFF — click to re-enable"}
            >
              {isSuperGod ? "GOD MODE" : "GOD OFF"}
            </button>
          )}
        </div>

        {/* Right: Search + DM + Bell + Hamburger + Logout */}
        <div className="flex items-center gap-0.5">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
            aria-label="Search"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          {/* DM */}
          <button
            onClick={() => {
              setDmPartnerId(null);
              setIsDmPanelOpen(v => !v);
            }}
            className="relative p-2 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
            aria-label="Messages"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {dmUnread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 bg-[#D4007A] rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {dmUnread > 9 ? "9+" : dmUnread}
              </span>
            )}
          </button>
          <NotificationBell />

          {/* Avatar — opens profile/settings menu */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="relative ml-1 rounded-full transition-transform active:scale-95"
            aria-label="Open profile menu"
            aria-expanded={mobileMenuOpen}
          >
            {user?.photoUrl && (user.photoUrl.startsWith("/") || user.photoUrl.startsWith("http")) ? (
              <img
                src={user.photoUrl}
                alt={user.displayName || "Profile"}
                className="w-9 h-9 rounded-full object-cover"
                style={{ boxShadow: "0 0 0 2px #121212, 0 0 0 4px #D4007A" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty("display");
                }}
              />
            ) : null}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                background: "linear-gradient(135deg, #D4007A, #E69138)",
                color: "#fff",
                boxShadow: "0 0 0 2px #121212, 0 0 0 4px #D4007A",
                display: user?.photoUrl && (user.photoUrl.startsWith("/") || user.photoUrl.startsWith("http")) ? "none" : undefined,
              }}
            >
              {(user?.displayName || user?.username || "U").charAt(0).toUpperCase()}
            </div>
          </button>
        </div>
      </header>

      {/* ── Mobile slide-out menu ─────────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setMobileMenuOpen(false); setInlineDmUserId(null); }}
            aria-hidden="true"
          />

          {/* Panel — slides in from right */}
          <div
            ref={mobileMenuRef}
            className="relative w-[min(288px,85vw)] h-full flex flex-col glass-nav border-l border-pnp-border animate-fade-in-up"
            style={{ animationDuration: "0.18s" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 h-11 border-b border-pnp-border flex-shrink-0">
              <img src="/logo-lockup.webp" alt="PNPtv!" className="h-7 w-auto" />
              <button
                className="p-1.5 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
                onClick={() => { setMobileMenuOpen(false); setInlineDmUserId(null); }}
                aria-label="Close menu"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Profile card */}
            <div className="px-3 pt-3 pb-2 border-b border-pnp-border flex-shrink-0">
              <div className="flex items-center gap-3 mb-2">
                {user?.photoUrl && (user.photoUrl.startsWith("/") || user.photoUrl.startsWith("http")) ? (
                  <img src={user.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-[#D4007A]/30 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}>
                    {(user?.displayName || "U")[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{user?.displayName || "Member"}</p>
                  {user?.username && <p className="text-[11px] text-pnp-textSecondary truncate">@{user.username}</p>}
                  <span
                    className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                    style={{
                      background: isPrime ? "linear-gradient(135deg, #D4007A, #E69138)" : isMember ? "rgba(94,209,196,0.2)" : "rgba(255,255,255,0.08)",
                      color: isPrime ? "#fff" : isMember ? "#5ED1C4" : "#8E8E93",
                    }}
                  >
                    {tier || "free"}
                  </span>
                </div>
              </div>
              {profileData?.subscriptionExpires && (
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/5 mb-2">
                  <span className="text-[11px] text-pnp-textSecondary">Next payment</span>
                  <span className="text-[11px] font-medium text-white">
                    {new Date(profileData.subscriptionExpires).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
              <button
                onClick={() => { setMobileMenuOpen(false); navigate("/profile"); }}
                className="w-full py-1.5 rounded-xl text-[11px] font-bold text-white transition-all active:scale-98"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                View Full Profile
              </button>
            </div>

            {/* Scrollable link menu — native <details> for collapsibles
                 (built-in a11y, prefers-reduced-motion-respecting, no JS state). */}
            <nav className="flex-1 overflow-y-auto" aria-label="Mobile navigation" translate="no" lang="en">
              <div className="px-3 py-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">

                {/* ── Navigation (open by default) ────────────────────────── */}
                <details open className="group">
                  <summary className="flex items-center justify-between px-2 py-1.5 cursor-pointer list-none select-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{t.nav.navigation || "Navigation"}</span>
                    <svg className="w-3.5 h-3.5 text-pnp-textSecondary/50 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {[
                      { to: "/?view=feed", label: t.nav.feed || "PNP Feed" },
                      { to: "/main-stage", label: "Main Stage", isLive: true },
                      { to: "/channels", label: t.nav.channels || "PNP Channels" },
                      { to: "/?view=hangouts", label: t.nav.hangouts || "PNP Hangouts" },
                      { to: "/nearby", label: t.nav.nearby || "PNP Connect" },
                    ].map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }: { isActive: boolean }) =>
                          `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive ? "nav-active" : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                          }`
                        }
                      >
                        <span>{link.label}</span>
                        {link.isLive && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold">
                            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                            LIVE
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </details>

                {/* ── You (Inbox, Self-Care, Access, Settings) — collapsed ── */}
                <details className="group">
                  <summary className="flex items-center justify-between px-2 py-1.5 cursor-pointer list-none select-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{t.nav.you || "You"}</span>
                    <svg className="w-3.5 h-3.5 text-pnp-textSecondary/50 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        window.dispatchEvent(new CustomEvent(OPEN_WALLET_EVENT));
                      }}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true">💎</span>
                        Wallet
                      </span>
                    </button>
                    <button
                      onClick={() => { setMobileMenuOpen(false); setDmPartnerId(null); setIsDmPanelOpen(true); }}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                    >
                      <span>{t.nav.inbox || "Inbox"}</span>
                      {dmUnread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4007A] text-white text-[10px] font-bold flex items-center justify-center">{dmUnread > 9 ? "9+" : dmUnread}</span>}
                    </button>
                    {[
                      { to: "/self-care", label: t.nav.selfCare || "Self-Care Center", emoji: "🧘" },
                      { to: "/my-access", label: t.nav.myAccess || "My Access" },
                      { to: "/my-subscriptions", label: "My Subscriptions" },
                      { to: "/settings", label: t.nav.settings || "Settings" },
                    ].map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }: { isActive: boolean }) =>
                          `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive ? "nav-active" : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                          }`
                        }
                      >
                        <span className="flex items-center gap-2">
                          {(link as any).emoji && <span aria-hidden="true">{(link as any).emoji}</span>}
                          {link.label}
                        </span>
                      </NavLink>
                    ))}
                  </div>
                </details>

                {/* ── Help & Community — collapsed ─────────────────────── */}
                <details className="group">
                  <summary className="flex items-center justify-between px-2 py-1.5 cursor-pointer list-none select-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{t.nav.helpCommunity || "Help & Community"}</span>
                    <svg className="w-3.5 h-3.5 text-pnp-textSecondary/50 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {[
                      { to: "/support", label: t.nav.help || "Help & Support" },
                      { to: "/community-resources", label: t.nav.communityResources || "Community Resources" },
                      { to: "/about", label: t.nav.about || "About PNPtv!" },
                      { to: "/blog", label: t.nav.blog || "Blog" },
                    ].map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }: { isActive: boolean }) =>
                          `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive ? "nav-active" : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                </details>

                {/* ── Legal — collapsed ────────────────────────────────── */}
                <details className="group">
                  <summary className="flex items-center justify-between px-2 py-1.5 cursor-pointer list-none select-none">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{t.nav.legal || "Legal"}</span>
                    <svg className="w-3.5 h-3.5 text-pnp-textSecondary/50 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </summary>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 px-2">
                    {[
                      { to: "/terms", label: t.nav.terms || "Terms" },
                      { to: "/privacy", label: t.nav.privacy || "Privacy" },
                      { to: "/community-guidelines", label: t.nav.guidelines || "Guidelines" },
                      { to: "/content-policy", label: t.nav.contentPolicy || "Content Policy" },
                      { to: "/2257", label: "18 U.S.C. § 2257" },
                      { to: "/dmca", label: "DMCA" },
                      { to: "/refunds", label: t.nav.refunds || "Refunds" },
                    ].map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }: { isActive: boolean }) =>
                          `text-xs py-1 transition-colors ${
                            isActive ? "text-pnp-textPrimary" : "text-pnp-textSecondary/60 hover:text-pnp-textSecondary"
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                </details>

                {/* ── Admin (conditional, collapsed) ─────────────────────── */}
                {isAdmin && (
                  <details className="group">
                    <summary className="flex items-center justify-between px-2 py-1.5 cursor-pointer list-none select-none">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{t.nav.admin}</span>
                      <svg className="w-3.5 h-3.5 text-pnp-textSecondary/50 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </summary>
                    <div className="mt-1 space-y-0.5">
                      <NavLink
                        to="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }: { isActive: boolean }) =>
                          `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive ? "nav-active" : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                          }`
                        }
                      >
                        {t.nav.adminDashboard || "Admin Dashboard"}
                      </NavLink>
                    </div>
                  </details>
                )}

                {(user?.creator_status === "active" || isAdmin) && (
                  <details className="group">
                    <summary className="flex items-center justify-between px-2 py-1.5 cursor-pointer list-none select-none">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{t.nav.creatorStudio || "Creator"}</span>
                      <svg className="w-3.5 h-3.5 text-pnp-textSecondary/50 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </summary>
                    <div className="mt-1 space-y-0.5">
                      <NavLink
                        to="/creators"
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }: { isActive: boolean }) =>
                          `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive ? "nav-active" : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
                          }`
                        }
                      >
                        {t.nav.creatorStudio || "Creator Studio"}
                      </NavLink>
                    </div>
                  </details>
                )}

                {/* ── Sign out ──────────────────────────────────────────── */}
                <div className="pt-2 mt-2 border-t border-pnp-border">
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-pnp-textSecondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                    </svg>
                    {t.nav.signOut || "Sign out"}
                  </button>
                </div>

              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      {/* Mobile classic: 4rem BottomNav h-16 + safe-area-inset-bottom so content
           clears the nav on notched phones. Cruise/island: pill sits at
           calc(1.75rem + safe-area) so we need ~5rem + safe-area clearance.
           Desktop: no bottom nav, just 3rem for the AnnouncementStrip. */}
      <main className={`flex-1 overflow-y-auto overscroll-contain lg:overflow-visible lg:pb-12 lg:pl-72 ${
        cruiseMode
          ? "pb-[calc(5rem+env(safe-area-inset-bottom,0px))]"
          : "pb-[calc(4rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]"
      }`}>
        <Outlet />
      </main>

      {/* PNP Fam one-time welcome modal — auto-fires for fam members OR on
          ?preview=pnp-fam-welcome (Santino canary). */}
      <PnpFamWelcomeGate />

      {/* Featured Model of the Day — full-screen interstitial, once per user
          per UTC day. Skips checkout/onboarding/login/main-stage routes. */}
      <FeaturedModelInterstitial />

      {/* Global announcement strip — only after verification */}
      {isAuthenticated && user?.ageVerified && user?.termsAccepted && (
        <div className={`fixed left-0 right-0 z-40 pointer-events-none lg:bottom-0 lg:left-72 ${
          cruiseMode
            ? "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]"
            : "bottom-[calc(4rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]"
        }`}>
          <div className="pointer-events-auto">
            <AnnouncementStrip />
          </div>
        </div>
      )}

      {/* Bottom nav — always hidden on desktop; cruise/classic applies to mobile only.
          Also hidden inside a full-page DM chat so the composer sits flush with the
          bottom of the viewport (matches WhatsApp/Telegram behavior). */}
      {!/^\/dm\/[^/]+/.test(location.pathname) && (
        <div className="flex-shrink-0 lg:hidden">
          <BottomNav />
        </div>
      )}

      {/* ── Passive ad mounts (free-tier only; AdSlot short-circuits otherwise) ──
          Popunder + push mount invisibly and self-cap by session in sessionStorage.
          Sticky footer renders as a fixed bar above BottomNav (mobile) or bottom-right
          of the viewport (desktop). Kill switch: pnpapp:ads:enabled=0 in Redis. */}
      {isAuthenticated && user?.ageVerified && user?.termsAccepted && (
        <>
          <AdSlot slot="popunder_desktop" />
          <AdSlot slot="popunder_mobile" />
          <AdSlot slot="push_inpage" />
          <div className="fixed left-0 right-0 z-30 pointer-events-none flex justify-center lg:hidden"
               style={{ bottom: `calc(4rem + env(safe-area-inset-bottom,0px) + 3.25rem)` }}>
            <div className="pointer-events-auto"><AdSlot slot="sticky_footer_mobile" /></div>
          </div>
          <div className="hidden lg:flex fixed left-72 right-0 bottom-0 z-30 pointer-events-none justify-center pb-1">
            <div className="pointer-events-auto"><AdSlot slot="sticky_footer_desktop" /></div>
          </div>
        </>
      )}

      {/* Unified Cristina widget — only after verification */}
      {isAuthenticated && user?.ageVerified && user?.termsAccepted && (() => {
        const inVideoCall = location.pathname.startsWith("/chat/");
        const showCompact = isLandscape && isMobile && inVideoCall;
        // The mobile live player (Stream.tsx) is a full-bleed overlay with its
        // own top-right controls (LIVE badge, viewer count, close, tip alerts)
        // occupying the same corner the widget FAB defaults to — hide it there,
        // same as the existing /chat/ video-call carve-out above.
        // El reproductor móvil (Stream.tsx) ocupa la esquina derecha con sus
        // propios controles. Antes esto hacía `return null` y se perdía el
        // widget entero justo en la pantalla donde más se propina; ahora se
        // reubica al borde izquierdo en vez de desaparecer.
        const inMobileLiveStream = isMobile && /^\/live\/[^/]+/.test(location.pathname);
        return (
          <FloatingWidgets showCompact={showCompact} avoidRightEdge={inMobileLiveStream} />
        );
      })()}

      {/* ── Search Panel ────────────────────────────────────────────────────── */}
      {searchOpen && createPortal(
        <>
          <div
            className={`fixed inset-0 z-40 ${isMobile ? "bg-black/60" : ""}`}
            onClick={handleSearchClose}
            aria-hidden="true"
          />
          <div
            ref={searchPanelRef}
            className={isMobile
              ? "fixed bottom-0 left-0 right-0 z-50 animate-slide-up w-full h-[92dvh] flex flex-col rounded-t-2xl bg-pnp-background border-t border-pnp-border shadow-2xl overflow-hidden"
              : "flex flex-col rounded-xl bg-pnp-background border border-pnp-border shadow-xl overflow-hidden"
            }
            style={!isMobile ? { position: "fixed", top: searchPanelPos.top, left: searchPanelPos.left, zIndex: 50, width: "480px", height: "82svh" } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            {/* Drag handle */}
            {isMobile && <div className="flex justify-center pt-2 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-pnp-border" /></div>}

            {/* Search input bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-pnp-border flex-shrink-0">
              <svg className="w-4 h-4 text-pnp-textSecondary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input id="pnp-layout-3"
                autoFocus
                type="search"
                enterKeyHint="search"
                placeholder="People, creators, channels, hangouts…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchSubmitted(false); setSearchFullResults(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") handleSearchClose();
                  if (e.key === "Enter") handleSearchSubmit();
                }}
                className="flex-1 bg-transparent text-pnp-textPrimary text-sm outline-none placeholder:text-pnp-textSecondary min-w-0"
                style={{ fontSize: "16px" }}
              />
              {searchQuery ? (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults(null); setSearchSubmitted(false); setSearchFullResults(null); }}
                  className="flex-shrink-0 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
                  aria-label="Clear"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              ) : (
                <button onClick={handleSearchClose} className="flex-shrink-0 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors" aria-label="Close">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {/* Tab bar — visible only in full-results mode */}
            {searchSubmitted && (
              <div className="flex items-center gap-1 px-3 py-2 border-b border-pnp-border flex-shrink-0 overflow-x-auto">
                {(["all", "members", "creators", "channels", "hangouts", "posts"] as const).map((tab) => {
                  const labels: Record<string, string> = { all: "All", members: "Members", creators: "Creators", channels: "Channels", hangouts: "Hangouts", posts: "Posts" };
                  const active = searchTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setSearchTab(tab)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 flex-shrink-0"
                      style={active
                        ? { background: "linear-gradient(135deg,#D4007A,#E69138)", color: "#fff" }
                        : { background: "rgba(255,255,255,0.05)", color: "var(--pnp-textSecondary,rgba(255,255,255,0.6))" }
                      }
                    >
                      {labels[tab]}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Results body */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
              {/* ── Idle: tag cloud ── */}
              {searchQuery.trim().length < 2 && (
                <div className="px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-pnp-textSecondary/50 mb-3">Browse by interest</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { tag: "leather", emoji: "🥋" }, { tag: "bear", emoji: "🐻" }, { tag: "daddy", emoji: "👨" },
                      { tag: "clouds", emoji: "☁️" }, { tag: "pig-play", emoji: "🐷" }, { tag: "raw", emoji: "🔥" },
                      { tag: "bdsm", emoji: "⛓️" }, { tag: "twink", emoji: "🌸" }, { tag: "fisting", emoji: "✊" },
                      { tag: "watersports", emoji: "💦" }, { tag: "outdoor", emoji: "🌲" }, { tag: "jock", emoji: "💪" },
                      { tag: "latino", emoji: "🌶️" }, { tag: "group", emoji: "👥" }, { tag: "voyeur", emoji: "👁️" },
                      { tag: "muscle", emoji: "🏋️" }, { tag: "sober", emoji: "💧" }, { tag: "roleplay", emoji: "🎭" },
                      { tag: "solo", emoji: "1️⃣" }, { tag: "breeding", emoji: "💦" }, { tag: "bondage", emoji: "🪢" },
                    ].map(({ tag, emoji }) => (
                      <button
                        key={tag}
                        onClick={() => { navigate(`/channels?discover=${encodeURIComponent(tag)}`); handleSearchClose(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-pnp-surface hover:bg-white/10 text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors border border-pnp-border"
                      >
                        <span>{emoji}</span><span>{tag}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Live preview: compact rows while typing ── */}
              {searchQuery.trim().length >= 2 && !searchSubmitted && (() => {
                if (searchLoading) return (
                  <div className="flex items-center justify-center py-12">
                    <svg className="w-5 h-5 text-pnp-accent animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  </div>
                );
                const empty = !searchResults || (searchResults.users.length + searchResults.creators.length + searchResults.channels.length + searchResults.hangouts.length + searchResults.posts.length === 0);
                if (empty) return (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <p className="text-sm text-pnp-textSecondary">No results for &ldquo;{searchQuery}&rdquo;</p>
                    <p className="text-xs text-pnp-textSecondary/50 mt-1">Press Enter for a full search</p>
                  </div>
                );
                const r = searchResults!;
                type SearchRow = { key: string; label: string; rows: any[]; renderRow: (item: any) => React.ReactNode };
                const sections: SearchRow[] = [
                  { key: "members", label: "Members", rows: r.users, renderRow: (u: any) => {
                    const photo = u.photo_file_id && (u.photo_file_id.startsWith("/") || u.photo_file_id.startsWith("http")) ? u.photo_file_id : null;
                    return (
                      <button key={u.id} onClick={() => { handleSearchClose(); navigate(`/profile/${u.id}`); }} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                        {photo ? <img src={photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg,#D4007A,#E69138)", color: "#fff" }}>{(u.first_name || u.username || "?")[0].toUpperCase()}</div>}
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{u.first_name}{u.last_name ? ` ${u.last_name}` : ""}</p>{u.username && <p className="text-xs text-pnp-textSecondary truncate">@{u.username}</p>}</div>
                      </button>
                    );
                  }},
                  { key: "creators", label: "Creators", rows: r.creators, renderRow: (c: any) => {
                    const photo = c.photo_url && (c.photo_url.startsWith("/") || c.photo_url.startsWith("http")) ? c.photo_url : null;
                    return (
                      <button key={c.id} onClick={() => { handleSearchClose(); navigate(`/profile/${c.user_id}`); }} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                        {photo ? <img src={photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg,#5ED1C4,#D4007A)", color: "#fff" }}>{(c.display_name || c.username || "?")[0].toUpperCase()}</div>}
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{c.display_name || c.username}</p></div>
                        {c.verified && <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(94,209,196,0.15)", color: "#5ED1C4" }}>✓</span>}
                      </button>
                    );
                  }},
                  { key: "channels", label: "Channels", rows: r.channels, renderRow: (ch: any) => (
                    <button key={ch.id} onClick={() => { handleSearchClose(); navigate(`/channels/${ch.id}`); }} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                      {ch.cover_photo_url ? <img src={ch.cover_photo_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(212,0,122,0.15)" }}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#D4007A" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></div>}
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{ch.name}</p>{ch.subscriber_count != null && <p className="text-xs text-pnp-textSecondary">{ch.subscriber_count} subscribers</p>}</div>
                    </button>
                  )},
                  { key: "hangouts", label: "Hangouts", rows: r.hangouts, renderRow: (h: any) => (
                    <button key={h.id} onClick={() => { handleSearchClose(); navigate(`/chat/${h.id}`); }} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                      {h.cover_image_url ? <img src={h.cover_image_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(94,209,196,0.15)" }}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#5ED1C4" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>}
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{h.name}</p>{h.member_count != null && <p className="text-xs text-pnp-textSecondary">{h.member_count} members</p>}</div>
                    </button>
                  )},
                  { key: "posts", label: "Posts", rows: r.posts, renderRow: (p: any) => (
                    <button key={p.id} onClick={() => { handleSearchClose(); navigate(`/social/post/${p.id}`); }} className="w-full flex items-start gap-3 px-2 py-2 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                      <div className="flex-1 min-w-0"><p className="text-xs text-pnp-textSecondary mb-0.5">@{p.author_username}</p><p className="text-sm text-pnp-textPrimary line-clamp-2">{p.content}</p></div>
                    </button>
                  )},
                ];
                const activeSections = sections.filter(s => s.rows.length > 0);
                return (
                  <div className="px-3 py-2 space-y-1">
                    {activeSections.map(s => (
                      <div key={s.key}>
                        <div className="flex items-center justify-between px-2 py-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{s.label}</p>
                          <button onClick={handleSearchSubmit} className="text-[10px] text-pnp-accent hover:underline">See all →</button>
                        </div>
                        {s.rows.map(item => s.renderRow(item))}
                      </div>
                    ))}
                    <button
                      onClick={handleSearchSubmit}
                      className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                      style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                    >
                      See all results for &ldquo;{searchQuery}&rdquo;
                    </button>
                  </div>
                );
              })()}

              {/* ── Full results: tabbed view after Enter ── */}
              {searchSubmitted && (() => {
                if (searchFullLoading) return (
                  <div className="flex items-center justify-center py-12">
                    <svg className="w-5 h-5 text-pnp-accent animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  </div>
                );
                if (!searchFullResults) return null;
                const fr = searchFullResults;

                const renderMember = (u: any) => {
                  const photo = u.photo_file_id && (u.photo_file_id.startsWith("/") || u.photo_file_id.startsWith("http")) ? u.photo_file_id : null;
                  return (
                    <button key={u.id} onClick={() => { handleSearchClose(); navigate(`/profile/${u.id}`); }} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                      {photo ? <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg,#D4007A,#E69138)", color: "#fff" }}>{(u.first_name || u.username || "?")[0].toUpperCase()}</div>}
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{u.first_name}{u.last_name ? ` ${u.last_name}` : ""}</p>{u.username && <p className="text-xs text-pnp-textSecondary truncate">@{u.username}</p>}</div>
                    </button>
                  );
                };
                const renderCreator = (c: any) => {
                  const photo = c.photo_url && (c.photo_url.startsWith("/") || c.photo_url.startsWith("http")) ? c.photo_url : null;
                  return (
                    <button key={c.id} onClick={() => { handleSearchClose(); navigate(`/profile/${c.user_id}`); }} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                      {photo ? <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg,#5ED1C4,#D4007A)", color: "#fff" }}>{(c.display_name || c.username || "?")[0].toUpperCase()}</div>}
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{c.display_name || c.username}</p></div>
                      {c.verified && <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(94,209,196,0.15)", color: "#5ED1C4" }}>Verified</span>}
                    </button>
                  );
                };
                const renderChannel = (ch: any) => (
                  <button key={ch.id} onClick={() => { handleSearchClose(); navigate(`/channels/${ch.id}`); }} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                    {ch.cover_photo_url ? <img src={ch.cover_photo_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(212,0,122,0.15)" }}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#D4007A" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></div>}
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{ch.name}</p><p className="text-xs text-pnp-textSecondary truncate">{ch.channel_type} · {ch.subscriber_count ?? 0} subscribers</p></div>
                  </button>
                );
                const renderHangout = (h: any) => (
                  <button key={h.id} onClick={() => { handleSearchClose(); navigate(`/chat/${h.id}`); }} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                    {h.cover_image_url ? <img src={h.cover_image_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(94,209,196,0.15)" }}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#5ED1C4" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>}
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-pnp-textPrimary truncate">{h.name}</p><p className="text-xs text-pnp-textSecondary truncate">{h.member_count ?? 0} members</p></div>
                  </button>
                );
                const renderPost = (p: any) => (
                  <button key={p.id} onClick={() => { handleSearchClose(); navigate(`/social/post/${p.id}`); }} className="w-full flex items-start gap-3 px-2 py-2.5 rounded-xl hover:bg-pnp-surface transition-colors text-left">
                    <div className="flex-1 min-w-0"><p className="text-xs text-pnp-textSecondary mb-0.5">@{p.author_username}</p><p className="text-sm text-pnp-textPrimary line-clamp-2">{p.content}</p></div>
                  </button>
                );

                const noResults = fr.users.length + fr.creators.length + fr.channels.length + fr.hangouts.length + fr.posts.length === 0;
                if (noResults) return (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <p className="text-sm text-pnp-textSecondary">No results for &ldquo;{searchQuery}&rdquo;</p>
                  </div>
                );

                if (searchTab === "all") {
                  const allSections = [
                    { key: "members", label: "Members", rows: fr.users, tab: "members" as const, render: renderMember },
                    { key: "creators", label: "Creators", rows: fr.creators, tab: "creators" as const, render: renderCreator },
                    { key: "channels", label: "Channels", rows: fr.channels, tab: "channels" as const, render: renderChannel },
                    { key: "hangouts", label: "Hangouts", rows: fr.hangouts, tab: "hangouts" as const, render: renderHangout },
                    { key: "posts", label: "Posts", rows: fr.posts, tab: "posts" as const, render: renderPost },
                  ].filter(s => s.rows.length > 0);
                  return (
                    <div className="px-3 py-2 space-y-2">
                      {allSections.map(s => (
                        <div key={s.key}>
                          <div className="flex items-center justify-between px-2 py-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-pnp-textSecondary/50">{s.label}</p>
                            {s.rows.length >= 3 && <button onClick={() => setSearchTab(s.tab)} className="text-[10px] text-pnp-accent hover:underline">See all →</button>}
                          </div>
                          {s.rows.slice(0, 3).map(item => s.render(item))}
                        </div>
                      ))}
                    </div>
                  );
                }

                const tabContent: Record<string, { rows: any[]; render: (item: any) => React.ReactNode }> = {
                  members: { rows: fr.users, render: renderMember },
                  creators: { rows: fr.creators, render: renderCreator },
                  channels: { rows: fr.channels, render: renderChannel },
                  hangouts: { rows: fr.hangouts, render: renderHangout },
                  posts: { rows: fr.posts, render: renderPost },
                };
                const current = tabContent[searchTab];
                if (!current || current.rows.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <p className="text-sm text-pnp-textSecondary">No {searchTab} found for &ldquo;{searchQuery}&rdquo;</p>
                  </div>
                );
                return <div className="px-3 py-2">{current.rows.map(item => current.render(item))}</div>;
              })()}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── DM Panel ────────────────────────────────────────────────────────── */}
      {isDmPanelOpen && createPortal(
        <>
          <div
            className={`fixed inset-0 z-40 ${isMobile ? "bg-black/60" : ""}`}
            onClick={() => setIsDmPanelOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={dmPanelRef}
            className={isMobile
              ? "fixed bottom-0 left-0 right-0 z-50 animate-slide-up w-full h-[92dvh] flex flex-col rounded-t-2xl bg-pnp-background border-t border-pnp-border shadow-2xl overflow-hidden"
              : "flex flex-col rounded-xl bg-pnp-background border border-pnp-border shadow-xl overflow-hidden"
            }
            style={!isMobile ? { position: "fixed", top: dmPanelPos.top, left: dmPanelPos.left, zIndex: 50, width: "480px", height: "82svh" } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label="Messages"
          >
            {isMobile && <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1 rounded-full bg-pnp-border" /></div>}
            <div className="flex items-center justify-between px-4 py-3 border-b border-pnp-border flex-shrink-0">
              {dmPartnerId ? (
                <button onClick={() => setDmPartnerId(null)} className="flex items-center gap-2 text-pnp-textPrimary hover:opacity-80 transition-opacity">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-sm font-semibold">Back</span>
                </button>
              ) : (
                <h2 className="text-sm font-semibold text-pnp-textPrimary">Messages</h2>
              )}
              <button onClick={() => setIsDmPanelOpen(false)} className="text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              {dmPartnerId ? (
                <DmChatView
                  userId={dmPartnerId}
                  myDbId={user?.dbId ?? user?.id ?? ""}
                  myUserId={String(user?.id ?? "")}
                  isAdmin={isAdmin}
                  onBack={() => setDmPartnerId(null)}
                  panelMode
                />
              ) : (
                <ThreadListView
                  myDbId={user?.dbId ?? user?.id ?? ""}
                  onThreadSelect={(uid) => setDmPartnerId(uid)}
                  panelMode
                />
              )}
            </div>
          </div>
        </>,
        document.body
      )}


      {/* Toast notifications */}
      {isAuthenticated && <Toast />}

      {/* One-shot flash messages stashed in sessionStorage by other routes
          (e.g. failed hangout-invite redirect). Shown regardless of auth so the
          message survives the redirect to /login. */}
      <FlashBanner />

      {/* 18+ age gate — shown once on first visit to adult content routes */}
      {showAgeGate && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="text-4xl mb-3">🔞</div>
            <h2 className="text-lg font-bold text-white mb-2">
              {t.lang === "es" ? "Contenido para adultos" : "Adult content"}
            </h2>
            <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              {t.lang === "es"
                ? "PNPtv! contiene contenido sexual explícito para adultos. Al continuar confirmas que cumples con los requisitos de edad para ser miembro."
                : "PNPtv! contains explicit adult content. By continuing you confirm you meet our membership age requirements."}
            </p>
            <button
              onClick={() => {
                try { localStorage.setItem("pnptv:age_confirmed", "1"); } catch {}
                setShowAgeGate(false);
              }}
              className="w-full py-3 rounded-xl font-bold text-white text-sm mb-3 transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {t.lang === "es" ? "Confirmo que tengo 18+" : "I confirm I am 18+"}
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full py-2 rounded-xl text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {t.lang === "es" ? "Salir" : "Go back"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Floating widgets layer — SelfCamFloater + CristinaWidget.
 * MainStageFAB removed 2026-05-02 (entry is centralized on the Crystal
 * Hangout card and /main-stage). SelfCamFloater stays so users who joined
 * the stage and navigated away still see their live cam preview.
 */
function FloatingWidgets({
  showCompact,
  avoidRightEdge = false,
}: {
  showCompact: boolean;
  /** Mueve el FAB al borde izquierdo donde la esquina derecha ya está ocupada. */
  avoidRightEdge?: boolean;
}) {
  return (
    <>
      <SelfCamFloater />
      <Suspense fallback={null}>
        <CristinaWidget compact={showCompact} />
      </Suspense>
      <WalletFloater avoidRightEdge={avoidRightEdge} />
    </>
  );
}

// Wallet FAB — bottom-right floating button. Tap opens the WalletHomeSheet,
// which shows a proper wallet UI: USDC + Ru$h balances, on-chain wallet
// address (copy + Basescan), fund-with-card, buy Ru$h, and a drill-in to
// the BuyTokensModal for legacy provider fallbacks. Auto-hides on carve-out
// surfaces where it would visually collide with call/tip controls.
//
// On /main-stage the FAB becomes an expandable action stack: tap to fan
// sub-buttons upward (Tip Crystal Creators + Support Main Stage fallback),
// tap a sub-button to open the compact QuickTipSheet below.

// Shared Ru$h rate constant — 1 USD = 6 Ru$h (see feedback_token_rate.md).
const RUSH_PER_USD = 6;

// Preset Ru$h amounts for the quick-tip sheet.
// Unified tip presets — sourced from the shared PayInWalletChips constants
// so every tip surface (MainStage sheet, QuickTipSheet, creator profile)
// stays in sync. USD is authoritative; Rush is the paired dual-label at
// 6 Ru$h = $1 (per feedback_token_rate.md).
const QUICK_TIP_PRESETS = TIP_PRESETS_USD.map((usd, i) => ({
  rush: TIP_PRESETS_RUSH[i],
  usd,
}));

// Platform donation user ID — Santino's account, used as the fallback
// recipient when no Crystal Creator is on stage.
const PLATFORM_DONATION_USER_ID = "8599671840";

interface QuickTipRecipient {
  userId: string;
  /** Display label — @username or "Main Stage" for donation mode. */
  label: string;
  isDonation: boolean;
}

// ── QuickTipSheet ──────────────────────────────────────────────────────────
// Compact bottom sheet (~40% vh) opened by the Main Stage FAB action stack.
// Composes TipRushRail (Ru$h, "live" mode fires tip animations) and
// WalletPayCard (USDC on Base, gasless via Privy) as two side-by-side rails.
//
// This component is defined inline in Layout.tsx (per feedback_no_new_files.md).

function QuickTipSheet({
  recipient,
  onClose,
}: {
  recipient: QuickTipRecipient;
  onClose: () => void;
}) {
  const [selectedRush, setSelectedRush] = useState<number>(QUICK_TIP_PRESETS[1].rush);
  const [railMode, setRailMode] = useState<"rush" | "usdc">("rush");
  const [rushDone, setRushDone] = useState(false);

  // Derived USD amount for WalletPayCard based on selected preset.
  const selectedUsd = selectedRush / RUSH_PER_USD;

  // entitlementSpec mirrors what MainStage.tsx passes to WalletPayCard.
  const entitlementSpec = {
    creator_id: recipient.userId,
  };
  const metadata = {
    context: "main_stage_fab",
    ...(recipient.isDonation ? { donation: "platform" } : {}),
  };

  return (
    // Backdrop — click outside to dismiss.
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-2xl p-5 space-y-4"
        style={{
          background: "rgba(19,16,26,0.98)",
          border: "1px solid rgba(212,0,122,0.35)",
          maxHeight: "44vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            {recipient.isDonation ? (
              <p className="text-sm font-bold text-white">
                Support Main Stage — Community Donation
              </p>
            ) : (
              <p className="text-sm font-bold text-white">
                Tip <span className="text-pink-400">{recipient.label}</span>
              </p>
            )}
            <p className="text-[11px] text-white/50 mt-0.5">
              {recipient.isDonation
                ? "Your donation supports PNPtv and the Main Stage."
                : "100% goes to the creator instantly."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Preset chips — shared between both rails */}
        <div className="grid grid-cols-4 gap-2">
          {QUICK_TIP_PRESETS.map(({ rush, usd }) => (
            <button
              key={rush}
              type="button"
              onClick={() => { setSelectedRush(rush); setRushDone(false); }}
              className={`py-2.5 rounded-lg text-center transition-colors ${
                selectedRush === rush
                  ? "bg-gradient-to-r from-pink-500 to-orange-400 text-white"
                  : "bg-white/[0.05] text-white/80 border border-white/10 hover:bg-white/[0.10]"
              }`}
            >
              <span className="block text-sm font-bold">{rush} 💎</span>
              <span className="block text-[10px] text-white/60">~${usd}</span>
            </button>
          ))}
        </div>

        {/* Rail selector */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRailMode("rush")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              railMode === "rush"
                ? "bg-gradient-to-r from-pink-500 to-orange-400 text-white shadow"
                : "bg-white/[0.05] text-white/60 border border-white/10 hover:bg-white/[0.10]"
            }`}
          >
            Pay with Ru$h 💎 — instant
          </button>
          <button
            type="button"
            onClick={() => setRailMode("usdc")}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              railMode === "usdc"
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow"
                : "bg-white/[0.05] text-white/60 border border-white/10 hover:bg-white/[0.10]"
            }`}
          >
            Pay with USDC — gasless
          </button>
        </div>

        {/* Active rail */}
        {railMode === "rush" && !rushDone && (
          <Suspense fallback={<div className="h-16 flex items-center justify-center text-white/40 text-xs">Loading…</div>}>
            <LazyTipRushRail
              creatorId={recipient.userId}
              creatorName={recipient.label}
              mode="live"
              variant="compact"
              showMessage={false}
              showBalance={false}
              allowGifted={recipient.userId === PLATFORM_DONATION_USER_ID}
              selectedPreset={selectedRush}
              onSuccess={() => { setRushDone(true); setTimeout(onClose, 1200); }}
            />
          </Suspense>
        )}
        {railMode === "rush" && rushDone && (
          <p className="text-center text-sm text-emerald-400 font-semibold py-3">
            Tip sent! 💎
          </p>
        )}
        {railMode === "usdc" && (
          <Suspense fallback={<div className="h-16 flex items-center justify-center text-white/40 text-xs">Loading…</div>}>
            <LazyWalletPayCard
              surface="tip"
              amountUsd={selectedUsd}
              entitlementSpec={entitlementSpec}
              metadata={metadata}
              label={`Send ${selectedRush} Ru$h ($${selectedUsd}) tip`}
              lang="en"
              compact
              onSuccess={() => setTimeout(onClose, 1200)}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

// ── WalletFloater ─────────────────────────────────────────────────────────────

function WalletFloater({ avoidRightEdge = false }: { avoidRightEdge?: boolean } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  // Creator profile route match — drives the /c/:username contextual stack.
  // useMatch returns null when the current path isn't a creator profile.
  const creatorMatch = useMatch("/c/:username");
  const creatorUsername = creatorMatch?.params?.username ?? null;
  const [open, setOpen] = useState(false);
  // Active wallet detection — used to badge the FAB so users see which wallet
  // is signing without having to open the sheet. Mirrors WalletHomeSheet's
  // preferred → embedded → first external order.
  const { wallets } = useWallets();
  const [preferredAddr, setPreferredAddr] = useState<string | null>(() => getPreferredWallet());
  useEffect(() => {
    // storage event = cross-tab writes; PREFERRED_WALLET_EVENT = same-tab
    // writes (setPreferredWallet dispatches it). Replaces the previous 2s
    // poll so the FAB badge updates instantly instead of after up to 2s.
    const sync = () => setPreferredAddr(getPreferredWallet());
    window.addEventListener("storage", sync);
    window.addEventListener(PREFERRED_WALLET_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(PREFERRED_WALLET_EVENT, sync);
    };
  }, []);
  const preferredWallet = preferredAddr ? wallets.find((w) => w.address === preferredAddr) : null;
  const activeFabWallet = preferredWallet
    || wallets.find((w) => w.walletClientType === "privy")
    || wallets[0]
    || null;
  const showFabBadge = !!activeFabWallet && activeFabWallet.walletClientType !== "privy";
  // Main Stage context: expanded action stack state + fetched state + tip sheet.
  const [stackOpen, setStackOpen] = useState(false);
  const [msState, setMsState] = useState<{
    crystalOnStage: Array<{ userId: string; username: string | null }>;
    platformDonationUserId: string;
  } | null>(null);
  const [tipRecipient, setTipRecipient] = useState<QuickTipRecipient | null>(null);
  // Creator profile context: fetched profile + expanded stack state. Reuses
  // the same visual pattern (fan-out sub-buttons) as the Main Stage stack.
  const [creatorProfile, setCreatorProfile] = useState<CreatorPublicProfile | null>(null);
  const [creatorStackOpen, setCreatorStackOpen] = useState(false);
  const path = location.pathname;
  const isMainStage = path === "/main-stage";
  const isCreatorProfile = !!creatorUsername;

  // Listen for OPEN_WALLET_EVENT so the desktop sidebar and mobile drawer
  // "Wallet" nav items can pop the sheet from any surface without a route
  // change. Same-tab CustomEvent dispatched by the nav buttons.
  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener(OPEN_WALLET_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_WALLET_EVENT, openHandler);
  }, []);

  // Auto-open on ?openWallet=1 so /wallet deep-links (push notifications,
  // broadcast emails, etc.) that redirect here actually surface the sheet.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("openWallet") === "1") {
      setOpen(true);
      // Clean the query so a subsequent Back button press doesn't re-open it.
      const cleaned = new URLSearchParams(location.search);
      cleaned.delete("openWallet");
      const search = cleaned.toString();
      window.history.replaceState({}, "", location.pathname + (search ? `?${search}` : "") + location.hash);
    }
  }, [location.search, location.pathname, location.hash]);

  // Poll /api/main-stage/state while on Main Stage so newly-arriving Crystal
  // Creators surface in the action stack without a page reload. Stops on
  // unmount / navigation away.
  useEffect(() => {
    if (!isMainStage) {
      setMsState(null);
      setStackOpen(false);
      return;
    }
    let cancelled = false;
    function fetchState() {
      import("@/lib/api")
        .then(({ getMainStageState }) => getMainStageState())
        .then((state) => {
          if (cancelled) return;
          const onStage = state.spotlight?.onStage ?? [];
          const crystalOnStage = onStage
            .filter((e) => e.isCrystal)
            .slice(0, 2);
          setMsState({
            crystalOnStage,
            platformDonationUserId: state.platformDonationUserId ?? PLATFORM_DONATION_USER_ID,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setMsState({ crystalOnStage: [], platformDonationUserId: PLATFORM_DONATION_USER_ID });
          }
        });
    }
    fetchState();
    const interval = setInterval(fetchState, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isMainStage]);

  // Collapse stack when navigating away.
  useEffect(() => {
    if (!isMainStage) setStackOpen(false);
  }, [isMainStage]);

  // Fetch the creator profile when on /c/:username. Reuses the same endpoint
  // the profile page already calls (backend response is cached by fetch → the
  // second call is served from the browser HTTP cache when the user is already
  // on the profile page). Silently falls back to default FAB on error.
  useEffect(() => {
    if (!creatorUsername || !isAuthenticated) {
      setCreatorProfile(null);
      setCreatorStackOpen(false);
      return;
    }
    let cancelled = false;
    getPublicCreatorProfile(creatorUsername)
      .then((profile) => { if (!cancelled) setCreatorProfile(profile); })
      .catch(() => { if (!cancelled) setCreatorProfile(null); });
    return () => { cancelled = true; };
  }, [creatorUsername, isAuthenticated]);

  // Collapse creator stack when navigating away.
  useEffect(() => {
    if (!isCreatorProfile) setCreatorStackOpen(false);
  }, [isCreatorProfile]);

  if (path.startsWith("/chat/") || path.startsWith("/live/") || path.startsWith("/dm/")) return null;
  if (path === "/onboarding" || path === "/subscribe" || path === "/lifetime100") return null;

  // ── Main Stage mode: expandable action stack ─────────────────────────────
  if (isMainStage) {
    // Build sub-button list from Crystal Creators + the always-present Support button.
    const crystals = msState?.crystalOnStage ?? [];
    const donationUserId = msState?.platformDonationUserId ?? PLATFORM_DONATION_USER_ID;

    const subButtons: QuickTipRecipient[] = [
      ...crystals.map((c) => ({
        userId: c.userId,
        label: c.username ? `@${c.username}` : c.userId,
        isDonation: false,
      })),
      {
        userId: donationUserId,
        label: "Main Stage",
        isDonation: true,
      },
    ];

    function handleSubButton(recipient: QuickTipRecipient) {
      setStackOpen(false);
      setTipRecipient(recipient);
    }

    function handleFabClick() {
      if (stackOpen) {
        setStackOpen(false);
      } else {
        setStackOpen(true);
      }
    }

    return (
      <>
        {/* Sub-buttons — fan upward above the FAB, visible when stackOpen */}
        <div
          className="fixed z-[45] flex flex-col-reverse items-end gap-2.5"
          style={{
            bottom: "calc(5rem + env(safe-area-inset-bottom, 0px) + 60px)",
            right: "calc(0.75rem + env(safe-area-inset-right, 0px))",
            // Pointer events only when open so taps-through work while collapsed.
            pointerEvents: stackOpen ? "auto" : "none",
          }}
        >
          {subButtons.map((btn) => (
            <button
              key={btn.userId + (btn.isDonation ? "-donation" : "")}
              type="button"
              onClick={() => handleSubButton(btn)}
              aria-label={btn.isDonation ? "Support Main Stage" : `Tip ${btn.label}`}
              className={`flex items-center gap-2 pl-3 pr-4 rounded-full text-xs font-bold text-white shadow-lg border border-white/15 backdrop-blur-md transition-all duration-200 ${
                stackOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{
                height: 40,
                background: btn.isDonation
                  ? "linear-gradient(135deg,#6366f1,#4f46e5)"
                  : "linear-gradient(135deg,#D4007A,#E69138)",
                transitionDelay: stackOpen ? "0ms" : "0ms",
              }}
            >
              <span aria-hidden>💎</span>
              <span>
                {btn.isDonation ? "Support Main Stage" : `Tip ${btn.label}`}
              </span>
            </button>
          ))}
        </div>

        {/* Backdrop — tap outside to collapse stack */}
        {stackOpen && (
          <div
            className="fixed inset-0 z-[44]"
            onClick={() => setStackOpen(false)}
            aria-hidden
          />
        )}

        {/* Primary FAB — identical style/size/position as the default FAB */}
        <button
          type="button"
          onClick={handleFabClick}
          aria-label={stackOpen ? "Close tip menu" : "Open tip menu"}
          aria-expanded={stackOpen}
          className="fixed z-[46] flex items-center justify-center rounded-full shadow-lg backdrop-blur-md border border-white/15 active:scale-95 transition-transform"
          style={{
            bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
            right: "calc(0.75rem + env(safe-area-inset-right, 0px))",
            width: 52, height: 52,
            background: "linear-gradient(135deg,#10b981,#059669)",
            color: "white",
            fontSize: 22,
          }}
        >
          💎
        </button>

        {/* Quick-tip sheet — mounted when a sub-button is tapped */}
        {tipRecipient && (
          <QuickTipSheet
            recipient={tipRecipient}
            onClose={() => setTipRecipient(null)}
          />
        )}
      </>
    );
  }

  // ── Creator profile mode: contextual sub-buttons for /c/:username ────────
  // Only kicks in for authenticated non-self viewers when the profile is
  // loaded AND at least one capability is available. Otherwise falls through
  // to the default WalletHomeSheet FAB so the widget is never a dead-end.
  if (isCreatorProfile && isAuthenticated && creatorProfile) {
    const c = creatorProfile.creator;
    // Own-profile detection mirrors CreatorProfilePage: match by dbId/id OR
    // username (case-insensitive). Suppress the stack on self-view.
    const viewerId = String(user?.dbId || user?.id || "");
    const isOwnProfile = (viewerId && viewerId === String(c.id))
      || (!!user?.username && !!c.username && c.username.toLowerCase() === user.username.toLowerCase());

    if (!isOwnProfile) {
      const channels = creatorProfile.channels || [];
      const callPackages = creatorProfile.callPackages || [];
      const hasChannel = channels.length > 0;
      // PRIME-gated creators (e.g. Santino) unlock via platform PRIME, not a
      // per-creator sub — the profile subscribe CTA already routes to /subscribe
      // in that case. We suppress the FAB Subscribe sub-button for those so it
      // doesn't offer a broken CreatorSubscribeWizard flow.
      const isPrimeCreator = channels[0]?.access_type === "prime";

      const canSubscribe = hasChannel && !creatorProfile.isSubscribed && !isPrimeCreator;
      // Tip: Crystal Creator flag (SQL-computed, Infinity-safe) AND the
      // creator actually goes live (matches the profile-page tip button rule).
      const canTip = !!c.crystalCreator
        && (c.creator_role === "live" || c.creator_role === "both");
      // Book-a-call: expand into one sub-button per call package so users see
      // duration + price at a glance (e.g. "30 min · $60", "60 min · $150")
      // instead of a generic "Book a call" that hides the variety.
      // Filter to active packages, sort shortest→longest so cheapest is nearest
      // the primary FAB. Wallet FAB is payment-focused so DM was intentionally
      // removed (free comms belong elsewhere; profile page still has DM CTA).
      const activePackages = callPackages
        .filter((p) => p.is_active)
        .slice()
        .sort((a, b) => a.duration_minutes - b.duration_minutes);

      type CreatorSubButton =
        | { kind: "subscribe"; label: string }
        | { kind: "tip"; label: string }
        | { kind: "book"; label: string; duration: number; packageId: number };

      const creatorSubButtons: CreatorSubButton[] = [];
      if (canSubscribe) creatorSubButtons.push({ kind: "subscribe", label: "Subscribe" });
      if (canTip) creatorSubButtons.push({ kind: "tip", label: `Tip @${c.username}` });
      for (const pkg of activePackages) {
        const price = typeof pkg.price_usd === "number" ? pkg.price_usd : Number(pkg.price_usd) || 0;
        const label = `${pkg.duration_minutes} min · $${Math.round(price)}`;
        creatorSubButtons.push({ kind: "book", label, duration: pkg.duration_minutes, packageId: pkg.id });
      }
      // Cap generous — subscribe + tip + up to ~4 call packages covers every
      // creator we've seen. Extra packages beyond the cap are still bookable
      // from the profile page.
      const capped = creatorSubButtons.slice(0, 6);

      // Only render the contextual stack if there's at least one capability.
      // Otherwise fall through to the default WalletHomeSheet FAB below.
      if (capped.length > 0) {
        function handleCreatorSub(btn: CreatorSubButton) {
          setCreatorStackOpen(false);
          switch (btn.kind) {
            case "subscribe":
              // Profile page auto-opens CreatorSubscribeWizard on ?action=subscribe.
              navigate(`/c/${c.username}?action=subscribe`);
              return;
            case "tip":
              // Open the shared QuickTipSheet with this creator pre-selected —
              // same component the Main Stage stack uses. Isn't a donation.
              setTipRecipient({
                userId: String(c.id),
                label: c.username ? `@${c.username}` : String(c.id),
                isDonation: false,
              });
              return;
            case "book":
              // Profile page reads ?action=book&duration=<min> and auto-opens
              // BookCallModal with that duration pre-selected. duration=15
              // triggers the free intro-call flow; 30 and 60 are paid packages.
              navigate(`/c/${c.username}?action=book&duration=${btn.duration}`);
              return;
          }
        }

        return (
          <>
            {/* Sub-buttons — fan upward above the FAB, visible when stack open */}
            <div
              className="fixed z-[45] flex flex-col-reverse items-end gap-2.5"
              style={{
                bottom: "calc(5rem + env(safe-area-inset-bottom, 0px) + 60px)",
                right: "calc(0.75rem + env(safe-area-inset-right, 0px))",
                pointerEvents: creatorStackOpen ? "auto" : "none",
              }}
            >
              {capped.map((btn) => (
                <button
                  key={btn.kind}
                  type="button"
                  onClick={() => handleCreatorSub(btn)}
                  aria-label={btn.label}
                  className={`flex items-center gap-2 pl-3 pr-4 rounded-full text-xs font-bold text-white shadow-lg border border-white/15 backdrop-blur-md transition-all duration-200 ${
                    creatorStackOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{
                    height: 40,
                    minHeight: 44 - 4, // 40px height + 4px padding baked into hit area via flex — keeps ≥44px touch target
                    background: "linear-gradient(135deg,#D4007A,#E69138)",
                  }}
                >
                  <span aria-hidden>💎</span>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>

            {/* Backdrop — tap outside to collapse stack */}
            {creatorStackOpen && (
              <div
                className="fixed inset-0 z-[44]"
                onClick={() => setCreatorStackOpen(false)}
                aria-hidden
              />
            )}

            {/* Primary FAB — identical style/size/position as the default FAB */}
            <button
              type="button"
              onClick={() => setCreatorStackOpen((v) => !v)}
              aria-label={creatorStackOpen ? "Close creator actions" : "Open creator actions"}
              aria-expanded={creatorStackOpen}
              className="fixed z-[46] flex items-center justify-center rounded-full shadow-lg backdrop-blur-md border border-white/15 active:scale-95 transition-transform"
              style={{
                bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
                right: "calc(0.75rem + env(safe-area-inset-right, 0px))",
                width: 52, height: 52,
                background: "linear-gradient(135deg,#10b981,#059669)",
                color: "white",
                fontSize: 22,
              }}
            >
              💎
            </button>

            {/* Quick-tip sheet — mounted when the tip sub-button is tapped */}
            {tipRecipient && (
              <QuickTipSheet
                recipient={tipRecipient}
                onClose={() => setTipRecipient(null)}
              />
            )}
          </>
        );
      }
    }
  }

  // ── Default mode: open WalletHomeSheet ────────────────────────────────────
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={showFabBadge ? `Open wallet (using ${activeFabWallet?.walletClientType})` : "Open wallet"}
        className="fixed z-40 flex items-center justify-center rounded-full shadow-lg backdrop-blur-md border border-white/15 active:scale-95 transition-transform"
        style={{
          bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
          // Mismo offset, lado opuesto: en el reproductor móvil la derecha la
          // ocupan los controles del directo.
          ...(avoidRightEdge
            ? { left: "calc(0.75rem + env(safe-area-inset-left, 0px))" }
            : { right: "calc(0.75rem + env(safe-area-inset-right, 0px))" }),
          width: 52, height: 52,
          background: "linear-gradient(135deg,#10b981,#059669)",
          color: "white",
          fontSize: 22,
        }}
      >
        💎
        {showFabBadge && (
          <span
            aria-hidden="true"
            className="absolute flex items-center justify-center rounded-full bg-white shadow"
            style={{
              bottom: -2, right: -2,
              width: 20, height: 20,
              border: "2px solid rgba(19,16,26,0.98)",
            }}
            title={`Signing as ${activeFabWallet?.walletClientType}`}
          >
            <WalletTypeIcon clientType={activeFabWallet?.walletClientType} size={12} />
          </span>
        )}
      </button>
      {open && (
        <Suspense fallback={null}>
          <LazyWalletHomeSheet onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

// Lazy-load the wallet sheet — heavy (Privy hooks + viem + BuyTokensModal
// drill-in). Only downloads on first FAB tap so the base bundle stays lean.
const LazyWalletHomeSheet = lazy(async () => {
  const mod = await import("@/components/payments/PayInWalletChips");
  return { default: mod.WalletHomeSheet };
});

// Lazy-load TipRushRail for the QuickTipSheet Ru$h rail — keeps the base
// Layout bundle lean; only downloaded when a user taps a tip sub-button.
// The component signature is TipRushRailProps — we additionally accept
// selectedPreset so QuickTipSheet can drive the initial selection.
const LazyTipRushRail = lazy(async () => {
  const mod = await import("@/components/payments/TipRushRail");
  // Wrap to accept selectedPreset (drives TipRushRail's internal state via
  // the preset prop if TipRushRail supports it, otherwise ignored gracefully).
  type Props = React.ComponentProps<typeof mod.TipRushRail> & { selectedPreset?: number };
  const Wrapped = (props: Props) => {
    const { selectedPreset: _ignored, ...rest } = props;
    return <mod.TipRushRail {...rest} />;
  };
  return { default: Wrapped };
});

// Lazy-load WalletPayCard for the QuickTipSheet USDC rail.
const LazyWalletPayCard = lazy(async () => {
  const mod = await import("@/components/payments/PayInWalletChips");
  return { default: mod.WalletPayCard };
});

// REMOVED 2026-05-01 — FloatingMainStagePlayer (220×130 fixed PiP video).
// Replaced by MainStageLiveBanner mounted on Home / Live / Chat pages.
// Original code deleted from tree; recoverable from git history.

// ─── For-You Recommendations Hook ────────────────────────────────────────────
// Simple memoized fetch with a 15-minute in-memory cache keyed by context.
// No SWR dependency — plain useEffect + useState. Fails gracefully (returns
// empty arrays so the right rail simply renders nothing).

const forYouCache = new Map<string, { data: ForYouRecommendations; ts: number }>();
const FOR_YOU_TTL_MS = 15 * 60 * 1000;

// Crypto-guide status is per-user, session-scoped. Single in-memory cache
// avoids hammering the /me endpoint every time a callout mounts.
let cryptoGuideCache: { data: CryptoGuideStatus; ts: number } | null = null;
const CRYPTO_GUIDE_TTL_MS = 5 * 60 * 1000;

export function useCryptoGuideStatus(): { status: CryptoGuideStatus | null; refetch: () => void } {
  const [status, setStatus] = useState<CryptoGuideStatus | null>(cryptoGuideCache?.data || null);
  const refetch = useCallback(() => {
    getCryptoGuideStatus()
      .then((s) => { cryptoGuideCache = { data: s, ts: Date.now() }; setStatus(s); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (cryptoGuideCache && Date.now() - cryptoGuideCache.ts < CRYPTO_GUIDE_TTL_MS) {
      setStatus(cryptoGuideCache.data);
      return;
    }
    refetch();
  }, [refetch]);
  return { status, refetch };
}

/**
 * CryptoGuideCallout — reusable pill/banner nudging users to complete
 * the crypto onboarding guide. Only renders when the user hasn't
 * completed it. Deep-links to /crypto-guide?returnTo=<current-path>.
 *
 * Variants:
 *   - "inline"  → compact pill for above payment method selectors.
 *   - "banner"  → full-width banner (used on Home).
 *   - "sticky"  → mid-flow reminder inside modals/waiting panels.
 *
 * showProgress=true will display "Step X of 7" if the user already
 * started the wizard (more compelling than a cold pitch).
 */
export function CryptoGuideCallout({
  variant = "inline",
  className,
  onDismiss,
}: {
  variant?: "inline" | "banner" | "sticky";
  className?: string;
  onDismiss?: () => void;
}) {
  const { status } = useCryptoGuideStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useI18n();
  const es = t.lang === "es";

  if (!status || status.completedAt) return null;

  const started = (status.progressStep || 0) > 0;
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const href = `/crypto-guide?returnTo=${returnTo}`;

  const headline = started
    ? (es ? `Casi lo tienes — paso ${status.progressStep}/7` : `Almost there — step ${status.progressStep}/7`)
    : (es ? "¿Nuevo en cripto? Setup en 5 min" : "New to crypto? 5-min setup");
  const sub = started
    ? (es ? "Termina y llévate 100 Ru$h gratis 🎁" : "Finish and grab your 100 free Ru$h 🎁")
    : (es ? "Wallet lista + 100 Ru$h gratis al terminar 🎁" : "Wallet ready + 100 free Ru$h on completion 🎁");
  const cta = started
    ? (es ? "Continuar →" : "Continue →")
    : (es ? "Empezar →" : "Start →");

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={() => navigate(href)}
        className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-opacity hover:opacity-90 ${className || ""}`}
        style={{
          background: "linear-gradient(90deg, rgba(245,158,11,0.12), rgba(212,0,122,0.12))",
          border: "1px solid rgba(245,158,11,0.35)",
        }}
      >
        <span style={{ fontSize: 18 }}>💰</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] font-bold text-white leading-tight">{headline}</span>
          <span className="block text-[10.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>{sub}</span>
        </span>
        <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>{cta}</span>
      </button>
    );
  }

  if (variant === "sticky") {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] ${className || ""}`}
        style={{
          background: "rgba(245,158,11,0.10)",
          border: "1px solid rgba(245,158,11,0.30)",
        }}
      >
        <span style={{ fontSize: 14 }}>💡</span>
        <span className="flex-1" style={{ color: "rgba(255,255,255,0.85)" }}>
          {es ? "¿Trabado con cripto? " : "Stuck with crypto? "}
          <button
            type="button"
            onClick={() => navigate(href)}
            className="font-bold underline"
            style={{ color: "#F59E0B" }}
          >
            {es ? "Ver guía" : "See guide"}
          </button>
        </span>
      </div>
    );
  }

  // banner
  return (
    <div
      className={`rounded-xl p-4 flex items-center gap-3 ${className || ""}`}
      style={{
        background: "linear-gradient(90deg, rgba(245,158,11,0.10), rgba(212,0,122,0.10))",
        border: "1px solid rgba(245,158,11,0.35)",
      }}
    >
      <div style={{ fontSize: 24 }}>💰</div>
      <div className="flex-1 min-w-0">
        <p className="m-0 text-sm font-bold text-white">{headline}</p>
        <p className="m-0 text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>{sub}</p>
      </div>
      <button
        type="button"
        onClick={() => navigate(href)}
        className="px-3.5 py-2 rounded-lg text-xs font-bold text-white flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #F59E0B, #D4007A)" }}
      >
        {cta}
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={es ? "Cerrar" : "Dismiss"}
          className="text-white/50 hover:text-white/90 text-lg leading-none flex-shrink-0"
          style={{ padding: "4px 6px" }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * CryptoFirstTimeInterstitial — full-screen modal shown once (localStorage
 * flag `pnp_crypto_interstitial_seen`) when a user is about to pay with
 * crypto and hasn't completed the guide. Skippable but attention-grabbing.
 *
 * The parent controls `open` — usually toggled by an onClick handler on a
 * "Pay with crypto" button that first checks status. On confirm, navigates
 * to /crypto-guide?returnTo=<current-path>; on skip, calls onSkip() so the
 * parent can proceed with the original crypto pay flow.
 */
export function CryptoFirstTimeInterstitial({
  open,
  onSkip,
  onClose,
}: {
  open: boolean;
  onSkip: () => void;
  onClose: () => void;
}) {
  const { status } = useCryptoGuideStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useI18n();
  const es = t.lang === "es";

  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem("pnp_crypto_interstitial_seen", "1"); } catch {}
  }, [open]);

  if (!open) return null;
  if (status?.completedAt) return null;

  const started = (status?.progressStep || 0) > 0;
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const href = `/crypto-guide?returnTo=${returnTo}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: "linear-gradient(135deg, #1a1a1f 0%, #0a0a0d 100%)",
          border: "1px solid rgba(245,158,11,0.4)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-5xl mb-3">💰</div>
          <h2 className="text-lg font-bold text-white mb-2">
            {started
              ? (es ? "Estás cerca — termina y gana 100 Ru$h" : "Almost there — finish and earn 100 Ru$h")
              : (es ? "¿Primera vez con cripto?" : "First time with crypto?")}
          </h2>
          <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            {es
              ? "Tenemos una guía visual de 5 minutos que te enseña cómo abrir una wallet y comprar tu primera cripto. Al terminar te regalamos 100 Ru$h (~$1) para tu primera compra."
              : "We've got a visual 5-minute guide that walks you through opening a wallet and buying your first crypto. Complete it and we'll gift you 100 Ru$h (~$1) for your first purchase."}
          </p>
          <button
            type="button"
            onClick={() => { onClose(); navigate(href); }}
            className="w-full py-3 rounded-xl font-bold text-sm text-white mb-2"
            style={{ background: "linear-gradient(135deg, #F59E0B, #D4007A)" }}
          >
            {started
              ? (es ? "Continuar guía →" : "Continue guide →")
              : (es ? "Ver la guía (5 min) →" : "See the guide (5 min) →")}
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onSkip(); }}
            className="w-full py-2.5 rounded-xl text-xs font-semibold"
            style={{ color: "rgba(255,255,255,0.55)", background: "transparent" }}
          >
            {es ? "Ya sé cómo — continuar con el pago" : "I know how — continue with payment"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useForYou(context: string, creatorId?: string | null): {
  data: ForYouRecommendations | null;
  loading: boolean;
} {
  const [data, setData] = useState<ForYouRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const cacheKey = creatorId ? `${context}:${creatorId}` : context;

  useEffect(() => {
    let cancelled = false;
    const cached = forYouCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < FOR_YOU_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    getForYouRecommendations(context, creatorId ?? null)
      .then((res) => {
        if (cancelled) return;
        forYouCache.set(cacheKey, { data: res, ts: Date.now() });
        setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [context, creatorId, cacheKey]);

  return { data, loading };
}

// ─── Rail Row Components ──────────────────────────────────────────────────────

interface SuggestedCreatorRowProps {
  item: ForYouSuggestedCreator;
  subscribeLabel: string;
  viewLabel: string;
}

export function SuggestedCreatorRow({ item, subscribeLabel, viewLabel }: SuggestedCreatorRowProps) {
  const href = item.username ? `/c/@${item.username}` : `/profile/${item.userId}`;
  return (
    <li>
      <Link
        to={href}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
      >
        <UserAvatar
          userId={item.userId}
          photoUrl={item.avatarUrl || undefined}
          displayName={item.displayName || item.username}
          size="sm"
          showOnline={false}
          linkToProfile={false}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white truncate">
            {item.displayName || item.username}
          </div>
          {item.reason && (
            <div
              className="text-[11px] truncate"
              style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
            >
              {item.reason}
            </div>
          )}
        </div>
        <span
          className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
          style={{
            background: "rgba(212,0,122,0.15)",
            color: "#D4007A",
            border: "1px solid rgba(212,0,122,0.3)",
          }}
        >
          {item.price && parseFloat(item.price) > 0 ? subscribeLabel : viewLabel}
        </span>
      </Link>
    </li>
  );
}

interface SuggestedFollowRowProps {
  item: ForYouSuggestedFollow;
  followLabel: string;
  viewLabel: string;
}

export function SuggestedFollowRow({ item, followLabel, viewLabel }: SuggestedFollowRowProps) {
  const [followed, setFollowed] = useState(false);
  const [following, setFollowing] = useState(false);
  const href = item.username ? `/@${item.username}` : `/profile/${item.userId}`;

  const handleFollow = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (followed || following) return;
      setFollowing(true);
      try {
        await followUser(item.userId);
        setFollowed(true);
      } catch {
        // Silent — the user can navigate to profile to follow properly
      } finally {
        setFollowing(false);
      }
    },
    [item.userId, followed, following]
  );

  return (
    <li>
      <Link
        to={href}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
      >
        <UserAvatar
          userId={item.userId}
          photoUrl={item.avatarUrl || undefined}
          displayName={item.username}
          size="sm"
          showOnline={item.isOnline}
          linkToProfile={false}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white truncate">
            {item.username ? `@${item.username}` : item.userId}
          </div>
          {item.reason && (
            <div
              className="text-[11px] truncate"
              style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
            >
              {item.reason}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleFollow}
          disabled={followed || following}
          className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
          style={
            followed
              ? { background: "rgba(255,255,255,0.08)", color: "#8E8E93", border: "1px solid rgba(255,255,255,0.1)" }
              : { background: "rgba(212,0,122,0.15)", color: "#D4007A", border: "1px solid rgba(212,0,122,0.3)" }
          }
          aria-label={followed ? "Following" : followLabel}
        >
          {followed ? viewLabel : following ? "…" : followLabel}
        </button>
      </Link>
    </li>
  );
}

interface ContextHintCardProps {
  hint: ForYouContextHint;
}

export function ContextHintCard({ hint }: ContextHintCardProps) {
  if (!hint.text) return null;
  return (
    <Link
      to={hint.action || "/"}
      className="block px-4 py-3 hover:bg-white/5 transition-colors"
    >
      <div className="text-[12px] leading-snug text-white/80">{hint.text}</div>
    </Link>
  );
}

// ─── RightRail ────────────────────────────────────────────────────────────────
// Desktop-only contextual sidebar. Each section has a title + list of items.

interface RailSection {
  title: string;
  items: React.ReactNode[];
  viewAllHref?: string;
  viewAllLabel?: string;
}

interface RightRailProps {
  sections: RailSection[];
  className?: string;
}

export function RightRail({ sections, className }: RightRailProps) {
  const nonEmpty = sections.filter((s) => s.items.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {nonEmpty.map((section, i) => (
        <div
          key={i}
          className="rounded-2xl overflow-hidden"
          style={{
            background: "var(--pnp-surface, #1e1e1e)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-white">{section.title}</span>
            {section.viewAllHref && (
              <Link
                to={section.viewAllHref}
                className="text-[11px] font-semibold transition-opacity hover:opacity-80"
                style={{ color: "#D4007A" }}
              >
                {section.viewAllLabel ?? "View all"}
              </Link>
            )}
          </div>
          <ul>{section.items}</ul>
        </div>
      ))}
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────
// Responsive 2-col wrapper: full-width on mobile, center + 320px rail on lg+.
// rightRail is ONLY rendered at lg+ — the hidden lg:block wrapper guarantees
// the rail never appears on mobile regardless of what is passed.

interface AppShellProps {
  rightRail?: React.ReactNode;
  children: React.ReactNode;
  /** Override the center column max-width. Default: "1040px" */
  centerMaxWidth?: string;
  className?: string;
}

export function AppShell({
  rightRail,
  children,
  centerMaxWidth = "1040px",
  className,
}: AppShellProps) {
  if (!rightRail) {
    // No rail — just render children unchanged
    return <>{children}</>;
  }

  return (
    <div
      className={`lg:mx-auto lg:px-6 lg:py-0 ${className ?? ""}`}
      style={{ maxWidth: `calc(${centerMaxWidth} + 320px + 24px)` }}
    >
      <div className="lg:grid lg:gap-6" style={{ gridTemplateColumns: `minmax(0,1fr) 320px` }}>
        {/* Center column */}
        <div className="min-w-0">{children}</div>

        {/* Right rail: desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4">{rightRail}</div>
        </aside>
      </div>
    </div>
  );
}
