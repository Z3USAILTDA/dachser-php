CREATE TABLE public.cct_hidden_hawbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hawb text NOT NULL UNIQUE,
  reason text DEFAULT 'ENTREGUE',
  delivered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cct_hidden_hawbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view"
  ON public.cct_hidden_hawbs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert"
  ON public.cct_hidden_hawbs FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_cct_hidden_hawbs_hawb ON public.cct_hidden_hawbs (hawb);
CREATE INDEX idx_cct_hidden_hawbs_delivered_at ON public.cct_hidden_hawbs (delivered_at);