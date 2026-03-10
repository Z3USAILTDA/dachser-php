import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateClientFreeTime, CreateClientFreeTimeData } from "@/hooks/useClientFreeTime";
import { supabase } from "@/integrations/supabase/client";
import { Clock, FileText, Building2, Loader2 } from "lucide-react";

interface DemurrageFreeTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ClienteResult {
  nome_cliente: string;
  dchr_customer_number: string | null;
  cnpj: string | null;
}

const CONTAINER_TYPES = ["20DV", "40DV", "40HC", "20RF", "40RF", "45HC", "20OT", "40OT", "20FR", "40FR"];

export function DemurrageFreeTimeDialog({ open, onOpenChange, onSuccess }: DemurrageFreeTimeDialogProps) {
  const [tipoFt, setTipoFt] = useState<'CONTRATO' | 'PROCESSO'>('PROCESSO');
  const [clienteNome, setClienteNome] = useState('');
  const [clienteCnpj, setClienteCnpj] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [vigenciaInicio, setVigenciaInicio] = useState('');
  const [vigenciaFim, setVigenciaFim] = useState('');
  const [mbl, setMbl] = useState('');
  const [freeTimeDays, setFreeTimeDays] = useState(14);
  const [tipoConteiner, setTipoConteiner] = useState('');
  const [notas, setNotas] = useState('');

  // Autocomplete
  const [suggestions, setSuggestions] = useState<ClienteResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createFreeTime = useCreateClientFreeTime();

  const searchClientes = async (term: string) => {
    if (term.length < 2) { setSuggestions([]); return; }
    setIsSearching(true);
    try {
      const { data } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'demurrage_search_clientes', search: term }
      });
      if (data?.success) {
        setSuggestions(data.data || []);
        setShowSuggestions(true);
      }
    } catch { /* ignore */ }
    setIsSearching(false);
  };

  const handleClienteChange = (value: string) => {
    setClienteNome(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchClientes(value), 300);
  };

  const selectCliente = (c: ClienteResult) => {
    setClienteNome(c.nome_cliente);
    setClienteCnpj(c.cnpj || '');
    setCustomerNumber(c.dchr_customer_number || '');
    setShowSuggestions(false);
  };

  const resetForm = () => {
    setTipoFt('PROCESSO');
    setClienteNome('');
    setClienteCnpj('');
    setCustomerNumber('');
    setVigenciaInicio('');
    setVigenciaFim('');
    setMbl('');
    setFreeTimeDays(14);
    setTipoConteiner('');
    setNotas('');
    setSuggestions([]);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tipoFt === 'CONTRATO') {
      if (!clienteNome.trim()) return;
      if (!vigenciaInicio || !vigenciaFim) return;
    }
    if (tipoFt === 'PROCESSO' && !mbl.trim()) return;

    const data: CreateClientFreeTimeData & { customer_number?: string; tipo_conteiner?: string } = {
      cliente_nome: tipoFt === 'CONTRATO' ? clienteNome.trim() : (mbl.trim() || 'Processo'),
      cliente_cnpj: clienteCnpj.trim() || undefined,
      tipo_ft: tipoFt,
      free_time_days: freeTimeDays,
      notas: notas.trim() || undefined,
    };

    if (customerNumber) (data as any).customer_number = customerNumber;
    if (tipoConteiner) (data as any).tipo_conteiner = tipoConteiner;

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
    } catch { /* Error handled by hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-[#1a1a1a] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#ffc800]">
            <Clock className="w-5 h-5" />
            Cadastrar Free Time
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de FT */}
          <div className="space-y-2">
            <Label className="text-gray-300">Tipo de Free Time</Label>
            <RadioGroup
              value={tipoFt}
              onValueChange={(v) => setTipoFt(v as 'CONTRATO' | 'PROCESSO')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="PROCESSO" id="dem-processo" className="border-[#ffc800] text-[#ffc800]" />
                <Label htmlFor="dem-processo" className="flex items-center gap-1 text-gray-300 cursor-pointer">
                  <FileText className="w-4 h-4" /> Por Processo
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="CONTRATO" id="dem-contrato" className="border-[#ffc800] text-[#ffc800]" />
                <Label htmlFor="dem-contrato" className="flex items-center gap-1 text-gray-300 cursor-pointer">
                  <Building2 className="w-4 h-4" /> Contrato
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Cliente com autocomplete */}
          <div className="space-y-2 relative">
            <Label className="text-gray-300">Cliente *</Label>
            <div className="relative">
              <Input
                value={clienteNome}
                onChange={(e) => handleClienteChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Buscar por nome do cliente..."
                className="bg-[#111] border-[#333] text-white placeholder:text-gray-500"
                required
              />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full bg-[#222] border border-[#444] rounded-lg mt-1 max-h-48 overflow-y-auto shadow-lg">
                {suggestions.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-[#333] text-sm transition-colors"
                    onMouseDown={() => selectCliente(c)}
                  >
                    <span className="text-white">{c.nome_cliente}</span>
                    {c.dchr_customer_number && (
                      <span className="text-gray-400 ml-2 text-xs">({c.dchr_customer_number})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CNPJ + Customer Number */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-300">CNPJ</Label>
              <Input
                value={clienteCnpj}
                onChange={(e) => setClienteCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="bg-[#111] border-[#333] text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Customer Number</Label>
              <Input
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                placeholder="Código do cliente"
                className="bg-[#111] border-[#333] text-white placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Campos por tipo */}
          {tipoFt === 'CONTRATO' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-gray-300">Vigência Início *</Label>
                <Input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} className="bg-[#111] border-[#333] text-white" required />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Vigência Fim *</Label>
                <Input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} className="bg-[#111] border-[#333] text-white" required />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-gray-300">MBL / Processo *</Label>
              <Input value={mbl} onChange={(e) => setMbl(e.target.value)} placeholder="Ex: HLCUHAM241010101" className="bg-[#111] border-[#333] text-white placeholder:text-gray-500" required />
            </div>
          )}

          {/* Free Time + Tipo Container */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-300">Free Time (dias) *</Label>
              <Input type="number" min={1} max={90} value={freeTimeDays} onChange={(e) => setFreeTimeDays(parseInt(e.target.value) || 14)} className="bg-[#111] border-[#333] text-white" required />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Tipo Container</Label>
              <Select value={tipoConteiner} onValueChange={setTipoConteiner}>
                <SelectTrigger className="bg-[#111] border-[#333] text-white">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#333]">
                  {CONTAINER_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-white hover:bg-[#333]">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label className="text-gray-300">Observações</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Anotações adicionais..." className="bg-[#111] border-[#333] text-white placeholder:text-gray-500 min-h-[60px]" />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-[#333] text-gray-300 hover:bg-[#222]">
              Cancelar
            </Button>
            <Button type="submit" disabled={createFreeTime.isPending} className="bg-[#ffc800] text-black hover:bg-[#ffdc50]">
              {createFreeTime.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
