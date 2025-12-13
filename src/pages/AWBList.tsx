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
import { Search, Plane, Package, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { DatabaseConnectionIndicator } from "@/components/DatabaseConnectionIndicator";

const AWBList = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['awbs', searchTerm, statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-awbs', {
        body: { search: searchTerm, status: statusFilter }
      });

      if (error) {
        console.error('Error fetching AWBs:', error);
        return { success: false, data: [], error: error.message };
      }

      return data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 1,
  });

  const handleSearch = () => {
    // The query will automatically refetch due to queryKey dependency
  };

  const handleRowClick = (awb: string, airlineCode: string) => {
    navigate(`/?awb=${awb}&airline=${airlineCode}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      <DatabaseConnectionIndicator />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">
              Tracked AWBs
            </h1>
          </div>
          <p className="text-muted-foreground">
            Monitor all your air waybills in real-time
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="p-6 mb-6 backdrop-blur-sm bg-card/50 border-2">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder="Search by AWB, consignee name, or airline code..."
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
                    <TableHead className="font-bold">Airline</TableHead>
                    <TableHead className="font-bold">Consignee</TableHead>
                    <TableHead className="font-bold">Latest Event</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="font-bold">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((awb: any, index: number) => (
                    <TableRow 
                      key={index}
                      className="cursor-pointer hover:bg-accent/10 transition-colors"
                      onClick={() => handleRowClick(awb.awb, awb.airline_code)}
                    >
                      <TableCell className="font-mono font-semibold">
                        {awb.awb}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Plane className="w-4 h-4 text-primary" />
                          {awb.airline_code}
                        </div>
                      </TableCell>
                      <TableCell>{awb.consignee_name || '-'}</TableCell>
                      <TableCell className="max-w-md truncate">
                        {awb.last_event || '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          awb.status === 'DLV' 
                            ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                            : awb.status === 'ARR'
                            ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                            : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                        }`}>
                          {awb.status || 'N/A'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {awb.created_at ? new Date(awb.created_at).toLocaleDateString('pt-BR') : '-'}
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
    </div>
  );
};

export default AWBList;
