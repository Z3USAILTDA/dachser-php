-- Create table for CHB documents metadata
CREATE TABLE public.chb_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  etapa TEXT NOT NULL DEFAULT '1',
  doc_role TEXT DEFAULT 'O',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT
);

-- Enable RLS
ALTER TABLE public.chb_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view chb_documents" 
ON public.chb_documents 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert chb_documents" 
ON public.chb_documents 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete chb_documents" 
ON public.chb_documents 
FOR DELETE 
USING (true);

-- Create index for faster queries
CREATE INDEX idx_chb_documents_item_id ON public.chb_documents(item_id);