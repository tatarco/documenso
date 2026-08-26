import { z } from 'zod';

/**
 * Mime types accepted for signer file uploads (v1).
 *
 * HEIC is intentionally excluded until a decode-to-PNG/JPEG conversion step
 * is wired into the seal pipeline (see design doc §3/§5).
 */
export const ENVELOPE_UPLOAD_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export const ZEnvelopeUploadMimeTypeSchema = z.enum(ENVELOPE_UPLOAD_ALLOWED_MIME_TYPES);

/**
 * Hard cap on a single uploaded file, regardless of what a slot declares.
 */
export const ENVELOPE_UPLOAD_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export const ZEnvelopeUploadRequirementSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  accept: z.array(ZEnvelopeUploadMimeTypeSchema),
  maxSizeBytes: z.number().int().positive(),
});

export const ZEnvelopeUploadRequirementsSchema = z.array(ZEnvelopeUploadRequirementSchema);

export type TEnvelopeUploadRequirement = z.infer<typeof ZEnvelopeUploadRequirementSchema>;
export type TEnvelopeUploadRequirements = z.infer<typeof ZEnvelopeUploadRequirementsSchema>;
