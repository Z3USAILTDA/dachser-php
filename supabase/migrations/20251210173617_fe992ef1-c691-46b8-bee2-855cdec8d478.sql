-- Create storage bucket for HAWB documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('hawb-documents', 'hawb-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for authenticated users to upload files
CREATE POLICY "Authenticated users can upload hawb documents"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'hawb-documents' AND auth.uid() IS NOT NULL);

-- Create policy for public read access
CREATE POLICY "Public can read hawb documents"
ON storage.objects
FOR SELECT
USING (bucket_id = 'hawb-documents');

-- Create policy for users to delete their own files
CREATE POLICY "Users can delete their own hawb documents"
ON storage.objects
FOR DELETE
USING (bucket_id = 'hawb-documents' AND auth.uid()::text = (storage.foldername(name))[1]);