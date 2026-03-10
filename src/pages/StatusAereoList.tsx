import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search, Plane, Package, ArrowLeft, HelpCircle, Settings, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { DatabaseConnectionIndicator } from "@/components/DatabaseConnectionIndicator";
import { EmailClienteRegrasDialog } from "@/components/air/EmailClienteRegrasDialog";

const StatusAereoList = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [regrasDialogOpen, setRegrasDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['status-aereo', searchTerm],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-status-aereo', {
        body: { search: searchTerm }
      });

      if (error) {
        console.error('Error fetching status aereo:', error);
        return { success: false, data: [], error: error.message };
      }

      return data;
    },
    refetchInterval: 30000,
    retry: 1,
  });

  const handleSearch = () => {
    // The query will automatically refetch due to queryKey dependency
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      <DatabaseConnectionIndicator />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Button 
              variant="ghost" 
              onClick={() => navigate(-1)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRegrasDialogOpen(true)}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Regras
              </Button>
              <button
                onClick={() => navigate("/air/status-aereo/manual")}
                className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
                title="Manual do usuário"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">
              Status Aereo
            </h1>
          </div>
          <p className="text-muted-foreground">
            Monitor all AWBs from t_status_aereo table
          </p>
        </div>

        {/* Search */}
        <Card className="p-6 mb-6 backdrop-blur-sm bg-card/50 border-2">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder="Search by AWB, destinatário, or status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} className="md:w-auto">
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>
        </Card>

        {/* Results Table */}
        <Card className="backdrop-blur-sm bg-card/50 border-2">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading AWBs...</p>
            </div>
          ) : data?.success && data?.data?.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">AWB</TableHead>
                    <TableHead className="font-bold">Origem</TableHead>
                    <TableHead className="font-bold">Destino</TableHead>
                    <TableHead className="font-bold">Destinatário</TableHead>
                    <TableHead className="font-bold">Último Status</TableHead>
                    <TableHead className="font-bold">Status Info</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((item: any, index: number) => (
                    <TableRow 
                      key={index}
                      className="hover:bg-accent/10 transition-colors"
                    >
                      <TableCell className="font-mono font-semibold">
                        {item.awb}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {item.origem || '-'}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {item.destino || '-'}
                      </TableCell>
                      <TableCell>{item.destinatário || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            item.tracking_failed
                              ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                              : item.último_status === 'DLV' 
                              ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                              : item.último_status === 'ERRO' || item.último_status === 'NOT_FOUND'
                              ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                              : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          }`}>
                            {item.tracking_failed 
                              ? (item.awb?.startsWith('577') ? 'Sem informação' : 'Falha no rastreio')
                              : (item.último_status || 'N/A')
                            }
                          </span>
                          {item.awb?.startsWith('577') && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-blue-400 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p>Rastreio feito por API direta com a companhia.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {item.status_info || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <Package className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No AWBs found</p>
            </div>
          )}
        </Card>
      </div>

      <EmailClienteRegrasDialog 
        open={regrasDialogOpen} 
        onOpenChange={setRegrasDialogOpen} 
      />
    </div>
  );
};

export default StatusAereoList;
