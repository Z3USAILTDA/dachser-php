import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ship, Plus, Pencil, Trash2, Search, RefreshCw, ArrowLeft, Anchor, Sun, Moon, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useSeaRegrasNotificacao } from "@/hooks/useSeaRegrasNotificacao";
import { SeaRegraNotificacaoDialog } from "@/components/sea/SeaRegraNotificacaoDialog";
import { SeaRegraNotificacao, getTipoProcessoColor, getFrequenciaColor } from "@/types/sea";
import dachserBg from "@/assets/dachser-background.jpg";
import { useTheme } from "@/hooks/useTheme";

export default function SeaRegrasNotificacao() {
  const { regras, loading, fetchRegras, createRegra, updateRegra, deleteRegra, toggleAtivo } = useSeaRegrasNotificacao();
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRegra, setEditingRegra] = useState<SeaRegraNotificacao | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRegras();
  }, [fetchRegras]);

  const filteredRegras = regras.filter(r => {
    const term = search.toLowerCase();
    const allPorts = [...(r.portos_origem || []), ...(r.portos_destino || []), ...(r.portos || [])];
    return (
      (r.cliente_nome || '').toLowerCase().includes(term) ||
      (r.cnpj_consignatario || '').includes(term) ||
      allPorts.some(p => p.toLowerCase().includes(term))
    );
  });

  // Sort to put default rules first
  const sortedRegras = [...filteredRegras].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return 0;
  });

  const handleEdit = (regra: SeaRegraNotificacao) => {
    setEditingRegra(regra);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingRegra(null);
    setDialogOpen(true);
  };

  const handleSave = async (data: Omit<SeaRegraNotificacao, 'id' | 'created_at' | 'updated_at'>) => {
    if (editingRegra) {
      return updateRegra(editingRegra.id, data);
    } else {
      return createRegra(data);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (deletingId) {
      await deleteRegra(deletingId);
    }
    setDeleteDialogOpen(false);
    setDeletingId(null);
  };

  return (
    <div
      className="min-h-screen relative"
      style={{
        backgroundImage: `url(${dachserBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0A0A0A]/95 via-[#0A0A0A]/90 to-[#0A0A0A]/95" />

      {/* Content */}
      <div className="relative z-10 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/sea/tracking">
            <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Ship className="h-8 w-8 text-cyan-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Regras de Notificação Marítima</h1>
              <p className="text-sm text-white/60">Configure alertas por cliente para rastreio de containers</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente, CNPJ ou porto..."
                className="pl-9 w-80 bg-white/5 border-white/12 text-white placeholder:text-white/40"
              />
            </div>
          <Button variant="ghost" size="icon" onClick={fetchRegras} disabled={loading}>
            <RefreshCw className={`h-4 w-4 text-white/60 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
            title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        <Button onClick={handleNew} className="bg-cyan-500 hover:bg-cyan-600 text-black">
            <Plus className="h-4 w-4 mr-2" />
            Nova Regra
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                <TableHead className="text-white/60 text-sm py-3">Cliente</TableHead>
                <TableHead className="text-white/60 text-sm py-3">Tipo</TableHead>
                <TableHead className="text-white/60 text-sm py-3">Origem</TableHead>
                <TableHead className="text-white/60 text-sm py-3">Destino</TableHead>
                <TableHead className="text-white/60 text-sm py-3">Eventos</TableHead>
                <TableHead className="text-white/60 text-sm py-3">Frequência</TableHead>
                <TableHead className="text-white/60 text-sm py-3 text-center">Ativo</TableHead>
                <TableHead className="text-white/60 text-sm py-3 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && regras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-white/50">
                    Carregando regras...
                  </TableCell>
                </TableRow>
              ) : sortedRegras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-white/50">
                    <Ship className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Nenhuma regra encontrada
                  </TableCell>
                </TableRow>
              ) : (
                sortedRegras.map((regra) => (
                  <TableRow key={regra.id} className={`border-white/8 hover:bg-white/5 ${regra.is_default ? 'bg-amber-500/5' : ''}`}>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        {regra.is_default && (
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] px-1.5">
                            <Star className="h-3 w-3 mr-0.5" />
                            PADRÃO
                          </Badge>
                        )}
                        <div>
                          <div className="text-white font-medium text-sm">{regra.cliente_nome || (regra.is_default ? 'Regra Global' : '—')}</div>
                          <div className="text-white/50 font-mono text-xs">{regra.cnpj_consignatario || ''}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="secondary" className={`text-xs ${getTipoProcessoColor(regra.tipo_processo)}`}>
                        {regra.tipo_processo === 'IMPORT' ? 'Importação' : regra.tipo_processo === 'EXPORT' ? 'Exportação' : 'Ambos'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {(regra.portos_origem || []).length > 0 ? (
                          (regra.portos_origem || []).slice(0, 2).map(p => (
                            <Badge key={p} variant="secondary" className="bg-orange-500/20 text-orange-300 text-xs">
                              {p}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-white/40 text-xs">Todos</span>
                        )}
                        {(regra.portos_origem || []).length > 2 && (
                          <Badge variant="secondary" className="bg-white/10 text-white/60 text-xs">
                            +{(regra.portos_origem || []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {(regra.portos_destino || []).length > 0 ? (
                          (regra.portos_destino || []).slice(0, 2).map(p => (
                            <Badge key={p} variant="secondary" className="bg-cyan-500/20 text-cyan-300 text-xs">
                              <Anchor className="h-3 w-3 mr-1" />
                              {p}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-white/40 text-xs">Todos</span>
                        )}
                        {(regra.portos_destino || []).length > 2 && (
                          <Badge variant="secondary" className="bg-white/10 text-white/60 text-xs">
                            +{(regra.portos_destino || []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {regra.eventos_disparo.slice(0, 2).map(e => (
                          <Badge key={e} variant="secondary" className="bg-white/10 text-white/70 text-xs">
                            {e}
                          </Badge>
                        ))}
                        {regra.eventos_disparo.length > 2 && (
                          <Badge variant="secondary" className="bg-white/10 text-white/60 text-xs">
                            +{regra.eventos_disparo.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="secondary" className={`text-xs ${getFrequenciaColor(regra.frequencia)}`}>
                        {regra.frequencia}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center py-3">
                      <Switch
                        checked={regra.ativo}
                        onCheckedChange={(checked) => toggleAtivo(regra.id, checked)}
                      />
                    </TableCell>
                    <TableCell className="text-right py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(regra)}
                          className="h-9 w-9 text-white/60 hover:text-white hover:bg-white/10"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(regra.id)}
                          className="h-9 w-9 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Stats */}
        <div className="mt-3 flex gap-4 text-sm text-white/50">
          <span>Total: {regras.length} regras</span>
          <span>•</span>
          <span>Ativas: {regras.filter(r => r.ativo).length}</span>
          <span>•</span>
          <span>Inativas: {regras.filter(r => !r.ativo).length}</span>
          <span>•</span>
          <span>Import: {regras.filter(r => r.tipo_processo === 'IMPORT' || r.tipo_processo === 'BOTH').length}</span>
          <span>•</span>
          <span>Export: {regras.filter(r => r.tipo_processo === 'EXPORT' || r.tipo_processo === 'BOTH').length}</span>
        </div>

        {/* Dialog */}
        <SeaRegraNotificacaoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          regra={editingRegra}
          onSave={handleSave}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-[rgba(5,6,18,0.95)] border-white/12">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Excluir Regra</AlertDialogTitle>
              <AlertDialogDescription className="text-white/60">
                Tem certeza que deseja excluir esta regra de notificação marítima? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
