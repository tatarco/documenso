import { ZEnvelopeUploadMimeTypeSchema } from '@documenso/lib/types/envelope-upload';
import { z } from 'zod';

import type { TrpcRouteMeta } from '../../trpc';

export const createUploadMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/upload/create',
    summary: 'Create upload',
    description: 'Upload a file into a recipient upload slot using their signing token',
    tags: ['Envelope Uploads'],
  },
};

export const ZCreateUploadRequestSchema = z.object({
  token: z.string(),
  slotKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: ZEnvelopeUploadMimeTypeSchema,
  fileBase64: z.string().min(1),
});

export const ZCreateUploadResponseSchema = z.object({
  id: z.string(),
  slotKey: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  sha256: z.string(),
  uploadedAt: z.date(),
});

export type TCreateUploadRequest = z.infer<typeof ZCreateUploadRequestSchema>;
export type TCreateUploadResponse = z.infer<typeof ZCreateUploadResponseSchema>;
