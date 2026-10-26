"use client";

import { useRef, useState } from "react";
import { Button, PhoneInput } from "@/components/ui/controls";
import { MemberForm } from "@/components/members/member-controls";
import { normalizePhone } from "@/domain/phone";

/** Isolated browser acceptance: no account, payment or network request is created. */
export default function PhoneInputProbe() {
  const [phone, setPhone] = useState("256"), [submitted, setSubmitted] = useState(""), control = useRef<HTMLInputElement>(null);
  return <main style={{ maxWidth: 480, margin: "24px auto", padding: 16 }}>
    <h1>Phone input acceptance</h1>
    <MemberForm onSubmit={(event) => { event.preventDefault(); setSubmitted(normalizePhone(new FormData(event.currentTarget).get("phone")) ?? "invalid"); }}>
      <PhoneInput ref={control} label="Phone number" name="phone" required />
      <Button type="submit">Check phone</Button>
      <output aria-label="Submitted phone">{submitted}</output>
    </MemberForm>
    <PhoneInput label="Controlled phone" value={phone} onValueChange={setPhone} />
    <output aria-label="Controlled value">{phone}</output>
    <Button onClick={() => setPhone("+44 7946 001234")}>Set international</Button>
    <Button onClick={() => control.current?.focus()}>Focus phone</Button>
    <PhoneInput label="Read only phone" defaultValue="256700000901" readOnly />
    <PhoneInput label="Disabled phone" defaultValue="256" disabled required />
  </main>;
}
