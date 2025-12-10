import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, Loader2, Upload, ChevronUp, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";

interface RuleMatrix {
  id: number;
  customer: "KLABIN" | "ZF";
  version: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
}

interface RuleRow {
  id: number;
  matrix_id: number;
  cnpj: string;
  airport_code: string | null;
  address_pattern: string | null;
  email_despachante: string | null;
  is_active: number | boolean;
  created_at: string | null;
  ref_othello: string | null;
  empresa: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  pais: string | null;
}

interface RuleMatrixManagerProps {
  userRole: string | null;
}

export const RuleMatrixManager = ({ userRole }: RuleMatrixManagerProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [matrices, setMatrices] = useState<RuleMatrix[]>([]);
  const [selectedMatrix, setSelectedMatrix] = useState<RuleMatrix | null>(null);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<string>("KLABIN");
  const [isDragging, setIsDragging] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newRule, setNewRule] = useState({
    cnpj: "",
    airport_code: "",
    address_pattern: "",
    email_despachante: "",
    ref_othello: "",
    empresa: "",
    endereco: "",
    cidade: "",
    estado: "",
    cep: "",
    pais: "",
  });

  useEffect(() => {
    fetchMatrices();
  }, []);

  useEffect(() => {
    if (selectedMatrix) {
      fetchRules(selectedMatrix.id);
    }
  }, [selectedMatrix]);

  // Auto-select active matrix when customer filter changes
  useEffect(() => {
    const filteredMatrices = matrices.filter(m => m.customer === customerFilter);
    const activeMatrix = filteredMatrices.find(m => m.is_active);
    if (activeMatrix) {
      setSelectedMatrix(activeMatrix);
    } else if (filteredMatrices.length > 0) {
      setSelectedMatrix(filteredMatrices[0]);
    } else {
      setSelectedMatrix(null);
      setRules([]);
    }
  }, [customerFilter, matrices]);

  const fetchMatrices = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_rule_matrices" },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao carregar matrizes");

      const formattedMatrices = (data.matrices || []).map((m: any) => ({
        ...m,
        effective_from: m.effective_from || m.effective_date,
        is_active: Boolean(m.is_active),
      }));

      setMatrices(formattedMatrices);
    } catch (error: any) {
      console.error("Error fetching matrices:", error);
      toast.error("Erro ao carregar matrizes");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRules = async (matrixId: number) => {
    setIsLoadingRules(true);
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "get_rule_rows", matrixId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao carregar regras");

      setRules(data.rules || []);
    } catch (error: any) {
      console.error("Error fetching rules:", error);
      toast.error("Erro ao carregar regras");
    } finally {
      setIsLoadingRules(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast.error("Por favor, selecione um arquivo Excel (.xlsx ou .xls)");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("import-rule-matrix", {
        body: formData,
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || "Matriz importada com sucesso");
        fetchMatrices();
      } else {
        throw new Error(data?.error || "Erro ao importar matriz");
      }
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error(error.message || "Erro ao importar matriz");
    } finally {
      setIsUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleAddRule = async () => {
    if (!selectedMatrix || !newRule.cnpj) {
      toast.error("CNPJ é obrigatório");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: {
          action: "create_rule_row",
          matrixId: selectedMatrix.id,
          cnpj: newRule.cnpj.replace(/\D/g, ""),
          airportCode: newRule.airport_code || null,
          addressPattern: newRule.address_pattern || null,
          emailDespachante: newRule.email_despachante || null,
          refOthello: newRule.ref_othello || null,
          empresa: newRule.empresa || null,
          endereco: newRule.endereco || null,
          cidade: newRule.cidade || null,
          estado: newRule.estado || null,
          cep: newRule.cep || null,
          pais: newRule.pais || null,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao adicionar regra");

      toast.success("Regra adicionada com sucesso");
      fetchRules(selectedMatrix.id);
      setNewRule({
        cnpj: "",
        airport_code: "",
        address_pattern: "",
        email_despachante: "",
        ref_othello: "",
        empresa: "",
        endereco: "",
        cidade: "",
        estado: "",
        cep: "",
        pais: "",
      });
      setShowAddForm(false);
    } catch (error: any) {
      console.error("Add rule error:", error);
      toast.error(error.message || "Erro ao adicionar regra");
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      const { data, error } = await supabase.functions.invoke("mariadb-proxy", {
        body: { action: "delete_rule_row", ruleId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao excluir regra");

      toast.success("Regra excluída com sucesso");
      if (selectedMatrix) {
        fetchRules(selectedMatrix.id);
      }
    } catch (error: any) {
      console.error("Delete rule error:", error);
      toast.error(error.message || "Erro ao excluir regra");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const filteredMatrices = matrices.filter(m => m.customer === customerFilter);

  if (userRole !== "ADMIN") {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="rounded-2xl border border-white/10 bg-[rgba(5,6,18,0.9)] overflow-hidden">
        {/* Header */}
        <CollapsibleTrigger className="w-full flex items-center justify-end px-6 py-3 hover:bg-white/5 transition-colors">
          <ChevronUp className={`h-5 w-5 text-white/60 transition-transform ${isOpen ? "" : "rotate-180"}`} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-6 pb-6 space-y-6">
            {/* Import Section */}
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-medium text-white">Importar Matriz via Planilha</h4>
                  <p className="text-xs text-white/50 mt-1 max-w-xl">
                    Upload de arquivo Excel (.xlsx) com duas abas: "Klabin" (Ref, Empresa, CNPJ, Endereço, Cidade/Estado, CEP, País, Aeroporto, Email Despachante) e "ZF" (Ref, Empresa, CNPJ, Endereço, Cidade/Estado, CEP)
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-primary/40 bg-transparent text-primary hover:bg-primary/10"
                  onClick={() => {/* TODO: create new version */}}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Nova Versão
                </Button>
              </div>

              {/* Drop Zone */}
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-white/20 hover:border-white/40"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => document.getElementById("matrix-upload")?.click()}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleInputChange}
                  className="hidden"
                  id="matrix-upload"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <span className="text-sm text-white/60">Processando arquivo...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-white/40" />
                    <span className="text-sm text-white/80">Arraste o arquivo Excel aqui ou clique para enviar</span>
                    <span className="text-xs text-white/40">A planilha será processada e uma nova versão da matriz será criada automaticamente</span>
                  </div>
                )}
              </div>
            </div>

            {/* Matrix Selection */}
            <div className="flex flex-wrap items-center gap-4">
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-[130px] bg-black/40 border-white/10 rounded-full">
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KLABIN">Klabin</SelectItem>
                  <SelectItem value="ZF">ZF</SelectItem>
                </SelectContent>
              </Select>

              {selectedMatrix && (
                <>
                  <Badge className="bg-white/10 text-white border-0 rounded-full px-3 py-1.5 text-xs font-medium">
                    Matriz ativa: v{selectedMatrix.version}-{selectedMatrix.customer}
                  </Badge>
                  <span className="text-sm text-white/60">
                    Vigência: {selectedMatrix.effective_from}
                  </span>
                </>
              )}

              <div className="ml-auto">
                {filteredMatrices.length > 0 && (
                  <Select
                    value={selectedMatrix?.id?.toString() || ""}
                    onValueChange={value => {
                      const matrix = matrices.find(m => m.id === Number(value));
                      setSelectedMatrix(matrix || null);
                    }}
                  >
                    <SelectTrigger className="w-[180px] bg-black/40 border-white/10 rounded-full">
                      <SelectValue placeholder="Versão" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredMatrices.map(matrix => (
                        <SelectItem key={matrix.id} value={matrix.id.toString()}>
                          v{matrix.version}-{matrix.customer.slice(0, 3)}...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Rules Count & Add Button */}
            {selectedMatrix && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">{rules.length} regras cadastradas</span>
                <Button
                  variant="outline"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10 rounded-full"
                  onClick={() => setShowAddForm(!showAddForm)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Regra
                </Button>
              </div>
            )}

            {/* Add Rule Form */}
            {showAddForm && selectedMatrix && (
              <div className="p-4 rounded-xl border border-white/10 bg-black/30 space-y-3">
                <h4 className="text-sm font-medium text-white mb-3">Nova Regra</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <Input
                    placeholder="Ref Othello"
                    value={newRule.ref_othello}
                    onChange={e => setNewRule({ ...newRule, ref_othello: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="Empresa"
                    value={newRule.empresa}
                    onChange={e => setNewRule({ ...newRule, empresa: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="CNPJ *"
                    value={newRule.cnpj}
                    onChange={e => setNewRule({ ...newRule, cnpj: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="Aeroporto (IATA)"
                    value={newRule.airport_code}
                    onChange={e => setNewRule({ ...newRule, airport_code: e.target.value.toUpperCase() })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="Endereço"
                    value={newRule.endereco}
                    onChange={e => setNewRule({ ...newRule, endereco: e.target.value })}
                    className="bg-black/40 border-white/10 col-span-2"
                  />
                  <Input
                    placeholder="Cidade"
                    value={newRule.cidade}
                    onChange={e => setNewRule({ ...newRule, cidade: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="Estado"
                    value={newRule.estado}
                    onChange={e => setNewRule({ ...newRule, estado: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="CEP"
                    value={newRule.cep}
                    onChange={e => setNewRule({ ...newRule, cep: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="País"
                    value={newRule.pais}
                    onChange={e => setNewRule({ ...newRule, pais: e.target.value })}
                    className="bg-black/40 border-white/10"
                  />
                  <Input
                    placeholder="E-mail Despachante"
                    value={newRule.email_despachante}
                    onChange={e => setNewRule({ ...newRule, email_despachante: e.target.value })}
                    className="bg-black/40 border-white/10 col-span-2"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    className="text-white/60 hover:text-white hover:bg-white/10"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="bg-primary text-black hover:bg-primary/90"
                    onClick={handleAddRule}
                  >
                    Salvar Regra
                  </Button>
                </div>
              </div>
            )}

            {/* Rules Table */}
            {selectedMatrix && (
              <div className="rounded-xl border border-white/8 overflow-x-auto">
                {isLoadingRules ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-white/10 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">Ref</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">Empresa</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">CNPJ</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">Aeroporto</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">Endereço</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">Cidade</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">UF</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">CEP</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">País</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">Email Despachante</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-white/50 font-medium">Criação</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wider text-white/50 font-medium">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map(rule => (
                        <TableRow key={rule.id} className="border-b border-white/5 hover:bg-white/5">
                          <TableCell className="text-sm text-white/70">{rule.ref_othello || "-"}</TableCell>
                          <TableCell className="text-sm text-white/70 max-w-[150px] truncate" title={rule.empresa || ""}>{rule.empresa || "-"}</TableCell>
                          <TableCell className="font-mono text-sm text-white">{rule.cnpj}</TableCell>
                          <TableCell>
                            {rule.airport_code ? (
                              <Badge className="bg-white/15 text-white border-0 font-mono text-xs">
                                {rule.airport_code}
                              </Badge>
                            ) : (
                              <span className="text-white/30">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-white/70 max-w-[180px] truncate" title={rule.endereco || rule.address_pattern || ""}>{rule.endereco || rule.address_pattern || "-"}</TableCell>
                          <TableCell className="text-sm text-white/70">{rule.cidade || "-"}</TableCell>
                          <TableCell className="text-sm text-white/70">{rule.estado || "-"}</TableCell>
                          <TableCell className="text-sm text-white/70">{rule.cep || "-"}</TableCell>
                          <TableCell className="text-sm text-white/70">{rule.pais || "-"}</TableCell>
                          <TableCell>
                            {rule.email_despachante ? (
                              <a
                                href={`mailto:${rule.email_despachante}`}
                                className="text-primary hover:underline text-sm"
                              >
                                {rule.email_despachante}
                              </a>
                            ) : (
                              <span className="text-white/30">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-white/70">{formatDate(rule.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10"
                                onClick={() => {/* TODO: edit rule */}}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                onClick={() => handleDeleteRule(rule.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}

                      {rules.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center py-8 text-sm text-white/40">
                            Nenhuma regra cadastrada nesta matriz.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {/* Empty State */}
            {!selectedMatrix && !isLoading && (
              <div className="text-center py-8 text-white/40">
                <p>Nenhuma matriz encontrada para {customerFilter}.</p>
                <p className="text-sm mt-1">Importe um arquivo Excel para criar uma nova matriz.</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
