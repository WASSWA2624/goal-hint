"use client";

/**
 * The consent bootstrap runs once, from the server HTML, before hydration. Hydration keeps that executed script. When
 * the root layout remounts in the browser (a dev hot reload after a compile error, for example), React would create a
 * fresh copy that never runs and warn about it, so the browser's copy is an inert text/plain data block instead.
 */
export function ConsentBootstrapScript({ id, code }: { id: string; code: string }) {
  return <script id={id} type={typeof window === "undefined" ? undefined : "text/plain"} suppressHydrationWarning
    dangerouslySetInnerHTML={{ __html: code }} />;
}
