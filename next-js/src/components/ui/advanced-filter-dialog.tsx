"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { ResetIcon, SlidersIcon } from "./icons";
import { CriteriaDialog, CriteriaDialogButton, CriteriaDialogTitle } from "./criteria-dialog";

const ResetButton = styled(CriteriaDialogButton)`
  &&:not(:disabled) {
    background: ${({ theme }) => theme.color.fieldHover};
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.brandHover}; } }
  }
`;

/** Shared heading and footer actions for screen-specific filter drafts. */
export function AdvancedFilterDialog({ locale, onReset, onApply, applyDisabled = false, children, ...props }: {
  id: string; open: boolean; onCancel: () => void; closeLabel: string;
  locale?: string; onReset: () => void; onApply: () => void; applyDisabled?: boolean;
  children: ReactNode;
}) {
  const messages = createMessages(locale);
  return <CriteriaDialog {...props} onApply={onApply}
    title={<CriteriaDialogTitle><SlidersIcon />{messages.text("feed.filters.dialogTitle")}</CriteriaDialogTitle>}
    footer={<>
      <ResetButton type="button" variant="secondary" data-dialog-reset onClick={onReset}>
        <ResetIcon />{messages.text("feed.filters.resetFilters")}
      </ResetButton>
      <CriteriaDialogButton type="button" disabled={applyDisabled} onClick={onApply}>
        {messages.text("feed.filters.applyFilters")}
      </CriteriaDialogButton>
    </>}>
    {children}
  </CriteriaDialog>;
}
