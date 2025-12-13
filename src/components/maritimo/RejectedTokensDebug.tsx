import { AlertCircle, XCircle, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface RejectedToken {
  token?: string;
  code?: string;
  reason?: string;
}

interface RejectedTokensData {
  [fileName: string]: {
    invoices?: RejectedToken[];
    ncms?: RejectedToken[];
  };
}

interface RejectedTokensDebugProps {
  debugInfo?: {
    rejected_tokens?: RejectedTokensData;
  };
}

const REASON_LABELS: Record<string, { label: string; description: string; color: string }> = {
  "no_context_label": {
    label: "No Context",
    description: "Not found near required keywords (INVOICE, NF, NCM, HS)",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20"
  },
  "timestamp_like": {
    label: "Timestamp",
    description: "Token looks like timestamp/date (YYYYMMDD)",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20"
  },
  "all_zeros": {
    label: "All Zeros",
    description: "Token contains only zeros",
    color: "bg-red-500/10 text-red-400 border-red-500/20"
  },
  "too_short": {
    label: "Too Short",
    description: "Token too short after removing zeros (<6 characters)",
    color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
  },
  "letters_only": {
    label: "Letters Only",
    description: "Token contains only letters without nearby label (e.g., SDY-ZB)",
    color: "bg-red-500/10 text-red-400 border-red-500/20"
  },
  "not_8_digits": {
    label: "Not 8 Digits",
    description: "NCM does not have exactly 8 digits",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20"
  },
  "invalid_hs_prefix": {
    label: "Invalid HS Prefix",
    description: "First 2 digits outside range 01-97",
    color: "bg-pink-500/10 text-pink-400 border-pink-500/20"
  },
  "no_label_no_frequency": {
    label: "No Label/Frequency",
    description: "NCM appears once and without nearby label",
    color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
  },
  "wrong_column_xls": {
    label: "Wrong Column",
    description: "Token found in unrelated column in Excel",
    color: "bg-black/60 text-neutral-400 border-white/10"
  },
  "noise": {
    label: "Noise",
    description: "Token is typographic noise (PDF-1, IDENTITY-H, etc.)",
    color: "bg-black/60 text-neutral-400 border-white/10"
  }
};

export function RejectedTokensDebug({ debugInfo }: RejectedTokensDebugProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!debugInfo?.rejected_tokens) return null;

  const rejectedData = debugInfo.rejected_tokens;
  const hasRejections = Object.values(rejectedData).some(
    file => (file.invoices?.length || 0) > 0 || (file.ncms?.length || 0) > 0
  );

  if (!hasRejections) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card border-border">
        <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-primary" />
            <div className="text-left">
              <h3 className="text-lg font-semibold text-foreground">Debug: Rejected Tokens</h3>
              <p className="text-sm text-neutral-400">
                View tokens that were filtered during analysis
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {isOpen ? "Hide" : "Show"}
          </Badge>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-6 pt-0 space-y-6">
            {Object.entries(rejectedData).map(([fileName, data]) => {
              const hasInvoices = (data.invoices?.length || 0) > 0;
              const hasNcms = (data.ncms?.length || 0) > 0;
              
              if (!hasInvoices && !hasNcms) return null;

              return (
                <div key={fileName} className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{fileName}</span>
                  </div>

                  {hasInvoices && (
                    <div>
                      <h4 className="text-sm font-medium text-neutral-400 mb-3 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Rejected Invoice Tokens ({data.invoices?.length || 0})
                      </h4>
                      <div className="space-y-2">
                        {data.invoices?.slice(0, 20).map((item, idx) => {
                          const reasonInfo = REASON_LABELS[item.reason || ''] || {
                            label: item.reason || 'Unknown',
                            description: "Razão desconhecida",
                            color: "bg-black/60 text-neutral-400 border-white/10"
                          };
                          
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-background p-3 rounded-lg border border-white/10"
                            >
                              <div className="flex items-center gap-3">
                                <code className="text-sm font-mono text-foreground bg-white/5 px-2 py-1 rounded">
                                  {item.token}
                                </code>
                                <Badge className={`${reasonInfo.color} rounded-full text-xs`}>
                                  {reasonInfo.label}
                                </Badge>
                              </div>
                              <span className="text-xs text-neutral-400">
                                {reasonInfo.description}
                              </span>
                            </div>
                          );
                        })}
                        {(data.invoices?.length || 0) > 20 && (
                          <p className="text-xs text-neutral-400 text-center pt-2">
                            ... and {(data.invoices?.length || 0) - 20} more rejected tokens
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {hasNcms && (
                    <div>
                      <h4 className="text-sm font-medium text-neutral-400 mb-3 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Rejected NCM Codes ({data.ncms?.length || 0})
                      </h4>
                      <div className="space-y-2">
                        {data.ncms?.slice(0, 20).map((item, idx) => {
                          const reasonInfo = REASON_LABELS[item.reason || ''] || {
                            label: item.reason || 'Unknown',
                            description: "Razão desconhecida",
                            color: "bg-black/60 text-neutral-400 border-white/10"
                          };
                          
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-background p-3 rounded-lg border border-white/10"
                            >
                              <div className="flex items-center gap-3">
                                <code className="text-sm font-mono text-foreground bg-white/5 px-2 py-1 rounded">
                                  {item.code}
                                </code>
                                <Badge className={`${reasonInfo.color} rounded-full text-xs`}>
                                  {reasonInfo.label}
                                </Badge>
                              </div>
                              <span className="text-xs text-neutral-400">
                                {reasonInfo.description}
                              </span>
                            </div>
                          );
                        })}
                        {(data.ncms?.length || 0) > 20 && (
                          <p className="text-xs text-neutral-400 text-center pt-2">
                            ... and {(data.ncms?.length || 0) - 20} more rejected codes
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-medium text-neutral-400 mb-3">Rejection Reasons Legend:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(REASON_LABELS).map(([key, info]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <Badge className={`${info.color} rounded-full`}>
                      {info.label}
                    </Badge>
                    <span className="text-neutral-400">{info.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
