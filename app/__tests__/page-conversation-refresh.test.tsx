import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { Email } from '@/lib/jmap/types';

// Shared, hoisted mock refs (available inside vi.mock factories)
const h = vi.hoisted(() => {
  const original = {
    id: 'a-id', threadId: 'thread-a', subject: 'A', keywords: { $seen: true },
    receivedAt: '2026-07-01T10:00:00Z', mailboxIds: { 'mb-inbox': true }, hasAttachment: false, size: 1,
  };
  const reply = { ...original, id: 'b-id', receivedAt: '2026-07-01T11:00:00Z', mailboxIds: { 'mb-sent': true } };
  const later = { ...original, id: 'c-id', receivedAt: '2026-07-01T12:00:00Z', mailboxIds: { 'mb-sent': true } };
  return {
    original, reply, later,
    getEmail: vi.fn(),
    getThreadEmails: vi.fn(),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    /** Every `emails` array the conversation view was handed, in order. */
    rendered: [] as unknown[][],
    store: { lastPushUpdate: null as number | null },
  };
});

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-media-query', () => ({
  useDeviceDetection: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }));
vi.mock('@/hooks/use-favicon-badge', () => ({ useFaviconBadge: () => {} }));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    client: { closePushNotifications: vi.fn(), getEmail: h.getEmail, getThreadEmails: h.getThreadEmails },
    logout: vi.fn(),
    checkAuth: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  }),
}));

vi.mock('@/stores/email-store', () => {
  const store = Object.assign(h.store, {
    emails: [h.original],
    // non-empty mailboxes -> the mount loadData effect is skipped
    mailboxes: [{ id: 'mb-inbox', role: 'inbox', name: 'Inbox', unreadEmails: 0 }],
    selectedEmail: h.original,
    selectedMailbox: 'mb-inbox',
    quota: null,
    isPushConnected: false,
    newEmailNotification: null,
    selectEmail: vi.fn(),
    selectMailbox: vi.fn(),
    selectAllEmails: vi.fn(),
    clearSelection: vi.fn(),
    fetchMailboxes: vi.fn(),
    fetchEmails: vi.fn(),
    fetchQuota: vi.fn(),
    sendEmail: h.sendEmail,
    deleteEmail: vi.fn(),
    markAsRead: vi.fn(),
    toggleStar: vi.fn(),
    moveToMailbox: vi.fn(),
    moveThreadToMailbox: vi.fn(),
    searchEmails: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isLoading: false,
    isLoadingEmail: false,
    setLoadingEmail: vi.fn(),
    setPushConnected: vi.fn(),
    handleStateChange: vi.fn(),
    refreshCurrentMailbox: vi.fn().mockResolvedValue(undefined),
    clearNewEmailNotification: vi.fn(),
    markAsSpam: vi.fn(),
    undoSpam: vi.fn(),
    searchFilters: {},
    isAdvancedSearchOpen: false,
    setSearchFilters: vi.fn(),
    clearSearchFilters: vi.fn(),
    toggleAdvancedSearch: vi.fn(),
    advancedSearch: vi.fn(),
    fetchTagCounts: vi.fn(),
  });
  const useEmailStore = () => store;
  useEmailStore.getState = () => store;
  return { useEmailStore };
});

vi.mock('@/stores/identity-store', () => ({ useIdentityStore: () => ({ identities: [] }) }));
vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: Object.assign(() => ({}), { getState: () => ({ markAsReadDelay: -1 }) }),
}));
vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => ({
    activeView: 'list',
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    setActiveView: vi.fn(),
    tabletListVisible: true,
    setTabletListVisible: vi.fn(),
  }),
}));
vi.mock('@/stores/contact-store', () => ({
  useContactStore: () => ({ supportsSync: false, createContact: vi.fn(), addLocalContact: vi.fn() }),
}));

// EmailList double: one button opens the message, one opens a reply to it.
vi.mock('@/components/email/email-list', () => ({
  EmailList: (props: { onEmailSelect: (email: Email) => void; onReply: (email: Email) => void }) => (
    <>
      <button data-testid="open-a" onClick={() => props.onEmailSelect(h.original as Email)}>open A</button>
      <button data-testid="reply-a" onClick={() => props.onReply(h.original as Email)}>reply A</button>
    </>
  ),
}));

// The conversation view double shows which messages it was handed.
vi.mock('@/components/email/thread-conversation-view', () => ({
  ThreadConversationView: (props: { emails: Email[] }) => {
    h.rendered.push(props.emails);
    return <div data-testid="conversation">{props.emails.map((e) => e.id).join(',')}</div>;
  },
}));

// The composer double sends at once.
vi.mock('@/components/email/email-composer', () => ({
  EmailComposer: (props: { onSend: (data: object) => void }) => (
    <button data-testid="send" onClick={() => props.onSend({ to: ['x@example.org'], cc: [], bcc: [], subject: 'Re: A', body: 'b' })}>
      send
    </button>
  ),
}));

const { noop, passthrough } = vi.hoisted(() => ({
  noop: () => null,
  passthrough: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@/components/layout/sidebar', () => ({ Sidebar: noop }));
vi.mock('@/components/email/email-viewer', () => ({ EmailViewer: noop }));
vi.mock('@/components/layout/mobile-header', () => ({ MobileHeader: noop, MobileViewerHeader: noop }));
vi.mock('@/components/keyboard-shortcuts-modal', () => ({ KeyboardShortcutsModal: noop }));
vi.mock('@/components/layout/navigation-rail', () => ({ NavigationRail: noop }));
vi.mock('@/components/search/advanced-search-panel', () => ({ AdvancedSearchPanel: noop }));
vi.mock('@/components/ui/welcome-banner', () => ({ WelcomeBanner: noop }));
vi.mock('@/contexts/drag-drop-context', () => ({ DragDropProvider: passthrough }));
vi.mock('@/components/error', () => ({
  ErrorBoundary: passthrough,
  SidebarErrorFallback: noop,
  EmailListErrorFallback: noop,
  EmailViewerErrorFallback: noop,
  ComposerErrorFallback: noop,
}));

import Home from '@/app/[locale]/page';

/** Opens message A and waits for its two-message conversation to be on screen. */
async function openConversation() {
  const view = render(<Home />);
  fireEvent.click(await screen.findByTestId('open-a'));
  await waitFor(() => expect(screen.getByTestId('conversation')).toHaveTextContent('b-id,a-id'));
  return view;
}

describe('the open conversation follows what happens after it was opened', () => {
  beforeEach(() => {
    h.getEmail.mockReset().mockResolvedValue(h.original);
    h.getThreadEmails.mockReset().mockResolvedValueOnce([h.reply, h.original]);
    h.sendEmail.mockClear();
    h.rendered.length = 0;
    h.store.lastPushUpdate = null;
  });

  it('shows a message that arrived when a push says the account changed', async () => {
    h.getThreadEmails.mockResolvedValueOnce([h.later, h.reply, h.original]);
    const { rerender } = await openConversation();

    h.store.lastPushUpdate = Date.now();
    rerender(<Home />);

    await waitFor(() => expect(screen.getByTestId('conversation')).toHaveTextContent('c-id,b-id,a-id'));
    expect(h.getThreadEmails).toHaveBeenCalledTimes(2);
  });

  it('leaves the rendered list alone when the push brought the same conversation', async () => {
    // A fresh fetch is a new array of new objects; handing it on would
    // fold what the reader had expanded for nothing.
    h.getThreadEmails.mockResolvedValueOnce([{ ...h.reply }, { ...h.original }]);
    const { rerender } = await openConversation();
    const shown = h.rendered[h.rendered.length - 1];

    h.store.lastPushUpdate = Date.now();
    rerender(<Home />);

    await waitFor(() => expect(h.getThreadEmails).toHaveBeenCalledTimes(2));
    expect(h.rendered[h.rendered.length - 1]).toBe(shown);
  });

  it('shows the reply that was just sent from it', async () => {
    h.getThreadEmails.mockResolvedValueOnce([h.later, h.reply, h.original]);
    await openConversation();

    fireEvent.click(screen.getByTestId('reply-a'));
    fireEvent.click(await screen.findByTestId('send'));

    await waitFor(() => expect(h.sendEmail).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('conversation')).toHaveTextContent('c-id,b-id,a-id'));
  });
});
