import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { X, Plus, Search, Edit2, Trash2, RefreshCw } from 'lucide-react';
import { useEmailClienteRegras } from '@/hooks/useEmailClienteRegras';
import { EmailClienteRegra, EVENTOS_AWB, AEROPORTOS_COMUNS_AWB } from '@/types/air';

interface EmailClienteRegrasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailClienteRegrasDialog({ open, onOpenChange }: EmailClienteRegrasDialogProps) {
  const { regras, loading, fetchRegras, createRegra, updateRegra, deleteRegra, toggleAtivo } = useEmailClienteRegras();
  
  // List state
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | number | null>(null);
  
  // Form state
  const [selectedRegra, setSelectedRegra] = useState<EmailClienteRegra | null>(null);
  const [isNewMode, setIsNewMode] = useState(false);
  
  // Form fields
  const [clienteNome, setClienteNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [aeroportos, setAeroportos] = useState<string[]>([]);
  const [aeroportoInput, setAeroportoInput] = useState('');
  const [eventosDisparo, setEventosDisparo] = useState<string[]>([]);
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load rules when dialog opens
  useEffect(() => {
    if (open) {
      fetchRegras();
      resetForm();
    }
  }, [open, fetchRegras]);

  // Populate form when selecting a rule
  useEffect(() => {
    if (selectedRegra) {
      setClienteNome(selectedRegra.cliente_nome || '');
      setCnpj(selectedRegra.cnpj_consignatario || '');
      setEmailCliente(selectedRegra.email_cliente || '');
      setAeroportos(selectedRegra.aeroportos || []);
      setEventosDisparo(selectedRegra.eventos_disparo || []);
      setAtivo(selectedRegra.ativo);
      setIsNewMode(false);
    }
  }, [selectedRegra]);

  const resetForm = () => {
    setSelectedRegra(null);
    setIsNewMode(false);
    setClienteNome('');
    setCnpj('');
    setEmailCliente('');
    setAeroportos([]);
    setEventosDisparo([]);
    setAtivo(true);
    setAeroportoInput('');
  };

  const handleNew = () => {
    resetForm();
    setIsNewMode(true);
  };

  const handleEdit = (regra: EmailClienteRegra) => {
    setSelectedRegra(regra);
  };

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

  const handleSave = async () => {
    if (!clienteNome.trim() && !cnpj.trim()) return;
    if (eventosDisparo.length === 0) return;

    setSaving(true);
    
    const regraData = {
      cliente_nome: clienteNome || null,
      cnpj_consignatario: cnpj || null,
      email_cliente: emailCliente || null,
      aeroportos,
      eventos_disparo: eventosDisparo,
      ativo,
    };

    let success = false;
    if (isNewMode) {
      success = await createRegra(regraData);
    } else if (selectedRegra) {
      success = await updateRegra(selectedRegra.id, regraData);
    }

    setSaving(false);
    if (success) {
      resetForm();
    }
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteRegra(deleteId);
      setDeleteId(null);
      if (selectedRegra?.id === deleteId) {
        resetForm();
      }
    }
  };

  const filteredRegras = regras.filter(r => 
    (r.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     r.cnpj_consignatario?.includes(searchTerm) ||
     r.email_cliente?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isFormDirty = isNewMode || selectedRegra;
  const canSave = (clienteNome.trim() || cnpj.trim()) && eventosDisparo.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[80vh] p-0 bg-[rgba(5,6,18,0.98)] border-white/12">
          <DialogHeader className="p-4 border-b border-white/10">
            <DialogTitle className="text-white">Regras de Notificação por E-mail</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Left Panel - List */}
            <div className="w-1/2 border-r border-white/10 flex flex-col">
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por cliente, CNPJ ou e-mail..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 bg-white/5 border-white/12 text-white"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => fetchRegras()} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <Button onClick={handleNew} className="w-full bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Regra
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white/70">Cliente</TableHead>
                      <TableHead className="text-white/70 text-center">Status</TableHead>
                      <TableHead className="text-white/70 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    ) : filteredRegras.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Nenhuma regra encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRegras.map((regra) => (
                        <TableRow 
                          key={regra.id} 
                          className={`border-white/10 cursor-pointer transition-colors ${selectedRegra?.id === regra.id ? 'bg-primary/20' : 'hover:bg-white/5'}`}
                          onClick={() => handleEdit(regra)}
                        >
                          <TableCell className="text-white">
                            <div className="font-medium">{regra.cliente_nome || '-'}</div>
                            <div className="text-xs text-muted-foreground">{regra.cnpj_consignatario || '-'}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={regra.ativo ? 'default' : 'secondary'} className={regra.ativo ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                              {regra.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); handleEdit(regra); }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-400 hover:text-red-300"
                              onClick={(e) => { e.stopPropagation(); setDeleteId(regra.id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="p-3 border-t border-white/10 text-xs text-muted-foreground">
                Total: {regras.length} | Ativos: {regras.filter(r => r.ativo).length}
              </div>
            </div>

            {/* Right Panel - Form */}
            <div className="w-1/2 flex flex-col">
              {isFormDirty ? (
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-5">
                    <div className="text-lg font-semibold text-white mb-4">
                      {isNewMode ? 'Nova Regra' : 'Editar Regra'}
                    </div>

                    {/* Cliente */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-white/70">Nome do Cliente</Label>
                        <Input
                          value={clienteNome}
                          onChange={(e) => setClienteNome(e.target.value)}
                          placeholder="Ex: EMPRESA ABC"
                          className="bg-white/5 border-white/12 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white/70">CNPJ</Label>
                        <Input
                          value={cnpj}
                          onChange={(e) => setCnpj(e.target.value)}
                          placeholder="Ex: 12345678000190"
                          className="bg-white/5 border-white/12 text-white"
                        />
                      </div>
                    </div>

                    {/* E-mail Cliente */}
                    <div className="space-y-2">
                      <Label className="text-white/70">E-mail do Cliente</Label>
                      <Input
                        type="email"
                        value={emailCliente}
                        onChange={(e) => setEmailCliente(e.target.value)}
                        placeholder="Ex: cliente@empresa.com"
                        className="bg-white/5 border-white/12 text-white"
                      />
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
                          <Badge key={code} variant="secondary" className="bg-primary/20 text-primary">
                            {code}
                            <button onClick={() => handleRemoveAeroporto(code)} className="ml-1">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {AEROPORTOS_COMUNS_AWB.filter(a => !aeroportos.includes(a)).map(code => (
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
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {EVENTOS_AWB.map(evento => (
                          <label
                            key={evento}
                            className="flex items-center gap-2 p-2 rounded bg-white/5 hover:bg-white/10 cursor-pointer"
                          >
                            <Checkbox
                              checked={eventosDisparo.includes(evento)}
                              onCheckedChange={() => toggleEvento(evento)}
                            />
                            <span className="text-xs text-white/80">{evento}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Ativo */}
                    <div className="flex items-center gap-3">
                      <Switch checked={ativo} onCheckedChange={setAtivo} />
                      <Label className="text-white/80">Regra ativa</Label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                      <Button 
                        variant="ghost" 
                        onClick={resetForm}
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleSave} 
                        disabled={saving || !canSave}
                        className="flex-1 bg-primary hover:bg-primary/90"
                      >
                        {saving ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>Selecione uma regra para editar</p>
                    <p className="text-sm mt-1">ou clique em "Nova Regra"</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-[rgba(5,6,18,0.98)] border-white/12">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir Regra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra de notificação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
