-- Disable RLS completely on vouchers tables
ALTER TABLE public.vouchers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_anexos DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies on these tables
DROP POLICY IF EXISTS "Authenticated users can view vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Authenticated users can update vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Allow anon inserts on vouchers" ON public.vouchers;

DROP POLICY IF EXISTS "Authenticated users can view logs" ON public.voucher_logs;
DROP POLICY IF EXISTS "Allow anon inserts on voucher_logs" ON public.voucher_logs;

DROP POLICY IF EXISTS "Authenticated users can view anexos" ON public.voucher_anexos;
DROP POLICY IF EXISTS "Allow anon inserts on voucher_anexos" ON public.voucher_anexos;