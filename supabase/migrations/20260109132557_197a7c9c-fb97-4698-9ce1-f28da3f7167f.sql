-- Drop tables that were migrated to MariaDB
-- WARNING: This is irreversible! Make sure all data has been migrated and the application is working correctly.

-- Drop sla_config table
DROP TABLE IF EXISTS public.sla_config;

-- Drop accrual_entries table
DROP TABLE IF EXISTS public.accrual_entries;

-- Drop chb_client_config table
DROP TABLE IF EXISTS public.chb_client_config;