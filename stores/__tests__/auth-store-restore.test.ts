import { describe, it, expect, vi, beforeEach } from 'vitest';

/** The one thing the restore does with the client that decides the outcome. */
const connect = vi.fn<() => Promise<void>>();

vi.mock('@/lib/jmap/client', () => {
  class JMAPClient {
    connect = connect;
    getIdentities = async () => [];
    getPrimaryAccountId = () => 'a';
    getAccountIds = () => ['a'];
    supportsContacts = () => false;
    supportsVacationResponse = () => false;
    supportsCalendars = () => false;
    supportsSieve = () => false;
    disconnect = () => {};
    static withBearer = () => new JMAPClient();
  }
  return { JMAPClient };
});

import { useAuthStore } from '@/stores/auth-store';

/** A remembered basic session, as the store finds it after a reload. */
function remembered() {
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    client: null,
    authMode: 'basic',
    rememberMe: true,
    serverUrl: 'https://mail.example',
    username: 'kevin@gloomr.com',
    restorePending: false,
  });
}

beforeEach(() => {
  sessionStorage.clear();
  connect.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({ serverUrl: 'https://mail.example', username: 'kevin@gloomr.com', password: 'pw' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
});

describe('restoring a remembered session', () => {
  it('keeps the sign-in when the server did not answer, and says so', async () => {
    remembered();
    connect.mockRejectedValue(new Error('Request failed: 502 - Bad Gateway'));

    await useAuthStore.getState().checkAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.restorePending).toBe(true);
    expect(state.username).toBe('kevin@gloomr.com');
    expect(state.serverUrl).toBe('https://mail.example');
    expect(state.rememberMe).toBe(true);
    expect(sessionStorage.getItem('server_unreachable')).toBe('true');
    expect(sessionStorage.getItem('session_expired')).toBeNull();
  });

  it('clears the sign-in when the server refused it', async () => {
    remembered();
    connect.mockRejectedValue(new Error('Failed to get session: 401'));

    await useAuthStore.getState().checkAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.restorePending).toBe(false);
    expect(state.username).toBeNull();
    expect(state.rememberMe).toBe(false);
    expect(sessionStorage.getItem('session_expired')).toBe('true');
    expect(sessionStorage.getItem('server_unreachable')).toBeNull();
  });

  it('tries a pending restore again, and signs in when the server is back', async () => {
    remembered();
    useAuthStore.setState({ isAuthenticated: false, restorePending: true });
    connect.mockResolvedValue(undefined);

    await useAuthStore.getState().checkAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.restorePending).toBe(false);
    expect(state.client).not.toBeNull();
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
