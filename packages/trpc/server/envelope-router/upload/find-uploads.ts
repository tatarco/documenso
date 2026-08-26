import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { findUploadsByTeam } from '@documenso/lib/server-only/envelope-upload/find-uploads-by-team';
import { findUploadsByToken } from '@documenso/lib/server-only/envelope-upload/find-uploads-by-token';

import { maybeAuthenticatedProcedure } from '../../trpc';
import { findUploadsMeta, ZFindUploadsRequestSchema, ZFindUploadsResponseSchema } from './find-uploads.types';

export const findUploadsRoute = maybeAuthenticatedProcedure
  .meta(findUploadsMeta)
  .input(ZFindUploadsRequestSchema)
  .output(ZFindUploadsResponseSchema)
  .query(async ({ input, ctx }) => {
    const { envelopeId, token } = input;

    ctx.logger.info({
      input: { envelopeId },
    });

    if (token) {
      const data = await findUploadsByToken({ envelopeId, token });

      return {
        data,
      };
    }

    const { teamId } = ctx;
    const userId = ctx.user?.id;

    if (!userId || !teamId) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'You must be authenticated to access this resource',
      });
    }

    const data = await findUploadsByTeam({ envelopeId, teamId, userId });

    return {
      data,
    };
  });
