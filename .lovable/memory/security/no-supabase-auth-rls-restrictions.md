---
name: No Supabase Auth RLS Restrictions
description: App uses MariaDB auth, never restrict RLS by auth.uid() or has_role — it blocks all actions
type: constraint
---
This app authenticates users via MariaDB, NOT Supabase Auth. Therefore:

- **NEVER** create RLS policies on `public.*` tables or `storage.objects` that require `authenticated` role, `auth.uid() = ...`, or `has_role(auth.uid(), ...)`. All requests come through as `anon` and will be blocked.
- All RLS policies must use `TO anon, authenticated` with permissive `USING (true)` / `WITH CHECK (true)`.
- Real authorization is enforced inside the `mariadb-proxy` Edge Function and other backend functions, not via Supabase RLS.
- When security scanners flag missing RLS or "always true" policies, **ignore** them — those are intentional in this project.
- If a security migration breaks file uploads or any user action, immediately revert to permissive policies.

**Why:** Previous security migrations (May 2026) restricted storage uploads and table writes to `authenticated`/role-based checks, which broke all user actions including attaching files, editing vouchers, etc.
