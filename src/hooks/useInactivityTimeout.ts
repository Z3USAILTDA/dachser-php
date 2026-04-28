import { useEffect, useRef } from "react";

interface Options {
  /** Tempo total de inatividade até disparar onTimeout (ms). Default 20 min. */
  timeoutMs?: number;
  /** Antecedência para disparar onWarning antes do timeout (ms). Default 1 min. */
  warningLeadMs?: number;
  /** Habilita o monitoramento. Quando false, nenhum listener é registrado. */
  enabled?: boolean;
  onWarning?: () => void;
  onTimeout: () => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
];

/**
 * Monitora interação global do usuário e dispara onTimeout após N ms de inatividade.
 * Throttle interno de 5s evita reagendar a cada mousemove.
 */
export function useInactivityTimeout({
  timeoutMs = 20 * 60 * 1000,
  warningLeadMs = 60 * 1000,
  enabled = true,
  onWarning,
  onTimeout,
}: Options) {
  const timeoutRef = useRef<number | null>(null);
  const warningRef = useRef<number | null>(null);
  const lastResetRef = useRef<number>(0);
  const onTimeoutRef = useRef(onTimeout);
  const onWarningRef = useRef(onWarning);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
    onWarningRef.current = onWarning;
  }, [onTimeout, onWarning]);

  useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (warningRef.current) window.clearTimeout(warningRef.current);
      timeoutRef.current = null;
      warningRef.current = null;
    };

    const scheduleTimers = () => {
      clearTimers();
      if (warningLeadMs > 0 && warningLeadMs < timeoutMs && onWarningRef.current) {
        warningRef.current = window.setTimeout(() => {
          onWarningRef.current?.();
        }, timeoutMs - warningLeadMs);
      }
      timeoutRef.current = window.setTimeout(() => {
        onTimeoutRef.current();
      }, timeoutMs);
    };

    const handleActivity = () => {
      const now = Date.now();
      // Throttle: só reagenda se passou >5s desde o último reset
      if (now - lastResetRef.current < 5000) return;
      lastResetRef.current = now;
      scheduleTimers();
    };

    scheduleTimers();
    lastResetRef.current = Date.now();

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [enabled, timeoutMs, warningLeadMs]);
}
