"use client";
import { useRef, useState, type FormEvent } from "react";
import { PhoneInput } from "@/components/ui/controls";

/** Inspect native form serialization for required account fields and optional empty admin searches. */
export function PhoneFieldsProbe() {
  const form = useRef<HTMLFormElement>(null), [result, setResult] = useState("");
  const controlled = useRef<HTMLInputElement>(null), [phone, setPhone] = useState("254700000105");
  function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setResult(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
  }
  function pastePhone(value: string) {
    const clipboard = new DataTransfer();clipboard.setData("text/plain", value);
    controlled.current?.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }
  return <section data-fixture-phone-fields style={{ maxWidth: "36rem", margin: "auto", display: "grid", gap: "16px" }}>
    <h1>Phone form acceptance</h1>
    <form ref={form} onSubmit={inspect} style={{ display: "grid", gap: "16px" }}>
      <PhoneInput name="memberPhone" label="Required account phone" defaultValue="" required />
      <PhoneInput name="searchPhone" label="Optional admin search" defaultValue="" />
      <PhoneInput ref={controlled} name="controlledPhone" label="Controlled international phone" value={phone} onValueChange={setPhone} />
      <button type="submit">Submit phone FormData</button>
      <button type="button" onClick={() => setResult(JSON.stringify(Object.fromEntries(new FormData(form.current!))))}>Inspect phone FormData without validation</button>
      <button type="button" onClick={() => setPhone("447700900123")}>Set controlled UK phone</button>
      <button type="button" onClick={() => setPhone("")}>Clear controlled phone</button>
      <button type="button" onClick={() => { controlled.current?.focus();setResult(JSON.stringify({ visibleInputFocused: document.activeElement === controlled.current })); }}>Focus controlled phone ref</button>
      <button type="button" onClick={() => pastePhone("+44 7700 900123")}>Paste synthetic full UK phone</button>
      <button type="button" onClick={() => pastePhone("Call +44 7700 900123")}>Paste invalid synthetic phone</button>
    </form>
    <output data-fixture-phone-result>{result}</output>
  </section>;
}
