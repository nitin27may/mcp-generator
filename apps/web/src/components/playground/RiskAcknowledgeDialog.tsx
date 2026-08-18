import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { en } from '@/i18n/en';

/** BR-006-adjacent: a `DESTRUCTIVE`/`PRIVILEGED` tool never runs from the playground without this explicit, per-call acknowledgement (428 `PLG-001` server-side if skipped — this dialog is the client-side path to supplying it, not the only enforcement). */
export function RiskAcknowledgeDialog({
  open,
  toolName,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  toolName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{en.riskDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>{en.riskDialogBody(toolName)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{en.riskDialogCancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{en.riskDialogConfirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
