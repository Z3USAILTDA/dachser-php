import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileText, HelpCircle } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageCard } from "@/components/layout/PageCard";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/maritimo/UploadZone";
import { FileItem } from "@/components/maritimo/FileItem";
import { maritimoApi } from "@/services/maritimoApi";

export default function CadastroHbl() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'loading' | null, message: string }>({ type: null, message: '' });

  const handleFilesSelected = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setStatusMessage({ type: 'error', message: 'Arquivo inválido. Aceito apenas: PDF' });
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
        analysisType: 'hbl_mbl'
      });

      if (result.success) {
        setStatusMessage({ type: 'success', message: 'HBL cadastrado com sucesso!' });
        setTimeout(() => navigate("/sea/submeter-hbl-mbl", { state: { itemId: result.itemId } }), 800);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setStatusMessage({ type: 'error', message: 'Erro ao cadastrar: ' + (error.message || 'Erro desconhecido') });
    } finally {
      setIsUploading(false);
    }
  };

  const helpButton = (
    <button
      onClick={() => navigate("/sea/manual")}
      className="w-8 h-8 rounded-full border border-[rgba(255,255,255,.25)] flex items-center justify-center bg-[rgba(0,0,0,.7)] text-[#aaaaaa] hover:text-[#ffc800] hover:bg-[rgba(0,0,0,.9)] transition"
      title="Ajuda"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Cadastro – HBL"
      pageIcon={FileText}
      backTo="/maritimo"
      rightContent={helpButton}
    >
      <PageCard className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Cadastro – HBL</h1>
        <p className="text-sm text-neutral-400 mb-8">Envie o arquivo HBL base para comparação com MBL</p>

        <UploadZone
          onFilesSelected={handleFilesSelected}
          accept=".pdf"
          multiple={false}
          label="Arraste e solte ou clique para enviar"
          description="Aceito apenas: PDF"
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
