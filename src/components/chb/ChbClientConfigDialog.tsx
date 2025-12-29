import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChbClientConfig, ChbClientConfig, ChbClientConfigInput } from '@/hooks/useChbClientConfig';
import { toast } from 'sonner';
import { Settings, Trash2, Plus, Percent, Scale, FileText, MessageSquare, Ship, MapPin, Mail, Clock, DollarSign, Building2, Receipt } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

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

const BENEFICIOS_FISCAIS = [
  { value: 'NENHUM', label: 'Nenhum' },
  { value: 'RECOF', label: 'RECOF' },
  { value: 'DRAWBACK', label: 'Drawback Isenção' },
  { value: 'EX_TARIFARIO', label: 'Ex-Tarifário' }
];

const ESTADOS_UF = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const ESTADOS_ICMS_DIFERIDO = ['MG', 'SC', 'ES'];

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
    ativo: true,
    // Novos campos
    armador: '',
    agente_destino: '',
    contato_email: '',
    prazo_resposta_dias: 2,
    porto_descarga_real: '',
    tolerancia_taxas_acessorias_abs: 50,
    tolerancia_taxas_acessorias_pct: 1.0,
    beneficio_fiscal: 'NENHUM',
    cfop_padrao: '',
    estado_uf: '',
    icms_diferido: false
  });

  useEffect(() => {
    if (open) {
      fetchConfigs();
    }
  }, [open, fetchConfigs]);

  // Auto-set ICMS diferido when UF changes
  useEffect(() => {
    if (formData.estado_uf) {
      const isDiferido = ESTADOS_ICMS_DIFERIDO.includes(formData.estado_uf);
      setFormData(prev => ({ ...prev, icms_diferido: isDiferido }));
    }
  }, [formData.estado_uf]);

  const resetForm = () => {
    setFormData({
      cliente_cnpj: '',
      cliente_nome: '',
      tolerancia_peso: 2.0,
      tolerancia_valor: 1.0,
      campos_obrigatorios: ['peso_bruto', 'peso_liquido', 'valor_total', 'moeda', 'incoterm'],
      instrucoes_personalizadas: '',
      ativo: true,
      armador: '',
      agente_destino: '',
      contato_email: '',
      prazo_resposta_dias: 2,
      porto_descarga_real: '',
      tolerancia_taxas_acessorias_abs: 50,
      tolerancia_taxas_acessorias_pct: 1.0,
      beneficio_fiscal: 'NENHUM',
      cfop_padrao: '',
      estado_uf: '',
      icms_diferido: false
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
      ativo: config.ativo,
      armador: config.armador || '',
      agente_destino: config.agente_destino || '',
      contato_email: config.contato_email || '',
      prazo_resposta_dias: config.prazo_resposta_dias || 2,
      porto_descarga_real: config.porto_descarga_real || '',
      tolerancia_taxas_acessorias_abs: config.tolerancia_taxas_acessorias_abs || 50,
      tolerancia_taxas_acessorias_pct: config.tolerancia_taxas_acessorias_pct || 1.0,
      beneficio_fiscal: config.beneficio_fiscal || 'NENHUM',
      cfop_padrao: config.cfop_padrao || '',
      estado_uf: config.estado_uf || '',
      icms_diferido: config.icms_diferido || false
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

      // Converter 'NENHUM' para null ao salvar
      const dataToSave = {
        ...formData,
        beneficio_fiscal: formData.beneficio_fiscal === 'NENHUM' ? null : formData.beneficio_fiscal
      };

      if (editingConfig) {
        await updateConfig(editingConfig.id, dataToSave);
        toast.success('Configuração atualizada');
      } else {
        await createConfig(dataToSave);
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-sm font-bold">SOP</span>
            Configurações CHB por Cliente
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Lista de configurações */}
          <Card className="lg:col-span-2">
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
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                        <TableHead className="w-12"></TableHead>
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
                            {config.estado_uf && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {config.estado_uf}
                                {config.beneficio_fiscal && (
                                  <Badge variant="outline" className="text-[0.6rem] px-1 py-0 ml-1">
                                    {config.beneficio_fiscal}
                                  </Badge>
                                )}
                              </div>
                            )}
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
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {editingConfig ? 'Editar Configuração' : isCreating ? 'Nova Configuração' : 'Selecione um cliente'}
              </CardTitle>
              <CardDescription className="text-xs">
                Defina tolerâncias, regras fiscais e informações do armador
              </CardDescription>
            </CardHeader>
            <CardContent>
              {showForm ? (
                <Tabs defaultValue="dados" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="dados" className="text-xs">Dados</TabsTrigger>
                    <TabsTrigger value="tolerancias" className="text-xs">Tolerâncias</TabsTrigger>
                    <TabsTrigger value="fiscal" className="text-xs">Fiscal</TabsTrigger>
                  </TabsList>

                  {/* Tab Dados Básicos */}
                  <TabsContent value="dados" className="space-y-4">
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

                    <div className="space-y-2">
                      <Label className="text-xs flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Instruções Personalizadas para Análise
                      </Label>
                      <Textarea
                        value={formData.instrucoes_personalizadas || ''}
                        onChange={e => setFormData({ ...formData, instrucoes_personalizadas: e.target.value })}
                        placeholder="Instruções específicas para a análise deste cliente..."
                        className="min-h-[80px] text-xs resize-y"
                      />
                    </div>

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
                  </TabsContent>

                  {/* Tab Tolerâncias */}
                  <TabsContent value="tolerancias" className="space-y-4">
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

                    <Separator />

                    <div>
                      <Label className="text-xs font-medium flex items-center gap-1 mb-3">
                        <DollarSign className="h-3 w-3" />
                        Tolerâncias para Taxas Acessórias
                      </Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Valor Absoluto (USD/EUR)</Label>
                          <div className="relative">
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              value={formData.tolerancia_taxas_acessorias_abs}
                              onChange={e => setFormData({ ...formData, tolerancia_taxas_acessorias_abs: parseFloat(e.target.value) || 0 })}
                              className="h-9 pl-8"
                            />
                            <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="text-[0.6rem] text-muted-foreground">
                            Divergências até este valor serão toleradas
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Valor Percentual (%)</Label>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={formData.tolerancia_taxas_acessorias_pct}
                              onChange={e => setFormData({ ...formData, tolerancia_taxas_acessorias_pct: parseFloat(e.target.value) || 0 })}
                              className="h-9 pr-8"
                            />
                            <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="text-[0.6rem] text-muted-foreground">
                            Ou divergências até este % do total
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>


                  {/* Tab Fiscal */}
                  <TabsContent value="fiscal" className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Estado (UF)
                        </Label>
                        <Select
                          value={formData.estado_uf || ''}
                          onValueChange={(value) => setFormData({ ...formData, estado_uf: value })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Selecione a UF" />
                          </SelectTrigger>
                          <SelectContent>
                            {ESTADOS_UF.map(uf => (
                              <SelectItem key={uf} value={uf}>
                                {uf} {ESTADOS_ICMS_DIFERIDO.includes(uf) && '(ICMS Diferido)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Receipt className="h-3 w-3" />
                          Benefício Fiscal
                        </Label>
                        <Select
                          value={formData.beneficio_fiscal || 'NENHUM'}
                          onValueChange={(value) => setFormData({ ...formData, beneficio_fiscal: value })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Nenhum" />
                          </SelectTrigger>
                          <SelectContent>
                            {BENEFICIOS_FISCAIS.map(bf => (
                              <SelectItem key={bf.value} value={bf.value}>
                                {bf.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">CFOP Padrão</Label>
                      <Input
                        value={formData.cfop_padrao || ''}
                        onChange={e => setFormData({ ...formData, cfop_padrao: e.target.value })}
                        placeholder="Ex: 3101, 3102, 3127, 3129"
                        className="h-9"
                      />
                      <p className="text-[0.6rem] text-muted-foreground">
                        3101: Industrialização | 3102: Revenda | 3127: Drawback | 3129: RECOF
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/30">
                      <Checkbox
                        id="icms_diferido"
                        checked={formData.icms_diferido}
                        onCheckedChange={(checked) => setFormData({ ...formData, icms_diferido: !!checked })}
                      />
                      <div>
                        <label htmlFor="icms_diferido" className="text-xs cursor-pointer font-medium">
                          ICMS Diferido
                        </label>
                        <p className="text-[0.6rem] text-muted-foreground">
                          Marque se o ICMS é diferido neste estado (MG, SC, ES)
                        </p>
                      </div>
                    </div>

                    {formData.beneficio_fiscal && formData.beneficio_fiscal !== 'NENHUM' && (
                      <div className="p-3 border rounded-md bg-blue-500/10 border-blue-500/30">
                        <p className="text-xs text-blue-400">
                          <strong>Atenção:</strong> Com benefício fiscal {formData.beneficio_fiscal}, a análise verificará automaticamente:
                          {formData.beneficio_fiscal === 'RECOF' && ' CFOP 3129 + ICMS suspenso'}
                          {formData.beneficio_fiscal === 'DRAWBACK' && ' Ato Concessório + CFOP 3127'}
                          {formData.beneficio_fiscal === 'EX_TARIFARIO' && ' II = 0% + Fundamento Legal 59'}
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Botões de ação */}
                  <div className="flex gap-2 pt-4 mt-4 border-t">
                    <Button onClick={handleSave} className="flex-1">
                      {editingConfig ? 'Salvar Alterações' : 'Criar Configuração'}
                    </Button>
                    <Button variant="outline" onClick={resetForm}>
                      Cancelar
                    </Button>
                  </div>
                </Tabs>
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