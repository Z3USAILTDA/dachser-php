import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Download,
  RefreshCw,
  Search,
  FileInput,
  Package,
  AlertCircle,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseMariaDBDate } from "@/utils/parseMariaDBDate";
import { MoedaBadge } from "./MoedaBadge";

interface PendingVoucher {
  id_rm: string;
  nd: string;
  documento: string | null;
  nome_beneficiario: string | null;
  nome_cobranca: string | null;
  numero_nf: string | null;
  numero_processo: string | null;
  modal: string | null;
  tipo_pag: string | null;
  forma_pag: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  valor_nf: number | null;
  moeda: string | null;
  cnpj: string | null;
  razao_social: string | null;
  source?: "SPO" | "VOUCHER";
  detalhes?: string | null;
  processos_associados?: string[];
}

interface BacklogTabProps {
  onVoucherImported?: () => void;
}

export const BacklogTab = ({ onVoucherImported }: BacklogTabProps) => {
  const [pendingVouchers, setPendingVouchers] = useState<PendingVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const loadPendingVouchers = async () => {
    try {
      setLoading(true);
      const resp = await fetch('/api/fin/vouchers/pendentes-rm?limit=200');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setPendingVouchers(data?.data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar backlog",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingVouchers();
  }, []);

  const handleImportVoucher = async (nd: string) => {
    try {
      setImporting(nd);
      const resp = await fetch('/api/fin/vouchers/importar-rm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nd, user_id: user?.id, user_name: user?.username || user?.email }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }
      const data = await resp.json();

      if (data?.success) {
        toast({
          title: "Voucher importado",
          description: `Voucher ${nd} foi adicionado à esteira com sucesso.`,
        });
        // Remove from local list
        setPendingVouchers((prev) => prev.filter((v) => v.nd !== nd));
        onVoucherImported?.();
      } else {
        throw new Error(data?.error || "Erro ao importar voucher");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao importar voucher",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(null);
    }
  };

  const handleImportAll = async () => {
    const confirm = window.confirm(
      `Deseja importar todos os ${pendingVouchers.length} vouchers pendentes para a esteira?`
    );
    if (!confirm) return;

    let imported = 0;
    let errors = 0;

    for (const voucher of pendingVouchers) {
      try {
        setImporting(voucher.nd);
        const r = await fetch('/api/fin/vouchers/importar-rm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nd: voucher.nd, user_id: user?.id, user_name: user?.username || user?.email }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d?.success) { imported++; } else { errors++; }
      } catch {
        errors++;
      }
    }

    setImporting(null);

    toast({
      title: "Importação concluída",
      description: `${imported} vouchers importados, ${errors} erros.`,
      variant: errors > 0 ? "destructive" : "default",
    });

    loadPendingVouchers();
    onVoucherImported?.();
  };

  const filteredVouchers = pendingVouchers.filter((v) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      v.nd?.toLowerCase().includes(query) ||
      v.nome_beneficiario?.toLowerCase().includes(query) ||
      v.numero_processo?.toLowerCase().includes(query) ||
      v.cnpj?.includes(query)
    );
  });

  const isVencido = (dateStr: string | null) => {
    if (!dateStr) return false;
    const date = parseMariaDBDate(dateStr);
    return date && date < new Date();
  };

  const totalValor = filteredVouchers.reduce((acc, v) => acc + (v.valor_nf || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[rgba(255,200,0,0.15)] flex items-center justify-center">
            <Package className="h-5 w-5 text-[#ffc800]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Backlog RM</h2>
            <p className="text-sm text-[#aaaaaa]">
              {pendingVouchers.length} vouchers pendentes de processamento
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPendingVouchers}
            disabled={loading}
            className="rounded-full border-white/10 bg-transparent text-[#aaaaaa] hover:text-white hover:bg-white/5"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {pendingVouchers.length > 0 && (
            <Button
              size="sm"
              onClick={handleImportAll}
              disabled={!!importing}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-4 w-4 mr-2" />
              Importar Todos
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 bg-[rgba(0,0,0,0.4)] border border-white/10">
          <div className="text-2xl font-bold text-white">{pendingVouchers.length}</div>
          <div className="text-sm text-[#aaaaaa]">Total Pendentes</div>
        </div>
        <div className="rounded-xl p-4 bg-[rgba(0,0,0,0.4)] border border-white/10">
          <div className="text-2xl font-bold text-[#ffc800]">
            {pendingVouchers.filter((v) => isVencido(v.data_vencimento)).length}
          </div>
          <div className="text-sm text-[#aaaaaa]">Vencidos</div>
        </div>
        <div className="rounded-xl p-4 bg-[rgba(0,0,0,0.4)] border border-white/10">
          <div className="text-2xl font-bold text-emerald-400">
            R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-sm text-[#aaaaaa]">Valor Total</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888888]" />
        <Input
          placeholder="Buscar por ND, fornecedor, processo ou CNPJ..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-[rgba(0,0,0,0.4)] border-white/10 rounded-full text-white placeholder:text-[#888888]"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="h-64 rounded-xl bg-[rgba(0,0,0,0.4)] border border-white/10 animate-pulse" />
      ) : filteredVouchers.length === 0 ? (
        <div className="h-64 rounded-xl bg-[rgba(0,0,0,0.4)] border border-white/10 flex flex-col items-center justify-center gap-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          <p className="text-[#aaaaaa]">Nenhum voucher pendente no backlog</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-[#aaaaaa]">ND</TableHead>
                <TableHead className="text-[#aaaaaa]">Fornecedor</TableHead>
                <TableHead className="text-[#aaaaaa]">Processo</TableHead>
                <TableHead className="text-[#aaaaaa]">Valor</TableHead>
                <TableHead className="text-[#aaaaaa]">Vencimento</TableHead>
                <TableHead className="text-[#aaaaaa]">Forma Pag.</TableHead>
                <TableHead className="text-[#aaaaaa] text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVouchers.map((voucher) => {
                const vencido = isVencido(voucher.data_vencimento);
                const vencimento = parseMariaDBDate(voucher.data_vencimento);

                return (
                  <TableRow
                    key={voucher.nd}
                    className={`border-white/10 ${vencido ? "bg-red-500/10" : ""}`}
                  >
                    <TableCell className="font-mono text-white">
                      <span className="inline-flex items-center gap-2">
                        {voucher.nd}
                        <MoedaBadge moeda={voucher.moeda} />
                        {voucher.source === "SPO" ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-[#ffc800]/40 bg-[rgba(255,200,0,0.10)] text-[10px] text-[#ffc800] px-2 py-0"
                          >
                            SPO
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="rounded-full border-white/15 bg-white/5 text-[10px] text-[#aaaaaa] px-2 py-0"
                          >
                            Voucher
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-white max-w-[200px] truncate">
                      {voucher.nome_beneficiario || voucher.razao_social || "-"}
                    </TableCell>
                    <TableCell className="text-[#aaaaaa]">
                      <div className="inline-flex items-center gap-2">
                        <span>{voucher.numero_processo || "-"}</span>
                        {voucher.source === "SPO" &&
                          (voucher.processos_associados?.length ?? 0) > 1 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full border border-[#ffc800]/30 bg-[rgba(255,200,0,0.08)] px-2 py-0.5 text-[10px] text-[#ffc800] hover:bg-[rgba(255,200,0,0.15)]"
                                  title="Ver todos os processos associados"
                                >
                                  <Layers className="h-3 w-3" />
                                  +{(voucher.processos_associados!.length) - 1} processos
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="w-72 max-h-72 overflow-auto bg-[#0a0a0a] border-white/10 text-white"
                              >
                                <div className="text-xs text-[#aaaaaa] mb-2">
                                  Processos associados ({voucher.processos_associados!.length})
                                </div>
                                <ul className="space-y-1 font-mono text-xs">
                                  {voucher.processos_associados!.map((p) => (
                                    <li
                                      key={p}
                                      className="px-2 py-1 rounded bg-white/5 text-white break-all"
                                    >
                                      {p}
                                    </li>
                                  ))}
                                </ul>
                              </PopoverContent>
                            </Popover>
                          )}
                      </div>
                    </TableCell>

                    <TableCell className="text-white">
                      {voucher.moeda || "BRL"}{" "}
                      {voucher.valor_nf?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ||
                        "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {vencido && <AlertCircle className="h-4 w-4 text-red-400" />}
                        <span className={vencido ? "text-red-400" : "text-white"}>
                          {vencimento
                            ? format(vencimento, "dd/MM/yyyy", { locale: ptBR })
                            : "-"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[#aaaaaa] border-white/20 rounded-full"
                      >
                        {voucher.forma_pag || voucher.tipo_pag || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleImportVoucher(voucher.nd)}
                        disabled={importing === voucher.nd}
                        className="rounded-full bg-[rgba(255,200,0,0.15)] text-[#ffc800] hover:bg-[rgba(255,200,0,0.25)] border border-[#ffc800]/40"
                      >
                        {importing === voucher.nd ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <FileInput className="h-4 w-4 mr-1" />
                            Importar
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
