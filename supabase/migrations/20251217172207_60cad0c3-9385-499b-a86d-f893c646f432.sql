-- Drop existing INSERT policy and create a truly permissive one
DROP POLICY IF EXISTS "Anyone can create vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can create vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Authenticated users can create vouchers" ON public.vouchers;

-- Create permissive INSERT policy (allows all inserts)
CREATE POLICY "Allow all inserts on vouchers" 
ON public.vouchers 
FOR INSERT 
TO public
WITH CHECK (true);

-- Also fix voucher_logs and voucher_anexos
DROP POLICY IF EXISTS "Anyone can create logs" ON public.voucher_logs;
DROP POLICY IF EXISTS "Users can create logs" ON public.voucher_logs;

CREATE POLICY "Allow all inserts on voucher_logs" 
ON public.voucher_logs 
FOR INSERT 
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can create anexos" ON public.voucher_anexos;
DROP POLICY IF EXISTS "Users can create anexos" ON public.voucher_anexos;

CREATE POLICY "Allow all inserts on voucher_anexos" 
ON public.voucher_anexos 
FOR INSERT 
TO public
WITH CHECK (true);