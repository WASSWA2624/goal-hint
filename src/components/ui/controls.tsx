"use client";

import Link from "next/link";
import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { media } from "@/styles/theme";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
};

export type ButtonLinkProps = ComponentPropsWithRef<typeof Link> & {
  variant?: ButtonVariant;
};

export type TextLinkProps = ComponentPropsWithRef<typeof Link>;

type FieldContent = {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
};

export type TextInputProps = Omit<ComponentPropsWithRef<"input">, "children"> & FieldContent;
export type SelectInputProps = ComponentPropsWithRef<"select"> & FieldContent;

const focusTreatment = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
`;

/** Compact 36px controls on phones and tablets; the 44px desktop treatment from `lg`. */
const buttonTreatment = css<{ $variant: ButtonVariant }>`
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: ${({ theme }) => theme.control.compactHeight};
  min-inline-size: ${({ theme }) => theme.control.compactHeight};
  max-inline-size: 100%;
  padding-block: 6px;
  padding-inline: 12px;
  border: ${({ theme }) => theme.border.width} solid;
  border-radius: ${({ theme }) => theme.border.radius};
  font: inherit;
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.25;
  text-align: center;
  text-decoration: none;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
  ${media.desktop} {
    gap: ${({ theme }) => theme.space.sm};
    min-block-size: ${({ theme }) => theme.control.minHeight};
    min-inline-size: ${({ theme }) => theme.control.minHeight};
    padding-block: ${({ theme }) => theme.space.sm};
    padding-inline: ${({ theme }) => theme.space.md};
    font-size: inherit;
    line-height: ${({ theme }) => theme.typography.lineHeight.body};
  }

  ${({ theme, $variant }) => {
    switch ($variant) {
      case "secondary":
        return css`
          color: ${theme.color.text};
          background: ${theme.color.surface};
          border-color: ${theme.color.controlBorder};

          ${media.hover} {
            &:hover { background: ${theme.color.surfaceMuted}; }
          }
        `;
      case "quiet":
        return css`
          color: ${theme.color.brand};
          background: transparent;
          border-color: transparent;

          ${media.hover} {
            &:hover {
              color: ${theme.color.brandHover};
              background: ${theme.color.surfaceMuted};
            }
          }
        `;
      default:
        return css`
          color: ${theme.color.onBrand};
          background: ${theme.color.brand};
          border-color: ${theme.color.brand};

          ${media.hover} {
            &:hover {
              background: ${theme.color.brandHover};
              border-color: ${theme.color.brandHover};
            }
          }
        `;
    }
  }}

  ${focusTreatment}
`;

const ButtonControl = styled.button<{ $variant: ButtonVariant }>`
  ${buttonTreatment}

  &:disabled {
    color: ${({ theme }) => theme.color.disabledText};
    background: ${({ theme }) => theme.color.disabledSurface};
    border-color: ${({ theme }) => theme.color.controlBorder};
    cursor: not-allowed;
  }
`;

const ButtonAnchor = styled(Link)<{ $variant: ButtonVariant }>`
  ${buttonTreatment}
`;

const TextAnchor = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-block-size: 2rem;
  max-inline-size: 100%;
  color: ${({ theme }) => theme.color.brand};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: underline;
  text-underline-offset: 0.2em;
  overflow-wrap: anywhere;
  ${media.desktop} { min-block-size: ${({ theme }) => theme.control.minHeight}; }

  ${media.hover} {
    &:hover { color: ${({ theme }) => theme.color.brandHover}; }
  }

  ${focusTreatment}
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.xs};
  min-inline-size: 0;
  max-inline-size: 100%;
`;

const FieldLabel = styled.label`
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  line-height: 1.3;
  overflow-wrap: anywhere;
  ${media.desktop} { font-size: inherit; line-height: inherit; }
`;

/** Font size stays inherited; on iOS below desktop the global rule sets text fields to 16px and SelectControl adds its own, so focus never zooms. */
const inputTreatment = css<{ $invalid: boolean }>`
  display: block;
  box-sizing: border-box;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: ${({ theme }) => theme.control.compactHeight};
  padding-block: 6px;
  padding-inline: ${({ theme }) => theme.space.sm};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid
    ${({ theme, $invalid }) =>
      $invalid ? theme.color.outcome.incorrect.border : theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  font: inherit;
  line-height: 1.25;
  ${media.desktop} {
    min-block-size: ${({ theme }) => theme.control.minHeight};
    padding-block: ${({ theme }) => theme.space.sm};
    line-height: ${({ theme }) => theme.typography.lineHeight.body};
  }

  &:disabled {
    color: ${({ theme }) => theme.color.disabledText};
    background: ${({ theme }) => theme.color.disabledSurface};
    cursor: not-allowed;
  }

  ${focusTreatment}
`;

const InputControl = styled.input<{ $invalid: boolean }>`
  ${inputTreatment}

  &::placeholder {
    color: ${({ theme }) => theme.color.mutedText};
    opacity: 1;
  }
`;

const SelectControl = styled.select<{ $invalid: boolean }>`
  ${inputTreatment}
  padding-inline-end: ${({ theme }) => theme.space.lg};
  /* The global iOS rule covers text fields only; selects under 16px also zoom on focus. */
  @supports (-webkit-touch-callout: none) { ${media.belowDesktop} { font-size: 16px; } }
`;

const FieldMessage = styled.div<{ $error?: boolean }>`
  color: ${({ theme, $error }) =>
    $error ? theme.color.outcome.incorrect.text : theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  line-height: 1.4;
  overflow-wrap: anywhere;
  ${media.desktop} {
    font-size: ${({ theme }) => theme.typography.size.small};
    line-height: ${({ theme }) => theme.typography.lineHeight.body};
  }
`;

type FieldAccessibility = Pick<
  ComponentPropsWithRef<"input">,
  "id" | "aria-describedby" | "aria-invalid"
> & Pick<FieldContent, "hint" | "error">;

function hasContent(value: ReactNode): boolean {
  return value !== undefined && value !== null && value !== false && value !== "";
}

function useFieldAccessibility(props: FieldAccessibility) {
  const generatedId = useId();
  const id = props.id || `gh-field-${generatedId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasHint = hasContent(props.hint);
  const hasError = hasContent(props.error);
  const invalid = hasError ? true : props["aria-invalid"];
  const descriptions = new Set(props["aria-describedby"]?.split(/\s+/).filter(Boolean));

  if (hasHint) descriptions.add(hintId);
  if (hasError) descriptions.add(errorId);

  return {
    id,
    hintId,
    errorId,
    hasHint,
    hasError,
    invalid,
    isInvalid: invalid !== undefined && invalid !== false && invalid !== "false",
    describedBy: descriptions.size > 0 ? [...descriptions].join(" ") : undefined,
  };
}

/** A native button: disabled controls leave the tab order; type defaults to button. */
export function Button({ variant = "primary", type = "button", ...props }: ButtonProps) {
  return <ButtonControl {...props} type={type} $variant={variant} />;
}

/** Navigation retains native link semantics, including Next.js navigation behavior. */
export function ButtonLink({ variant = "primary", ...props }: ButtonLinkProps) {
  return <ButtonAnchor {...props} $variant={variant} />;
}

export function TextLink(props: TextLinkProps) {
  return <TextAnchor {...props} />;
}

export function TextInput({ label, hint, error, type = "text", ...props }: TextInputProps) {
  const field = useFieldAccessibility({ ...props, hint, error });

  return (
    <Field>
      <FieldLabel htmlFor={field.id}>{label}</FieldLabel>
      <InputControl
        {...props}
        id={field.id}
        type={type}
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid}
        $invalid={field.isInvalid}
      />
      {field.hasHint && <FieldMessage id={field.hintId}>{hint}</FieldMessage>}
      {field.hasError && (
        <FieldMessage id={field.errorId} $error>
          {error}
        </FieldMessage>
      )}
    </Field>
  );
}

export function SelectInput({ label, hint, error, children, ...props }: SelectInputProps) {
  const field = useFieldAccessibility({ ...props, hint, error });

  return (
    <Field>
      <FieldLabel htmlFor={field.id}>{label}</FieldLabel>
      <SelectControl
        {...props}
        id={field.id}
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid}
        $invalid={field.isInvalid}
      >
        {children}
      </SelectControl>
      {field.hasHint && <FieldMessage id={field.hintId}>{hint}</FieldMessage>}
      {field.hasError && (
        <FieldMessage id={field.errorId} $error>
          {error}
        </FieldMessage>
      )}
    </Field>
  );
}

/** Search and filters share the same labeled, accessible field treatment. */
export function SearchInput(props: Omit<TextInputProps, "type">) {
  return <TextInput {...props} type="search" />;
}

export function FilterControl(props: SelectInputProps) {
  return <SelectInput {...props} />;
}
