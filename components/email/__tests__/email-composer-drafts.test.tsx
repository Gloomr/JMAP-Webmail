import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailComposer } from '@/components/email/email-composer';

const h = vi.hoisted(() => ({
  createDraft: vi.fn(),
  confirm: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    client: { uploadBlob: vi.fn().mockResolvedValue({ blobId: 'tree', size: 10, type: 'x' }), createDraft: h.createDraft },
    identities: [{ id: 'id1', email: 'kevin@gloomr.com', name: 'Kevin' }],
    primaryIdentity: { id: 'id1', email: 'kevin@gloomr.com', name: 'Kevin' },
  }),
}));
vi.mock('@/stores/contact-store', () => ({
  useContactStore: (selector: (s: unknown) => unknown) => selector({ getAutocomplete: () => [] }),
}));
vi.mock('@/stores/template-store', () => ({
  useTemplateStore: (selector: (s: unknown) => unknown) => selector({ addTemplate: vi.fn() }),
}));
vi.mock('@/stores/identity-store', () => ({
  useIdentityStore: () => ({
    subAddress: { recentTags: [], tagSuggestions: {} },
    addRecentTag: vi.fn(),
    addTagSuggestion: vi.fn(),
    getTagSuggestionsForDomain: () => [],
    identitiesByAccount: {},
    primaryAccountId: null,
  }),
}));
vi.mock('@/stores/toast-store', () => ({
  toast: { success: h.toastSuccess, error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/hooks/use-confirm-dialog', () => ({
  useConfirmDialog: () => ({ dialogProps: { open: false }, confirm: h.confirm }),
}));
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));

const DRAFT = {
  id: 'draft-1',
  to: ['anna@example.org'],
  cc: ['bob@example.org'],
  bcc: [],
  subject: 'Re: Angebot',
  body: 'Hallo Anna,\n\nOn x wrote:\n> alt',
  document: {
    v: 1 as const,
    signAs: 'house' as const,
    body: [{ t: 'h2' as const, c: [{ t: 'text' as const, v: 'Hallo Anna,' }] }],
    quoted: { attribution: 'On x wrote:', text: 'alt' },
  },
};

describe('a draft', () => {
  beforeEach(() => {
    h.createDraft.mockReset().mockResolvedValue('draft-2');
    h.confirm.mockReset().mockResolvedValue(false);
    h.toastSuccess.mockReset();
  });

  it('is kept when the composer is closed, and said so', async () => {
    const onClose = vi.fn();
    render(<EmailComposer onSend={vi.fn()} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('to_placeholder'), { target: { value: 'anna@example.org' } });
    fireEvent.change(screen.getByPlaceholderText('subject_placeholder'), { target: { value: 'Hi' } });

    // The X in the header: no question asked, the draft saved, the
    // composer gone. Losing what was written takes the discard button.
    const [closeButton] = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-x'));
    fireEvent.click(closeButton);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.createDraft).toHaveBeenCalledTimes(1);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.toastSuccess).toHaveBeenCalledWith('draft_saved');
  });

  it('is thrown away only after asking', async () => {
    const onClose = vi.fn();
    const onDiscardDraft = vi.fn();
    render(<EmailComposer onSend={vi.fn()} onClose={onClose} onDiscardDraft={onDiscardDraft} draft={DRAFT} />);

    fireEvent.click(screen.getByRole('button', { name: 'discard' }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    // Declined: nothing happens.
    expect(onDiscardDraft).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    h.confirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'discard' }));
    await waitFor(() => expect(onDiscardDraft).toHaveBeenCalledWith('draft-1'));
    expect(onClose).toHaveBeenCalled();
  });

  it('taken up again has everything that was saved, and its first save replaces it', async () => {
    render(<EmailComposer onSend={vi.fn()} draft={DRAFT} />);
    expect((screen.getByPlaceholderText('to_placeholder') as HTMLInputElement).value).toBe('anna@example.org');
    expect((screen.getByPlaceholderText('cc_placeholder') as HTMLInputElement).value).toBe('bob@example.org');
    expect((screen.getByPlaceholderText('subject_placeholder') as HTMLInputElement).value).toBe('Re: Angebot');
    // The document came back as a heading, not as flat prose.
    const body = screen.getByRole('textbox', { name: 'body_placeholder' });
    await waitFor(() => expect(body.querySelector('h2')?.textContent).toBe('Hallo Anna,'));

    fireEvent.change(screen.getByPlaceholderText('subject_placeholder'), { target: { value: 'Re: Angebot!' } });
    await waitFor(() => expect(h.createDraft).toHaveBeenCalled(), { timeout: 4000 });
    // The eighth argument is the draft the save replaces.
    expect(h.createDraft.mock.calls[0][7]).toBe('draft-1');
  });
});
