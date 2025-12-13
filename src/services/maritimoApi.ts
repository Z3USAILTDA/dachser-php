import { supabase } from "@/integrations/supabase/client";

interface UploadBaseFileParams {
  file: File;
  analysisType: 'manifest_hbl' | 'hbl_mbl' | 'invoices_hbl';
}

interface UploadBaseFileResult {
  success: boolean;
  itemId?: string;
  error?: string;
}

interface SubmitAnalysisParams {
  itemId?: string;
  analysisType: 'manifest_hbl' | 'hbl_mbl' | 'invoices_hbl';
  files?: File[];
  fileUrls?: { url: string; filename: string; mimeType?: string }[];
  links?: any;
}

interface SubmitAnalysisResult {
  analysisId: string;
  status?: string;
  result_text?: string;
  result_data?: any;
  error?: string;
}

// Helper to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const maritimoApi = {
  async reextractMetadata(options: { forceAll: boolean }) {
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
  },

  async uploadBaseFile(params: UploadBaseFileParams): Promise<UploadBaseFileResult> {
    try {
      const { file, analysisType } = params;
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

  async getItems(params: { analysisType: string; status?: string; search?: string }) {
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

  async getItem(itemId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_maritimo_item', itemId }
      });
      if (error) throw error;
      return data?.item || {};
    } catch (error) {
      console.error('Error fetching item:', error);
      return {};
    }
  },

  async getHistory(itemId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_maritimo_history', itemId }
      });
      if (error) throw error;
      return data || { runs: [], item: {} };
    } catch (error) {
      console.error('Error fetching history:', error);
      return { runs: [], item: {} };
    }
  },

  async extractAttachments(formData: FormData) {
    try {
      // Convert FormData to a format we can send
      const file = formData.get('file') as File;
      if (!file) {
        return { success: false, extracted: [] };
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
      return data || { success: false, extracted: [] };
    } catch (error) {
      console.error('Error extracting attachments:', error);
      return { success: false, extracted: [] };
    }
  },

  async submitAnalysis(params: SubmitAnalysisParams): Promise<SubmitAnalysisResult> {
    try {
      const { itemId, analysisType, files, fileUrls, links } = params;
      
      // Convert files to base64
      const processedFiles = [];
      if (files && files.length > 0) {
        for (const file of files) {
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
          itemId,
          analysisType,
          files: processedFiles,
          fileUrls,
          links
        }
      });

      if (error) throw error;
      
      return {
        analysisId: data?.analysisId || '',
        status: data?.status,
        result_text: data?.result_text,
        result_data: data?.result_data,
        error: data?.error
      };
    } catch (error: any) {
      console.error('Error submitting analysis:', error);
      throw error;
    }
  },

  async pollAnalysisUntilComplete(
    analysisId: string,
    onProgress: (percent: number, step: string) => void,
    timeout: number = 300000
  ) {
    // For now, since analysis is synchronous, this is just a fallback
    // In a real implementation, this would poll for status
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_maritimo_analysis_status', analysisId }
      });
      
      if (error) throw error;
      
      const status = data?.status || 'pending';
      const progress = data?.progress || 0;
      onProgress(progress, data?.step || 'Processando...');
      
      if (status === 'completed' || status === 'error') {
        return data;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('Analysis timeout');
  },

  async completeAnalysis(analysisId: string, itemId: string, completed: boolean) {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'complete_maritimo_analysis', analysisId, itemId, completed }
      });
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error completing analysis:', error);
      throw error;
    }
  },

  async deleteItem(itemId: string) {
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
  }
};
