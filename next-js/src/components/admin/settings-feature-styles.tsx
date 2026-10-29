"use client";

import styled from "styled-components";
import { adminControl } from "./admin-form";

export const FeatureBody = styled.div`
  display: grid; gap: 16px; min-inline-size: 0; padding: 18px;
  h2 { font-size: 1rem; line-height: 1.35; }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: 1.5; }
  input:not([type="checkbox"], [type="radio"]), select, textarea { ${adminControl} border-radius: 0; }
  button { border-radius: 0; }
`;
export const FeatureHeading = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; min-inline-size: 0;
  > div { display: grid; gap: 3px; }
  > button { flex: none; }
`;
export const ContactList = styled.div`
  display: grid; gap: 12px; min-inline-size: 0;
`;
export const ContactRow = styled.section`
  display: grid; gap: 10px; min-inline-size: 0; padding: 14px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
`;
export const ContactFields = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(7rem, .6fr) minmax(0, 1.2fr); gap: 12px; align-items: start;
  > * { min-inline-size: 0; }
  @container (max-width: 44rem) { grid-template-columns: minmax(0, 1fr) minmax(7rem, .65fr); > :last-child { grid-column: 1 / -1; } }
`;
export const ContactOptions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; min-inline-size: 0;
  label { display: inline-flex; align-items: center; gap: 6px; min-block-size: 32px; font-size: ${({ theme }) => theme.typography.scale.secondary} !important; font-weight: normal !important; }
  input { inline-size: 16px; block-size: 16px; accent-color: ${({ theme }) => theme.color.brand}; }
  > div { display: flex; gap: 6px; margin-inline-start: auto; }
  button { min-block-size: 32px; padding-inline: 10px; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
export const MessageLayout = styled.div`
  display: grid; grid-template-columns: minmax(10rem, .8fr) minmax(0, 2.5fr); min-inline-size: 0;
  @container (max-width: 42rem) { grid-template-columns: minmax(0, 1fr); }
`;
export const EventList = styled.nav`
  display: grid; gap: 3px; align-content: start; min-inline-size: 0; padding: 12px;
  border-inline-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > button { display: grid; gap: 3px; padding: 10px 12px; min-block-size: 52px; border: 0; border-inline-start: 3px solid transparent; background: transparent; color: ${({ theme }) => theme.color.text}; font: inherit; text-align: start; cursor: pointer; }
  > button > span { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.caption}; }
  > button[aria-current="true"] { border-inline-start-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
  > button:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  @container (max-width: 42rem) { display: flex; overflow-x: auto; border-inline-end: 0; border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; > button { flex: none; min-inline-size: 10rem; } }
`;
export const MessageOptions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px;
  label { display: inline-flex; gap: 7px; align-items: center; min-block-size: 32px; font-weight: normal !important; }
  input { inline-size: 16px; block-size: 16px; accent-color: ${({ theme }) => theme.color.brand}; }
`;
export const MessageTabs = styled.div`
  display: flex; flex-wrap: wrap; gap: 0; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  button { padding: 8px 14px; border: 0; border-block-end: 2px solid transparent; color: ${({ theme }) => theme.color.mutedText}; background: transparent; font: inherit; cursor: pointer; }
  button[aria-pressed="true"] { border-block-end-color: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.link}; font-weight: 700; }
  button:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;
export const VariableBar = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center;
  select { min-inline-size: 0; }
`;
export const MessagePreview = styled.div`
  display: grid; gap: 8px; padding: 12px 14px; background: ${({ theme }) => theme.color.surfaceMuted}; min-inline-size: 0;
  > strong { font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  > pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: 1.55; }
`;
export const SourceList = styled.dl`
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; margin: 0; font-size: ${({ theme }) => theme.typography.scale.secondary};
  dt { font-weight: 600; } dd { margin: 0; font-size: inherit !important; color: ${({ theme }) => theme.color.mutedText}; overflow-wrap: anywhere; }
`;
