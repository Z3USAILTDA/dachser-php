import { MoreHorizontal, Edit, Trash2, Undo2 } from "lucide-react";
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

interface VoucherActionsMenuProps {
  onEdit: () => void;
  onDelete: () => void;
  onGoBack: (justificativa: string) => void;
  canGoBack: boolean;
  canGoBackStage?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export const VoucherActionsMenu = ({
  onEdit,
  onDelete,
  onGoBack,
  canGoBack,
  canGoBackStage = false,
  canEdit = true,
  canDelete = true,
}: VoucherActionsMenuProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showGoBackDialog, setShowGoBackDialog] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  // If user can't edit or delete, don't show the menu at all
  if (!canEdit && !canDelete && !(canGoBack && canGoBackStage)) {
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
          {canDelete && (
            <>
              {(canEdit || (canGoBack && canGoBackStage)) && <DropdownMenuSeparator />}
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
              Tem certeza que deseja excluir este voucher? Esta ação não pode ser desfeita e todos os
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
              Informe a justificativa para retornar este voucher à etapa anterior. 
              Esta informação será registrada no histórico do voucher.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="justificativa">Justificativa *</Label>
              <Textarea
                id="justificativa"
                placeholder="Descreva o motivo para retornar o voucher à etapa anterior..."
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
    </>
  );
};
