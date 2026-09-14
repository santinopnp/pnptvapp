import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePrivy, useWallets, useConnectWallet } from "@privy-io/react-auth";
import { useI18n } from "@/lib/i18n";
import {
  checkAuthStatus,
  linkTelegramAccount,
  unlinkTelegramAccount,
  startWebappXLink,
  unlinkXAccount,
  setPreferredWalletServer,
  type TelegramWidgetUser,
} from "@/lib/api";
import { PREFERRED_WALLET_KEY } from "@/components/payments/PayInWalletChips";

export interface IdentityConnectionsProps {
  telegramUsername?: string;
}

function getBotUsername(): string {
  const raw =
    (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string) || "PNPLatinoTV_bot";
  return raw.replace(/^@/, "").trim();
}

interface TelegramLinkWidgetProps {
  onAuth: (user: TelegramWidgetUser) => void;
  onLoadError: () => void;
}

function TelegramLinkWidget({ onAuth, onLoadError }: TelegramLinkWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  const onLoadErrorRef = useRef(onLoadError);

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);
  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    const botUsername = getBotUsername();
    (window as unknown as Record<string, unknown>)["onTelegramLinkAuth"] = (
      user: TelegramWidgetUser,
    ) => {
      onAuthRef.current(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "medium");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramLinkAuth(user)");
    script.setAttribute("data-request-access", "write");

    const timer = setTimeout(() => onLoadErrorRef.current(), 8000);
    script.onload = () => clearTimeout(timer);
    script.onerror = () => {
      clearTimeout(timer);
      onLoadErrorRef.current();
    };

    const container = containerRef.current;
    container?.appendChild(script);

    return () => {
      clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)["onTelegramLinkAuth"];
      if (container && script.parentNode === container) {
        container.removeChild(script);
      }
    };
  }, []);

  return <div ref={containerRef} className="flex justify-center py-2" />;
}

export default function IdentityConnections({ telegramUsername }: IdentityConnectionsProps) {
  const t = useI18n();
  const p = t.profile;

  // Telegram link state
  const [telegramLinked, setTelegramLinked] = useState<boolean>(!!telegramUsername);
  const [telegramHandle, setTelegramHandle] = useState<string | null>(telegramUsername || null);
  const [telegramId, setTelegramId] = useState<string | null>(null);
  const [showLinkWidget, setShowLinkWidget] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [unlinkConfirm, setUnlinkConfirm] = useState(false);

  // X link state
  const [xLinked, setXLinked] = useState(false);
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [xLinkLoading, setXLinkLoading] = useState(false);
  const [xLinkError, setXLinkError] = useState<string | null>(null);
  const [xUnlinkConfirm, setXUnlinkConfirm] = useState(false);

  // Wallet state
  const { ready: privyReady, authenticated: privyAuth, login: privyLogin } = usePrivy();
  const { wallets } = useWallets();
  const [preferredAddress, setPreferredAddress] = useState<string | null>(() => {
    try { return localStorage.getItem(PREFERRED_WALLET_KEY); } catch { return null; }
  });
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const { connectWallet } = useConnectWallet({
    onSuccess: () => setWalletError(null),
    onError: (err) => setWalletError(err instanceof Error ? err.message : "Failed to connect wallet"),
  });

  const handleSetPreferred = async (address: string) => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      try { localStorage.setItem(PREFERRED_WALLET_KEY, address); } catch { /* ignore */ }
      setPreferredAddress(address);
      await setPreferredWalletServer(address);
    } catch {
      setWalletError("Failed to save preference");
    } finally {
      setWalletLoading(false);
    }
  };

  const handleConnectWallet = () => {
    setWalletError(null);
    if (!privyReady) return;
    if (!privyAuth) { privyLogin(); return; }
    try { connectWallet(); } catch { /* onError handles UI */ }
  };

  const refreshStatus = useCallback(() => {
    return checkAuthStatus()
      .then((status) => {
        if (status.authenticated && status.user) {
          const tgId = status.user.telegram_id;
          const linked = !!tgId && Number(tgId) > 0;
          setTelegramLinked(linked);
          setTelegramId(linked ? String(tgId) : null);
          if (status.user.username && status.user.last_login_method === "telegram") {
            setTelegramHandle(status.user.username);
          } else if (telegramUsername) {
            setTelegramHandle(telegramUsername);
          }
          const xConnected = !!status.user.auth_methods?.x;
          setXLinked(xConnected);
          setXHandle(status.user.xHandle ?? null);
        }
      })
      .catch(() => {});
  }, [telegramUsername]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleConnectX = async () => {
    setXLinkLoading(true);
    setXLinkError(null);
    try {
      const res = await startWebappXLink();
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        setXLinkError(res.error || "Could not start X connection. Try again.");
        setXLinkLoading(false);
      }
    } catch (err: unknown) {
      setXLinkError(err instanceof Error ? err.message : "Connection error");
      setXLinkLoading(false);
    }
  };

  const handleUnlinkX = async () => {
    setXLinkLoading(true);
    setXLinkError(null);
    try {
      const res = await unlinkXAccount();
      if (res.success) {
        setXUnlinkConfirm(false);
        await refreshStatus();
      } else {
        setXLinkError(res.error || "Failed to unlink X");
      }
    } catch (err: unknown) {
      setXLinkError(err instanceof Error ? err.message : "Failed to unlink X");
    } finally {
      setXLinkLoading(false);
    }
  };

  const handleTelegramWidgetAuth = async (user: TelegramWidgetUser) => {
    setLinkLoading(true);
    setLinkError(null);
    try {
      const res = await linkTelegramAccount(user);
      if (res.success) {
        setShowLinkWidget(false);
        await refreshStatus();
      } else {
        setLinkError(res.error || "Failed to link Telegram");
      }
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : "Failed to link Telegram");
    } finally {
      setLinkLoading(false);
    }
  };

  const handleUnlink = async () => {
    setLinkLoading(true);
    setLinkError(null);
    try {
      const res = await unlinkTelegramAccount();
      if (res.success) {
        setUnlinkConfirm(false);
        await refreshStatus();
      } else {
        setLinkError(res.error || "Failed to unlink Telegram");
      }
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : "Failed to unlink Telegram");
    } finally {
      setLinkLoading(false);
    }
  };

  return (
    <div className="glass-card-sm p-5 mt-4">
      <h2 className="text-sm font-semibold text-white mb-3 tracking-wide uppercase opacity-60">
        {p.identityConnections}
      </h2>

      {/* Notice */}
      <div className="flex items-start gap-2 mb-4 pl-3 border-l-2 border-pink-500/30">
        <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="text-xs text-white/50 leading-relaxed">
          Your PNPtv! identity is secured by our own SSO system. Connect Telegram or X to enable additional sign-in options and cross-posting.
        </p>
      </div>

      <div className="space-y-3">
        {/* Telegram row */}
        <div className="py-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #2AABEE, #229ED9)" }}>
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Telegram</p>
                {telegramLinked ? (
                  <p className="text-xs truncate" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {telegramHandle ? `@${telegramHandle}` : telegramId ? `ID: ${telegramId}` : "Connected"}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Link your Telegram account</p>
                )}
              </div>
            </div>
            {telegramLinked ? (
              <button
                onClick={() => { setUnlinkConfirm(true); setLinkError(null); }}
                disabled={linkLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Unlink
              </button>
            ) : (
              <button
                onClick={() => { setShowLinkWidget(true); setLinkError(null); }}
                disabled={linkLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-full text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: "#2AABEE" }}
              >
                Link
              </button>
            )}
          </div>

          {/* Link widget panel */}
          {showLinkWidget && !telegramLinked && (
            <div className="bg-white/5 rounded-xl p-4 mt-3 animate-fade-in-up">
              <p className="text-[11px] text-white/60 mb-3 leading-relaxed">
                Sign in with Telegram below to link this Telegram account to your PNPtv account. If you don't have a username on PNPtv yet, your Telegram @username will be adopted automatically.
              </p>
              {linkLoading ? (
                <p className="text-xs text-white/70">Linking…</p>
              ) : (
                <TelegramLinkWidget
                  onAuth={handleTelegramWidgetAuth}
                  onLoadError={() => setLinkError("Telegram widget failed to load. Check your network or ad-blocker.")}
                />
              )}
              {linkError && <p className="text-[10px] text-red-400 mt-2">{linkError}</p>}
              <button
                onClick={() => { setShowLinkWidget(false); setLinkError(null); }}
                className="text-[10px] text-white/30 mt-3 hover:text-white/60"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Unlink confirm panel */}
          {unlinkConfirm && telegramLinked && (
            <div className="bg-white/5 rounded-xl p-4 mt-3 animate-fade-in-up">
              <p className="text-[11px] text-white/80 mb-3 leading-relaxed">
                Unlink Telegram from this account? You will no longer be able to log in with Telegram. Make sure you have an email + password set first, or you may lose access.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleUnlink}
                  disabled={linkLoading}
                  className="bg-red-500/20 text-red-300 hover:bg-red-500/30 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {linkLoading ? "…" : "Unlink"}
                </button>
                <button
                  onClick={() => { setUnlinkConfirm(false); setLinkError(null); }}
                  className="text-xs text-white/50 hover:text-white/80 px-2"
                >
                  Cancel
                </button>
              </div>
              {linkError && <p className="text-[10px] text-red-400 mt-2">{linkError}</p>}
            </div>
          )}
        </div>

        {/* X (Twitter) section */}
        <div className="py-3 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-black">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">X</p>
                {xLinked ? (
                  <p className="text-xs truncate" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {xHandle ? `@${xHandle}` : "Connected"}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Connect your X account</p>
                )}
              </div>
            </div>
            {xLinked ? (
              <button
                onClick={() => { setXUnlinkConfirm(true); setXLinkError(null); }}
                disabled={xLinkLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Unlink
              </button>
            ) : (
              <button
                onClick={handleConnectX}
                disabled={xLinkLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-full text-white hover:opacity-90 transition-opacity disabled:opacity-50 bg-black border border-white/20"
              >
                {xLinkLoading ? "…" : "Connect"}
              </button>
            )}
          </div>

          {xLinkError && <p className="text-[10px] text-red-400 mt-2">{xLinkError}</p>}

          {xUnlinkConfirm && xLinked && (
            <div className="bg-white/5 rounded-xl p-4 mt-3 animate-fade-in-up">
              <p className="text-[11px] text-white/80 mb-3 leading-relaxed">
                Unlink X from this account? You will no longer be able to log in with X or cross-post from PNPtv.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleUnlinkX}
                  disabled={xLinkLoading}
                  className="bg-red-500/20 text-red-300 hover:bg-red-500/30 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {xLinkLoading ? "…" : "Unlink"}
                </button>
                <button
                  onClick={() => { setXUnlinkConfirm(false); setXLinkError(null); }}
                  className="text-xs text-white/50 hover:text-white/80 px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Wallets section */}
        <div className="py-3 border-t border-white/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #7C3AED33, #2563EB33)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <svg className="w-4.5 h-4.5 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3m18 0V6" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Wallets</p>
                <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {wallets.length > 0 ? `${wallets.length} connected` : privyAuth ? "No wallet connected" : "Not connected"}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectWallet}
              disabled={!privyReady || walletLoading}
              className="text-xs font-semibold px-3 py-1.5 rounded-full text-white hover:opacity-90 transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #7C3AED, #2563EB)" }}
            >
              {wallets.length > 0 ? "+ Add" : "Connect"}
            </button>
          </div>

          {wallets.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {wallets.map((wallet) => {
                const isPreferred = preferredAddress === wallet.address;
                const label = wallet.walletClientType === "privy"
                  ? "PNPtv Wallet"
                  : wallet.walletClientType.charAt(0).toUpperCase() + wallet.walletClientType.slice(1);
                const short = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
                return (
                  <div key={wallet.address} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white">{label}</p>
                      <p className="text-[10px] font-mono" style={{ color: "#8E8E93" }}>{short}</p>
                    </div>
                    {isPreferred ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(124,58,237,0.15)", color: "#A78BFA" }}>
                        Preferred
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSetPreferred(wallet.address)}
                        disabled={walletLoading}
                        className="text-[10px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
                      >
                        Set preferred
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {walletError && <p className="text-[10px] text-red-400 mt-2">{walletError}</p>}
        </div>
      </div>
    </div>
  );
}
