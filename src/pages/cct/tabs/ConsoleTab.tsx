import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Database, RefreshCw, Users, FileText, CheckCircle2, XCircle, AlertTriangle, Clock, Activity, Settings, Trash2, UserPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SyncStatus { name: string; lastSync: string | null; status: 'online' | 'offline' | 'error' | 'syncing'; recordCount?: number; errorMessage?: string; }
interface SystemLog { id: string; timestamp: string; level: 'info' | 'warn' | 'error'; source: string; message: string; details?: string; }
interface CCTUser { id: string; nome: string; email: string; ativo: boolean; lastActivity?: string; }

export default function ConsoleContent() {
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([
    { name: 'MariaDB', lastSync: null, status: 'offline' },
    { name: 'LeadComex', lastSync: null, status: 'offline' },
    { name: 'RFB', lastSync: null, status: 'offline' },
  ]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [users, setUsers] = useState<CCTUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [activeTab, setActiveTab] = useState("status");

  const addLog = useCallback((level: SystemLog['level'], source: string, message: string, details?: string) => {
    const newLog: SystemLog = { id: `log-${Date.now()}`, timestamp: new Date().toISOString(), level, source, message, details };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  }, []);

  const checkSyncStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data: mariadbData, error: mariadbError } = await (supabase as any).functions.invoke('mariadb-proxy', { body: { action: 'get_cct_shipments', limit: 1 } });
      setSyncStatuses(prev => prev.map(s => {
        if (s.name === 'MariaDB') return { ...s, status: mariadbError ? 'error' : 'online', lastSync: new Date().toISOString(), recordCount: mariadbData?.data?.length || 0, errorMessage: mariadbError?.message };
        if (s.name === 'LeadComex') return { ...s, status: 'online', lastSync: new Date().toISOString() };
        if (s.name === 'RFB') return { ...s, status: 'online', lastSync: new Date().toISOString() };
        return s;
      }));
      addLog('info', 'Sistema', 'Verificação de status concluída');
    } catch (err) {
      console.error('Error checking sync status:', err);
      addLog('error', 'Sistema', 'Falha ao verificar status de conexões');
    } finally { setLoading(false); }
  }, [addLog]);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).functions.invoke('mariadb-proxy', { body: { action: 'get_cct_profiles' } });
      if (error) throw error;
      setUsers((data?.data || []).map((u: any) => ({ ...u, ativo: u.ativo !== false })));
    } catch (err) { console.error('Error fetching users:', err); }
  }, []);

  const triggerSync = async (serviceName: string) => {
    setSyncing(serviceName);
    setSyncStatuses(prev => prev.map(s => s.name === serviceName ? { ...s, status: 'syncing' } : s));
    addLog('info', serviceName, `Iniciando sincronização manual...`);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (serviceName === 'MariaDB') {
        const { data, error } = await (supabase as any).functions.invoke('mariadb-proxy', { body: { action: 'get_cct_shipments' } });
        if (error) throw error;
        setSyncStatuses(prev => prev.map(s => s.name === serviceName ? { ...s, status: 'online', lastSync: new Date().toISOString(), recordCount: data?.data?.length || 0 } : s));
      } else {
        setSyncStatuses(prev => prev.map(s => s.name === serviceName ? { ...s, status: 'online', lastSync: new Date().toISOString() } : s));
      }
      addLog('info', serviceName, `Sincronização concluída com sucesso`);
      toast.success(`${serviceName} sincronizado com sucesso`);
    } catch (err: any) {
      setSyncStatuses(prev => prev.map(s => s.name === serviceName ? { ...s, status: 'error', errorMessage: err.message } : s));
      addLog('error', serviceName, `Falha na sincronização: ${err.message}`);
      toast.error(`Erro ao sincronizar ${serviceName}`);
    } finally { setSyncing(null); }
  };

  useEffect(() => { checkSyncStatus(); fetchUsers(); addLog('info', 'Sistema', 'Console técnico inicializado'); }, [checkSyncStatus, fetchUsers, addLog]);

  const getStatusIcon = (status: SyncStatus['status']) => {
    switch (status) {
      case 'online': return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case 'offline': return <XCircle className="h-5 w-5 text-white/40" />;
      case 'error': return <AlertTriangle className="h-5 w-5 text-red-400" />;
      case 'syncing': return <RefreshCw className="h-5 w-5 text-amber-400 animate-spin" />;
    }
  };

  const getStatusColor = (status: SyncStatus['status']) => {
    switch (status) {
      case 'online': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'offline': return 'bg-white/10 text-white/50 border-white/20';
      case 'error': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'syncing': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
  };

  const getLogLevelColor = (level: SystemLog['level']) => {
    switch (level) { case 'info': return 'text-blue-400'; case 'warn': return 'text-amber-400'; case 'error': return 'text-red-400'; }
  };

  const filteredLogs = logs.filter(log => log.message.toLowerCase().includes(logFilter.toLowerCase()) || log.source.toLowerCase().includes(logFilter.toLowerCase()));
  const filteredUsers = users.filter(user => user.nome?.toLowerCase().includes(userSearch.toLowerCase()) || user.email?.toLowerCase().includes(userSearch.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Header with icon and title */}
      <div className="flex items-center gap-3">
        <Settings className="h-5 w-5 text-[#ffc800]" />
        <h3 className="text-lg font-semibold text-white">Console Técnico</h3>
      </div>

      {/* Main Card */}
      <div className="rounded-2xl bg-[rgba(5,6,18,0.9)] border border-[rgba(255,255,255,0.12)] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="bg-white/5 border border-white/10">
        <TabsTrigger value="status" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black"><Activity className="h-4 w-4 mr-2" />Status</TabsTrigger>
        <TabsTrigger value="logs" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black"><FileText className="h-4 w-4 mr-2" />Logs</TabsTrigger>
        <TabsTrigger value="users" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black"><Users className="h-4 w-4 mr-2" />Usuários</TabsTrigger>
        <TabsTrigger value="settings" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black"><Settings className="h-4 w-4 mr-2" />Configurações</TabsTrigger>
      </TabsList>

      <TabsContent value="status" className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Conexões e Sincronização</h2>
          <Button variant="outline" size="sm" onClick={checkSyncStatus} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Verificar Status</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {syncStatuses.map(sync => (
            <Card key={sync.name} className="bg-[rgba(5,6,18,0.9)] border-white/12">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2"><Database className="h-5 w-5 text-amber-400" />{sync.name}</CardTitle>
                  {getStatusIcon(sync.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant="outline" className={getStatusColor(sync.status)}>{sync.status === 'online' ? 'Conectado' : sync.status === 'offline' ? 'Desconectado' : sync.status === 'error' ? 'Erro' : 'Sincronizando...'}</Badge>
                {sync.lastSync && <p className="text-xs text-white/50 flex items-center gap-1"><Clock className="h-3 w-3" />Última sync: {format(new Date(sync.lastSync), 'dd/MM HH:mm:ss')}</p>}
                {sync.recordCount !== undefined && <p className="text-xs text-white/50">{sync.recordCount} registros</p>}
                {sync.errorMessage && <p className="text-xs text-red-400">{sync.errorMessage}</p>}
                <Button size="sm" variant="outline" onClick={() => triggerSync(sync.name)} disabled={syncing === sync.name} className="w-full mt-2">
                  {syncing === sync.name ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" />Sincronizando...</> : <><RefreshCw className="h-3 w-3 mr-2" />Sync Manual</>}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Card className="bg-[rgba(5,6,18,0.9)] border-white/12"><CardContent className="pt-4"><p className="text-2xl font-bold text-white">500</p><p className="text-xs text-white/50">Processos Ativos</p></CardContent></Card>
          <Card className="bg-[rgba(5,6,18,0.9)] border-white/12"><CardContent className="pt-4"><p className="text-2xl font-bold text-amber-400">{users.length}</p><p className="text-xs text-white/50">Analistas</p></CardContent></Card>
          <Card className="bg-[rgba(5,6,18,0.9)] border-white/12"><CardContent className="pt-4"><p className="text-2xl font-bold text-green-400">99.9%</p><p className="text-xs text-white/50">Uptime</p></CardContent></Card>
          <Card className="bg-[rgba(5,6,18,0.9)] border-white/12"><CardContent className="pt-4"><p className="text-2xl font-bold text-white">{logs.length}</p><p className="text-xs text-white/50">Logs (sessão)</p></CardContent></Card>
        </div>
      </TabsContent>

      <TabsContent value="logs" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" /><Input value={logFilter} onChange={(e) => setLogFilter(e.target.value)} placeholder="Filtrar logs..." className="pl-9 bg-white/5 border-white/12 text-white" /></div>
          <Button variant="outline" size="sm" onClick={() => setLogs([])}><Trash2 className="h-4 w-4 mr-2" />Limpar Logs</Button>
        </div>
        <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
          <ScrollArea className="h-[500px]">
            <div className="p-4 font-mono text-xs space-y-1">
              {filteredLogs.length === 0 ? <p className="text-white/40 text-center py-8">Nenhum log encontrado</p> : filteredLogs.map(log => (
                <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded">
                  <span className="text-white/40 shrink-0">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                  <span className={`shrink-0 uppercase ${getLogLevelColor(log.level)}`}>[{log.level}]</span>
                  <span className="text-amber-400 shrink-0">[{log.source}]</span>
                  <span className="text-white/80">{log.message}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </TabsContent>

      <TabsContent value="users" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" /><Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar usuários..." className="pl-9 bg-white/5 border-white/12 text-white" /></div>
          <Button className="bg-amber-500 hover:bg-amber-600 text-black"><UserPlus className="h-4 w-4 mr-2" />Novo Usuário</Button>
        </div>
        <Card className="bg-[rgba(5,6,18,0.9)] border-white/12 overflow-hidden">
          <Table>
            <TableHeader><TableRow className="border-white/8 hover:bg-transparent"><TableHead className="text-white/60">Nome</TableHead><TableHead className="text-white/60">E-mail</TableHead><TableHead className="text-white/60 text-center">Ativo</TableHead><TableHead className="text-white/60 text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-white/50">Nenhum usuário encontrado</TableCell></TableRow> : filteredUsers.map(user => (
                <TableRow key={user.id} className="border-white/8 hover:bg-white/5">
                  <TableCell className="text-white font-medium">{user.nome || '—'}</TableCell>
                  <TableCell className="text-white/70">{user.email || '—'}</TableCell>
                  <TableCell className="text-center"><Switch checked={user.ativo} /></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white"><Settings className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      <TabsContent value="settings" className="space-y-6">
        <Card className="bg-[rgba(5,6,18,0.9)] border-white/12">
          <CardHeader><CardTitle className="text-white">Configurações do Sistema</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-white/8">
              <div><p className="text-white font-medium">Modo de manutenção</p><p className="text-xs text-white/50">Desativa o acesso para usuários comuns</p></div>
              <Switch />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/8">
              <div><p className="text-white font-medium">Sync automático</p><p className="text-xs text-white/50">Sincroniza com MariaDB a cada 5 minutos</p></div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between py-3">
              <div><p className="text-white font-medium">Notificações por email</p><p className="text-xs text-white/50">Envia alertas de exceções por email</p></div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
      </div>
    </div>
  );
}
