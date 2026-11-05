"use client";

import styled from "styled-components";
import { controlRow } from "@/components/ui/control-layout";
import { FloatingField } from "@/components/ui/floating-field";
import { media } from "@/styles/theme";

/** Preserve the shared field geometry while giving long receipt identifiers more room. */
export const CheckoutTransactionFields = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  ${controlRow}
  ${media.tablet} { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
`;

/** Keep evidence actions below the message so optional labels never compete with them. */
export const CheckoutMessageField = styled(FloatingField)`
  && [data-floating-control] {
    display: grid;
    background: ${({ theme }) => theme.textField.background};
    border-radius: ${({ theme }) => theme.radius.control};
  }
  && [data-floating-control] > label { max-inline-size: calc(100% - var(--gh-size-5)); }
  &&&& [data-floating-control] > textarea {
    min-block-size: var(--gh-size-18);
    padding-block: var(--gh-spacing-3);
  }
  && [data-floating-control] > [data-field-action] {
    position: static;
    justify-self: end;
    margin: 0 var(--gh-spacing-0_75) var(--gh-spacing-0_75);
  }
`;
