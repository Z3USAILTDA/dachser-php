import { Check, AlertTriangle, X } from "lucide-react";

export interface ChecklistItem {
  voucher_id: string;
  fornecedor: string | null;
  valor: number | null;
  vencimento: string | null;
  forma_pagamento: string | null;
  fatura: string | null;
  temFatura: boolean;
  temBoleto: boolean;
  requerBoleto: boolean;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETO: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  PENDENTE_FATURA: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  PENDENTE_BOLETO: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  PENDENTE_FATURA_E_BOLETO: "text-red-400 border-red-500/40 bg-red-500/10",
  COM_ERRO: "text-red-400 border-red-500/40 bg-red-500/10",
};

export function BatchVoucherChecklist({
  item,
  selected,
  onSelect,
}: {
  item: ChecklistItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const cls = STATUS_COLORS[item.status] || "text-muted-foreground border-white/10 bg-white/5";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition ${
        selected ? "ring-2 ring-primary " : ""
      }${cls}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{item.fornecedor || "—"}</div>
        <div className="text-xs whitespace-nowrap">
          {item.valor != null
            ? item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "—"}
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {item.forma_pagamento || "—"} • venc. {item.vencimento || "—"}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs">
        <span className="flex items-center gap-1">
          {item.temFatura ? <Check className="h-3 w-3 text-emerald-400" /> : <X className="h-3 w-3 text-red-400" />}
          Fatura
        </span>
        <span className="flex items-center gap-1">
          {item.requerBoleto ? (
            item.temBoleto ? <Check className="h-3 w-3 text-emerald-400" /> : <AlertTriangle className="h-3 w-3 text-amber-400" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          Boleto {item.requerBoleto ? "obrigatório" : "n/a"}
        </span>
      </div>
      <div className="text-[11px] mt-1 font-semibold uppercase tracking-wide">{item.status}</div>
    </button>
  );
}
