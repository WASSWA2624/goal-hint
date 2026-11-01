import { digitCaret } from "@/domain/input-format";

/** Restore selection after React renders a grouped value, without moving focus. */
export function preserveDigitCaret(control: HTMLInputElement, digitsBefore: number) {
  requestAnimationFrame(() => {
    if (!control.isConnected || document.activeElement !== control) return;
    const position = digitCaret(control.value, digitsBefore);
    control.setSelectionRange(position, position);
  });
}
