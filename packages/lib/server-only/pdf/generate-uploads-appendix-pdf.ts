import { PDF } from '@libpdf/core';

const PAGE_WIDTH = 595.28; // A4 width in points.
const PAGE_HEIGHT = 841.89; // A4 height in points.

export type UploadsAppendixEntry = {
  slotLabel: string;
  originalFilename: string;
  mimeType: string;
  sha256: string;
  uploadedAt: Date;
  bytes: Uint8Array;
};

/**
 * Builds the "uploaded files" appendix appended to the sealed PDF, after the
 * certificate and audit log pages (design doc §1.3/§2): one generated index
 * page listing slot label / filename / sha256 / upload timestamp, followed
 * by each uploaded file rendered as a full page (PDF pages copied in,
 * images embedded onto a page sized to the image).
 *
 * Returns null when there are no uploads, so callers can skip the append
 * entirely (mirrors how `certificateDoc`/`auditLogDoc` are nullable).
 */
export const generateUploadsAppendixPdf = async (uploads: UploadsAppendixEntry[]): Promise<PDF | null> => {
  if (uploads.length === 0) {
    return null;
  }

  const pdf = PDF.create();

  const indexPage = pdf.addPage({ width: PAGE_WIDTH, height: PAGE_HEIGHT });

  indexPage.drawText('Uploaded files', { x: 50, y: PAGE_HEIGHT - 60, size: 16 });

  let y = PAGE_HEIGHT - 100;

  for (const upload of uploads) {
    if (y < 100) {
      break;
    }

    indexPage.drawText(upload.slotLabel, { x: 50, y, size: 11 });
    indexPage.drawText(upload.originalFilename, { x: 50, y: y - 15, size: 9 });
    indexPage.drawText(`SHA-256: ${upload.sha256}`, { x: 50, y: y - 29, size: 8 });
    indexPage.drawText(upload.uploadedAt.toISOString(), { x: 50, y: y - 43, size: 8 });

    y -= 75;
  }

  for (const upload of uploads) {
    if (upload.mimeType === 'application/pdf') {
      const uploadDoc = await PDF.load(upload.bytes);

      await pdf.copyPagesFrom(
        uploadDoc,
        Array.from({ length: uploadDoc.getPageCount() }, (_, index) => index),
      );

      continue;
    }

    const image = pdf.embedImage(upload.bytes);

    const page = pdf.addPage({ width: image.widthInPoints, height: image.heightInPoints });

    page.drawImage(image, { x: 0, y: 0, width: image.widthInPoints, height: image.heightInPoints });
  }

  return pdf;
};
