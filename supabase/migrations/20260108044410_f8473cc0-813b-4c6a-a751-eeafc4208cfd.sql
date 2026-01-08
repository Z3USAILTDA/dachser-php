-- Create table for document analysis history
CREATE TABLE public.analise_documental_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pdf_file_name TEXT NOT NULL,
  excel_file_name TEXT NOT NULL,
  pdf_summary JSONB,
  excel_summary JSONB,
  comparison JSONB,
  analysis JSONB,
  metadata JSONB,
  total_items INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  overall_status TEXT DEFAULT 'pending',
  created_by_user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analise_documental_historico ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view analise_documental_historico"
  ON public.analise_documental_historico
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert analise_documental_historico"
  ON public.analise_documental_historico
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete their own analysis"
  ON public.analise_documental_historico
  FOR DELETE
  USING (auth.uid() = created_by_user_id OR has_role(auth.uid(), 'ADMIN'));

-- Index for faster queries
CREATE INDEX idx_analise_documental_created_at ON public.analise_documental_historico(created_at DESC);
CREATE INDEX idx_analise_documental_status ON public.analise_documental_historico(overall_status);