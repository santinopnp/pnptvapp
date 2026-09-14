import { useEffect, useRef, useState } from "react";
import { usePrivy, useConnectWallet, useWallets } from "@privy-io/react-auth";

type Status = "idle" | "connecting" | "connected" | "error";

export default function ConnectWallet() {
  const { authenticated, login, ready } = usePrivy();
  const { wallets } = useWallets();
  const [status, setStatus] = useState<Status>("idle");
  const triggered = useRef(false);

  const { connectWallet } = useConnectWallet({
    onSuccess() {
      setStatus("connected");
    },
    onError() {
      setStatus("error");
    },
  });

  // Wait for Privy to be ready before auto-triggering
  useEffect(() => {
    if (!ready || triggered.current) return;
    triggered.current = true;
    const t = setTimeout(() => openWalletModal(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function openWalletModal() {
    setStatus("connecting");
    try {
      if (authenticated) {
        connectWallet();
      } else {
        login({ loginMethods: ["wallet"] } as Parameters<typeof login>[0]);
      }
    } catch {
      setStatus("error");
    }
  }

  // Detect WalletConnect wallet in list
  const wcWallet = wallets.find(
    (w) => w.walletClientType === "walletconnect" || w.connectorType === "wallet_connect"
  );
  const displayAddress = wcWallet?.address ?? "";
  const shortAddr = displayAddress ? `${displayAddress.slice(0, 6)}…${displayAddress.slice(-4)}` : "";

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0d0910",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg,#D4007A,#7B61FF)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "#fff",
          }}>P</div>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
            PNPtv
          </span>
        </div>
        <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0 }}>
          Connect Trust Wallet
        </h1>
        <p style={{ color: "#8E8E93", fontSize: 14, marginTop: 6 }}>
          Link your external wallet to pnptv.app
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: "#1C1C1E",
        borderRadius: 24,
        padding: 28,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        width: "100%",
        maxWidth: 360,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
      }}>
        {/* Status icon */}
        {status === "connected" || wcWallet ? (
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "linear-gradient(135deg,rgba(212,0,122,0.15),rgba(123,97,255,0.15))",
            border: "2px solid #D4007A",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D4007A" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        ) : (
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "linear-gradient(135deg,rgba(212,0,122,0.1),rgba(123,97,255,0.1))",
            border: "1px solid rgba(212,0,122,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* WalletConnect icon */}
            <svg width="40" height="24" viewBox="0 0 300 185" fill="none">
              <path d="M61.4385 36.2562C117.321 -8.4937 182.679 -8.4937 238.562 36.2562L243.485 40.3675C246.162 42.6206 246.162 46.5744 243.485 48.8275L226.217 63.4562C224.879 64.5825 222.814 64.5825 221.476 63.4562L214.703 57.8187C176.659 26.0025 123.341 26.0025 85.2969 57.8187L78.0785 63.7644C76.7398 64.8906 74.6748 64.8906 73.3362 63.7644L56.0685 49.1356C53.3912 46.8825 53.3912 42.9287 56.0685 40.6756L61.4385 36.2562ZM287.042 74.2468L302.516 87.6056C305.194 89.8587 305.194 93.8125 302.516 96.0656L232.484 156.281C229.807 158.534 226.011 158.534 223.334 156.281C223.334 156.281 223.334 156.281 223.334 156.281L173.302 112.525C172.633 111.962 171.6 111.962 170.931 112.525C170.931 112.525 170.931 112.525 170.931 112.525L120.899 156.281C118.222 158.534 114.426 158.534 111.749 156.281C111.749 156.281 111.749 156.281 111.749 156.281L41.4837 96.0818C38.8064 93.8287 38.8064 89.875 41.4837 87.6218L56.9582 74.2631C59.6355 72.01 63.4311 72.01 66.1084 74.2631L116.14 118.02C116.809 118.583 117.842 118.583 118.511 118.02C118.511 118.02 118.511 118.02 118.511 118.02L168.543 74.2631C171.22 72.01 175.016 72.01 177.693 74.2631C177.693 74.2631 177.693 74.2631 177.693 74.2631L227.725 118.02C228.394 118.583 229.427 118.583 230.096 118.02L280.128 74.2468C282.805 71.9937 286.601 71.9937 289.278 74.2468H287.042Z" fill="#3B99FC"/>
            </svg>
          </div>
        )}

        {/* Status text */}
        {(status === "connected" || wcWallet) ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#30D158", fontWeight: 700, fontSize: 16, margin: 0 }}>Wallet connected</p>
            {shortAddr && (
              <p style={{ color: "#8E8E93", fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>
                {shortAddr}
              </p>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#fff", fontWeight: 600, fontSize: 15, margin: 0 }}>
              {status === "connecting" ? "Opening wallet picker…" : "Ready to connect"}
            </p>
            <p style={{ color: "#8E8E93", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              A window will open — choose <strong style={{ color: "#fff" }}>WalletConnect</strong>, then scan the QR with Trust Wallet.
            </p>
          </div>
        )}

        {/* CTA */}
        {(status === "connected" || wcWallet) ? (
          <a href="/" style={{
            display: "block", width: "100%", textAlign: "center",
            padding: "14px 0", borderRadius: 14,
            background: "linear-gradient(135deg,#D4007A,#7B61FF)",
            color: "#fff", fontWeight: 700, fontSize: 15,
            textDecoration: "none",
          }}>
            Open PNPtv
          </a>
        ) : (
          <button
            onClick={openWalletModal}
            disabled={status === "connecting"}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 14,
              background: status === "connecting"
                ? "rgba(212,0,122,0.4)"
                : "linear-gradient(135deg,#D4007A,#7B61FF)",
              color: "#fff", fontWeight: 700, fontSize: 15,
              border: "none", cursor: status === "connecting" ? "default" : "pointer",
              opacity: status === "connecting" ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {status === "error" ? "Try again" : status === "connecting" ? "Opening…" : "Connect Trust Wallet"}
          </button>
        )}
      </div>

      {/* Steps */}
      {!(status === "connected" || wcWallet) && (
        <div style={{ marginTop: 28, maxWidth: 320, width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["1", "Click the button above — a wallet picker opens"],
            ["2", 'Choose "WalletConnect" from the list'],
            ["3", "Open Trust Wallet → scan the QR code that appears"],
            ["4", "Approve the connection in Trust Wallet"],
          ].map(([num, text]) => (
            <div key={num} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                background: "rgba(212,0,122,0.15)", border: "1px solid rgba(212,0,122,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#D4007A",
              }}>{num}</div>
              <p style={{ color: "#8E8E93", fontSize: 13, margin: 0, lineHeight: 1.5 }}>{text}</p>
            </div>
          ))}
        </div>
      )}

      <a href="/" style={{ marginTop: 28, color: "#8E8E93", fontSize: 13, textDecoration: "none" }}>
        ← Back to PNPtv
      </a>
    </div>
  );
}
