import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/** One confirm dialog reused for every destructive/irreversible action — the caller decides what "confirm" does. */
export function AlertModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  description = "This action cannot be undone.",
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  description?: string;
}) {
  return (
    <Modal title="Are you sure?" description={description} isOpen={isOpen} onClose={onClose}>
      <div className="flex w-full items-center justify-end gap-2 pt-6">
        <Button disabled={loading} variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={loading} variant="destructive" onClick={onConfirm}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}
