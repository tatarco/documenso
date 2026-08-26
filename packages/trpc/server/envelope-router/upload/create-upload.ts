import { createUpload } from '@documenso/lib/server-only/envelope-upload/create-upload';

import { procedure } from '../../trpc';
import {
  createUploadMeta,
  ZCreateUploadRequestSchema,
  ZCreateUploadResponseSchema,
} from './create-upload.types';

// Note that this is an unauthenticated public procedure route, secured by the recipient token.
export const createUploadRoute = procedure
  .meta(createUploadMeta)
  .input(ZCreateUploadRequestSchema)
  .output(ZCreateUploadResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { token, slotKey, fileName, mimeType, fileBase64 } = input;

    ctx.logger.info({
      input: { slotKey },
    });

    const upload = await createUpload({
      token,
      slotKey,
      fileName,
      mimeType,
      fileBase64,
    });

    return {
      id: upload.id,
      slotKey: upload.slotKey,
      originalFilename: upload.originalFilename,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      sha256: upload.sha256,
      uploadedAt: upload.uploadedAt,
    };
  });
