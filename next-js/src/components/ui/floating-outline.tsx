import type { ReactNode } from "react";

/** Decorative legend measures the label and cuts the border; the real label owns accessibility. */
export function FloatingOutline({ label }: { label: ReactNode }) {
  return <fieldset aria-hidden="true" data-floating-outline><legend data-empty={label === null || label === undefined || label === false || label === "" || undefined}><span>{label}</span></legend></fieldset>;
}
