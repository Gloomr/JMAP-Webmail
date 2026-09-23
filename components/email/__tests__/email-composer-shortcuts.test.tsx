import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmailComposer } from '@/components/email/email-composer';

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    client: { uploadBlob: vi.fn(), createDraft: vi.fn() },
    identities: [],
    primaryIdentity: { id: 'id1', email: 'me@example.com', name: 'Me' },
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
vi.mock('@/components/templates/template-picker', () => ({
  TemplatePicker: () => <div data-testid="template-picker" />,
}));

describe('the template shortcut and the letter', () => {
  it('leaves a "t" typed into the letter alone', () => {
    render(<EmailComposer onSend={vi.fn()} />);
    // The letter is written in a contentEditable — a div, to the key
    // event — so the shortcut cannot tell it from the page by its tag.
    const body = screen.getByRole('textbox', { name: 'body_placeholder' });
    body.focus();
    fireEvent.keyDown(body, { key: 't' });
    expect(screen.queryByTestId('template-picker')).toBeNull();
  });

  it('still opens the templates from a "t" pressed on the page', () => {
    render(<EmailComposer onSend={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: 't' });
    expect(screen.getByTestId('template-picker')).toBeInTheDocument();
  });
});
