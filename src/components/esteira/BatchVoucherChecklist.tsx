import { Check, AlertTriangle, Minus } from "lucide-react";

export interface ChecklistItem {
  voucher_id: string;
  numero_spo: string | null;
  fornecedor: string | null;
  valor: number | null;
  vencimento: string | null;
  forma_pagamento: string | null;
  fatura: string | null;
  temFatura: boolean;
  temBoleto: boolean;
  requerBoleto: boolean;
  status: string;
  etapa_destino?: string | null;
}

const ETAPA_LABEL: Record<string, string> = {
  FISCAL: "Fiscal",
  FINANCEIRO: "Financeiro",
  SUPERVISOR: "Supervisor",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETO: "Completo",
  PENDENTE_FATURA: "Falta fatura",
  PENDENTE_BOLETO: "Falta boleto",
  PENDENTE_FATURA_E_BOLETO: "Falta fatura e boleto",
  COM_ERRO: "Com erro",
};

const STATUS_BADGE: Record<string, string> = {
  COMPLETO: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  PENDENTE_FATURA: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  PENDENTE_BOLETO: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  PENDENTE_FATURA_E_BOLETO: "bg-destructive/15 text-destructive border-destructive/30",
  COM_ERRO: "bg-destructive/15 text-destructive border-destructive/30",
};

const fmtDate = (v: string | null) => {
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
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
  const badgeCls = STATUS_BADGE[item.status] || "bg-muted/40 text-muted-foreground border-border/60";
  const label = STATUS_LABEL[item.status] || item.status;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border bg-card/40 p-3.5 transition-all hover:bg-primary/5 hover:border-primary/30 ${
        selected ? "ring-2 ring-primary/60 border-primary/50 bg-primary/5" : "border-border/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
          SPO {item.numero_spo || "—"}
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">
          {item.valor != null
            ? item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "—"}
        </span>
      </div>

      <div className="mt-2 truncate text-sm font-medium text-foreground">
        {item.fornecedor || "—"}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.forma_pagamento || "—"}
        </span>
        <span className="inline-flex items-center rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
          venc. {fmtDate(item.vencimento)}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
              item.temFatura
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
            }`}
          >
            {item.temFatura ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            Fatura
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
              !item.requerBoleto
                ? "bg-muted/30 text-muted-foreground border-border/60"
                : item.temBoleto
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
            }`}
          >
            {!item.requerBoleto ? (
              <Minus className="h-3 w-3" />
            ) : item.temBoleto ? (
              <Check className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            Boleto {item.requerBoleto ? "" : "n/a"}
          </span>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}
        >
          {label}
        </span>
      </div>
    </button>
  );
}
