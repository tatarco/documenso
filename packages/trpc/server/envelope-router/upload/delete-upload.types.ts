import { z } from 'zod';

import { ZSuccessResponseSchema } from '../../schema';
import type { TrpcRouteMeta } from '../../trpc';

export const deleteUploadMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/upload/delete',
    summary: 'Delete upload',
    description: 'Delete an uploaded file from a recipient upload slot using their signing token',
    tags: ['Envelope Uploads'],
  },
};

export const ZDeleteUploadRequestSchema = z.object({
  id: z.string(),
  token: z.string(),
});

export const ZDeleteUploadResponseSchema = ZSuccessResponseSchema;

export type TDeleteUploadRequest = z.infer<typeof ZDeleteUploadRequestSchema>;
export type TDeleteUploadResponse = z.infer<typeof ZDeleteUploadResponseSchema>;
