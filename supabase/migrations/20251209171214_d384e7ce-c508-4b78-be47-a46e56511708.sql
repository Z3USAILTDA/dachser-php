
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('OPERACAO', 'FISCAL', 'SUPERVISOR', 'FINANCEIRO', 'GESTOR_OPERACAO', 'GESTOR_FISCAL', 'GESTOR_SUPERVISOR', 'GESTOR_FINANCEIRO', 'ADMIN');

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles" 
ON public.user_roles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" 
ON public.user_roles FOR ALL 
USING (public.has_role(auth.uid(), 'ADMIN'));

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    name TEXT,
    email TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" 
ON public.profiles FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all profiles" 
ON public.profiles FOR ALL 
USING (public.has_role(auth.uid(), 'ADMIN'));

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data ->> 'name', new.email));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create vouchers table
CREATE TABLE public.vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_spo TEXT NOT NULL,
    fornecedor TEXT,
    cnpj_fornecedor TEXT,
    valor DECIMAL(15,2),
    moeda TEXT DEFAULT 'BRL',
    vencimento DATE NOT NULL,
    data_emissao_documento DATE,
    tipo_documento TEXT,
    filial TEXT,
    cobranca_em_nome_de TEXT NOT NULL DEFAULT 'DACHSER',
    forma_pagamento TEXT NOT NULL DEFAULT 'BOLETO',
    remessa TEXT DEFAULT 'REMESSA_SIMPLES',
    etapa_atual TEXT NOT NULL DEFAULT 'OPERACAO',
    status_financeiro TEXT,
    status_baixa TEXT DEFAULT 'PENDENTE',
    status_envio_cliente TEXT,
    urgencia_tipo TEXT DEFAULT 'NORMAL',
    comentarios_operacao TEXT,
    comentarios_fiscal TEXT,
    comentarios_financeiro TEXT,
    ajuste_operacao TEXT,
    ajuste_fiscal TEXT,
    cliente_email TEXT,
    criado_por_user_id UUID REFERENCES auth.users(id),
    responsavel_operacao_user_id UUID REFERENCES auth.users(id),
    responsavel_fiscal_user_id UUID REFERENCES auth.users(id),
    responsavel_supervisor_user_id UUID REFERENCES auth.users(id),
    responsavel_financeiro_user_id UUID REFERENCES auth.users(id),
    aprovado_por_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vouchers" 
ON public.vouchers FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create vouchers" 
ON public.vouchers FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = criado_por_user_id);

CREATE POLICY "Authenticated users can update vouchers" 
ON public.vouchers FOR UPDATE 
TO authenticated
USING (true);

-- Create voucher_anexos table
CREATE TABLE public.voucher_anexos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id UUID REFERENCES public.vouchers(id) ON DELETE CASCADE NOT NULL,
    tipo TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.voucher_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view anexos" 
ON public.voucher_anexos FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create anexos" 
ON public.voucher_anexos FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = uploaded_by_user_id);

-- Create voucher_logs table
CREATE TABLE public.voucher_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id UUID REFERENCES public.vouchers(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    acao TEXT NOT NULL,
    detalhe TEXT,
    data_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.voucher_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view logs" 
ON public.voucher_logs FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create logs" 
ON public.voucher_logs FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for voucher attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('voucher-anexos', 'voucher-anexos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload voucher files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'voucher-anexos');

CREATE POLICY "Anyone can view voucher files"
ON storage.objects FOR SELECT
USING (bucket_id = 'voucher-anexos');

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_vouchers_updated_at
BEFORE UPDATE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
