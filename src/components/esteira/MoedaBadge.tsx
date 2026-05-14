import { Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MoedaBadgeProps {
  moeda?: string | null;
  className?: string;
}

/**
 * Renderiza um badge dourado ao lado do Nº SPO indicando a moeda do voucher.
 * - BRL ou vazio: nada
 * - XXX (moeda estrangeira não especificada): ícone Globe + tooltip "Moeda estrangeira"
 * - Demais (USD, EUR, ...): apenas o código da moeda
 */
export function MoedaBadge({ moeda, className = "" }: MoedaBadgeProps) {
  if (!moeda || moeda === "BRL") return null;

  const base =
    "inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md bg-[#F5B843]/15 text-[#F5B843] border border-[#F5B843]/40 text-[10px] font-semibold leading-none " +
    className;

  if (moeda === "XXX") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={base} aria-label="Moeda estrangeira">
              <Globe className="h-3 w-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Moeda estrangeira</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return <span className={base}>{moeda}</span>;
}
