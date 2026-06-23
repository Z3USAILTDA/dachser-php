import { useCallback, useRef, useState } from "react";
import { apiPatch } from "@/services/apiClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Autosave por campo para edição inline na tela de detalhes do voucher.
 * Faz UPDATE parcial em t_vouchers via mariadb-proxy.update_voucher_esteira.
 */
export function useVoucherInlineSave(voucherId: string, onSaved?: () => void) {
  const { toast } = useToast();
  const [savingField, setSavingField] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  const save = useCallback(
    async (field: string, value: any) => {
      if (!voucherId) return false;
      setSavingField(field);
      try {
        const stored =
          localStorage.getItem("user") || localStorage.getItem("dachser_user");
        const localUser = stored
          ? (() => {
              try {
                return JSON.parse(stored);
              } catch {
                return null;
              }
            })()
          : null;

        const data = await apiPatch(`/api/fin/vouchers/${voucherId}/esteira`, {
          updates: { [field]: value === "" ? null : value },
          user_id: localUser?.id ? String(localUser.id) : null,
          user_name:
            localUser?.username ||
            localUser?.name ||
            localUser?.email ||
            "Sistema",
        });
        if (!data?.success) throw new Error(data?.error || "Erro ao salvar");

        setSavedField(field);
        if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => {
          setSavedField((curr) => (curr === field ? null : curr));
        }, 1500);
        onSaved?.();
        return true;
      } catch (err: any) {
        toast({
          title: "Erro ao salvar",
          description: err?.message || String(err),
          variant: "destructive",
        });
        return false;
      } finally {
        setSavingField((curr) => (curr === field ? null : curr));
      }
    },
    [voucherId, toast, onSaved],
  );

  return { save, savingField, savedField };
}
