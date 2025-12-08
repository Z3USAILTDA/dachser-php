import React from "react";
import { AlertTriangle, RefreshCw, Edit2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DhlAwbTracking, AlertCategory } from "./TrackingTypes";
import { formatAwbForDisplay, getStatusTextColor, getAlertCategory } from "./TrackingUtils";

interface TrackingDetailsSidebarProps {
  selectedAwb: DhlAwbTracking | null;
  alertSummary: string;
  bugAlertExplication: string | null;
  triggerTrackingUpdate: (awbNumber: string) => void;
  openRemarkModal: (awb: DhlAwbTracking) => void;
  openEmailModal: (awb: DhlAwbTracking) => void;
}

export const TrackingDetailsSidebar: React.FC<TrackingDetailsSidebarProps> = ({
  selectedAwb,
  alertSummary,
  bugAlertExplication,
  triggerTrackingUpdate,
  openRemarkModal,
  openEmailModal,
}) => {
  const getAlertIcon = (awb: DhlAwbTracking | null) => {
    if (!awb) return <AlertTriangle className="w-5 h-5 text-muted-foreground" />;

    switch (getAlertCategory(awb)) {
      case "critical":
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case "delayed":
        return <AlertTriangle className="w-5 h-5 text-primary" />;
      case "on_time":
      default:
        return <AlertTriangle className="w-5 h-5 text-green-400" />;
    }
  };

  const hasExplanation = bugAlertExplication && bugAlertExplication.length > 0;

  return (
    <div className="bg-card/90 border border-border rounded-2xl p-4 flex flex-col gap-4 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getAlertIcon(selectedAwb)}
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Detalhes do Alerta
            </p>
            <p className="text-sm font-medium text-foreground">
              {selectedAwb ? formatAwbForDisplay(selectedAwb.awb || "") : "Nenhuma AWB selecionada"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-border text-[11px] text-foreground bg-card hover:bg-muted"
          onClick={() => {
            if (selectedAwb?.awb) {
              triggerTrackingUpdate(selectedAwb.awb);
            }
          }}
          disabled={!selectedAwb}
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Reprocessar
        </Button>
      </div>

      <div className="text-xs space-y-1 text-foreground">
        <p>
          <span className="text-muted-foreground">Cliente: </span>
          {selectedAwb?.consignee || "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Rota: </span>
          {selectedAwb?.route || "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Status: </span>
          <span className={getStatusTextColor(selectedAwb?.status || null)}>
            {selectedAwb?.status || "-"}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Último evento: </span>
          {selectedAwb?.last_event || "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Dias em trânsito: </span>
          {selectedAwb?.days_in_transit ?? "-"}
        </p>
        <p>
          <span className="text-muted-foreground">Qtd NFDs: </span>
          {selectedAwb?.nfd_counter ?? "-"}
        </p>
      </div>

      <div
        className={`mt-4 rounded-lg border p-4 text-sm shadow-inner ${
          hasExplanation
            ? "border-primary/50 bg-primary/10"
            : "border-border bg-muted/30"
        }`}
      >
        <p className="text-[11px] font-semibold mb-1 text-primary flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Resumo do alerta
        </p>
        <p className="text-[11px] leading-relaxed text-foreground">{alertSummary}</p>
        {bugAlertExplication && (
          <p className="text-[10px] text-muted-foreground mt-2">{bugAlertExplication}</p>
        )}
      </div>

      <div className="mt-auto space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start rounded-full border-border text-[11px] text-foreground bg-card hover:bg-muted"
          disabled={!selectedAwb}
          onClick={() => {
            if (selectedAwb) openRemarkModal(selectedAwb);
          }}
        >
          <Edit2 className="w-3 h-3 mr-2" />
          Adicionar / editar observação
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start rounded-full border-green-600/50 text-[11px] text-green-300 bg-green-950/30 hover:bg-green-900/40"
          disabled={!selectedAwb}
          onClick={() => {
            if (selectedAwb) openEmailModal(selectedAwb);
          }}
        >
          <Mail className="w-3 h-3 mr-2" />
          Enviar atualização por e-mail
        </Button>
      </div>
    </div>
  );
};
