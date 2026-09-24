"use client";

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { EDGE_CHALLENGE_EVENT } from '@/lib/jmap/edge-challenge';
import { toast } from '@/stores/toast-store';

/** When the last automatic reload happened, per tab. */
const LAST_RELOAD_KEY = 'gloomr.edgeChallengeReloadAt';
/** A second challenge inside this window means the reload did not help. */
const LOOP_WINDOW_MS = 60_000;
/** Long enough to read the notice, short enough not to wait for it. */
const RELOAD_DELAY_MS = 1500;

/**
 * Reloads the page when a JMAP call was answered with the edge's
 * challenge, so the browser can pass it and carry on.
 *
 * Reloads at most once a minute on its own. A second challenge inside
 * that window means something other than an expired pass is wrong, and
 * the notice then stays with a button instead of reloading in a loop.
 */
export function EdgeChallengeProvider() {
  const t = useTranslations('login');

  useEffect(() => {
    let pending = false;
    const onChallenge = () => {
      if (pending) return;
      pending = true;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0);
      } catch {
        last = 0;
      }
      if (Date.now() - last < LOOP_WINDOW_MS) {
        toast.warning(t('edge_challenge_title'), {
          message: t('edge_challenge_stuck'),
          duration: 0,
          action: { label: t('edge_challenge_reload'), onClick: () => window.location.reload() },
        });
        return;
      }
      toast.info(t('edge_challenge_title'), { message: t('edge_challenge_message') });
      try {
        sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
      } catch {
        // A tab without storage reloads without the loop guard.
      }
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    };
    window.addEventListener(EDGE_CHALLENGE_EVENT, onChallenge);
    return () => window.removeEventListener(EDGE_CHALLENGE_EVENT, onChallenge);
  }, [t]);

  return null;
}
