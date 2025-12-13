import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileSpreadsheet } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/maritimo/UploadZone";
import { FileItem } from "@/components/maritimo/FileItem";
import { maritimoApi } from "@/services/maritimoApi";

export default function CadastroManifest() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'loading' | null, message: string }>({ type: null, message: '' });

  const handleFilesSelected = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      const validTypes = ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel.sheet.macroEnabled.12", "application/pdf"];
      
      if (!validTypes.some(type => file.type === type) && !file.name.match(/\.(csv|xls|xlsx|xlsm|pdf)$/i)) {
        setStatusMessage({ type: 'error', message: 'Arquivo inválido. Aceitos: csv, xls, xlsx, xlsm, pdf' });
        return;
      }
      
      setStatusMessage({ type: null, message: '' });
      setSelectedFile(file);
    }
  };

  const handleCadastrar = async () => {
    if (!selectedFile) {
      setStatusMessage({ type: 'error', message: 'Selecione um arquivo' });
      return;
    }

    try {
      setIsUploading(true);
      setStatusMessage({ type: 'loading', message: 'Enviando arquivo...' });

      const result = await maritimoApi.uploadBaseFile({
        file: selectedFile,
        analysisType: 'manifest_hbl'
      });

      if (result.success) {
        setStatusMessage({ type: 'success', message: 'Manifest cadastrado com sucesso!' });
        setTimeout(() => navigate("/sea/submeter-manifest-hbl", { state: { itemId: result.itemId } }), 800);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setStatusMessage({ type: 'error', message: 'Erro ao cadastrar: ' + (error.message || 'Erro desconhecido') });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Cadastro – Manifest/Pack List"
      pageIcon={FileSpreadsheet}
      backTo="/maritimo"
    >
      <PageCard className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Cadastro – Manifest/Pack List</h1>
        <p className="text-sm text-neutral-400 mb-8">Envie o arquivo base para iniciar o processo de análise</p>

        <UploadZone
          onFilesSelected={handleFilesSelected}
          accept=".csv,.xls,.xlsx,.xlsm,.pdf"
          multiple={false}
          label="Arraste e solte ou clique para enviar"
          description="Aceitos: csv, xls, xlsx, xlsm, pdf"
        />

        {statusMessage.type && (
          <div className={`mt-4 p-4 rounded-lg border ${
            statusMessage.type === 'error' ? 'bg-rose-500/15 border-rose-500/40 text-rose-300' :
            statusMessage.type === 'success' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' :
            'bg-amber-500/15 border-amber-500/40 text-amber-300'
          }`}>
            {statusMessage.message}
          </div>
        )}

        {selectedFile && (
          <div className="mt-6">
            <h3 className="text-xs tracking-[0.22em] uppercase text-neutral-400 mb-3">Arquivo selecionado:</h3>
            <FileItem
              file={selectedFile}
              onRemove={() => setSelectedFile(null)}
            />
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <Button
            onClick={handleCadastrar}
            disabled={!selectedFile || isUploading}
            className="h-10 rounded-full px-6 bg-amber-400 text-black font-semibold text-sm shadow-[0_0_22px_rgba(251,191,36,0.6)] hover:bg-amber-300 disabled:opacity-50"
          >
            <Check className="w-4 h-4 mr-2" />
            {isUploading ? "Enviando..." : "Cadastrar"}
          </Button>
        </div>
      </PageCard>
    </PageLayout>
  );
}
