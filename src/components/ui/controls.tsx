"use client";

import Link from "@/components/navigation/navigation-link";
import { useEffect, useId, useImperativeHandle, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { normalizePhone, phoneInputIssue, phoneInputMaxLength } from "@/domain/phone";
import { composePhoneValue, isInternationalPhoneInput, phoneCountry, searchPhoneCountries, splitPhoneValue, type PhoneCountry, type PhoneValueParts } from "@/domain/phone-countries";
import { createMessages } from "@/i18n/messages";
import { CheckIcon, ChevronDownIcon, GlobeIcon, Icon } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: "normal" | "large";
};

export type ButtonLinkProps = ComponentPropsWithRef<typeof Link> & {
  variant?: ButtonVariant;
  size?: "normal" | "large";
};

export type TextLinkProps = ComponentPropsWithRef<typeof Link>;

type FieldContent = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export type TextInputProps = Omit<ComponentPropsWithRef<"input">, "children"> & FieldContent & { leading?: ReactNode };
export type SelectInputProps = ComponentPropsWithRef<"select"> & FieldContent;

const focusTreatment = css`
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: ${({ theme }) => theme.border.focusOffset};
  }
`;

/** Compact 36px controls on phones and tablets; the 44px desktop treatment from `lg`. */
const buttonTreatment = css<{ $variant: ButtonVariant; $large?: boolean }>`
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
          color: ${theme.color.link};
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
          color: ${theme.color.onAction};
          background: ${theme.gradient.action};
          border-color: ${theme.gradient.action};

          ${media.hover} {
            &:hover {
              background: ${theme.gradient.actionHover};
              border-color: ${theme.gradient.actionHover};
            }
          }
        `;
    }
  }}

  ${({ $large, theme }) => $large && css`
    min-block-size: 3rem;
    min-inline-size: 3rem;
    font-size: ${theme.typography.scale.body};
    ${media.desktop} { min-block-size: 3rem; font-size: ${theme.typography.scale.body}; }
  `}
  ${focusTreatment}
`;

const ButtonControl = styled.button<{ $variant: ButtonVariant; $large?: boolean }>`
  ${buttonTreatment}

  &:disabled {
    color: ${({ theme }) => theme.color.disabledText};
    background: ${({ theme }) => theme.color.disabledSurface};
    border-color: ${({ theme }) => theme.color.border};
    cursor: not-allowed;
  }
`;

const ButtonAnchor = styled(Link)<{ $variant: ButtonVariant; $large?: boolean }>`
  ${buttonTreatment}
`;

const TextAnchor = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-block-size: 2rem;
  max-inline-size: 100%;
  color: ${({ theme }) => theme.color.link};
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

const InputControl = styled.input<{ $invalid: boolean; $leading?: boolean }>`
  ${inputTreatment}
  ${({ $leading }) => $leading && css`padding-inline-start: 38px;`}
  &[data-phone-input] { min-block-size: 44px; font-size: 1rem; letter-spacing: 0.02em; }

  &::placeholder {
    color: ${({ theme }) => theme.color.mutedText};
    opacity: 1;
  }
  &[data-password-input]::-ms-reveal { display: none; }
`;
const InputFrame = styled.div`
  position: relative; min-inline-size: 0;
  > span { position: absolute; inset-inline-start: 12px; inset-block-start: 50%; transform: translateY(-50%);
    display: flex; pointer-events: none; color: ${({ theme }) => theme.color.mutedText}; }
  > input[data-password-input] { padding-inline-end: 48px; }
  svg { inline-size: 18px; block-size: 18px; }
`;
const PasswordToggle = styled(Button)`
  && {
    position: absolute; inset-inline-end: 1px; inset-block: 1px;
    inline-size: 44px; min-inline-size: 44px; min-block-size: 0; padding: 0;
    border: 0; border-radius: 0; background: transparent;
    color: ${({ theme }) => theme.color.link};
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; }
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
export function Button({ variant = "primary", size = "normal", type = "button", ...props }: ButtonProps) {
  return <ButtonControl {...props} type={type} $variant={variant} $large={size === "large"} />;
}

/** Navigation retains native link semantics, including Next.js navigation behavior. */
export function ButtonLink({ variant = "primary", size = "normal", ...props }: ButtonLinkProps) {
  return <ButtonAnchor {...props} $variant={variant} $large={size === "large"} />;
}

export function TextLink(props: TextLinkProps) {
  return <TextAnchor {...props} />;
}

export function TextInput({ label, hint, error, leading, type = "text", ...props }: TextInputProps) {
  const field = useFieldAccessibility({ ...props, hint, error });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const password = type === "password";
  const toggleLabel = password ? createMessages().text(passwordVisible ? "account.hidePassword" : "account.showPassword") : "";
  const control = <InputControl {...props} id={field.id} type={password && passwordVisible ? "text" : type} aria-describedby={field.describedBy}
    aria-invalid={field.invalid} $invalid={field.isInvalid} $leading={hasContent(leading)}
    spellCheck={password ? false : props.spellCheck} autoCapitalize={password ? "none" : props.autoCapitalize}
    {...(password ? { "data-password-input": true, "data-analytics-ignore": true } : {})} />;

  return (
    <Field>
      <FieldLabel htmlFor={field.id}>{label}</FieldLabel>
      {hasContent(leading) || password ? <InputFrame>
        {hasContent(leading) && <span aria-hidden="true">{leading}</span>}{control}
        {password && <PasswordToggle type="button" variant="quiet" disabled={props.disabled} data-analytics-ignore
          aria-label={toggleLabel}
          aria-controls={field.id} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}>
          <Icon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{passwordVisible && <path d="m3 3 18 18" />}</Icon>
        </PasswordToggle>}
      </InputFrame> : control}
      {field.hasHint && <FieldMessage id={field.hintId}>{hint}</FieldMessage>}
      {field.hasError && (
        <FieldMessage id={field.errorId} $error>
          {error}
        </FieldMessage>
      )}
    </Field>
  );
}

export type PhoneInputProps = Omit<TextInputProps, "type" | "inputMode" | "autoComplete" | "value" | "defaultValue" | "onChange" | "onPaste" | "leading"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

type PhoneDraft = PhoneValueParts & Readonly<{ value: string }>;
type CountryMenuPosition = Readonly<{ left: number; top: number; width: number; maxHeight: number }>;

/** A fixed country prefix and a national field share the original canonical-value and native validation contract. */
export function PhoneInput({ ref, value, defaultValue = "256", onValueChange, label, name, hint, error, onBlur, onInvalid, ...props }: PhoneInputProps) {
  const [draft, setDraft] = useState<PhoneDraft>(() => ({ ...splitPhoneValue(value ?? defaultValue), value: value ?? defaultValue }));
  const [touched, setTouched] = useState(false), [pasteError, setPasteError] = useState<string | null>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [position, setPosition] = useState<CountryMenuPosition>({ left: 8, top: 8, width: 300, maxHeight: 360 });
  const frame = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), countrySearch = useRef<HTMLInputElement>(null);
  const control = useRef<HTMLInputElement>(null), messages = createMessages();
  useImperativeHandle(ref, () => control.current!, []);
  const current = value ?? draft.value;
  // Echoed controlled values retain the raw national draft and caret. External updates are split immediately.
  const parts = current === draft.value ? draft : splitPhoneValue(current, draft.country ?? "UG");
  const country = parts.country ? phoneCountry(parts.country) : null;
  const fullValue = composePhoneValue(parts), canonical = normalizePhone(fullValue);
  const issue = phoneInputIssue(fullValue, props.required);
  const message = props.disabled || props.readOnly ? "" : pasteError ?? (issue === "country-code" ? messages.text("phone.invalid")
    : issue ? messages.text(`phone.${issue}`) : "");
  const shownError = hasContent(error) ? error : touched && message ? message : undefined;
  const field = useFieldAccessibility({ ...props, hint, error: shownError });
  const menuId = `${field.id}-countries`, searchId = `${field.id}-country-search`;
  const inactive = !!(props.disabled || props.readOnly), options = searchPhoneCountries(query);
  const countryLabel = country?.name ?? messages.text("phone.international");
  const countryDescription = messages.text("phone.countrySelection", { country: countryLabel, code: parts.callingCode });
  useEffect(() => { control.current?.setCustomValidity(message); }, [message]);
  function change(next: PhoneValueParts) {
    const nextValue = composePhoneValue(next);
    setPasteError(null); setDraft({ ...next, value: nextValue });
    if (nextValue !== current) onValueChange?.(nextValue);
  }
  function locateMenu() {
    const bounds = frame.current?.getBoundingClientRect();
    if (!bounds) return;
    const viewportWidth = document.documentElement.clientWidth;
    const width = Math.min(Math.max(bounds.width, 300), viewportWidth - 16);
    const below = window.innerHeight - bounds.bottom - 16, above = bounds.top - 16;
    const useBelow = below >= 280 || below >= above;
    const height = Math.min(360, Math.max(80, useBelow ? below : above));
    setPosition({ width, left: Math.max(8, Math.min(bounds.left, viewportWidth - width - 8)),
      top: useBelow ? bounds.bottom + 6 : Math.max(8, bounds.top - height - 6), maxHeight: height });
  }
  function showCountries() {
    if (inactive) return;
    locateMenu(); setQuery(""); setOpen(true);
  }
  function closeCountries(restoreFocus = false) {
    setOpen(false); if (restoreFocus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    countrySearch.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !frame.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    const move = () => {
      const bounds = frame.current?.getBoundingClientRect();
      if (!bounds || bounds.bottom < 0 || bounds.top > window.innerHeight) setOpen(false);
      else locateMenu();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", move); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); };
  }, [open]);
  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeCountries(true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[data-phone-country-option]") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : index < 0 ? buttons.length - 1 : Math.max(0, index - 1);
    buttons[next]?.focus();
  }
  function internationalValue(raw: string): PhoneValueParts | null {
    if (isInternationalPhoneInput(raw)) return splitPhoneValue(raw, parts.country ?? "UG");
    const normalized = normalizePhone(raw);
    if (!normalized) return null;
    const national = parts.country ? parsePhoneNumberFromString(raw, { defaultCountry: parts.country, extract: false }) : undefined;
    const digits = raw.replace(/\D/gu, "");
    if (digits.startsWith(parts.callingCode) && digits !== national?.nationalNumber && digits.length >= 10 || !national?.isPossible()) {
      return splitPhoneValue(normalized, parts.country ?? "UG");
    }
    return null;
  }
  return <Field data-phone-field data-analytics-ignore>
    <FieldLabel htmlFor={field.id}>{label}</FieldLabel>
    <PhoneControl ref={frame} data-phone-control>
      <CountryTrigger ref={trigger} type="button" data-phone-country-trigger disabled={inactive} aria-label={countryDescription}
        aria-haspopup="dialog" aria-expanded={open && !inactive} aria-controls={menuId} onClick={() => open ? closeCountries() : showCountries()}
        onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); showCountries(); } }}>
        {country ? <PhoneCountryFlag key={country.iso2} country={country} /> : <GlobeIcon />}<span>+{parts.callingCode}</span><ChevronDownIcon />
      </CountryTrigger>
      <InputControl {...props} name={undefined} ref={control} id={field.id} type="tel" inputMode="numeric" autoComplete="tel-national"
        value={parts.national} dir="ltr" spellCheck={false} autoCapitalize="none" maxLength={phoneInputMaxLength} data-phone-input data-analytics-ignore
        aria-describedby={field.describedBy} aria-invalid={field.invalid} $invalid={field.isInvalid}
        placeholder={props.placeholder ?? messages.text("phone.nationalPlaceholder")}
        onChange={event => {
          if (inactive) return;
          const raw = event.currentTarget.value;
          // Explicit +/00 input also covers full-number browser autofill without reinterpreting ordinary national typing.
          const normalized = normalizePhone(raw), digits = raw.replace(/\D/gu, "");
          const autofill = digits.length >= 10 && digits.length > parts.national.replace(/\D/gu, "").length + 1
            && normalized && parsePhoneNumberFromString(`+${normalized}`, { extract: false })?.isPossible();
          const incoming = isInternationalPhoneInput(raw) || digits.length >= 10 && raw.startsWith(parts.callingCode) || autofill ? internationalValue(raw) : null;
          change(incoming ?? { ...parts, national: raw });
        }}
        onPaste={event => {
          if (inactive) return;
          const pasted = event.clipboardData.getData("text");
          if (pasted.length > phoneInputMaxLength) { event.preventDefault(); setPasteError(messages.text("phone.paste")); setTouched(true); return; }
          const incoming = internationalValue(pasted);
          if (incoming) { event.preventDefault(); change(incoming); }
        }}
        onBlur={event => { setTouched(true); if (!inactive && canonical) change(splitPhoneValue(canonical, parts.country ?? "UG")); onBlur?.(event); }}
        onInvalid={event => { setTouched(true); onInvalid?.(event); }} />
      <input type="hidden" name={name} value={canonical ?? fullValue} disabled={props.disabled} data-phone-canonical data-analytics-ignore />
    </PhoneControl>
    {field.hasHint && <FieldMessage id={field.hintId}>{hint}</FieldMessage>}
    {field.hasError && <FieldMessage id={field.errorId} $error>{shownError}</FieldMessage>}
    {open && !inactive && createPortal(<CountryMenu ref={menu} id={menuId} role="dialog" aria-label={messages.text("phone.country")}
      style={position} onKeyDown={menuKey} data-phone-country-picker data-analytics-ignore
      onBlur={event => { if (event.relatedTarget instanceof Node && !menu.current?.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) closeCountries(); }}>
      <CountrySearchLabel htmlFor={searchId}>{messages.text("phone.countrySearchLabel")}</CountrySearchLabel>
      <CountrySearch ref={countrySearch} id={searchId} type="search" value={query} onChange={event => setQuery(event.currentTarget.value)}
        placeholder={messages.text("phone.countrySearch")} autoComplete="off" disabled={inactive} data-phone-country-search />
      <CountryResults role="group" aria-label={messages.text("phone.countries")}>
        {options.map(option => <CountryOption key={option.iso2} type="button" disabled={inactive} aria-pressed={parts.country === option.iso2} data-phone-country-option={option.iso2}
          onClick={() => { if (inactive) return; change({ country: option.iso2, callingCode: option.callingCode, national: parts.national }); closeCountries(); control.current?.focus(); }}>
          <PhoneCountryFlag country={option} /><span>{option.name}<small>{option.iso2}{option.iso3 ? ` · ${option.iso3}` : ""}</small></span>
          <span>+{option.callingCode}</span>{parts.country === option.iso2 && <CheckIcon />}
        </CountryOption>)}
        {!options.length && <CountryEmpty>{messages.text("phone.noCountries")}</CountryEmpty>}
      </CountryResults>
      <CountrySearchLabel as="span" role="status">{options.length} {messages.text("phone.countries")}</CountrySearchLabel>
    </CountryMenu>, document.body)}
  </Field>;
}

function PhoneCountryFlag({ country }: { country: PhoneCountry }) {
  const [failed, setFailed] = useState(false);
  return country.flag && !failed ? <DialFlag src={country.flag} width={22} height={16} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <DialFlagFallback aria-hidden="true">{country.iso2}</DialFlagFallback>;
}
const PhoneControl = styled.div`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; min-inline-size: 0;
  > input[data-phone-input] { padding-inline-start: 10px; }
`;
const CountryTrigger = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-block-size: 44px; padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; font: inherit; font-size: 0.875rem;
  white-space: nowrap; cursor: pointer; font-variant-numeric: tabular-nums;
  > svg { inline-size: 14px; block-size: 14px; flex: none; }
  &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  ${focusTreatment}
  @media(max-width: 360px) { gap: 4px; padding-inline: 6px; }
`;
const DialFlag = styled.img`display: block; object-fit: cover; flex: none;`;
const DialFlagFallback = styled.span`
  display: grid; place-items: center; inline-size: 22px; block-size: 16px; flex: none;
  background: ${({ theme }) => theme.color.surfaceMuted}; font-size: 0.625rem; line-height: 1; font-weight: 600;
`;
const CountryMenu = styled.div`
  position: fixed; z-index: 1000; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; box-sizing: border-box; padding: 10px;
  border: 1px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.border.radius}; overflow: hidden;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
`;
const CountrySearch = styled.input`
  box-sizing: border-box; min-inline-size: 0; inline-size: 100%; min-block-size: 44px; padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.border.radius}; font: inherit; font-size: 1rem;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; ${focusTreatment}
`;
const CountrySearchLabel = styled.label`
  position: absolute; inline-size: 1px; block-size: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); clip-path: inset(50%); white-space: nowrap; border: 0;
`;
const CountryResults = styled.div`display: grid; align-content: start; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain;`;
const CountryOption = styled.button`
  display: grid; grid-template-columns: 22px minmax(0, 1fr) auto 16px; align-items: center; gap: 8px;
  inline-size: 100%; min-block-size: 48px; padding: 8px; text-align: start; border: 0; border-radius: 0; cursor: pointer;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; font: inherit; font-size: 0.875rem;
  > span:nth-child(2) { overflow-wrap: anywhere; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
  > span:nth-child(3) { font-variant-numeric: tabular-nums; }
  > svg { inline-size: 16px; block-size: 16px; color: ${({ theme }) => theme.color.brand}; }
  &:hover, &[aria-pressed="true"] { background: ${({ theme }) => theme.color.surfaceMuted}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;
const CountryEmpty = styled.p`margin: 0; padding: 14px 8px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem;`;

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


const Segments = styled.fieldset`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
  > legend { margin-block-end: 6px; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  > label { position: relative; min-inline-size: 0; }
  input { position: absolute; opacity: 0; inline-size: 1px; block-size: 1px; }
  span {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-block-size: 3rem;
    padding: 8px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    font-size: ${({ theme }) => theme.typography.scale.body};
    cursor: pointer;
  }
  label + label > span { border-inline-start: 0; }
  input:checked + span { color: ${({ theme }) => theme.color.onAction}; background: ${({ theme }) => theme.gradient.action}; }
  input:focus-visible + span { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -3px; }
  &:disabled span { cursor: not-allowed; opacity: 0.6; }
`;

/** Two full-size choices, with native radio keyboard and form behavior. */
export function SegmentedChoice<Value extends string>({ label, name, value, options, onValueChange, disabled = false }: {
  label: string; name?: string; value: Value; options: readonly { value: Value; label: string }[];
  onValueChange: (value: Value) => void; disabled?: boolean;
}) {
  const id = useId();
  return <Segments disabled={disabled}><legend>{label}</legend>
    {options.map((option) => <label key={option.value}>
      <input type="radio" name={name ?? id} value={option.value} checked={value === option.value} onChange={() => onValueChange(option.value)} />
      <span>{option.label}</span>
    </label>)}
  </Segments>;
}

/** Native file picker with the same labelled error and hint treatment as other fields. */
export function FileInput(props: Omit<TextInputProps, "type" | "value" | "defaultValue">) {
  return <TextInput {...props} type="file" />;
}
