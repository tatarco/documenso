import { useMemo, useRef, useState } from 'react';

import { PDF_VIEWER_ERROR_MESSAGES } from '@documenso/lib/constants/pdf-viewer-i18n';
import { extractInitials } from '@documenso/lib/utils/recipient-formatter';
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

  const { envelope, recipientFields, recipientFieldsRemaining, signField, fullName, signature, setSignature } =
    useRequiredEnvelopeSigningContext();

  const [step, setStep] = useState<'read' | 'fill' | 'review'>('read');
  const [pendingFieldId, setPendingFieldId] = useState<number | null>(null);
  const [errorFieldId, setErrorFieldId] = useState<number | null>(null);
  const [draftValues, setDraftValues] = useState<Record<number, string>>({});

  const readScrollRef = useRef<HTMLDivElement>(null);
  const fillPreviewScrollRef = useRef<HTMLDivElement>(null);
  const reviewScrollRef = useRef<HTMLDivElement>(null);

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
    <div className={withFields ? 'pointer-events-none w-full' : 'w-full'}>
      <EnvelopePdfViewer
        scrollParentRef={scrollRef}
        customPageRenderer={withFields ? EnvelopeSignerPageRenderer : undefined}
        errorMessage={PDF_VIEWER_ERROR_MESSAGES.signing}
      />
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
   * STEP 3 - review: the filled document, then complete.
   */
  if (step === 'review') {
    return (
      <div className="flex h-full w-full flex-col">
        <div ref={reviewScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[820px] flex-col items-center px-2 py-4 sm:px-4">
            <h2 className="mb-4 w-full font-semibold text-foreground text-lg">
              <Trans>Review the filled document</Trans>
            </h2>
            {documentPreview(reviewScrollRef, true)}
          </div>
        </div>

        <div className="sticky bottom-0 z-30 border-border border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[820px] items-center justify-between gap-4">
            <Button variant="ghost" onClick={() => setStep('fill')}>
              <Trans>Back to form</Trans>
            </Button>

            <EnvelopeSignerCompleteDialog />
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
      {/* Read-only document preview (large screens only). */}
      <div
        ref={fillPreviewScrollRef}
        className="hidden min-h-0 flex-1 overflow-y-auto border-border border-e bg-muted/30 lg:block"
      >
        <div className="mx-auto flex w-full max-w-[780px] flex-col items-center px-4 py-4">
          {documentPreview(fillPreviewScrollRef, true)}
        </div>
      </div>

      {/* The form. */}
      <div className="min-h-0 w-full overflow-y-auto lg:w-[30rem] lg:flex-shrink-0">
        <div className="flex min-h-full flex-col px-3 py-4 sm:px-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-foreground text-base">{envelope.title}</h2>

            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setStep('read')}>
              <Trans>View document</Trans>
            </Button>
          </div>

          <div className="flex flex-col gap-y-4">
            {sortedFields.map((field) => (
              <div key={field.id}>
                <Label htmlFor={`field-${field.id}`} className="flex items-center gap-2 text-sm">
                  <span>{getFieldLabel(field)}</span>

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
                        (option, index) => (
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
                      (option, index) => (
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
            ))}
          </div>

          <div className="mt-6 border-border border-t pt-4">
            <Button
              className="w-full"
              size="lg"
              disabled={recipientFieldsRemaining.length > 0}
              onClick={() => setStep('review')}
            >
              <Trans>Continue to review</Trans>
            </Button>

            {recipientFieldsRemaining.length > 0 && (
              <p className="mt-2 text-center text-muted-foreground text-xs">
                <Plural value={recipientFieldsRemaining.length} one="1 Field Remaining" other="# Fields Remaining" />
              </p>
            )}
          </div>
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
      {options.map((option, index) => (
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
