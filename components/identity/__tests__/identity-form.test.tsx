import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IdentityForm } from '@/components/identity/identity-form';
import type { Identity } from '@/lib/jmap/types';

const identity: Identity = {
  id: 'i1',
  name: 'Kevin',
  email: 'kevin@gloomr.com',
  textSignature: 'typed once, long ago',
  htmlSignature: '<p>typed once, long ago</p>',
  mayDelete: false,
};

describe('the identity form and the signature', () => {
  it('offers no signature field, and says why', () => {
    render(<IdentityForm identity={identity} onSave={vi.fn()} onCancel={vi.fn()} />);
    // The gateway sets the signature from the sender's profile and refuses
    // `Identity/set` on it; a textarea here would only ever fail on save.
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.getByTestId('identity-signature-managed')).toHaveTextContent('signature_managed');
  });

  it('saves without a signature, whatever the identity carries', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<IdentityForm identity={identity} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.submit(screen.getByRole('button', { name: 'save' }).closest('form')!);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.name).toBe('Kevin');
    expect(saved).not.toHaveProperty('textSignature');
    expect(saved).not.toHaveProperty('htmlSignature');
  });
});
