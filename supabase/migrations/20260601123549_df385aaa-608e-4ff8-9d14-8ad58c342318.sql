
CREATE TABLE public.air_tracking_cache (
  cache_key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_tracking_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_tracking_cache TO anon;
GRANT ALL ON public.air_tracking_cache TO service_role;

ALTER TABLE public.air_tracking_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can manage air_tracking_cache"
  ON public.air_tracking_cache FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);
