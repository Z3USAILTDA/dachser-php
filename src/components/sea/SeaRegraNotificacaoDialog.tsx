import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { X, Ship, Anchor } from 'lucide-react';
import { 
  SeaRegraNotificacao, 
  TipoProcessoMaritimo,
  FrequenciaNotificacao,
  STATUS_MARITIMOS, 
  STATUS_MARITIMOS_LABELS,
  PORTOS_COMUNS_BRASIL,
  FREQUENCIAS_NOTIFICACAO
} from '@/types/sea';

interface SeaRegraNotificacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regra?: SeaRegraNotificacao | null;
  onSave: (regra: Omit<SeaRegraNotificacao, 'id' | 'created_at' | 'updated_at'>) => Promise<boolean>;
}

export function SeaRegraNotificacaoDialog({ open, onOpenChange, regra, onSave }: SeaRegraNotificacaoDialogProps) {
  const [clienteNome, setClienteNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [tipoProcesso, setTipoProcesso] = useState<TipoProcessoMaritimo>('BOTH');
  const [portos, setPortos] = useState<string[]>([]);
  const [portoInput, setPortoInput] = useState('');
  const [eventosDisparo, setEventosDisparo] = useState<string[]>([]);
  const [frequencia, setFrequencia] = useState<FrequenciaNotificacao>('IMEDIATO');
  const [emailsImport, setEmailsImport] = useState('');
  const [emailsExport, setEmailsExport] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (regra) {
      setClienteNome(regra.cliente_nome || '');
      setCnpj(regra.cnpj_consignatario || '');
      setTipoProcesso(regra.tipo_processo || 'BOTH');
      setPortos(regra.portos || []);
      setEventosDisparo(regra.eventos_disparo || []);
      setFrequencia(regra.frequencia || 'IMEDIATO');
      setEmailsImport(regra.emails_import || '');
      setEmailsExport(regra.emails_export || '');
      setAtivo(regra.ativo);
    } else {
      setClienteNome('');
      setCnpj('');
      setTipoProcesso('BOTH');
      setPortos([]);
      setEventosDisparo([]);
      setFrequencia('IMEDIATO');
      setEmailsImport('');
      setEmailsExport('');
      setAtivo(true);
    }
  }, [regra, open]);

  const handleAddPorto = () => {
    const code = portoInput.toUpperCase().trim();
    if (code.length >= 3 && code.length <= 6 && !portos.includes(code)) {
      setPortos([...portos, code]);
      setPortoInput('');
    }
  };

  const handleRemovePorto = (code: string) => {
    setPortos(portos.filter(p => p !== code));
  };

  const toggleEvento = (evento: string) => {
    if (eventosDisparo.includes(evento)) {
      setEventosDisparo(eventosDisparo.filter(e => e !== evento));
    } else {
      setEventosDisparo([...eventosDisparo, evento]);
    }
  };

  const handleSave = async () => {
    if (!clienteNome.trim() && !cnpj.trim()) {
      return;
    }
    if (eventosDisparo.length === 0) {
      return;
    }

    setSaving(true);
    const success = await onSave({
      cliente_nome: clienteNome || null,
      cnpj_consignatario: cnpj || null,
      tipo_processo: tipoProcesso,
      portos,
      eventos_disparo: eventosDisparo,
      frequencia,
      canais: ['EMAIL_CLIENTE'], // Sempre será email cliente
      emails_import: emailsImport || null,
      emails_export: emailsExport || null,
      template_id: 'default', // Sempre default
      ativo,
    });
    setSaving(false);

    if (success) {
      onOpenChange(false);
    }
  };

  const showImportEmails = tipoProcesso === 'IMPORT' || tipoProcesso === 'BOTH';
  const showExportEmails = tipoProcesso === 'EXPORT' || tipoProcesso === 'BOTH';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-[rgba(5,6,18,0.95)] border-white/12">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Ship className="h-5 w-5 text-cyan-400" />
            {regra ? 'Editar Regra de Notificação Marítima' : 'Nova Regra de Notificação Marítima'}
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

          {/* Tipo de Processo */}
          <div className="space-y-2">
            <Label className="text-white/70">Tipo de Processo</Label>
            <RadioGroup 
              value={tipoProcesso} 
              onValueChange={(v) => setTipoProcesso(v as TipoProcessoMaritimo)}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 p-3 rounded bg-white/5 hover:bg-white/10 cursor-pointer border border-white/10">
                <RadioGroupItem value="IMPORT" className="text-cyan-400" />
                <span className="text-sm text-white/80">Importação</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded bg-white/5 hover:bg-white/10 cursor-pointer border border-white/10">
                <RadioGroupItem value="EXPORT" className="text-orange-400" />
                <span className="text-sm text-white/80">Exportação</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded bg-white/5 hover:bg-white/10 cursor-pointer border border-white/10">
                <RadioGroupItem value="BOTH" className="text-violet-400" />
                <span className="text-sm text-white/80">Ambos</span>
              </label>
            </RadioGroup>
          </div>

          {/* Portos */}
          <div className="space-y-2">
            <Label className="text-white/70">Portos (códigos UN/LOCODE ou nome)</Label>
            <div className="flex gap-2">
              <Input
                value={portoInput}
                onChange={(e) => setPortoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPorto()}
                placeholder="BRSSZ"
                maxLength={6}
                className="bg-white/5 border-white/12 text-white w-32"
              />
              <Button variant="outline" size="sm" onClick={handleAddPorto}>
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {portos.map(code => (
                <Badge key={code} variant="secondary" className="bg-cyan-500/20 text-cyan-300">
                  <Anchor className="h-3 w-3 mr-1" />
                  {code}
                  <button onClick={() => handleRemovePorto(code)} className="ml-1">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {PORTOS_COMUNS_BRASIL.filter(p => !portos.includes(p)).slice(0, 8).map(code => (
                <button
                  key={code}
                  onClick={() => setPortos([...portos, code])}
                  className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                >
                  + {code}
                </button>
              ))}
            </div>
          </div>

          {/* Eventos de Disparo */}
          <div className="space-y-2">
            <Label className="text-white/70">Eventos de Disparo (Status Marítimos)</Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {STATUS_MARITIMOS.map(evento => (
                <label
                  key={evento}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer border ${
                    eventosDisparo.includes(evento)
                      ? 'bg-cyan-500/20 border-cyan-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <Checkbox
                    checked={eventosDisparo.includes(evento)}
                    onCheckedChange={() => toggleEvento(evento)}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs text-white/90 font-medium">{evento}</span>
                    <span className="text-[10px] text-white/50">{STATUS_MARITIMOS_LABELS[evento]}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Frequência */}
          <div className="space-y-2">
            <Label className="text-white/70">Frequência de Notificação</Label>
            <RadioGroup 
              value={frequencia} 
              onValueChange={(v) => setFrequencia(v as FrequenciaNotificacao)}
              className="flex gap-4"
            >
              {FREQUENCIAS_NOTIFICACAO.map(f => (
                <label 
                  key={f.value}
                  className="flex items-center gap-2 p-3 rounded bg-white/5 hover:bg-white/10 cursor-pointer border border-white/10"
                >
                  <RadioGroupItem value={f.value} />
                  <div className="flex flex-col">
                    <span className="text-sm text-white/80">{f.label}</span>
                    <span className="text-[10px] text-white/50">{f.desc}</span>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Emails por tipo de processo */}
          <div className="grid grid-cols-2 gap-4">
            {showImportEmails && (
              <div className="space-y-2">
                <Label className="text-white/70">
                  <span className="text-cyan-400">Emails Importação</span>
                  <span className="text-white/40 text-xs ml-2">(separados por vírgula)</span>
                </Label>
                <Textarea
                  value={emailsImport}
                  onChange={(e) => setEmailsImport(e.target.value)}
                  placeholder="import@empresa.com, logistica@empresa.com"
                  className="bg-white/5 border-white/12 text-white min-h-[60px]"
                />
              </div>
            )}
            {showExportEmails && (
              <div className="space-y-2">
                <Label className="text-white/70">
                  <span className="text-orange-400">Emails Exportação</span>
                  <span className="text-white/40 text-xs ml-2">(separados por vírgula)</span>
                </Label>
                <Textarea
                  value={emailsExport}
                  onChange={(e) => setEmailsExport(e.target.value)}
                  placeholder="export@empresa.com, comercial@empresa.com"
                  className="bg-white/5 border-white/12 text-white min-h-[60px]"
                />
              </div>
            )}
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
            disabled={saving || (!clienteNome.trim() && !cnpj.trim()) || eventosDisparo.length === 0}
            className="bg-cyan-500 hover:bg-cyan-600 text-black"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
