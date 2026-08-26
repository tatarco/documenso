import { z } from 'zod';

import type { TrpcRouteMeta } from '../../trpc';

export const findUploadsMeta: TrpcRouteMeta = {
  openapi: {
    method: 'GET',
    path: '/envelope/upload',
    summary: 'Find uploads',
    description: 'Find all uploads for an envelope',
    tags: ['Envelope Uploads'],
  },
};

export const ZFindUploadsRequestSchema = z.object({
  envelopeId: z.string(),
  token: z.string().optional(),
});

export const ZFindUploadsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      recipientId: z.number(),
      slotKey: z.string(),
      originalFilename: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      sha256: z.string(),
      uploadedAt: z.date(),
    }),
  ),
});

export type TFindUploadsRequest = z.infer<typeof ZFindUploadsRequestSchema>;
export type TFindUploadsResponse = z.infer<typeof ZFindUploadsResponseSchema>;
