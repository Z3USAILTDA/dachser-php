-- Allow public uploads to voucher-anexos bucket
CREATE POLICY "Allow public uploads to voucher-anexos"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'voucher-anexos');

CREATE POLICY "Allow public read from voucher-anexos"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'voucher-anexos');

CREATE POLICY "Allow public delete from voucher-anexos"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'voucher-anexos');