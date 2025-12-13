import { useEffect, useState } from "react";
import { Bell, Plus, Pencil, Trash2, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useRegrasNotificacao } from "@/hooks/useRegrasNotificacao";
import { RegraNotificacaoDialog } from "@/components/cct/RegraNotificacaoDialog";
import { CCTRegraNotificacao } from "@/types/cct";
import { format } from "date-fns";

export default function RegrasContent() {
  const { regras, loading, fetchRegras, createRegra, updateRegra, deleteRegra, toggleAtivo } = useRegrasNotificacao();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRegra, setEditingRegra] = useState<CCTRegraNotificacao | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchRegras(); }, [fetchRegras]);

  const filteredRegras = regras.filter(r => {
    const term = search.toLowerCase();
    return (r.cliente_nome || '').toLowerCase().includes(term) || (r.cnpj_consignatario || '').includes(term) || r.aeroportos.some(a => a.toLowerCase().includes(term));
  });

  const handleEdit = (regra: CCTRegraNotificacao) => { setEditingRegra(regra); setDialogOpen(true); };
  const handleNew = () => { setEditingRegra(null); setDialogOpen(true); };
  const handleSave = async (data: Omit<CCTRegraNotificacao, 'id' | 'created_at' | 'updated_at'>) => {
    if (editingRegra) return updateRegra(editingRegra.id, data);
    return createRegra(data);
  };
  const handleDeleteClick = (id: string) => { setDeletingId(id); setDeleteDialogOpen(true); };
  const confirmDelete = async () => { if (deletingId) await deleteRegra(deletingId); setDeleteDialogOpen(false); setDeletingId(null); };

  const getCanalColor = (canal: string) => {
    switch (canal) {
      case 'EMAIL_CLIENTE': return 'bg-blue-500/20 text-blue-300';
      case 'EMAIL_INTERNO': return 'bg-purple-500/20 text-purple-300';
      case 'WEBHOOK': return 'bg-green-500/20 text-green-300';
      default: return 'bg-white/10 text-white/70';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with icon and title */}
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-[#ffc800]" />
        <h3 className="text-lg font-semibold text-white">Regras de Notificação</h3>
      </div>

      {/* Main Card */}
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <div className="space-y-6">

      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, CNPJ ou aeroporto..." className="pl-9 w-80 bg-white/5 border-white/12 text-white placeholder:text-white/40" />
          </div>
          <Button variant="ghost" size="icon" onClick={fetchRegras} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
        <Button onClick={handleNew} className="bg-amber-500 hover:bg-amber-600 text-black"><Plus className="h-4 w-4 mr-2" />Nova Regra</Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
        <Table>
          <TableHeader>
            <TableRow className="border-white/8 hover:bg-transparent">
              <TableHead className="text-white/60">Cliente</TableHead>
              <TableHead className="text-white/60">CNPJ</TableHead>
              <TableHead className="text-white/60">Aeroportos</TableHead>
              <TableHead className="text-white/60">Eventos</TableHead>
              <TableHead className="text-white/60">Canais</TableHead>
              <TableHead className="text-white/60 text-center">Ativo</TableHead>
              <TableHead className="text-white/60">Criado em</TableHead>
              <TableHead className="text-white/60 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && regras.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-white/50">Carregando regras...</TableCell></TableRow>
            ) : filteredRegras.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-white/50"><Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />Nenhuma regra encontrada</TableCell></TableRow>
            ) : (
              filteredRegras.map((regra) => (
                <TableRow key={regra.id} className="border-white/8 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{regra.cliente_nome || '—'}</TableCell>
                  <TableCell className="text-white/70 font-mono text-xs">{regra.cnpj_consignatario || '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {regra.aeroportos.length > 0 ? regra.aeroportos.slice(0, 5).map(a => <Badge key={a} variant="secondary" className="bg-amber-500/20 text-amber-300 text-[10px]">{a}</Badge>) : <span className="text-white/40 text-xs">Todos</span>}
                      {regra.aeroportos.length > 5 && <Badge variant="secondary" className="bg-white/10 text-white/60 text-[10px]">+{regra.aeroportos.length - 5}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {regra.eventos_disparo.slice(0, 2).map(e => <Badge key={e} variant="secondary" className="bg-white/10 text-white/70 text-[10px]">{e.replace(/_/g, ' ')}</Badge>)}
                      {regra.eventos_disparo.length > 2 && <Badge variant="secondary" className="bg-white/10 text-white/60 text-[10px]">+{regra.eventos_disparo.length - 2}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">{regra.canais.map(c => <Badge key={c} variant="secondary" className={`text-[10px] ${getCanalColor(c)}`}>{c.replace(/_/g, ' ')}</Badge>)}</div>
                  </TableCell>
                  <TableCell className="text-center"><Switch checked={regra.ativo} onCheckedChange={(checked) => toggleAtivo(regra.id, checked)} /></TableCell>
                  <TableCell className="text-white/50 text-xs">{regra.created_at ? format(new Date(regra.created_at), 'dd/MM/yyyy') : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(regra)} className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(regra.id)} className="h-8 w-8 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-white/50">
        <span>Total: {regras.length} regras</span><span>•</span><span>Ativas: {regras.filter(r => r.ativo).length}</span><span>•</span><span>Inativas: {regras.filter(r => !r.ativo).length}</span>
      </div>

      <RegraNotificacaoDialog open={dialogOpen} onOpenChange={setDialogOpen} regra={editingRegra} onSave={handleSave} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[rgba(5,6,18,0.95)] border-white/12">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir Regra</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">Tem certeza que deseja excluir esta regra de notificação? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white border-white/20 hover:bg-white/20">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600 text-white">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        </div>
      </div>
    </div>
  );
}
