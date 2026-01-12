import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, Loader2, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CorrectionInfo {
  original_value: string | null;
  corrected_value: string;
  location_reference: string | null;
  location_confidence: 'alta' | 'media' | 'baixa' | null;
  is_validated: boolean;
}

interface EditableCellProps {
  value: string;
  filename: string;
  fieldName: string;
  status: 'success' | 'warning' | 'error';
  correction?: CorrectionInfo;
  onSave: (newValue: string) => Promise<boolean>;
  disabled?: boolean;
}

export function EditableCell({
  value,
  filename,
  fieldName,
  status,
  correction,
  onSave,
  disabled = false,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (disabled) return;
    setEditValue(value);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const success = await onSave(editValue);
      if (success) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const confidenceColors = {
    alta: 'text-emerald-400',
    media: 'text-amber-400',
    baixa: 'text-red-400',
  };

  const confidenceLabels = {
    alta: 'Alta confiança',
    media: 'Média confiança',
    baixa: 'Baixa confiança',
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-6 text-xs px-2 py-0 bg-white/10 border-white/20"
          disabled={isSaving}
        />
        {isSaving ? (
          <Loader2 className="w-4 h-4 animate-spin text-white/50" />
        ) : (
          <>
            <button
              onClick={handleSave}
              className="p-0.5 hover:bg-white/10 rounded"
              title="Salvar (Enter)"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            </button>
            <button
              onClick={handleCancel}
              className="p-0.5 hover:bg-white/10 rounded"
              title="Cancelar (Esc)"
            >
              <X className="w-3.5 h-3.5 text-red-400" />
            </button>
          </>
        )}
      </div>
    );
  }

  const hasCorrection = !!correction;
  const displayValue = hasCorrection ? correction.corrected_value : value;

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 transition-colors',
        !disabled && 'hover:bg-white/5',
        hasCorrection && 'bg-blue-500/10 border border-blue-500/20'
      )}
      onClick={handleStartEdit}
      title={disabled ? undefined : 'Clique para editar'}
    >
      <span
        className={cn(
          'block truncate flex-1',
          status === 'error' && 'text-red-300',
          status === 'warning' && 'text-amber-300',
          status === 'success' && 'text-white/80',
          hasCorrection && 'text-blue-300'
        )}
        title={displayValue || '—'}
      >
        {displayValue || '—'}
      </span>

      {hasCorrection && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-shrink-0">
                <Info
                  className={cn(
                    'w-3.5 h-3.5',
                    correction.location_confidence
                      ? confidenceColors[correction.location_confidence]
                      : 'text-blue-400'
                  )}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs bg-[#1a1b23] border-white/10 text-xs"
            >
              <div className="space-y-1.5">
                <p className="font-medium text-blue-400">Valor corrigido</p>
                {correction.original_value && (
                  <p className="text-white/60">
                    Original: <span className="line-through">{correction.original_value}</span>
                  </p>
                )}
                <p className="text-white/80">
                  Corrigido: <span className="text-blue-300">{correction.corrected_value}</span>
                </p>
                {correction.location_reference && (
                  <p className="text-white/60">
                    📍 {correction.location_reference}
                  </p>
                )}
                {correction.location_confidence && (
                  <p className={confidenceColors[correction.location_confidence]}>
                    {confidenceLabels[correction.location_confidence]}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {!disabled && !hasCorrection && (
        <Pencil className="w-3 h-3 text-white/30 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      )}
    </div>
  );
}
