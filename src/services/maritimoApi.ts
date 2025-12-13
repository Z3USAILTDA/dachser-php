import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { 
          action: 'get_maritimo_items',
          analysisType: params.analysisType,
          status: params.status,
          search: params.search
        }
      });
      if (error) throw error;
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
    const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
      body: { action: 'get_maritimo_item', itemId }
    });
    
    if (error) throw error;
    if (!data?.item) throw new Error('Item not found');
    return data.item;
  },

  /**
   * Get history for a specific item
   */
  async getHistory(itemId: string): Promise<HistoryResponse> {
    const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
      body: { action: 'get_maritimo_history', itemId }
    });
    
    if (error) throw error;
    return {
      success: true,
      item: data?.item || {},
      runs: data?.runs || []
    };
  },

  /**
   * Poll analysis status - uses dedicated edge function
   */
  async pollAnalysis(analysisId: string): Promise<AnalysisStatus> {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sea-poll-analysis`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: analysisId })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
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
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'delete_maritimo_item', itemId }
      });
      
      if (error) throw error;
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
    const { error } = await supabase.functions.invoke('mariadb-proxy', {
      body: { 
        action: 'complete_maritimo_analysis', 
        analysisId, 
        itemId, 
        completed: shouldComplete 
      }
    });
    
    if (error) throw error;
  },

  /**
   * Upload base file (manifest or HBL) - uses dedicated edge function
   */
  async uploadBaseFile({ file, analysisType }: UploadBaseFileParams): Promise<{ success: boolean; itemId?: string; item?: MaritimoItem; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('analysisType', analysisType);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sea-upload-base-file`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      return { success: true, itemId: data?.item?.id, item: data?.item };
    } catch (error: any) {
      console.error('Upload error:', error);
      return { success: false, error: error.message || 'Erro ao fazer upload' };
    }
  },

  /**
   * Submit analysis - uses dedicated edge function with FormData
   */
  async submitAnalysis(params: SubmitAnalysisParams): Promise<{ 
    analysisId: string; 
    status?: string;
    result_text?: string;
    result_data?: any;
    error?: string;
  }> {
    const formData = new FormData();
    
    if (params.itemId) {
      formData.append('itemId', params.itemId);
    }
    formData.append('analysisType', params.analysisType);
    
    // Add files
    if (params.files && params.files.length > 0) {
      for (const file of params.files) {
        formData.append('files', file);
      }
    }
    
    // Add fileUrls (pre-uploaded files)
    if (params.fileUrls && params.fileUrls.length > 0) {
      formData.append('fileUrls', JSON.stringify(params.fileUrls));
    }
    
    // Add link data for invoices_hbl
    if (params.linkData) {
      formData.append('linkData', JSON.stringify(params.linkData));
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sea-submit-analysis`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 413) {
        throw new Error('Arquivos muito grandes. Reduza o tamanho total dos arquivos.');
      } else if (response.status === 504 || response.status === 502) {
        throw new Error('Tempo limite excedido. Tente novamente com menos arquivos.');
      } else if (response.status >= 500) {
        throw new Error('Erro no servidor. Tente novamente em alguns instantes.');
      }
      
      throw new Error(errorData.error || 'Erro ao conectar com o servidor');
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
   * Poll analysis status with timeout
   */
  async pollAnalysisUntilComplete(
    analysisId: string, 
    onProgress?: (percent: number, step: string) => void,
    timeoutMs: number = 8 * 60 * 1000 // 8 minutes
  ): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 3000;
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.pollAnalysis(analysisId);
      
      // Map step to progress
      let progressPercent = 50;
      let progressStep = 'Analisando documentos...';
      
      if (status.status === 'pendente' || status.status === 'queued') {
        progressPercent = 15;
        progressStep = 'Aguardando processamento...';
      } else if (status.status === 'analisando' || status.status === 'processing') {
        progressPercent = 50;
        progressStep = 'Analisando com IA...';
      } else if (status.status === 'realizado' || status.status === 'completed') {
        progressPercent = 100;
        progressStep = 'Concluído';
      }
      
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
    }
    
    console.error(`Analysis timeout after ${timeoutMs/1000/60} minutes.`);
    throw new Error(`Tempo limite excedido (${Math.round(timeoutMs/1000/60)} minutos)`);
  },

  /**
   * Extract attachments from EML or ZIP files
   */
  async extractAttachments(formData: FormData): Promise<ExtractAttachmentsResponse> {
    try {
      const file = formData.get('file') as File;
      if (!file) {
        return { success: false, extracted: [], source: '' };
      }

      // Use mariadb-proxy for now since extract_maritimo_attachments action exists there
      const base64Content = await fileToBase64(file);
      
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'extract_maritimo_attachments',
          fileName: file.name,
          fileContent: base64Content,
          fileType: file.type
        }
      });
      
      if (error) throw error;
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
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'reextract_maritimo_metadata', ...options }
      });
      if (error) throw error;
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
    const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
      body: { 
        action: 'raw_query',
        query: `SELECT * FROM ai_agente.t_dachser_sea_runs ORDER BY created_at DESC LIMIT ${params.limit || 100}`
      }
    });
    
    if (error) throw error;
    return { logs: data?.data || [] };
  },

  /**
   * Migrate data to MariaDB (admin only)
   */
  async migrateToMariaDB(): Promise<any> {
    // Already using MariaDB, no migration needed
    return { success: true, message: 'Já está usando MariaDB' };
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
