import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { CCTRegraNotificacao, CanalNotificacao, CODIGOS_EVENTO } from '@/types/cct';

interface RegraNotificacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regra?: CCTRegraNotificacao | null;
  onSave: (regra: Omit<CCTRegraNotificacao, 'id' | 'created_at' | 'updated_at'>) => Promise<boolean>;
}

const CANAIS: { value: CanalNotificacao; label: string }[] = [
  { value: 'EMAIL_CLIENTE', label: 'E-mail Cliente' },
  { value: 'EMAIL_INTERNO', label: 'E-mail Interno' },
  { value: 'WEBHOOK', label: 'Webhook' },
];

const AEROPORTOS_COMUNS = ['GRU', 'VCP', 'GIG', 'CNF', 'POA', 'CWB', 'SSA', 'REC', 'FOR', 'BSB'];

export function RegraNotificacaoDialog({ open, onOpenChange, regra, onSave }: RegraNotificacaoDialogProps) {
  const [clienteNome, setClienteNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [aeroportos, setAeroportos] = useState<string[]>([]);
  const [aeroportoInput, setAeroportoInput] = useState('');
  const [eventosDisparo, setEventosDisparo] = useState<string[]>([]);
  const [canais, setCanais] = useState<CanalNotificacao[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (regra) {
      setClienteNome(regra.cliente_nome || '');
      setCnpj(regra.cnpj_consignatario || '');
      setAeroportos(regra.aeroportos || []);
      setEventosDisparo(regra.eventos_disparo || []);
      setCanais(regra.canais || []);
      setTemplateId(regra.template_id || '');
      setAtivo(regra.ativo);
    } else {
      setClienteNome('');
      setCnpj('');
      setAeroportos([]);
      setEventosDisparo([]);
      setCanais([]);
      setTemplateId('default');
      setAtivo(true);
    }
  }, [regra, open]);

  const handleAddAeroporto = () => {
    const code = aeroportoInput.toUpperCase().trim();
    if (code.length === 3 && !aeroportos.includes(code)) {
      setAeroportos([...aeroportos, code]);
      setAeroportoInput('');
    }
  };

  const handleRemoveAeroporto = (code: string) => {
    setAeroportos(aeroportos.filter(a => a !== code));
  };

  const toggleEvento = (evento: string) => {
    if (eventosDisparo.includes(evento)) {
      setEventosDisparo(eventosDisparo.filter(e => e !== evento));
    } else {
      setEventosDisparo([...eventosDisparo, evento]);
    }
  };

  const toggleCanal = (canal: CanalNotificacao) => {
    if (canais.includes(canal)) {
      setCanais(canais.filter(c => c !== canal));
    } else {
      setCanais([...canais, canal]);
    }
  };

  const handleSave = async () => {
    if (!clienteNome.trim() && !cnpj.trim()) {
      return;
    }
    if (eventosDisparo.length === 0 || canais.length === 0) {
      return;
    }

    setSaving(true);
    const success = await onSave({
      cliente_nome: clienteNome || null,
      cnpj_consignatario: cnpj || null,
      aeroportos,
      eventos_disparo: eventosDisparo,
      canais,
      template_id: templateId || 'default',
      ativo,
    });
    setSaving(false);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[rgba(5,6,18,0.95)] border-white/12">
        <DialogHeader>
          <DialogTitle className="text-white">
            {regra ? 'Editar Regra de Notificação' : 'Nova Regra de Notificação'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Cliente */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white/70">Nome do Cliente</Label>
              <Input
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Ex: KLABIN"
                className="bg-white/5 border-white/12 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">CNPJ Consignatário</Label>
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="Ex: 12345678000190"
                className="bg-white/5 border-white/12 text-white"
              />
            </div>
          </div>

          {/* Aeroportos */}
          <div className="space-y-2">
            <Label className="text-white/70">Aeroportos (códigos IATA)</Label>
            <div className="flex gap-2">
              <Input
                value={aeroportoInput}
                onChange={(e) => setAeroportoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAddAeroporto()}
                placeholder="GRU"
                maxLength={3}
                className="bg-white/5 border-white/12 text-white w-24"
              />
              <Button variant="outline" size="sm" onClick={handleAddAeroporto}>
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {aeroportos.map(code => (
                <Badge key={code} variant="secondary" className="bg-amber-500/20 text-amber-300">
                  {code}
                  <button onClick={() => handleRemoveAeroporto(code)} className="ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {AEROPORTOS_COMUNS.filter(a => !aeroportos.includes(a)).map(code => (
                <button
                  key={code}
                  onClick={() => setAeroportos([...aeroportos, code])}
                  className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                >
                  + {code}
                </button>
              ))}
            </div>
          </div>

          {/* Eventos de Disparo */}
          <div className="space-y-2">
            <Label className="text-white/70">Eventos de Disparo</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CODIGOS_EVENTO.map(evento => (
                <label
                  key={evento}
                  className="flex items-center gap-2 p-2 rounded bg-white/5 hover:bg-white/10 cursor-pointer"
                >
                  <Checkbox
                    checked={eventosDisparo.includes(evento)}
                    onCheckedChange={() => toggleEvento(evento)}
                  />
                  <span className="text-xs text-white/80">{evento.replace(/_/g, ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Canais */}
          <div className="space-y-2">
            <Label className="text-white/70">Canais de Notificação</Label>
            <div className="flex gap-4">
              {CANAIS.map(canal => (
                <label
                  key={canal.value}
                  className="flex items-center gap-2 p-3 rounded bg-white/5 hover:bg-white/10 cursor-pointer"
                >
                  <Checkbox
                    checked={canais.includes(canal.value)}
                    onCheckedChange={() => toggleCanal(canal.value)}
                  />
                  <span className="text-sm text-white/80">{canal.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Template */}
          <div className="space-y-2">
            <Label className="text-white/70">Template ID</Label>
            <Input
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="default"
              className="bg-white/5 border-white/12 text-white"
            />
          </div>

          {/* Ativo */}
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={ativo}
              onCheckedChange={(checked) => setAtivo(!!checked)}
            />
            <span className="text-white/80">Regra ativa</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || (!clienteNome.trim() && !cnpj.trim()) || eventosDisparo.length === 0 || canais.length === 0}
            className="bg-amber-500 hover:bg-amber-600 text-black"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
