import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

export type FindUploadsByTokenOptions = {
  envelopeId: string;
  token: string;
};

export const findUploadsByToken = async ({ envelopeId, token }: FindUploadsByTokenOptions) => {
  const envelope = await prisma.envelope.findFirst({
    where: {
      id: envelopeId,
      recipients: {
        some: {
          token,
        },
      },
    },
  });

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Envelope not found',
    });
  }

  const recipient = await prisma.recipient.findFirst({
    where: {
      envelopeId,
      token,
    },
  });

  if (!recipient) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Recipient not found',
    });
  }

  return await prisma.envelopeUpload.findMany({
    where: {
      envelopeId,
      recipientId: recipient.id,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
};
