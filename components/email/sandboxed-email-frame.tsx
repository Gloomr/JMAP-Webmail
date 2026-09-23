"use client";

import { useRef, useEffect, useCallback } from "react";
import { generateIframeStylesheet } from "@/lib/color-transform";

interface SandboxedEmailFrameProps {
  html: string;
  className?: string;
}

function wrapHtmlForIframe(sanitizedHtml: string): string {
  // The application is light, and so is the mail inside it. A frame
  // document answers `prefers-color-scheme` from the embedding element's
  // color-scheme rather than the machine's, so pinning both here keeps a
  // mail's own dark-mode rules from painting it dark on a dark machine.
  return `<!DOCTYPE html>
<html style="color-scheme: light">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${generateIframeStylesheet()}
</head>
<body>${sanitizedHtml}</body>
</html>`;
}

export function SandboxedEmailFrame({ html, className }: SandboxedEmailFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    const height = iframe.contentDocument.body.scrollHeight;
    iframe.style.height = `${height + 16}px`;
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let observer: ResizeObserver | null = null;

    const handleLoad = () => {
      updateHeight();

      const doc = iframe.contentDocument;
      if (!doc?.body) return;

      observer = new ResizeObserver(updateHeight);
      observer.observe(doc.body);

      doc.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor?.href) {
          e.preventDefault();
          window.open(anchor.href, '_blank', 'noopener,noreferrer');
        }
      });
    };

    iframe.addEventListener('load', handleLoad);
    return () => {
      iframe.removeEventListener('load', handleLoad);
      observer?.disconnect();
    };
  }, [html, updateHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      srcDoc={wrapHtmlForIframe(html)}
      className={className}
      style={{
        width: '100%',
        border: 'none',
        overflow: 'hidden',
        minHeight: '100px',
        colorScheme: 'light',
      }}
      title="Email content"
    />
  );
}
