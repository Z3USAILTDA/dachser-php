CREATE TABLE public.forced_logouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_forced_logouts_username_active ON public.forced_logouts (username) WHERE active = true;

ALTER TABLE public.forced_logouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read forced_logouts"
  ON public.forced_logouts FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert forced_logouts"
  ON public.forced_logouts FOR INSERT
  WITH CHECK (true);