import React, { createContext, useCallback, useContext, useState } from "react";

export interface FloatingCallSession {
  token: string;
  livekitUrl: string;
  roomName: string;
  callerName: string;
  callerUserId?: string | null;
  callType: "dm" | "booking";
  /** Called when the user ends the call — used to emit socket events, etc. */
  onEnd?: () => void;
}

interface FloatingCallCtx {
  activeCall: FloatingCallSession | null;
  isMinimized: boolean;
  openCall: (call: FloatingCallSession) => void;
  closeCall: () => void;
  minimize: () => void;
  expand: () => void;
}

const Ctx = createContext<FloatingCallCtx | null>(null);

export function FloatingCallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<FloatingCallSession | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  const openCall = useCallback((call: FloatingCallSession) => {
    setActiveCall(call);
    setIsMinimized(false);
  }, []);

  const closeCall = useCallback(() => {
    setActiveCall((prev) => {
      prev?.onEnd?.();
      return null;
    });
    setIsMinimized(false);
  }, []);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const expand = useCallback(() => setIsMinimized(false), []);

  return (
    <Ctx.Provider value={{ activeCall, isMinimized, openCall, closeCall, minimize, expand }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFloatingCall(): FloatingCallCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFloatingCall must be used inside FloatingCallProvider");
  return ctx;
}
