import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to automatically sync voucher updates from Supabase to MariaDB
 * Uses Supabase realtime to listen for changes and propagate to t_vouchers
 */
export const useVoucherSync = () => {
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    console.log("Setting up voucher sync listener...");

    const channel = supabase
      .channel("voucher-sync")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vouchers",
        },
        async (payload) => {
          console.log("Voucher updated in Supabase:", payload.new.id);

          const updatedVoucher = payload.new as any;

          try {
            // Sync the update to MariaDB
            const { error } = await supabase.functions.invoke("mariadb-proxy", {
              body: {
                action: "update_voucher_esteira",
                voucher_id: updatedVoucher.id,
                etapa_atual: updatedVoucher.etapa_atual,
                status_baixa: updatedVoucher.status_baixa,
                status_financeiro: updatedVoucher.status_financeiro,
                status_envio_cliente: updatedVoucher.status_envio_cliente,
                comentarios_operacao: updatedVoucher.comentarios_operacao,
                comentarios_fiscal: updatedVoucher.comentarios_fiscal,
                comentarios_financeiro: updatedVoucher.comentarios_financeiro,
                ajuste_operacao: updatedVoucher.ajuste_operacao,
                ajuste_fiscal: updatedVoucher.ajuste_fiscal,
                responsavel_operacao_user_id: updatedVoucher.responsavel_operacao_user_id,
                responsavel_fiscal_user_id: updatedVoucher.responsavel_fiscal_user_id,
                responsavel_financeiro_user_id: updatedVoucher.responsavel_financeiro_user_id,
                responsavel_supervisor_user_id: updatedVoucher.responsavel_supervisor_user_id,
                aprovado_por_user_id: updatedVoucher.aprovado_por_user_id,
              },
            });

            if (error) {
              console.error("Failed to sync voucher to MariaDB:", error);
            } else {
              console.log("Voucher synced to MariaDB successfully:", updatedVoucher.id);
            }
          } catch (err) {
            console.error("Error syncing voucher to MariaDB:", err);
          }
        }
      )
      .subscribe((status) => {
        console.log("Voucher sync channel status:", status);
      });

    return () => {
      console.log("Cleaning up voucher sync listener...");
      supabase.removeChannel(channel);
      isInitialized.current = false;
    };
  }, []);
};

/**
 * Manually sync a voucher update to MariaDB
 * Use this when you need explicit control over syncing
 */
export const syncVoucherToMariaDB = async (voucherId: string, updates: Record<string, any>) => {
  try {
    const { error } = await supabase.functions.invoke("mariadb-proxy", {
      body: {
        action: "update_voucher_esteira",
        voucher_id: voucherId,
        ...updates,
      },
    });

    if (error) {
      console.error("Failed to sync voucher to MariaDB:", error);
      return false;
    }

    console.log("Voucher synced to MariaDB:", voucherId);
    return true;
  } catch (err) {
    console.error("Error syncing voucher to MariaDB:", err);
    return false;
  }
};
