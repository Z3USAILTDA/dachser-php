import { useEffect, useState, useCallback } from "react";
import { Bell, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface Row {
  origem: "VOUCHER" | "SPO";
  nd: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  data_insert: string | null;
}

const fmtDate = (v: string | null) => {
  if (!v) return "—";
  try {
    return format(new Date(String(v).replace("Z", "")), "dd/MM/yyyy");
  } catch {
    return String(v);
  }
};

const fmtDateTime = (v: string | null) => {
  if (!v) return "—";
  try {
    return format(new Date(String(v).replace("Z", "")), "dd/MM/yyyy HH:mm");
  } catch {
    return String(v);
  }
};

export const DatasAntigasBell = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_datas_emissao_vencimento_antigas" },
      });
      if (error) throw error;
      const list: Row[] = Array.isArray(data?.rows) ? data.rows : [];
      setRows(list);
    } catch (e) {
      // silent — não exibir banner de erro de DB (ver memória core)
      console.warn("[DatasAntigasBell] fetch falhou", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const total = rows.length;
  const hasAlerts = total > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur-sm transition text-[0.8rem] ${
          hasAlerts
            ? "border-[rgba(239,68,68,.55)] bg-[rgba(0,0,0,.70)] text-[#fecaca] hover:bg-[rgba(0,0,0,.85)] hover:border-[rgba(239,68,68,.85)]"
            : "border-[rgba(255,255,255,.18)] bg-[rgba(0,0,0,.70)] text-[#aaaaaa] hover:text-white hover:bg-[rgba(0,0,0,.9)]"
        }`}
        title={
          hasAlerts
            ? `${total} processo(s) com data_emissao/data_vencimento em 2024 ou anterior`
            : "Sem alertas de datas antigas"
        }
      >
        <Bell className={`h-4 w-4 ${hasAlerts ? "text-[#ef4444]" : ""}`} />
        <span className="hidden sm:inline">Alertas</span>
        {hasAlerts && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#ef4444] text-white text-[0.7rem] font-semibold">
            {total > 999 ? "999+" : total}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl bg-[rgba(5,6,18,.97)] border-[rgba(255,255,255,.12)] text-[#f5f5f5]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#ffc800]">
              <AlertTriangle className="h-5 w-5" />
              Processos com datas anteriores a 2025
            </DialogTitle>
            <DialogDescription className="text-[#aaa]">
              Foram enviados para a base{" "}
              <span className="font-semibold text-[#f5f5f5]">{total}</span>{" "}
              processo(s) com <code>data_emissao</code> ou{" "}
              <code>data_vencimento</code> em 2024 ou anterior.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="gap-1.5 text-[#888] hover:text-[#ffc800] hover:bg-[rgba(255,200,0,.1)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          <ScrollArea className="h-[55vh] rounded-md border border-[rgba(255,255,255,.08)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[rgba(0,0,0,.85)] backdrop-blur-sm text-[#aaa] text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Origem</th>
                  <th className="text-left px-3 py-2 font-medium">ND / SPO</th>
                  <th className="text-left px-3 py-2 font-medium">Emissão</th>
                  <th className="text-left px-3 py-2 font-medium">Vencimento</th>
                  <th className="text-left px-3 py-2 font-medium">Inserido em</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-[#888]">
                      Nenhum processo com datas antigas no momento.
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr
                    key={`${r.origem}-${r.nd}-${i}`}
                    className="border-t border-[rgba(255,255,255,.06)] hover:bg-[rgba(255,255,255,.03)]"
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[0.7rem] font-medium ${
                          r.origem === "SPO"
                            ? "bg-[rgba(59,130,246,.15)] text-[#93c5fd]"
                            : "bg-[rgba(168,85,247,.15)] text-[#d8b4fe]"
                        }`}
                      >
                        {r.origem}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[#f5f5f5]">{r.nd || "—"}</td>
                    <td className="px-3 py-2">{fmtDate(r.data_emissao)}</td>
                    <td className="px-3 py-2">{fmtDate(r.data_vencimento)}</td>
                    <td className="px-3 py-2 text-[#aaa]">{fmtDateTime(r.data_insert)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>

          {total >= 500 && (
            <p className="text-xs text-[#888] mt-2">
              Mostrando os 500 registros mais recentes.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DatasAntigasBell;
