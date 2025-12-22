import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpButtonProps {
  className?: string;
}

export function HelpButton({ className }: HelpButtonProps) {
  const navigate = useNavigate();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/fin/esteira/manual")}
            className={`gap-2 border-primary/30 hover:bg-primary/10 hover:border-primary/50 ${className}`}
          >
            <HelpCircle className="h-4 w-4 text-primary" />
            <span className="text-foreground">Ajuda</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Abrir manual do usuário</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
