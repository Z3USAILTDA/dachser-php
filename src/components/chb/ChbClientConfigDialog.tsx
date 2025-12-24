import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useChbClientConfig, ChbClientConfig, ChbClientConfigInput } from '@/hooks/useChbClientConfig';
import { toast } from 'sonner';
import { Settings, Trash2, Plus, Percent, Scale, FileText, MessageSquare } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CAMPOS_DISPONIVEIS = [
  { id: 'peso_bruto', label: 'Peso Bruto' },
  { id: 'peso_liquido', label: 'Peso Líquido' },
  { id: 'valor_total', label: 'Valor Total' },
  { id: 'valor_item', label: 'Valor por Item' },
  { id: 'moeda', label: 'Moeda' },
  { id: 'incoterm', label: 'Incoterm' },
  { id: 'frete', label: 'Frete' },
  { id: 'quantidade', label: 'Quantidade' },
  { id: 'ncm', label: 'NCM' },
  { id: 'descricao', label: 'Descrição' }
];

export function ChbClientConfigDialog({ open, onOpenChange }: Props) {
  const { configs, loading, fetchConfigs, createConfig, updateConfig, deleteConfig } = useChbClientConfig();
  const [editingConfig, setEditingConfig] = useState<ChbClientConfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<ChbClientConfigInput>({
    cliente_cnpj: '',
    cliente_nome: '',
    tolerancia_peso: 2.0,
    tolerancia_valor: 1.0,
    campos_obrigatorios: ['peso_bruto', 'peso_liquido', 'valor_total', 'moeda', 'incoterm'],
    instrucoes_personalizadas: '',
    ativo: true
  });

  useEffect(() => {
    if (open) {
      fetchConfigs();
    }
  }, [open, fetchConfigs]);

  const resetForm = () => {
    setFormData({
      cliente_cnpj: '',
      cliente_nome: '',
      tolerancia_peso: 2.0,
      tolerancia_valor: 1.0,
      campos_obrigatorios: ['peso_bruto', 'peso_liquido', 'valor_total', 'moeda', 'incoterm'],
      instrucoes_personalizadas: '',
      ativo: true
    });
    setEditingConfig(null);
    setIsCreating(false);
  };

  const handleEdit = (config: ChbClientConfig) => {
    setEditingConfig(config);
    setFormData({
      cliente_cnpj: config.cliente_cnpj,
      cliente_nome: config.cliente_nome || '',
      tolerancia_peso: config.tolerancia_peso,
      tolerancia_valor: config.tolerancia_valor,
      campos_obrigatorios: config.campos_obrigatorios,
      instrucoes_personalizadas: config.instrucoes_personalizadas || '',
      ativo: config.ativo
    });
    setIsCreating(false);
  };

  const handleCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.cliente_cnpj.trim()) {
        toast.error('CNPJ é obrigatório');
        return;
      }

      if (editingConfig) {
        await updateConfig(editingConfig.id, formData);
        toast.success('Configuração atualizada');
      } else {
        await createConfig(formData);
        toast.success('Configuração criada');
      }
      resetForm();
    } catch (err: any) {
      if (err.code === '23505') {
        toast.error('Já existe uma configuração para este CNPJ');
      } else {
        toast.error('Erro ao salvar configuração');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta configuração?')) return;
    try {
      await deleteConfig(id);
      toast.success('Configuração excluída');
      if (editingConfig?.id === id) {
        resetForm();
      }
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const toggleCampo = (campoId: string) => {
    const current = formData.campos_obrigatorios || [];
    if (current.includes(campoId)) {
      setFormData({ ...formData, campos_obrigatorios: current.filter(c => c !== campoId) });
    } else {
      setFormData({ ...formData, campos_obrigatorios: [...current, campoId] });
    }
  };

  const showForm = isCreating || editingConfig;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações CHB por Cliente
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lista de configurações */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Clientes Configurados</CardTitle>
                <Button size="sm" onClick={handleCreate} variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Novo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground">Carregando...</div>
              ) : configs.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nenhuma configuração cadastrada
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {configs.map(config => (
                        <TableRow 
                          key={config.id} 
                          className={`cursor-pointer ${editingConfig?.id === config.id ? 'bg-accent' : ''}`}
                          onClick={() => handleEdit(config)}
                        >
                          <TableCell>
                            <div className="font-medium text-sm">{config.cliente_nome || 'Sem nome'}</div>
                            <div className="text-xs text-muted-foreground">{config.cliente_cnpj}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={config.ativo ? 'default' : 'secondary'}>
                              {config.ativo ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={(e) => { e.stopPropagation(); handleDelete(config.id); }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formulário de edição */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {editingConfig ? 'Editar Configuração' : isCreating ? 'Nova Configuração' : 'Selecione um cliente'}
              </CardTitle>
              <CardDescription className="text-xs">
                Defina tolerâncias e campos obrigatórios para validação
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showForm ? (
                <div className="space-y-4">
                  {/* CNPJ e Nome */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">CNPJ *</Label>
                      <Input
                        value={formData.cliente_cnpj}
                        onChange={e => setFormData({ ...formData, cliente_cnpj: e.target.value })}
                        placeholder="00.000.000/0000-00"
                        disabled={!!editingConfig}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome do Cliente</Label>
                      <Input
                        value={formData.cliente_nome || ''}
                        onChange={e => setFormData({ ...formData, cliente_nome: e.target.value })}
                        placeholder="Nome da empresa"
                        className="h-9"
                      />
                    </div>
                  </div>

                  {/* Tolerâncias */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Scale className="h-3 w-3" />
                        Tolerância Peso (%)
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={formData.tolerancia_peso}
                          onChange={e => setFormData({ ...formData, tolerancia_peso: parseFloat(e.target.value) || 0 })}
                          className="h-9 pr-8"
                        />
                        <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Tolerância Valor (%)
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={formData.tolerancia_valor}
                          onChange={e => setFormData({ ...formData, tolerancia_valor: parseFloat(e.target.value) || 0 })}
                          className="h-9 pr-8"
                        />
                        <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Campos obrigatórios */}
                  <div className="space-y-2">
                    <Label className="text-xs">Campos Obrigatórios na Validação</Label>
                    <div className="grid grid-cols-2 gap-2 p-3 border rounded-md bg-muted/30">
                      {CAMPOS_DISPONIVEIS.map(campo => (
                        <div key={campo.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={campo.id}
                            checked={formData.campos_obrigatorios?.includes(campo.id)}
                            onCheckedChange={() => toggleCampo(campo.id)}
                          />
                          <label htmlFor={campo.id} className="text-xs cursor-pointer">
                            {campo.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Instruções personalizadas */}
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Instruções Personalizadas para Análise
                    </Label>
                    <Textarea
                      value={formData.instrucoes_personalizadas || ''}
                      onChange={e => setFormData({ ...formData, instrucoes_personalizadas: e.target.value })}
                      placeholder="Escreva aqui instruções específicas para a análise deste cliente. Por exemplo: 'Sempre verificar se o NCM está correto para produtos químicos', 'Este cliente usa peso líquido como referência principal', 'Tolerância zero para divergências de container', etc."
                      className="min-h-[120px] text-xs resize-y"
                    />
                    <p className="text-[0.65rem] text-muted-foreground">
                      Este texto será enviado como instrução adicional ao modelo de IA durante as análises.
                    </p>
                  </div>

                  {/* Ativo */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="ativo"
                      checked={formData.ativo}
                      onCheckedChange={(checked) => setFormData({ ...formData, ativo: !!checked })}
                    />
                    <label htmlFor="ativo" className="text-xs cursor-pointer">
                      Configuração ativa
                    </label>
                  </div>

                  {/* Botões */}
                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSave} className="flex-1">
                      {editingConfig ? 'Salvar Alterações' : 'Criar Configuração'}
                    </Button>
                    <Button variant="outline" onClick={resetForm}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Selecione um cliente na lista ou clique em "Novo" para criar uma configuração
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
