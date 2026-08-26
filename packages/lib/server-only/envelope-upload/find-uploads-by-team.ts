import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';

export type FindUploadsByTeamOptions = {
  envelopeId: string;
  userId: number;
  teamId: number;
};

export const findUploadsByTeam = async ({ envelopeId, userId, teamId }: FindUploadsByTeamOptions) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id: { type: 'envelopeId', id: envelopeId },
    userId,
    teamId,
    type: null,
  });

  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
  });

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Envelope not found',
    });
  }

  return await prisma.envelopeUpload.findMany({
    where: {
      envelopeId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
};
