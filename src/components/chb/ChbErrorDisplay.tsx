import { AlertTriangle, FileX, RefreshCw, FileWarning, Cpu, Wifi, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ChbError {
  type: 'file_read' | 'file_format' | 'api_error' | 'network' | 'timeout' | 'unknown';
  message: string;
  documentName?: string;
  details?: string;
  suggestion?: string;
}

interface Props {
  errors: ChbError[];
  onRetry?: () => void;
  className?: string;
}

const errorConfig: Record<ChbError['type'], { icon: React.ElementType; color: string; title: string }> = {
  file_read: { icon: FileX, color: 'text-red-500', title: 'Erro de Leitura' },
  file_format: { icon: FileWarning, color: 'text-amber-500', title: 'Formato Inválido' },
  api_error: { icon: Cpu, color: 'text-red-500', title: 'Erro de Processamento' },
  network: { icon: Wifi, color: 'text-orange-500', title: 'Erro de Conexão' },
  timeout: { icon: AlertTriangle, color: 'text-yellow-500', title: 'Tempo Esgotado' },
  unknown: { icon: HelpCircle, color: 'text-gray-500', title: 'Erro Desconhecido' },
};

export function ChbErrorDisplay({ errors, onRetry, className }: Props) {
  if (errors.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {errors.map((error, index) => {
        const config = errorConfig[error.type] || errorConfig.unknown;
        const Icon = config.icon;

        return (
          <Card 
            key={index} 
            className={cn(
              'border-l-4 bg-card/50',
              error.type === 'file_format' ? 'border-l-amber-500' : 'border-l-destructive'
            )}
          >
            <CardHeader className="py-3 px-4">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Icon className={cn('h-4 w-4', config.color)} />
                <span className={config.color}>{config.title}</span>
                {error.documentName && (
                  <span className="text-muted-foreground font-normal">
                    — {error.documentName}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 px-4 space-y-2">
              <p className="text-sm text-foreground">{error.message}</p>
              
              {error.details && (
                <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded font-mono">
                  {error.details}
                </p>
              )}
              
              {error.suggestion && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-primary/5 p-2 rounded border border-primary/20">
                  <span className="text-primary">💡</span>
                  <span>{error.suggestion}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {onRetry && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onRetry}
          className="w-full mt-2"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar Novamente
        </Button>
      )}
    </div>
  );
}

// Helper to parse error responses from the API
export function parseChbApiError(error: any, files?: { name: string }[]): ChbError[] {
  const errors: ChbError[] = [];

  // Check if it's a structured error response
  if (error?.errors && Array.isArray(error.errors)) {
    return error.errors as ChbError[];
  }

  // Parse error message
  const message = error?.message || error?.error || String(error);

  // Detect error type based on message content
  if (message.includes('API key') || message.includes('not configured')) {
    errors.push({
      type: 'api_error',
      message: 'Chave da API não configurada',
      details: message,
      suggestion: 'Entre em contato com o suporte técnico para verificar a configuração.'
    });
  } else if (message.includes('timeout') || message.includes('Tempo esgotado')) {
    errors.push({
      type: 'timeout',
      message: 'A análise demorou mais do que o esperado',
      suggestion: 'Tente novamente. Se o problema persistir, tente com menos arquivos ou arquivos menores.'
    });
  } else if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    errors.push({
      type: 'network',
      message: 'Falha na conexão com o servidor',
      suggestion: 'Verifique sua conexão com a internet e tente novamente.'
    });
  } else if (message.includes('PDF') || message.includes('formato') || message.includes('format')) {
    errors.push({
      type: 'file_format',
      message: 'Formato de arquivo não suportado ou corrompido',
      details: message,
      suggestion: 'Verifique se o arquivo está em um formato suportado (PDF, imagem) e não está corrompido.'
    });
  } else if (message.includes('leitura') || message.includes('read') || message.includes('parse')) {
    const affectedFile = files?.find(f => message.includes(f.name));
    errors.push({
      type: 'file_read',
      message: 'Não foi possível ler o conteúdo do arquivo',
      documentName: affectedFile?.name,
      details: message,
      suggestion: 'O arquivo pode estar protegido, corrompido ou ser um scan de baixa qualidade. Tente um arquivo diferente.'
    });
  } else if (message.includes('Anthropic') && message.includes('Gemini')) {
    errors.push({
      type: 'api_error',
      message: 'Todas as tentativas de análise falharam',
      details: 'Os serviços de IA (Anthropic e Gemini) não conseguiram processar os documentos.',
      suggestion: 'Verifique a qualidade dos arquivos. PDFs digitais funcionam melhor que scans. Tente novamente em alguns minutos.'
    });
  } else {
    errors.push({
      type: 'unknown',
      message: message || 'Ocorreu um erro inesperado durante a análise',
      suggestion: 'Tente novamente. Se o problema persistir, entre em contato com o suporte.'
    });
  }

  return errors;
}
