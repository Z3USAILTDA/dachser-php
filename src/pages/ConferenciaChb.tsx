import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileCheck, HelpCircle } from 'lucide-react';
import { useUsageLog } from "@/hooks/useUsageLog";
import { PageLayout } from '@/components/layout/PageLayout';
import { PageCard } from '@/components/layout/PageCard';
import { ChbStep, TabType, ChbAnalysisResult, ChbApprovedHistory, ChbDocument } from '@/types/chb';
import { initialSteps } from '@/data/chbMocks';
import { ChbStepper } from '@/components/chb/ChbStepper';
import { ChbTabs } from '@/components/chb/ChbTabs';
import { ChbDocumentsPanel } from '@/components/chb/ChbDocumentsPanel';
import { ChbAnalysisPanel } from '@/components/chb/ChbAnalysisPanel';
import { ChbHistoryPanel } from '@/components/chb/ChbHistoryPanel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useChbFiles, useChbRuns, useChbItems, ChbFile, ChbRun } from '@/hooks/useChbData';
import { useChbClientConfig, ChbClientConfig } from '@/hooks/useChbClientConfig';

export default function ConferenciaChb() {
  useUsageLog({ endpoint: "/chb/conferencia" });
  const navigate = useNavigate();
  const { id } = useParams();
  const itemId = id ? parseInt(id) : null;
  
  const { files: dbFiles, fetchFiles, createFile, deleteFile } = useChbFiles(itemId);
  const { runs: dbRuns, fetchRuns, createRun, updateRun } = useChbRuns(itemId);
  const { updateItem, updateItemClient } = useChbItems();
  const { getConfigByClient, configs: allClientConfigs, fetchConfigs: fetchClientConfigs } = useChbClientConfig();
  
  const [steps, setSteps] = useState<ChbStep[]>(initialSteps);
  const [activeStep, setActiveStep] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>('documentos');
  const [documents, setDocuments] = useState<Record<number, ChbDocument[]>>({
    1: [],
    2: [],
    3: [],
  });
  
  // Centralized state for files, analysis results, and history
  const [uploadedFiles, setUploadedFiles] = useState<Record<number, File[]>>({
    1: [],
    2: [],
    3: [],
  });
  const [analysisResults, setAnalysisResults] = useState<Record<number, ChbAnalysisResult | null>>({
    1: null,
    2: null,
    3: null,
  });
  const [approvedHistory, setApprovedHistory] = useState<Record<number, ChbApprovedHistory[]>>({
    1: [],
    2: [],
    3: [],
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [clientConfig, setClientConfig] = useState<ChbClientConfig | null>(null);
  const pollingRef = useRef<boolean>(false);

  const currentUser = localStorage.getItem('user_email') || localStorage.getItem('username') || 'Usuário';

  // Function to load files from MariaDB via proxy
  const loadMariaDBFiles = useCallback(async () => {
    if (!itemId) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'query',
          query: `SELECT d.id, d.doc_role, d.created_at, f.filename, f.file_url, f.file_size, d.etapa
                  FROM ai_agente.t_dachser_chb_docs d
                  JOIN ai_agente.t_dachser_chb_files f ON d.file_id = f.id
                  WHERE d.item_id = ?
                  ORDER BY d.created_at ASC`,
          params: [itemId],
        },
      });

      if (error) {
        console.error('Error loading CHB documents from MariaDB:', error);
        return;
      }

      const newDocs: Record<number, ChbDocument[]> = { 1: [], 2: [], 3: [] };
      (data?.rows || []).forEach((f: any) => {
        const stepId = parseInt(f.etapa) as 1 | 2 | 3;
        if (stepId >= 1 && stepId <= 3) {
          newDocs[stepId].push({
            id: f.id,
            name: f.filename,
            type: f.doc_role || 'O',
            uploadedAt: f.created_at ? new Date(f.created_at).toLocaleString('pt-BR') : '',
            size: f.file_size ? formatFileSize(f.file_size) : '',
            stepId,
            dbId: undefined,
            url: f.file_url || undefined,
          });
        }
      });
      setDocuments(newDocs);
    } catch (error) {
      console.error('Error loading CHB documents:', error);
    }
  }, [itemId]);

  // Load data from database
  useEffect(() => {
    if (itemId) {
      loadMariaDBFiles();
      fetchRuns();
    }
  }, [itemId, loadMariaDBFiles, fetchRuns]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false;
    };
  }, []);

  // Convert DB runs to approved history, restore step state, and populate analysis results
  useEffect(() => {
    const newHistory: Record<number, ChbApprovedHistory[]> = { 1: [], 2: [], 3: [] };
    const restoredAnalysis: Record<number, ChbAnalysisResult | null> = { 1: null, 2: null, 3: null };
    let maxApprovedStep = 0;
    
    // Separate approved and draft runs
    const approvedRuns = dbRuns.filter((r: ChbRun) => r.status === 'approved');
    const draftRuns = dbRuns.filter((r: ChbRun) => r.status === 'draft');
    
    // Sort approved runs by created_at to get the most recent per step
    const sortedApprovedRuns = [...approvedRuns]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    sortedApprovedRuns.forEach((r: ChbRun) => {
      const stepId = parseInt(r.etapa) as 1 | 2 | 3;
      if (stepId > maxApprovedStep) maxApprovedStep = stepId;
      
      newHistory[stepId].push({
        id: `run-${r.id}`,
        stepId,
        date: r.created_at,
        user: r.created_by_email || r.created_by_name || 'Usuário',
        summary: r.result_text || '',
        detailedSummary: r.result_html || r.result_text || '',
        tags: [],
      });
      
      // Restore analysis result for completed steps (use the most recent run)
      if (!restoredAnalysis[stepId] && r.result_html) {
        restoredAnalysis[stepId] = {
          id: `restored-${r.id}`,
          stepId,
          html: r.result_html,
          summary: r.result_text || '',
          generatedAt: new Date(r.created_at).toLocaleString('pt-BR'),
          filesAnalyzed: [],
          tags: [],
        };
      }
    });
    
    // Restore drafts for NON-approved steps
    const sortedDraftRuns = [...draftRuns]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    sortedDraftRuns.forEach((r: ChbRun) => {
      const stepId = parseInt(r.etapa) as 1 | 2 | 3;
      
      // Only restore draft if:
      // 1. Step is not yet approved (stepId > maxApprovedStep)
      // 2. We don't already have an analysis for this step
      if (stepId > maxApprovedStep && !restoredAnalysis[stepId] && r.result_html) {
        restoredAnalysis[stepId] = {
          id: `draft-${r.id}`,
          stepId,
          html: r.result_html,
          summary: r.result_text || '',
          generatedAt: new Date(r.created_at).toLocaleString('pt-BR'),
          filesAnalyzed: [],
          tags: [],
          usedFallback: false,
        };
        console.log(`[CHB] Restored draft analysis for step ${stepId}`);
      }
    });
    
    setApprovedHistory(newHistory);
    setAnalysisResults(prev => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(restoredAnalysis).filter(([_, v]) => v !== null)
      ),
    }));
    
    // Restore step states and active step based on approved runs
    if (maxApprovedStep > 0) {
      setSteps(prev => prev.map(step => {
        if (step.id <= maxApprovedStep) {
          return { ...step, status: 'completed' as const };
        }
        if (step.id === maxApprovedStep + 1) {
          return { ...step, status: 'current' as const };
        }
        return { ...step, status: 'pending' as const };
      }));
      
      // Set active step to next incomplete step (or last if all complete)
      const nextStep = Math.min(maxApprovedStep + 1, 3);
      setActiveStep(nextStep);
    }
  }, [dbRuns]);

  // Get documents for current step (inherited from previous steps + current)
  const getDocumentsForStep = useCallback((stepId: number) => {
    const allDocs: ChbDocument[] = [];
    for (let i = 1; i <= stepId; i++) {
      allDocs.push(...(documents[i] || []));
    }
    return allDocs;
  }, [documents]);

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleStepClick = (stepId: number) => {
    setActiveStep(stepId);
    setActiveTab('documentos');
  };

  const handleFilesChange = (files: File[]) => {
    setUploadedFiles(prev => ({
      ...prev,
      [activeStep]: files,
    }));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:mime;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  // Fetch file from URL and convert to base64
  const fetchFileAsBase64 = async (url: string, filename: string): Promise<{ content: string; mimeType: string } | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch file ${filename}: ${response.status}`);
        return null;
      }
      const blob = await response.blob();
      const mimeType = blob.type || getMimeTypeFromFilename(filename);
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve({ content: base64, mimeType });
        };
        reader.onerror = () => reject(new Error('Failed to read blob'));
      });
    } catch (error) {
      console.error(`Error fetching file ${filename}:`, error);
      return null;
    }
  };

  // Helper to determine MIME type from filename
  const getMimeTypeFromFilename = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xls': 'application/vnd.ms-excel',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'csv': 'text/csv',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  };

  const handleStartAnalysis = async (isRerun = false) => {
    // Get NEW files uploaded for current step only
    const currentStepFiles = uploadedFiles[activeStep] || [];
    
    // Get documents from current and all previous steps
    const allDocs = Array.from({ length: activeStep }, (_, i) => documents[i + 1] || []).flat();
    
    // For re-run, use existing documents; for new analysis, need new files
    const hasNewFiles = currentStepFiles.length > 0;
    const hasExistingDocs = allDocs.length > 0;
    
    if (!isRerun && !hasNewFiles && activeStep === 1) {
      toast.error('Nenhum arquivo para analisar');
      return;
    }
    
    if (!isRerun && !hasNewFiles && activeStep > 1) {
      toast.error('Adicione os arquivos desta etapa para analisar');
      return;
    }
    
    // For re-run without new files, use existing docs
    if (isRerun && !hasNewFiles && !hasExistingDocs) {
      toast.error('Nenhum arquivo disponível para análise');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress('Preparando arquivos...');
    setActiveTab('analise');
    pollingRef.current = true;

    try {
      // Convert new uploaded files to base64
      const newFilesContent = await Promise.all(
        currentStepFiles.map(async (file) => ({
          name: file.name,
          content: await fileToBase64(file),
          mimeType: file.type || 'application/octet-stream',
          stepId: activeStep,
        }))
      );

      // Convert existing documents (all steps) - fetch from URL if no local file
      setAnalysisProgress('Carregando documentos existentes...');
      const existingDocsPromises = allDocs.map(async (doc) => {
        // If we have a local File reference, use it
        if (doc.file) {
          return {
            name: doc.name,
            content: await fileToBase64(doc.file),
            mimeType: doc.file.type || 'application/octet-stream',
            stepId: doc.stepId,
          };
        }
        
        // Otherwise, fetch from URL if available
        if (doc.url) {
          const result = await fetchFileAsBase64(doc.url, doc.name);
          if (result) {
            return {
              name: doc.name,
              content: result.content,
              mimeType: result.mimeType,
              stepId: doc.stepId,
            };
          }
        }
        
        // Couldn't get content for this doc
        console.warn(`Could not get content for document: ${doc.name}`);
        return null;
      });

      const existingDocsResults = await Promise.all(existingDocsPromises);
      const existingDocsContent = existingDocsResults.filter((doc): doc is NonNullable<typeof doc> => doc !== null);

      // Combine: existing docs first, then new files (avoiding duplicates)
      const existingNames = new Set(existingDocsContent.map(d => d.name));
      const uniqueNewFiles = newFilesContent.filter(f => !existingNames.has(f.name));
      const allFilesContent = [...existingDocsContent, ...uniqueNewFiles];

      console.log(`Sending ${allFilesContent.length} files for analysis (${existingDocsContent.length} from DB/storage, ${uniqueNewFiles.length} new uploads)`);
      if (clientConfig) {
        console.log(`Using client config for: ${clientConfig.cliente_nome || clientConfig.cliente_cnpj}`);
      }

      // =========================================================================
      // ASYNC POLLING PATTERN: Submit analysis, then poll for result
      // =========================================================================
      
      setAnalysisProgress('Enviando para análise...');
      
      // Step 1: Submit analysis request
      const submitResult = await supabase.functions.invoke('analyze-chb-documents', {
        body: {
          stepId: activeStep,
          files: allFilesContent,
          itemId: itemId,
          clientConfig: clientConfig ? {
            tolerancia_peso: clientConfig.tolerancia_peso,
            tolerancia_valor: clientConfig.tolerancia_valor,
            campos_obrigatorios: clientConfig.campos_obrigatorios,
            cliente_nome: clientConfig.cliente_nome,
            instrucoes_personalizadas: clientConfig.instrucoes_personalizadas,
            armador: clientConfig.armador,
            agente_destino: clientConfig.agente_destino,
            contato_email: clientConfig.contato_email,
            prazo_resposta_dias: clientConfig.prazo_resposta_dias,
            porto_descarga_real: clientConfig.porto_descarga_real,
            tolerancia_taxas_acessorias_abs: clientConfig.tolerancia_taxas_acessorias_abs,
            tolerancia_taxas_acessorias_pct: clientConfig.tolerancia_taxas_acessorias_pct,
            beneficio_fiscal: clientConfig.beneficio_fiscal,
            cfop_padrao: clientConfig.cfop_padrao,
            estado_uf: clientConfig.estado_uf,
            icms_diferido: clientConfig.icms_diferido,
          } : undefined,
        },
      });

      if (submitResult.error) {
        // Extract detailed error message from response
        let errorMessage = 'Erro ao iniciar análise';
        
        // Check if the response data contains error details (from 4xx responses)
        if (submitResult.data?.error) {
          errorMessage = submitResult.data.error;
          if (submitResult.data.errors?.[0]?.suggestion) {
            errorMessage += ` ${submitResult.data.errors[0].suggestion}`;
          }
        } else if (submitResult.error.message && !submitResult.error.message.includes('non-2xx')) {
          errorMessage = submitResult.error.message;
        }
        
        throw new Error(errorMessage);
      }

      const { requestId } = submitResult.data;
      if (!requestId) {
        throw new Error('Não foi possível obter ID da requisição');
      }

      console.log(`Analysis request submitted: ${requestId}`);
      setAnalysisProgress('Analisando documentos...');

      // Step 2: Poll for result (max 10 minutes)
      const maxPollTime = 10 * 60 * 1000; // 10 minutes
      const pollInterval = 3000; // 3 seconds
      const startTime = Date.now();
      let data: any = null;

      while (pollingRef.current && (Date.now() - startTime) < maxPollTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        if (!pollingRef.current) {
          console.log('Polling cancelled by user');
          break;
        }

        const elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
        setAnalysisProgress(`Analisando documentos... (${elapsedSecs}s)`);

        const pollResult = await supabase.functions.invoke('analyze-chb-documents', {
          body: { requestId },
        });

        if (pollResult.error) {
          console.error('Poll error:', pollResult.error);
          continue; // Try again
        }

        const pollData = pollResult.data;
        console.log(`Poll status: ${pollData.status}`);

        if (pollData.status === 'completed') {
          data = pollData.result;
          break;
        }

        if (pollData.status === 'error') {
          throw new Error(pollData.error || 'Erro na análise dos documentos');
        }

        // Continue polling for 'pending' or 'processing' status
      }

      if (!pollingRef.current) {
        setIsAnalyzing(false);
        setAnalysisProgress('');
        toast.info('Análise cancelada');
        return;
      }

      if (!data) {
        throw new Error('Tempo limite excedido. A análise demorou mais de 10 minutos.');
      }

      setAnalysisProgress('');

      // Only add new documents if there are new files (not a re-run)
      if (currentStepFiles.length > 0) {
        const savedDocs: typeof documents[number] = [];
        
        // Upload files to Supabase storage and save metadata directly to Supabase
        for (const file of currentStepFiles) {
          try {
            // Generate unique file path
            const timestamp = Date.now();
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const filePath = `${itemId}/${activeStep}/${timestamp}_${safeName}`;
            
            // Upload to Supabase storage
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('chb-documents')
              .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
              });
            
            if (uploadError) {
              console.error('Error uploading file:', uploadError);
              toast.error(`Erro ao enviar ${file.name}`);
              continue;
            }
            
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('chb-documents')
              .getPublicUrl(filePath);
            
            const publicUrl = urlData?.publicUrl;
            
            // Save file metadata to MariaDB
            const { error: fileInsertError, data: fileData } = await supabase.functions.invoke('mariadb-proxy', {
              body: {
                action: 'insert',
                table: 'ai_agente.t_dachser_chb_files',
                data: {
                  item_id: itemId,
                  filename: file.name,
                  file_url: publicUrl || '',
                  file_size: file.size,
                  mime_type: file.type,
                  created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                },
                returnInsertId: true,
              },
            });
            
            if (fileInsertError) {
              console.error('Error saving file to MariaDB:', fileInsertError);
              toast.error(`Erro ao salvar ${file.name}`);
              continue;
            }
            
            const fileId = fileData?.insertId;
            
            // Create document link
            const { error: docInsertError } = await supabase.functions.invoke('mariadb-proxy', {
              body: {
                action: 'insert',
                table: 'ai_agente.t_dachser_chb_docs',
                data: {
                  item_id: itemId,
                  file_id: fileId,
                  etapa: activeStep.toString(),
                  doc_role: detectDocumentType(file.name),
                  created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                },
              },
            });
            
            if (docInsertError) {
              console.error('Error saving doc link to MariaDB:', docInsertError);
              toast.error(`Erro ao salvar metadados de ${file.name}`);
              continue;
            }
            
            savedDocs.push({
              id: `doc-${activeStep}-${timestamp}`,
              name: file.name,
              type: detectDocumentType(file.name),
              uploadedAt: new Date().toLocaleString('pt-BR'),
              size: formatFileSize(file.size),
              stepId: activeStep,
              file: file,
              url: publicUrl,
            });
            
            console.log(`[CHB] File saved successfully: ${file.name}`);
          } catch (err) {
            console.error('Error saving file:', err);
            toast.error(`Erro ao salvar ${file.name}`);
          }
        }

        // Add new documents to current step only
        if (savedDocs.length > 0) {
          setDocuments(prev => ({
            ...prev,
            [activeStep]: [...(prev[activeStep] || []), ...savedDocs],
          }));
          toast.success(`${savedDocs.length} arquivo(s) salvo(s) com sucesso!`);
        }

        // Refresh files from MariaDB
        await loadMariaDBFiles();

        // Clear only current step uploaded files
        setUploadedFiles(prev => ({
          ...prev,
          [activeStep]: [],
        }));
      }

      const analysisData = data as ChbAnalysisResult & { cliente?: string; modal?: 'SEA' | 'AIR' };
      
      setAnalysisResults(prev => ({
        ...prev,
        [activeStep]: analysisData,
      }));

      // Update client and modal in database if identified
      if (itemId && (analysisData.cliente || analysisData.modal)) {
        try {
          await updateItemClient(itemId, analysisData.cliente || '', analysisData.modal);
          if (analysisData.cliente) {
            console.log(`Cliente identificado e salvo: ${analysisData.cliente}`);
          }
          if (analysisData.modal) {
            console.log(`Modal identificado e salvo: ${analysisData.modal}`);
          }
        } catch (err) {
          console.error('Error updating client/modal:', err);
        }
      }

      // Try to load client config if cliente was identified and we dont have one yet
      if (analysisData.cliente && !clientConfig) {
        // Fetch configs from MariaDB if not loaded yet
        if (allClientConfigs.length === 0) {
          await fetchClientConfigs();
        }
        
        const clienteLower = analysisData.cliente?.toLowerCase() || '';
        const activeConfigs = allClientConfigs.filter(c => c.ativo);
        const match = activeConfigs.find((c) => {
          const nomeLower = c.cliente_nome?.toLowerCase() || '';
          const cnpj = c.cliente_cnpj || '';
          // Match by name (partial) or by CNPJ appearing in the client string
          return clienteLower.includes(nomeLower) ||
                 nomeLower.includes(clienteLower) ||
                 clienteLower.includes(cnpj.replace(/\D/g, '')) ||
                 (c.cliente_cnpj && clienteLower.includes(c.cliente_cnpj));
        });
        if (match) {
          setClientConfig(match);
          const hasSpecialRules = match.beneficio_fiscal || match.armador || match.estado_uf;
          if (hasSpecialRules) {
            toast.info(
              `Configuração do cliente "${match.cliente_nome}" carregada. Clique em "Re-analisar" para aplicar as regras específicas (${match.beneficio_fiscal ? `${match.beneficio_fiscal}, ` : ''}${match.estado_uf ? `UF: ${match.estado_uf}, ` : ''}${match.armador ? 'Armador configurado' : ''})`.replace(/, $/, '.'),
              { duration: 8000 }
            );
          } else {
            toast.info(`Configuração do cliente "${match.cliente_nome}" carregada automaticamente.`);
          }
        }
      }

      // Save analysis as draft for persistence (so user doesn't lose it if they leave)
      try {
        // Check if there's an existing draft for this step
        const existingDraft = dbRuns.find(
          (r: ChbRun) => r.etapa === activeStep.toString() && r.status === 'draft'
        );

        if (existingDraft) {
          // Update existing draft
          await updateRun(existingDraft.id, {
            resultText: analysisData.summary || '',
            resultHtml: analysisData.html,
            resultJson: analysisData,
          });
          console.log('[CHB] Updated existing draft analysis for step', activeStep);
        } else {
          // Create new draft
          await createRun(
            activeStep.toString() as '1' | '2' | '3',
            'draft',
            analysisData.summary || '',
            analysisData.html,
            analysisData
          );
          console.log('[CHB] Saved new draft analysis for step', activeStep);
        }
      } catch (err) {
        console.error('Error saving analysis draft:', err);
        // Don't block the user, just log the error
      }

      toast.success('Análise concluída com sucesso!');
    } catch (error) {
      console.error('Error analyzing documents:', error);
      toast.error(`Erro na análise: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress('');
      pollingRef.current = false;
    }
  };

  // Helper to detect document type from filename - returns 1 char for DB compatibility (CHAR(1))
  const detectDocumentType = (filename: string): string => {
    const lower = filename.toLowerCase();
    if (lower.includes('hbl') || lower.includes('house')) return 'H';
    if (lower.includes('inv') || lower.includes('fatura') || lower.includes('invoice')) return 'I';
    if (lower.includes('pack') || lower.includes('romaneio') || lower.includes('packing')) return 'P';
    if (lower.includes('inst') || lower.includes('instruc')) return 'X';
    if (lower.includes('di') || lower.includes('declaracao')) return 'D';
    if (lower.includes('awb') || lower.includes('conhecimento')) return 'A';
    if (lower.includes('cert') || lower.includes('certificado')) return 'C';
    return 'O'; // Other - 1 char
  };


  const handleApproveAndAdvance = async () => {
    const currentAnalysis = analysisResults[activeStep];
    
    if (!currentAnalysis) {
      toast.error('Nenhuma análise para aprovar');
      return;
    }

    // Save to database with status 'approved'
    // Check if there's an existing draft to update instead of creating new
    try {
      const existingDraft = dbRuns.find(
        (r: ChbRun) => r.etapa === activeStep.toString() && r.status === 'draft'
      );

      if (existingDraft) {
        // Update existing draft to approved
        await updateRun(existingDraft.id, {
          status: 'approved',
          resultText: currentAnalysis.summary,
          resultHtml: currentAnalysis.html,
          resultJson: currentAnalysis,
        });
        console.log('[CHB] Converted draft to approved for step', activeStep);
      } else {
        // Create new approved run (fallback if no draft exists)
        await createRun(
          activeStep.toString() as '1' | '2' | '3',
          'approved',
          currentAnalysis.summary,
          currentAnalysis.html,
          currentAnalysis
        );
      }

      // Update step status in database
      if (itemId) {
        const stepStatusField = `step${activeStep}_status` as 'step1_status' | 'step2_status' | 'step3_status';
        const stepStatusUpdate: Record<string, string> = { [stepStatusField]: 'realizado' };
        
        // Determine new macro status based on which step was approved
        let newMacroStatus: 'pre_alerta_pendente' | 'instrucao_pendente' | 'di_pendente' | 'concluida';
        if (activeStep === 1) {
          newMacroStatus = 'instrucao_pendente'; // Move to next step
        } else if (activeStep === 2) {
          newMacroStatus = 'di_pendente'; // Move to next step
        } else {
          newMacroStatus = 'concluida'; // All steps completed
        }
        
        await updateItem(itemId, {
          ...stepStatusUpdate,
          status_macro: newMacroStatus,
        } as Partial<Pick<import('@/hooks/useChbData').ChbItem, 'status_macro' | 'step1_status' | 'step2_status' | 'step3_status'>>);
      }
    } catch (error) {
      console.error('Error saving run:', error);
      toast.error('Erro ao salvar aprovação');
      return;
    }

    // Create history entry with HTML content from analysis
    const historyEntry: ChbApprovedHistory = {
      id: `h${Date.now()}`,
      stepId: activeStep,
      date: new Date().toLocaleString('pt-BR'),
      user: currentUser,
      summary: currentAnalysis.summary,
      detailedSummary: currentAnalysis.html, // Use HTML content for proper formatting
      parecer: (currentAnalysis as any).parecer,
      tags: currentAnalysis.tags,
    };

    // Add to history for current step only (no duplicates)
    setApprovedHistory(prev => ({
      ...prev,
      [activeStep]: [historyEntry, ...(prev[activeStep] || [])],
    }));

    // Update step status
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === activeStep) {
          return { ...step, status: 'completed' as const };
        }
        if (step.id === activeStep + 1) {
          return { ...step, status: 'current' as const };
        }
        return step;
      })
    );

    toast.success('Etapa aprovada com sucesso!');
    
    // Advance to next step if not the last one
    if (activeStep < 3) {
      setActiveStep(activeStep + 1);
      setActiveTab('documentos');
    } else {
      toast.success('Processo CHB concluído!');
    }
  };


  const handleDeleteDocument = async (docId: string) => {
    // Delete from MariaDB
    try {
      const { error } = await supabase.functions.invoke('mariadb-proxy', {
        body: {
          action: 'query',
          query: `DELETE FROM ai_agente.t_dachser_chb_docs WHERE id = ?`,
          params: [docId],
        },
      });
      
      if (error) {
        console.error('Error deleting document from MariaDB:', error);
        toast.error('Erro ao excluir documento');
        return;
      }
    } catch (err) {
      console.error('Error deleting document:', err);
      toast.error('Erro ao excluir documento');
      return;
    }
    
    setDocuments((prev) => ({
      ...prev,
      [activeStep]: (prev[activeStep] || []).filter((doc) => doc.id !== docId),
    }));
    toast.success('Documento excluído');
  };

  const renderPanel = () => {
    switch (activeTab) {
      case 'documentos':
        return (
          <ChbDocumentsPanel
            stepId={activeStep}
            documents={getDocumentsForStep(activeStep)}
            uploadedFiles={uploadedFiles[activeStep] || []}
            onFilesChange={handleFilesChange}
            onStartAnalysis={handleStartAnalysis}
            onDeleteDocument={handleDeleteDocument}
            isAnalyzing={isAnalyzing}
            hasAnalysisResult={!!analysisResults[activeStep]}
          />
        );
      case 'analise':
        const currentStepData = steps.find(s => s.id === activeStep);
        const isStepCompleted = currentStepData?.status === 'completed';
        return (
          <ChbAnalysisPanel
            stepId={activeStep}
            analysisResult={analysisResults[activeStep]}
            onRunAnalysis={() => handleStartAnalysis(!!analysisResults[activeStep])}
            onApproveAndAdvance={handleApproveAndAdvance}
            isAnalyzing={isAnalyzing}
            hasFiles={(uploadedFiles[activeStep] || []).length > 0 || getDocumentsForStep(activeStep).some(d => d.file || d.url)}
            isStepCompleted={isStepCompleted}
            analysisProgress={analysisProgress}
            reference={itemId ? `#${itemId}` : ''}
          />
        );
      case 'historico':
        return (
          <ChbHistoryPanel
            stepId={activeStep}
            approvedHistory={approvedHistory}
          />
        );
      default:
        return null;
    }
  };

  const rightContent = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate("/chb/manual")}
        className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center bg-black/70 text-gray-400 hover:text-[#ffc800] transition-colors"
        title="Manual do usuário"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 px-[14px] py-1.5 rounded-full bg-[rgba(0,0,0,.70)] border border-[rgba(255,255,255,.18)] text-[#aaaaaa]">
        <FileCheck size={14} className="text-[#ffc800]" />
        <span>{id ? `#${id}` : 'Processo'}</span>
      </div>
    </div>
  );

  return (
    <PageLayout
      title="DACHSER"
      subtitle="Desembaraço — Conferência (CHB)"
      rightContent={rightContent}
      pageIcon={FileCheck}
      backTo="/chb/conferences"
    >
      {/* Main card */}
      <PageCard className="overflow-hidden" padding="sm">
        {/* Stepper */}
        <div className="border-b border-[rgba(255,255,255,.10)]">
          <ChbStepper
            steps={steps}
            activeStep={activeStep}
            onStepClick={handleStepClick}
          />
        </div>

        {/* Tabs */}
        <div className="py-4 border-b border-[rgba(255,255,255,.10)]">
          <ChbTabs 
            activeTab={activeTab} 
            onTabChange={setActiveTab}
            isAnalyzing={isAnalyzing}
            hasAnalysisResult={!!analysisResults[activeStep]}
          />
        </div>

        {/* Content panel */}
        <div className="p-6 min-h-[400px]">
          {renderPanel()}
        </div>
      </PageCard>

      {/* CSS for analysis table styling */}
      <style>{`
        .chb-analysis-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.875rem;
        }
        .chb-analysis-content thead {
          background: rgba(255, 255, 255, 0.05);
        }
        .chb-analysis-content th,
        .chb-analysis-content td {
          padding: 0.75rem 1rem;
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .chb-analysis-content th {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }
        .chb-analysis-content td {
          color: rgba(255, 255, 255, 0.7);
        }
        .chb-analysis-content tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }
        .chb-analysis-content p {
          margin: 0.75rem 0;
          color: rgba(255, 255, 255, 0.8);
        }
        .chb-analysis-content ul {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }
        .chb-analysis-content li {
          margin: 0.25rem 0;
          color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </PageLayout>
  );
}
