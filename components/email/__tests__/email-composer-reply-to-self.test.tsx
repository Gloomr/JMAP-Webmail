import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailComposer } from '@/components/email/email-composer';

const ME = { id: 'id1', email: 'kevin@gloomr.com', name: 'Kevin' };

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    client: { uploadBlob: vi.fn(), createDraft: vi.fn() },
    identities: [ME],
    primaryIdentity: ME,
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
    identitiesByAccount: { 'acc-info': [{ id: 'id-info', email: 'info@gloomr.com', name: 'Info' }] },
    primaryAccountId: null,
  }),
}));

const to = () => (screen.getByPlaceholderText('to_placeholder') as HTMLInputElement).value;

describe('answering a message', () => {
  it('goes to its sender', () => {
    render(
      <EmailComposer
        onSend={vi.fn()}
        mode="reply"
        replyTo={{
          from: [{ email: 'anna@example.org', name: 'Anna' }],
          to: [{ email: 'kevin@gloomr.com' }],
          subject: 'Hi', body: 'x', receivedAt: '2026-07-01T10:00:00Z',
        }}
      />,
    );
    expect(to()).toBe('anna@example.org');
  });

  it('goes to the people it was sent to when the message is our own', () => {
    // Replying to one's own mail continues the conversation; addressing
    // it back to oneself is a note nobody asked for.
    render(
      <EmailComposer
        onSend={vi.fn()}
        mode="reply"
        replyTo={{
          from: [{ email: 'kevin@gloomr.com', name: 'Kevin' }],
          to: [{ email: 'anna@example.org' }, { email: 'kevin@gloomr.com' }],
          subject: 'Re: Hi', body: 'x', receivedAt: '2026-07-01T10:00:00Z',
        }}
      />,
    );
    expect(to()).toBe('anna@example.org');
  });

  it('counts every address we send from as ours, shared ones included', () => {
    render(
      <EmailComposer
        onSend={vi.fn()}
        mode="replyAll"
        replyTo={{
          from: [{ email: 'info@gloomr.com', name: 'Info' }],
          to: [{ email: 'anna@example.org' }],
          cc: [{ email: 'kevin@gloomr.com' }, { email: 'bob@example.org' }],
          subject: 'Re: Hi', body: 'x', receivedAt: '2026-07-01T10:00:00Z',
        }}
      />,
    );
    expect(to()).toBe('anna@example.org');
    expect((screen.getByPlaceholderText('cc_placeholder') as HTMLInputElement).value).toBe('bob@example.org');
  });

  it('answers the sender rather than nobody when we wrote to ourselves', () => {
    render(
      <EmailComposer
        onSend={vi.fn()}
        mode="reply"
        replyTo={{
          from: [{ email: 'kevin@gloomr.com', name: 'Kevin' }],
          to: [{ email: 'kevin@gloomr.com' }],
          subject: 'Note', body: 'x', receivedAt: '2026-07-01T10:00:00Z',
        }}
      />,
    );
    expect(to()).toBe('kevin@gloomr.com');
  });
});
