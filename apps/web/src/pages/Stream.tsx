import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, Skeleton, Badge } from "@pnptv/ui-kit";
import { useAuth } from "@/hooks/useAuth";
import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { useLiveSocket } from "@/hooks/useLiveSocket";
import { useI18n } from "@/lib/i18n";
import { LivePlayer } from "@/components/LivePlayer";
import { LiveRulesModal } from "@/components/LiveRulesModal";
import { BuyTokensModal } from "@/components/BuyTokensModal";
import { connectSocket } from "@/lib/socket";
import { List, useDynamicRowHeight } from "react-window";
import {
  getLiveStreams,
  getAllPerformers,
  sendTip,
  TIP_AMOUNTS,
  getStreamOverlayPublic,
  getLiveRulesStatus,
  acknowledgeLiveRules,
  type LiveStream,
  type LiveStreamWithHost,
  type RecentTip,
  type StreamOverlay,
  type TipGoal,
  type TipMenuItem,
  getRecentTips,
  getWalletBalance,
  getWebAppLiveStreams,
  initiateRaid,
  setHostedChannel,
  getHostedChannel,
  getSlotTicketStatus,
  buySlotTicket,
  isCreatorPayLocked,
  getLiveGoal,
  getTipMenu,
  getMyTipMenu,
  saveTipMenu,
  setLiveGoal,
  clearLiveGoal,
  getStreamViewers,
  getTipLeaderboard,
  getCreatorRecordings,
  getCallPackagesByChannelRef,
  bookCallWithTokens,
  getStreamReplay,
  sendLiveHeartbeat,
  enterLiveStream,
  postLiveReact,
  type LiveCallPackage,
  type StreamViewer,
} from "@/lib/api";
import { StreamHealthPanel } from "@/components/stream/StreamHealthPanel";
import { type LivePlayerStats } from "@/components/LivePlayer";

function extractChannelRef(streamId: string): string | null {
  // streamId is now the channel ref directly (e.g. "pnptv-santino")
  // or could be a legacy full process ID (e.g. "restreamer-ui:ingest:pnptv-santino")
  const match = streamId.match(/restreamer-ui:ingest:([\w-]+)/);
  return match ? match[1] : streamId;
}

// Portals children into document.fullscreenElement while the browser is in
// native fullscreen, so modals / bottom sheets stay visible over the video.
// Falls back to document.body outside fullscreen. Re-mounts on FS change.
// Safari (iOS/macOS) still fires the webkit-prefixed event + exposes the FS
// element on document.webkitFullscreenElement — listen on both.
function FullscreenPortal({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const d = document as Document & { webkitFullscreenElement?: Element };
    return ((d.fullscreenElement ?? d.webkitFullscreenElement) as HTMLElement) ?? document.body;
  });
  useEffect(() => {
    const pick = () => {
      const d = document as Document & { webkitFullscreenElement?: Element };
      setHost(((d.fullscreenElement ?? d.webkitFullscreenElement) as HTMLElement) ?? document.body);
    };
    pick();
    document.addEventListener("fullscreenchange", pick);
    document.addEventListener("webkitfullscreenchange", pick);
    return () => {
      document.removeEventListener("fullscreenchange", pick);
      document.removeEventListener("webkitfullscreenchange", pick);
    };
  }, []);
  if (!host) return null;
  return createPortal(children, host);
}

// ── Virtualized chat message list (react-window v2) ───────────────────────
type ChatMsg = { id: string | number; username: string; content: string; userId?: string; isHype?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChatRow(props: any) {
  const { index, style, messages, isOwner, onBan } = props as {
    index: number;
    style: React.CSSProperties;
    messages: ChatMsg[];
    isOwner?: boolean;
    onBan?: (userId: string) => void;
  };
  const msg = messages[index];
  if (!msg) return null;
  if (msg.isHype) {
    return (
      <div style={style} className="py-0.5 px-0.5">
        <div
          className="text-xs flex items-center gap-1.5 px-2 py-1 rounded-lg"
          style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.18), rgba(212,0,122,0.12))", border: "1px solid rgba(139,92,246,0.25)" }}
        >
          <span className="font-bold flex-shrink-0" style={{ color: "#a78bfa" }}>PNPtv</span>
          <span
            className="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded"
            style={{ background: "rgba(139,92,246,0.35)", color: "#c4b5fd" }}
          >
            BOT
          </span>
          <span className="flex-1" style={{ color: "#e9d5ff" }}>{msg.content}</span>
        </div>
      </div>
    );
  }
  return (
    <div style={style} className="py-0.5">
      <div className="text-xs flex items-center gap-1">
        {/* design: amber usernames in live chat */}
        <span className="font-semibold" style={{ color: "#E69138" }}>@{msg.username}</span>
        <span className="text-pnp-textSecondary mx-0.5">·</span>
        <span className="text-pnp-textPrimary flex-1">{msg.content}</span>
        {isOwner && msg.userId && onBan && (
          <button
            onClick={() => onBan(msg.userId!)}
            className="flex-shrink-0 ml-1 text-[9px] text-pnp-textSecondary/40 hover:text-red-400 transition-colors"
            title="Ban from chat"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function ChatMessageList({
  messages,
  listRef,
  containerRef: _containerRef,
  isOwner,
  onBan,
}: {
  messages: ChatMsg[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listRef: React.MutableRefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isOwner?: boolean;
  onBan?: (userId: string) => void;
}) {
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 24, key: messages.length });
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <List
      listRef={listRef}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rowComponent={ChatRow as any}
      rowCount={messages.length}
      rowHeight={rowHeight}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rowProps={{ messages, isOwner, onBan } as any}
      style={{ height: 192, width: "100%", marginBottom: "0.5rem" }}
      tagName="div"
    />
  );
}

// ── No-tokens wall ───────────────────────────────────────────────────────────
function StreamNoTokensWall() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(212,0,122,0.12)", border: "1px solid rgba(212,0,122,0.3)" }}>
        <svg className="w-8 h-8" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-pnp-textPrimary mb-2">Inicia sesión para ver</h2>
        <p className="text-sm text-pnp-textSecondary max-w-xs">Los shows en vivo son de pago. Inicia sesión para comprar Ru$h ⚡💲 y ver.</p>
      </div>
      <button
        onClick={() => navigate('/login')}
        className="px-6 py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
      >
        Iniciar sesión →
      </button>
      <button onClick={() => navigate(-1)} className="text-xs text-pnp-textSecondary hover:text-pnp-textPrimary">
        ← Go back
      </button>
    </div>
  );
}

function InsufficientTokensWall({ current, streamName, onBuyTokens }: { current?: number; streamName?: string; onBuyTokens: () => void }) {
  const navigate = useNavigate();
  return (
    <div
      className="relative z-10 mx-4 rounded-2xl px-6 py-7 flex flex-col items-center gap-4 text-center w-full max-w-xs"
      style={{ background: "rgba(12,12,18,0.94)", border: "1px solid rgba(212,0,122,0.4)", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}
    >
      {streamName && (
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">{streamName}</p>
      )}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: "rgba(212,0,122,0.15)", border: "1.5px solid rgba(212,0,122,0.45)" }}
      >
        <svg className="w-7 h-7" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-bold text-white mb-1.5">Ru$h insuficiente</h2>
        <p className="text-xs text-white/60 leading-relaxed">
          Necesitas al menos <strong className="text-white/90">60 Ru$h</strong> para ver este show.
          {current !== undefined && (
            <span className="block mt-1.5">
              Tienes <strong className="text-pnp-accent">{current}</strong> Ru$h.
            </span>
          )}
        </p>
      </div>
      <button
        onClick={onBuyTokens}
        className="w-full py-3 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform"
        style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
      >
        Comprar Ru$h ⚡💲 →
      </button>
      <button onClick={() => navigate(-1)} className="text-xs text-white/40 hover:text-white/70 transition-colors">
        ← Volver
      </button>
    </div>
  );
}

export default function Stream() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <StreamNoTokensWall />;
  return <StreamInner />;
}

function StreamInner() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const t = useI18n();
  const { isAuthenticated, login, user } = useAuth();
  const { showTutorial, dismissTutorial, dismissForever } = useTutorial("stream");

  const [stream, setStream] = useState<LiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<StreamOverlay | null>(null);

  // Live rules gate — only enforced for authenticated users
  const [rulesAcknowledged, setRulesAcknowledged] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [creatorRules, setCreatorRules] = useState<string | null>(null);
  const [creatorRulesName, setCreatorRulesName] = useState<string | null>(null);

  // Chat & tips
  const [chatInput, setChatInput] = useState("");
  const [tipPaymentTab] = useState<"tokens">("tokens");
  const [tipping, setTipping] = useState(false);
  // tippingRef gates re-entrant calls to handleTip — setTipping is async,
  // so a fast double-click could fire two tips before the first state update
  // disables the button. The ref is synchronous and bulletproof.
  const tippingRef = useRef(false);
  const [tipSubmitting, setTipSubmitting] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [tipSuccess, setTipSuccess] = useState<string | null>(null);
  const [recentTips, setRecentTips] = useState<RecentTip[]>([]);

  // Tracked one-shot timers so unmount cancels any pending state updates and
  // we don't generate "setState on unmounted component" warnings when the user
  // navigates away during a tip success / share copied flash.
  const tipSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [streamError, setStreamError] = useState(false);
  // Mobile-only bottom sheet: wallet, tip menu/amounts, recent tips, book-a-call.
  // Triggered by the floating Tip button in the full-bleed video overlay.
  const [showTipSheet, setShowTipSheet] = useState(false);

  // Ru$h token wallet
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);

  // ── Raid state ──────────────────────────────────────────────────────────────
  const [raidCountdown, setRaidCountdown] = useState<number | null>(null);
  const [showRaidPicker, setShowRaidPicker] = useState(false);
  const [raidTargetStreams, setRaidTargetStreams] = useState<LiveStreamWithHost[]>([]);
  const [raidPickerLoading, setRaidPickerLoading] = useState(false);
  const [raidError, setRaidError] = useState<string | null>(null);
  const raidCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Leaderboard overlay state ──────────────────────────────────────────────
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<"today" | "week">("today");
  const [leaderboardData, setLeaderboardData] = useState<{ today: { username: string; total: number; tipCount: number }[]; week: { username: string; total: number; tipCount: number }[] }>({ today: [], week: [] });

  // ── Tip goal state ─────────────────────────────────────────────────────────
  const [tipGoal, setTipGoal] = useState<TipGoal | null>(null);

  // ── Tip menu state ─────────────────────────────────────────────────────────
  const [tipMenu, setTipMenu] = useState<TipMenuItem[]>([]);

  // ── Book a call state ──────────────────────────────────────────────────────
  const [callPackages, setCallPackages] = useState<LiveCallPackage[]>([]);
  const [callCreatorId, setCallCreatorId] = useState<string | null>(null);
  const [showBookCall, setShowBookCall] = useState(false);
  const [bookCallSubmitting, setBookCallSubmitting] = useState(false);
  const [bookCallError, setBookCallError] = useState<string | null>(null);
  const [bookCallSuccess, setBookCallSuccess] = useState<string | null>(null);

  // ── Desktop right-panel tab ────────────────────────────────────────────────
  const [desktopTab, setDesktopTab] = useState<"chat" | "tips" | "book" | "studio">("chat");

  // ── Studio panel state (owner-only) ────────────────────────────────────────
  const [studioSubTab, setStudioSubTab] = useState<"viewers" | "tips">("viewers");
  const [studioViewers, setStudioViewers] = useState<StreamViewer[]>([]);
  const [studioViewersLoading, setStudioViewersLoading] = useState(false);
  const [myTipMenuItems, setMyTipMenuItems] = useState<TipMenuItem[]>([]);
  const [myTipMenuSaving, setMyTipMenuSaving] = useState(false);
  const [newTipLabel, setNewTipLabel] = useState("");
  const [newTipAmount, setNewTipAmount] = useState("");
  const [goalAmountInput, setGoalAmountInput] = useState("");
  const [goalLabelInput, setGoalLabelInput] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);

  // ── VOD replay state ───────────────────────────────────────────────────────
  const [replayUrl, setReplayUrl] = useState<string | null>(null);

  // ── Ticket / paywall state ─────────────────────────────────────────────────
  const [ticketStatus, setTicketStatus] = useState<{
    isTicketed: boolean;
    priceTokens: number | null;
    priceUsd: string | null;
    hasTicket: boolean;
  } | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketBuying, setTicketBuying] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  // ── Stream health HUD state (creator-only, desktop) ────────────────────────
  const [streamStats, setStreamStats] = useState<LivePlayerStats | null>(null);
  const [statsHistory, setStatsHistory] = useState<LivePlayerStats[]>([]);
  const [hudExpanded, setHudExpanded] = useState(false);
  const [healthOffline, setHealthOffline] = useState(false);
  const healthPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Host mode state ────────────────────────────────────────────────────────
  const [hostedChannelRef, setHostedChannelRef] = useState<string | null>(null);
  const [hostedStream, setHostedStream] = useState<LiveStreamWithHost | null>(null);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [hostPickerLoading, setHostPickerLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostTargetStreams, setHostTargetStreams] = useState<LiveStreamWithHost[]>([]);

  const {
    messages: chatMessages,
    viewerCount: socketViewerCount,
    isConnected: chatConnected,
    reconnecting: chatReconnecting,
    sendMessage,
    latestTip,
    walletBalance: socketBalance,
    socketBalanceReceived,
    socketError,
    raidEvent,
    dismissRaid,
    raidRequest,
    respondToRaid,
    raidDeclined,
    raidExpired,
    clearRaidStatus,
    tipGoal: socketTipGoal,
    chatBanned,
    tipAlert,
  } = useLiveSocket(streamId || null);

  // chatSendingRef gates rapid Enter-Enter and click-click to keep both
  // handlers from emitting two messages before setChatInput("") propagates.
  // 250ms is enough to clear the input + render; faster than a typist's
  // double-tap.
  const chatSendingRef = useRef(false);
  const submitChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || chatSendingRef.current) return;
    chatSendingRef.current = true;
    sendMessage(text);
    setChatInput("");
    setTimeout(() => { chatSendingRef.current = false; }, 250);
  }, [chatInput, sendMessage]);

  // handleBanUser is defined after channelRef is computed (line ~702) via closure
  // channelRef is not in deps because it derives from the URL param and never changes during a session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleBanUser = useCallback((targetUserId: string) => {
    if (!channelRef) return;
    const socket = connectSocket();
    if (!socket.connected) return;
    socket.emit("live:mod_action", { targetUserId, channelRef, action: "ban" });
  }, []);

  // Cleanup all timers/intervals on unmount: one-shot setTimeouts (tip-success
  // toast, share-copied flash) plus health poll.
  useEffect(() => {
    return () => {
      if (tipSuccessTimerRef.current) clearTimeout(tipSuccessTimerRef.current);
      if (shareCopiedTimerRef.current) clearTimeout(shareCopiedTimerRef.current);
      if (healthPollRef.current) clearInterval(healthPollRef.current);
      if (balancePollRef.current) clearInterval(balancePollRef.current);
      if (reactFlushTimerRef.current) clearTimeout(reactFlushTimerRef.current);
      if (reactTapWindowRef.current) clearTimeout(reactTapWindowRef.current);
      if (raidCountdownRef.current) {
        clearInterval(raidCountdownRef.current);
        raidCountdownRef.current = null;
      }
    };
  }, []);

  // Safety timeout: if chatReconnecting stays true for 30s, reset it to avoid
  // the reconnecting indicator being stuck on screen after a reconnect failure.
  const chatReconnectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (chatReconnecting) {
      chatReconnectingTimeoutRef.current = setTimeout(() => {
        // The hook will set this back to false on connect; this is just the safety net.
        // We can't call setChatReconnecting directly (it's hook-internal), but we
        // track via a local override flag rendered below.
        chatReconnectingTimeoutRef.current = null;
      }, 30000);
    } else {
      if (chatReconnectingTimeoutRef.current) {
        clearTimeout(chatReconnectingTimeoutRef.current);
        chatReconnectingTimeoutRef.current = null;
      }
    }
    return () => {
      if (chatReconnectingTimeoutRef.current) {
        clearTimeout(chatReconnectingTimeoutRef.current);
        chatReconnectingTimeoutRef.current = null;
      }
    };
  }, [chatReconnecting]);
  // Local override: suppress the reconnecting indicator after 30s of stuck state
  const [reconnectTimedOut, setReconnectTimedOut] = useState(false);
  useEffect(() => {
    if (!chatReconnecting) { setReconnectTimedOut(false); return; }
    const t = setTimeout(() => setReconnectTimedOut(true), 30000);
    return () => clearTimeout(t);
  }, [chatReconnecting]);

  // Load initial balance — but never overwrite a fresher socket-pushed value.
  // The socket can deliver a balance update before the HTTP response lands;
  // applying the older HTTP value would briefly flash stale tokens to the
  // user (e.g. fresh tip just deducted). Mirrors the Live.tsx pattern.
  useEffect(() => {
    if (!isAuthenticated) return;
    getWalletBalance().then((data) => {
      if (!socketBalanceReceived) {
        setTokenBalance(data.balance);
      }
    }).catch(() => {});
  }, [isAuthenticated, socketBalanceReceived]);

  // Sync socket-pushed balance — always wins over HTTP.
  useEffect(() => {
    if (socketBalance !== null) setTokenBalance(socketBalance);
  }, [socketBalance]);

  // ── F1/F2 — Subscribe to socket stream:react events from other viewers ─────
  useEffect(() => {
    if (!streamId) return;
    const socket = connectSocket();
    const onReact = (data: { userId: string; kind: string; ts: number }) => {
      const id = data.ts + Math.random();
      const x = 20 + Math.random() * 60; // random horizontal offset %
      setFloatingReacts((prev) => [...prev.slice(-8), { id, kind: data.kind, x }]);
      setTimeout(() => {
        setFloatingReacts((prev) => prev.filter((r) => r.id !== id));
      }, 1800);
    };
    socket.on("stream:react", onReact);
    return () => { socket.off("stream:react", onReact); };
  }, [streamId]);

  // ── F3 — Poll balance every 30s while in stream ────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    balancePollRef.current = setInterval(() => {
      getWalletBalance().then((d) => {
        if (!socketBalanceReceived) setTokenBalance(d.balance);
      }).catch(() => {});
    }, 30_000);
    return () => {
      if (balancePollRef.current) { clearInterval(balancePollRef.current); balancePollRef.current = null; }
    };
  }, [isAuthenticated, socketBalanceReceived]);

  // ── F6 — Kebab menu (state must be declared before the outside-click effect) ─
  const [showKebab, setShowKebab] = useState(false);
  const kebabRef = useRef<HTMLDivElement>(null);

  // ── F6 — Close kebab on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!showKebab) return;
    const handler = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setShowKebab(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showKebab]);

  // ── Heartbeat state (effect below, after isStreamOwner/channelRef declarations) ──
  const [outOfTokens, setOutOfTokens] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Entry gate state ──────────────────────────────────────────────────────
  const [entryChecked, setEntryChecked] = useState(false);
  const [entryAllowed, setEntryAllowed] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [freeMinutesLeft, setFreeMinutesLeft] = useState<number | null>(null);
  // Tracks which channelRef has successfully completed /enter (and thus has a
  // freeUntil key in Redis). The heartbeat must not start until this matches
  // the current channelRef — prevents the race where tick() fires before
  // /enter sets the free-period key on webcam switch.
  const entryGrantedRef = useRef<string | null>(null);
  const [entryGrantedTick, setEntryGrantedTick] = useState(0);

  // Viewer count: prefer the real-time socket value; fall back to a polled
  // value from the streams API when the socket is not connected.
  const [polledViewerCount, setPolledViewerCount] = useState(0);
  const viewerCount = chatConnected ? socketViewerCount : polledViewerCount;

  // Share button state
  const [shareCopied, setShareCopied] = useState(false);

  // ── F1/F2 — Emoji reactions ────────────────────────────────────────────────
  // floatingReacts: ephemeral float-up animations [{id, kind}]
  const [floatingReacts, setFloatingReacts] = useState<{ id: number; kind: string; x: number }[]>([]);
  // local heart counter (F1)
  const [heartCount, setHeartCount] = useState(0);
  // batch buffer: pending taps not yet sent
  const reactBatchRef = useRef<{ kind: string; count: number }[]>([]);
  const reactFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // rate limit: max 10 taps/sec → 100ms debounce window, flush after 100ms idle
  const reactTapCountRef = useRef(0);
  const reactTapWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── F3 — Token balance chip (separate poll) ────────────────────────────────
  const balancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── F5 — already uses isFullscreen state (declared below near videoContainerRef) ──

  // ── F6 — Kebab menu state is declared above (before its outside-click effect) ─

  // ── F7 — Fullscreen quick-tip state (already uses isFullscreen + handleTip) ─

  // Ref for the polling interval so it can be cancelled on error.
  const streamPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks whether the most recent loadStream call ended with an error.
  const loadErrorRef = useRef(false);

  // Load stream info from Restreamer HLS streams and performer lookup.
  const loadStream = useCallback(() => {
    if (!streamId) return Promise.resolve();
    loadErrorRef.current = false;
    const channelRef = extractChannelRef(streamId);

    return Promise.all([
      getLiveStreams().catch(() => ({ streams: [] })),
      getAllPerformers().catch(() => ({ performers: [] })),
    ])
      .then(([hlsData, perfData]) => {
        const hlsStreams = hlsData.streams || [];
        const performers = perfData.performers || [];

        // 1. Direct match in Restreamer HLS streams
        const hlsMatch = hlsStreams.find((s: any) => s.id === streamId || s.id === channelRef);
        if (hlsMatch && hlsMatch.isLive) {
          setStream(hlsMatch);
          setError(null);
          setStreamError(false);
          return;
        }

        // 2. Match by performer (isLive + hlsUrl from backend)
        const performer = performers.find(
          (p: any) =>
            p.id === streamId ||
            (p.userId && String(p.userId) === streamId) ||
            (p.slug && p.slug === streamId)
        );
        if (performer && performer.isLive && performer.hlsUrl) {
          setStream({
            id: performer.id,
            name: performer.displayName,
            description: performer.bio || "",
            hlsUrl: performer.hlsUrl,
            isLive: true,
            thumbnailUrl: performer.photoUrl || null,
            username: performer.slug || null,
          });
          setError(null);
          setStreamError(false);
          return;
        }

        // 3. Fuzzy match in HLS streams — check suffix after a delimiter so that
        // a short streamId like "1" can't accidentally match "pnptv-10" or "pnptv-21".
        const matchesSuffix = (haystack: string, needle: string) =>
          haystack === needle ||
          haystack.endsWith(`:${needle}`) ||
          haystack.endsWith(`/${needle}`);
        const fuzzyMatch = hlsStreams.find(
          (s: any) => matchesSuffix(s.id, streamId) || (channelRef && matchesSuffix(s.id, channelRef))
        );
        if (fuzzyMatch) {
          setStream(fuzzyMatch);
          setError(null);
          setStreamError(false);
          return;
        }

        // 4. Check performer info to build an "offline" placeholder — the channel exists
        // but nobody is streaming right now. This prevents "stream not found" when a valid
        // creator navigates to their own stream URL before going live.
        const offlinePerformer = performer || performers.find(
          (p: any) =>
            (p.live_channel && p.live_channel === channelRef) ||
            (p.live_channel && p.live_channel === streamId)
        );
        if (offlinePerformer) {
          setStream({
            id: channelRef || streamId,
            name: offlinePerformer.displayName || offlinePerformer.name || channelRef || streamId,
            description: offlinePerformer.bio || "",
            hlsUrl: "",
            isLive: false,
            thumbnailUrl: offlinePerformer.photoUrl || null,
          });
          setError(null);
          setStreamError(false);
          return;
        }

        if (streamPollRef.current) {
          clearInterval(streamPollRef.current);
          streamPollRef.current = null;
        }
        loadErrorRef.current = true;
        setError(t.live.streamNotFound);
        setStreamError(true);
      })
      .catch((err) => {
        if (streamPollRef.current) {
          clearInterval(streamPollRef.current);
          streamPollRef.current = null;
        }
        loadErrorRef.current = true;
        setError(err instanceof Error ? err.message : "Failed to load stream");
        setStreamError(true);
      });
  }, [streamId]);

  useEffect(() => {
    setLoading(true);
    loadStream().finally(() => {
      setLoading(false);
      // Only start polling if we didn't hit an error
      if (!loadErrorRef.current && !streamPollRef.current) {
        streamPollRef.current = setInterval(loadStream, 30000);
      }
    });
    return () => {
      if (streamPollRef.current) {
        clearInterval(streamPollRef.current);
        streamPollRef.current = null;
      }
    };
  }, [loadStream]);

  // Fallback poll: refresh viewer count from the streams endpoint every 30s
  // when Socket.IO is disconnected so the displayed count does not freeze.
  useEffect(() => {
    if (chatConnected || !streamId) return;
    const poll = () => {
      getLiveStreams()
        .then((data) => {
          const found = (data.streams || []).find((s) => s.id === streamId);
          if (found && typeof found.viewerCount === "number") {
            setPolledViewerCount(found.viewerCount);
          }
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [chatConnected, streamId]);

  // Fetch overlay config for this channel and subscribe to real-time updates
  useEffect(() => {
    if (!streamId) return;
    const channelRef = extractChannelRef(streamId);
    if (!channelRef) return;

    // Initial fetch
    getStreamOverlayPublic(channelRef)
      .then((res) => {
        if (res.overlay?.is_active) setOverlay(res.overlay);
      })
      .catch(() => {
        // Overlay is optional — silently ignore fetch failures
      });

    // Real-time updates via socket
    const socket = connectSocket();
    const handler = (data: StreamOverlay) => {
      if (data.channel_ref === channelRef) {
        setOverlay(data.is_active ? data : null);
      }
    };
    // overlay:config is pushed by the server on live:join; overlay:updated on admin changes
    socket.on("overlay:config", handler);
    socket.on("overlay:updated", handler);
    return () => {
      socket.off("overlay:config", handler);
      socket.off("overlay:updated", handler);
    };
  }, [streamId]);

  // Real-time ticket confirmation — server emits live:ticket:purchased after webhook settles
  useEffect(() => {
    if (!streamId || !user?.id) return;
    const socket = connectSocket();
    const onTicketPurchased = (data: { slotId: string; userId: string }) => {
      if (String(data.userId) === String(user.id) && data.slotId === streamId) {
        setTicketStatus((prev) => prev ? { ...prev, hasTicket: true } : null);
      }
    };
    socket.on("live:ticket:purchased", onTicketPurchased);
    return () => {
      socket.off("live:ticket:purchased", onTicketPurchased);
    };
  }, [streamId, user?.id]);

  // Live rules acknowledgment check — only for authenticated users
  useEffect(() => {
    if (!isAuthenticated) {
      // Unauthenticated users can watch; they'll be prompted to log in when they try to interact
      setRulesLoading(false);
      setRulesAcknowledged(true);
      return;
    }
    const channelRef = streamId ? extractChannelRef(streamId) : null;
    setRulesLoading(true);
    getLiveRulesStatus(channelRef)
      .then((data) => {
        if (data.success) {
          setRulesAcknowledged(data.acknowledged);
          setCreatorRules(data.creatorRules ?? null);
          setCreatorRulesName(data.creatorName ?? null);
        } else {
          // Unexpected API error — fail closed, show the rules modal
          setRulesAcknowledged(false);
        }
      })
      .catch(() => {
        // Network failure — fail closed, show the rules modal
        setRulesAcknowledged(false);
      })
      .finally(() => {
        setRulesLoading(false);
      });
  }, [isAuthenticated, user?.id, streamId]);

  const handleAcknowledgeRules = useCallback(async () => {
    try {
      await acknowledgeLiveRules();
      setRulesAcknowledged(true);
    } catch {
      // Server call failed — do not mark acknowledged; user must retry
      console.warn("[LiveRules] Failed to persist acknowledgment — will retry on next load");
    }
  }, []);

  // Mobile matches the new mockup, which has no rules-acknowledgment step — record
  // the same server-side acknowledgment silently instead of showing the modal.
  // Desktop is unaffected and still requires the explicit tap.
  useEffect(() => {
    if (rulesLoading || rulesAcknowledged) return;
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    handleAcknowledgeRules();
  }, [rulesLoading, rulesAcknowledged, handleAcknowledgeRules]);

  // ── Raid: drive countdown and auto-navigate when a raid event arrives ────────
  useEffect(() => {
    if (!raidEvent) {
      if (raidCountdownRef.current) {
        clearInterval(raidCountdownRef.current);
        raidCountdownRef.current = null;
      }
      setRaidCountdown(null);
      return;
    }
    setRaidCountdown(5);
    if (raidCountdownRef.current) clearInterval(raidCountdownRef.current);
    raidCountdownRef.current = setInterval(() => {
      setRaidCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (raidCountdownRef.current) {
            clearInterval(raidCountdownRef.current);
            raidCountdownRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (raidCountdownRef.current) {
        clearInterval(raidCountdownRef.current);
        raidCountdownRef.current = null;
      }
    };
  }, [raidEvent]);

  // Auto-navigate when countdown reaches 0
  useEffect(() => {
    if (raidCountdown !== 0 || !raidEvent) return;
    navigate(`/live/${encodeURIComponent(raidEvent.targetChannelRef)}`);
    dismissRaid();
  }, [raidCountdown, raidEvent, navigate, dismissRaid]);

  // Whether the current user owns this specific stream (not just any creator)
  const channelRef = streamId ? extractChannelRef(streamId) : null;
  // Strict channel ownership: only the user whose live_channel matches this stream
  const isChannelOwner = !!(user?.liveChannel && channelRef && user.liveChannel === channelRef);
  // Broad stream owner: includes admins — used for moderation powers (ban, HUD, health, raid)
  const isStreamOwner = isChannelOwner || !!(user && (user.role === 'admin' || user.role === 'superadmin'));

  // ── Entry gate: call /live/enter after rules ack, sets free-period key in Redis ──
  useEffect(() => {
    if (!isAuthenticated || !channelRef || !rulesAcknowledged) return;
    if (isStreamOwner) {
      entryGrantedRef.current = channelRef;
      setEntryGrantedTick(t => t + 1);
      setEntryChecked(true); setEntryAllowed(true); return;
    }
    enterLiveStream(channelRef)
      .then((data) => {
        if (data.success) {
          entryGrantedRef.current = channelRef;
          setEntryGrantedTick(t => t + 1);
          setEntryAllowed(true);
          setFreeMinutesLeft(15);
        } else {
          setEntryAllowed(false);
          setEntryError(data.error || "INSUFFICIENT_TOKENS");
        }
      })
      .catch(() => setEntryError("NETWORK_ERROR"))
      .finally(() => setEntryChecked(true));
  }, [isAuthenticated, channelRef, rulesAcknowledged, isStreamOwner]);

  // ── Heartbeat: deduct 1 Ru$h/min while watching as a non-owner viewer ────
  // Starts ONLY after /enter has completed for the current channelRef (entryGrantedRef
  // matches), so the freeUntil Redis key is guaranteed to be set before the first tick.
  // No immediate tick on mount — first charge happens at T+60s, not T+0s.
  // Server-side 55s dedup lock in tokenService prevents any double-charging even
  // if this effect re-runs due to stream.isLive flicker.
  useEffect(() => {
    if (!isAuthenticated || isChannelOwner || !channelRef || !stream?.isLive || !entryAllowed) {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      return;
    }
    // Guard: /enter must have completed for THIS channelRef before billing starts
    if (entryGrantedRef.current !== channelRef) {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      return;
    }
    const tick = () => {
      sendLiveHeartbeat(channelRef)
        .then((data) => {
          if (data.newBalance !== undefined) setTokenBalance(data.newBalance);
          if (data.freeMinutesLeft !== undefined) setFreeMinutesLeft(data.freeMinutesLeft);
        })
        .catch((err) => {
          if (err?.status === 402) {
            setOutOfTokens(true);
            if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
          }
        });
    };
    heartbeatRef.current = setInterval(tick, 60_000);
    return () => { if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; } };
  }, [isAuthenticated, isChannelOwner, channelRef, stream?.isLive, entryAllowed, entryGrantedTick]);

  // ── Ticket status fetch — runs after stream resolves, for authenticated users ──
  useEffect(() => {
    if (!isAuthenticated || !stream) return;
    const slotId = streamId;
    if (!slotId) return;
    // live_streams.id is UUID. Channel refs like "pnptv-<handle>" are never slots.
    // Skip the request entirely to avoid predictable 404s in production logs.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(slotId)) return;
    setTicketLoading(true);
    setTicketError(null);
    getSlotTicketStatus(slotId)
      .then((data) => {
        if (data.success) setTicketStatus(data);
      })
      .catch(() => {
        // Non-ticketed or non-slot stream — silently ignore
      })
      .finally(() => setTicketLoading(false));
  }, [isAuthenticated, streamId, stream]);

  // ── Health HUD: poll streams every 15s to detect offline ──────────────────
  useEffect(() => {
    if (!isStreamOwner || !stream?.isLive) {
      if (healthPollRef.current) { clearInterval(healthPollRef.current); healthPollRef.current = null; }
      return;
    }
    const poll = () => {
      getLiveStreams()
        .then((data) => {
          const channelRef = streamId ? extractChannelRef(streamId) : null;
          const found = (data.streams || []).some(
            (s) => s.id === streamId || (channelRef && s.id === channelRef)
          );
          setHealthOffline(!found);
        })
        .catch(() => {});
    };
    healthPollRef.current = setInterval(poll, 15_000);
    return () => {
      if (healthPollRef.current) { clearInterval(healthPollRef.current); healthPollRef.current = null; }
    };
  }, [isStreamOwner, stream?.isLive, streamId]);

  // Accumulate stats history (keep last 4 samples for HUD sparkline)
  const handlePlayerStats = useCallback((stats: LivePlayerStats) => {
    setStreamStats(stats);
    setStatsHistory((prev) => [...prev.slice(-3), stats]);
  }, []);

  // ── Ticket purchase handler ────────────────────────────────────────────────
  const handleBuyTicket = useCallback(async () => {
    if (!streamId) return;
    setTicketBuying(true);
    setTicketError(null);
    try {
      const result = await buySlotTicket(streamId, "tokens");

      if (!result.success) {
        setTicketError(result.error || "Purchase failed");
        return;
      }

      if (result.hasTicket) {
        setTicketStatus((prev) => prev ? { ...prev, hasTicket: true } : null);
        if (result.newBalance !== undefined) setTokenBalance(result.newBalance);
      }
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setTicketBuying(false);
    }
  }, [streamId]);

  // ── Host mode: load current hosted channel on mount (creator only) ─────────
  useEffect(() => {
    if (!isStreamOwner) return;
    getHostedChannel()
      .then((data) => {
        if (data.success) setHostedChannelRef(data.hosting);
      })
      .catch(() => {});
  }, [isStreamOwner]);

  // ── Host mode: resolve hosted stream info when hostedChannelRef changes ─────
  useEffect(() => {
    if (!hostedChannelRef) {
      setHostedStream(null);
      return;
    }
    getWebAppLiveStreams()
      .then((data) => {
        const target = (data.streams || []).find((s: LiveStreamWithHost) => s.id === hostedChannelRef);
        if (target) {
          setHostedStream(target);
        } else {
          setHostedStream({
            id: hostedChannelRef,
            name: hostedChannelRef.replace(/^pnptv-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            description: '',
            hlsUrl: `/api/proxy/live/master/${hostedChannelRef}.m3u8`,
            isLive: false,
          });
        }
      })
      .catch(() => {});
  }, [hostedChannelRef]);

  const handleOpenRaidPicker = useCallback(async () => {
    setShowRaidPicker(true);
    setRaidPickerLoading(true);
    setRaidError(null);
    try {
      const data = await getWebAppLiveStreams();
      const currentRef = streamId ? extractChannelRef(streamId) : null;
      const others = (data.streams || []).filter(
        (s: LiveStreamWithHost) => s.isLive && s.id !== streamId && s.id !== currentRef
      );
      setRaidTargetStreams(others);
    } catch {
      setRaidError('Failed to load live streams');
    } finally {
      setRaidPickerLoading(false);
    }
  }, [streamId]);

  const handleRaid = useCallback(
    async (targetRef: string) => {
      setShowRaidPicker(false);
      setRaidError(null);
      try {
        const result = await initiateRaid(targetRef);
        if (!result.success) {
          setRaidError(result.error || 'Raid failed');
        }
      } catch (err) {
        setRaidError(err instanceof Error ? err.message : 'Raid failed');
      }
    },
    [streamId]
  );

  const handleOpenHostPicker = useCallback(async () => {
    setShowHostPicker(true);
    setHostPickerLoading(true);
    setHostError(null);
    try {
      const data = await getWebAppLiveStreams();
      const currentRef = streamId ? extractChannelRef(streamId) : null;
      setHostTargetStreams((data.streams || []).filter(
        (s: LiveStreamWithHost) => s.id !== streamId && s.id !== currentRef
      ));
    } catch {
      setHostError('Failed to load streams');
    } finally {
      setHostPickerLoading(false);
    }
  }, [streamId]);

  const handleSetHost = useCallback(
    async (targetRef: string | null) => {
      setShowHostPicker(false);
      setHostError(null);
      try {
        const result = await setHostedChannel(targetRef);
        if (result.success) {
          setHostedChannelRef(result.hosting);
        } else {
          setHostError(result.error || 'Failed to set hosted channel');
        }
      } catch (err) {
        setHostError(err instanceof Error ? err.message : 'Failed to set hosted channel');
      }
    },
    []
  );

  // Load recent tips
  const loadTips = useCallback(() => {
    getRecentTips()
      .then((data) => setRecentTips((data.tips || []).slice(0, 5)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTips();
    const interval = setInterval(loadTips, 15000);
    return () => clearInterval(interval);
  }, [loadTips]);

  // Socket tip → recent tips
  useEffect(() => {
    if (!latestTip) return;
    const mapped: RecentTip = {
      id: latestTip.id,
      amount: latestTip.amount,
      user_username: latestTip.username,
      model_name: latestTip.performerName,
      created_at: latestTip.createdAt,
      payment_status: "completed",
    };
    setRecentTips((prev) => [mapped, ...prev.filter((t) => t.id !== mapped.id)].slice(0, 5));
  }, [latestTip]);

  // ── Tip goal: load on mount + sync from socket ─────────────────────────────
  useEffect(() => {
    const channelRef = streamId ? extractChannelRef(streamId) : null;
    if (!channelRef) return;
    getLiveGoal(channelRef)
      .then((res) => { if (res.goalAmount !== null) setTipGoal(res); })
      .catch(() => {});
  }, [streamId]);

  useEffect(() => {
    if (socketTipGoal) setTipGoal(socketTipGoal);
  }, [socketTipGoal]);

  // ── Tip menu: load when stream resolves ────────────────────────────────────
  useEffect(() => {
    if (!streamId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = stream as any;
    const performerId = s?.performerId || s?.userId || stream?.username || streamId;
    getTipMenu(String(performerId))
      .then((res) => setTipMenu(res.items || []))
      .catch(() => {});
  }, [streamId, stream?.username]);

  // ── Studio: load own tip menu when studio tab opens ───────────────────────
  useEffect(() => {
    if (!isChannelOwner || desktopTab !== "studio" || studioSubTab !== "tips") return;
    getMyTipMenu()
      .then((res) => {
        setMyTipMenuItems(res.items || []);
        if (tipGoal?.goalAmount != null) {
          setGoalAmountInput(String(tipGoal.goalAmount));
          setGoalLabelInput(tipGoal.goalLabel || "");
        }
      })
      .catch(() => {});
  }, [isStreamOwner, desktopTab, studioSubTab]);

  // ── Studio: poll viewer roster every 30s when viewers tab is active ────────
  useEffect(() => {
    if (!isChannelOwner || desktopTab !== "studio" || studioSubTab !== "viewers" || !channelRef) return;

    const fetchViewers = () => {
      setStudioViewersLoading(true);
      getStreamViewers(channelRef)
        .then((res) => setStudioViewers(res.viewers || []))
        .catch(() => {})
        .finally(() => setStudioViewersLoading(false));
    };
    fetchViewers();
    const interval = setInterval(fetchViewers, 30000);
    return () => clearInterval(interval);
  }, [isStreamOwner, desktopTab, studioSubTab, streamId]);

  // ── Call packages: load by channel ref when stream data is available ────────
  useEffect(() => {
    if (!streamId || !isAuthenticated) return;
    const channelRef = extractChannelRef(streamId);
    if (!channelRef) return;
    getCallPackagesByChannelRef(channelRef)
      .then((res) => {
        if (res.success && res.packages.length > 0) {
          setCallPackages(res.packages);
          setCallCreatorId(res.creatorId);
        }
      })
      .catch(() => {});
  }, [streamId, isAuthenticated]);

  // ── Leaderboard: fetch when panel opens or tab changes ─────────────────────
  useEffect(() => {
    const channelRef = streamId ? extractChannelRef(streamId) : null;
    if (!showLeaderboard || !channelRef) return;
    getTipLeaderboard(channelRef, leaderboardTab)
      .then((res) => setLeaderboardData((prev) => ({ ...prev, [leaderboardTab]: res.leaderboard || [] })))
      .catch(() => {});
  }, [showLeaderboard, leaderboardTab, streamId]);

  // ── VOD replay: fetch latest recording for all authenticated viewers when offline ──
  useEffect(() => {
    if (!stream || stream.isLive || !streamId || !user) return;
    const channelRef = extractChannelRef(streamId);
    if (!channelRef) return;
    if (isStreamOwner) {
      const creatorId = user.id?.toString() ?? '';
      if (!creatorId) return;
      getCreatorRecordings(creatorId)
        .then((res) => {
          const latest = (res.recordings || [])[0];
          if (latest?.manifestUrl) setReplayUrl(latest.manifestUrl);
        })
        .catch(() => {});
    } else {
      getStreamReplay(channelRef)
        .then((res) => {
          if (res.recording?.manifestUrl) setReplayUrl(res.recording.manifestUrl);
        })
        .catch(() => {});
    }
  }, [stream?.isLive, streamId, isStreamOwner, user?.id]);

  const handleTip = async (amount: number) => {
    if (!isAuthenticated) { login(); return; }

    // Re-entry guard against rapid double-clicks. Returns immediately if a
    // tip is already in flight; the visible button is also disabled via
    // `tipping` state but useState is async, so the synchronous ref is the
    // bulletproof gate.
    if (tippingRef.current) return;
    tippingRef.current = true;

    // Pre-flight balance check for token tips. Server still enforces this
    // (UPDATE WHERE balance_tokens >= amount), but failing on the server
    // shows the user a generic error toast — checking client-side lets us
    // give them the precise "you have X, need Y" message before the round-trip.
    if (tipPaymentTab === "tokens" && tokenBalance !== null && tokenBalance < amount) {
      setTipError(t.live.insufficientTokens(tokenBalance));
      tippingRef.current = false;
      return;
    }

    // Token tip — fire directly.
    setTipping(true);
    setTipSubmitting(true);
    setTipError(null);
    setTipSuccess(null);
    try {
      const tipResult = await sendTip(streamId || "", amount, undefined, "tokens");
      if (tipResult?.newBalance !== undefined) setTokenBalance(tipResult.newBalance);
      setTipSuccess(t.live.tipSuccess);
      if (tipSuccessTimerRef.current) clearTimeout(tipSuccessTimerRef.current);
      tipSuccessTimerRef.current = setTimeout(() => {
        setTipSuccess(null);
        tipSuccessTimerRef.current = null;
      }, 3000);
    } catch (err) {
      setTipError(err instanceof Error ? err.message : t.live.tipFailed);
    } finally {
      setTipping(false);
      setTipSubmitting(false);
      tippingRef.current = false;
    }
  };

  const handleBookCall = useCallback(async (pkg: LiveCallPackage) => {
    if (bookCallSubmitting) return;
    setBookCallSubmitting(true);
    setBookCallError(null);
    setBookCallSuccess(null);
    try {
      const result = await bookCallWithTokens({ packageId: pkg.id });
      if (result.newBalance !== undefined) setTokenBalance(result.newBalance);
      setShowBookCall(false);
      if (result.bookingId) {
        navigate(`/booking/${result.bookingId}`);
      } else if (result.creditId) {
        navigate(`/booking/${result.creditId}`);
      } else {
        setBookCallSuccess("Call booked! Check your bookings.");
        setTimeout(() => setBookCallSuccess(null), 4000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to book call";
      setBookCallError(msg);
    } finally {
      setBookCallSubmitting(false);
    }
  }, [bookCallSubmitting, navigate]);

  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const videoContainerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Chat collapsed by default on mobile (improvement #6)
  const [isChatCollapsed, setIsChatCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  // react-window List ref for programmatic scroll-to-bottom
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatListRef = useRef<any>(null);

  // ── Leaderboard: fetched from API when panel is opened ─────────────────────
  // (leaderboardData state is declared above near the showLeaderboard state)

  const isNearBottom = () => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (isNearBottom()) {
      const msgs = chatMessages.slice(-50);
      if (msgs.length > 0) {
        chatListRef.current?.scrollToRow({ index: msgs.length - 1 });
      }
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setHasNewMessages(false);
    } else {
      setHasNewMessages(true);
    }
  }, [chatMessages]);

  const scrollToBottom = () => {
    const msgs = chatMessages.slice(-50);
    if (msgs.length > 0) {
      chatListRef.current?.scrollToRow({ index: msgs.length - 1 });
    }
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessages(false);
  };

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = stream?.name ? `${stream.name} — PNPtv Live` : "PNPtv Live";
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled or share failed — do nothing
      }
      return;
    }
    // Clipboard fallback for desktop
    const copyToClipboard = async (text: string) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    };
    try {
      await copyToClipboard(url);
      setShareCopied(true);
      if (shareCopiedTimerRef.current) clearTimeout(shareCopiedTimerRef.current);
      shareCopiedTimerRef.current = setTimeout(() => {
        setShareCopied(false);
        shareCopiedTimerRef.current = null;
      }, 2000);
    } catch {
      // Clipboard unavailable — silently ignore
    }
  }, [stream?.name]);

  // ── F1/F2: send a reaction (client-side rate limit 10 taps/sec, batch flush) ─
  const handleReact = useCallback((kind: string) => {
    if (!isAuthenticated || !channelRef) return;
    // Client-side rate guard: max 10 taps per 1-second window
    reactTapCountRef.current += 1;
    if (reactTapCountRef.current > 10) return;
    if (!reactTapWindowRef.current) {
      reactTapWindowRef.current = setTimeout(() => {
        reactTapCountRef.current = 0;
        reactTapWindowRef.current = null;
      }, 1000);
    }
    // Animate locally immediately
    const id = Date.now() + Math.random();
    const x = 20 + Math.random() * 60;
    setFloatingReacts((prev) => [...prev.slice(-8), { id, kind, x }]);
    setTimeout(() => { setFloatingReacts((prev) => prev.filter((r) => r.id !== id)); }, 1800);
    if (kind === 'heart') setHeartCount((c) => c + 1);
    // Add to batch
    const existing = reactBatchRef.current.find((b) => b.kind === kind);
    if (existing) { existing.count += 1; }
    else { reactBatchRef.current.push({ kind, count: 1 }); }
    // Flush after 100ms idle
    if (reactFlushTimerRef.current) clearTimeout(reactFlushTimerRef.current);
    reactFlushTimerRef.current = setTimeout(() => {
      const batch = reactBatchRef.current.splice(0);
      reactFlushTimerRef.current = null;
      if (!channelRef || batch.length === 0) return;
      // Send one request per unique kind
      batch.forEach(({ kind: k }) => {
        postLiveReact(channelRef, k).catch(() => {});
      });
    }, 100);
  }, [isAuthenticated, channelRef]);

  const handleFullscreen = useCallback(() => {
    const el = videoContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Sync isFullscreen state with external fullscreenchange events
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  if (loading || rulesLoading) {
    return (
      <div className="page-container">
        <Skeleton className="w-full rounded-xl" style={{ aspectRatio: "16/9" }} />
        <Skeleton className="h-10 mt-3 rounded-lg" />
        <Skeleton className="h-40 mt-3 rounded-xl" />
      </div>
    );
  }

  // Token gate handled inline with blur overlay (see below)

  if (error || !stream) {
    return (
      <div className="page-container text-center py-20">
        <p className="text-pnp-textSecondary mb-4">{error || t.live.streamNotFound}</p>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => {
              setError(null);
              setStreamError(false);
              setLoading(true);
              loadStream().finally(() => setLoading(false));
            }}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #D4007A, #7B61FF)" }}
          >
            Try again
          </button>
          <button onClick={() => navigate("/live")} className="text-sm text-pnp-accent hover:underline">
            {t.live.backToLive}
          </button>
        </div>
      </div>
    );
  }

  // h-full, not h-[100dvh] — this page is nested inside Layout's <main>
  // (flex-1, already sized to the viewport minus header/bottom-nav), so
  // 100dvh would re-claim the whole device height and overshoot main's
  // actual box, pushing this page's own content off-screen.
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Helmet>
        <title>{stream.name} — PNPtv Live</title>
        <meta name="description" content={stream.description || `Watch ${stream.name} live on PNPtv`} />
      </Helmet>

      {/* Rules acknowledgment gate — desktop only; mobile auto-acknowledges (see effect above) to match the mockup */}
      {!rulesAcknowledged && !(typeof window !== "undefined" && window.innerWidth < 768) && (
        <LiveRulesModal
          onAcknowledge={handleAcknowledgeRules}
          creatorName={creatorRulesName}
          creatorRules={creatorRules}
        />
      )}

      {/* Entry gate, raid overlays and raid toasts — all wrapped so they stay
           visible when the browser is in native fullscreen (they'd otherwise
           be siblings of videoContainerRef and clipped by the FS element). */}
      <FullscreenPortal>
      {/* Entry gate — runs after rules ack; spinner while checking, wall if denied */}
      {rulesAcknowledged && !isStreamOwner && !entryChecked && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-pnp-background/90 backdrop-blur-sm">
          <span className="w-8 h-8 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {rulesAcknowledged && !isStreamOwner && entryChecked && !entryAllowed && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center overflow-hidden">
          {stream?.thumbnailUrl ? (
            <img
              src={stream.thumbnailUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110"
              style={{ filter: "blur(28px)" }}
              aria-hidden="true"
            />
          ) : (
            <div className="absolute inset-0 bg-pnp-background" />
          )}
          <div className="absolute inset-0 bg-black/65" />
          <InsufficientTokensWall
            current={entryError === "INSUFFICIENT_TOKENS" ? (tokenBalance ?? undefined) : undefined}
            streamName={stream?.name}
            onBuyTokens={() => setShowTopUp(true)}
          />
        </div>
      )}

      {/* ── Raid notification overlay ─────────────────────────────────────────
           Shown to all viewers when the streamer initiates a raid.
           Counts down 5s then auto-redirects; viewer can dismiss to stay. */}
      {raidEvent && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Raid in progress"
        >
          <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-pnp-surface border border-pnp-border shadow-2xl overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-pnp-accent via-purple-500 to-pink-500 animate-pulse" />
            <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
              <div className="text-4xl" aria-hidden="true">🎉</div>
              <div>
                <p className="text-base font-bold text-pnp-textPrimary">Raiding!</p>
                <p className="text-sm text-pnp-textSecondary mt-1">
                  Redirecting to{" "}
                  <span className="text-pnp-accent font-semibold">{raidEvent.targetName}</span>
                </p>
              </div>
              <div className="relative flex items-center justify-center w-16 h-16">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-pnp-border" />
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                    className="text-pnp-accent transition-all duration-1000"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - (raidCountdown ?? 5) / 5)}`}
                  />
                </svg>
                <span className="text-2xl font-bold text-pnp-textPrimary tabular-nums">
                  {raidCountdown ?? 5}
                </span>
              </div>
              <button
                onClick={dismissRaid}
                className="px-5 py-2 rounded-lg bg-pnp-surface border border-pnp-border text-xs font-semibold text-pnp-textSecondary hover:text-pnp-textPrimary hover:border-pnp-accent/40 transition-colors active:scale-95"
              >
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Incoming raid approval modal (stream owner only) ─────────────────
           Shown when another streamer wants to raid this channel.
           Owner can Accept or Decline within 90s. */}
      {isStreamOwner && raidRequest && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Incoming raid request"
        >
          <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-pnp-surface border border-pnp-border shadow-2xl overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-pulse" />
            <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
              <div className="text-4xl" aria-hidden="true">⚡</div>
              <div>
                <p className="text-base font-bold text-pnp-textPrimary">Incoming Raid!</p>
                <p className="text-sm text-pnp-textSecondary mt-1">
                  <span className="text-pnp-accent font-semibold">{raidRequest.sourceName}</span>
                  {" "}wants to raid your stream
                  {raidRequest.viewerCount > 0 && (
                    <span> with <span className="font-semibold text-pnp-textPrimary">{raidRequest.viewerCount}</span> viewer{raidRequest.viewerCount !== 1 ? "s" : ""}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => respondToRaid(raidRequest.raidId, true)}
                  className="flex-1 py-2.5 rounded-xl bg-pnp-accent text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
                >
                  Accept
                </button>
                <button
                  onClick={() => respondToRaid(raidRequest.raidId, false)}
                  className="flex-1 py-2.5 rounded-xl bg-pnp-surface border border-pnp-border text-sm font-semibold text-pnp-textSecondary hover:text-pnp-textPrimary hover:border-pnp-accent/40 active:scale-95 transition-all"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Raid declined toast (raider sees this when target declines) ───── */}
      {raidDeclined && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-3 px-5 py-3 rounded-2xl bg-pnp-surface border border-pnp-border shadow-xl text-sm text-pnp-textSecondary max-w-xs w-full">
          <span className="text-base" aria-hidden="true">🚫</span>
          <span>
            <span className="font-semibold text-pnp-textPrimary">{raidDeclined.targetName}</span> declined your raid.
          </span>
          <button
            onClick={clearRaidStatus}
            className="ml-auto text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Raid expired toast (raider sees this when target never responded) */}
      {raidExpired && !raidDeclined && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-3 px-5 py-3 rounded-2xl bg-pnp-surface border border-pnp-border shadow-xl text-sm text-pnp-textSecondary max-w-xs w-full">
          <span className="text-base" aria-hidden="true">⏱</span>
          <span>Raid request expired — no response from the target streamer.</span>
          <button
            onClick={clearRaidStatus}
            className="ml-auto text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      </FullscreenPortal>

      {/* ── Header bar — desktop only (mobile uses the full-bleed video overlay below),
           with the streamer identity block from the design pass ── */}
      <div className="stream-header-bar hidden xl:flex flex-shrink-0 items-center gap-3 px-4 py-2 border-b border-pnp-border">
        <button onClick={() => navigate("/live")} aria-label={t.live.backToLive} className="flex-shrink-0 text-pnp-textSecondary hover:text-pnp-accent transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        {/* Streamer identity block */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="relative flex-shrink-0 rounded-full overflow-hidden"
            style={{
              width: 34,
              height: 34,
              boxShadow: "0 0 0 2px #121212, 0 0 0 3px #D4007A",
              background: "#1e1e1e",
            }}
          >
            {stream.thumbnailUrl ? (
              <img src={stream.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}>
                {(stream.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate leading-tight">{stream.name}</p>
            <p className="text-[10px] text-pnp-textSecondary leading-tight mt-0.5 flex items-center gap-2">
              {stream.isLive && (
                <span className="flex items-center gap-1">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {(stream.viewerCount ?? 0).toLocaleString()} watching
                </span>
              )}
              {stream.isLive && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-white text-[9px] font-bold"
                  style={{ background: "#D4007A" }}
                >
                  <span className="w-1 h-1 rounded-full bg-white animate-pulse" aria-hidden="true" />
                  LIVE
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Clipboard copy confirmation toast */}
          {shareCopied && (
            <span
              className="text-[10px] text-pnp-textSecondary bg-pnp-surface border border-pnp-border px-2 py-0.5 rounded-full"
              aria-live="polite"
            >
              Copied!
            </span>
          )}
          <button
            onClick={handleShare}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-pnp-surface border border-pnp-border text-pnp-textSecondary hover:text-pnp-textPrimary hover:border-pnp-accent/40 transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
            aria-label="Share stream"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
          {/* Theater mode button — only visible on desktop (improvement #7) */}
          <button
            onClick={() => setIsTheaterMode(!isTheaterMode)}
            className="hidden xl:flex items-center justify-center w-8 h-8 rounded-full bg-pnp-surface border border-pnp-border text-pnp-textSecondary hover:text-pnp-textPrimary hover:border-pnp-accent/40 transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
            aria-label={isTheaterMode ? "Exit theater mode" : "Enter theater mode"}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="6" width="18" height="12" rx="1.5" strokeDasharray={isTheaterMode ? "" : "4 2"} />
              {isTheaterMode ? (
                <path strokeLinecap="round" d="M10 9l-2 2 2 2m4-4l2 2-2 2" />
              ) : (
                <path strokeLinecap="round" d="M8 12h8" />
              )}
            </svg>
          </button>
          {/* Raid button — only visible to the stream owner while live */}
          {isStreamOwner && stream.isLive && (
            <div className="relative">
              <button
                onClick={handleOpenRaidPicker}
                className="flex items-center gap-1 h-8 px-2.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 transition-colors active:scale-95 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                aria-label="Raid another stream"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                Raid
              </button>
              {showRaidPicker && (
                <div className="absolute right-0 top-10 z-50 w-56 rounded-xl bg-pnp-surface border border-pnp-border shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-pnp-border flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-pnp-textPrimary">Raid a live stream</span>
                    <button onClick={() => setShowRaidPicker(false)} className="text-pnp-textSecondary hover:text-pnp-textPrimary text-xs" aria-label="Close">✕</button>
                  </div>
                  {raidPickerLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <span className="w-5 h-5 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : raidTargetStreams.length === 0 ? (
                    <p className="text-[11px] text-pnp-textSecondary text-center py-5 px-3">No other streams are live right now.</p>
                  ) : (
                    <ul className="max-h-48 overflow-y-auto divide-y divide-pnp-border">
                      {raidTargetStreams.map((s) => (
                        <li key={s.id}>
                          <button onClick={() => handleRaid(s.id)} className="w-full text-left px-3 py-2.5 hover:bg-pnp-surfaceHover transition-colors group">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                              <span className="text-xs font-medium text-pnp-textPrimary group-hover:text-pnp-accent truncate">{s.name}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Main content: left column + right panel ───────────────────────── */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">

        {/* ── LEFT COLUMN ──────────────────────────────────────────────────── */}
        <div className="flex flex-col xl:flex-1 overflow-hidden">

          {/* Video Player — fixed/sticky, never scrolls. Full-bleed on mobile. */}
          <div ref={videoContainerRef} className="relative flex-1 min-h-0 xl:flex-shrink-0 bg-black">
        {/* ── Paywall overlay — shown when slot is ticketed and viewer has no ticket ── */}
        {ticketStatus?.isTicketed && !ticketStatus.hasTicket && !ticketLoading ? (
          <div className="relative aspect-video rounded-xl bg-pnp-surface border border-pnp-border overflow-hidden flex items-center justify-center">
            {/* Blurred thumbnail as background */}
            {stream.thumbnailUrl && (
              <img
                src={stream.thumbnailUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm scale-105"
                aria-hidden="true"
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-4 px-6 py-8 text-center max-w-xs">
              <div className="w-12 h-12 rounded-full bg-pnp-accent/20 border border-pnp-accent/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-pnp-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-pnp-textPrimary">{stream.name}</p>
                <p className="text-[11px] text-pnp-textSecondary mt-1">This is a ticketed show</p>
              </div>
              {isCreatorPayLocked(stream.username) ? (
                <p className="text-[10px] text-pnp-textSecondary text-center py-1">🔒 Launches June 1st</p>
              ) : (!ticketStatus.priceTokens && !ticketStatus.priceUsd) ? (
                <p className="text-[10px] text-pnp-textSecondary">
                  Tickets unavailable — contact support
                </p>
              ) : (
                <div className="flex flex-col gap-2 w-full">
                  {ticketError && (
                    <p className="text-[10px] text-red-400">{ticketError}</p>
                  )}
                  {ticketStatus.priceTokens && (
                    <button
                      onClick={() => handleBuyTicket()}
                      disabled={ticketBuying}
                      className="w-full px-4 py-2.5 rounded-lg btn-gradient text-white text-xs font-bold disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      {ticketBuying && <span className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                      Buy for {ticketStatus.priceTokens} Ru$h
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative h-full">
            <LivePlayer
              src={stream.hlsUrl}
              // No `title` — Stream.tsx already shows the name itself (the
              // mobile top-scrim above, and the desktop bottom-overlay below);
              // LivePlayer's own built-in title overlay would just duplicate
              // it and, now that this fills the full height on mobile, collide
              // with the floating chat/input UI anchored to the same edge.
              poster={stream.thumbnailUrl || undefined}
              overlay={overlay}
              onStats={isStreamOwner ? handlePlayerStats : undefined}
              // No watermark on mobile — the new mobile design matches the mockup,
              // which has none. Desktop keeps the anti-piracy watermark unchanged.
              viewerUsername={
                typeof window !== "undefined" && window.innerWidth < 768
                  ? undefined
                  : (user?.username ?? user?.firstName ?? undefined)
              }
              className="!h-full !aspect-auto !rounded-none xl:!aspect-video xl:!h-auto xl:!rounded-xl"
            />
          </div>
        )}

        {/* ── MOBILE overlay chrome — full-bleed video UI (mockup: Live Stream Player) ── */}
        {/* F5: shown on mobile always AND in fullscreen on any viewport — z-index 30 in FS so controls float above player */}
        <div className={`absolute inset-0 flex flex-col pointer-events-none ${isFullscreen ? "z-30" : "xl:hidden z-10"}`}>
          {/* F3 — Add tokens chip (top-right, visible when authenticated) */}
          {isAuthenticated && (
            <div className="pointer-events-auto absolute top-3.5 right-12 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold text-white"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <span className="tabular-nums">{tokenBalance ?? "—"}</span>
              <button
                onClick={() => setShowTopUp(true)}
                aria-label="Add Ru$h"
                className="ml-1 text-pnp-accent font-bold hover:text-white transition-colors"
              >
                +Add
              </button>
            </div>
          )}

          {/* F6 — Kebab menu (top-right corner) */}
          <div ref={kebabRef} className="pointer-events-auto absolute top-3 right-3 z-20">
            <button
              onClick={() => setShowKebab((v) => !v)}
              aria-label="More options"
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-base font-bold"
              style={{ background: "rgba(0,0,0,0.50)", backdropFilter: "blur(4px)" }}
            >
              ⋮
            </button>
            {showKebab && (
              <div className="absolute right-0 top-9 w-44 rounded-xl overflow-hidden shadow-2xl"
                style={{ background: "rgba(18,18,28,0.95)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
              >
                <button
                  onClick={() => { setShowLeaderboard((v) => !v); setShowKebab(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] text-white/90 hover:bg-white/10 transition-colors text-left"
                >
                  <span>🏆</span> Leaderboard
                </button>
                <button
                  onClick={() => { handleShare(); setShowKebab(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] text-white/90 hover:bg-white/10 transition-colors text-left"
                >
                  <span>🔗</span> {shareCopied ? "Copied!" : "Share stream"}
                </button>
                <button
                  onClick={() => { alert("Report: coming soon"); setShowKebab(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] text-white/60 hover:bg-white/10 transition-colors text-left"
                >
                  <span>🚩</span> Report stream
                </button>
              </div>
            )}
          </div>

          {/* Top scrim header: avatar, name, viewer count, LIVE badge, close */}
          <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 pt-3.5 pb-7 bg-gradient-to-b from-black/70 via-black/25 to-transparent">
            <img
              src={stream.thumbnailUrl || "/default-performer.svg"}
              alt=""
              className="w-[34px] h-[34px] rounded-full object-cover flex-shrink-0"
              style={{ boxShadow: "0 0 0 2px #000, 0 0 0 4px #D4007A" }}
              onError={(e) => { (e.target as HTMLImageElement).src = "/default-performer.svg"; }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate drop-shadow-sm">{stream.name}</p>
              {viewerCount > 0 && (
                <p className="text-[11px] text-white/80 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                  </svg>
                  {viewerCount} watching
                </p>
              )}
            </div>
            {stream.isLive && (
              <Badge variant="accent" className="flex-shrink-0 flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
                LIVE
              </Badge>
            )}
            <button
              onClick={() => navigate("/live")}
              aria-label="Close"
              className="flex-shrink-0 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white active:scale-95 transition-transform"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Billing status pill — compact mobile equivalent of the desktop banner below the video */}
          {!isStreamOwner && entryAllowed && stream?.isLive && (
            <div className="-mt-4 px-3.5 flex justify-center">
              {freeMinutesLeft !== null && freeMinutesLeft > 0 ? (
                <span className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/20 border border-green-500/40 text-green-300 backdrop-blur-sm">
                  Gratis: {freeMinutesLeft} min restantes
                </span>
              ) : tokenBalance !== null && tokenBalance < 10 ? (
                <span className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 border border-red-500/40 text-red-300 backdrop-blur-sm animate-pulse">
                  Poco Ru$h — recarga pronto
                </span>
              ) : (
                <span className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-300 backdrop-blur-sm">
                  1 Ru$h/min{tokenBalance !== null ? ` · ${tokenBalance} Ru$h` : ""}
                </span>
              )}
            </div>
          )}

          {/* Tip goal bar — floats directly under the header, matches mockup's amber label + gradient fill */}
          {tipGoal && tipGoal.goalAmount && !(ticketStatus?.isTicketed && !ticketStatus.hasTicket) && (
            <div className="px-3.5 mt-2">
              <div className="flex items-center justify-between mb-1 text-[10px]">
                <span className="font-bold flex items-center gap-1" style={{ color: "#E69138" }}>
                  🎯 {tipGoal.goalLabel || "Tip goal"}
                </span>
                <span className="text-white/85">
                  {Math.round(tipGoal.progress)} / {Math.round(tipGoal.goalAmount)}
                </span>
              </div>
              <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((tipGoal.progress / tipGoal.goalAmount) * 100))}%`,
                    background: tipGoal.completed ? "#22c55e" : "linear-gradient(135deg,#D4007A,#E69138)",
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex-1" />

          {/* Floating chat stack, bottom-left over the video */}
          {!(ticketStatus?.isTicketed && !ticketStatus.hasTicket) && (chatMessages.length > 0 || tipAlert) && (
            <div className="px-3 mb-2 flex flex-col gap-1.5 max-w-[78%]">
              {chatMessages.slice(-6).map((msg) => (
                msg.isHype ? (
                  <div
                    key={msg.id}
                    className="pointer-events-auto flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 w-fit max-w-full"
                    style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.55), rgba(212,0,122,0.35))", border: "1px solid rgba(139,92,246,0.4)" }}
                  >
                    <span className="font-bold flex-shrink-0" style={{ color: "#c4b5fd" }}>PNPtv</span>
                    <span className="min-w-0 break-words" style={{ color: "#f3e8ff" }}>{msg.content}</span>
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    className="pointer-events-auto flex items-center gap-1 text-xs text-white rounded-lg px-2.5 py-1.5 w-fit max-w-full"
                    style={{ background: "rgba(0,0,0,0.42)" }}
                  >
                    <span className="min-w-0 break-words">
                      <span className="font-semibold" style={{ color: "#E69138" }}>@{msg.username}: </span>
                      {msg.content}
                    </span>
                    {isStreamOwner && msg.userId && (
                      <button
                        onClick={() => handleBanUser(msg.userId!)}
                        className="flex-shrink-0 text-white/40 hover:text-red-400 transition-colors"
                        title="Ban from chat"
                        aria-label="Ban from chat"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              ))}
              {tipAlert && (
                <div
                  className="pointer-events-auto text-xs text-white rounded-lg px-2.5 py-1.5 w-fit max-w-full font-semibold"
                  style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.6), rgba(230,145,56,0.5))", boxShadow: "0 0 0 1px rgba(230,145,56,0.55)" }}
                >
                  🎁 {tipAlert.username}: {tipAlert.amount} Ru$h
                </div>
              )}
            </div>
          )}

          {/* ── F1+F2: Floating reaction animations ───────────────────────── */}
          {floatingReacts.map((r) => (
            <div
              key={r.id}
              className="pointer-events-none absolute text-2xl animate-float-react"
              style={{
                bottom: "calc(env(safe-area-inset-bottom,0px) + 120px)",
                right: `${r.x}%`,
                animation: "floatReact 1.8s ease-out forwards",
              }}
            >
              {r.kind === "heart" ? "❤️" : r.kind}
            </div>
          ))}

          {/* Right-side floating action rail — F1 heart (interactive) + F2 emoji rail + ✨ Tip */}
          {!(ticketStatus?.isTicketed && !ticketStatus.hasTicket) && (
            <div
              className="pointer-events-auto absolute right-3 flex flex-col items-center gap-3"
              style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 76px)" }}
            >
              {/* F1 — Heart tap button */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={() => handleReact("heart")}
                  aria-label="Send heart reaction"
                  className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-white active:scale-110 transition-transform"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21s-6.7-4.35-9.3-8.28C.86 10.06 1.6 6.66 4.36 5.2 6.6 4 9.3 4.7 12 7.3 14.7 4.7 17.4 4 19.64 5.2c2.76 1.46 3.5 4.86 1.66 7.52C18.7 16.65 12 21 12 21z" />
                  </svg>
                </button>
                <span className="text-[10px] text-white font-medium tabular-nums">
                  {heartCount > 0 ? (heartCount >= 1000 ? `${(heartCount / 1000).toFixed(1)}k` : heartCount) : (viewerCount >= 1000 ? `${(viewerCount / 1000).toFixed(1)}k` : viewerCount) || ""}
                </span>
              </div>

              {/* F2 — Emoji reaction rail */}
              {(["🔥", "💦", "😈", "💨"] as const).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  aria-label={`React with ${emoji}`}
                  className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-lg active:scale-110 transition-transform"
                  style={{ background: "rgba(255,255,255,0.12)" }}
                >
                  {emoji}
                </button>
              ))}

              {/* ✨ Tip button */}
              <button
                onClick={() => setShowTipSheet(true)}
                aria-label="Tip and more"
                className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white text-lg shadow-lg active:scale-95 transition-transform"
                style={{ backgroundImage: "linear-gradient(135deg,#D4007A,#E69138)" }}
              >
                ✨
              </button>
            </div>
          )}

          {/* F7 — Fullscreen quick-tip bar (authenticated viewers only, fullscreen only) */}
          {isFullscreen && isAuthenticated && !(ticketStatus?.isTicketed && !ticketStatus.hasTicket) && stream.isLive && (
            <div className="pointer-events-auto flex items-center justify-center gap-2 px-3 pb-1">
              {[10, 50, 100].map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleTip(amt)}
                  disabled={tipping}
                  aria-label={`Tip ${amt} Ru$h`}
                  className="flex-1 max-w-[80px] py-2 rounded-xl text-xs font-bold text-white active:scale-95 transition-transform disabled:opacity-50"
                  style={{ backgroundImage: "linear-gradient(135deg,#D4007A,#E69138)" }}
                >
                  Tip {amt}
                </button>
              ))}
            </div>
          )}

          {/* Bottom row: message input + Send */}
          {!(ticketStatus?.isTicketed && !ticketStatus.hasTicket) && (
            <div className="pointer-events-auto flex items-end gap-2 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
              <div className="flex-1 min-w-0">
                {isAuthenticated ? (
                  chatBanned ? (
                    <p className="text-[11px] text-red-300 rounded-full px-3 py-2.5 text-center" style={{ background: "rgba(0,0,0,0.4)" }}>
                      You are banned from this stream's chat.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitChat(); } }}
                        placeholder="Say something…"
                        aria-label="Type a chat message"
                        maxLength={500}
                        className="flex-1 min-w-0 h-10 rounded-full px-3.5 text-xs text-white placeholder-white/60 focus:outline-none"
                        style={{ background: "rgba(255,255,255,0.14)" }}
                      />
                      <button
                        onClick={submitChat}
                        disabled={!chatInput.trim()}
                        className="flex-shrink-0 h-10 px-4 rounded-full text-xs font-bold text-white btn-gradient disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    onClick={login}
                    className="w-full h-10 rounded-full text-xs font-semibold text-white flex items-center px-3.5"
                    style={{ background: "rgba(255,255,255,0.14)" }}
                  >
                    {t.live.logInToChat}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Stream health HUD — creator-only, desktop, top-left of video ─── */}
        {isStreamOwner && stream.isLive && !(ticketStatus?.isTicketed && !ticketStatus.hasTicket) && (
          <div className="hidden xl:flex absolute top-3 left-3 z-30 flex-col items-start">
            <button
              onClick={() => setHudExpanded((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border backdrop-blur-sm transition-colors ${
                healthOffline
                  ? "bg-red-500/20 border-red-500/40 text-red-400"
                  : streamStats?.bufferStall
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                  : "bg-black/60 border-white/20 text-white/80"
              }`}
              aria-label="Stream health"
            >
              {/* Status dot */}
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                healthOffline ? "bg-red-500" : streamStats?.bufferStall ? "bg-amber-400" : "bg-green-500"
              }`} />
              {streamStats ? `${streamStats.bitrate}kbps` : "HUD"}
              <svg
                className={`w-2.5 h-2.5 transition-transform ${hudExpanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {hudExpanded && (
              <div className="mt-1 w-48 rounded-xl bg-black/80 border border-white/15 backdrop-blur-sm shadow-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10">
                  <span className="text-[10px] font-bold text-white">Stream Health</span>
                </div>
                <div className="px-3 py-2 space-y-1.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-white/50">Bitrate</span>
                    <span className={`font-mono font-bold ${streamStats && streamStats.bitrate < 500 ? "text-red-400" : "text-green-400"}`}>
                      {streamStats ? `${streamStats.bitrate} kbps` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Dropped frames</span>
                    <span className={`font-mono font-bold ${streamStats && streamStats.droppedFrames > 30 ? "text-amber-400" : "text-white/80"}`}>
                      {streamStats ? streamStats.droppedFrames : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Buffer</span>
                    <span className={`font-bold ${healthOffline ? "text-red-400" : streamStats?.bufferStall ? "text-amber-400" : "text-green-400"}`}>
                      {healthOffline ? "OFFLINE" : streamStats?.bufferStall ? "STALLED" : "OK"}
                    </span>
                  </div>
                  {/* Last-60s mini history */}
                  {statsHistory.length > 1 && (
                    <div className="pt-1 border-t border-white/10">
                      <p className="text-[9px] text-white/40 mb-1">Last {statsHistory.length} samples</p>
                      <div className="flex items-end gap-0.5 h-6">
                        {statsHistory.map((s, i) => {
                          const pct = Math.min(100, (s.bitrate / 5000) * 100);
                          return (
                            <div
                              key={i}
                              className={`flex-1 rounded-sm ${s.bufferStall ? "bg-amber-400" : "bg-green-500"}`}
                              style={{ height: `${Math.max(8, pct)}%` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {streamError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30 rounded-xl">
            <div className="text-center">
              <p className="text-white text-sm font-medium mb-3">Stream failed to load</p>
              <button
                onClick={() => {
                  setStreamError(false);
                  setLoading(true);
                  loadStream().finally(() => setLoading(false));
                }}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold text-white btn-gradient"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {tipAlert && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-pnp-accent text-white text-xs font-bold shadow-lg animate-bounce pointer-events-none">
            {tipAlert.message || `${tipAlert.username} tipped ${tipAlert.amount} Ru$h`}
          </div>
        )}

        {/* Mobile fullscreen toggle button (improvement #6) */}
        <button
          onClick={handleFullscreen}
          className="sm:hidden absolute bottom-14 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 transition-colors active:scale-95"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25M9 15H4.5M9 15v4.5M9 15l-5.25 5.25" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
        {/* Overlay — desktop only; mobile shows this info in the top scrim header instead */}
        <div className="hidden xl:block absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-10">
          <div className="flex items-center gap-2 flex-wrap">
            {stream.isLive && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-white">LIVE</span>
              </span>
            )}
            {viewerCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-white/70">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                </svg>
                {viewerCount} watching
              </span>
            )}
            {/* Leaderboard toggle — desktop only */}
            <button
              onClick={() => setShowLeaderboard((v) => !v)}
              className="hidden xl:flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-xs"
              aria-label="Toggle tip leaderboard"
              title="Tip leaderboard"
            >
              🏆
            </button>
            <span className="text-sm text-white font-medium truncate max-w-[200px]">{stream.name}</span>
          </div>
          {stream.description && (
            <p className="text-xs text-white/60 mt-1">{stream.description}</p>
          )}
          {stream.tags && stream.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {stream.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded-full text-[9px] font-medium text-white/70 border border-white/20"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  {(t.live[tag as keyof typeof t.live] as string) || tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tip Leaderboard overlay — desktop only, toggled by trophy button.
             Portaled + fixed so it stays visible when the browser is in native
             fullscreen (the sheet would otherwise fall outside videoContainerRef). */}
        <FullscreenPortal>
        {showLeaderboard && (
          <div className="hidden xl:block fixed top-3 right-3 z-[80] w-52 rounded-xl bg-black/80 border border-white/10 backdrop-blur-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <span className="text-[11px] font-bold text-white">Tip Leaderboard</span>
              <button onClick={() => setShowLeaderboard(false)} className="text-white/50 hover:text-white text-xs" aria-label="Close leaderboard">✕</button>
            </div>
            <div className="flex border-b border-white/10">
              {(["today", "week"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setLeaderboardTab(tab)}
                  className={`flex-1 py-1.5 text-[10px] font-semibold transition-colors ${leaderboardTab === tab ? "text-pnp-accent bg-white/5" : "text-white/50 hover:text-white/80"}`}
                >
                  {tab === "today" ? "Today" : "This Week"}
                </button>
              ))}
            </div>
            <div className="px-3 py-2 space-y-2">
              {leaderboardData[leaderboardTab].length === 0 ? (
                <p className="text-[10px] text-white/40 text-center py-2">No tips yet — be the first.</p>
              ) : (
                leaderboardData[leaderboardTab].map((entry, i) => (
                  <div key={entry.username} className="flex items-center gap-2">
                    <span className={`w-4 text-[10px] font-bold tabular-nums text-right flex-shrink-0 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/40"}`}>
                      {i + 1}
                    </span>
                    <div className="w-5 h-5 rounded-full bg-pnp-accent/30 flex items-center justify-center flex-shrink-0 text-[8px] font-bold text-white uppercase">
                      {entry.username.slice(0, 2)}
                    </div>
                    <span className="flex-1 text-[10px] text-white/80 truncate">@{entry.username}</span>
                    <span className="text-[10px] font-bold text-pnp-accent flex-shrink-0">{entry.total}F</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        </FullscreenPortal>
      </div>

          {/* ── Billing status banner — desktop; mobile shows a compact pill in the video overlay ── */}
          {!isStreamOwner && entryAllowed && stream?.isLive && (
            <div className="hidden xl:flex flex-shrink-0 px-4 py-1.5 items-center justify-center">
              {freeMinutesLeft !== null && freeMinutesLeft > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-green-500/15 border border-green-500/30 text-green-400">
                  Gratis: {freeMinutesLeft} min restantes
                </span>
              ) : tokenBalance !== null && tokenBalance < 10 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-red-500/15 border border-red-500/30 text-red-400 animate-pulse">
                  Poco Ru$h — recarga pronto
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-400">
                  1 Ru$h/min{tokenBalance !== null ? ` · ${tokenBalance} Ru$h` : ""}
                </span>
              )}
            </div>
          )}

          {/* ── Tip goal progress bar — desktop (amber label, brand-gradient fill);
               mobile shows it floated over the video ── */}
          {tipGoal && tipGoal.goalAmount && (
            <div className="hidden xl:block flex-shrink-0 px-4 py-2 bg-pnp-surface border-b border-pnp-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold truncate flex items-center gap-1" style={{ color: "#E69138" }}>
                  <span aria-hidden="true">🎯</span> {tipGoal.goalLabel || "Goal"}
                </span>
                <span className="text-xs text-pnp-textSecondary flex-shrink-0 ml-2 tabular-nums">
                  {Math.round(tipGoal.progress).toLocaleString()} / {Math.round(tipGoal.goalAmount).toLocaleString()} {t.live.tokens}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.14)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((tipGoal.progress / tipGoal.goalAmount) * 100))}%`,
                    background: tipGoal.completed ? "#34C759" : "linear-gradient(135deg,#D4007A,#E69138)",
                  }}
                />
              </div>
              {tipGoal.completed && (
                <p className="text-[10px] text-green-400 font-semibold mt-1 text-center">Goal reached!</p>
              )}
            </div>
          )}

          {/* ── Scrollable area below video (left column) ─────────────────────
               md:flex-1, not flex-1 — on mobile the video wrapper above is the
               only flex-1 sibling in this column (full-bleed); this area now
               only holds owner-only panels / offline states and should size to
               its own content, not compete with the video for equal flex space. */}
          <div className="xl:flex-1 overflow-y-auto">

            {/* ── VOD replay — shown when stream is offline and a recording exists ── */}
            {!stream.isLive && replayUrl && (
              <div className="space-y-2 px-4 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-pnp-textSecondary uppercase tracking-wider">Past stream replay</span>
                </div>
                <LivePlayer
                  src={replayUrl}
                  title={stream.name}
                  poster={stream.thumbnailUrl || undefined}
                  viewerUsername={user?.username ?? user?.firstName ?? undefined}
                />
              </div>
            )}

            <div className="space-y-3 px-4 py-3">
              {/* ── Stream health panel — owner-only, shows RTMP signal status ─── */}
              {isStreamOwner && streamId && (
                <StreamHealthPanel streamId={streamId} />
              )}

              {/* ── Host mode banner — shown when offline but hosting another channel ── */}
              {!stream.isLive && hostedStream && (
                <div className="rounded-xl border border-pnp-accent/30 bg-pnp-accent/5 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-pnp-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-pnp-textPrimary">
                        Hosting <span className="text-pnp-accent">{hostedStream.name}</span>
                      </p>
                      {!hostedStream.isLive && (
                        <p className="text-[10px] text-pnp-textSecondary">Hosted stream is currently offline</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/live/${encodeURIComponent(hostedStream.id)}`)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg btn-gradient text-white text-[10px] font-semibold active:scale-95"
                  >
                    Watch
                  </button>
                </div>
              )}

              {/* ── Offline streamer controls — Host mode selector ─────────────── */}
              {isStreamOwner && stream && !stream.isLive && (
                <div className="rounded-xl border border-pnp-border bg-pnp-surface px-4 py-3 space-y-3">
                  <p className="text-[11px] font-semibold text-pnp-textPrimary">Streamer Controls</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-pnp-textPrimary">Host Mode</p>
                      <p className="text-[10px] text-pnp-textSecondary">
                        {hostedChannelRef
                          ? `Hosting: ${hostedStream?.name || hostedChannelRef}`
                          : 'Show another stream while offline'}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {hostedChannelRef && (
                        <button
                          onClick={() => handleSetHost(null)}
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-pnp-border text-pnp-textSecondary hover:text-red-400 hover:border-red-400/40 transition-colors active:scale-95"
                        >
                          Clear
                        </button>
                      )}
                      <div className="relative">
                        <button
                          onClick={handleOpenHostPicker}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-pnp-accent/20 border border-pnp-accent/40 text-pnp-accent hover:bg-pnp-accent/30 transition-colors active:scale-95"
                        >
                          {hostedChannelRef ? 'Change' : 'Set Host'}
                        </button>
                        {showHostPicker && (
                          <div className="absolute right-0 top-9 z-50 w-56 rounded-xl bg-pnp-surface border border-pnp-border shadow-2xl overflow-hidden">
                            <div className="px-3 py-2 border-b border-pnp-border flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-pnp-textPrimary">Select stream to host</span>
                              <button onClick={() => setShowHostPicker(false)} className="text-pnp-textSecondary hover:text-pnp-textPrimary text-xs" aria-label="Close">✕</button>
                            </div>
                            {hostPickerLoading ? (
                              <div className="flex items-center justify-center py-6">
                                <span className="w-5 h-5 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : hostTargetStreams.length === 0 ? (
                              <p className="text-[11px] text-pnp-textSecondary text-center py-5 px-3">No other streams available.</p>
                            ) : (
                              <ul className="max-h-48 overflow-y-auto divide-y divide-pnp-border">
                                {hostTargetStreams.map((s) => (
                                  <li key={s.id}>
                                    <button onClick={() => handleSetHost(s.id)} className="w-full text-left px-3 py-2.5 hover:bg-pnp-surfaceHover transition-colors group">
                                      <div className="flex items-center gap-2">
                                        {s.isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
                                        <span className="text-xs font-medium text-pnp-textPrimary group-hover:text-pnp-accent truncate">{s.name}</span>
                                        {s.isLive && <span className="ml-auto flex-shrink-0 text-[9px] font-bold text-red-400">LIVE</span>}
                                      </div>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {(raidError || hostError) && (
                    <p className="text-[10px] text-red-400">{raidError || hostError}</p>
                  )}
                </div>
              )}

              {/* Reconnecting indicator */}
              {chatReconnecting && !chatConnected && !reconnectTimedOut && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-pnp-surface border border-pnp-border" aria-live="polite">
                  <span className="w-3 h-3 border border-pnp-textSecondary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="text-[10px] text-pnp-textSecondary">Reconnecting to live chat...</span>
                </div>
              )}

              {/* ── Tip/wallet/book-call sheet, opened by the Tip button in the video overlay.
                     Wrapped in FullscreenPortal so it stays visible while the browser
                     is in native fullscreen (the sheet would otherwise be outside
                     videoContainerRef and hidden by the FS element). ── */}
              <FullscreenPortal>
              {showTipSheet && !(ticketStatus?.isTicketed && !ticketStatus.hasTicket) && (
                <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Tip and support this creator">
                  <div className="absolute inset-0 bg-black/60" onClick={() => setShowTipSheet(false)} />
                  <div className="absolute left-0 right-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-pnp-surface border-t border-pnp-border px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-1">
                    <div className="sticky -mt-1 top-0 bg-pnp-surface flex items-center justify-center py-2" aria-hidden="true">
                      <span className="w-10 h-1 rounded-full bg-pnp-border" />
                    </div>
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-sm font-bold text-pnp-textPrimary truncate">{stream.name}</span>
                      <button
                        onClick={() => setShowTipSheet(false)}
                        aria-label="Close"
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-pnp-textSecondary hover:text-pnp-textPrimary"
                      >
                        ✕
                      </button>
                    </div>
                    {stream.description && (
                      <p className="text-xs text-pnp-textSecondary pb-2">{stream.description}</p>
                    )}
                    {stream.tags && stream.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pb-3">
                        {stream.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-medium text-pnp-textSecondary border border-pnp-border"
                          >
                            {(t.live[tag as keyof typeof t.live] as string) || tag}
                          </span>
                        ))}
                      </div>
                    )}

                  {/* Wallet Balance */}
                  {isAuthenticated && (
                    <div className="flex items-center justify-between px-1 py-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#008CE7" }}>
                          <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-white">
                            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1.5 14.5h-3v-2h3c.828 0 1.5-.672 1.5-1.5S14.328 11 13.5 11H10V9h3.5c1.933 0 3.5 1.567 3.5 3.5S15.433 16 13.5 16.5z"/>
                          </svg>
                        </div>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-pnp-textPrimary">
                          {tokenBalance == null ? "—" : `${tokenBalance} ${t.live.tokens}`}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowTopUp(true)}
                        className="relative flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white btn-gradient"
                      >
                        {tokenBalance !== null && tokenBalance < 60 && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white flex-shrink-0">
                          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1.5 14.5h-3v-2h3c.828 0 1.5-.672 1.5-1.5S14.328 11 13.5 11H10V9h3.5c1.933 0 3.5 1.567 3.5 3.5S15.433 16 13.5 16.5z"/>
                        </svg>
                        + Top up
                      </button>
                    </div>
                  )}

                  {/* Tip menu */}
                  {tipMenu.length > 0 && stream.isLive && !isCreatorPayLocked(stream.username) && (
                    <div className="mt-3">
                      <p className="text-[10px] text-pnp-textSecondary mb-1.5 font-medium">Tip menu</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tipMenu.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleTip(item.tokensAmount)}
                            disabled={tipping}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-pnp-border bg-pnp-surface text-pnp-textPrimary hover:border-pnp-accent/60 transition-colors text-left disabled:opacity-50"
                          >
                            <span className="text-pnp-accent font-bold">{item.tokensAmount}</span>
                            <span className="text-pnp-textSecondary mx-1">·</span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tip bar */}
                  <div className={`flex items-center gap-2 mt-3 ${!stream.isLive ? 'opacity-50 pointer-events-none' : ''}`}>
                    {isCreatorPayLocked(stream.username) ? (
                      <p className="text-[10px] text-pnp-textSecondary text-center w-full py-1">🔒 Launches June 1st</p>
                    ) : (<>
                      <div className="flex gap-1.5 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
                        {TIP_AMOUNTS.map((amount) => (
                          <button
                            key={amount}
                            onClick={() => handleTip(amount)}
                            disabled={tipping || !stream.isLive}
                            className="min-h-[44px] px-3 py-1.5 rounded-lg font-semibold text-xs transition-all text-white active:scale-95 disabled:opacity-50 btn-gradient whitespace-nowrap flex items-center gap-1.5"
                          >
                            {tipSubmitting && (
                              <span className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            )}
                            {amount.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </>)}
                  </div>
                  {tipError && (
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-[10px] text-pnp-error">{tipError}</p>
                      {tipPaymentTab === "tokens" && tokenBalance !== null && (
                        <button onClick={() => setShowTopUp(true)} className="flex-shrink-0 text-[10px] font-bold text-pnp-accent hover:underline">
                          Comprar Ru$h ⚡💲 →
                        </button>
                      )}
                    </div>
                  )}
                  {tipSuccess && <p className="text-[10px] text-gradient mt-1">{tipSuccess}</p>}

                  {/* Recent tips */}
                  {recentTips.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mt-3">
                      {recentTips.map((tip) => (
                        <div key={tip.id} className="flex-shrink-0 px-2.5 py-1 rounded-full bg-pnp-surface border border-pnp-border text-[10px]">
                          <span className="text-gradient font-medium">${tip.amount}</span>
                          <span className="text-pnp-textSecondary mx-1">by</span>
                          <span className="text-pnp-textPrimary">@{tip.user_username}</span>
                          <span className="text-pnp-textSecondary/50 ml-1">{formatTimeAgo(tip.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Book a Private Call */}
                  {isAuthenticated && callPackages.length > 0 && !isCreatorPayLocked(stream.username) && (
                    <div className="rounded-xl border border-pnp-border bg-pnp-surface overflow-hidden mt-3">
                      <button
                        onClick={() => { setShowBookCall((v) => !v); setBookCallError(null); }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-pnp-accent flex-shrink-0">
                            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                          </svg>
                          <span className="text-[11px] font-semibold text-pnp-textPrimary">Book a Private Call</span>
                        </div>
                        <svg
                          viewBox="0 0 24 24"
                          className={`w-3.5 h-3.5 fill-none stroke-pnp-textSecondary transition-transform duration-200 ${showBookCall ? "rotate-180" : ""}`}
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showBookCall && (
                        <div className="px-3 pb-3 border-t border-pnp-border">
                          <p className="text-[10px] text-pnp-textSecondary mt-2 mb-2">
                            Choose a session — paid instantly with Ru$h
                          </p>
                          <div className="flex gap-2">
                            {callPackages.map((pkg) => (
                              <button
                                key={pkg.id}
                                onClick={() => handleBookCall(pkg)}
                                disabled={bookCallSubmitting || (tokenBalance !== null && tokenBalance < pkg.tokenCost)}
                                className="flex-1 flex flex-col items-center gap-0.5 px-3 py-3 rounded-xl border border-pnp-border bg-pnp-bg hover:border-pnp-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {bookCallSubmitting ? (
                                  <span className="w-4 h-4 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <span className="text-sm font-bold text-gradient">{pkg.tokenCost}F</span>
                                    <span className="text-[10px] text-pnp-textSecondary">{pkg.durationMinutes} min</span>
                                    {tokenBalance !== null && tokenBalance < pkg.tokenCost && (
                                      <span className="text-[9px] text-pnp-error mt-0.5">Need {pkg.tokenCost - tokenBalance} more</span>
                                    )}
                                  </>
                                )}
                              </button>
                            ))}
                          </div>
                          {bookCallError && (
                            <div className="flex items-center justify-between mt-2 gap-2">
                              <p className="text-[10px] text-pnp-error">{bookCallError}</p>
                              {bookCallError.toLowerCase().includes("insufficient") && (
                                <button onClick={() => setShowTopUp(true)} className="text-[10px] font-bold text-pnp-accent hover:underline flex-shrink-0">
                                  Comprar Ru$h ⚡💲 →
                                </button>
                              )}
                            </div>
                          )}
                          {bookCallSuccess && <p className="text-[10px] text-green-400 mt-2">{bookCallSuccess}</p>}
                        </div>
                      )}
                    </div>
                  )}

                  </div>
                  {/* end sheet panel */}
                </div>
              )}
              </FullscreenPortal>
              {/* end tip sheet */}

            </div>
            {/* end scrollable left area */}
          </div>

        </div>
        {/* end LEFT COLUMN */}

        {/* ── RIGHT COLUMN (desktop only) — 340px fixed panel ───────────────── */}
        <div className="hidden xl:flex flex-col w-[340px] border-l border-pnp-border overflow-hidden">

          {ticketStatus?.isTicketed && !ticketStatus.hasTicket ? (
            /* Paywall message instead of tabs */
            <div className="flex-1 flex items-center justify-center px-6 text-center">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-full bg-pnp-accent/20 border border-pnp-accent/40 flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5 text-pnp-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                </div>
                <p className="text-xs text-pnp-textSecondary">Buy a ticket to access chat and tips</p>
              </div>
            </div>
          ) : (<>

            {/* Tab bar */}
            <div className="flex-shrink-0 flex border-b border-pnp-border">
              <button
                onClick={() => setDesktopTab("chat")}
                className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors border-b-2 -mb-px ${
                  desktopTab === "chat"
                    ? "text-pnp-accent border-pnp-accent"
                    : "text-pnp-textSecondary border-transparent hover:text-pnp-textPrimary"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setDesktopTab("tips")}
                className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors border-b-2 -mb-px ${
                  desktopTab === "tips"
                    ? "text-pnp-accent border-pnp-accent"
                    : "text-pnp-textSecondary border-transparent hover:text-pnp-textPrimary"
                }`}
              >
                Tips
              </button>
              {callPackages.length > 0 && (
                <button
                  onClick={() => setDesktopTab("book")}
                  className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors border-b-2 -mb-px ${
                    desktopTab === "book"
                      ? "text-pnp-accent border-pnp-accent"
                      : "text-pnp-textSecondary border-transparent hover:text-pnp-textPrimary"
                  }`}
                >
                  Book Call
                </button>
              )}
              {isChannelOwner && (
                <button
                  onClick={() => setDesktopTab("studio")}
                  className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors border-b-2 -mb-px ${
                    desktopTab === "studio"
                      ? "text-pnp-accent border-pnp-accent"
                      : "text-pnp-textSecondary border-transparent hover:text-pnp-textPrimary"
                  }`}
                >
                  Studio
                </button>
              )}
            </div>

            {/* ── CHAT TAB ────────────────────────────────────────────────────── */}
            {desktopTab === "chat" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Compact wallet balance */}
                {isAuthenticated && (
                  <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-pnp-border">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#008CE7" }}>
                        <svg viewBox="0 0 24 24" className="w-2 h-2 fill-white">
                          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1.5 14.5h-3v-2h3c.828 0 1.5-.672 1.5-1.5S14.328 11 13.5 11H10V9h3.5c1.933 0 3.5 1.567 3.5 3.5S15.433 16 13.5 16.5z"/>
                        </svg>
                      </div>
                      <span className="text-[10px] font-semibold text-pnp-textPrimary">
                        {tokenBalance == null ? "—" : `${tokenBalance} ${t.live.tokens}`}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowTopUp(true)}
                      className="relative flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-white btn-gradient"
                    >
                      {tokenBalance !== null && tokenBalance < 60 && (
                        <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                      + Top up
                    </button>
                  </div>
                )}
                {/* Connection status */}
                <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-pnp-border/50">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${chatConnected ? "bg-green-500" : "bg-pnp-textSecondary/30"}`} />
                  <span className="text-[10px] text-pnp-textSecondary">
                    {chatConnected ? t.live.chatConnected : chatReconnecting && !reconnectTimedOut ? "Reconnecting..." : t.live.chatConnecting}
                  </span>
                  {socketError && <span className="text-[10px] text-pnp-error ml-auto">{socketError}</span>}
                </div>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-2" ref={chatContainerRef}>
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-[10px] text-pnp-textSecondary text-center">
                        {chatConnected ? t.live.beFirstToChat : t.live.connectingToChat}
                      </p>
                    </div>
                  ) : (
                    chatMessages.slice(-100).map((msg) => (
                      msg.isHype ? (
                        <div key={msg.id} className="py-0.5 px-0.5">
                          <div
                            className="text-xs flex items-center gap-1.5 px-2 py-1 rounded-lg"
                            style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.18), rgba(212,0,122,0.12))", border: "1px solid rgba(139,92,246,0.25)" }}
                          >
                            <span className="font-bold flex-shrink-0" style={{ color: "#a78bfa" }}>PNPtv</span>
                            <span className="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.35)", color: "#c4b5fd" }}>BOT</span>
                            <span className="flex-1 break-words" style={{ color: "#e9d5ff" }}>{msg.content}</span>
                          </div>
                        </div>
                      ) : (
                        <div key={msg.id} className="py-0.5">
                          <div className="text-xs flex items-start gap-1">
                            <span className="font-medium text-gradient flex-shrink-0">@{msg.username}</span>
                            <span className="text-pnp-textSecondary flex-shrink-0">·</span>
                            <span className="text-pnp-textPrimary flex-1 break-words">{msg.content}</span>
                            {isStreamOwner && msg.userId && (
                              <button
                                onClick={() => handleBanUser(msg.userId!)}
                                className="flex-shrink-0 ml-1 text-[9px] text-pnp-textSecondary/40 hover:text-red-400 transition-colors"
                                title="Ban from chat"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
                {/* Input — always pinned at bottom */}
                <div className="flex-shrink-0 border-t border-pnp-border px-3 py-2">
                  {isAuthenticated ? (
                    chatBanned ? (
                      <p className="text-[10px] text-red-400 text-center py-1">
                        You are banned from this stream's chat.
                      </p>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Say something…"
                          aria-label="Type a chat message"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              submitChat();
                            }
                          }}
                          maxLength={500}
                          className="flex-1 h-10 rounded-full border border-white/10 px-4 text-xs text-pnp-textPrimary placeholder-pnp-textSecondary focus:outline-none focus:border-pnp-accent/60"
                          style={{ background: "rgba(255,255,255,0.06)" }}
                        />
                        <button
                          onClick={submitChat}
                          disabled={!chatInput.trim()}
                          className="h-10 px-5 rounded-full text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                        >
                          Send
                        </button>
                      </div>
                    )
                  ) : (
                    <button onClick={login} className="text-xs text-pnp-accent hover:underline w-full text-center py-1">
                      {t.live.logInToChat}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── TIPS TAB ────────────────────────────────────────────────────── */}
            {desktopTab === "tips" && (
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                {/* Wallet balance */}
                {isAuthenticated && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#008CE7" }}>
                        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-white">
                          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1.5 14.5h-3v-2h3c.828 0 1.5-.672 1.5-1.5S14.328 11 13.5 11H10V9h3.5c1.933 0 3.5 1.567 3.5 3.5S15.433 16 13.5 16.5z"/>
                        </svg>
                      </div>
                      <span className="text-[11px] font-semibold text-pnp-textPrimary">
                        {tokenBalance == null ? "—" : `${tokenBalance} ${t.live.tokens}`}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowTopUp(true)}
                      className="relative flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white btn-gradient"
                    >
                      {tokenBalance !== null && tokenBalance < 60 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                      <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white flex-shrink-0">
                        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1.5 14.5h-3v-2h3c.828 0 1.5-.672 1.5-1.5S14.328 11 13.5 11H10V9h3.5c1.933 0 3.5 1.567 3.5 3.5S15.433 16 13.5 16.5z"/>
                      </svg>
                      + Top up
                    </button>
                  </div>
                )}
                {/* Tip goal */}
                {tipGoal && tipGoal.goalAmount && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-pnp-textPrimary truncate">{tipGoal.goalLabel || "Goal"}</span>
                      <span className="text-[10px] text-pnp-textSecondary flex-shrink-0 ml-2">
                        {Math.round(tipGoal.progress)}/{Math.round(tipGoal.goalAmount)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-pnp-border overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${tipGoal.completed ? "bg-green-500" : "bg-pnp-accent"}`}
                        style={{ width: `${Math.min(100, Math.round((tipGoal.progress / tipGoal.goalAmount) * 100))}%` }}
                      />
                    </div>
                    {tipGoal.completed && <p className="text-[10px] text-green-400 font-semibold mt-1 text-center">Goal reached!</p>}
                  </div>
                )}
                {/* Tip menu */}
                {tipMenu.length > 0 && stream.isLive && !isCreatorPayLocked(stream.username) && (
                  <div>
                    <p className="text-[10px] text-pnp-textSecondary mb-1.5 font-medium">Tip menu</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tipMenu.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleTip(item.tokensAmount)}
                          disabled={tipping}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-pnp-border bg-pnp-surface text-pnp-textPrimary hover:border-pnp-accent/60 transition-colors text-left disabled:opacity-50"
                        >
                          <span className="text-pnp-accent font-bold">{item.tokensAmount}</span>
                          <span className="text-pnp-textSecondary mx-1">·</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Tip bar */}
                <div>
                  <div className={`flex items-center gap-2 ${!stream.isLive ? 'opacity-50 pointer-events-none' : ''}`}>
                    {isCreatorPayLocked(stream.username) ? (
                      <p className="text-[10px] text-pnp-textSecondary text-center w-full py-1">🔒 Launches June 1st</p>
                    ) : (<>
                      <div className="flex gap-1.5 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
                        {TIP_AMOUNTS.map((amount) => (
                          <button
                            key={amount}
                            onClick={() => handleTip(amount)}
                            disabled={tipping || !stream.isLive}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg font-semibold text-xs transition-all text-white active:scale-95 disabled:opacity-50 btn-gradient whitespace-nowrap flex items-center gap-1.5"
                          >
                            {tipSubmitting && (
                              <span className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            )}
                            {amount.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </>)}
                  </div>
                  {tipError && (
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-[10px] text-pnp-error">{tipError}</p>
                      {tipPaymentTab === "tokens" && tokenBalance !== null && (
                        <button onClick={() => setShowTopUp(true)} className="flex-shrink-0 text-[10px] font-bold text-pnp-accent hover:underline">
                          Comprar Ru$h ⚡💲 →
                        </button>
                      )}
                    </div>
                  )}
                  {tipSuccess && <p className="text-[10px] text-gradient mt-1">{tipSuccess}</p>}
                </div>
                {/* Recent tips */}
                {recentTips.length > 0 && (
                  <div>
                    <p className="text-[10px] text-pnp-textSecondary mb-1.5 font-medium">Recent tips</p>
                    <div className="space-y-1">
                      {recentTips.map((tip) => (
                        <div key={tip.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-pnp-textPrimary">@{tip.user_username}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gradient font-medium">${tip.amount}</span>
                            <span className="text-pnp-textSecondary/50">{formatTimeAgo(tip.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── BOOK CALL TAB ────────────────────────────────────────────────── */}
            {/* ── STUDIO TAB (channel owner only — not all admins) ─────────────── */}
            {desktopTab === "studio" && isChannelOwner && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Sub-tab bar */}
                <div className="flex-shrink-0 flex border-b border-pnp-border bg-pnp-surface/50">
                  <button
                    onClick={() => setStudioSubTab("viewers")}
                    className={`flex-1 py-2 text-[10px] font-semibold transition-colors border-b-2 -mb-px ${
                      studioSubTab === "viewers"
                        ? "text-pnp-accent border-pnp-accent"
                        : "text-pnp-textSecondary border-transparent hover:text-pnp-textPrimary"
                    }`}
                  >
                    Viewers
                  </button>
                  <button
                    onClick={() => setStudioSubTab("tips")}
                    className={`flex-1 py-2 text-[10px] font-semibold transition-colors border-b-2 -mb-px ${
                      studioSubTab === "tips"
                        ? "text-pnp-accent border-pnp-accent"
                        : "text-pnp-textSecondary border-transparent hover:text-pnp-textPrimary"
                    }`}
                  >
                    Setup Tips
                  </button>
                </div>

                {/* ── VIEWERS SUB-TAB ── */}
                {studioSubTab === "viewers" && (
                  <div className="flex-1 overflow-y-auto">
                    {/* Creator weekend bonus banner — shown only during active window */}
                    {(() => {
                      const now = Date.now();
                      const bonusStart = new Date('2026-07-18T05:00:00Z').getTime();
                      const bonusEnd = new Date('2026-07-21T11:00:00Z').getTime();
                      return now >= bonusStart && now <= bonusEnd;
                    })() && (
                      <div
                        className="mx-3 mt-2 mb-1 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px] font-semibold"
                        style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "#6ee7b7" }}
                      >
                        <span>🚀</span>
                        <span>Grand Launch Weekend — ganas +10% en Ru$h este fin de semana</span>
                      </div>
                    )}
                    <div className="px-3 py-2 border-b border-pnp-border flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-pnp-textPrimary">
                        {studioViewers.length} watching
                      </span>
                      <button
                        onClick={() => {
                          if (!channelRef) return;
                          setStudioViewersLoading(true);
                          getStreamViewers(channelRef)
                            .then((res) => setStudioViewers(res.viewers || []))
                            .catch(() => {})
                            .finally(() => setStudioViewersLoading(false));
                        }}
                        className="text-[9px] text-pnp-textSecondary hover:text-pnp-accent transition-colors"
                      >
                        {studioViewersLoading ? "..." : "Refresh"}
                      </button>
                    </div>
                    {studioViewers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <p className="text-[11px] text-pnp-textSecondary">
                          {studioViewersLoading ? "Loading..." : "No viewers yet"}
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-pnp-border/50">
                        {studioViewers.map((v) => {
                          const tier =
                            v.fanScore >= 20000 ? "green" :
                            v.fanScore >= 5000 ? "yellow" : "gray";
                          return (
                            <li key={v.userId} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-pnp-surfaceHover">
                              <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
                                tier === "green"
                                  ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                  : tier === "yellow"
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                  : "bg-pnp-border/60 text-pnp-textSecondary border border-pnp-border"
                              }`}>
                                {v.username.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-pnp-textPrimary truncate">@{v.username}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[9px] text-pnp-textSecondary">
                                    {v.tokenBalance}F balance
                                  </span>
                                  {v.totalTipsGiven > 0 && (
                                    <span className="text-[9px] text-pnp-accent">
                                      {Math.round(v.totalTipsGiven)}F tipped
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <span className={`text-[10px] font-bold ${
                                  tier === "green" ? "text-green-400" :
                                  tier === "yellow" ? "text-amber-400" :
                                  "text-pnp-textSecondary"
                                }`}>
                                  {v.fanScore}
                                </span>
                                <p className="text-[8px] text-pnp-textSecondary">fan score</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="text-[8px] text-pnp-textSecondary text-center py-2 px-3">
                      Fan score = saldo de Ru$h + (propinas de por vida × 5). Verde ≥20000, amarillo ≥5000.
                    </p>
                  </div>
                )}

                {/* ── SETUP TIPS SUB-TAB ── */}
                {studioSubTab === "tips" && (
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

                    {/* Tip Menu Editor */}
                    <div>
                      <p className="text-[11px] font-semibold text-pnp-textPrimary mb-2">Tip Menu</p>
                      <div className="space-y-1.5 mb-2">
                        {myTipMenuItems.length === 0 && (
                          <p className="text-[10px] text-pnp-textSecondary py-1">No items yet — add one below.</p>
                        )}
                        {myTipMenuItems.map((item, idx) => (
                          <div key={item.id ?? idx} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-pnp-surface border border-pnp-border">
                            <span className="text-[11px] font-bold text-pnp-accent w-8 flex-shrink-0">{item.tokensAmount}F</span>
                            <span className="text-[11px] text-pnp-textPrimary flex-1 truncate">{item.label}</span>
                            <button
                              onClick={() => {
                                const updated = myTipMenuItems.filter((_, i) => i !== idx).map((m, i) => ({ ...m, sortOrder: i }));
                                setMyTipMenuItems(updated);
                              }}
                              className="text-pnp-textSecondary/50 hover:text-red-400 text-xs transition-colors flex-shrink-0"
                              aria-label="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      {/* Add item row */}
                      {myTipMenuItems.length < 10 && (
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            value={newTipAmount}
                            onChange={(e) => setNewTipAmount(e.target.value)}
                            placeholder="Ru$h"
                            className="w-20 flex-shrink-0 px-2 py-1.5 rounded-lg bg-pnp-surface border border-pnp-border text-[11px] text-pnp-textPrimary placeholder:text-pnp-textSecondary focus:outline-none focus:border-pnp-accent/60"
                            min={1}
                            max={999999}
                          />
                          <input
                            type="text"
                            value={newTipLabel}
                            onChange={(e) => setNewTipLabel(e.target.value)}
                            placeholder="Label (e.g. Flash)"
                            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-pnp-surface border border-pnp-border text-[11px] text-pnp-textPrimary placeholder:text-pnp-textSecondary focus:outline-none focus:border-pnp-accent/60"
                            maxLength={40}
                          />
                          <button
                            onClick={() => {
                              const amt = parseInt(newTipAmount, 10);
                              const lbl = newTipLabel.trim();
                              if (!amt || amt < 1 || !lbl) return;
                              setMyTipMenuItems((prev) => [
                                ...prev,
                                { id: Date.now(), tokensAmount: amt, label: lbl, sortOrder: prev.length },
                              ]);
                              setNewTipAmount("");
                              setNewTipLabel("");
                            }}
                            className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-pnp-accent/20 border border-pnp-accent/40 text-pnp-accent text-[10px] font-bold hover:bg-pnp-accent/30 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      )}
                      <button
                        disabled={myTipMenuSaving}
                        onClick={() => {
                          setMyTipMenuSaving(true);
                          saveTipMenu(myTipMenuItems.map((m, i) => ({ tokensAmount: m.tokensAmount, label: m.label, sortOrder: i })))
                            .then(() => { setTipMenu(myTipMenuItems); })
                            .catch(() => {})
                            .finally(() => setMyTipMenuSaving(false));
                        }}
                        className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-semibold text-white btn-gradient disabled:opacity-50 active:scale-95"
                      >
                        {myTipMenuSaving ? "Saving..." : "Save Tip Menu"}
                      </button>
                    </div>

                    <div className="border-t border-pnp-border" />

                    {/* Tip Goal Editor */}
                    <div>
                      <p className="text-[11px] font-semibold text-pnp-textPrimary mb-2">Tip Goal</p>
                      {tipGoal?.goalAmount != null && (
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-pnp-textPrimary">{tipGoal.goalLabel || "Goal"}</span>
                            <span className="text-[9px] text-pnp-textSecondary">
                              {Math.round(tipGoal.progress)}/{Math.round(tipGoal.goalAmount)}F
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-pnp-border overflow-hidden">
                            <div
                              className={`h-full rounded-full ${tipGoal.completed ? "bg-green-500" : "bg-pnp-accent"}`}
                              style={{ width: `${Math.min(100, Math.round((tipGoal.progress / tipGoal.goalAmount) * 100))}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <input
                          type="number"
                          value={goalAmountInput}
                          onChange={(e) => setGoalAmountInput(e.target.value)}
                          placeholder="Goal amount (Ru$h)"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-pnp-surface border border-pnp-border text-[11px] text-pnp-textPrimary placeholder:text-pnp-textSecondary focus:outline-none focus:border-pnp-accent/60"
                          min={1}
                        />
                        <input
                          type="text"
                          value={goalLabelInput}
                          onChange={(e) => setGoalLabelInput(e.target.value)}
                          placeholder="Goal label (e.g. Special show)"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-pnp-surface border border-pnp-border text-[11px] text-pnp-textPrimary placeholder:text-pnp-textSecondary focus:outline-none focus:border-pnp-accent/60"
                          maxLength={60}
                        />
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <button
                          disabled={goalSaving || !goalAmountInput}
                          onClick={() => {
                            const amt = parseInt(goalAmountInput, 10);
                            if (!amt || amt < 1) return;
                            setGoalSaving(true);
                            setLiveGoal(amt, goalLabelInput.trim() || "Goal")
                              .then(() => {
                                setTipGoal({ goalAmount: amt, goalLabel: goalLabelInput.trim() || "Goal", progress: 0, completed: false });
                              })
                              .catch(() => {})
                              .finally(() => setGoalSaving(false));
                          }}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-white btn-gradient disabled:opacity-50 active:scale-95"
                        >
                          {goalSaving ? "Saving..." : "Set Goal"}
                        </button>
                        {tipGoal?.goalAmount != null && (
                          <button
                            disabled={goalSaving}
                            onClick={() => {
                              setGoalSaving(true);
                              clearLiveGoal()
                                .then(() => { setTipGoal(null); setGoalAmountInput(""); setGoalLabelInput(""); })
                                .catch(() => {})
                                .finally(() => setGoalSaving(false));
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-pnp-border text-pnp-textSecondary hover:border-red-400/50 hover:text-red-400 transition-colors disabled:opacity-50 active:scale-95"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── BOOK CALL TAB ────────────────────────────────────────────────── */}
            {desktopTab === "book" && callPackages.length > 0 && (
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {!isCreatorPayLocked(stream.username) ? (
                  <>
                    <p className="text-[11px] font-semibold text-pnp-textPrimary mb-1">Book a Private Call</p>
                    <p className="text-[10px] text-pnp-textSecondary mb-3">
                      Choose a session — paid instantly with Ru$h 💎
                    </p>
                    <div className="flex flex-col gap-2">
                      {callPackages.map((pkg) => (
                        <button
                          key={pkg.id}
                          onClick={() => handleBookCall(pkg)}
                          disabled={bookCallSubmitting || (tokenBalance !== null && tokenBalance < pkg.tokenCost)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-pnp-border bg-pnp-surface hover:border-pnp-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {bookCallSubmitting ? (
                            <span className="w-4 h-4 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin mx-auto" />
                          ) : (
                            <>
                              <span className="text-[11px] text-pnp-textPrimary">{pkg.durationMinutes} min session</span>
                              <div className="text-right">
                                <span className="text-sm font-bold text-gradient">{pkg.tokenCost}T</span>
                                {tokenBalance !== null && tokenBalance < pkg.tokenCost && (
                                  <p className="text-[9px] text-pnp-error">Need {pkg.tokenCost - tokenBalance} more</p>
                                )}
                              </div>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                    {bookCallError && (
                      <div className="flex items-center justify-between mt-3 gap-2">
                        <p className="text-[10px] text-pnp-error">{bookCallError}</p>
                        {bookCallError.toLowerCase().includes("insufficient") && (
                          <button onClick={() => setShowTopUp(true)} className="text-[10px] font-bold text-pnp-accent hover:underline flex-shrink-0">
                            Comprar Ru$h ⚡💲 →
                          </button>
                        )}
                      </div>
                    )}
                    {bookCallSuccess && <p className="text-[10px] text-green-400 mt-3">{bookCallSuccess}</p>}
                  </>
                ) : (
                  <p className="text-[10px] text-pnp-textSecondary text-center py-4">🔒 Launches June 1st</p>
                )}
              </div>
            )}

          </>)}
        </div>
        {/* end RIGHT COLUMN */}

      </div>
      {/* end main content */}

      <FullscreenPortal>
        <BuyTokensModal
          isOpen={showTopUp || outOfTokens}
          onClose={() => { setShowTopUp(false); setOutOfTokens(false); }}
          onSuccess={(newBalance) => { setTokenBalance(newBalance); setOutOfTokens(false); }}
        />
      </FullscreenPortal>
      <FullscreenPortal>
      {showTutorial && !rulesLoading && rulesAcknowledged && !(typeof window !== "undefined" && window.innerWidth < 768) && (
        <TutorialOverlay section="stream" onDismiss={dismissTutorial} onDismissForever={dismissForever} />
      )}
      </FullscreenPortal>
    </div>
  );
}
