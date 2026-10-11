"use client";

import { useState } from "react";
import styled from "styled-components";
import type { FeedQuery } from "@/domain/feed-query";
import { useDeviceTimeZone, useMessages } from "@/i18n/use-messages";
import { CompactSelect, controlFeedback } from "./filter-parts";

const Box = styled.details`
  min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface};
  border: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.75rem;
  > summary { cursor: pointer; padding: 5px 8px; font-weight: 500; overflow-wrap: anywhere; }
  &[open] > summary { color: ${({ theme }) => theme.color.accent.teal.text}; background: ${({ theme }) => theme.color.brandSoft}; }
`;
const Fields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 6px 8px;
  > label { display: grid; gap: 2px; min-inline-size: 0; }
  input { inline-size: 100%; min-inline-size: 0; min-block-size: 1.875rem; padding: 3px 5px; border: 1px solid ${({ theme }) => theme.color.controlBorder}; background: ${({ theme }) => theme.color.surface}; border-radius: 0; }
  p, [data-wide] { grid-column: 1 / -1; }
  p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
  button { min-block-size: 1.875rem; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; cursor: pointer; ${controlFeedback} }
  button[data-apply] { background: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.onBrand}; border-color: ${({ theme }) => theme.color.brand}; }
  button:disabled { opacity: 0.5; cursor: default; }
`;

/** Shared local-time control; applied query changes reset unsubmitted edits. */
export function FeedTimeFilter(props: { query: FeedQuery; onApply: (query: FeedQuery) => void }) {
  return <TimeFields key={JSON.stringify(props.query.time ?? null)} {...props} />;
}
function TimeFields({ query, onApply }: { query: FeedQuery; onApply: (query: FeedQuery) => void }) {
  const messages = useMessages(query.locale), zone = useDeviceTimeZone();
  const [mode, setMode] = useState(query.time ? query.time.from === query.time.to ? "exact" : "range" : "any");
  const [from, setFrom] = useState(query.time?.from ?? "12:00"), [to, setTo] = useState(query.time?.to ?? "18:00");
  const invalid = mode !== "any" && (!from || mode === "range" && (!to || from > to));
  const summary = query.time ? `${query.time.from}${query.time.from === query.time.to ? "" : ` – ${query.time.to}`} · ${query.time.zone}` : messages.text("feed.time.any");
  return <Box>
    <summary>{messages.text("feed.time.title")}: {summary}</summary>
    <Fields>
      <label data-wide>{messages.text("feed.time.title")}<CompactSelect value={mode} aria-label={messages.text("feed.time.title")}
        options={[{ value: "any", label: messages.text("feed.time.any") }, { value: "exact", label: messages.text("feed.time.exact") }, { value: "range", label: messages.text("feed.time.range") }]}
        onChange={(event) => setMode(event.target.value)} /></label>
      {mode !== "any" && <label data-wide={mode === "exact" || undefined}>{messages.text(mode === "exact" ? "feed.time.exact" : "feed.time.from")}<input type="time" step="60" value={from} aria-invalid={invalid || undefined} onChange={(event) => setFrom(event.target.value)} /></label>}
      {mode === "range" && <label>{messages.text("feed.time.to")}<input type="time" step="60" value={to} min={from} aria-invalid={invalid || undefined} onChange={(event) => setTo(event.target.value)} /></label>}
      <p>{messages.text("feed.time.help", { zone })}</p>
      {invalid && <p role="alert">{messages.text("feed.time.invalid")}</p>}
      <button type="button" onClick={() => { setMode("any"); onApply({ ...query, time: null, page: 1 }); }}>{messages.text("feed.time.clear")}</button>
      <button type="button" data-apply disabled={invalid} onClick={() => onApply({ ...query, time: mode === "any" ? null : { from, to: mode === "exact" ? from : to, zone }, page: 1 })}>{messages.text("feed.time.apply")}</button>
    </Fields>
  </Box>;
}
