import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, CheckCircle2, XCircle, Clock, TrendingUp, RefreshCw, Search, 
  ChevronDown, ChevronUp, Calendar, Zap, Play, Loader2, Database, 
  Plane, Package, User, Building2, MapPin, FileText, AlertTriangle, Ship,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AttemptTimeline } from '@/components/cct/AttemptTimeline';
import { useLeadcomexLogs, useLeadcomexLogsStats, LeadcomexLog, LeadcomexLogFilters } from '@/hooks/useLeadcomexLogs';
import { supabase } from '@/integrations/supabase/client';

const LeadcomexLogsPage: React.FC = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [isRunningEnrich, setIsRunningEnrich] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LeadcomexLog | null>(null);
  
  // Filters
  const [filters, setFilters] = useState<LeadcomexLogFilters>({
    limit: 50,
    offset: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Queries
  const { data: logsData, isLoading: isLoadingLogs, refetch } = useLeadcomexLogs(filters);
  const { data: stats, isLoading: isLoadingStats } = useLeadcomexLogsStats();

  useEffect(() => {
    const userData = localStorage.getItem('user') || localStorage.getItem('dachser_user');
    if (userData) {
      const user = JSON.parse(userData);
      const isAdminUser = user.is_admin === 1 || user.is_admin === "1" || user.is_admin === true;
      if (isAdminUser) {
        setIsAdmin(true);
      } else {
        navigate('/air/cct');
        toast.error('Acesso restrito a administradores');
      }
    } else {
      navigate('/login');
    }
    setIsLoading(false);
  }, [navigate]);

  // Apply filters with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({
        ...prev,
        hawb: searchTerm || undefined,
        success: statusFilter === 'all' ? undefined : statusFilter === 'success',
        execution_source: sourceFilter === 'all' ? undefined : sourceFilter,
        offset: 0,
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter, sourceFilter]);

  const toggleRow = (id: number) => {
    const log = logsData?.logs?.find(l => l.id === id);
    if (selectedLog?.id === id) {
      setSelectedLog(null);
    } else if (log) {
      setSelectedLog(log);
    }
    
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const formatDateOnly = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const runEnrichReverseLadder = async () => {
    setIsRunningEnrich(true);
    try {
      const { data, error } = await supabase.functions.invoke('leadcomex-sync', {
        body: { 
          action: 'enrich-reverse-ladder',
          limit: 20,
          max_retries: 30,
          execution_source: 'manual'
        }
      });
      
      if (error) throw error;
      
      toast.success(`Enriquecimento concluído: ${data.stats?.success || 0}/${data.stats?.processed || 0} HAWBs encontrados`);
      refetch();
    } catch (err) {
      console.error('Erro ao executar enrich:', err);
      toast.error('Erro ao executar enriquecimento');
    } finally {
      setIsRunningEnrich(false);
    }
  };

  const reprocessHawb = async (hawb: string) => {
    setIsReprocessing(true);
    try {
      // 1. Reset the HAWB status
      const { error: resetError } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'reset_leadcomex_status',
          hawbs: [hawb]
        }
      });
      
      if (resetError) throw resetError;
      
      // 2. Reprocess it
      const { data, error } = await supabase.functions.invoke('leadcomex-sync', {
        body: { 
          action: 'enrich-reverse-ladder',
          limit: 1,
          hawb_filter: hawb,
          max_retries: 30,
          execution_source: 'manual-reprocess'
        }
      });
      
      if (error) throw error;
      
      const success = data.stats?.success || 0;
      if (success > 0) {
        toast.success(`HAWB ${hawb} reprocessado com sucesso!`);
      } else {
        toast.warning(`HAWB ${hawb} reprocessado, mas não encontrado na LeadComex`);
      }
      
      setSelectedLog(null);
      refetch();
    } catch (err) {
      console.error('Erro ao reprocessar HAWB:', err);
      toast.error('Erro ao reprocessar HAWB');
    } finally {
      setIsReprocessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050608] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#F5B843]"></div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div 
      className="min-h-screen relative"
      style={{
        background: 'linear-gradient(135deg, #050608 0%, #0a0c10 50%, #050608 100%)',
      }}
    >
      {/* Background glow */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(245, 184, 67, 0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 p-6 max-w-[1920px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/air/cct')}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Database className="h-6 w-6 text-[#F5B843]" />
                Logs de Conexão LeadComex
              </h1>
              <p className="text-sm text-white/60">Histórico detalhado de cada tentativa de enriquecimento com a API LeadComex</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              onClick={runEnrichReverseLadder}
              disabled={isRunningEnrich}
              className="bg-[#F5B843] hover:bg-[#F5B843]/90 text-black font-medium"
            >
              {isRunningEnrich ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Executar Agora
                </>
              )}
            </Button>
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                <Zap className="h-3.5 w-3.5" />
                Total Execuções
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-7 w-16 bg-white/10" />
              ) : (
                <div className="text-xl font-bold text-white">{stats?.total?.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-emerald-400/80 text-xs mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sucesso
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-7 w-16 bg-white/10" />
              ) : (
                <div className="text-xl font-bold text-emerald-400">{stats?.success_count?.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-400/80 text-xs mb-1">
                <XCircle className="h-3.5 w-3.5" />
                Não Encontrados
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-7 w-16 bg-white/10" />
              ) : (
                <div className="text-xl font-bold text-red-400">{stats?.error_count?.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-[#F5B843]/80 text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Taxa de Sucesso
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-7 w-16 bg-white/10" />
              ) : (
                <div className="text-xl font-bold text-[#F5B843]">{stats?.success_rate || '0'}%</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-400/80 text-xs mb-1">
                <Clock className="h-3.5 w-3.5" />
                Tempo Médio
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-7 w-16 bg-white/10" />
              ) : (
                <div className="text-xl font-bold text-blue-400">{stats?.avg_time_ms || 0}ms</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-purple-400/80 text-xs mb-1">
                <Calendar className="h-3.5 w-3.5" />
                Offset Médio
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-7 w-16 bg-white/10" />
              ) : (
                <div className="text-xl font-bold text-purple-400">-{stats?.avg_offset_days || '0'}d</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Logs Table */}
          <div className="lg:col-span-2">
            {/* Filters */}
            <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm mb-4">
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                      <Input
                        placeholder="Buscar por HAWB ou MAWB..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                      />
                    </div>
                  </div>
                  
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f2e] border-white/10">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="success">Sucesso</SelectItem>
                      <SelectItem value="error">Não Encontrado</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-[140px] bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Origem" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1f2e] border-white/10">
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="cron-hourly">Cron</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm">
              <CardHeader className="border-b border-white/10 py-3">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#F5B843]" />
                  Registros de Execução
                  <Badge variant="outline" className="ml-2 border-white/20 text-white/60 text-xs">
                    {logsData?.total || 0} registros
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingLogs ? (
                  <div className="p-6 space-y-3">
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full bg-white/5" />
                    ))}
                  </div>
                ) : !logsData?.logs?.length ? (
                  <div className="p-8 text-center text-white/60">
                    <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhum log encontrado</p>
                    <p className="text-xs mt-1">Execute o enriquecimento para gerar logs</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-white/60 text-xs w-8"></TableHead>
                          <TableHead className="text-white/60 text-xs">HAWB</TableHead>
                          <TableHead className="text-white/60 text-xs">DEP</TableHead>
                          <TableHead className="text-white/60 text-xs">Offset</TableHead>
                          <TableHead className="text-white/60 text-xs">Status</TableHead>
                          <TableHead className="text-white/60 text-xs">Tempo</TableHead>
                          <TableHead className="text-white/60 text-xs">Origem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logsData.logs.map((log) => (
                          <TableRow 
                            key={log.id}
                            className={`border-white/5 cursor-pointer transition-colors ${
                              selectedLog?.id === log.id 
                                ? 'bg-[#F5B843]/10 hover:bg-[#F5B843]/15' 
                                : 'hover:bg-white/5'
                            }`}
                            onClick={() => toggleRow(log.id)}
                          >
                            <TableCell className="text-white/60 py-2">
                              {selectedLog?.id === log.id ? (
                                <ChevronUp className="h-4 w-4 text-[#F5B843]" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="font-mono text-sm text-white">{log.hawb}</div>
                              {log.mawb && (
                                <div className="font-mono text-xs text-white/50">{log.mawb}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-white/60 text-xs py-2">
                              {formatDateOnly(log.dep_date)}
                            </TableCell>
                            <TableCell className="py-2">
                              {log.success ? (
                                <Badge variant="outline" className="border-purple-400/30 text-purple-400 bg-purple-400/10 text-xs">
                                  -{log.offset_days}d
                                </Badge>
                              ) : (
                                <span className="text-white/30 text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              {log.success ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  OK
                                </Badge>
                              ) : (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  N/F
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-white/60 text-xs py-2">
                              {log.total_time_ms ? `${log.total_time_ms}ms` : '-'}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge variant="outline" className="border-white/20 text-white/50 text-xs">
                                {log.execution_source === 'cron-hourly' ? 'Cron' : log.execution_source}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
                
                {/* Pagination */}
                {logsData && logsData.total > logsData.limit && (
                  <div className="flex items-center justify-between p-3 border-t border-white/10">
                    <span className="text-white/50 text-xs">
                      {Math.min(logsData.offset + 1, logsData.total)}-
                      {Math.min(logsData.offset + logsData.limit, logsData.total)} de {logsData.total}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={logsData.offset === 0}
                        onClick={() => setFilters(prev => ({ ...prev, offset: Math.max(0, (prev.offset || 0) - (prev.limit || 50)) }))}
                        className="border-white/20 text-white hover:bg-white/10 h-7 text-xs"
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={logsData.offset + logsData.limit >= logsData.total}
                        onClick={() => setFilters(prev => ({ ...prev, offset: (prev.offset || 0) + (prev.limit || 50) }))}
                        className="border-white/20 text-white hover:bg-white/10 h-7 text-xs"
                      >
                        Próximo
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Detail Panel */}
          <div className="lg:col-span-1">
            <Card className="bg-[#0d1117]/80 border-white/10 backdrop-blur-sm sticky top-6">
              <CardHeader className="border-b border-white/10 py-3">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#F5B843]" />
                  Detalhes da Execução
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!selectedLog ? (
                  <div className="p-8 text-center text-white/40">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Selecione um registro para ver os detalhes</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[650px]">
                    <div className="p-4 space-y-4">
                      {/* Header Info */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-lg text-white font-bold">{selectedLog.hawb}</span>
                          {selectedLog.success ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Encontrado
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                              <XCircle className="h-3 w-3 mr-1" />
                              Não Encontrado
                            </Badge>
                          )}
                        </div>
                        {selectedLog.mawb && (
                          <div className="text-xs text-white/50 font-mono">MAWB: {selectedLog.mawb}</div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-white/40">
                            Executado em: {formatDate(selectedLog.created_at)}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reprocessHawb(selectedLog.hawb)}
                            disabled={isReprocessing}
                            className="border-[#F5B843]/30 text-[#F5B843] hover:bg-[#F5B843]/10 text-xs h-7"
                          >
                            {isReprocessing ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3 mr-1" />
                            )}
                            Reprocessar
                          </Button>
                        </div>
                      </div>

                      <Separator className="bg-white/10" />

                      {/* Execution Details */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-lg p-3">
                          <div className="text-xs text-white/50 mb-1">Data DEP</div>
                          <div className="text-sm text-white font-medium">{formatDateOnly(selectedLog.dep_date)}</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                          <div className="text-xs text-white/50 mb-1">Data Match</div>
                          <div className="text-sm text-white font-medium">
                            {selectedLog.success ? formatDateOnly(selectedLog.matched_date) : '-'}
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                          <div className="text-xs text-white/50 mb-1">Offset</div>
                          <div className="text-sm text-purple-400 font-medium">
                            {selectedLog.success ? `-${selectedLog.offset_days} dias` : '-'}
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                          <div className="text-xs text-white/50 mb-1">Tentativas</div>
                          <div className="text-sm text-white font-medium">{selectedLog.total_attempts}</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                          <div className="text-xs text-white/50 mb-1">Tempo Total</div>
                          <div className="text-sm text-blue-400 font-medium">{selectedLog.total_time_ms || 0}ms</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                          <div className="text-xs text-white/50 mb-1">Origem</div>
                          <div className="text-sm text-white font-medium capitalize">{selectedLog.execution_source}</div>
                        </div>
                      </div>

                      {/* Timeline */}
                      {selectedLog.attempts && selectedLog.attempts.length > 0 && (
                        <>
                          <Separator className="bg-white/10" />
                          <div>
                            <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                              <Clock className="h-4 w-4 text-[#F5B843]" />
                              Timeline de Tentativas
                            </h4>
                            <AttemptTimeline attempts={selectedLog.attempts} />
                          </div>
                        </>
                      )}

                      {/* LeadComex Data */}
                      {selectedLog.success && (
                        <>
                          <Separator className="bg-white/10" />
                          <div>
                            <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                              <Database className="h-4 w-4 text-[#F5B843]" />
                              Dados LeadComex
                            </h4>
                            
                            <div className="space-y-3">
                              {/* Situação */}
                              <div className="bg-white/5 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Zap className="h-3.5 w-3.5 text-[#F5B843]" />
                                  <span className="text-xs text-white/60">Situação</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-white/40">Lead:</span>
                                    <span className="text-white ml-1">{selectedLog.lc_situacao_lead || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-white/40">Portal:</span>
                                    <span className="text-white ml-1">{selectedLog.lc_situacao_portal || '-'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Rota */}
                              {(selectedLog.lc_aeroporto_origem || selectedLog.lc_aeroporto_destino) && (
                                <div className="bg-white/5 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Plane className="h-3.5 w-3.5 text-blue-400" />
                                    <span className="text-xs text-white/60">Rota</span>
                                  </div>
                                  <div className="text-sm text-white font-medium">
                                    {selectedLog.lc_aeroporto_origem || '???'} → {selectedLog.lc_aeroporto_destino || '???'}
                                  </div>
                                </div>
                              )}

                              {/* Carga */}
                              {(selectedLog.lc_peso_bruto || selectedLog.lc_quantidade_volumes) && (
                                <div className="bg-white/5 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Package className="h-3.5 w-3.5 text-emerald-400" />
                                    <span className="text-xs text-white/60">Carga</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="text-white/40">Peso:</span>
                                      <span className="text-white ml-1">{selectedLog.lc_peso_bruto || '-'} kg</span>
                                    </div>
                                    <div>
                                      <span className="text-white/40">Volumes:</span>
                                      <span className="text-white ml-1">{selectedLog.lc_quantidade_volumes || '-'}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Consignatário */}
                              {(selectedLog.lc_cnpj_consignatario || selectedLog.lc_nome_consignatario) && (
                                <div className="bg-white/5 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Building2 className="h-3.5 w-3.5 text-purple-400" />
                                    <span className="text-xs text-white/60">Consignatário</span>
                                  </div>
                                  <div className="space-y-1 text-xs">
                                    {selectedLog.lc_nome_consignatario && (
                                      <div className="text-white">{selectedLog.lc_nome_consignatario}</div>
                                    )}
                                    {selectedLog.lc_cnpj_consignatario && (
                                      <div className="text-white/60 font-mono">{selectedLog.lc_cnpj_consignatario}</div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Embarcador */}
                              {selectedLog.lc_nome_embarcador && (
                                <div className="bg-white/5 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <User className="h-3.5 w-3.5 text-orange-400" />
                                    <span className="text-xs text-white/60">Embarcador</span>
                                  </div>
                                  <div className="text-xs text-white">{selectedLog.lc_nome_embarcador}</div>
                                  {(selectedLog.lc_cidade_embarcador || selectedLog.lc_pais_embarcador) && (
                                    <div className="text-xs text-white/50 mt-1">
                                      {[selectedLog.lc_cidade_embarcador, selectedLog.lc_pais_embarcador].filter(Boolean).join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Frete */}
                              {selectedLog.lc_frete_valor_total && (
                                <div className="bg-white/5 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Ship className="h-3.5 w-3.5 text-cyan-400" />
                                    <span className="text-xs text-white/60">Frete</span>
                                  </div>
                                  <div className="text-sm text-white font-medium">
                                    {selectedLog.lc_frete_moeda_codigo || 'USD'} {Number(selectedLog.lc_frete_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              )}

                              {/* Bloqueios */}
                              {selectedLog.lc_bloqueios_ativos && selectedLog.lc_bloqueios_ativos.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                                    <span className="text-xs text-red-400">Bloqueios Ativos</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedLog.lc_bloqueios_ativos.map((bloqueio: any, idx: number) => (
                                      <Badge key={idx} className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                        {bloqueio.motivoBloqueio || bloqueio.tipoBloqueio || 'Bloqueio'}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Viagens */}
                              {selectedLog.lc_viagens_associadas && selectedLog.lc_viagens_associadas.length > 0 && (
                                <div className="bg-white/5 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Plane className="h-3.5 w-3.5 text-blue-400" />
                                    <span className="text-xs text-white/60">Viagens Associadas</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedLog.lc_viagens_associadas.map((viagem: any, idx: number) => (
                                      <Badge key={idx} variant="outline" className="border-blue-400/30 text-blue-400 text-xs">
                                        {viagem.identificacaoViagem}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadcomexLogsPage;
