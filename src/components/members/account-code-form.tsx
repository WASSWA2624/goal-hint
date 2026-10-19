"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button, PhoneInput, TextInput } from "@/components/ui/controls";
import { codeFromFragment, extractCode, formatCode } from "@/domain/access-code";
import { createMessages } from "@/i18n/messages";
import { MemberForm } from "./member-controls";

const FragmentCode = createContext<{ code: string; fromLink: boolean; change: (value: string) => void }>({ code: "", fromLink: false, change: () => {} });

/** Mounted in every account state so even a closed/refused page removes a private fragment from history. */
export function AccountCodeRoot({ children }: { children: ReactNode }) {
  const [code, change] = useState(""), [fromLink, setFromLink] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      const parsed = codeFromFragment(location.hash);
      if (!parsed) return;
      change(formatCode(parsed)); setFromLink(true);
      timer = setTimeout(() => history.replaceState(null, "", location.pathname + location.search), 0);
    };
    read(); window.addEventListener("hashchange", read);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", read); };
  }, []);
  return <FragmentCode.Provider value={{ code, fromLink, change }}>{children}</FragmentCode.Provider>;
}

export function AccountCodeForm({ locale, signedIn, inApp, returnTo, initialError, invalidPhone = false }: {
  locale: string; signedIn: boolean; inApp: boolean; returnTo: string | null; initialError?: string | undefined; invalidPhone?: boolean;
}) {
  const messages = createMessages(locale), fragment = useContext(FragmentCode), phone = useRef<HTMLInputElement>(null), unlock = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState(initialError), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!fragment.fromLink) return;
    if (signedIn) unlock.current?.focus();
    else { phone.current?.focus(); const end = phone.current?.value.length ?? 0; phone.current?.setSelectionRange(end, end); }
  }, [fragment.fromLink, signedIn]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, body = new URLSearchParams();
    for (const [name, value] of new FormData(form)) if (typeof value === "string") body.set(name, value);
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(form.action, { method: "POST", body, headers: { Accept: "application/json" }, credentials: "same-origin" });
      const result = await response.json() as { next?: string; message?: string };
      if (!response.ok || !result.next) { setError(result.message ?? messages.text("account.unavailable")); setBusy(false); return; }
      location.replace(result.next);
    } catch { setError(messages.text("account.unavailable")); setBusy(false); }
  }
  return <MemberForm method="post" action={signedIn ? "/api/account/code" : "/api/account/sign-in"} onSubmit={submit} data-analytics-ignore>
    {!signedIn && <PhoneInput ref={phone} name="phone" label={messages.text("account.phone")} required hint={messages.text("account.phoneHint")}
      error={invalidPhone ? messages.text("account.invalidPhone") : undefined} />}
    <TextInput name="code" label={messages.text("account.code")} value={fragment.code} required={signedIn} maxLength={64}
      autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" data-analytics-ignore
      onChange={(event) => fragment.change(event.currentTarget.value)} onPaste={(event) => {
        const code = extractCode(event.clipboardData.getData("text"));
        if (code) { event.preventDefault(); fragment.change(formatCode(code)); }
      }} hint={signedIn ? messages.text("account.codeHint") : messages.text("account.optionalCode")} />
    {returnTo && <input type="hidden" name="return" value={returnTo} />}
    <p>{messages.text("account.unlockAssent")} <Link href="/en/terms">{messages.text("account.terms")}</Link>.</p>
    {error && <p role="alert">{error}</p>}
    <Button ref={unlock} type="submit" disabled={busy}>{messages.text(busy ? "account.working" : signedIn || fragment.code ? "account.unlock" : "account.continue")}</Button>
    {inApp && fragment.fromLink && <Button variant="secondary" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(fragment.code); setCopied(true); } catch { setError(messages.text("account.copyFailed")); }
    }}>{messages.text(copied ? "account.copied" : "account.copyCode")}</Button>}
  </MemberForm>;
}
