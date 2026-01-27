import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="p-4 rounded-full bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Algo deu errado
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Ocorreu um erro ao carregar esta página. Tente atualizar a página ou entre em contato com o suporte se o problema persistir.
            </p>
            {this.state.error && (
              <p className="text-xs text-destructive/80 font-mono bg-destructive/5 px-3 py-2 rounded-lg mt-2 max-w-md overflow-hidden">
                {this.state.error.message}
              </p>
            )}
          </div>
          <Button 
            onClick={this.handleReset}
            className="mt-2"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Recarregar página
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
