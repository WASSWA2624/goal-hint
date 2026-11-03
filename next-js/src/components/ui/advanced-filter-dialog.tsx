"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import { createMessages } from "@/i18n/messages";
import { BrandMark } from "./brand";
import { CriteriaDialog, CriteriaDialogButton } from "./criteria-dialog";

const Title = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-2);
  > span { padding: 0; }
  img { inline-size: var(--gh-size-6); block-size: var(--gh-size-6); }
`;

/** Shared branding and footer actions; each screen retains its own filter fields and draft. */
export function AdvancedFilterDialog({ locale, onReset, onApply, applyDisabled = false, children, ...props }: {
  id: string; open: boolean; onCancel: () => void; closeLabel: string;
  locale?: string; onReset: () => void; onApply: () => void; applyDisabled?: boolean;
  children: ReactNode;
}) {
  const messages = createMessages(locale);
  return <CriteriaDialog {...props} onApply={onApply}
    title={<Title><BrandMark alt="" />{messages.text("feed.filters.dialogTitle")}</Title>}
    footer={<>
      <CriteriaDialogButton type="button" variant="secondary" data-dialog-reset onClick={onReset}>
        {messages.text("feed.filters.resetFilters")}
      </CriteriaDialogButton>
      <CriteriaDialogButton type="button" disabled={applyDisabled} onClick={onApply}>
        {messages.text("feed.filters.applyFilters")}
      </CriteriaDialogButton>
    </>}>
    {children}
  </CriteriaDialog>;
}
