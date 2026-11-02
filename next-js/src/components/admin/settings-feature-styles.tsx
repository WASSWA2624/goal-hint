"use client";

import { controlRow } from "@/components/ui/control-layout";

import styled from "styled-components";
import { adminControl } from "./admin-form";

export const FeatureBody = styled.div`
  display: grid; gap: var(--gh-spacing-4); min-inline-size: 0; padding: var(--gh-spacing-4_5);
  h2 { font-size: var(--gh-font-section); line-height: var(--gh-leading-caption); }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: var(--gh-leading-normal); }
  input:not([type="checkbox"], [type="radio"]), select, textarea { ${adminControl} }
`;
export const FeatureHeading = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3); min-inline-size: 0;
  > div { display: grid; gap: var(--gh-spacing-0_75); }
  > button { flex: none; }
`;
export const ContactList = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
`;
export const ContactRow = styled.section`
  border-radius: ${({ theme }) => theme.radius.surface};
  display: grid; gap: var(--gh-spacing-2_5); min-inline-size: 0; padding: var(--gh-spacing-3_5);
  border: 0;
  background: ${({ theme }) => theme.color.surface};
`;
export const ContactFields = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(var(--gh-size-28), .6fr) minmax(0, 1.2fr); gap: var(--gh-spacing-3); align-items: start;
  > * { min-inline-size: 0; }
  @container (max-width: ${({ theme }) => theme.viewport[44]}) { grid-template-columns: minmax(0, 1fr) minmax(var(--gh-size-28), .65fr); > :last-child { grid-column: 1 / -1; } }
`;
export const ContactOptions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1_5) var(--gh-spacing-4_5); min-inline-size: 0;
  label { display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); min-block-size: var(--form-control-height); font-size: ${({ theme }) => theme.typography.scale.secondary} !important; font-weight: var(--gh-weight-body) !important; }
  input { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); accent-color: ${({ theme }) => theme.color.brand}; }
  > div { display: flex; gap: var(--gh-spacing-1_5); margin-inline-start: auto; }
  button { min-block-size: var(--form-control-height); padding-inline: var(--gh-spacing-2_5); font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
export const MessageLayout = styled.div`
  display: grid; grid-template-columns: minmax(var(--gh-size-40), .8fr) minmax(0, 2.5fr); min-inline-size: 0;
  @container (max-width: ${({ theme }) => theme.viewport[42]}) { grid-template-columns: minmax(0, 1fr); }
`;
export const EventList = styled.nav`
  display: grid; gap: var(--gh-spacing-0_75); align-content: start; min-inline-size: 0; padding: var(--gh-spacing-3);
  border-inline-end: 0;
  > button { display: grid; gap: var(--gh-spacing-0_75); padding: var(--gh-spacing-2_5) var(--gh-spacing-3); min-block-size: var(--gh-size-13); border: 0; border-inline-start: 0; background: transparent; color: ${({ theme }) => theme.color.text}; font: inherit; text-align: start; cursor: pointer; }
  > button > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.caption}; }
  > button[aria-current="true"] {  background: ${({ theme }) => theme.color.brandSoft}; }
  > button:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  @container (max-width: ${({ theme }) => theme.viewport[42]}) { display: flex; overflow-x: auto; border-inline-end: 0; border-block-end: 0; > button { flex: none; min-inline-size: var(--gh-size-40); } }
`;
export const MessageOptions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2_5) var(--gh-spacing-4_5);
  label { display: inline-flex; gap: var(--gh-spacing-1_75); align-items: center; min-block-size: var(--form-control-height); font-weight: var(--gh-weight-body) !important; }
  input { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); accent-color: ${({ theme }) => theme.color.brand}; }
`;
export const MessageTabs = styled.div`
  display: flex; flex-wrap: wrap; gap: 0; border-block-end: 0;
  button { padding: var(--gh-spacing-2) var(--gh-spacing-3_5); border: 0; border-block-end: 0; color: ${({ theme }) => theme.color.mutedText}; background: transparent; font: inherit; cursor: pointer; }
  button[aria-pressed="true"] { background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link}; font-weight: var(--gh-weight-bold); }
  button:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
`;
export const VariableBar = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--gh-spacing-2); align-items: center;
  select { min-inline-size: 0; }

  ${controlRow}
`;
export const MessagePreview = styled.div`
  display: grid; gap: var(--gh-spacing-2); padding: var(--gh-spacing-3) var(--gh-spacing-3_5); background: ${({ theme }) => theme.color.surfaceMuted}; min-inline-size: 0;
  > strong { font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  > pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: var(--gh-leading-relaxed); }
`;
export const SourceList = styled.dl`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--gh-spacing-1_5) var(--gh-spacing-3); margin: 0; font-size: ${({ theme }) => theme.typography.scale.secondary};
  dt { font-weight: var(--gh-weight-semibold); } dd { margin: 0; font-size: inherit !important; color: ${({ theme }) => theme.color.mutedText}; overflow-wrap: anywhere; }
`;
