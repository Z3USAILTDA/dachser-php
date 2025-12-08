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
    // Placeholder - would call API
    return { processed: 0 };
  },

  async uploadBaseFile(params: UploadBaseFileParams): Promise<UploadBaseFileResult> {
    try {
      const { file, analysisType } = params;
      
      // Convert file to base64
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

      return {
        success: true,
        itemId: data?.itemId
      };
    } catch (error: any) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: error.message || 'Erro ao fazer upload'
      };
    }
  },

  async getItems(params: { analysisType: string; status?: string; search?: string }) {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'get_maritimo_items',
          ...params
        }
      });

      if (error) throw error;
      return data?.items || [];
    } catch (error) {
      console.error('Error fetching items:', error);
      return [];
    }
  },

  async deleteItem(itemId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'delete_maritimo_item',
          itemId
        }
      });

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting item:', error);
      return { success: false, error: error.message };
    }
  }
};
