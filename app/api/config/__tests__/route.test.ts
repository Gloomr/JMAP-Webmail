import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

async function getConfig() {
  vi.resetModules();
  const { GET } = await import('../route');
  return (await GET()).json();
}

describe('runtime config route: OAuth scopes', () => {
  beforeEach(() => {
    delete process.env.OAUTH_SCOPES;
  });

  it('requests offline_access by default so the IdP issues a refresh token', async () => {
    const config = await getConfig();

    expect(config.oauthScopes.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'email', 'profile', 'offline_access']),
    );
  });

  it('lets OAUTH_SCOPES replace the default scope list', async () => {
    process.env.OAUTH_SCOPES = 'openid email';

    const config = await getConfig();

    expect(config.oauthScopes).toBe('openid email');
  });

  it('falls back to the default when OAUTH_SCOPES is blank', async () => {
    process.env.OAUTH_SCOPES = '   ';

    const config = await getConfig();

    expect(config.oauthScopes).toContain('offline_access');
  });
});
