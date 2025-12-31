-- Create table to cache extracted data from CHB documents
CREATE TABLE public.chb_extracted_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id INTEGER NOT NULL,
  document_id UUID REFERENCES public.chb_documents(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  etapa TEXT NOT NULL,
  extracted_fields JSONB NOT NULL DEFAULT '{}',
  raw_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_chb_extracted_data_item_id ON public.chb_extracted_data(item_id);
CREATE INDEX idx_chb_extracted_data_document_id ON public.chb_extracted_data(document_id);
CREATE UNIQUE INDEX idx_chb_extracted_data_item_filename ON public.chb_extracted_data(item_id, filename);

-- Enable RLS
ALTER TABLE public.chb_extracted_data ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (matching existing CHB tables pattern)
CREATE POLICY "Allow all operations on chb_extracted_data" 
ON public.chb_extracted_data 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_chb_extracted_data_updated_at
BEFORE UPDATE ON public.chb_extracted_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();