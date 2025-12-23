import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Voucher, 
  validarProntoParaRobo, 
  ValidacaoProntoParaRobo,
  isBoleto,
  TipoExecucaoPagamento
} from "@/types/voucher";

interface ProntidaoChecklistProps {
  voucher: Partial<Voucher>;
  className?: string;
}

interface ChecklistItem {
  label: string;
  checked: boolean;
  required: boolean;
}

export const ProntidaoChecklist = ({ voucher, className }: ProntidaoChecklistProps) => {
  const items: ChecklistItem[] = [];
  
  // 1. Tipo de execução definido
  items.push({
    label: "Tipo de execução definido",
    checked: !!voucher.tipoExecucaoPagamento,
    required: true
  });

  // 2. Para boleto: linha digitável ou código de barras
  if (isBoleto(voucher.formaPagamento as any)) {
    items.push({
      label: "Linha digitável ou código de barras",
      checked: !!(voucher.linhaDigitavel || voucher.codigoBarras),
      required: true
    });
  }

  // 3. Para TED: dados bancários
  if (voucher.tipoExecucaoPagamento === "TED") {
    const hasBankData = voucher.dadosBancarios?.banco && 
                        voucher.dadosBancarios?.agencia && 
                        voucher.dadosBancarios?.conta;
    items.push({
      label: "Dados bancários completos",
      checked: !!hasBankData,
      required: true
    });
  }

  // 4. Para PIX: chave PIX
  if (voucher.tipoExecucaoPagamento === "PIX") {
    items.push({
      label: "Chave PIX cadastrada",
      checked: !!voucher.dadosBancarios?.chavePix,
      required: true
    });
  }

  // 5. Para REMESSA: voucher em lote
  if (voucher.tipoExecucaoPagamento === "REMESSA") {
    items.push({
      label: "Incluído em lote de remessa",
      checked: !!voucher.loteRemessaId,
      required: true
    });
  }

  const allChecked = items.filter(i => i.required).every(i => i.checked);
  const someChecked = items.some(i => i.checked);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        {allChecked ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : someChecked ? (
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
        ) : (
          <XCircle className="h-5 w-5 text-red-500" />
        )}
        <span className="text-sm font-medium">
          {allChecked ? "Pronto para Robô" : "Pendências para Robô"}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div 
            key={index} 
            className={cn(
              "flex items-center gap-2 text-sm",
              item.checked ? "text-green-500" : "text-muted-foreground"
            )}
          >
            {item.checked ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span>{item.label}</span>
            {item.required && !item.checked && (
              <span className="text-[10px] text-red-500 uppercase">(obrigatório)</span>
            )}
          </div>
        ))}
      </div>

      {!allChecked && (
        <p className="text-xs text-muted-foreground mt-2">
          Complete todas as pendências obrigatórias antes de enviar para o Robô.
        </p>
      )}
    </div>
  );
};
