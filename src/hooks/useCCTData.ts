import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { 
  ProcessoCCT, 
  CCTExcecao, 
  CCTRegraNotificacao, 
  CCTProfile, 
  CCTAeroporto, 
  CodigoIATA,
  StatusExcecao 
} from "@/types/cct";
import { toast } from "sonner";

// Mock data for development - will be replaced with real API calls
const mockProcessos: ProcessoCCT[] = [];
const mockExcecoes: CCTExcecao[] = [];
const mockRegras: CCTRegraNotificacao[] = [];
const mockProfiles: CCTProfile[] = [];
const mockAeroportos: CCTAeroporto[] = [
  { codigo: "GRU", nome: "Guarulhos", cidade: "São Paulo", pais: "Brasil" },
  { codigo: "FRA", nome: "Frankfurt", cidade: "Frankfurt", pais: "Alemanha" },
  { codigo: "VCP", nome: "Viracopos", cidade: "Campinas", pais: "Brasil" },
];
const mockCodigosIATA: CodigoIATA[] = [
  { codigo: "DGR", descricao: "Dangerous Goods", categoria: "Perigo" },
  { codigo: "PIL", descricao: "Perishable Items", categoria: "Perecível" },
  { codigo: "AVI", descricao: "Live Animals", categoria: "Animais" },
];

// Processos CCT
export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async () => {
      // TODO: Replace with real Supabase query
      // const { data, error } = await supabase
      //   .from("shipments")
      //   .select(`*, cct_status_atual(*), cct_evento_normalizado(*), cct_excecao_operacional(*)`)
      //   .order("created_at", { ascending: false });
      return mockProcessos;
    },
  });
}

export function useProcessoCCT(id: string) {
  return useQuery({
    queryKey: ["cct-processo", id],
    queryFn: async () => {
      // TODO: Replace with real Supabase query
      return mockProcessos.find(p => p.shipment.id === id) || null;
    },
    enabled: !!id,
  });
}

// Exceções
export function useExcecoes() {
  return useQuery({
    queryKey: ["cct-excecoes"],
    queryFn: async () => {
      // TODO: Replace with real Supabase query
      return mockExcecoes;
    },
  });
}

export function useExcecoesAnalytics() {
  return useQuery({
    queryKey: ["cct-excecoes-analytics"],
    queryFn: async () => {
      // TODO: Replace with real Supabase query
      return mockExcecoes;
    },
  });
}

export function useUpdateExcecao() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; status_excecao?: StatusExcecao }) => {
      // TODO: Replace with real Supabase update
      toast.success("Exceção atualizada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-excecoes"] });
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Regras de Notificação
export function useRegrasNotificacao() {
  return useQuery({
    queryKey: ["cct-regras"],
    queryFn: async () => {
      // TODO: Replace with real Supabase query
      return mockRegras;
    },
  });
}

export function useCreateRegra() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Omit<CCTRegraNotificacao, "id" | "created_at" | "updated_at">) => {
      // TODO: Replace with real Supabase insert
      toast.success("Regra criada com sucesso");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-regras"] });
    },
  });
}

export function useUpdateRegra() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      // TODO: Replace with real Supabase update
      toast.success("Regra atualizada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-regras"] });
    },
  });
}

export function useDeleteRegra() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // TODO: Replace with real Supabase delete
      toast.success("Regra excluída");
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-regras"] });
    },
  });
}

// Profiles
export function useProfiles() {
  return useQuery({
    queryKey: ["cct-profiles"],
    queryFn: async () => {
      // TODO: Replace with real Supabase query
      return mockProfiles;
    },
  });
}

// Aeroportos
export function useAeroportos() {
  return useQuery({
    queryKey: ["cct-aeroportos"],
    queryFn: async () => {
      return mockAeroportos;
    },
  });
}

// Códigos IATA
export function useCodigosIATA() {
  return useQuery({
    queryKey: ["cct-codigos-iata"],
    queryFn: async () => {
      return mockCodigosIATA;
    },
  });
}

// Registrar Peso
export function useRegistrarPeso() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      shipmentId: string;
      peso_declarado: number;
      peso_constatado: number;
      volume_declarado?: number;
      volume_constatado?: number;
    }) => {
      // TODO: Replace with real Supabase update
      toast.success("Peso registrado com sucesso");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Tratamentos IATA
export function useUpdateTratamentos() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; tratamentos: string[] }) => {
      // TODO: Replace with real Supabase update
      toast.success("Tratamentos atualizados");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}

// Decolagem
export function useUpdateDecolagem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { shipmentId: string; data_decolagem_ultimo_trecho: string }) => {
      // TODO: Replace with real Supabase update
      toast.success("Decolagem atualizada");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cct-processos"] });
    },
  });
}
