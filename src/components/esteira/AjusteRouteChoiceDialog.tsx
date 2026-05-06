import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const ETAPA_LABEL: Record<string, string> = {
  OPERACAO: "Operação",
  FISCAL: "Fiscal",
  FINANCEIRO: "Financeiro",
  SUPERVISOR: "Supervisor",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requesterStage: string;          // ex.: FINANCEIRO
  normalNextStage: string;         // ex.: FISCAL
  choice: "REQUESTER" | "NORMAL";
  onChoiceChange: (v: "REQUESTER" | "NORMAL") => void;
  onConfirm: () => void;
  loading?: boolean;
}

export const AjusteRouteChoiceDialog = ({
  open,
  onOpenChange,
  requesterStage,
  normalNextStage,
  choice,
  onChoiceChange,
  onConfirm,
  loading,
}: Props) => {
  const reqLabel = ETAPA_LABEL[requesterStage] || requesterStage;
  const normLabel = ETAPA_LABEL[normalNextStage] || normalNextStage;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Para onde enviar este voucher?</AlertDialogTitle>
          <AlertDialogDescription>
            Este voucher voltou de um ajuste solicitado por <strong>{reqLabel}</strong>.
            Escolha como deseja prosseguir após a aprovação.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup
          value={choice}
          onValueChange={(v) => onChoiceChange(v as "REQUESTER" | "NORMAL")}
          className="space-y-3 py-2"
        >
          <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30">
            <RadioGroupItem value="REQUESTER" id="route-requester" className="mt-1" />
            <Label htmlFor="route-requester" className="cursor-pointer flex-1 font-normal">
              <div className="font-medium">Retornar para {reqLabel} (recomendado)</div>
              <div className="text-xs text-muted-foreground mt-1">
                Voltar diretamente para quem solicitou o ajuste.
              </div>
            </Label>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30">
            <RadioGroupItem value="NORMAL" id="route-normal" className="mt-1" />
            <Label htmlFor="route-normal" className="cursor-pointer flex-1 font-normal">
              <div className="font-medium">Seguir o fluxo normal → {normLabel}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Reenviar pelo fluxo padrão da esteira.
              </div>
            </Label>
          </div>
        </RadioGroup>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading}>
            {loading ? "Enviando..." : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
