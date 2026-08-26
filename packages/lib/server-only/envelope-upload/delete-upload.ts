import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, SigningStatus } from '@prisma/client';

export type DeleteUploadOptions = {
  id: string;
  token: string;
};

export const deleteUpload = async ({ id, token }: DeleteUploadOptions) => {
  const upload = await prisma.envelopeUpload.findFirst({
    where: { id },
    include: {
      envelope: true,
      recipient: true,
    },
  });

  if (!upload || upload.recipient.token !== token) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Upload not found',
    });
  }

  if (upload.envelope.status === DocumentStatus.COMPLETED || upload.envelope.status === DocumentStatus.REJECTED) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Uploads can not be modified after the document has been completed or rejected',
    });
  }

  if (upload.recipient.signingStatus === SigningStatus.SIGNED) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Uploads can not be modified after the recipient has completed signing',
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.envelopeUpload.delete({
      where: { id },
    });

    await tx.documentData.delete({
      where: { id: upload.documentDataId },
    });
  });
};
