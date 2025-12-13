export type StepStatus = 'completed' | 'current' | 'pending';

export type TabType = 'documentos' | 'analise' | 'historico';

export interface ChbStep {
  id: number;
  label: string;
  status: StepStatus;
}

export interface ChbDocument {
  id: string;
  name: string;
  type: 'HBL' | 'Invoice' | 'Packing List' | 'DI' | 'AWB' | 'Certificado';
  uploadedAt: string;
  size: string;
  stepId?: number;
  file?: File;
}

export interface ChbAnalysis {
  id: string;
  stepId: number;
  content: string;
  tags: { label: string; variant: 'success' | 'warning' | 'error' }[];
  generatedAt: string;
}

export interface ChbAnalysisResult {
  id: string;
  stepId: number;
  html: string;
  tags: { label: string; variant: 'success' | 'warning' | 'error' }[];
  summary: string;
  detailedSummary?: string;
  generatedAt: string;
  filesAnalyzed: string[];
  usedFallback?: boolean;
}

export interface ChbApprovedHistory {
  id: string;
  stepId: number;
  date: string;
  user: string;
  summary: string;
  detailedSummary?: string;
  tags: { label: string; variant: 'success' | 'warning' | 'error' }[];
}

export interface ChbHistoryEntry {
  id: string;
  stepId: number;
  date: string;
  user: string;
  summary: string;
}

export interface ChbNote {
  id: string;
  stepId: number;
  user: string;
  date: string;
  content: string;
}
