import { useRef, useState } from 'react';

import type { TEnvelopeUploadRequirement } from '@documenso/lib/types/envelope-upload';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { Label } from '@documenso/ui/primitives/label';
import { Trans } from '@lingui/react/macro';
import { CheckIcon, Loader2Icon, PaperclipIcon, UploadCloudIcon, XIcon } from 'lucide-react';

export type EnvelopeUploadSlotUpload = {
  id: string;
  slotKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: Date;
};

export type EnvelopeUploadSlotProps = {
  token: string;
  slot: TEnvelopeUploadRequirement;
  upload: EnvelopeUploadSlotUpload | undefined;
  onUploaded: (_upload: EnvelopeUploadSlotUpload) => void;
  onRemoved: (_slotKey: string) => void;
};

const readFileAsBase64 = async (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }

      resolve(result.split(',')[1] ?? '');
    };

    reader.onerror = () => reject(reader.error);

    reader.readAsDataURL(file);
  });

/**
 * A single labeled "please upload a file" row in the signer form, e.g. a
 * photo ID or certificate slot declared via `recipient.uploadRequirements`.
 *
 * Mirrors the visual grammar of `renderFieldBlock` in
 * `envelope-signer-form-mode.tsx` (label + required `*` + inserted checkmark).
 */
export const EnvelopeUploadSlot = ({ token, slot, upload, onUploaded, onRemoved }: EnvelopeUploadSlotProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: createUpload } = trpc.envelope.upload.create.useMutation();
  const { mutateAsync: deleteUpload } = trpc.envelope.upload.delete.useMutation();

  const handleFile = async (file: File) => {
    setError(null);

    if (!slot.accept.includes(file.type as (typeof slot.accept)[number])) {
      setError('type');
      return;
    }

    if (file.size > slot.maxSizeBytes) {
      setError('size');
      return;
    }

    setIsUploading(true);

    try {
      const fileBase64 = await readFileAsBase64(file);

      const result = await createUpload({
        token,
        slotKey: slot.key,
        fileName: file.name,
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        mimeType: file.type as (typeof slot.accept)[number],
        fileBase64,
      });

      onUploaded(result);
    } catch {
      setError('save');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!upload) {
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      await deleteUpload({ id: upload.id, token });

      onRemoved(slot.key);
    } catch {
      setError('save');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div data-upload-slot-anchor={slot.key}>
      <Label className="flex items-center gap-2 text-sm">
        <span>{slot.label}</span>

        {slot.required && !upload && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}

        {upload && <CheckIcon className="h-4 w-4 text-primary" />}
        {isUploading && <Loader2Icon className="h-4 w-4 animate-spin" />}
      </Label>

      {error && (
        <p className="mt-1 text-destructive text-xs">
          <Trans>Could not save the value. Please try again.</Trans>
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={slot.accept.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0];

          e.target.value = '';

          if (file) {
            void handleFile(file);
          }
        }}
      />

      <div className="mt-1.5">
        {upload ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <PaperclipIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
              {upload.originalFilename}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Trans>Replace</Trans>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUploading}
              className="text-muted-foreground hover:text-destructive"
              onClick={handleRemove}
            >
              <XIcon className="h-4 w-4" />
              <span className="sr-only">
                <Trans>Remove</Trans>
              </span>
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloudIcon className="mr-2 h-4 w-4" />
            <Trans>Upload file</Trans>
          </Button>
        )}
      </div>
    </div>
  );
};
