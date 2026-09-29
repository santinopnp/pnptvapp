import React, { useEffect, useState } from "react";

interface CountdownTimerProps {
  expiresAt: string | number | Date;
  onExpire?: () => void;
  lang?: string;
  className?: string;
}

function getRemaining(expiresAt: string | number | Date) {
  const target = new Date(expiresAt).getTime();
  const diff = Math.max(0, target - Date.now());
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { diff, hours, minutes, seconds };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Countdown to a hard expiry timestamp. Ticks every second on the client;
// no server round-trip needed since the deadline is fixed at build time.
export default function CountdownTimer({ expiresAt, onExpire, lang = "es", className = "" }: CountdownTimerProps) {
  const es = lang.startsWith("es");
  const [remaining, setRemaining] = useState(() => getRemaining(expiresAt));
  const [firedExpire, setFiredExpire] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    if (remaining.diff <= 0 && !firedExpire) {
      setFiredExpire(true);
      onExpire?.();
    }
  }, [remaining.diff, firedExpire, onExpire]);

  if (remaining.diff <= 0) {
    return (
      <div className={`text-center text-sm font-semibold text-white/50 ${className}`}>
        {es ? "Esta oferta ya terminó." : "This offer has ended."}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-red-400">
        {es ? "Se acaba en" : "Ends in"}
      </span>
      <div className="flex items-center gap-1 font-mono text-lg font-black text-white">
        <span className="rounded-md bg-black/50 px-2 py-0.5">{pad(remaining.hours)}</span>
        <span className="text-white/40">:</span>
        <span className="rounded-md bg-black/50 px-2 py-0.5">{pad(remaining.minutes)}</span>
        <span className="text-white/40">:</span>
        <span className="rounded-md bg-black/50 px-2 py-0.5">{pad(remaining.seconds)}</span>
      </div>
    </div>
  );
}
