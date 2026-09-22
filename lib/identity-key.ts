import type { Identity } from './jmap/types';

/**
 * A JMAP identity id is unique within an account, not across them. Where
 * a server gives each shared mailbox the same internal id — support@,
 * info@ and billing@ all being identity "b" is what one does — a
 * selection that carries only the id resolves to whichever account is
 * listed first. The composer then springs back to that address on every
 * pick, and a send that got through would leave from the wrong mailbox.
 *
 * The account therefore travels with the selection, joined by a
 * character no JMAP id may contain (RFC 8620 §1.2 allows only
 * alphanumerics, `-` and `_`).
 */
export const IDENTITY_KEY_SEPARATOR = ':';

/** Context a key is resolved against: what the session holds right now. */
export interface IdentityLookup {
  /** The primary account's identities. */
  identities: Identity[];
  /** Every account's identities, including the primary account's. */
  identitiesByAccount: Record<string, Identity[]>;
  primaryAccountId: string | null;
  primaryIdentity: Identity | null;
}

/**
 * Builds the value a sender dropdown carries for one identity.
 *
 * @param accountId  The account that owns it, or null for the primary
 *                   account — whose identities need no qualifier and
 *                   whose keys therefore stay backwards compatible with
 *                   a bare id stored in a template.
 */
export function identityKey(accountId: string | null, identityId: string): string {
  return accountId ? `${accountId}${IDENTITY_KEY_SEPARATOR}${identityId}` : identityId;
}

/**
 * Resolves a dropdown value to the identity it names and the account
 * that owns it.
 *
 * A key with no separator is read as an identity of the primary account,
 * which is what a template saved before the account was part of the key
 * carries.
 *
 * @returns  `accountId` is null whenever the identity belongs to the
 *           primary account, which is the value `sendEmail` expects for
 *           an ordinary send; `identity` falls back to the primary one
 *           when the key names nothing that exists.
 */
export function resolveIdentityKey(
  key: string | null,
  lookup: IdentityLookup,
): { identity: Identity | null; accountId: string | null } {
  const { identities, identitiesByAccount, primaryAccountId, primaryIdentity } = lookup;
  if (!key) return { identity: primaryIdentity, accountId: null };

  const at = key.indexOf(IDENTITY_KEY_SEPARATOR);
  const namedAccountId = at < 0 ? null : key.slice(0, at);
  const identityId = at < 0 ? key : key.slice(at + 1);

  const owned = namedAccountId ? identitiesByAccount[namedAccountId] : undefined;
  const identity =
    (owned ?? identities).find((i) => i.id === identityId)
    ?? identities.find((i) => i.id === identityId)
    ?? primaryIdentity;

  return {
    identity,
    accountId:
      !namedAccountId || namedAccountId === primaryAccountId ? null : namedAccountId,
  };
}
