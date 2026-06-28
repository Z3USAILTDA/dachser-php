import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, CheckCircle2, XCircle, Table, Rows3 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface XlsxDiagnostics {
  readable?: boolean;
  sheets_processed?: number;
  rows_found?: number;
  headers_found?: string[];
  reasons?: string[];
  mapped_invoice_headers?: string[];
  mapped_ncm_headers?: string[];
  counts?: {
    invoices_found: number;
    ncm8_found: number;
  };
}

interface XlsxDebugPanelProps {
  diagnostics?: XlsxDiagnostics;
  fileName?: string;
}

export function XlsxDebugPanel({ diagnostics, fileName }: XlsxDebugPanelProps) {
  if (!diagnostics) {
    return null;
  }

  const hasData = (diagnostics.counts?.invoices_found ?? 0) > 0 || (diagnostics.counts?.ncm8_found ?? 0) > 0;
  const hasIssues = !diagnostics.readable || (diagnostics.reasons?.length ?? 0) > 0;

  return (
    <Card className="bg-black/40 border-white/10">
      <CardHeader>
        <CardTitle className="text-neutral-300 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Debug Panel — XLSX Manifest Parser
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fileName && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-400">Arquivo:</span>
            <Badge variant="outline" className="font-mono text-xs">
              {fileName}
            </Badge>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-black/50 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Table className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-neutral-400">Planilhas</span>
            </div>
            <p className="text-2xl font-bold text-neutral-200">
              {diagnostics.sheets_processed ?? 0}
            </p>
          </div>

          <div className="bg-black/50 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Rows3 className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-neutral-400">Linhas</span>
            </div>
            <p className="text-2xl font-bold text-neutral-200">
              {diagnostics.rows_found ?? 0}
            </p>
          </div>
        </div>

        <Separator className="bg-white/10" />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
            {hasData ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            Resultados da Extração
          </h4>

          <div className="bg-black/30 p-3 rounded border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-400">
                Invoice Tokens Encontrados
              </span>
              <Badge 
                variant={diagnostics.counts?.invoices_found ? "default" : "secondary"}
                className="text-xs"
              >
                {diagnostics.counts?.invoices_found ?? 0}
              </Badge>
            </div>
            
            {diagnostics.mapped_invoice_headers && diagnostics.mapped_invoice_headers.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-neutral-500">Colunas mapeadas:</p>
                <div className="flex flex-wrap gap-1">
                  {diagnostics.mapped_invoice_headers.map((header, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className="text-xs font-mono bg-blue-950/20 border-blue-800 text-blue-300"
                    >
                      {header}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-500">
                ⚠️ Nenhuma coluna de invoice detectada
              </p>
            )}
          </div>

          <div className="bg-black/30 p-3 rounded border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-400">
                NCM-8 Códigos Encontrados
              </span>
              <Badge 
                variant={diagnostics.counts?.ncm8_found ? "default" : "secondary"}
                className="text-xs"
              >
                {diagnostics.counts?.ncm8_found ?? 0}
              </Badge>
            </div>
            
            {diagnostics.mapped_ncm_headers && diagnostics.mapped_ncm_headers.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-neutral-500">Colunas mapeadas:</p>
                <div className="flex flex-wrap gap-1">
                  {diagnostics.mapped_ncm_headers.map((header, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className="text-xs font-mono bg-purple-950/20 border-purple-800 text-purple-300"
                    >
                      {header}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-500">
                ⚠️ Nenhuma coluna de NCM/HS detectada
              </p>
            )}
          </div>
        </div>

        {hasIssues && (
          <>
            <Separator className="bg-white/10" />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Problemas Detectados
              </h4>
              {!diagnostics.readable && (
                <p className="text-xs text-red-400">
                  • Arquivo não pôde ser lido corretamente
                </p>
              )}
              {diagnostics.reasons && diagnostics.reasons.length > 0 && (
                <div className="space-y-1">
                  {diagnostics.reasons.map((reason, idx) => (
                    <p key={idx} className="text-xs text-amber-400">
                      • {reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {!hasData && (
          <>
            <Separator className="bg-white/10" />
            <div className="bg-amber-950/20 border border-amber-800 rounded p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-300">
                💡 Dicas para resolver:
              </p>
              <ul className="text-xs text-amber-200 space-y-1 ml-4 list-disc">
                <li>Verifique se as colunas têm headers claros (INVOICE, INV, NCM, HS CODE)</li>
                <li>Certifique-se de que há dados nas linhas abaixo do header</li>
                <li>Tokens de invoice devem ter 6-20 caracteres e conter dígitos</li>
                <li>NCMs devem ser códigos de 8 dígitos (prefixo HS 01-97)</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
