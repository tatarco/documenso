import { deleteUpload } from '@documenso/lib/server-only/envelope-upload/delete-upload';

import { ZGenericSuccessResponse } from '../../schema';
import { procedure } from '../../trpc';
import { deleteUploadMeta, ZDeleteUploadRequestSchema, ZDeleteUploadResponseSchema } from './delete-upload.types';

// Note that this is an unauthenticated public procedure route, secured by the recipient token.
export const deleteUploadRoute = procedure
  .meta(deleteUploadMeta)
  .input(ZDeleteUploadRequestSchema)
  .output(ZDeleteUploadResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { id, token } = input;

    ctx.logger.info({
      input: { id },
    });

    await deleteUpload({
      id,
      token,
    });

    return ZGenericSuccessResponse;
  });
