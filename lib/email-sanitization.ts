import DOMPurify from 'dompurify';

/**
 * Every link in a displayed message opens away from the application.
 *
 * A message is shown inside the webmail, and a plain `<a>` followed
 * there takes the mailbox with it: the reader is on the sender's site
 * with nothing left of what they were doing. Mail clients open links in
 * a new window as a matter of course; this is the same rule, applied
 * where the message is one element among many. `noopener noreferrer`
 * keeps the opened page from reaching back or learning where it came
 * from — that second part matters for a link a stranger sent.
 *
 * A hook rather than a config entry because DOMPurify has no "add this
 * attribute" option, and because it applies to every sanitize call in
 * the application at once — the viewer, the thread view, the signature
 * preview — without each caller remembering. Registered once, at module
 * load; `addHook` is absent where there is no DOM to hook.
 */
if (typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName !== 'A' || !node.hasAttribute('href')) return;
    const href = node.getAttribute('href') ?? '';
    // Only somewhere a new tab can go. A mailto: hands off to a mail
    // client and a same-document anchor scrolls; a target on either is
    // at best ignored and at worst a blank tab.
    if (!/^https?:\/\//i.test(href)) return;
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  });
}

/**
 * Unified DOMPurify configuration for email content
 * Blocks all script execution vectors while preserving formatting
 * NOTE: <style> tags are forbidden to prevent global CSS injection
 * Inline style attributes are still allowed for element-specific styling
 */
export const EMAIL_SANITIZE_CONFIG = {
  ADD_TAGS: [],
  ADD_ATTR: ['target', 'rel', 'style', 'class', 'width', 'height', 'align', 'valign', 'bgcolor', 'color'],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
  FORBID_TAGS: [
    'script', 'iframe', 'object', 'embed', 'form',
    'input', 'button', 'meta', 'link', 'base',
    'svg', 'math', 'style'
  ],
  FORBID_ATTR: [
    'onerror', 'onload', 'onclick', 'onmouseover',
    'onfocus', 'onblur', 'onchange', 'onsubmit',
    'onkeydown', 'onkeyup', 'onmousedown', 'onmouseup'
  ],
};

/**
 * Build a per-render DOMPurify config with FRESH FORBID_TAGS/FORBID_ATTR arrays.
 * Callers that block external content append to these arrays; copying by value
 * here prevents mutation of the shared module-level EMAIL_SANITIZE_CONFIG (which
 * would leak the untrusted-sender policy into all other sanitize calls and grow
 * the arrays without bound).
 */
export function buildEmailSanitizeConfig(blockExternal: boolean) {
  return {
    ...EMAIL_SANITIZE_CONFIG,
    FORBID_TAGS: blockExternal
      ? [...EMAIL_SANITIZE_CONFIG.FORBID_TAGS, 'link']
      : [...EMAIL_SANITIZE_CONFIG.FORBID_TAGS],
    FORBID_ATTR: blockExternal
      ? [...EMAIL_SANITIZE_CONFIG.FORBID_ATTR, 'background']
      : [...EMAIL_SANITIZE_CONFIG.FORBID_ATTR],
  };
}

/**
 * Sanitize email HTML content
 * @param html - Raw HTML content from email
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, EMAIL_SANITIZE_CONFIG);
}

/**
 * Sanitize HTML signature with stricter rules
 * Only allows basic formatting, no external resources
 */
export const SIGNATURE_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'span', 'div'],
  ALLOWED_ATTR: ['href', 'style', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img', 'video', 'audio'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
};

/**
 * Sanitize HTML signature for storage and display
 * @param html - User-provided HTML signature
 * @returns Sanitized signature (no scripts, no external resources)
 */
export function sanitizeSignatureHtml(html: string): string {
  if (!html?.trim()) return '';
  return DOMPurify.sanitize(html, SIGNATURE_SANITIZE_CONFIG);
}

/**
 * Safe HTML parsing without execution
 * Use instead of innerHTML for detection/parsing
 */
export function parseHtmlSafely(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

/**
 * Detect if HTML content has rich formatting
 * Safe alternative to innerHTML parsing
 */
export function hasRichFormatting(html: string): boolean {
  const doc = parseHtmlSafely(html);
  return !!doc.querySelector(
    'table, img, style, b, strong, i, em, u, font, ' +
    'div[style], span[style], p[style], ' +
    'h1, h2, h3, h4, h5, h6, ul, ol, blockquote'
  );
}

/**
 * Detect if HTML content needs iframe rendering for CSS isolation.
 * More narrow than hasRichFormatting() — only triggers on patterns
 * that can cause CSS bleed into the host app:
 * - table layouts (newsletter-style)
 * - style blocks (global CSS rules)
 * - link tags (external stylesheets)
 * - background/background-image in inline styles (complex rendering)
 */
export function needsIframeRendering(html: string): boolean {
  if (!html) return false;
  const doc = parseHtmlSafely(html);
  if (doc.querySelector('table, style, link[rel="stylesheet"]')) return true;
  const allElements = doc.querySelectorAll('[style]');
  for (const el of allElements) {
    const styleAttr = el.getAttribute('style') || '';
    if (/background(?:-image)?\s*:.*url\s*\(/i.test(styleAttr)) return true;
  }
  return false;
}

/**
 * Escape all five HTML-significant characters so the result is safe to
 * interpolate into both element text and attribute values. `&` MUST run
 * first, otherwise later substitutions get double-escaped.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a plain-text email body to HTML safe for direct rendering.
 * Escapes HTML-significant chars (including quotes, to prevent attribute
 * escape in the linkifier), preserves line breaks and tabs, and linkifies
 * http(s) URLs. Quotes inside URLs stay as entities — the browser decodes
 * them as part of the href value, never as attribute delimiters.
 */
export function plainTextToSafeHtml(
  text: string,
  options?: { linkClassName?: string }
): string {
  const linkClass = options?.linkClassName
    ? ` class="${escapeHtml(options.linkClassName)}"`
    : '';
  const render = (part: string) =>
    escapeHtml(part)
      .replace(/\r\n/g, '<br>')
      .replace(/\r/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
      .replace(
        /(https?:\/\/[^\s<]+)/g,
        `<a href="$1" target="_blank" rel="noopener noreferrer"${linkClass}>$1</a>`
      );
  // The quoted history under a reply folds behind a pill, as it does in
  // an HTML message; the words written stay open.
  const { head, tail } = splitQuotedText(text);
  if (!tail) return render(head);
  return (
    `${render(head.replace(/\s+$/, ''))}` +
    `<details class="quoted-history"><summary style="${FOLD_SUMMARY_STYLE}">···</summary>${render(tail)}</details>`
  );
}

/**
 * Collapse empty containers left behind when external images are blocked.
 * Walks up from each blocked img to find the nearest table cell or wrapper div
 * and hides it if it contains no meaningful visible content.
 */
export function collapseBlockedImageContainers(html: string): string {
  const doc = parseHtmlSafely(html);
  const blockedImages = doc.querySelectorAll('img[data-blocked-src]');

  blockedImages.forEach((img) => {
    let el: HTMLElement | null = img.parentElement;
    while (el && el !== doc.body) {
      if (el.tagName === 'TD' || el.tagName === 'TH' || (el.tagName === 'DIV' && el.parentElement?.tagName === 'TD')) {
        const hasVisibleText = el.textContent?.replace(/[\s\u00A0]+/g, '').trim();
        const hasVisibleMedia = el.querySelector('img:not([data-blocked-src]), video, canvas');
        const hasLinks = el.querySelector('a[href]');
        if (!hasVisibleText && !hasVisibleMedia && !hasLinks) {
          el.style.display = 'none';
          el.style.height = '0';
          el.style.padding = '0';
          el.style.overflow = 'hidden';
        }
        break;
      }
      if (el.tagName === 'TABLE' || el.tagName === 'TR') break;
      el = el.parentElement;
    }
  });

  return doc.body.innerHTML;
}

/**
 * Where a mail client leaves the history it quotes below a reply. Each is
 * a marker at the top of the quoted part; the history is that element
 * and everything after it.
 */
const QUOTE_MARKERS = [
  'blockquote[type="cite"]',       // Apple Mail, Thunderbird, and our own letters
  '.gmail_quote',
  '.gmail_quote_container',
  'div[id^="divRplyFwdMsg"]',      // Outlook: the rule above the quoted mail
  '#appendonsend',                 // Outlook mobile
  '.yahoo_quoted',
  '.moz-cite-prefix',
];

/** The line a client writes above a quote: "On …, X wrote:" in its languages. */
const ATTRIBUTION =
  /\b(wrote|schrieb|a écrit|escribió|ha scritto|schreef|napisał|escreveu|написал|написав)\b|^-{3,}.+-{3,}$/i;

/** The pill that stands in for folded history; styled inline, since it must survive any host. */
const FOLD_SUMMARY_STYLE =
  'cursor:pointer;display:inline-block;margin:10px 0 0;padding:0 10px;border-radius:9px;' +
  'background:#e5e7eb;color:#4b5563;font:600 12px/18px system-ui,sans-serif;letter-spacing:1px;user-select:none';

/**
 * Folds the quoted history at the end of a message behind a pill, the way
 * a mail client shows a reply: the new words open, what they answer one
 * click away. Operates on sanitized markup and adds only a `<details>`
 * around nodes that are already there.
 *
 * The fold starts at the first quote marker a client left, climbs to the
 * element under `<body>` that holds it, and takes the attribution line
 * above it along. A message that is nothing but history is left as it
 * is — folding everything shows nothing.
 */
export function collapseQuotedHistory(html: string): string {
  if (!html) return html;
  const doc = parseHtmlSafely(html);
  const body = doc.body;
  const markers = QUOTE_MARKERS
    .map((selector) => body.querySelector(selector))
    .filter((el): el is Element => el !== null);
  if (markers.length === 0) return html;
  const marker = markers.reduce((first, el) =>
    first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING ? el : first,
  );

  let start: Element = marker;
  while (start.parentElement && start.parentElement !== body) start = start.parentElement;
  const above = start.previousElementSibling;
  if (above && ATTRIBUTION.test(above.textContent ?? '') && (above.textContent ?? '').length < 300) {
    start = above;
  }

  let wordsBefore = '';
  for (let node = start.previousSibling; node; node = node.previousSibling) {
    wordsBefore += node.textContent ?? '';
  }
  if (!wordsBefore.trim()) return html;

  const details = doc.createElement('details');
  details.className = 'quoted-history';
  const summary = doc.createElement('summary');
  summary.textContent = '···';
  summary.setAttribute('style', FOLD_SUMMARY_STYLE);
  details.appendChild(summary);
  let node: Node | null = start;
  while (node) {
    const next: Node | null = node.nextSibling;
    details.appendChild(node);
    node = next;
  }
  body.appendChild(details);
  return body.innerHTML;
}

/**
 * Splits a plain-text message into the words written and the history
 * quoted under them: the run of `>` lines at the end, with the
 * attribution line above it. Nothing is split when the message is
 * nothing but quote.
 */
function splitQuotedText(text: string): { head: string; tail: string } {
  const lines = text.split(/\r\n|\r|\n/);
  let at = lines.length;
  while (at > 0 && (lines[at - 1].trim() === '' || lines[at - 1].startsWith('>'))) at--;
  if (!lines.slice(at).some((line) => line.startsWith('>'))) return { head: text, tail: '' };
  if (at > 0 && ATTRIBUTION.test(lines[at - 1])) at--;
  if (at === 0) return { head: text, tail: '' };
  return { head: lines.slice(0, at).join('\n'), tail: lines.slice(at).join('\n') };
}
