import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to sync voucher updates to MariaDB
 * Note: Realtime sync was removed as vouchers table is now in MariaDB
 * Use syncVoucherToMariaDB for manual sync when needed
 */
export const useVoucherSync = () => {
  // Realtime sync removed - vouchers table is now in MariaDB
  // Use syncVoucherToMariaDB for explicit sync operations
  console.log("Voucher sync: Using MariaDB directly, no Supabase realtime needed");
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
