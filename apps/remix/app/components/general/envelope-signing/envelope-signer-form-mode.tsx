import { useEffect, useMemo, useRef, useState } from 'react';

import { PDF_VIEWER_ERROR_MESSAGES } from '@documenso/lib/constants/pdf-viewer-i18n';
import { ZEnvelopeUploadRequirementsSchema } from '@documenso/lib/types/envelope-upload';
import { extractInitials } from '@documenso/lib/utils/recipient-formatter';
import { trpc } from '@documenso/trpc/react';
import { FieldType } from '@prisma/client';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@documenso/ui/primitives/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@documenso/ui/primitives/select';
import { SignaturePadDialog } from '@documenso/ui/primitives/signature-pad/signature-pad-dialog';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { CheckIcon, Loader2Icon, PenLineIcon } from 'lucide-react';

import { EnvelopeSignerPageRenderer } from '~/components/general/envelope-signing/envelope-signer-page-renderer';
import { EnvelopePdfViewer } from '~/components/general/pdf-viewer/envelope-pdf-viewer';

import { EnvelopeSignerCompleteDialog } from './envelope-signing-complete-dialog';
import type { EnvelopeUploadSlotUpload } from './envelope-upload-slot';
import { EnvelopeUploadSlot } from './envelope-upload-slot';

import { useRequiredEnvelopeSigningContext } from '../document-signing/envelope-signing-provider';

/**
 * Form-style signing (FillFaster-style), activated via `?view=form`.
 *
 * Flow: the signer READS the document first (plain, non-interactive preview),
 * then continues to a labeled vertical form. On large screens the fill step
 * shows the read-only document beside the form; on small screens the form
 * stands alone with a toggle back to the document.
 */
export default function EnvelopeSignerFormMode() {
  const { t } = useLingui();

  const { envelope, recipient, recipientFields, recipientFieldsRemaining, signField, fullName, signature, setSignature } =
    useRequiredEnvelopeSigningContext();

  const [step, setStep] = useState<'read' | 'fill'>('read');
  const [pendingFieldId, setPendingFieldId] = useState<number | null>(null);
  const [errorFieldId, setErrorFieldId] = useState<number | null>(null);
  const [draftValues, setDraftValues] = useState<Record<number, string>>({});

  /**
   * Recipient-level file upload slots (design doc §2) - form-mode only,
   * not PDF-page fields, so they live outside `recipientFields`/`signField`.
   */
  const uploadRequirements = useMemo(
    () => ZEnvelopeUploadRequirementsSchema.parse(recipient.uploadRequirements ?? []),
    [recipient.uploadRequirements],
  );

  const [uploads, setUploads] = useState<EnvelopeUploadSlotUpload[]>([]);

  const { data: uploadsData } = trpc.envelope.upload.find.useQuery(
    { envelopeId: envelope.id, token: recipient.token },
    { enabled: uploadRequirements.length > 0 },
  );

  useEffect(() => {
    if (uploadsData) {
      setUploads(uploadsData.data);
    }
  }, [uploadsData]);

  const requiredUploadsRemaining = uploadRequirements.filter(
    (requirement) => requirement.required && !uploads.some((upload) => upload.slotKey === requirement.key),
  ).length;

  const readScrollRef = useRef<HTMLDivElement>(null);
  const fillPreviewScrollRef = useRef<HTMLDivElement>(null);

  const sortedFields = useMemo(() => {
    return [...recipientFields]
      .filter((field) => !field.fieldMeta?.readOnly)
      .sort((a, b) => {
        if (a.envelopeItemId !== b.envelopeItemId) {
          return (a.envelopeItemId ?? '') < (b.envelopeItemId ?? '') ? -1 : 1;
        }

        if (a.page !== b.page) {
          return a.page - b.page;
        }

        const aY = Number(a.positionY);
        const bY = Number(b.positionY);

        if (Math.abs(aY - bY) > 1) {
          return aY - bY;
        }

        const rowDirection = envelope.documentMeta.language === 'he' ? -1 : 1;

        return rowDirection * (Number(a.positionX) - Number(b.positionX));
      });
  }, [recipientFields, envelope.documentMeta.language]);

  /**
   * Structured form entries parsed from a label convention:
   * - "Section :: Item"        -> collapsible section group
   * - "Group :: #N :: Item"    -> repeating group (add-one-at-a-time)
   * - anything else            -> flat field
   * A group renders at the position of its first field, keeping table clusters together.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formEntries = useMemo<any[]>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repeats = new Map<string, any>();

    for (const field of sortedFields) {
      const meta = field.fieldMeta;
      const raw = (meta && 'label' in meta && meta.label) || '';
      const parts = raw.split(' :: ');

      if (parts.length === 3 && parts[1].startsWith('#')) {
        const n = Number(parts[1].slice(1)) || 0;
        let group = repeats.get(parts[0]);

        if (!group) {
          group = { kind: 'repeat', title: parts[0], instances: [] };
          repeats.set(parts[0], group);
          entries.push(group);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let inst = group.instances.find((i: any) => i.n === n);

        if (!inst) {
          inst = { n, fields: [] };
          group.instances.push(inst);
        }

        inst.fields.push({ field, sub: parts[2] });
      } else if (parts.length === 2) {
        let group = sections.get(parts[0]);

        if (!group) {
          group = { kind: 'section', title: parts[0], fields: [] };
          sections.set(parts[0], group);
          entries.push(group);
        }

        group.fields.push({ field, sub: parts[1] });
      } else {
        entries.push({ kind: 'field', field });
      }
    }

    for (const g of repeats.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      g.instances.sort((a: any, b: any) => a.n - b.n);
    }

    return entries;
  }, [sortedFields]);

  const [visibleExtra, setVisibleExtra] = useState<Record<string, number[]>>({});

  /**
   * Scroll the FORM (not the PDF) to the next required unfilled field,
   * revealing its repeat instance / section if collapsed.
   */
  const scrollToNextUploadSlot = () => {
    const next = uploadRequirements.find(
      (requirement) => requirement.required && !uploads.some((upload) => upload.slotKey === requirement.key),
    );

    if (!next) {
      return;
    }

    setTimeout(() => {
      document
        .querySelector(`[data-upload-slot-anchor="${next.key}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const scrollToNextFormField = () => {
    const next = recipientFieldsRemaining[0];

    if (!next) {
      scrollToNextUploadSlot();
      return;
    }

    const meta = next.fieldMeta;
    const raw = (meta && 'label' in meta && meta.label) || '';
    const parts = raw.split(' :: ');

    if (parts.length === 3 && parts[1].startsWith('#')) {
      const n = Number(parts[1].slice(1)) || 0;

      setVisibleExtra((prev) => ({
        ...prev,
        [parts[0]]: [...new Set([...(prev[parts[0]] ?? []), n])],
      }));
    }

    setTimeout(() => {
      const el = document.querySelector(`[data-field-anchor="${next.id}"]`);

      if (!el) {
        return;
      }

      const details = el.closest('details');

      if (details) {
        details.open = true;
      }

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const input = el.querySelector('input, [role="combobox"], button');

      if (input instanceof HTMLElement) {
        input.focus();
      }
    }, 80);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clearInstance = async (inst: any) => {
    for (const { field } of inst.fields) {
      if (!field.inserted) {
        continue;
      }

      const emptyValue =
        field.type === FieldType.CHECKBOX ? [] : field.type === FieldType.DATE ? false : null;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await signField(field.id, { type: field.type, value: emptyValue } as any);
      } catch {
        // leave the field as-is; the inline error surface on the field covers it
      }
    }
  };

  const commitField = async (
    field: (typeof sortedFields)[number],
    value: string | number | number[] | boolean | null,
  ) => {
    setPendingFieldId(field.id);
    setErrorFieldId(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await signField(field.id, { type: field.type, value } as any);
    } catch (err) {
      setErrorFieldId(field.id);
      throw err;
    } finally {
      setPendingFieldId(null);
    }
  };

  const getFieldLabel = (field: (typeof sortedFields)[number]) => {
    const meta = field.fieldMeta;

    if (meta && 'label' in meta && meta.label) {
      return meta.label;
    }

    switch (field.type) {
      case FieldType.SIGNATURE:
        return t`Signature`;
      case FieldType.NAME:
        return t`Full Name`;
      case FieldType.INITIALS:
        return t`Initials`;
      case FieldType.EMAIL:
        return t`Email`;
      case FieldType.DATE:
        return t`Date`;
      default:
        return t`Text`;
    }
  };

  const isFieldRequired = (field: (typeof sortedFields)[number]) => {
    const meta = field.fieldMeta;

    return Boolean(meta && 'required' in meta && meta.required) || field.type === FieldType.SIGNATURE;
  };

  const renderTextLikeField = (
    field: (typeof sortedFields)[number],
    inputType: 'text' | 'email' | 'number',
    defaultValue = '',
  ) => {
    const draft = draftValues[field.id] ?? (field.inserted ? field.customText : defaultValue) ?? '';

    return (
      <Input
        type={inputType}
        dir="auto"
        id={`field-${field.id}`}
        name={`field-${field.id}`}
        className="mt-1.5 bg-background"
        value={draft}
        disabled={pendingFieldId === field.id}
        onChange={(e) => setDraftValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
        onBlur={async () => {
          const value = (draftValues[field.id] ?? '').trim();

          if (value && value !== field.customText) {
            await commitField(field, value);
          }
        }}
      />
    );
  };

  const documentPreview = (scrollRef: React.RefObject<HTMLDivElement | null>, withFields = false) => (
    <div className={withFields ? 'form-mode-preview pointer-events-none w-full' : 'w-full'}>
      <EnvelopePdfViewer
        scrollParentRef={scrollRef}
        customPageRenderer={withFields ? EnvelopeSignerPageRenderer : undefined}
        errorMessage={PDF_VIEWER_ERROR_MESSAGES.signing}
      />
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderFieldBlock = (field: any, subLabel?: string) => (
    <div key={field.id} data-field-anchor={field.id}>
            <Label htmlFor={`field-${field.id}`} className="flex items-center gap-2 text-sm">
              <span>{subLabel ?? getFieldLabel(field)}</span>

              {isFieldRequired(field) && !field.inserted && (
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              )}

              {field.inserted && <CheckIcon className="h-4 w-4 text-primary" />}
              {pendingFieldId === field.id && <Loader2Icon className="h-4 w-4 animate-spin" />}
            </Label>

            {errorFieldId === field.id && (
              <p className="mt-1 text-destructive text-xs">
                <Trans>Could not save the value. Please try again.</Trans>
              </p>
            )}

            {field.type === FieldType.TEXT && renderTextLikeField(field, 'text')}
            {field.type === FieldType.NUMBER && renderTextLikeField(field, 'number')}
            {field.type === FieldType.EMAIL && renderTextLikeField(field, 'email')}
            {field.type === FieldType.NAME && renderTextLikeField(field, 'text', fullName ?? '')}
            {field.type === FieldType.INITIALS &&
              renderTextLikeField(field, 'text', fullName ? extractInitials(fullName) : '')}

            {field.type === FieldType.DATE && (
              <div className="mt-1.5">
                <Button
                  type="button"
                  variant={field.inserted ? 'secondary' : 'outline'}
                  size="sm"
                  disabled={pendingFieldId === field.id}
                  onClick={async () => commitField(field, !field.inserted)}
                >
                  {field.inserted ? (field.customText ?? '') : <Trans>Insert date</Trans>}
                </Button>
              </div>
            )}

            {field.type === FieldType.DROPDOWN && (
              <Select
                value={field.inserted ? (field.customText ?? undefined) : undefined}
                disabled={pendingFieldId === field.id}
                onValueChange={async (value) => commitField(field, value)}
              >
                <SelectTrigger className="mt-1.5 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(field.fieldMeta && 'values' in field.fieldMeta ? (field.fieldMeta.values ?? []) : []).map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (option: any, index: number) => (
                      <SelectItem key={index} value={'value' in option ? option.value : String(index)}>
                        {'value' in option ? option.value : String(index)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            )}

            {field.type === FieldType.RADIO && (
              <RadioGroup
                className="mt-1.5 gap-2"
                value={field.inserted ? field.customText : undefined}
                disabled={pendingFieldId === field.id}
                onValueChange={async (value) => commitField(field, Number(value))}
              >
                {(field.fieldMeta && 'values' in field.fieldMeta ? (field.fieldMeta.values ?? []) : []).map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (option: any, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                      <RadioGroupItem id={`radio-${field.id}-${index}`} value={String(index)} />
                      <Label htmlFor={`radio-${field.id}-${index}`}>
                        {'value' in option ? option.value : String(index)}
                      </Label>
                    </div>
                  ),
                )}
              </RadioGroup>
            )}

            {field.type === FieldType.CHECKBOX && (
              <CheckboxFieldControl
                field={field}
                disabled={pendingFieldId === field.id}
                onCommit={async (indices) => commitField(field, indices)}
              />
            )}

            {field.type === FieldType.SIGNATURE && (
              <div className="mt-1.5 max-w-[16rem]">
                <SignaturePadDialog
                  disabled={pendingFieldId === field.id}
                  fullName={fullName}
                  value={signature ?? ''}
                  onChange={async (value) => {
                    setSignature(value ?? '');

                    if (value) {
                      await commitField(field, value);
                    }
                  }}
                  typedSignatureEnabled={envelope.documentMeta.typedSignatureEnabled}
                  uploadSignatureEnabled={envelope.documentMeta.uploadSignatureEnabled}
                  drawSignatureEnabled={envelope.documentMeta.drawSignatureEnabled}
                />
              </div>
            )}
    </div>
  );

  /**
   * STEP 1 - read the document before anything can be filled.
   */
  if (step === 'read') {
    return (
      <div className="flex h-full w-full flex-col">
        <div ref={readScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[820px] flex-col items-center px-2 py-4 sm:px-4">
            <h2 className="mb-4 w-full font-semibold text-foreground text-lg">{envelope.title}</h2>
            {documentPreview(readScrollRef)}
          </div>
        </div>

        <div className="sticky bottom-0 z-30 border-border border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[820px] items-center justify-between gap-4">
            <span className="text-muted-foreground text-sm">
              <Plural value={recipientFieldsRemaining.length} one="1 Field Remaining" other="# Fields Remaining" />
            </span>

            <Button size="lg" onClick={() => setStep('fill')}>
              <PenLineIcon className="mr-2 h-4 w-4" />
              <Trans>Continue to fill</Trans>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /**
   * STEP 2 - fill: form beside a read-only preview on large screens,
   * form alone on small screens.
   */
  return (
    <div className="flex h-full w-full">
      {/* The form - first in DOM so it sits on the start side (right for RTL documents). */}
      <div className="min-h-0 w-full overflow-y-auto border-border lg:w-[30rem] lg:flex-shrink-0 lg:border-e">
        <div className="flex min-h-full flex-col px-3 py-4 sm:px-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-foreground text-base">{envelope.title}</h2>

            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setStep('read')}>
              <Trans>View document</Trans>
            </Button>
          </div>

          <div className="flex flex-col gap-y-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {formEntries.map((entry: any) => {
              if (entry.kind === 'field') {
                return renderFieldBlock(entry.field);
              }

              if (entry.kind === 'section') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const isOpen = entry.fields.some(({ field }: any) => field.inserted || isFieldRequired(field));

                return (
                  <details key={entry.title} className="rounded-lg border border-border" open={isOpen}>
                    <summary className="cursor-pointer select-none px-3 py-2.5 font-medium text-sm">
                      {entry.title}
                      <span className="ms-2 text-muted-foreground text-xs">({entry.fields.length})</span>
                    </summary>
                    <div className="flex flex-col gap-y-4 border-border border-t px-3 pt-3 pb-3">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {entry.fields.map(({ field, sub }: any) => renderFieldBlock(field, sub))}
                    </div>
                  </details>
                );
              }

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const filledNs = entry.instances.filter((i: any) => i.fields.some(({ field }: any) => field.inserted)).map((i: any) => i.n);
              const visibleNs = [...new Set([...(visibleExtra[entry.title] ?? []), ...filledNs])].sort((a, b) => a - b);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const nextInstance = entry.instances.find((i: any) => !visibleNs.includes(i.n));

              return (
                <div key={entry.title} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{entry.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {visibleNs.length}/{entry.instances.length}
                    </span>
                  </div>

                  {visibleNs.length > 0 && (
                    <div className="mt-3 flex flex-col gap-y-3">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {entry.instances.filter((i: any) => visibleNs.includes(i.n)).map((inst: any) => (
                        <div key={inst.n} className="rounded-md border border-border/70 bg-muted/30 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-medium text-muted-foreground text-xs">
                              {entry.title} {inst.n}
                            </span>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-muted-foreground text-xs hover:text-destructive"
                              onClick={async () => {
                                await clearInstance(inst);
                                setVisibleExtra((prev) => ({
                                  ...prev,
                                  [entry.title]: (prev[entry.title] ?? []).filter((n) => n !== inst.n),
                                }));
                              }}
                            >
                              <Trans>Remove</Trans>
                            </Button>
                          </div>
                          <div className="flex flex-col gap-y-3">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {inst.fields.map(({ field, sub }: any) => renderFieldBlock(field, sub))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {nextInstance && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        setVisibleExtra((prev) => ({
                          ...prev,
                          [entry.title]: [...(prev[entry.title] ?? []), nextInstance.n],
                        }))
                      }
                    >
                      + <Trans>Add</Trans>
                    </Button>
                  )}
                </div>
              );
            })}

            {uploadRequirements.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <span className="font-medium text-sm">
                  <Trans>File uploads</Trans>
                </span>

                <div className="mt-3 flex flex-col gap-y-4">
                  {uploadRequirements.map((requirement) => (
                    <EnvelopeUploadSlot
                      key={requirement.key}
                      token={recipient.token}
                      slot={requirement}
                      upload={uploads.find((upload) => upload.slotKey === requirement.key)}
                      onUploaded={(upload) =>
                        setUploads((prev) => [...prev.filter((u) => u.slotKey !== upload.slotKey), upload])
                      }
                      onRemoved={(slotKey) => setUploads((prev) => prev.filter((u) => u.slotKey !== slotKey))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col items-stretch gap-2 border-border border-t pt-4 [&_button]:w-full">
            {recipientFieldsRemaining.length > 0 || requiredUploadsRemaining > 0 ? (
              <>
                <Button type="button" size="lg" onClick={() => scrollToNextFormField()}>
                  <Trans>Next Field</Trans>
                </Button>

                <p className="text-center text-muted-foreground text-xs">
                  <Plural
                    value={recipientFieldsRemaining.length + requiredUploadsRemaining}
                    one="1 Field Remaining"
                    other="# Fields Remaining"
                  />
                </p>
              </>
            ) : (
              <EnvelopeSignerCompleteDialog />
            )}
          </div>
        </div>
      </div>

      {/* Read-only document preview (large screens only). */}
      <div
        ref={fillPreviewScrollRef}
        className="hidden min-h-0 flex-1 overflow-y-auto bg-muted/30 lg:block"
      >
        <div className="mx-auto flex w-full max-w-[780px] flex-col items-center px-4 py-4">
          {documentPreview(fillPreviewScrollRef, true)}
        </div>
      </div>
    </div>
  );
}

type CheckboxFieldControlProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: any;
  disabled: boolean;
  onCommit: (indices: number[]) => Promise<void>;
};

const CheckboxFieldControl = ({ field, disabled, onCommit }: CheckboxFieldControlProps) => {
  const definedOptions: Array<{ value?: string; checked?: boolean }> =
    field.fieldMeta && 'values' in field.fieldMeta ? (field.fieldMeta.values ?? []) : [];

  // A checkbox field created via the API without explicit options still needs a
  // clickable control - fall back to a single unlabeled checkbox.
  const options = definedOptions.length > 0 ? definedOptions : [{ value: '' }];

  const [selected, setSelected] = useState<number[]>([]);

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {options.map(// eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (option: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <Checkbox
            id={`checkbox-${field.id}-${index}`}
            disabled={disabled}
            checked={selected.includes(index)}
            onCheckedChange={async (checked) => {
              const next = checked ? [...selected, index] : selected.filter((i) => i !== index);

              setSelected(next);
              await onCommit(next).catch(() => {
                setSelected(selected);
              });
            }}
          />
          {option.value && <Label htmlFor={`checkbox-${field.id}-${index}`}>{option.value}</Label>}
        </div>
      ))}
    </div>
  );
};
