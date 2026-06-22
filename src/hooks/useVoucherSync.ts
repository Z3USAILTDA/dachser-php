/**
 * Hook to sync voucher updates to MariaDB via API
 */
export const useVoucherSync = () => {
  console.log("Voucher sync: Using API directly, no Supabase needed");
};

export const syncVoucherToMariaDB = async (voucherId: string, updates: Record<string, any>) => {
  try {
    const resp = await fetch(`/api/fin/vouchers/${encodeURIComponent(voucherId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await resp.json();
    if (!resp.ok || !data?.success) {
      console.error("Failed to sync voucher to MariaDB:", data?.error);
      return false;
    }
    console.log("Voucher synced to MariaDB:", voucherId);
    return true;
  } catch (err) {
    console.error("Error syncing voucher to MariaDB:", err);
    return false;
  }
};
