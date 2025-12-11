// Placeholder components for CCT module
// These will be implemented with full functionality as needed

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

// Email Template Preview
export function EmailTemplatePreview({ templateId, templateLabel }: { templateId: string; templateLabel: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <Eye className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Preview: {templateLabel}</DialogTitle>
        </DialogHeader>
        <div className="p-4 bg-background/50 rounded-lg">
          <p className="text-sm text-muted-foreground">Template ID: {templateId}</p>
          <p className="text-sm mt-2">Preview do template de email será exibido aqui.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Aeroporto Selector (Multi-select)
export function AeroportoSelector({ 
  value = [], 
  onChange 
}: { 
  value: string[]; 
  onChange: (value: string[]) => void;
}) {
  const aeroportos = ["GRU", "VCP", "GIG", "FRA", "AMS", "MAD", "MIA"];
  
  const toggleAeroporto = (apt: string) => {
    if (value.includes(apt)) {
      onChange(value.filter(v => v !== apt));
    } else {
      onChange([...value, apt]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {aeroportos.map(apt => (
        <Badge
          key={apt}
          variant={value.includes(apt) ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => toggleAeroporto(apt)}
        >
          {apt}
        </Badge>
      ))}
    </div>
  );
}

// Exceções Charts placeholder
export function ExcecoesCharts() {
  return (
    <div className="p-4 text-center text-muted-foreground">
      <p>Gráficos de exceções serão exibidos aqui</p>
    </div>
  );
}

// Users Management Tab placeholder
export function UsersManagementTab() {
  return (
    <div className="p-4 text-center text-muted-foreground">
      <p>Gerenciamento de usuários</p>
    </div>
  );
}

// Contacts Management Tab placeholder
export function ContactsManagementTab() {
  return (
    <div className="p-4 text-center text-muted-foreground">
      <p>Gerenciamento de contatos</p>
    </div>
  );
}

// Registrar Peso Dialog
export function RegistrarPesoDialog({ 
  open, 
  onOpenChange, 
  onSave,
  isLoading 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSave: (data: any) => void;
  isLoading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Registrar Peso</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-muted-foreground">Formulário de registro de peso</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => onSave({})} disabled={isLoading}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Editar Decolagem Dialog
export function EditarDecolagemDialog({ 
  open, 
  onOpenChange, 
  onSave,
  isLoading 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSave: (data: any) => void;
  isLoading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Editar Data de Decolagem</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-muted-foreground">Formulário de edição de decolagem</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => onSave({})} disabled={isLoading}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Tratamentos IATA Badges
export function TratamentosIATABadges({ 
  tratamentos, 
  codigosIATA 
}: { 
  tratamentos: string[]; 
  codigosIATA: Array<{ codigo: string; descricao: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tratamentos.map(codigo => {
        const info = codigosIATA.find(c => c.codigo === codigo);
        return (
          <Badge key={codigo} variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
            {codigo} {info ? `- ${info.descricao}` : ""}
          </Badge>
        );
      })}
    </div>
  );
}

// Tratamentos IATA Dialog
export function TratamentosIATADialog({ 
  open, 
  onOpenChange, 
  onSave,
  currentTratamentos = [],
  isLoading 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSave: (tratamentos: string[]) => void;
  currentTratamentos?: string[];
  isLoading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Tratamentos Especiais IATA</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-muted-foreground">Seleção de tratamentos IATA</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => onSave(currentTratamentos)} disabled={isLoading}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
