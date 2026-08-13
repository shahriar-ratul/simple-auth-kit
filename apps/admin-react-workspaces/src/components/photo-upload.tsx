import { useRef, useState } from "react";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.85;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB, matching the size the resize step targets

/** Resizes to fit within MAX_DIMENSION and re-encodes as JPEG, so a phone photo doesn't land in the database as a multi-megabyte data URI. */
function resizeToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read this image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas is not supported in this browser."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface RejectedFile {
  name: string;
  reasons: string[];
}

/**
 * Stores the photo as a data URI directly on the `photo` column — there is no object-storage
 * service in this stack, and a small resized JPEG (see MAX_DIMENSION) keeps the row a reasonable
 * size. Swap this for an upload-to-a-bucket-then-store-the-URL flow if the deployment adds one.
 *
 * Renders admin-nextjs's upload treatment: the purple dashed dropzone with the big upload arrow,
 * followed by a Preview section with an accepted-file thumbnail (remove button on the thumbnail)
 * and a rejected-files list. Built on a hidden file input and native drag events rather than
 * react-dropzone, which this app doesn't carry.
 */
export function PhotoUpload({
  photo,
  fallback,
  onChange,
  disabled,
}: {
  photo: string | null;
  fallback: string;
  onChange: (photo: string | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);

  async function processFile(file: File | undefined) {
    if (!file) return;
    const reasons: string[] = [];
    if (!file.type.startsWith("image/")) reasons.push("File type must be an image.");
    if (file.size > MAX_FILE_BYTES) reasons.push("File is larger than 2MB.");
    if (reasons.length > 0) {
      setRejected([{ name: file.name, reasons }]);
      return;
    }
    setRejected([]);
    setError(null);
    setBusy(true);
    try {
      const dataUri = await resizeToDataUri(file);
      await onChange(dataUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process this image.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await processFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (disabled || busy) return;
    void processFile(event.dataTransfer.files?.[0]);
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      await onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the photo.");
    } finally {
      setBusy(false);
    }
  }

  function removeRejected(name: string) {
    setRejected((prev) => prev.filter((file) => file.name !== name));
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !disabled && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !busy) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "p-12 border-2 border-dashed border-purple-500 rounded-lg bg-purple-50 dark:bg-purple-950/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors cursor-pointer",
          (disabled || busy) && "cursor-not-allowed opacity-60",
        )}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} disabled={disabled} />
        <div className="flex flex-col items-center justify-center gap-4 text-purple-700 dark:text-purple-300">
          <ArrowUpIcon className="w-8 h-8" />
          {busy ? (
            <p className="text-lg font-medium">Uploading...</p>
          ) : dragActive ? (
            <p className="text-lg font-medium">Drop the image here...</p>
          ) : (
            <div className="text-center">
              <p className="text-lg font-medium">Click or drag image to upload</p>
              <p className="text-sm text-muted-foreground mt-2">PNG, JPG up to 2MB</p>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <section className="mt-10">
        <div className="flex gap-4">
          <h2 className="title text-3xl font-semibold">Preview</h2>
          {photo && !disabled && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className="ml-auto mt-1 text-[12px] uppercase tracking-wider font-bold text-neutral-500 border border-purple-400 rounded-md px-3 hover:bg-purple-400 hover:text-white transition-colors dark:text-white dark:border-white"
            >
              Remove all files
            </button>
          )}
        </div>

        <h3 className="title text-lg font-semibold text-neutral-600 mt-10 border-b pb-3 dark:text-white">Accepted Files</h3>
        {photo ? (
          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-10">
            <li className="relative h-32 rounded-md shadow-lg dark:shadow-white">
              <img src={photo} alt="Selected image" className="h-full w-full object-contain rounded-md dark:object-cover" />
              {!disabled && (
                <button
                  type="button"
                  className="w-7 h-7 border border-border bg-background rounded-full flex justify-center items-center absolute -top-3 -right-3 hover:bg-muted transition-colors"
                  disabled={busy}
                  onClick={() => void handleRemove()}
                >
                  <XIcon className="w-5 h-5" />
                </button>
              )}
            </li>
          </ul>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <Avatar className="size-16 shrink-0">
              <AvatarFallback className="text-base">{fallback}</AvatarFallback>
            </Avatar>
            <p className="text-sm text-muted-foreground">No file selected.</p>
          </div>
        )}

        {rejected.length > 0 && (
          <>
            <h3 className="title text-lg font-semibold text-neutral-600 mt-10 border-b pb-3 dark:text-white">Rejected Files</h3>
            <ul className="mt-6 flex flex-col">
              {rejected.map((file) => (
                <li key={file.name} className="flex items-start justify-between dark:text-white">
                  <div>
                    <p className="mt-2 text-neutral-500 text-sm font-medium dark:text-white">{file.name}</p>
                    <ul className="text-[12px] text-red-400">
                      {file.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="mt-1 py-1 text-[12px] uppercase tracking-wider font-bold text-neutral-500 border border-border rounded-md px-3 hover:bg-muted transition-colors dark:text-white dark:border-white"
                    onClick={() => removeRejected(file.name)}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
