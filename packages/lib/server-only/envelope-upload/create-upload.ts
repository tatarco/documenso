import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import {
  ENVELOPE_UPLOAD_MAX_SIZE_BYTES,
  ZEnvelopeUploadRequirementsSchema,
} from '@documenso/lib/types/envelope-upload';
import { putFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, SigningStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

export type CreateUploadOptions = {
  token: string;
  slotKey: string;
  fileName: string;
  mimeType: string;
  /**
   * Base64-encoded file contents.
   */
  fileBase64: string;
};

export const createUpload = async ({ token, slotKey, fileName, mimeType, fileBase64 }: CreateUploadOptions) => {
  const recipient = await prisma.recipient.findFirst({
    where: { token },
    include: { envelope: true },
  });

  if (!recipient) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Recipient not found',
    });
  }

  if (
    recipient.envelope.status === DocumentStatus.COMPLETED ||
    recipient.envelope.status === DocumentStatus.REJECTED
  ) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Uploads can not be modified after the document has been completed or rejected',
    });
  }

  if (recipient.signingStatus === SigningStatus.SIGNED) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Uploads can not be modified after the recipient has completed signing',
    });
  }

  const uploadRequirements = ZEnvelopeUploadRequirementsSchema.parse(recipient.uploadRequirements ?? []);

  const slot = uploadRequirements.find((requirement) => requirement.key === slotKey);

  if (!slot) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: `Upload slot "${slotKey}" is not declared for this recipient`,
    });
  }

  if (!slot.accept.includes(mimeType as (typeof slot.accept)[number])) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `File type "${mimeType}" is not allowed for this upload slot`,
    });
  }

  const binaryData = Uint8Array.from(Buffer.from(fileBase64, 'base64'));

  const maxSizeBytes = Math.min(slot.maxSizeBytes, ENVELOPE_UPLOAD_MAX_SIZE_BYTES);

  if (binaryData.byteLength > maxSizeBytes) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `File exceeds the maximum allowed size of ${maxSizeBytes} bytes`,
    });
  }

  const sha256 = createHash('sha256').update(binaryData).digest('hex');

  const { type, data } = await putFileServerSide({
    name: fileName,
    type: mimeType,
    arrayBuffer: async () =>
      Promise.resolve(binaryData.buffer.slice(binaryData.byteOffset, binaryData.byteOffset + binaryData.byteLength)),
  });

  const existingUpload = await prisma.envelopeUpload.findUnique({
    where: {
      recipientId_slotKey: {
        recipientId: recipient.id,
        slotKey,
      },
    },
  });

  const documentData = await prisma.documentData.create({
    data: {
      type,
      data,
      initialData: data,
    },
  });

  const upload = await prisma.$transaction(async (tx) => {
    if (existingUpload) {
      await tx.envelopeUpload.delete({
        where: { id: existingUpload.id },
      });

      await tx.documentData.delete({
        where: { id: existingUpload.documentDataId },
      });
    }

    return await tx.envelopeUpload.create({
      data: {
        envelopeId: recipient.envelopeId,
        recipientId: recipient.id,
        slotKey,
        originalFilename: fileName,
        mimeType,
        sizeBytes: binaryData.byteLength,
        sha256,
        documentDataId: documentData.id,
      },
    });
  });

  return upload;
};
