"use client";

import { useCallback, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const MAX_DIMENSION = 256;
const JPEG_QUALITY = 0.85;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB, matching the reference's dropzone limit

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

/**
 * Stores the photo as a data URI directly on the `photo` column — there is no object-storage
 * service in this stack, and a small resized JPEG (see MAX_DIMENSION) keeps the row a reasonable
 * size. Swap this for an upload-to-a-bucket-then-store-the-URL flow if the deployment adds one.
 *
 * Renders the reference app's upload treatment: the purple dashed dropzone with the big upload
 * arrow, followed by a Preview section with an accepted-file thumbnail grid (remove button on the
 * thumbnail) and a rejected-files list.
 */
export function PhotoUpload({
  photo,
  fallback,
  onChange,
  disabled,
}: {
  photo: string | null | undefined;
  fallback: string;
  onChange: (photo: string | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<FileRejection[]>([]);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      setRejected(rejections);
      const file = accepted[0];
      if (!file) return;
      setError(null);
      setBusy(true);
      resizeToDataUri(file)
        .then((dataUri) => onChange(dataUri))
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't process this image."))
        .finally(() => setBusy(false));
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
    disabled: disabled || busy,
    accept: { "image/*": [] },
    maxSize: MAX_FILE_BYTES,
  });

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
    setRejected((prev) => prev.filter(({ file }) => file.name !== name));
  }

  return (
    <div className="w-full">
      <div
        {...getRootProps({
          className: cn(
            "p-12 border-2 border-dashed border-purple-500 rounded-lg bg-purple-50 dark:bg-purple-950/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors cursor-pointer",
            (disabled || busy) && "cursor-not-allowed opacity-60",
          ),
        })}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-4 text-purple-700 dark:text-purple-300">
          <ArrowUpIcon className="w-8 h-8" />
          {busy ? (
            <p className="text-lg font-medium">Uploading...</p>
          ) : isDragActive ? (
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

      {/* Preview */}
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

        {/* Accepted files */}
        <h3 className="title text-lg font-semibold text-neutral-600 mt-10 border-b pb-3 dark:text-white">Accepted Files</h3>
        {photo ? (
          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-10">
            <li className="relative h-32 rounded-md shadow-lg dark:shadow-white">
              {/* Data URIs need a plain <img>; next/image would try to optimize them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Selected image" className="h-full w-full object-contain rounded-md dark:object-cover" />
              <button
                type="button"
                className="w-7 h-7 border border-border bg-background rounded-full flex justify-center items-center absolute -top-3 -right-3 hover:bg-muted transition-colors"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                <XIcon className="w-5 h-5" />
              </button>
            </li>
          </ul>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <Avatar className="size-16 shrink-0">
              {photo && <AvatarImage src={photo} alt="" className="object-cover" />}
              <AvatarFallback className="text-base">{fallback}</AvatarFallback>
            </Avatar>
            <p className="text-sm text-muted-foreground">No file selected.</p>
          </div>
        )}

        {/* Rejected Files */}
        {rejected.length > 0 && (
          <>
            <h3 className="title text-lg font-semibold text-neutral-600 mt-10 border-b pb-3 dark:text-white">Rejected Files</h3>
            <ul className="mt-6 flex flex-col">
              {rejected.map(({ file, errors }) => (
                <li key={file.name} className="flex items-start justify-between dark:text-white">
                  <div>
                    <p className="mt-2 text-neutral-500 text-sm font-medium dark:text-white">{file.name}</p>
                    <ul className="text-[12px] text-red-400">
                      {errors.map((e) => (
                        <li key={e.code}>{e.message}</li>
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
