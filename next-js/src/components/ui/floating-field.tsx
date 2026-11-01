"use client";

import { cloneElement, useId, type AriaAttributes, type ReactElement, type ReactNode } from "react";
import styled from "styled-components";

type ControlProps = { id?: string } & Pick<AriaAttributes, "aria-describedby" | "aria-invalid">;

/** A persistent inset label, including for filled and restored controls. */
export function FloatingField({ label, children, action, className }: { label: ReactNode; children: ReactElement<ControlProps>; action?: ReactNode; className?: string }) {
  const generated = useId(), id = children.props.id ?? generated;
  return <Frame className={className} data-floating-field data-field-action={!!action}>
    <label htmlFor={id}>{label}</label>
    {cloneElement(children, { id })}
    {action && <div data-field-action>{action}</div>}
  </Frame>;
}

const Frame = styled.div`
  position: relative; min-inline-size: 0;
  && > label {
    position: absolute; z-index: 1; inset-block-start: 6px; inset-inline-start: 10px;
    max-inline-size: calc(100% - 20px);
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 12px; line-height: 1; font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap; cursor: text;
  }
  > input, > textarea { inline-size: 100%; min-block-size: 48px; padding-block: 22px 6px; font-size: 16px; }
  &[data-field-action="true"] > textarea { padding-block-start: 36px; }
  > [data-field-action] { position: absolute; inset-block-start: 3px; inset-inline-end: 3px; display: flex; align-items: center; gap: 4px; }
  > [data-field-action] button { min-block-size: 30px; padding: 3px 8px; font-size: 13px; }
  > [data-field-action] svg { inline-size: 16px; block-size: 16px; }
  &:focus-within > label { color: ${({ theme }) => theme.color.link}; }
`;
