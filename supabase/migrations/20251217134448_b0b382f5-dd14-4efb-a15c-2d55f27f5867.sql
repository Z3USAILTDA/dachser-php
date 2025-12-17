-- Create storage bucket for CHB documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('chb-documents', 'chb-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload chb documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chb-documents' AND auth.role() = 'authenticated');

-- Allow anyone to view/download files (public bucket)
CREATE POLICY "Anyone can view chb documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'chb-documents');

-- Allow authenticated users to delete their files
CREATE POLICY "Authenticated users can delete chb documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'chb-documents' AND auth.role() = 'authenticated');