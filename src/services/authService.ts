// Camada de autenticação do frontend.
// Toda comunicação de auth passa por este arquivo — sem Supabase, sem credenciais expostas.
// Endpoints:
//   POST /api/auth/login
//   POST /api/auth/register
//   POST /api/auth/forgot-password
//   POST /api/auth/verify-reset-code
//   POST /api/auth/reset-password
//   POST /api/auth/change-password

import { apiPost } from "./apiClient";

export interface StoredUser {
  id: number;
  email: string;
  username: string;
  is_admin: number;
  must_change_password?: number;
  olimpo_only?: number;
  metrics_only?: number;
  esteira_role?: string | null;
  esteira_active?: number | null;
  supervisor_id?: number | null;
}

interface AuthResult {
  success: boolean;
  user?: StoredUser;
  error?: string;
}

export async function authLogin(username: string, password: string): Promise<AuthResult> {
  return apiPost("/api/auth/login", { username, password });
}

export async function authForgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
  return apiPost("/api/auth/forgot-password", { email });
}

export async function authVerifyResetCode(
  email: string,
  code: string
): Promise<{ success: boolean; user?: { id: number; username: string }; error?: string }> {
  return apiPost("/api/auth/verify-reset-code", { email, code });
}

export async function authResetPassword(
  email: string,
  password: string,
  username?: string
): Promise<{ success: boolean; error?: string }> {
  return apiPost("/api/auth/reset-password", { email, password, username });
}

export async function authChangePassword(
  userId: number,
  password: string
): Promise<{ success: boolean; error?: string }> {
  return apiPost("/api/auth/change-password", { userId, password });
}

export async function authRegister(
  username: string,
  email: string,
  password: string,
  esteiraRole?: string
): Promise<{ success: boolean; user?: { id: number; username: string; email: string }; error?: string }> {
  return apiPost("/api/auth/register", { username, email, password, esteira_role: esteiraRole });
}
