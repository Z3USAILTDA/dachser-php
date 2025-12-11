import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfiles } from "@/hooks/useCCTData";
import { toast } from "sonner";
import type { ProcessoCCT } from "@/types/cct";

interface AssignAnalistaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processo: ProcessoCCT | null;
}

export function AssignAnalistaDialog({ open, onOpenChange, processo }: AssignAnalistaDialogProps) {
  const { data: profiles = [] } = useProfiles();
  const [selectedAnalista, setSelectedAnalista] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAssign = async () => {
    if (!selectedAnalista || !processo) return;
    
    setIsLoading(true);
    // TODO: Implement real assignment logic
    await new Promise(r => setTimeout(r, 500));
    toast.success("Analista atribuído com sucesso");
    setIsLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Atribuir Analista</DialogTitle>
          <DialogDescription>
            Selecione o analista responsável pelo processo {processo?.shipment.house}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Select value={selectedAnalista} onValueChange={setSelectedAnalista}>
            <SelectTrigger className="bg-background/50">
              <SelectValue placeholder="Selecione um analista" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAssign} 
              disabled={!selectedAnalista || isLoading}
              className="bg-primary text-primary-foreground"
            >
              {isLoading ? "Atribuindo..." : "Atribuir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
