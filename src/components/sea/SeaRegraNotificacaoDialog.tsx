import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { X, Ship, Anchor, Star } from 'lucide-react';
import { 
  SeaRegraNotificacao, 
  TipoProcessoMaritimo,
  FrequenciaNotificacao,
  STATUS_MARITIMOS, 
  STATUS_MARITIMOS_LABELS,
  FREQUENCIAS_NOTIFICACAO,
  PORTOS_GRUPOS,
  PORTOS_GRUPOS_UI,
  PORTOS_LABELS,
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
  const [portosOrigem, setPortosOrigem] = useState<string[]>([]);
  const [portosDestino, setPortosDestino] = useState<string[]>([]);
  const [portoOrigemInput, setPortoOrigemInput] = useState('');
  const [portoDestinoInput, setPortoDestinoInput] = useState('');
  const [eventosDisparo, setEventosDisparo] = useState<string[]>([]);
  const [frequencia, setFrequencia] = useState<FrequenciaNotificacao>('IMEDIATO');
  const [emailsImport, setEmailsImport] = useState('');
  const [emailsExport, setEmailsExport] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (regra) {
      setClienteNome(regra.cliente_nome || '');
      setCnpj(regra.cnpj_consignatario || '');
      setTipoProcesso(regra.tipo_processo || 'BOTH');
      // Handle migration from old portos field to new fields
      setPortosOrigem(regra.portos_origem || regra.portos || []);
      setPortosDestino(regra.portos_destino || regra.portos || []);
      setEventosDisparo(regra.eventos_disparo || []);
      setFrequencia(regra.frequencia || 'IMEDIATO');
      setEmailsImport(regra.emails_import || '');
      setEmailsExport(regra.emails_export || '');
      setAtivo(regra.ativo);
      setIsDefault(regra.is_default || false);
    } else {
      setClienteNome('');
      setCnpj('');
      setTipoProcesso('BOTH');
      setPortosOrigem([]);
      setPortosDestino([]);
      setEventosDisparo([]);
      setFrequencia('IMEDIATO');
      setEmailsImport('');
      setEmailsExport('');
      setAtivo(true);
      setIsDefault(false);
    }
  }, [regra, open]);

  const handleAddPortoOrigem = () => {
    const code = portoOrigemInput.toUpperCase().trim();
    if (code.length >= 3 && code.length <= 6 && !portosOrigem.includes(code)) {
      setPortosOrigem([...portosOrigem, code]);
      setPortoOrigemInput('');
    }
  };

  const handleAddPortoDestino = () => {
    const code = portoDestinoInput.toUpperCase().trim();
    if (code.length >= 3 && code.length <= 6 && !portosDestino.includes(code)) {
      setPortosDestino([...portosDestino, code]);
      setPortoDestinoInput('');
    }
  };

  const handleRemovePortoOrigem = (code: string) => {
    setPortosOrigem(portosOrigem.filter(p => p !== code));
  };

  const handleRemovePortoDestino = (code: string) => {
    setPortosDestino(portosDestino.filter(p => p !== code));
  };

  const handleAddGroupOrigem = (groupKey: string) => {
    const group = PORTOS_GRUPOS[groupKey as keyof typeof PORTOS_GRUPOS];
    if (group) {
      const newPorts = group.filter(p => !portosOrigem.includes(p));
      setPortosOrigem([...portosOrigem, ...newPorts]);
    }
  };

  const handleAddGroupDestino = (groupKey: string) => {
    // Special case for Santos
    if (groupKey === 'BRASIL_SANTOS') {
      if (!portosDestino.includes('BRSSZ')) {
        setPortosDestino([...portosDestino, 'BRSSZ']);
      }
      return;
    }
    const portsToAdd = PORTOS_GRUPOS[groupKey as keyof typeof PORTOS_GRUPOS];
    if (portsToAdd) {
      const newPorts = portsToAdd.filter(p => !portosDestino.includes(p));
      setPortosDestino([...portosDestino, ...newPorts]);
    }
  };

  const toggleEvento = (evento: string) => {
    if (eventosDisparo.includes(evento)) {
      setEventosDisparo(eventosDisparo.filter(e => e !== evento));
    } else {
      setEventosDisparo([...eventosDisparo, evento]);
    }
  };

  const handleSave = async () => {
    // For default rules, client name and CNPJ can be empty
    if (!isDefault && !clienteNome.trim() && !cnpj.trim()) {
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
      portos_origem: portosOrigem,
      portos_destino: portosDestino,
      eventos_disparo: eventosDisparo,
      frequencia,
      canais: ['EMAIL_CLIENTE'],
      emails_import: emailsImport || null,
      emails_export: emailsExport || null,
      template_id: 'default',
      ativo,
      is_default: isDefault,
    });
    setSaving(false);

    if (success) {
      onOpenChange(false);
    }
  };

  const showImportEmails = tipoProcesso === 'IMPORT' || tipoProcesso === 'BOTH';
  const showExportEmails = tipoProcesso === 'EXPORT' || tipoProcesso === 'BOTH';

  const getPortLabel = (code: string) => {
    return PORTOS_LABELS[code] || code;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[rgba(5,6,18,0.95)] border-white/12">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Ship className="h-5 w-5 text-cyan-400" />
            {regra ? 'Editar Regra de Notificação Marítima' : 'Nova Regra de Notificação Marítima'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Default Rule Checkbox - Highlighted */}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={isDefault}
                onCheckedChange={(checked) => setIsDefault(!!checked)}
                className="mt-0.5"
              />
              <div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  <span className="text-amber-300 font-medium">Regra Padrão</span>
                </div>
                <span className="text-white/50 text-xs">
                  Será usada como fallback para clientes sem regra específica cadastrada
                </span>
              </div>
            </label>
          </div>

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white/70">
                Nome do Cliente
                {isDefault && <span className="text-amber-400 text-xs ml-2">(opcional para regra padrão)</span>}
              </Label>
              <Input
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder={isDefault ? "Opcional" : "Ex: KLABIN"}
                className="bg-white/5 border-white/12 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">
                CNPJ Consignatário
                {isDefault && <span className="text-amber-400 text-xs ml-2">(opcional para regra padrão)</span>}
              </Label>
              <Input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder={isDefault ? "Opcional" : "Ex: 12345678000190"}
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

          {/* Portos - Split into Origin and Destination */}
          <div className="grid grid-cols-2 gap-4">
            {/* Portos de Origem */}
            <div className="space-y-2 p-4 rounded-lg bg-white/5 border border-white/10">
              <Label className="text-orange-400 font-medium">Portos de Origem</Label>
              <div className="flex gap-2">
                <Input
                  value={portoOrigemInput}
                  onChange={(e) => setPortoOrigemInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPortoOrigem()}
                  placeholder="CNSHA"
                  maxLength={6}
                  className="bg-white/5 border-white/12 text-white w-24"
                />
                <Button variant="outline" size="sm" onClick={handleAddPortoOrigem}>
                  Add
                </Button>
              </div>
              
              {/* Quick-add buttons - All regions for origin */}
              <div className="space-y-1">
                <span className="text-[9px] text-white/40 uppercase tracking-wide">Internacional</span>
                <div className="flex flex-wrap gap-1">
                  {PORTOS_GRUPOS_UI.origem.map(group => (
                    <button
                      key={group.key}
                      onClick={() => handleAddGroupOrigem(group.key)}
                      className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition"
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
                <span className="text-[9px] text-white/40 uppercase tracking-wide">Brasil</span>
                <div className="flex flex-wrap gap-1">
                  {PORTOS_GRUPOS_UI.destino.map(group => (
                    <button
                      key={`origem-${group.key}`}
                      onClick={() => handleAddGroupOrigem(group.key)}
                      className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 transition"
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Selected ports */}
              <div className="flex flex-wrap gap-1 mt-2 min-h-[40px]">
                {portosOrigem.map(code => (
                  <Badge key={code} variant="secondary" className="bg-orange-500/20 text-orange-300 text-xs">
                    <Anchor className="h-3 w-3 mr-1" />
                    {code}
                    <span className="text-orange-400/60 ml-1 text-[9px]">{getPortLabel(code)}</span>
                    <button onClick={() => handleRemovePortoOrigem(code)} className="ml-1 hover:text-white">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {portosOrigem.length === 0 && (
                  <span className="text-white/40 text-xs italic">Todos (nenhum filtro)</span>
                )}
              </div>
            </div>

            {/* Portos de Destino */}
            <div className="space-y-2 p-4 rounded-lg bg-white/5 border border-white/10">
              <Label className="text-cyan-400 font-medium">Portos de Destino</Label>
              <div className="flex gap-2">
                <Input
                  value={portoDestinoInput}
                  onChange={(e) => setPortoDestinoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPortoDestino()}
                  placeholder="BRSSZ"
                  maxLength={6}
                  className="bg-white/5 border-white/12 text-white w-24"
                />
                <Button variant="outline" size="sm" onClick={handleAddPortoDestino}>
                  Add
                </Button>
              </div>
              
              {/* Quick-add buttons - All regions for destination */}
              <div className="space-y-1">
                <span className="text-[9px] text-white/40 uppercase tracking-wide">Brasil</span>
                <div className="flex flex-wrap gap-1">
                  {PORTOS_GRUPOS_UI.destino.map(group => (
                    <button
                      key={group.key}
                      onClick={() => handleAddGroupDestino(group.key)}
                      className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition"
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
                <span className="text-[9px] text-white/40 uppercase tracking-wide">Internacional</span>
                <div className="flex flex-wrap gap-1">
                  {PORTOS_GRUPOS_UI.origem.map(group => (
                    <button
                      key={`destino-${group.key}`}
                      onClick={() => handleAddGroupDestino(group.key)}
                      className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition"
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Selected ports */}
              <div className="flex flex-wrap gap-1 mt-2 min-h-[40px]">
                {portosDestino.map(code => (
                  <Badge key={code} variant="secondary" className="bg-cyan-500/20 text-cyan-300 text-xs">
                    <Anchor className="h-3 w-3 mr-1" />
                    {code}
                    <span className="text-cyan-400/60 ml-1 text-[9px]">{getPortLabel(code)}</span>
                    <button onClick={() => handleRemovePortoDestino(code)} className="ml-1 hover:text-white">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {portosDestino.length === 0 && (
                  <span className="text-white/40 text-xs italic">Todos (nenhum filtro)</span>
                )}
              </div>
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
            disabled={saving || (!isDefault && !clienteNome.trim() && !cnpj.trim()) || eventosDisparo.length === 0}
            className="bg-cyan-500 hover:bg-cyan-600 text-black"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}