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

// Marítimo API Client - Uses Supabase Edge Functions via mariadb-proxy
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
  itemId: string;
  analysisType: 'manifest_hbl' | 'hbl_mbl' | 'invoices_hbl';
  files: File[];
  fileUrls?: Array<{ name: string; url: string; type: string }>;
  linkData?: {
    hbl_id: string;
    invoice_files: string[];
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

export const maritimoApi = {
  /**
   * Get all maritime items with optional filtering by analysis type
   */
  async getItems(params: { analysisType?: string; status?: string; search?: string } = {}): Promise<MaritimoItem[]> {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_maritimo_items', ...params }
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
   * Poll analysis status
   */
  async pollAnalysis(analysisId: string): Promise<AnalysisStatus> {
    const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
      body: { action: 'get_maritimo_analysis_status', analysisId }
    });
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete an item (soft delete)
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
      body: { action: 'complete_maritimo_analysis', analysisId, itemId, completed: shouldComplete }
    });
    
    if (error) throw error;
  },

  /**
   * Upload base file (manifest or HBL)
   */
  async uploadBaseFile({ file, analysisType }: UploadBaseFileParams): Promise<{ success: boolean; itemId?: string; error?: string }> {
    try {
      const base64Content = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'upload_maritimo_base_file',
          fileName: file.name,
          fileContent: base64Content,
          fileType: file.type,
          analysisType
        }
      });

      if (error) throw error;
      return { success: true, itemId: data?.itemId };
    } catch (error: any) {
      console.error('Upload error:', error);
      return { success: false, error: error.message || 'Erro ao fazer upload' };
    }
  },

  /**
   * Submit analysis - returns direct result (synchronous) or analysisId for polling
   */
  async submitAnalysis(params: SubmitAnalysisParams): Promise<{ 
    analysisId: string; 
    status?: string;
    result_text?: string;
    result_data?: any;
    error?: string;
  }> {
    // Convert files to base64
    const processedFiles = [];
    if (params.files && params.files.length > 0) {
      for (const file of params.files) {
        const base64Content = await fileToBase64(file);
        processedFiles.push({
          filename: file.name,
          content: base64Content,
          mimeType: file.type
        });
      }
    }

    // Call the maritimo-analyze edge function
    const { data, error } = await supabase.functions.invoke('maritimo-analyze', {
      body: {
        itemId: params.itemId,
        analysisType: params.analysisType,
        files: processedFiles,
        fileUrls: params.fileUrls,
        links: params.linkData
      }
    });

    if (error) {
      console.error('Edge Function Error Details:', error);
      
      if ((error as any).status === 413) {
        throw new Error('Arquivos muito grandes. Reduza o tamanho total dos arquivos.');
      } else if ((error as any).status === 504 || (error as any).status === 502) {
        throw new Error('Tempo limite excedido. Tente novamente com menos arquivos.');
      } else if ((error as any).status >= 500) {
        throw new Error('Erro no servidor. Tente novamente em alguns instantes.');
      }
      
      throw new Error(error.message || 'Erro ao conectar com o servidor');
    }
    
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
    jobId: string, 
    onProgress?: (percent: number, step: string) => void,
    timeoutMs: number = 1200000
  ): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000;
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.pollAnalysis(jobId);
      
      if (onProgress && status.progress_percent !== undefined) {
        onProgress(status.progress_percent, status.progress_step || status.status);
      }

      if (status.status === 'comparing' || status.status === 'completed') {
        return {
          success: true,
          result_text: status.result_text,
          result_data: status.result_data,
          status: status.status,
          analysisId: jobId
        };
      }

      if (status.status === 'error') {
        throw new Error(status.error_message || 'Analysis failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    console.error(`Analysis timeout after ${timeoutMs/1000/60} minutes.`);
    throw new Error(`Analysis timeout after ${timeoutMs/1000/60} minutes`);
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
  async reextractMetadata(options: { forceAll?: boolean }): Promise<{ processed: number }> {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'reextract_maritimo_metadata', ...options }
      });
      if (error) throw error;
      return { processed: data?.processed || 0 };
    } catch (error) {
      console.error('Error reextracting metadata:', error);
      return { processed: 0 };
    }
  }
};
