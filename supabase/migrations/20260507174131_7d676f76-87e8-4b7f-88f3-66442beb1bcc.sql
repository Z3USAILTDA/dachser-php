
-- air_hidden_awbs
DROP POLICY IF EXISTS "Authenticated can insert hidden awbs" ON public.air_hidden_awbs;
DROP POLICY IF EXISTS "Authenticated can view" ON public.air_hidden_awbs;
CREATE POLICY "Public can view air_hidden_awbs" ON public.air_hidden_awbs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert air_hidden_awbs" ON public.air_hidden_awbs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update air_hidden_awbs" ON public.air_hidden_awbs FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete air_hidden_awbs" ON public.air_hidden_awbs FOR DELETE TO anon, authenticated USING (true);

-- analise_documental_historico
DROP POLICY IF EXISTS "Users can delete their own analysis" ON public.analise_documental_historico;
DROP POLICY IF EXISTS "Authenticated can insert own analise_documental_historico" ON public.analise_documental_historico;
DROP POLICY IF EXISTS "Owners or admins can view analise_documental_historico" ON public.analise_documental_historico;
CREATE POLICY "Public can view analise_documental_historico" ON public.analise_documental_historico FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert analise_documental_historico" ON public.analise_documental_historico FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update analise_documental_historico" ON public.analise_documental_historico FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete analise_documental_historico" ON public.analise_documental_historico FOR DELETE TO anon, authenticated USING (true);

-- api_usage_cycles
DROP POLICY IF EXISTS "Admins can manage api_usage_cycles" ON public.api_usage_cycles;
CREATE POLICY "Public can manage api_usage_cycles" ON public.api_usage_cycles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- cct_evento_normalizado
DROP POLICY IF EXISTS "Privileged users can insert cct_evento_normalizado" ON public.cct_evento_normalizado;
CREATE POLICY "Public can insert cct_evento_normalizado" ON public.cct_evento_normalizado FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update cct_evento_normalizado" ON public.cct_evento_normalizado FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete cct_evento_normalizado" ON public.cct_evento_normalizado FOR DELETE TO anon, authenticated USING (true);

-- cct_excecao_operacional
DROP POLICY IF EXISTS "Privileged users can insert cct_excecao_operacional" ON public.cct_excecao_operacional;
DROP POLICY IF EXISTS "Privileged users can update cct_excecao_operacional" ON public.cct_excecao_operacional;
CREATE POLICY "Public can insert cct_excecao_operacional" ON public.cct_excecao_operacional FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update cct_excecao_operacional" ON public.cct_excecao_operacional FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete cct_excecao_operacional" ON public.cct_excecao_operacional FOR DELETE TO anon, authenticated USING (true);

-- cct_status_atual
DROP POLICY IF EXISTS "Privileged users can insert cct_status_atual" ON public.cct_status_atual;
DROP POLICY IF EXISTS "Privileged users can update cct_status_atual" ON public.cct_status_atual;
CREATE POLICY "Public can insert cct_status_atual" ON public.cct_status_atual FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update cct_status_atual" ON public.cct_status_atual FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete cct_status_atual" ON public.cct_status_atual FOR DELETE TO anon, authenticated USING (true);

-- forced_logouts
DROP POLICY IF EXISTS "Admins can insert forced_logouts" ON public.forced_logouts;
DROP POLICY IF EXISTS "Admins can read forced_logouts" ON public.forced_logouts;
CREATE POLICY "Public can view forced_logouts" ON public.forced_logouts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can insert forced_logouts" ON public.forced_logouts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update forced_logouts" ON public.forced_logouts FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete forced_logouts" ON public.forced_logouts FOR DELETE TO anon, authenticated USING (true);

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Public can view profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

-- shipments
DROP POLICY IF EXISTS "Privileged users can insert shipments" ON public.shipments;
DROP POLICY IF EXISTS "Privileged users can update shipments" ON public.shipments;
CREATE POLICY "Public can insert shipments" ON public.shipments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public can update shipments" ON public.shipments FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Public can delete shipments" ON public.shipments FOR DELETE TO anon, authenticated USING (true);
