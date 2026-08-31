import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getDmPresence } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/hooks/useAuth";

type PresenceMap = Record<string, boolean>;

interface PresenceControl {
  register: (userId: string) => void;
  unregister: (userId: string) => void;
}

// Two contexts on purpose: the control surface is stable (its value never changes
// after first render) so consumer effects that depend on it don't re-fire. The
// state surface re-renders consumers when presence changes. Putting both into one
// useMemo caused an infinite loop — register() effect refired on every presence
// change, hammered /api/webapp/dm/presence per consumer, and the rate limiter
// 429'd everything, including the auth-related requests, which read as a kick.
const PresenceStateContext = createContext<PresenceMap>({});
const PresenceControlContext = createContext<PresenceControl | null>(null);

const POLL_INTERVAL_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const CHUNK_SIZE = 50;
const FIRST_REFRESH_DEBOUNCE_MS = 250;
const ERROR_THRESHOLD = 3;

async function fetchPresenceChunked(ids: string[]): Promise<{ presence: PresenceMap; errored: boolean }> {
  const out: PresenceMap = {};
  let errored = false;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    try {
      const res = await getDmPresence(chunk);
      if (res?.success && Array.isArray(res.presence)) {
        for (const p of res.presence) out[String(p.id)] = !!p.online;
      }
    } catch {
      errored = true;
    }
  }
  return { presence: out, errored };
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [presence, setPresence] = useState<PresenceMap>({});
  const interestRef = useRef<Map<string, number>>(new Map());
  const newlyRegisteredRef = useRef<Set<string>>(new Set());
  const pollTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const errorStreakRef = useRef<number>(0);
  const backoffUntilRef = useRef<number>(0);

  const refreshIds = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { presence: fresh, errored } = await fetchPresenceChunked(ids);
    if (errored) {
      errorStreakRef.current += 1;
      if (errorStreakRef.current >= ERROR_THRESHOLD) {
        backoffUntilRef.current = Date.now() + 5 * 60_000;
      }
    } else {
      errorStreakRef.current = 0;
    }
    setPresence((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const val = fresh[id] ?? false;
        if (next[id] !== val) {
          next[id] = val;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // Coalesce many synchronous register() calls (a feed renders 20 cards at once)
  // into a single batched fetch ~250ms later.
  const flushNewlyRegistered = useCallback(() => {
    const ids = Array.from(newlyRegisteredRef.current);
    newlyRegisteredRef.current.clear();
    debounceRef.current = null;
    if (ids.length > 0) refreshIds(ids);
  }, [refreshIds]);

  // Control surface — STABLE across renders. The values are wrapped in useCallback
  // and the context value is memoized once. This is what makes consumer effects
  // stop firing on every state update.
  const control = useMemo<PresenceControl>(() => {
    return {
      register: (userId: string) => {
        if (!userId) return;
        const id = String(userId);
        const current = interestRef.current.get(id) || 0;
        interestRef.current.set(id, current + 1);
        if (current === 0) {
          newlyRegisteredRef.current.add(id);
          if (debounceRef.current == null) {
            debounceRef.current = window.setTimeout(flushNewlyRegistered, FIRST_REFRESH_DEBOUNCE_MS);
          }
        }
      },
      unregister: (userId: string) => {
        if (!userId) return;
        const id = String(userId);
        const current = interestRef.current.get(id) || 0;
        if (current <= 1) interestRef.current.delete(id);
        else interestRef.current.set(id, current - 1);
      },
    };
  }, [flushNewlyRegistered]);

  // Periodic refresh for everything we're watching + socket listener + heartbeat
  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getSocket();

    const onPresenceUpdate = (data: { userId: string; online: boolean }) => {
      if (!data?.userId) return;
      const id = String(data.userId);
      setPresence((prev) =>
        prev[id] === !!data.online ? prev : { ...prev, [id]: !!data.online }
      );
    };
    socket.on("presence:update", onPresenceUpdate);

    heartbeatTimerRef.current = window.setInterval(() => {
      try { socket.emit("presence:heartbeat"); } catch { /* ignore */ }
    }, HEARTBEAT_INTERVAL_MS);

    // Circuit breaker: after ERROR_THRESHOLD consecutive fetch failures, poll
    // less aggressively for 5 minutes so we don't hammer a struggling backend.
    pollTimerRef.current = window.setInterval(() => {
      if (Date.now() < backoffUntilRef.current) return;
      const ids = Array.from(interestRef.current.keys());
      refreshIds(ids);
    }, POLL_INTERVAL_MS);

    return () => {
      socket.off("presence:update", onPresenceUpdate);
      if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      heartbeatTimerRef.current = null;
      pollTimerRef.current = null;
      debounceRef.current = null;
    };
  }, [isAuthenticated, refreshIds]);

  return (
    <PresenceControlContext.Provider value={control}>
      <PresenceStateContext.Provider value={presence}>
        {children}
      </PresenceStateContext.Provider>
    </PresenceControlContext.Provider>
  );
}

/**
 * Returns true when the given user is currently online (Redis presence key set).
 * Pass null/undefined/empty string when no user is associated — the hook becomes a no-op.
 */
export function usePresence(userId: string | null | undefined): boolean {
  const control = useContext(PresenceControlContext);
  const presence = useContext(PresenceStateContext);
  useEffect(() => {
    if (!control || !userId) return;
    control.register(userId);
    return () => control.unregister(userId);
  }, [control, userId]);
  if (!userId) return false;
  return !!presence[String(userId)];
}
