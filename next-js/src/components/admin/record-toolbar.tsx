"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styled from "styled-components";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { media } from "@/styles/theme";
import { ActionButton } from "./admin-form";
import { visuallyHidden } from "./desk-styles";
import { RecordHead } from "./record-workspace";

export const RecordToolbar = styled(RecordHead).attrs<{ "data-admin-toolbar"?: string }>({ "data-admin-toolbar": "" })`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding-inline: 0;
  background: transparent;
  > h1 { ${visuallyHidden} }
  ${media.desktop} { padding-inline: ${({ theme }) => theme.layout.sectionPadding}; }
`;

const ToolbarButton = styled(ActionButton)`
  flex: none;
  white-space: nowrap;
  ${media.belowDesktop} {
    && { inline-size: var(--form-control-height); padding-inline: 0; }
    > span { display: none; }
  }
`;

export function RecordPrimaryAction({ label, icon, ...button }: ComponentPropsWithoutRef<"button"> & { label: string; icon: ReactNode }) {
  return <ToolbarButton type="button" $variant="primary" aria-label={label} title={label} data-admin-primary {...button}>
    {icon}<span>{label}</span>
  </ToolbarButton>;
}

export function RecordFormDialog({ id, title, submitLabel, formId, busy, onClose, children, submitId, submitDisabled }: {
  id: string; title: string; submitLabel: string; formId: string; busy: boolean; onClose: () => void;
  children: ReactNode; submitId?: string; submitDisabled?: boolean;
}) {
  return <CriteriaDialog id={id} title={title} open onCancel={onClose} closeLabel={`Close ${title.toLowerCase()}`} busy={busy}
    footer={<><CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</CriteriaDialogButton>
      <CriteriaDialogButton id={submitId} type="submit" form={formId} disabled={busy || submitDisabled}>{submitLabel}</CriteriaDialogButton></>}>
    {children}
  </CriteriaDialog>;
}
