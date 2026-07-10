import { apiGet, apiPost, apiPatch, apiDelete, apiUrl } from "./apiClient";

export async function fetchChecks() {
  return apiGet("/api/air/check-awb");
}

export async function deleteCheck(id: number, performedBy?: string) {
  return apiDelete(`/api/air/check-awb/${id}`, { performed_by: performedBy });
}

export async function uploadDocument(file: File, uploadedBy?: number): Promise<{ success: boolean; documentId?: number; error?: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (uploadedBy != null) formData.append("uploadedBy", String(uploadedBy));
  const res = await fetch(apiUrl("/api/air/check-awb/upload"), { method: "POST", body: formData });
  return res.json();
}

export async function parseDocument(
  file: File,
  documentType: "house_awb" | "instruction" = "house_awb"
): Promise<any> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("documentType", documentType);
  const res = await fetch(apiUrl("/api/air/check-awb/parse"), { method: "POST", body: formData });
  return res.json();
}

export async function parseDocumentById(documentId: number): Promise<any> {
  const res = await fetch(apiUrl(`/api/air/check-awb/document/${documentId}`));
  if (!res.ok) throw new Error("Documento não encontrado");
  const blob = await res.blob();
  const file = new File([blob], "document.pdf", { type: blob.type || "application/pdf" });
  const formData = new FormData();
  formData.append("file", file);
  formData.append("documentType", "house_awb");
  const parseRes = await fetch(apiUrl("/api/air/check-awb/parse"), { method: "POST", body: formData });
  return parseRes.json();
}

export async function createCheck(payload: Record<string, unknown>) {
  return apiPost("/api/air/check-awb", payload);
}

export async function updateParsed(checkId: number, payload: Record<string, unknown>) {
  return apiPatch(`/api/air/check-awb/${checkId}/parsed`, payload);
}

export async function fetchMatrices() {
  return apiGet("/api/air/check-awb/matrices");
}

export async function fetchActiveMatrices() {
  return apiGet("/api/air/check-awb/matrices/active");
}

export async function fetchRules(matrixId: number, cnpj?: string) {
  const qs = cnpj ? `?matrixId=${matrixId}&cnpj=${cnpj}` : `?matrixId=${matrixId}`;
  return apiGet(`/api/air/check-awb/rules${qs}`);
}

export async function createRule(payload: Record<string, unknown>) {
  return apiPost("/api/air/check-awb/rules", payload);
}

export async function deleteRule(ruleId: number) {
  return apiDelete(`/api/air/check-awb/rules/${ruleId}`);
}

export async function importMatrix(file: File): Promise<{ success: boolean; message?: string; error?: string }> {
  const fileBase64 = await fileToBase64(file);
  return apiPost("/api/air/check-awb/matrices/import", { fileBase64, fileName: file.name });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
