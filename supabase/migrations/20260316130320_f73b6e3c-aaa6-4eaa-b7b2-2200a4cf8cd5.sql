CREATE TABLE public.air_hidden_awbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  awb text NOT NULL UNIQUE,
  reason text DEFAULT 'DLV',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.air_hidden_awbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view" ON public.air_hidden_awbs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert" ON public.air_hidden_awbs FOR INSERT WITH CHECK (true);