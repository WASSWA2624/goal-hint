"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonLink, TextInput, TextLink } from "@/components/ui/controls";
import { Inline, Stack, Surface } from "@/components/ui/layout";
import { NativeFrame } from "./native-frame";

const draftKey = "goal-hint-native-ui-acceptance-draft";
type UiEvents = {
  inputEvents: number;
  trustedInputEvents: number;
  keys: { key: string; trusted: boolean }[];
  visibility: string[];
  resizeEvents: number;
  externalClicks: number;
  file: { name: string; size: number; trusted: boolean } | null;
};
declare global { interface Window { __goalHintNativeUi?: UiEvents } }

/** Synthetic public input only; no form submission, upload or account services. */
export default function WindowsUiFixture() {
  const [draft, setDraft] = useState("");
  const [external, setExternal] = useState("");
  const [fileStatus, setFileStatus] = useState("No local file selected.");
  const events = useRef<UiEvents>({ inputEvents: 0, trustedInputEvents: 0, keys: [],
    visibility: [], resizeEvents: 0, externalClicks: 0, file: null });
  useEffect(() => {
    const record = events.current;
    window.__goalHintNativeUi = record;
    setDraft(sessionStorage.getItem(draftKey) ?? "");
    setExternal(`http://windows-handler.localhost:${location.port}/native-handler`);
    const onKey = (event: KeyboardEvent) => {
      record.keys.push({ key: event.key, trusted: event.isTrusted });
      record.keys = record.keys.slice(-80);
    };
    const onResize = () => { record.resizeEvents += 1; };
    const onVisibility = () => { record.visibility.push(document.visibilityState); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    document.documentElement.dataset.windowsUiFixtureReady = "true";
    return () => {
      delete document.documentElement.dataset.windowsUiFixtureReady;
      delete window.__goalHintNativeUi;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return <div data-windows-ui-fixture>
    <NativeFrame heading="Windows native acceptance">
      <p>Use native keyboard, window controls and the system browser. All data here is synthetic.</p>
      <Surface aria-label="Native input acceptance"><Stack>
        <TextInput id="acceptance-draft" label="Acceptance draft" hint="Type the supplied public test phrase, then press Tab."
          autoComplete="off" value={draft} onChange={event => {
            const value = event.currentTarget.value;
            setDraft(value);
            sessionStorage.setItem(draftKey, value);
            events.current.inputEvents += 1;
            if (event.nativeEvent.isTrusted) events.current.trustedInputEvents += 1;
          }} />
        <Inline>
          <ButtonLink id="internal-link" href="/native-details">Open internal detail</ButtonLink>
          <TextLink id="external-link" href={external || "#"} onClick={() => { events.current.externalClicks += 1; }}>
            Open system browser
          </TextLink>
        </Inline>
        <TextInput id="acceptance-file" label="Local text file (never uploaded)" type="file" accept=".txt"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            const accepted = file?.name === "windows-ui-selection.txt";
            events.current.file = accepted ? { name: file.name, size: file.size, trusted: event.nativeEvent.isTrusted } : null;
            setFileStatus(accepted ? "Owned acceptance file selected. Nothing is uploaded."
              : "Choose the supplied windows-ui-selection.txt acceptance file.");
          }} />
        <p id="file-status" role="status">{fileStatus}</p>
      </Stack></Surface>
      <p>The draft survives route Back and native window lifecycle changes. Browser zoom must reflow the page without horizontal scrolling.</p>
    </NativeFrame>
  </div>;
}
