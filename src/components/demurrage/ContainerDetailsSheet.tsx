import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import { 
  Package, 
  Ship, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2,
  DollarSign,
  FileText,
  Building2,
  Anchor,
  MapPin,
  Navigation
} from "lucide-react";
import type { DemurrageContainer } from "@/hooks/useDemurrageData";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ContainerDetailsSheetProps {
  container: DemurrageContainer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContainerDetailsSheet({ 
  container, 
  open, 
  onOpenChange
}: ContainerDetailsSheetProps) {
  const navigate = useNavigate();

  if (!container) return null;

  const handleViewTracking = () => {
    if (container.mbl) {
      navigate(`/sea/container-tracking?mbl=${encodeURIComponent(container.mbl)}`);
      onOpenChange(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD', 
      minimumFractionDigits: 0 
    }).format(value);
  };

  const getRiskBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> OK</Badge>;
      case 'at_risk':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" /> Risco</Badge>;
      case 'critical':
        return <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Crítico</Badge>;
      case 'exceeded':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20"><AlertTriangle className="h-3 w-3 mr-1" /> Excedido</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  const getFtSourceLabel = (source: string | null) => {
    switch (source) {
      case 'PROCESSO': return 'Por MBL';
      case 'CONTRATO': return 'Contrato Cliente';
      case 'TARIFA': return 'Tarifa Armador';
      case 'CONTAINER': return 'Container';
      default: return 'Padrão (14 dias)';
    }
  };

  const getFtSourceBadge = (source: string | null) => {
    switch (source) {
      case 'PROCESSO':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">MBL</Badge>;
      case 'CONTRATO':
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">Contrato</Badge>;
      case 'TARIFA':
        return <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">Tarifa</Badge>;
      default:
        return <Badge variant="secondary">Default</Badge>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] bg-[#0a0a0a] border-[rgba(255,255,255,0.1)] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-[#ffc800]">
            <Package className="w-5 h-5" />
            {container.numero}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Status do Risco */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
            <span className="text-sm text-muted-foreground">Status de Risco</span>
            {getRiskBadge(container.risk_status)}
          </div>

          {/* Informações Principais */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Informações</h3>
              {container.mbl && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleViewTracking}
                  className="border-[#ffc800]/30 text-[#ffc800] hover:bg-[#ffc800]/10"
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Ver Rastreio
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem icon={<FileText className="w-4 h-4" />} label="MBL" value={container.mbl} mono />
              <InfoItem icon={<Building2 className="w-4 h-4" />} label="Cliente" value={container.cliente || '-'} />
              <InfoItem icon={<Anchor className="w-4 h-4" />} label="Armador" value={container.armador || '-'} />
              <InfoItem icon={<Package className="w-4 h-4" />} label="Tipo" value={container.tipo_conteiner || '-'} />
              <InfoItem icon={<Ship className="w-4 h-4" />} label="Navio" value={container.navio || '-'} />
              <InfoItem icon={<MapPin className="w-4 h-4" />} label="Destino" value={container.porto_destino || '-'} />
            </div>
          </div>

          <Separator className="bg-[rgba(255,255,255,0.1)]" />

          {/* Datas */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Datas</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem icon={<Calendar className="w-4 h-4" />} label="ETD" value={formatDate(container.etd)} />
              <InfoItem icon={<Calendar className="w-4 h-4" />} label="ETA" value={formatDate(container.eta)} />
              <InfoItem icon={<Calendar className="w-4 h-4" />} label="Atracação" value={formatDate(container.data_atracacao)} />
              <InfoItem icon={<Calendar className="w-4 h-4" />} label="Gate Out" value={formatDate(container.data_gate_out)} />
            </div>
          </div>

          <Separator className="bg-[rgba(255,255,255,0.1)]" />

          {/* Free Time */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Free Time</h3>
              {getFtSourceBadge(container.ft_source)}
            </div>
            <div className="p-4 rounded-lg bg-[rgba(255,200,0,0.05)] border border-[rgba(255,200,0,0.2)]">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-[#ffc800]">{container.free_time_days}</p>
                  <p className="text-xs text-muted-foreground">Dias FT</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {container.days_remaining !== null ? container.days_remaining : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">Restantes</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">
                    {container.excedente_dias > 0 ? container.excedente_dias : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">Excedidos</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[rgba(255,200,0,0.2)]">
                <p className="text-xs text-muted-foreground">
                  Origem: <span className="text-foreground">{getFtSourceLabel(container.ft_source)}</span>
                </p>
                {container.ft_started_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Início: <span className="text-foreground">{formatDate(container.ft_started_at)}</span>
                  </p>
                )}
                {container.free_time_end_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Término: <span className="text-foreground">{formatDate(container.free_time_end_date)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-[rgba(255,255,255,0.1)]" />

          {/* Demurrage */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Demurrage</h3>
            <div className="p-4 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="w-4 h-4" />
                  <span>Custo Estimado</span>
                </div>
                <span className="text-xl font-bold text-[#ffc800]">
                  {container.expected_cost_usd > 0 ? formatCurrency(container.expected_cost_usd) : '-'}
                </span>
              </div>
              {container.rate_usd_per_day && container.rate_usd_per_day > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Taxa: {formatCurrency(container.rate_usd_per_day)}/dia
                </p>
              )}
            </div>
          </div>

          <Separator className="bg-[rgba(255,255,255,0.1)]" />

          {/* Notas */}
          {container.notes && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Notas</h3>
              <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)]">
                <p className="text-sm text-muted-foreground">{container.notes}</p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoItem({ 
  icon, 
  label, 
  value, 
  mono = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string; 
  mono?: boolean; 
}) {
  return (
    <div className="p-2 rounded bg-[rgba(255,255,255,0.03)]">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-sm truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </p>
    </div>
  );
}
