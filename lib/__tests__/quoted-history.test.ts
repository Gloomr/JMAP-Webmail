import { describe, it, expect } from 'vitest';
import { collapseQuotedHistory, plainTextToSafeHtml, stripQuotedPreview } from '@/lib/email-sanitization';

describe('the words a list shows under the subject', () => {
  it('stops at the signature, the attribution and the quote — whichever comes first', () => {
    // What a server cuts from the text part of a reply, line breaks
    // flattened to spaces.
    expect(stripQuotedPreview('Entwurf-Test aus dem Browser. -- KEVIN GLOOMR kevin@gloomr.com On 23.9.2026, Kevin wrote: > Re: Nur'))
      .toBe('Entwurf-Test aus dem Browser.');
    expect(stripQuotedPreview('Danke, das passt. On 22.9.2026, 16:15:43, privat@example.org wrote: > Das hier'))
      .toBe('Danke, das passt.');
    expect(stripQuotedPreview('Passt. Am 22.09.2026 um 16:15 schrieb Anna: > alt')).toBe('Passt.');
    expect(stripQuotedPreview('Siehe unten. > zitiert')).toBe('Siehe unten.');
    expect(stripQuotedPreview('FYI ---------- Forwarded message ---------- From: X')).toBe('FYI');
  });

  it('leaves a preview alone that has nothing to cut, and one that is nothing but signature', () => {
    expect(stripQuotedPreview('Just the words, with a dash - in them.')).toBe('Just the words, with a dash - in them.');
    // Something rather than a blank line.
    expect(stripQuotedPreview('-- KEVIN GLOOMR')).toBe('-- KEVIN GLOOMR');
    expect(stripQuotedPreview(undefined)).toBe('');
  });
});

/** Parses the result the way the viewer will render it. */
function dom(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('folding the quoted history of an HTML message', () => {
  it('folds a cite blockquote and the attribution above it, and leaves the reply open', () => {
    const html =
      '<p>Danke, das passt.</p>' +
      '<div>On 22.9.2026, privat@example.org wrote:</div>' +
      '<blockquote type="cite">Das hier darf NUR in deinem Postfach liegen.</blockquote>';
    const root = dom(collapseQuotedHistory(html));
    const details = root.querySelector('details.quoted-history');
    expect(details).not.toBeNull();
    expect(details?.querySelector('summary')?.textContent).toBe('···');
    expect(details?.textContent).toContain('wrote:');
    expect(details?.textContent).toContain('darf NUR');
    // The reply itself stands before the fold, not inside it.
    expect(root.firstElementChild?.tagName).toBe('P');
    expect(root.firstElementChild?.textContent).toBe('Danke, das passt.');
  });

  it('folds what Gmail and Outlook leave, and everything after it', () => {
    const gmail = dom(collapseQuotedHistory(
      '<div>Hi</div><div class="gmail_quote"><div class="gmail_attr">On Mon, X wrote:</div><blockquote>old</blockquote></div><div>-- sig of the quoted</div>',
    ));
    expect(gmail.querySelector('details')?.textContent).toContain('sig of the quoted');
    expect(gmail.firstElementChild?.textContent).toBe('Hi');

    const outlook = dom(collapseQuotedHistory(
      '<div>Hi</div><hr><div id="divRplyFwdMsg"><b>From:</b> X</div><div>the old mail</div>',
    ));
    expect(outlook.querySelector('details')?.textContent).toContain('the old mail');
  });

  it('leaves a message alone that is nothing but quote, and one with no quote', () => {
    const onlyQuote = '<blockquote type="cite">forwarded words</blockquote>';
    expect(collapseQuotedHistory(onlyQuote)).toBe(onlyQuote);
    const plain = '<p>Hello</p>';
    expect(collapseQuotedHistory(plain)).toBe(plain);
  });

  it('folds our own letter\'s thread, which stands after the letter table', () => {
    const html =
      '<table><tr><td>the letter</td></tr></table>' +
      '<div>On 22.9.2026, privat wrote:</div>' +
      '<blockquote type="cite">earlier</blockquote>';
    const root = dom(collapseQuotedHistory(html));
    expect(root.firstElementChild?.tagName).toBe('TABLE');
    expect(root.querySelector('details blockquote')).not.toBeNull();
  });
});

describe('folding the quoted history of a plain-text message', () => {
  it('folds the trailing > lines with their attribution', () => {
    const text = 'Danke!\n\nOn Mon, X wrote:\n> old line one\n> old line two\n';
    const root = dom(plainTextToSafeHtml(text));
    expect(root.textContent?.startsWith('Danke!')).toBe(true);
    const details = root.querySelector('details.quoted-history');
    expect(details?.textContent).toContain('wrote:');
    expect(details?.textContent).toContain('> old line two');
  });

  it('shows a message that is only quote as it is, and touches no ordinary text', () => {
    expect(plainTextToSafeHtml('> only\n> quote')).not.toContain('<details');
    expect(plainTextToSafeHtml('a > b')).toBe('a &gt; b');
  });
});
