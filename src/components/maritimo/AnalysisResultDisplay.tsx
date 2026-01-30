import React, { useState, useMemo } from "react";
import { Copy, Check, AlertTriangle, ArrowRight, FileWarning, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AnalysisResultDisplayProps {
  resultText: string;
  maxHeight?: string;
}

type LineType = 'divergence' | 'action' | 'warning' | 'header' | 'match' | 'normal' | 'summary-header';

function classifyLine(line: string): LineType {
  const trimmed = line.trim();
  
  // Summary section headers
  if (/SUMMARY FOR EXTERNAL COMMUNICATION|═══.*SUMMARY|ANALYSIS SUMMARY/i.test(trimmed)) {
    return 'summary-header';
  }
  
  // Section headers like EXPORTER #N:, CONTAINER:, NCM CODES:
  if (/^(EXPORTER\s*#\d+:|CONTAINER:|NCM CODES?:|TOTAL|INVOICE REFERENCES:|SEAL NUMBER:|CONSIGNEE|PARTIES|ROUTING)/i.test(trimmed)) {
    return 'header';
  }
  
  // Divergence patterns - highest priority
  if (/UPDATE REQUIRED|Status:\s*DIFFERENT|Status:\s*MISMATCH|MISMATCH|Status:\s*NOT FOUND|Status:\s*DIVERGENCE/i.test(trimmed)) {
    return 'divergence';
  }
  
  // Action patterns
  if (/^→\s*(Update|Action):|^Update:|→\s*Adjust|→\s*Change|→\s*Correct/i.test(trimmed)) {
    return 'action';
  }
  
  // Warning patterns - Missing/Extra with actual values (not "none")
  if (/Missing:|Extra:|Missing in HBL:|Extra in HBL:|Extra in MBL:|Missing in MBL:/i.test(trimmed)) {
    if (/:\s*none/i.test(trimmed)) {
      return 'normal';
    }
    return 'warning';
  }
  
  // Delta with non-zero value
  if (/Delta:\s*[+-]?[1-9]/i.test(trimmed)) {
    return 'warning';
  }
  
  // Match patterns - subtle styling
  if (/Status:\s*MATCH|MATCH\s*✓|No changes required|No discrepancies/i.test(trimmed)) {
    return 'match';
  }
  
  // Discrepancy counts in summary
  if (/discrepanc(y|ies)|⚠️/i.test(trimmed)) {
    return 'warning';
  }
  
  return 'normal';
}

const lineStyles: Record<LineType, string> = {
  divergence: 'bg-rose-500/15 border-l-4 border-rose-500 pl-3 py-1 text-rose-300 rounded-r',
  action: 'bg-blue-500/10 border-l-2 border-blue-400 pl-3 py-0.5 text-blue-300',
  warning: 'bg-amber-500/10 border-l-2 border-amber-400 pl-3 py-0.5 text-amber-300',
  header: 'bg-white/5 font-bold text-white mt-4 py-1 px-2 rounded',
  match: 'text-emerald-400/70',
  normal: 'text-neutral-300',
  'summary-header': 'bg-amber-500/20 font-bold text-amber-300 mt-6 py-2 px-3 rounded border border-amber-500/30',
};

const lineIcons: Partial<Record<LineType, React.ReactNode>> = {
  divergence: <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-rose-400" />,
  action: <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />,
  warning: <FileWarning className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />,
  match: <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400/70" />,
};

interface DivergenceBlock {
  context: string; // e.g., "EXPORTER #15: MALIK GmbH"
  lines: string[];
}

function extractDivergenceSummary(text: string): { blocks: DivergenceBlock[]; plainText: string } {
  const lines = text.split('\n');
  const blocks: DivergenceBlock[] = [];
  
  let currentContext = '';
  let currentBlock: string[] = [];
  let inDivergentSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const type = classifyLine(line);
    
    // Check if this is a context header
    if (type === 'header') {
      // Save previous block if it has divergences
      if (inDivergentSection && currentBlock.length > 0) {
        blocks.push({ context: currentContext, lines: [...currentBlock] });
      }
      currentContext = trimmed;
      currentBlock = [];
      inDivergentSection = false;
      continue;
    }
    
    // Check if this line is a divergence/warning/action
    if (type === 'divergence' || type === 'warning' || type === 'action') {
      inDivergentSection = true;
      currentBlock.push(line);
    } else if (inDivergentSection && type === 'normal' && trimmed !== '') {
      // Continue adding context lines if we're in a divergent section
      currentBlock.push(line);
    }
  }
  
  // Don't forget the last block
  if (inDivergentSection && currentBlock.length > 0) {
    blocks.push({ context: currentContext, lines: [...currentBlock] });
  }
  
  // Generate plain text for copying
  const plainText = blocks.length > 0
    ? blocks.map(b => {
        const header = b.context ? `${b.context}\n` : '';
        return header + b.lines.join('\n');
      }).join('\n\n')
    : "Nenhuma divergência encontrada - todos os documentos estão reconciliados.";
  
  return { blocks, plainText };
}

function cleanResultText(text: string): string {
  return text
    .replace(/```json\s*\{[^`]*"hbl_shipping_data"[^`]*\}\s*```/g, '')
    .replace(/===\s*NCM_EXTRACTION_START\s*===[\s\S]*?===\s*NCM_EXTRACTION_END\s*===/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{"hbl_shipping_data"[\s\S]*?\}\s*$/g, '')
    .trim();
}

export function AnalysisResultDisplay({ resultText, maxHeight = "max-h-96" }: AnalysisResultDisplayProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  
  const cleanedText = useMemo(() => cleanResultText(resultText), [resultText]);
  
  const lines = useMemo(() => cleanedText.split('\n'), [cleanedText]);
  
  const divergenceSummary = useMemo(() => extractDivergenceSummary(cleanedText), [cleanedText]);
  
  const hasDivergences = divergenceSummary.blocks.length > 0;
  
  const handleCopySummary = () => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = divergenceSummary.plainText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        setCopiedSummary(true);
        toast.success("Resumo das divergências copiado");
        setTimeout(() => setCopiedSummary(false), 2000);
      } else {
        throw new Error("execCommand failed");
      }
    } catch (err) {
      console.error('Copy error:', err);
      toast.error("Não foi possível copiar.");
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Main result with highlighting */}
      <div className={cn("bg-black/30 rounded-lg p-4 overflow-y-auto font-mono text-sm", maxHeight)}>
        {lines.map((line, index) => {
          const type = classifyLine(line);
          const style = lineStyles[type];
          const icon = lineIcons[type];
          
          // Empty lines
          if (line.trim() === '') {
            return <div key={index} className="h-2" />;
          }
          
          return (
            <div key={index} className={cn("flex items-start gap-2", style)}>
              {icon}
              <span className="whitespace-pre-wrap">{line}</span>
            </div>
          );
        })}
      </div>
      
      {/* Divergence Summary Section */}
      {hasDivergences && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              RESUMO DAS DIVERGÊNCIAS
            </h4>
            <Button
              onClick={handleCopySummary}
              variant="outline"
              size="sm"
              className="rounded-full border-amber-400/50 bg-black/40 text-amber-300 hover:border-amber-400 hover:bg-black text-xs h-7"
            >
              {copiedSummary ? <Check className="w-3 h-3 mr-1.5" /> : <Copy className="w-3 h-3 mr-1.5" />}
              Copiar Resumo
            </Button>
          </div>
          
          <div className="bg-black/30 rounded-lg p-3 font-mono text-xs max-h-60 overflow-y-auto space-y-3">
            {divergenceSummary.blocks.map((block, blockIndex) => (
              <div key={blockIndex} className="space-y-1">
                {block.context && (
                  <div className="font-bold text-white/90 text-sm">{block.context}</div>
                )}
                {block.lines.map((line, lineIndex) => {
                  const type = classifyLine(line);
                  const style = lineStyles[type];
                  return (
                    <div key={lineIndex} className={cn("whitespace-pre-wrap", style)}>
                      {line}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {!hasDivergences && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-emerald-300 text-sm font-medium">
            Nenhuma divergência encontrada - todos os documentos estão reconciliados.
          </span>
        </div>
      )}
    </div>
  );
}
