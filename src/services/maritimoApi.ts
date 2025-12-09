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

export const maritimoApi = {
  async reextractMetadata(options: { forceAll: boolean }) {
    return { processed: 0 };
  },

  async uploadBaseFile(params: UploadBaseFileParams): Promise<UploadBaseFileResult> {
    try {
      const { file, analysisType } = params;
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const { data, error } = await supabase.functions.invoke('maritimo-upload', {
        body: {
          action: 'upload_base_file',
          fileName: file.name,
          fileContent: base64,
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
      return data || { runs: [] };
    } catch (error) {
      console.error('Error fetching history:', error);
      return { runs: [] };
    }
  },

  async extractAttachments(formData: FormData) {
    try {
      const { data, error } = await supabase.functions.invoke('maritimo-extract', {
        body: formData
      });
      if (error) throw error;
      return data || { success: false, extracted: [] };
    } catch (error) {
      console.error('Error extracting attachments:', error);
      return { success: false, extracted: [] };
    }
  },

  async submitAnalysis(params: any) {
    try {
      const { data, error } = await supabase.functions.invoke('maritimo-analyze', {
        body: params
      });
      if (error) throw error;
      return { analysisId: data?.analysisId || '' };
    } catch (error: any) {
      console.error('Error submitting analysis:', error);
      throw error;
    }
  },

  async pollAnalysisUntilComplete(
    analysisId: string,
    onProgress: (percent: number, step: string) => void,
    timeout: number = 1200000
  ) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const { data, error } = await supabase.functions.invoke('maritimo-status', {
        body: { analysisId }
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
