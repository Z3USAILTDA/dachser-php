-- Drop existing restrictive INSERT policies
DROP POLICY IF EXISTS "Authenticated users can create vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Authenticated users can create logs" ON public.voucher_logs;
DROP POLICY IF EXISTS "Authenticated users can create anexos" ON public.voucher_anexos;

-- Create permissive INSERT policies (allow all inserts)
CREATE POLICY "Anyone can create vouchers" 
ON public.vouchers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can create logs" 
ON public.voucher_logs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can create anexos" 
ON public.voucher_anexos 
FOR INSERT 
WITH CHECK (true);