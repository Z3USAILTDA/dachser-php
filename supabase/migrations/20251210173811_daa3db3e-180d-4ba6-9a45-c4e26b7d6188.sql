-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can upload hawb documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own hawb documents" ON storage.objects;

-- Create permissive policy for uploads (allows any request with valid API key)
CREATE POLICY "Anyone can upload hawb documents"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'hawb-documents');

-- Create policy for deleting files
CREATE POLICY "Anyone can delete hawb documents"
ON storage.objects
FOR DELETE
USING (bucket_id = 'hawb-documents');