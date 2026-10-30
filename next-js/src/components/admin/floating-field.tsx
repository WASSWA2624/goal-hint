"use client";

import { cloneElement, useId, type AriaAttributes, type ReactElement, type ReactNode } from "react";
import styled from "styled-components";
import { adminControl, FieldError, Hint } from "./admin-form";

type FieldControl = { id?: string } & Pick<AriaAttributes, "aria-describedby" | "aria-invalid">;

type FloatingFieldProps = {
  label: ReactNode;
  children: ReactElement<FieldControl>;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

/** One accessible field treatment for compact admin search and form controls. */
export function FloatingField({ label, children, hint, error, className }: FloatingFieldProps) {
  const generatedId = useId(), id = children.props.id ?? generatedId;
  const describedBy = [children.props["aria-describedby"], hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined;
  return <Field className={className} data-floating-field>
    <Control>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : children.props["aria-invalid"] })}
    </Control>
    {hint && <Hint id={`${id}-hint`}>{hint}</Hint>}
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}

const Field = styled.div`
  display: grid;
  gap: 5px;
  min-inline-size: 0;
  padding-block-start: 5px;
`;

const Control = styled.div`
  position: relative;
  min-inline-size: 0;
  > label {
    position: absolute;
    z-index: 1;
    inset-block-start: 0;
    inset-inline-start: 8px;
    max-inline-size: calc(100% - 16px);
    padding-inline: 3px;
    transform: translateY(-50%);
    background: ${({ theme }) => theme.color.surface};
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.6875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: text;
  }
  > input, > select, > textarea {
    ${adminControl}
    display: block;
    box-sizing: border-box;
    min-inline-size: 0;
    border-radius: ${({ theme }) => theme.radius.control};
    font-weight: normal;
  }
  > input::placeholder, > textarea::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  > textarea { min-block-size: 5.5rem; resize: vertical; }
  &:focus-within > label { color: ${({ theme }) => theme.color.link}; }
  &:has(> [aria-invalid="true"]) > label { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
