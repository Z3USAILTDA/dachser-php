
-- Drop authenticated-only policies
DROP POLICY IF EXISTS "Authenticated upload voucher-anexos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update voucher-anexos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete voucher-anexos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload hawb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update hawb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete hawb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload maritime-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update maritime-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete maritime-files" ON storage.objects;

-- Recreate as public (app uses MariaDB auth, not Supabase Auth)
CREATE POLICY "Public upload voucher-anexos" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'voucher-anexos');
CREATE POLICY "Public update voucher-anexos" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'voucher-anexos');
CREATE POLICY "Public delete voucher-anexos" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'voucher-anexos');

CREATE POLICY "Public upload chb-documents" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'chb-documents');
CREATE POLICY "Public update chb-documents" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'chb-documents');
CREATE POLICY "Public delete chb-documents" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'chb-documents');

CREATE POLICY "Public upload hawb-documents" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'hawb-documents');
CREATE POLICY "Public update hawb-documents" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'hawb-documents');
CREATE POLICY "Public delete hawb-documents" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'hawb-documents');

CREATE POLICY "Public upload maritime-files" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'maritime-files');
CREATE POLICY "Public update maritime-files" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'maritime-files');
CREATE POLICY "Public delete maritime-files" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'maritime-files');
