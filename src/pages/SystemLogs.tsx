import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDevAccess } from "@/hooks/useDevAccess";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faDownload, faSync, faSignOut } from "@fortawesome/free-solid-svg-icons";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function SystemLogs() {
  const navigate = useNavigate();
  const { isDevOrAdmin, isLoading } = useDevAccess();
  const { user, signOut } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFunction, setSelectedFunction] = useState<string>("all");
  const [logs, setLogs] = useState<any[]>([]);
  const [dbLogs, setDbLogs] = useState<any[]>([]);
  const [edgeLogs, setEdgeLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingDbLogs, setIsLoadingDbLogs] = useState(false);
  const [isLoadingEdgeLogs, setIsLoadingEdgeLogs] = useState(false);
  const [isDevUser, setIsDevUser] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState("live");

  // Check if user is devs@z3us.ai
  useEffect(() => {
    console.log('[SystemLogs] User email:', user?.email);
    if (user?.email === 'devs@z3us.ai') {
      setIsDevUser(true);
    } else {
      setIsDevUser(false);
    }
  }, [user]);

  // Redirect if not dev/admin
  useEffect(() => {
    console.log('[SystemLogs] Access check:', { isLoading, isDevOrAdmin });
    if (!isLoading && !isDevOrAdmin) {
      console.log('[SystemLogs] Access denied - redirecting to /maritimo');
      navigate("/maritimo");
    }
  }, [isLoading, isDevOrAdmin, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const edgeFunctions = [
    "all",
    "submit-analysis",
    "poll-analysis",
    "get-items",
    "get-item",
    "get-history",
    "complete-analysis",
    "delete-item",
    "upload-base-file",
    "extract-attachments"
  ];

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Sessão não encontrada");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-system-logs`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            functionName: selectedFunction,
            logType: 'analysis',
            limit: 100
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      setLogs(data.logs || []);
      toast.success(`${data.logs?.length || 0} logs carregados`);
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("Erro ao carregar logs");
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const fetchDatabaseLogs = async () => {
    setIsLoadingDbLogs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Sessão não encontrada");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-database-logs`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ limit: 100 })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch database logs');
      }

      const data = await response.json();
      setDbLogs(data.logs || []);
      
      if (data.logs && data.logs.length > 0) {
        toast.success(`${data.logs.length} database logs carregados`);
      } else {
        toast.info("Nenhum database log encontrado");
      }
    } catch (error) {
      console.error("Error fetching database logs:", error);
      toast.error("Erro ao carregar database logs");
    } finally {
      setIsLoadingDbLogs(false);
    }
  };

  const fetchEdgeFunctionLogs = async () => {
    setIsLoadingEdgeLogs(true);
    try {
      const allLogs: any[] = [];
      
      // Fetch logs for each edge function
      for (const funcName of edgeFunctions) {
        if (funcName === 'all') continue;
        
        try {
          const { data, error } = await supabase.functions.invoke('get-system-logs', {
            body: {
              functionName: funcName,
              logType: 'edge',
              limit: 20
            }
          });
          
          if (data?.logs && Array.isArray(data.logs)) {
            allLogs.push(...data.logs.map((log: any) => ({
              ...log,
              function: funcName,
              timestamp: log.timestamp || log.created_at
            })));
          }
        } catch (err) {
          console.error(`Error fetching logs for ${funcName}:`, err);
        }
      }
      
      // Sort by timestamp descending
      allLogs.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      
      setEdgeLogs(allLogs.slice(0, 100));
      
      if (allLogs.length > 0) {
        toast.success(`${allLogs.length} edge function logs carregados`);
      } else {
        toast.info("Nenhum edge function log encontrado");
      }
    } catch (error) {
      console.error("Error fetching edge function logs:", error);
      toast.error("Erro ao carregar edge function logs");
    } finally {
      setIsLoadingEdgeLogs(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesFunction = selectedFunction === "all" || log.function === selectedFunction;
    const matchesSearch = searchTerm === "" || 
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.function.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFunction && matchesSearch;
  });

  const getLevelColor = (level: string) => {
    const lowerLevel = level?.toLowerCase() || '';
    switch (lowerLevel) {
      case "error": return "text-red-500";
      case "warn": 
      case "warning": return "text-yellow-500";
      case "info": 
      case "log": return "text-blue-500";
      default: return "text-foreground";
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Don't render if not authorized
  if (!isDevOrAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/maritimo")}
              className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.12)] bg-[rgba(5,6,18,0.9)] text-[#aaaaaa] flex items-center justify-center backdrop-blur-sm hover:bg-[rgba(5,6,18,1)] hover:text-white transition-all"
            >
              <ArrowLeft size={16} />
            </button>
            <h1 className="text-2xl font-bold text-foreground">System Logs</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                if (activeLogTab === 'live') fetchLogs();
                else if (activeLogTab === 'database') fetchDatabaseLogs();
                else if (activeLogTab === 'edge') fetchEdgeFunctionLogs();
              }}
              disabled={isLoadingLogs || isLoadingDbLogs || isLoadingEdgeLogs}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full"
            >
              <FontAwesomeIcon icon={faSync} className={`mr-2 ${(isLoadingLogs || isLoadingDbLogs || isLoadingEdgeLogs) ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              onClick={() => {
                const currentLogs = activeLogTab === 'live' ? logs : 
                                   activeLogTab === 'database' ? dbLogs : edgeLogs;
                
                if (currentLogs.length === 0) {
                  toast.error("Nenhum log para exportar");
                  return;
                }
                
                const logsText = currentLogs
                  .map(log => `[${new Date(log.timestamp).toISOString()}] ${log.level || log.error_severity || 'LOG'} - ${log.function || log.identifier}: ${log.message || log.event_message}`)
                  .join('\n');
                
                const blob = new Blob([logsText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${activeLogTab}-logs-${new Date().toISOString()}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                toast.success("Logs exportados com sucesso");
              }}
              disabled={logs.length === 0 && dbLogs.length === 0 && edgeLogs.length === 0}
              className="bg-card border border-border text-foreground hover:bg-muted rounded-full"
            >
              <FontAwesomeIcon icon={faDownload} className="mr-2" />
              Exportar
            </Button>
            {isDevUser && (
              <Button
                onClick={handleLogout}
                className="bg-card border border-border text-foreground hover:bg-muted rounded-full"
              >
                <FontAwesomeIcon icon={faSignOut} className="mr-2" />
                Sair
              </Button>
            )}
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-6 bg-card border-border">
            <div className="text-sm text-muted-foreground mb-2">Total Logs</div>
            <div className="text-3xl font-bold text-foreground">
              {activeLogTab === 'live' ? logs.length : 
               activeLogTab === 'database' ? dbLogs.length : edgeLogs.length}
            </div>
          </Card>
          <Card className="p-6 bg-card border-border">
            <div className="text-sm text-muted-foreground mb-2">Errors</div>
            <div className="text-3xl font-bold text-destructive">
              {activeLogTab === 'live' 
                ? logs.filter(l => l.level === 'error').length
                : activeLogTab === 'database'
                ? dbLogs.filter(l => l.error_severity?.toLowerCase() === 'error').length
                : edgeLogs.filter(l => l.level?.toLowerCase() === 'error').length}
            </div>
          </Card>
          <Card className="p-6 bg-card border-border">
            <div className="text-sm text-muted-foreground mb-2">Warnings</div>
            <div className="text-3xl font-bold text-yellow-500">
              {activeLogTab === 'live'
                ? logs.filter(l => l.level === 'warn').length
                : activeLogTab === 'database'
                ? dbLogs.filter(l => l.error_severity?.toLowerCase() === 'warning').length
                : edgeLogs.filter(l => l.level?.toLowerCase() === 'warn').length}
            </div>
          </Card>
          <Card className="p-6 bg-card border-border">
            <div className="text-sm text-muted-foreground mb-2">Info</div>
            <div className="text-3xl font-bold text-blue-500">
              {activeLogTab === 'live'
                ? logs.filter(l => l.level === 'info').length
                : activeLogTab === 'database'
                ? dbLogs.filter(l => l.error_severity?.toLowerCase() === 'log' || l.error_severity?.toLowerCase() === 'info').length
                : edgeLogs.filter(l => l.level?.toLowerCase() === 'info' || l.event_type?.toLowerCase() === 'log').length}
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4 bg-card border-border">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <FontAwesomeIcon 
                  icon={faSearch} 
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  placeholder="Buscar em logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-muted border-border text-foreground rounded-full"
                />
              </div>
            </div>
            
            <Select value={selectedFunction} onValueChange={setSelectedFunction}>
              <SelectTrigger className="w-[250px] bg-muted border-border text-foreground rounded-full">
                <SelectValue placeholder="Filtrar por função" />
              </SelectTrigger>
              <SelectContent>
                {edgeFunctions.map(func => (
                  <SelectItem key={func} value={func}>
                    {func === "all" ? "Todas as funções" : func}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Logs Display */}
        <Card className="bg-card border-border">
          <Tabs value={activeLogTab} onValueChange={setActiveLogTab} className="w-full">
            <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0">
              <TabsTrigger value="live" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none text-foreground">
                Live Logs
              </TabsTrigger>
              <TabsTrigger 
                value="database" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none text-foreground"
                onClick={() => dbLogs.length === 0 && fetchDatabaseLogs()}
              >
                Database Logs
              </TabsTrigger>
              <TabsTrigger 
                value="edge" 
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none text-foreground"
                onClick={() => edgeLogs.length === 0 && fetchEdgeFunctionLogs()}
              >
                Edge Functions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="live" className="p-4">
              <ScrollArea className="h-[600px] w-full">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Nenhum log encontrado</p>
                    <p className="text-sm mt-2">Clique em "Atualizar" para carregar logs</p>
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-sm">
                    {filteredLogs.map((log, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={`font-semibold uppercase ${getLevelColor(log.level)} whitespace-nowrap`}>
                            {log.level}
                          </span>
                          <span className="text-primary whitespace-nowrap">
                            {log.function}
                          </span>
                          <span className="text-foreground flex-1">
                            {log.message}
                          </span>
                          {log.user_email && (
                            <span className="text-muted-foreground text-xs whitespace-nowrap">
                              👤 {log.user_email}
                            </span>
                          )}
                        </div>
                        {log.details && (
                          <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="database" className="p-4">
              <ScrollArea className="h-[600px] w-full">
                {isLoadingDbLogs ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : dbLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Nenhum database log encontrado</p>
                    <p className="text-sm mt-2">Clique em "Atualizar" para carregar logs</p>
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-sm">
                    {dbLogs.map((log, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {new Date(log.timestamp / 1000).toLocaleTimeString()}
                          </span>
                          <span className={`font-semibold uppercase ${getLevelColor(log.error_severity?.toLowerCase() || 'log')} whitespace-nowrap`}>
                            {log.error_severity || 'LOG'}
                          </span>
                          <span className="text-primary whitespace-nowrap">
                            {log.identifier}
                          </span>
                          <span className="text-foreground flex-1">
                            {log.event_message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="edge" className="p-4">
              <ScrollArea className="h-[600px] w-full">
                {isLoadingEdgeLogs ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : edgeLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Nenhum edge function log encontrado</p>
                    <p className="text-sm mt-2">Clique em "Atualizar" para carregar logs</p>
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-sm">
                    {edgeLogs.map((log, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {new Date(log.timestamp / 1000 || log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={`font-semibold uppercase ${getLevelColor(log.level || log.event_type)} whitespace-nowrap`}>
                            {log.event_type || log.level || 'LOG'}
                          </span>
                          <span className="text-primary whitespace-nowrap">
                            {log.function}
                          </span>
                          <span className="text-foreground flex-1">
                            {log.event_message || log.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
