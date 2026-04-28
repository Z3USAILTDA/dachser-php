import { useEffect, useState } from "react";

/**
 * Hook que retorna se a aba do navegador está visível.
 * Usado para pausar pollings quando o usuário não está olhando.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );

  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return isVisible;
}
