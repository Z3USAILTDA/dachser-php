import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Clock, TrendingUp, RefreshCw, Search, Filter, ChevronDown, ChevronUp, Eye, Calendar, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AttemptTimeline } from '@/components/cct/AttemptTimeline';
import { useLeadcomexLogs, useLeadcomexLogsStats, LeadcomexLog, LeadcomexLogFilters } from '@/hooks/useLeadcomexLogs';

const LeadcomexLogsPage: React.FC = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  
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
    const userData = localStorage.getItem('dachser_user');
    if (userData) {
      const user = JSON.parse(userData);
      if (user.is_admin === 1) {
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
      return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: ptBR });
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
      {/* Background glow effect */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(245, 184, 67, 0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 p-6 max-w-[1800px] mx-auto">
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
              <h1 className="text-2xl font-bold text-white">Logs LeadComex</h1>
              <p className="text-sm text-white/60">Histórico de enriquecimento com escada reversa de datas</p>
            </div>
          </div>
          
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="border-[#F5B843]/30 text-[#F5B843] hover:bg-[#F5B843]/10"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <Card className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
                <Zap className="h-4 w-4" />
                Total
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20 bg-white/10" />
              ) : (
                <div className="text-2xl font-bold text-white">{stats?.total || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-emerald-400/80 text-sm mb-1">
                <CheckCircle2 className="h-4 w-4" />
                Sucesso
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20 bg-white/10" />
              ) : (
                <div className="text-2xl font-bold text-emerald-400">{stats?.success_count || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-400/80 text-sm mb-1">
                <XCircle className="h-4 w-4" />
                Falha
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20 bg-white/10" />
              ) : (
                <div className="text-2xl font-bold text-red-400">{stats?.error_count || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-[#F5B843]/80 text-sm mb-1">
                <TrendingUp className="h-4 w-4" />
                Taxa
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20 bg-white/10" />
              ) : (
                <div className="text-2xl font-bold text-[#F5B843]">{stats?.success_rate || '0'}%</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-blue-400/80 text-sm mb-1">
                <Clock className="h-4 w-4" />
                Tempo Médio
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20 bg-white/10" />
              ) : (
                <div className="text-2xl font-bold text-blue-400">{stats?.avg_time_ms || 0}ms</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-purple-400/80 text-sm mb-1">
                <Calendar className="h-4 w-4" />
                Offset Médio
              </div>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-20 bg-white/10" />
              ) : (
                <div className="text-2xl font-bold text-purple-400">-{stats?.avg_offset_days || '0'}d</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-[#0d1117] border-white/10 mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input
                    placeholder="Buscar HAWB ou MAWB..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                </div>
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-white/10">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="error">Falha</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[150px] bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-white/10">
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="cron-hourly">Cron</SelectItem>
                  <SelectItem value="batch">Batch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="bg-[#0d1117] border-white/10">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-white text-lg">
              Execuções ({logsData?.total || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingLogs ? (
              <div className="p-8 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full bg-white/5" />
                ))}
              </div>
            ) : !logsData?.logs?.length ? (
              <div className="p-8 text-center text-white/60">
                Nenhum log encontrado
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/60 w-10"></TableHead>
                    <TableHead className="text-white/60">HAWB</TableHead>
                    <TableHead className="text-white/60">MAWB</TableHead>
                    <TableHead className="text-white/60">DEP</TableHead>
                    <TableHead className="text-white/60">Match</TableHead>
                    <TableHead className="text-white/60">Offset</TableHead>
                    <TableHead className="text-white/60">Tentativas</TableHead>
                    <TableHead className="text-white/60">Tempo</TableHead>
                    <TableHead className="text-white/60">Status</TableHead>
                    <TableHead className="text-white/60">Origem</TableHead>
                    <TableHead className="text-white/60">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow 
                        className="border-white/5 hover:bg-white/5 cursor-pointer"
                        onClick={() => toggleRow(log.id)}
                      >
                        <TableCell className="text-white/60">
                          {expandedRows.has(log.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="text-white font-mono text-sm">
                          {log.hawb}
                        </TableCell>
                        <TableCell className="text-white/80 font-mono text-sm">
                          {log.mawb || '-'}
                        </TableCell>
                        <TableCell className="text-white/60 text-sm">
                          {formatDateOnly(log.dep_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.success ? (
                            <span className="text-emerald-400">{formatDateOnly(log.matched_date)}</span>
                          ) : (
                            <span className="text-white/40">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.success ? (
                            <Badge variant="outline" className="border-purple-400/30 text-purple-400 bg-purple-400/10">
                              -{log.offset_days}d
                            </Badge>
                          ) : (
                            <span className="text-white/40">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-white/60 text-sm">
                          {log.total_attempts}
                        </TableCell>
                        <TableCell className="text-white/60 text-sm">
                          {log.total_time_ms ? `${log.total_time_ms}ms` : '-'}
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Sucesso
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                              <XCircle className="h-3 w-3 mr-1" />
                              Falha
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-white/20 text-white/60">
                            {log.execution_source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-white/60 text-sm">
                          {formatDate(log.created_at)}
                        </TableCell>
                      </TableRow>
                      
                      {/* Expanded Details */}
                      {expandedRows.has(log.id) && (
                        <TableRow className="border-white/5 bg-white/[0.02]">
                          <TableCell colSpan={11} className="p-0">
                            <div className="p-4 space-y-4">
                              {/* Timeline */}
                              {log.attempts && log.attempts.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium text-white/80 mb-3">Timeline de Tentativas</h4>
                                  <AttemptTimeline attempts={log.attempts} />
                                </div>
                              )}
                              
                              {/* LeadComex Data Summary */}
                              {log.success && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-white/10">
                                  <div>
                                    <span className="text-white/40 text-xs">Situação Lead</span>
                                    <p className="text-white text-sm">{log.lc_situacao_lead || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-white/40 text-xs">Situação Portal</span>
                                    <p className="text-white text-sm">{log.lc_situacao_portal || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-white/40 text-xs">Peso Bruto</span>
                                    <p className="text-white text-sm">{log.lc_peso_bruto ? `${log.lc_peso_bruto} kg` : '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-white/40 text-xs">Volumes</span>
                                    <p className="text-white text-sm">{log.lc_quantidade_volumes || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-white/40 text-xs">CNPJ Consignatário</span>
                                    <p className="text-white text-sm font-mono">{log.lc_cnpj_consignatario || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-white/40 text-xs">Consignatário</span>
                                    <p className="text-white text-sm">{log.lc_nome_consignatario || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-white/40 text-xs">Rota</span>
                                    <p className="text-white text-sm">
                                      {log.lc_aeroporto_origem} → {log.lc_aeroporto_destino}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-white/40 text-xs">Frete Total</span>
                                    <p className="text-white text-sm">
                                      {log.lc_frete_valor_total 
                                        ? `${log.lc_frete_moeda_codigo || ''} ${log.lc_frete_valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                        : '-'
                                      }
                                    </p>
                                  </div>
                                  
                                  {/* Bloqueios */}
                                  {log.lc_bloqueios_ativos && log.lc_bloqueios_ativos.length > 0 && (
                                    <div className="col-span-full">
                                      <span className="text-white/40 text-xs">Bloqueios Ativos</span>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {log.lc_bloqueios_ativos.map((bloqueio: any, idx: number) => (
                                          <Badge key={idx} className="bg-red-500/20 text-red-400 border-red-500/30">
                                            {bloqueio.motivoBloqueio || bloqueio.tipoBloqueio}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Viagens Associadas */}
                                  {log.lc_viagens_associadas && log.lc_viagens_associadas.length > 0 && (
                                    <div className="col-span-full">
                                      <span className="text-white/40 text-xs">Viagens Associadas</span>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {log.lc_viagens_associadas.map((viagem: any, idx: number) => (
                                          <Badge key={idx} variant="outline" className="border-blue-400/30 text-blue-400">
                                            {viagem.identificacaoViagem} ({viagem.dataPartidaPrevista})
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {/* Pagination */}
            {logsData && logsData.total > logsData.limit && (
              <div className="flex items-center justify-between p-4 border-t border-white/10">
                <span className="text-white/60 text-sm">
                  Mostrando {Math.min(logsData.offset + 1, logsData.total)}-
                  {Math.min(logsData.offset + logsData.limit, logsData.total)} de {logsData.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsData.offset === 0}
                    onClick={() => setFilters(prev => ({ ...prev, offset: Math.max(0, (prev.offset || 0) - (prev.limit || 50)) }))}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsData.offset + logsData.limit >= logsData.total}
                    onClick={() => setFilters(prev => ({ ...prev, offset: (prev.offset || 0) + (prev.limit || 50) }))}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeadcomexLogsPage;
