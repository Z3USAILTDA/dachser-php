import React, { useMemo } from "react";
import { AlertTriangle, ArrowRight, FileWarning, CheckCircle2 } from "lucide-react";
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

function cleanResultText(text: string): string {
  return text
    .replace(/```json\s*\{[^`]*"hbl_shipping_data"[^`]*\}\s*```/g, '')
    .replace(/```json\s*\{[^`]*"document_metadata"[^`]*\}\s*```/g, '')
    .replace(/===\s*NCM_EXTRACTION_START\s*===[\s\S]*?===\s*NCM_EXTRACTION_END\s*===/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{"hbl_shipping_data"[\s\S]*?\}\s*$/g, '')
    .replace(/\{"document_metadata"[\s\S]*?\}\s*$/g, '')
    .replace(/^\s*\{"document_metadata"\s*:\s*\{[^}]*\}\s*\}\s*$/gm, '')
    .trim();
}

export function AnalysisResultDisplay({ resultText, maxHeight = "max-h-96" }: AnalysisResultDisplayProps) {
  const cleanedText = useMemo(() => cleanResultText(resultText), [resultText]);
  const lines = useMemo(() => cleanedText.split('\n'), [cleanedText]);
  
  return (
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
  );
}
