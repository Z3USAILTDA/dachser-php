-- Drop tables that have been migrated to MariaDB
-- These tables are no longer needed as data is now managed in MariaDB

-- Drop voucher-related tables
DROP TABLE IF EXISTS public.voucher_logs CASCADE;
DROP TABLE IF EXISTS public.voucher_anexos CASCADE;
DROP TABLE IF EXISTS public.vouchers CASCADE;

-- Drop demurrage-related tables
DROP TABLE IF EXISTS public.t_demurrage_containers CASCADE;
DROP TABLE IF EXISTS public.t_demurrage_rates CASCADE;
DROP TABLE IF EXISTS public.t_demurrage_settings CASCADE;

-- Drop client free time table
DROP TABLE IF EXISTS public.t_client_free_time CASCADE;

-- Drop CHB document tables (metadata only - files remain in storage bucket)
DROP TABLE IF EXISTS public.chb_extracted_data CASCADE;
DROP TABLE IF EXISTS public.chb_documents CASCADE;
DROP TABLE IF EXISTS public.chb_analysis_requests CASCADE;