import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ship, Plus, Pencil, Trash2, Search, RefreshCw, ArrowLeft, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useSeaRegrasNotificacao } from "@/hooks/useSeaRegrasNotificacao";
import { SeaRegraNotificacaoDialog } from "@/components/sea/SeaRegraNotificacaoDialog";
import { SeaRegraNotificacao, getCanalColorSea, getTipoProcessoColor, getFrequenciaColor } from "@/types/sea";
import { format } from "date-fns";
import dachserBg from "@/assets/dachser-background.jpg";

export default function SeaRegrasNotificacao() {
  const { regras, loading, fetchRegras, createRegra, updateRegra, deleteRegra, toggleAtivo } = useSeaRegrasNotificacao();
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
    return (
      (r.cliente_nome || '').toLowerCase().includes(term) ||
      (r.cnpj_consignatario || '').includes(term) ||
      r.portos.some(p => p.toLowerCase().includes(term))
    );
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
      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/container-tracking">
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
        <div className="flex items-center justify-between mb-6">
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
                <TableHead className="text-white/60">Cliente</TableHead>
                <TableHead className="text-white/60">Tipo</TableHead>
                <TableHead className="text-white/60">Portos</TableHead>
                <TableHead className="text-white/60">Eventos</TableHead>
                <TableHead className="text-white/60">Frequência</TableHead>
                <TableHead className="text-white/60">Canais</TableHead>
                <TableHead className="text-white/60 text-center">Ativo</TableHead>
                <TableHead className="text-white/60 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && regras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-white/50">
                    Carregando regras...
                  </TableCell>
                </TableRow>
              ) : filteredRegras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-white/50">
                    <Ship className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Nenhuma regra encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredRegras.map((regra) => (
                  <TableRow key={regra.id} className="border-white/8 hover:bg-white/5">
                    <TableCell>
                      <div>
                        <div className="text-white font-medium">{regra.cliente_nome || '—'}</div>
                        <div className="text-white/50 font-mono text-[10px]">{regra.cnpj_consignatario || ''}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] ${getTipoProcessoColor(regra.tipo_processo)}`}>
                        {regra.tipo_processo === 'IMPORT' ? 'Importação' : regra.tipo_processo === 'EXPORT' ? 'Exportação' : 'Ambos'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {regra.portos.length > 0 ? (
                          regra.portos.slice(0, 3).map(p => (
                            <Badge key={p} variant="secondary" className="bg-cyan-500/20 text-cyan-300 text-[10px]">
                              <Anchor className="h-2 w-2 mr-1" />
                              {p}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-white/40 text-xs">Todos</span>
                        )}
                        {regra.portos.length > 3 && (
                          <Badge variant="secondary" className="bg-white/10 text-white/60 text-[10px]">
                            +{regra.portos.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {regra.eventos_disparo.slice(0, 2).map(e => (
                          <Badge key={e} variant="secondary" className="bg-white/10 text-white/70 text-[10px]">
                            {e}
                          </Badge>
                        ))}
                        {regra.eventos_disparo.length > 2 && (
                          <Badge variant="secondary" className="bg-white/10 text-white/60 text-[10px]">
                            +{regra.eventos_disparo.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] ${getFrequenciaColor(regra.frequencia)}`}>
                        {regra.frequencia}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {regra.canais.map(c => (
                          <Badge key={c} variant="secondary" className={`text-[10px] ${getCanalColorSea(c)}`}>
                            {c.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={regra.ativo}
                        onCheckedChange={(checked) => toggleAtivo(regra.id, checked)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(regra)}
                          className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(regra.id)}
                          className="h-8 w-8 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
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
        <div className="mt-4 flex gap-4 text-xs text-white/50">
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
