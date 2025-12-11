import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
        <button className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#ffc800] text-black font-medium text-[0.8rem] hover:bg-[#ffe680] transition shadow-[0_0_14px_rgba(255,200,0,0.5)]">
          <Plus className="h-4 w-4" />
          Novo Processo
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[rgba(5,6,18,0.95)] border border-[rgba(255,255,255,0.12)] backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-white">Novo Processo CCT</DialogTitle>
          <DialogDescription className="text-[#aaaaaa]">
            Adicione um novo processo para monitoramento
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="house" className="text-[#aaaaaa]">House</Label>
              <Input 
                id="house" 
                placeholder="Ex: STR-15250343" 
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.15)] text-white placeholder:text-[#666]" 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="master" className="text-[#aaaaaa]">Master</Label>
              <Input 
                id="master" 
                placeholder="Ex: 020-12345678" 
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.15)] text-white placeholder:text-[#666]" 
                required 
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cliente" className="text-[#aaaaaa]">Cliente</Label>
            <Input 
              id="cliente" 
              placeholder="Nome do cliente" 
              className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.15)] text-white placeholder:text-[#666]" 
              required 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="origem" className="text-[#aaaaaa]">Aeroporto Origem</Label>
              <Input 
                id="origem" 
                placeholder="Ex: FRA" 
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.15)] text-white placeholder:text-[#666]" 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destino" className="text-[#aaaaaa]">Aeroporto Destino</Label>
              <Input 
                id="destino" 
                placeholder="Ex: GRU" 
                className="bg-[rgba(0,0,0,0.5)] border-[rgba(255,255,255,0.15)] text-white placeholder:text-[#666]" 
                required 
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button 
              type="button" 
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-full border border-[rgba(255,255,255,0.2)] text-[#aaaaaa] hover:text-white hover:bg-white/5 transition text-[0.85rem]"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isLoading}
              className="px-5 py-2 rounded-full bg-[#ffc800] text-black font-medium hover:bg-[#ffe680] transition disabled:opacity-50 text-[0.85rem]"
            >
              {isLoading ? "Criando..." : "Criar Processo"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
