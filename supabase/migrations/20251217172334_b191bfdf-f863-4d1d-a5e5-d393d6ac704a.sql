-- Drop the incorrect policy
DROP POLICY IF EXISTS "Allow all inserts on vouchers" ON public.vouchers;

-- Create policy for anon role (which is what Supabase JS client uses)
CREATE POLICY "Allow anon inserts on vouchers" 
ON public.vouchers 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- Fix voucher_logs
DROP POLICY IF EXISTS "Allow all inserts on voucher_logs" ON public.voucher_logs;

CREATE POLICY "Allow anon inserts on voucher_logs" 
ON public.voucher_logs 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- Fix voucher_anexos
DROP POLICY IF EXISTS "Allow all inserts on voucher_anexos" ON public.voucher_anexos;

CREATE POLICY "Allow anon inserts on voucher_anexos" 
ON public.voucher_anexos 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);