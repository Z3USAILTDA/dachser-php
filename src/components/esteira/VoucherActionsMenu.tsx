import { MoreHorizontal, Edit, Trash2, Undo2, XCircle, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { VoucherFilho } from "@/types/voucher";
import { DesmembrarMasterDialog } from "./DesmembrarMasterDialog";

interface VoucherActionsMenuProps {
  onEdit: () => void;
  onDelete: () => void;
  onGoBack: (justificativa: string) => void;
  onCancel?: () => void;
  onDisassemble?: (selectedChildIds: string[], keepMaster: boolean) => Promise<void>;
  canGoBack: boolean;
  canGoBackStage?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canCancelVoucher?: boolean;
  canDisassemble?: boolean;
  isCancelled?: boolean;
  vouchersFilhos?: VoucherFilho[];
  masterId?: string;
}

export const VoucherActionsMenu = ({
  onEdit,
  onDelete,
  onGoBack,
  onCancel,
  onDisassemble,
  canGoBack,
  canGoBackStage = false,
  canEdit = true,
  canDelete = true,
  canCancelVoucher = false,
  canDisassemble = false,
  isCancelled = false,
  vouchersFilhos = [],
  masterId,
}: VoucherActionsMenuProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showGoBackDialog, setShowGoBackDialog] = useState(false);
  const [showDisassembleDialog, setShowDisassembleDialog] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [disassembleLoading, setDisassembleLoading] = useState(false);

  // If voucher is cancelled, only show view (no actions)
  if (isCancelled) {
    return null;
  }

  // If user can't perform any action, don't show the menu at all
  if (!canEdit && !canDelete && !(canGoBack && canGoBackStage) && !canCancelVoucher && !canDisassemble) {
    return null;
  }

  const handleGoBackConfirm = () => {
    if (!justificativa.trim()) {
      return;
    }
    onGoBack(justificativa);
    setShowGoBackDialog(false);
    setJustificativa("");
  };

  const handleDisassembleConfirm = async (selectedChildIds: string[], keepMaster: boolean) => {
    if (!onDisassemble) return;
    try {
      setDisassembleLoading(true);
      await onDisassemble(selectedChildIds, keepMaster);
      setShowDisassembleDialog(false);
    } finally {
      setDisassembleLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
          )}
          {canGoBack && canGoBackStage && (
            <DropdownMenuItem onClick={() => setShowGoBackDialog(true)}>
              <Undo2 className="mr-2 h-4 w-4" />
              Voltar Etapa
            </DropdownMenuItem>
          )}
          {canDisassemble && onDisassemble && (
            <>
              {(canEdit || (canGoBack && canGoBackStage)) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => setShowDisassembleDialog(true)}
                className="text-orange-600 focus:text-orange-600"
              >
                <Unlink className="mr-2 h-4 w-4" />
                Desmembrar Master
              </DropdownMenuItem>
            </>
          )}
          {canCancelVoucher && onCancel && (
            <>
              {(canEdit || (canGoBack && canGoBackStage) || canDisassemble) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={onCancel}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancelar Voucher/SPO
              </DropdownMenuItem>
            </>
          )}
          {canDelete && (
            <>
              {(canEdit || (canGoBack && canGoBackStage) || canCancelVoucher) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este voucher/SPO? Esta ação não pode ser desfeita e todos os
              anexos e histórico relacionados serão permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setShowDeleteDialog(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showGoBackDialog} onOpenChange={(open) => {
        setShowGoBackDialog(open);
        if (!open) setJustificativa("");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voltar Etapa Anterior</DialogTitle>
            <DialogDescription>
              Informe a justificativa para retornar este voucher/SPO à etapa anterior. 
              Esta informação será registrada no histórico do voucher/SPO.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="justificativa">Justificativa *</Label>
              <Textarea
                id="justificativa"
                placeholder="Descreva o motivo para retornar o voucher/SPO à etapa anterior..."
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGoBackDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleGoBackConfirm}
              disabled={!justificativa.trim()}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desmembrar Master com seleção de filhos */}
      {masterId && vouchersFilhos.length > 0 && (
        <DesmembrarMasterDialog
          open={showDisassembleDialog}
          onOpenChange={setShowDisassembleDialog}
          masterId={masterId}
          vouchersFilhos={vouchersFilhos}
          onConfirm={handleDisassembleConfirm}
          loading={disassembleLoading}
        />
      )}
    </>
  );
};
