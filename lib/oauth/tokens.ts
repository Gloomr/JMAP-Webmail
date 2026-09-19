// offline_access makes standards-compliant IdPs (Authentik, Keycloak, Entra) return a
// refresh token; without it every reload lands on the login page (#104).
// Stalwart ignores scopes it does not know and always issues one on the code grant.
export const DEFAULT_OAUTH_SCOPES = 'openid email profile offline_access';

export function resolveOAuthScopes(raw: string | undefined): string {
  const scopes = raw?.trim();
  return scopes || DEFAULT_OAUTH_SCOPES;
}
export const REFRESH_TOKEN_COOKIE = 'jmap_rt';
export const ID_TOKEN_COOKIE = 'jmap_idt';
