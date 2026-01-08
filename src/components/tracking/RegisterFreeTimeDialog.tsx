import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateClientFreeTime, CreateClientFreeTimeData } from "@/hooks/useClientFreeTime";
import { Clock, FileText, Building2 } from "lucide-react";

interface RegisterFreeTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultMbl?: string;
  defaultCliente?: string;
}

const ARMADORES = [
  "HAPAG-LLOYD",
  "MSC",
  "MAERSK",
  "CMA CGM",
  "COSCO",
  "ONE",
  "EVERGREEN",
  "YANG MING",
  "HMM",
  "ZIM",
  "PIL",
  "WAN HAI",
];

export function RegisterFreeTimeDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  defaultMbl,
  defaultCliente 
}: RegisterFreeTimeDialogProps) {
  const [tipoFt, setTipoFt] = useState<'CONTRATO' | 'PROCESSO'>('CONTRATO');
  const [clienteNome, setClienteNome] = useState(defaultCliente || '');
  const [clienteCnpj, setClienteCnpj] = useState('');
  const [vigenciaInicio, setVigenciaInicio] = useState('');
  const [vigenciaFim, setVigenciaFim] = useState('');
  const [mbl, setMbl] = useState(defaultMbl || '');
  const [freeTimeDays, setFreeTimeDays] = useState(14);
  const [armador, setArmador] = useState('');
  const [notas, setNotas] = useState('');

  const createFreeTime = useCreateClientFreeTime();

  const resetForm = () => {
    setTipoFt('CONTRATO');
    setClienteNome(defaultCliente || '');
    setClienteCnpj('');
    setVigenciaInicio('');
    setVigenciaFim('');
    setMbl(defaultMbl || '');
    setFreeTimeDays(14);
    setArmador('');
    setNotas('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clienteNome.trim()) {
      return;
    }

    if (tipoFt === 'CONTRATO' && (!vigenciaInicio || !vigenciaFim)) {
      return;
    }

    if (tipoFt === 'PROCESSO' && !mbl.trim()) {
      return;
    }

    const data: CreateClientFreeTimeData = {
      cliente_nome: clienteNome.trim(),
      cliente_cnpj: clienteCnpj.trim() || undefined,
      tipo_ft: tipoFt,
      free_time_days: freeTimeDays,
      armador: armador || undefined,
      notas: notas.trim() || undefined,
    };

    if (tipoFt === 'CONTRATO') {
      data.vigencia_inicio = vigenciaInicio;
      data.vigencia_fim = vigenciaFim;
    } else {
      data.mbl = mbl.trim();
    }

    try {
      await createFreeTime.mutateAsync(data);
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-[#1a1a1a] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#ffc800]">
            <Clock className="w-5 h-5" />
            Registrar Free Time
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de FT */}
          <div className="space-y-2">
            <Label className="text-gray-300">Tipo de Free Time</Label>
            <RadioGroup 
              value={tipoFt} 
              onValueChange={(value) => setTipoFt(value as 'CONTRATO' | 'PROCESSO')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="CONTRATO" id="contrato" className="border-[#ffc800] text-[#ffc800]" />
                <Label htmlFor="contrato" className="flex items-center gap-1 text-gray-300 cursor-pointer">
                  <Building2 className="w-4 h-4" />
                  Contrato
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="PROCESSO" id="processo" className="border-[#ffc800] text-[#ffc800]" />
                <Label htmlFor="processo" className="flex items-center gap-1 text-gray-300 cursor-pointer">
                  <FileText className="w-4 h-4" />
                  Por Processo
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="clienteNome" className="text-gray-300">Nome do Cliente *</Label>
              <Input
                id="clienteNome"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Ex: Empresa ABC Ltda"
                className="bg-[#111] border-[#333] text-white placeholder:text-gray-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteCnpj" className="text-gray-300">CNPJ</Label>
              <Input
                id="clienteCnpj"
                value={clienteCnpj}
                onChange={(e) => setClienteCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="bg-[#111] border-[#333] text-white placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Campos condicionais por tipo */}
          {tipoFt === 'CONTRATO' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="vigenciaInicio" className="text-gray-300">Vigência Início *</Label>
                <Input
                  id="vigenciaInicio"
                  type="date"
                  value={vigenciaInicio}
                  onChange={(e) => setVigenciaInicio(e.target.value)}
                  className="bg-[#111] border-[#333] text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vigenciaFim" className="text-gray-300">Vigência Fim *</Label>
                <Input
                  id="vigenciaFim"
                  type="date"
                  value={vigenciaFim}
                  onChange={(e) => setVigenciaFim(e.target.value)}
                  className="bg-[#111] border-[#333] text-white"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mbl" className="text-gray-300">MBL / Processo *</Label>
              <Input
                id="mbl"
                value={mbl}
                onChange={(e) => setMbl(e.target.value)}
                placeholder="Ex: HLCUHAM241010101"
                className="bg-[#111] border-[#333] text-white placeholder:text-gray-500"
                required
              />
            </div>
          )}

          {/* Free Time e Armador */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="freeTimeDays" className="text-gray-300">Free Time (dias) *</Label>
              <Input
                id="freeTimeDays"
                type="number"
                min={1}
                max={90}
                value={freeTimeDays}
                onChange={(e) => setFreeTimeDays(parseInt(e.target.value) || 14)}
                className="bg-[#111] border-[#333] text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="armador" className="text-gray-300">Armador</Label>
              <Select value={armador} onValueChange={setArmador}>
                <SelectTrigger className="bg-[#111] border-[#333] text-white">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#333]">
                  {ARMADORES.map((arm) => (
                    <SelectItem key={arm} value={arm} className="text-white hover:bg-[#333]">
                      {arm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notas" className="text-gray-300">Observações</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Anotações adicionais..."
              className="bg-[#111] border-[#333] text-white placeholder:text-gray-500 min-h-[60px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="border-[#333] text-gray-300 hover:bg-[#222]"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createFreeTime.isPending}
              className="bg-[#ffc800] text-black hover:bg-[#ffdc50]"
            >
              {createFreeTime.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
