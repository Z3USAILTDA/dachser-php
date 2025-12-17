-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated uploads to chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from chb-documents" ON storage.objects;

-- Create permissive policies for chb-documents bucket
-- Allow anyone to upload files (since CHB doesn't use Supabase auth)
CREATE POLICY "Allow public uploads to chb-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chb-documents');

-- Allow anyone to read files
CREATE POLICY "Allow public reads from chb-documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'chb-documents');

-- Allow anyone to delete files
CREATE POLICY "Allow public deletes from chb-documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'chb-documents');

-- Allow anyone to update files
CREATE POLICY "Allow public updates to chb-documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'chb-documents');