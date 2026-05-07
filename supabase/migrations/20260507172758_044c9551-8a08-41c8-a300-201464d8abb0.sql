
-- forced_logouts: admin only
DROP POLICY IF EXISTS "Anyone can insert forced_logouts" ON public.forced_logouts;
DROP POLICY IF EXISTS "Anyone can read forced_logouts" ON public.forced_logouts;
CREATE POLICY "Admins can read forced_logouts" ON public.forced_logouts
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE POLICY "Admins can insert forced_logouts" ON public.forced_logouts
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

-- air_hidden_awbs: authenticated insert
DROP POLICY IF EXISTS "Anyone can insert" ON public.air_hidden_awbs;
CREATE POLICY "Authenticated can insert hidden awbs" ON public.air_hidden_awbs
  FOR INSERT TO authenticated WITH CHECK (true);

-- analise_documental_historico: scope SELECT to owner/admin
DROP POLICY IF EXISTS "Authenticated users can view analise_documental_historico" ON public.analise_documental_historico;
DROP POLICY IF EXISTS "Authenticated users can insert analise_documental_historico" ON public.analise_documental_historico;
CREATE POLICY "Owners or admins can view analise_documental_historico" ON public.analise_documental_historico
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by_user_id OR has_role(auth.uid(), 'ADMIN'::app_role));
CREATE POLICY "Authenticated can insert own analise_documental_historico" ON public.analise_documental_historico
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by_user_id);

-- shipments: restrict writes to admin/operacao roles
DROP POLICY IF EXISTS "Authenticated users can insert shipments" ON public.shipments;
DROP POLICY IF EXISTS "Authenticated users can update shipments" ON public.shipments;
CREATE POLICY "Privileged users can insert shipments" ON public.shipments
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'ADMIN'::app_role)
    OR has_role(auth.uid(), 'OPERACAO'::app_role)
    OR has_role(auth.uid(), 'GESTOR_OPERACAO'::app_role)
  );
CREATE POLICY "Privileged users can update shipments" ON public.shipments
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'ADMIN'::app_role)
    OR has_role(auth.uid(), 'OPERACAO'::app_role)
    OR has_role(auth.uid(), 'GESTOR_OPERACAO'::app_role)
  );

-- api_usage_cycles: admin SELECT only
DROP POLICY IF EXISTS "Authenticated users can view api_usage_cycles" ON public.api_usage_cycles;
-- Admin ALL policy already exists and covers SELECT.

-- profiles: own profile only (admin ALL policy already covers admins)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- CCT tables: restrict writes to admin/operacao
DROP POLICY IF EXISTS "Authenticated users can insert cct_status_atual" ON public.cct_status_atual;
DROP POLICY IF EXISTS "Authenticated users can update cct_status_atual" ON public.cct_status_atual;
CREATE POLICY "Privileged users can insert cct_status_atual" ON public.cct_status_atual
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'OPERACAO'::app_role) OR has_role(auth.uid(), 'GESTOR_OPERACAO'::app_role));
CREATE POLICY "Privileged users can update cct_status_atual" ON public.cct_status_atual
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'OPERACAO'::app_role) OR has_role(auth.uid(), 'GESTOR_OPERACAO'::app_role));

DROP POLICY IF EXISTS "Authenticated users can insert cct_evento_normalizado" ON public.cct_evento_normalizado;
CREATE POLICY "Privileged users can insert cct_evento_normalizado" ON public.cct_evento_normalizado
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'OPERACAO'::app_role) OR has_role(auth.uid(), 'GESTOR_OPERACAO'::app_role));

DROP POLICY IF EXISTS "Authenticated users can insert cct_excecao_operacional" ON public.cct_excecao_operacional;
DROP POLICY IF EXISTS "Authenticated users can update cct_excecao_operacional" ON public.cct_excecao_operacional;
CREATE POLICY "Privileged users can insert cct_excecao_operacional" ON public.cct_excecao_operacional
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'OPERACAO'::app_role) OR has_role(auth.uid(), 'GESTOR_OPERACAO'::app_role));
CREATE POLICY "Privileged users can update cct_excecao_operacional" ON public.cct_excecao_operacional
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'OPERACAO'::app_role) OR has_role(auth.uid(), 'GESTOR_OPERACAO'::app_role));

-- Storage buckets: require auth on writes
DROP POLICY IF EXISTS "Allow public delete from voucher-anexos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to voucher-anexos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to chb-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete hawb documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete maritime files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update maritime files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload hawb documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload maritime files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete chb documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chb documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload voucher files" ON storage.objects;

CREATE POLICY "Authenticated upload voucher-anexos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voucher-anexos');
CREATE POLICY "Authenticated update voucher-anexos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'voucher-anexos');
CREATE POLICY "Authenticated delete voucher-anexos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'voucher-anexos');

CREATE POLICY "Authenticated upload chb-documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chb-documents');
CREATE POLICY "Authenticated update chb-documents" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'chb-documents');
CREATE POLICY "Authenticated delete chb-documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'chb-documents');

CREATE POLICY "Authenticated upload hawb-documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'hawb-documents');
CREATE POLICY "Authenticated update hawb-documents" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'hawb-documents');
CREATE POLICY "Authenticated delete hawb-documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'hawb-documents');

CREATE POLICY "Authenticated upload maritime-files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'maritime-files');
CREATE POLICY "Authenticated update maritime-files" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'maritime-files');
CREATE POLICY "Authenticated delete maritime-files" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'maritime-files');
