import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function NovoShipmentDialog() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Implement real creation logic
    await new Promise(r => setTimeout(r, 500));
    toast.success("Shipment criado com sucesso");
    setIsLoading(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-5">
          <Plus className="h-4 w-4 mr-2" />
          Novo Processo
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Novo Processo CCT</DialogTitle>
          <DialogDescription>
            Adicione um novo processo para monitoramento
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="house">House</Label>
              <Input id="house" placeholder="Ex: STR-15250343" className="bg-background/50" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="master">Master</Label>
              <Input id="master" placeholder="Ex: 020-12345678" className="bg-background/50" required />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cliente">Cliente</Label>
            <Input id="cliente" placeholder="Nome do cliente" className="bg-background/50" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="origem">Aeroporto Origem</Label>
              <Input id="origem" placeholder="Ex: FRA" className="bg-background/50" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destino">Aeroporto Destino</Label>
              <Input id="destino" placeholder="Ex: GRU" className="bg-background/50" required />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-primary text-primary-foreground">
              {isLoading ? "Criando..." : "Criar Processo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
