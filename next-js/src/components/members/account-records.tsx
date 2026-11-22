"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";
import styled from "styled-components";
import {
  RecordBack, RecordBody, RecordCard, RecordDetails, RecordEmpty, RecordFeedback, RecordFooter, RecordHead,
  RecordItem, RecordList, RecordListFooter, RecordListScroll, RecordListTools, RecordScroll, RecordWorkspace, useRecordView,
  accountRecordSelection,
} from "@/components/admin/record-workspace";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const Workspace = styled(RecordWorkspace)`
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
  > header h2 { font-size: ${({ theme }) => theme.typography.scale.emphasis}; }
  ${media.desktop} {
    block-size: clamp(var(--gh-size-72), calc(100dvh - var(--app-header-height) - var(--gh-size-28)), var(--gh-size-144));
  }
  ${media.belowDesktop} {
    &&[data-record-compact] {
      block-size: clamp(var(--gh-size-72), calc(100dvh - var(--app-header-height) - var(--app-mobile-tab-height)
        - env(safe-area-inset-bottom) - var(--gh-size-28)), var(--gh-size-144));
      > header, > [data-record-feedback], [data-record-list-tools], [data-record-list-footer] {
        padding-inline: var(--gh-spacing-3);
      }
      > header { padding-block-start: var(--gh-spacing-2); }
      [data-record-back] { margin-inline-start: var(--gh-spacing-3); }
      [data-record-detail-scroll] { padding: var(--gh-spacing-3); }
    }
  }
`;

export function AccountRecords<T extends { id: string }>({ title, items, row, detail, actions, toolbar, pagination, empty, feedback,
  busy, hashPrefix, locale = "en" }: {
  title: string; items: readonly T[]; row: (item: T) => ReactNode; detail: (item: T) => ReactNode; actions?: (item: T) => ReactNode;
  toolbar?: ReactNode; pagination?: ReactNode; empty?: ReactNode; feedback?: ReactNode; busy?: boolean; hashPrefix?: string; locale?: string;
}) {
  const id = useId();
  const [selectedId, setSelectedId] = useState<string>();
  const list = useRef<HTMLOListElement>(null);
  const { detailOpen, openDetail, closeDetail } = useRecordView({ accountHistory: true });
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  const footer = selected && actions?.(selected);
  const restoreLinkedRecord = useEffectEvent((allowHash: boolean) => {
    const historySelection = accountRecordSelection();
    const item = items.find(candidate => candidate.id === historySelection)
      ?? (allowHash && hashPrefix ? items.find(candidate => window.location.hash === `#${hashPrefix}${candidate.id}`) : undefined);
    if (item) {
      setSelectedId(item.id);
      const trigger = list.current?.querySelector<HTMLButtonElement>(`button[data-account-record-id="${CSS.escape(item.id)}"]`);
      openDetail(trigger, { pushHistory: false });
    }
  });
  useEffect(() => {
    const restore = () => restoreLinkedRecord(true);
    const onPop = () => restoreLinkedRecord(false);
    restore();
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", onPop);
    };
  }, [hashPrefix]);

  return <Workspace $compact $detailOpen={detailOpen && !!selected} data-account-records aria-labelledby={id} aria-busy={busy || undefined}>
    <RecordHead><h2 id={id}>{title}</h2></RecordHead>
    {feedback && <RecordFeedback>{feedback}</RecordFeedback>}
    <RecordList aria-labelledby={id}>
      {toolbar && <RecordListTools>{toolbar}</RecordListTools>}
      {items.length ? <RecordListScroll ref={list} tabIndex={-1}>
        {items.map(item => <li key={item.id}>
          <RecordItem id={hashPrefix ? `${hashPrefix}${item.id}` : undefined} type="button" data-account-record-id={item.id}
            aria-current={selected?.id === item.id || undefined} onClick={event => {
              setSelectedId(item.id);
              openDetail(event.currentTarget, { selection: item.id });
            }}>{row(item)}</RecordItem>
        </li>)}
      </RecordListScroll> : <RecordEmpty>{empty}</RecordEmpty>}
      {pagination && <RecordListFooter>{pagination}</RecordListFooter>}
    </RecordList>
    {selected && <RecordDetails aria-labelledby={id}>
      <RecordBack onClick={closeDetail}>{createMessages(locale).text("details.backToList")}</RecordBack>
      <RecordCard>
        <RecordScroll><RecordBody>{detail(selected)}</RecordBody></RecordScroll>
        {footer && <RecordFooter>{footer}</RecordFooter>}
      </RecordCard>
    </RecordDetails>}
  </Workspace>;
}
