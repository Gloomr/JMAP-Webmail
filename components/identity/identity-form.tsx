'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Identity, EmailAddress } from '@/lib/jmap/types';
import { getEmailValidationError, validateEmailList } from '@/lib/validation';

// The signature is not part of the form. Every message leaves through the
// render gateway, which sets letterhead, signature and footer from the
// sender's GLOOMR profile and refuses `Identity/set` on the signature
// fields, so a value typed here could neither be saved nor ever be seen.
interface IdentityFormData {
  name: string;
  email: string;
  replyTo?: EmailAddress[];
  bcc?: EmailAddress[];
}

interface IdentityFormProps {
  identity?: Identity;
  onSave: (data: IdentityFormData) => Promise<void>;
  onCancel: () => void;
}

export function IdentityForm({ identity, onSave, onCancel }: IdentityFormProps) {
  const t = useTranslations('identities.form');
  const tValidation = useTranslations('identities.validation_errors');
  const isEditing = !!identity;

  const [formData, setFormData] = useState<IdentityFormData>({
    name: identity?.name || '',
    email: identity?.email || '',
    replyTo: identity?.replyTo,
    bcc: identity?.bcc,
  });

  const [replyToInput, setReplyToInput] = useState(
    identity?.replyTo?.map(a => a.email).join(', ') || ''
  );
  const [bccInput, setBccInput] = useState(
    identity?.bcc?.map(a => a.email).join(', ') || ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parseEmailList = (input: string): EmailAddress[] | undefined => {
    if (!input.trim()) return undefined;

    const emails = input.split(',').map(e => e.trim()).filter(Boolean);
    return emails.map(email => ({ email }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('name_required');
    }

    // Use secure email validation
    const emailError = getEmailValidationError(formData.email);
    if (emailError) {
      newErrors.email = emailError;
    }

    // Validate reply-to email list
    if (replyToInput.trim()) {
      const validation = validateEmailList(replyToInput);
      if (!validation.valid) {
        newErrors.replyTo = tValidation('invalid_emails', { emails: validation.invalidEmails.join(', ') });
      }
    }

    // Validate bcc email list
    if (bccInput.trim()) {
      const validation = validateEmailList(bccInput);
      if (!validation.valid) {
        newErrors.bcc = tValidation('invalid_emails', { emails: validation.invalidEmails.join(', ') });
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      await onSave({
        ...formData,
        replyTo: parseEmailList(replyToInput),
        bcc: parseEmailList(bccInput),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="identity-name" className="block text-sm font-medium mb-1">
          {t('name_label')} <span className="text-destructive">*</span>
        </label>
        <Input
          id="identity-name"
          type="text"
          maxLength={256}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={t('name_placeholder')}
          disabled={isSubmitting}
          className={errors.name ? 'border-destructive' : ''}
          aria-describedby={errors.name ? 'name-error' : undefined}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p
            id="name-error"
            className="text-sm text-destructive mt-1"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
          >
            {errors.name}
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="identity-email" className="block text-sm font-medium mb-1">
          {t('email_label')} <span className="text-destructive">*</span>
        </label>
        <Input
          id="identity-email"
          type="email"
          maxLength={254}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder={t('email_placeholder')}
          disabled={isSubmitting || isEditing}
          className={errors.email ? 'border-destructive' : ''}
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={!!errors.email}
        />
        {isEditing && (
          <p className="text-sm text-muted-foreground mt-1">
            {t('email_immutable')}
          </p>
        )}
        {errors.email && (
          <p
            id="email-error"
            className="text-sm text-destructive mt-1"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
          >
            {errors.email}
          </p>
        )}
      </div>

      {/* Reply-To */}
      <div>
        <label htmlFor="identity-reply-to" className="block text-sm font-medium mb-1">
          {t('reply_to_label')}
        </label>
        <Input
          id="identity-reply-to"
          type="text"
          maxLength={512}
          value={replyToInput}
          onChange={(e) => setReplyToInput(e.target.value)}
          placeholder={t('reply_to_placeholder')}
          disabled={isSubmitting}
          className={errors.replyTo ? 'border-destructive' : ''}
          aria-describedby={errors.replyTo ? 'reply-to-error' : undefined}
          aria-invalid={!!errors.replyTo}
        />
        {errors.replyTo && (
          <p
            id="reply-to-error"
            className="text-sm text-destructive mt-1"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
          >
            {errors.replyTo}
          </p>
        )}
      </div>

      {/* BCC */}
      <div>
        <label htmlFor="identity-bcc" className="block text-sm font-medium mb-1">
          {t('bcc_label')}
        </label>
        <Input
          id="identity-bcc"
          type="text"
          maxLength={512}
          value={bccInput}
          onChange={(e) => setBccInput(e.target.value)}
          placeholder={t('bcc_placeholder')}
          disabled={isSubmitting}
          className={errors.bcc ? 'border-destructive' : ''}
          aria-describedby={errors.bcc ? 'bcc-error' : undefined}
          aria-invalid={!!errors.bcc}
        />
        {errors.bcc && (
          <p
            id="bcc-error"
            className="text-sm text-destructive mt-1"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
          >
            {errors.bcc}
          </p>
        )}
      </div>

      {/* Signature — managed, not editable */}
      <div>
        <div className="block text-sm font-medium mb-1">{t('signature_label')}</div>
        <p
          className="rounded-md border border-dashed border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
          data-testid="identity-signature-managed"
        >
          {t('signature_managed')}
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditing
              ? t('updating')
              : t('creating')
            : t('save')}
        </Button>
      </div>
    </form>
  );
}
