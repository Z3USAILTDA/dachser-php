import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, FileSpreadsheet } from "lucide-react";
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
  rule_matrix_id: number;
  cnpj: string;
  airport_code: string | null;
  endereco_completo: string | null;
  email_despachante: string | null;
  notes: string | null;
}

interface RuleMatrixManagerProps {
  userRole: string | null;
}

export const RuleMatrixManager = ({ userRole }: RuleMatrixManagerProps) => {
  const [matrices, setMatrices] = useState<RuleMatrix[]>([]);
  const [selectedMatrix, setSelectedMatrix] = useState<RuleMatrix | null>(null);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  const [newRule, setNewRule] = useState({
    cnpj: "",
    airport_code: "",
    endereco_completo: "",
    email_despachante: "",
  });

  useEffect(() => {
    fetchMatrices();
  }, []);

  useEffect(() => {
    if (selectedMatrix) {
      fetchRules(selectedMatrix.id);
    }
  }, [selectedMatrix]);

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

      if (formattedMatrices.length > 0 && !selectedMatrix) {
        setSelectedMatrix(formattedMatrices[0]);
      }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      e.target.value = "";
    }
  };

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
          enderecoCompleto: newRule.endereco_completo || null,
          emailDespachante: newRule.email_despachante || null,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao adicionar regra");

      toast.success("Regra adicionada com sucesso");
      fetchRules(selectedMatrix.id);
      setNewRule({
        cnpj: "",
        airport_code: "",
        endereco_completo: "",
        email_despachante: "",
      });
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

  const filteredMatrices = matrices.filter(m => customerFilter === "all" || m.customer === customerFilter);

  if (userRole !== "ADMIN") {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header com filtros e upload */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-[150px] bg-black/60 border-white/10">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="KLABIN">KLABIN</SelectItem>
              <SelectItem value="ZF">ZF</SelectItem>
            </SelectContent>
          </Select>

          {filteredMatrices.length > 0 && (
            <Select
              value={selectedMatrix?.id?.toString() || ""}
              onValueChange={value => {
                const matrix = matrices.find(m => m.id === Number(value));
                setSelectedMatrix(matrix || null);
              }}
            >
              <SelectTrigger className="w-[200px] bg-black/60 border-white/10">
                <SelectValue placeholder="Selecionar matriz" />
              </SelectTrigger>
              <SelectContent>
                {filteredMatrices.map(matrix => (
                  <SelectItem key={matrix.id} value={matrix.id.toString()}>
                    {matrix.customer} - v{matrix.version}
                    {matrix.is_active && " (Ativa)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
            id="matrix-upload"
          />
          <Button
            variant="outline"
            className="border-white/20 bg-black/60 hover:bg-white/10"
            onClick={() => document.getElementById("matrix-upload")?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Importar Excel
          </Button>
        </div>
      </div>

      {/* Info da matriz selecionada */}
      {selectedMatrix && (
        <div className="flex items-center gap-4 text-sm text-neutral-400">
          <span>
            <strong className="text-white">Cliente:</strong> {selectedMatrix.customer}
          </span>
          <span>
            <strong className="text-white">Versão:</strong> {selectedMatrix.version}
          </span>
          <span>
            <strong className="text-white">Vigência:</strong> {selectedMatrix.effective_from}
            {selectedMatrix.effective_to && ` até ${selectedMatrix.effective_to}`}
          </span>
          <Badge
            className={
              selectedMatrix.is_active
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "bg-neutral-500/15 text-neutral-300 border-neutral-500/40"
            }
          >
            {selectedMatrix.is_active ? "Ativa" : "Inativa"}
          </Badge>
        </div>
      )}

      {/* Formulário para adicionar regra */}
      {selectedMatrix && (
        <div className="p-4 rounded-xl border border-white/10 bg-black/40">
          <h4 className="text-sm font-semibold mb-3 text-white">Adicionar Nova Regra</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Input
              placeholder="CNPJ *"
              value={newRule.cnpj}
              onChange={e => setNewRule({ ...newRule, cnpj: e.target.value })}
              className="bg-black/60 border-white/10"
            />
            <Input
              placeholder="Aeroporto (ex: GRU)"
              value={newRule.airport_code}
              onChange={e => setNewRule({ ...newRule, airport_code: e.target.value.toUpperCase() })}
              className="bg-black/60 border-white/10"
            />
            <Input
              placeholder="Endereço completo"
              value={newRule.endereco_completo}
              onChange={e => setNewRule({ ...newRule, endereco_completo: e.target.value })}
              className="bg-black/60 border-white/10"
            />
            <Input
              placeholder="E-mail despachante"
              value={newRule.email_despachante}
              onChange={e => setNewRule({ ...newRule, email_despachante: e.target.value })}
              className="bg-black/60 border-white/10"
            />
            <Button onClick={handleAddRule} className="bg-primary text-black hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Tabela de regras */}
      {selectedMatrix && (
        <div className="rounded-xl border border-white/8 bg-black/40 overflow-hidden">
          {isLoadingRules ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/10">
                  <TableHead className="text-xs uppercase tracking-wider text-neutral-400">CNPJ</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-neutral-400">Aeroporto</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-neutral-400">Endereço</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-neutral-400">
                    E-mail Despachante
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-neutral-400">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id} className="border-b border-white/5 hover:bg-white/5">
                    <TableCell className="font-mono text-xs">{rule.cnpj}</TableCell>
                    <TableCell className="font-mono text-xs">{rule.airport_code || "-"}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={rule.endereco_completo || ""}>
                      {rule.endereco_completo || "-"}
                    </TableCell>
                    <TableCell className="text-xs">{rule.email_despachante || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-400 hover:bg-rose-500/10"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {rules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-sm text-neutral-400">
                      Nenhuma regra cadastrada nesta matriz.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Mensagem quando não há matriz */}
      {!selectedMatrix && !isLoading && (
        <div className="text-center py-12 text-neutral-400">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma matriz de regras encontrada.</p>
          <p className="text-sm mt-2">Importe um arquivo Excel para criar uma nova matriz.</p>
        </div>
      )}
    </div>
  );
};
