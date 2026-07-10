import { apiGet, apiPost, apiPatch, apiDelete, apiUrl } from "@/services/apiClient";

interface ExtractedFile {
  name: string;
  url: string;
  classification: 'hbl' | 'invoice' | 'other';
  size: number;
}

interface ExtractAttachmentsResponse {
  success: boolean;
  extracted: ExtractedFile[];
  source: string;
}

// Marítimo API Client - Uses dedicated SEA Edge Functions
export interface MaritimoItem {
  id: string;
  base_file_name: string;
  base_file_url?: string;
  consignee: string | null;
  container: string | null;
  status: string;
  analysis_type: 'manifest_hbl' | 'hbl_mbl' | 'invoices_hbl';
  created_at: string;
  updated_at: string;
  hbl_count?: number;
  invoice_count?: number;
  other_count?: number;
  base_count?: number;
  mbl_count?: number;
  total_files?: number;
}

export interface UploadBaseFileParams {
  file: File;
  analysisType: 'manifest_hbl' | 'hbl_mbl';
}

export interface SubmitAnalysisParams {
  itemId?: string;
  analysisType: 'manifest_hbl' | 'hbl_mbl' | 'invoices_hbl';
  files: File[];
  fileUrls?: Array<{ name: string; url: string; type: string; size?: number }>;
  linkData?: {
    hblFileName?: string;
    invoiceFileNames?: string[];
  };
}

export interface AnalysisStatus {
  id: string;
  status: string;
  progress_step?: string;
  progress_message?: string;
  progress_percent?: number;
  result_text?: string;
  result_data?: any;
  error_message?: string;
}

export interface HistoryFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  source: string;
  created_at: string;
}

export interface HistoryRun {
  id: string;
  item_id: string;
  status: string;
  result_text: string;
  result_html?: string;
  json_result: any;
  created_at: string;
  updated_at: string;
  created_by?: string;
  files: HistoryFile[];
}

export interface HistoryItem {
  id: string;
  base_file_name: string;
  consignee: string | null;
  container: string | null;
  status: string;
  analysis_type: string;
  created_at: string;
  updated_at: string;
}

export interface HistoryResponse {
  success: boolean;
  item: HistoryItem;
  runs: HistoryRun[];
}

export const maritimoApi = {
  /**
   * Get all maritime items with optional filtering by analysis type
   */
  async getItems(params: { analysisType?: string; status?: string; search?: string } = {}): Promise<MaritimoItem[]> {
    try {
      const qs = new URLSearchParams();
      if (params.analysisType) qs.set('analysisType', params.analysisType);
      if (params.status)       qs.set('status', params.status);
      if (params.search)       qs.set('search', params.search);
      const data = await apiGet(`/api/sea/maritimo/items?${qs.toString()}`);
      return data?.items || [];
    } catch (error) {
      console.error('Error fetching items:', error);
      return [];
    }
  },

  /**
   * Get a single maritime item by ID
   */
  async getItem(itemId: string): Promise<MaritimoItem> {
    const data = await apiGet(`/api/sea/maritimo/items/${encodeURIComponent(itemId)}`);
    if (!data?.item) throw new Error('Item not found');
    return data.item;
  },

  /**
   * Get history for a specific item
   */
  async getHistory(itemId: string): Promise<HistoryResponse> {
    const data = await apiGet(`/api/sea/maritimo/items/${encodeURIComponent(itemId)}/history`);
    return {
      success: true,
      item: data?.item || {},
      runs: data?.runs || []
    };
  },

  /**
   * Poll analysis status from backend
   */
  async pollAnalysis(analysisId: string): Promise<AnalysisStatus> {
    const response = await fetch(apiUrl(`/api/sea/maritimo/analysis/${encodeURIComponent(analysisId)}`));
    
    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch (_) {}
      
      const errorObj: any = new Error(errorData.message || errorData.error || `HTTP error ${response.status}`);
      errorObj.status = response.status;
      errorObj.code = errorData.code;
      errorObj.requestId = errorData.requestId;
      throw errorObj;
    }
    
    const data = await response.json();
    const analysis = data?.analysis || {};
    
    return {
      id: analysisId,
      status: analysis.status || 'pending',
      progress_percent: analysis.progress_percent,
      progress_step: analysis.progress_step,
      progress_message: analysis.progress_message,
      result_text: analysis.result_text,
      result_data: analysis.result_data,
      error_message: analysis.error_message
    };
  },

  /**
   * Delete an item via edge function
   */
  async deleteItem(itemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiDelete(`/api/sea/maritimo/items/${encodeURIComponent(itemId)}`);
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting item:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Complete or keep pending an analysis
   */
  async completeAnalysis(analysisId: string, itemId: string, shouldComplete: boolean): Promise<void> {
    await apiPost('/api/sea/maritimo/complete-analysis', {
      analysisId,
      itemId,
      completed: shouldComplete,
    });
  },

  /**
   * Upload base file (manifest or HBL) - uses dedicated edge function
   */
  async uploadBaseFile({ file, analysisType }: UploadBaseFileParams): Promise<{ success: boolean; itemId?: string; item?: MaritimoItem; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('analysisType', analysisType || 'manifest_hbl');

      const response = await fetch(apiUrl('/api/sea/upload-base-file'), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      return { success: true, itemId: data?.itemId || data?.item?.id, item: data?.item };
    } catch (error: any) {
      console.error('Upload error:', error);
      return { success: false, error: error.message || 'Erro ao fazer upload' };
    }
  },

  /**
   * Submit analysis to backend with base64 files
   */
  async submitAnalysis(params: SubmitAnalysisParams): Promise<{ 
    analysisId: string; 
    status?: string;
    result_text?: string;
    result_data?: any;
    error?: string;
  }> {
    const encodedFiles = await Promise.all((params.files || []).map(async (file) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      content: await fileToBase64(file),
    })));

    const response = await fetch(apiUrl('/api/sea/maritimo/submit-analysis'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: params.itemId,
        analysisType: params.analysisType,
        files: encodedFiles,
        fileUrls: params.fileUrls || [],
        linkData: params.linkData || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (errorData.error) {
        throw new Error(errorData.error);
      }
      
      if (response.status === 413) {
        throw new Error('Arquivos muito grandes. Reduza o tamanho total dos arquivos.');
      } else if (response.status === 504 || response.status === 502) {
        throw new Error('Tempo limite excedido. Tente novamente com menos arquivos.');
      } else if (response.status >= 500) {
        throw new Error('Erro no servidor. Tente novamente em alguns instantes.');
      }
      
      throw new Error('Erro ao conectar com o servidor');
    }

    const data = await response.json();
    
    return {
      analysisId: data?.analysisId || '',
      status: data?.status,
      result_text: data?.result_text,
      result_data: data?.result_data,
      error: data?.error
    };
  },

  /**
   * Poll analysis status with extended timeout and retry logic
   */
  async pollAnalysisUntilComplete(
    analysisId: string, 
    onProgress?: (percent: number, step: string) => void,
    timeoutMs: number = 20 * 60 * 1000 // 20 minutes
  ): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 4000; // 4 seconds between polls
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    let lastProgress = 15;
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.pollAnalysis(analysisId);
        consecutiveErrors = 0; // Reset error counter on success
        
        // Use real progress from backend
        let progressPercent = status.progress_percent || 10;
        let progressStep = status.progress_message || 'Processando...';
        
        // Only use time-based fallback if backend sends generic status
        if (!status.progress_message || status.progress_message === 'Processando...') {
          const elapsed = Date.now() - startTime;
          const progressRatio = Math.min(elapsed / (timeoutMs * 0.8), 1);
          progressPercent = Math.min(10 + Math.floor(progressRatio * 75), 85);
          progressStep = 'Processando com IA...';
        }

        if (status.status === 'realizado' || status.status === 'completed') {
          progressPercent = 100;
          progressStep = 'Concluído!';
        }
        
        lastProgress = progressPercent;
        
        if (onProgress) {
          onProgress(progressPercent, progressStep);
        }

        // Check for completed states (MariaDB uses 'realizado', 'erro')
        if (status.status === 'realizado' || status.status === 'completed') {
          return {
            success: true,
            result_text: status.result_text,
            result_data: status.result_data,
            status: 'completed',
            analysisId
          };
        }

        if (status.status === 'erro' || status.status === 'error') {
          throw new Error(status.error_message || 'Erro na análise');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (pollError: any) {
        const httpStatus = pollError.status;
        
        // Parar polling imediatamente para erros do cliente ou não autorizado
        if (httpStatus === 404) {
          throw new Error(`Análise não encontrada (ID: ${analysisId}). Verifique se a solicitação existe.`);
        }
        if (httpStatus === 401 || httpStatus === 403) {
          throw new Error(`Sem autorização para consultar a análise (ID: ${analysisId}). Por favor, faça login novamente.`);
        }
        
        consecutiveErrors++;
        console.warn(`Poll attempt failed (${consecutiveErrors}/${maxConsecutiveErrors}):`, pollError.message);
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          const reqIdSuffix = pollError.requestId ? ` Código de rastreamento: ${pollError.requestId}.` : '';
          throw new Error(`Não foi possível consultar a análise ${analysisId} devido a erros internos consecutivos no servidor.${reqIdSuffix}`);
        }
        
        // Backoff exponencial no atraso entre as tentativas
        const delay = pollInterval * Math.min(consecutiveErrors, 4);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error(`Analysis timeout after ${timeoutMs/1000/60} minutes.`);
    throw new Error(`Tempo limite excedido (${Math.round(timeoutMs/1000/60)} min). A análise pode ainda estar processando — verifique o histórico em alguns minutos.`);
  },

  /**
   * Extract attachments from EML or ZIP files - uses dedicated edge function
   */
  async extractAttachments(formData: FormData): Promise<ExtractAttachmentsResponse> {
    try {
      const file = formData.get('file') as File | null;
      if (!file) return { success: false, extracted: [], source: '' };

      const base64 = await fileToBase64(file);
      const response = await fetch(apiUrl('/api/sea/extract-attachments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: file.name, file_base64: base64 }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      return data || { success: false, extracted: [], source: '' };
    } catch (error) {
      console.error('Error extracting attachments:', error);
      return { success: false, extracted: [], source: '' };
    }
  },

  /**
   * Re-extract metadata (consignee, container) for items with missing data
   */
  async reextractMetadata(options: { forceAll?: boolean; itemId?: string }): Promise<{ processed: number; updated?: number }> {
    try {
      const data = await apiPost('/api/sea/maritimo/reextract-metadata', options);
      return { processed: data?.processed || 0, updated: data?.updated || 0 };
    } catch (error) {
      console.error('Error reextracting metadata:', error);
      return { processed: 0 };
    }
  },

  /**
   * Get system logs (admin only)
   */
  async getSystemLogs(params: { functionName?: string; logType?: string; limit?: number } = {}): Promise<any> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    const data = await apiGet(`/api/sea/maritimo/system-logs?${qs.toString()}`);
    return { logs: data?.logs || [] };
  },

  /**
   * Migrate data to MariaDB (admin only)
   */
  async migrateToMariaDB(): Promise<any> {
    // Already using MariaDB, no migration needed
    return { success: true, message: 'Já está usando MariaDB' };
  },

  // ==================== APPROVED EXAMPLES (LEARNING) ====================

  /**
   * Save an analysis as an approved example for AI learning
   */
  async saveApprovedExample(params: {
    runId: number;
    itemId: number;
    analysisType: string;
    consignee?: string;
    scenarioType: string;
    hblCount: number;
    inputSummary?: string;
    resultText: string;
    approvedBy?: number;
    approvedByName?: string;
  }): Promise<{ success: boolean; action?: string; id?: number; error?: string }> {
    try {
      const data = await apiPost('/api/sea/maritimo/approved-examples', {
        runId: params.runId,
        itemId: params.itemId,
        analysisType: params.analysisType,
        consignee: params.consignee,
        scenarioType: params.scenarioType,
        hblCount: params.hblCount,
        inputSummary: params.inputSummary,
        resultText: params.resultText,
        approvedBy: params.approvedBy,
        approvedByName: params.approvedByName,
      });
      return { success: true, action: data?.action, id: data?.id };
    } catch (error: any) {
      console.error('Error saving approved example:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get approved examples for a specific analysis type
   */
  async getApprovedExamples(params: {
    analysisType: string;
    hblCount?: number;
    limit?: number;
  }): Promise<{ success: boolean; examples: any[]; error?: string }> {
    try {
      const qs = new URLSearchParams();
      qs.set('analysisType', params.analysisType);
      qs.set('hblCount', String(params.hblCount || 1));
      qs.set('limit', String(params.limit || 3));
      const data = await apiGet(`/api/sea/maritimo/approved-examples?${qs.toString()}`);
      return { success: true, examples: data?.examples || [] };
    } catch (error: any) {
      console.error('Error getting approved examples:', error);
      return { success: false, examples: [], error: error.message };
    }
  },

  /**
   * List all approved examples with optional filtering
   */
  async listApprovedExamples(params: {
    analysisType?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ success: boolean; examples: any[]; total: number; error?: string }> {
    try {
      const qs = new URLSearchParams();
      if (params.analysisType !== undefined) qs.set('analysisType', params.analysisType);
      if (params.isActive !== undefined)     qs.set('isActive', String(params.isActive));
      qs.set('limit',  String(params.limit  || 20));
      qs.set('offset', String(params.offset || 0));
      const data = await apiGet(`/api/sea/maritimo/approved-examples/list?${qs.toString()}`);
      return { success: true, examples: data?.examples || [], total: data?.total || 0 };
    } catch (error: any) {
      console.error('Error listing approved examples:', error);
      return { success: false, examples: [], total: 0, error: error.message };
    }
  },

  /**
   * Toggle an approved example active/inactive
   */
  async toggleExampleActive(exampleId: number, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      await apiPatch(`/api/sea/maritimo/approved-examples/${exampleId}/toggle`, { isActive });
      return { success: true };
    } catch (error: any) {
      console.error('Error toggling example:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete an approved example
   */
  async deleteApprovedExample(exampleId: number): Promise<{ success: boolean; error?: string }> {
    try {
      await apiDelete(`/api/sea/maritimo/approved-examples/${exampleId}`);
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting example:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Export SEA analysis report with MBL, Carrier, Cliente, ATA columns
   */
  async exportReport(params: { 
    analysisType?: string; 
    dateFrom?: string; 
    dateTo?: string;
    status?: string;
  } = {}): Promise<{ 
    success: boolean; 
    items?: Array<{
      id: string;
      arquivo: string;
      mbl_number: string;
      armador: string;
      cliente: string;
      data_atracacao: string;
      container: string;
      tipo_analise: string;
      status: string;
      data_criacao: string;
    }>; 
    error?: string 
  }> {
    try {
      const qs = new URLSearchParams();
      if (params.analysisType) qs.set('analysisType', params.analysisType);
      if (params.dateFrom)     qs.set('dateFrom', params.dateFrom);
      if (params.dateTo)       qs.set('dateTo', params.dateTo);
      if (params.status)       qs.set('status', params.status);
      const data = await apiGet(`/api/sea/maritimo/export-report?${qs.toString()}`);
      return { success: true, items: data?.items || [] };
    } catch (error: any) {
      console.error('Error exporting SEA report:', error);
      return { success: false, error: error.message };
    }
  }
};

// Helper to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
