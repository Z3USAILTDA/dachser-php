import { AlertCircle } from "lucide-react";

type RejectedToken = { token?: string; reason?: string; };
type RejectedNcm = { code?: string; reason?: string; };

type DebugInfo = {
  rejected_tokens?: {
    [filename: string]: {
      invoices?: RejectedToken[];
      ncms?: RejectedNcm[];
    };
  };
};

interface RejectedTokensDebugProps {
  debugInfo?: DebugInfo;
}

export function RejectedTokensDebug({ debugInfo }: RejectedTokensDebugProps) {
  if (!debugInfo?.rejected_tokens) return null;

  const files = Object.entries(debugInfo.rejected_tokens);
  if (files.length === 0) return null;

  const hasRejectedData = files.some(([_, data]) => 
    (data.invoices && data.invoices.length > 0) || 
    (data.ncms && data.ncms.length > 0)
  );

  if (!hasRejectedData) return null;

  return (
    <div className="bg-amber-950/20 border border-amber-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-amber-400" />
        <h4 className="text-sm font-semibold text-amber-400">Tokens Rejeitados (Debug)</h4>
      </div>
      
      <div className="space-y-4">
        {files.map(([filename, data]) => (
          <div key={filename} className="text-xs">
            <p className="text-neutral-300 font-medium mb-2">{filename}</p>
            
            {data.invoices && data.invoices.length > 0 && (
              <div className="mb-2">
                <span className="text-neutral-500">Invoices rejeitados:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.invoices.map((item, idx) => (
                    <span 
                      key={idx} 
                      className="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded text-xs"
                      title={item.reason}
                    >
                      {item.token}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {data.ncms && data.ncms.length > 0 && (
              <div>
                <span className="text-neutral-500">NCMs rejeitados:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.ncms.map((item, idx) => (
                    <span 
                      key={idx} 
                      className="px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded text-xs"
                      title={item.reason}
                    >
                      {item.code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
