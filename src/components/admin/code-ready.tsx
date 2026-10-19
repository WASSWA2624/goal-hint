"use client";
import { useSyncExternalStore } from "react";
import styled from "styled-components";
import { Notice, Panel, PanelHeader } from "@/components/analytics/dashboard/dashboard-styles";
import type { CodeDelivery } from "@/domain/code-delivery";
import { ActionButton, ButtonRow, Hint } from "./admin-form";
const prefix = "goal-hint-owner-code:";
const change = "goal-hint-owner-code-changed";
const subscribe = (notify: () => void) => { window.addEventListener(change, notify); window.addEventListener("storage", notify); return () => { window.removeEventListener(change, notify); window.removeEventListener("storage", notify); }; };
export function clearOwnerCodes() { try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k?.startsWith(prefix)) sessionStorage.removeItem(k); } window.dispatchEvent(new Event(change)); } catch { /* Storage may be disabled. */ } }
export function hasPendingCode(owner: string) { try { return !!sessionStorage.getItem(prefix + owner); } catch { return false; } }
export function rememberCode(owner: string, delivery: CodeDelivery) { try { sessionStorage.setItem(prefix + owner, JSON.stringify(delivery)); window.dispatchEvent(new Event(change)); } catch { /* The response still opens the panel in memory. */ } }
export function CodeReadyPanel({ owner, immediate, done }: { owner: string; immediate?: CodeDelivery | null; done?: () => void }) {
  const raw = useSyncExternalStore(subscribe, () => { try { return sessionStorage.getItem(prefix + owner); } catch { return null; } }, () => null);
  let saved: CodeDelivery | null = null;
  try { const parsed = JSON.parse(raw ?? "null") as CodeDelivery | null; if (parsed && typeof parsed.code === "string" && typeof parsed.message === "string" && typeof parsed.phone === "string") saved = parsed; } catch { /* Invalid local draft. */ }
  const delivery = immediate ?? saved;
  if (!delivery) return null;
  return <Panel data-analytics-ignore aria-label="Code ready"><PanelHeader><h2>Code ready · {delivery.reference}</h2></PanelHeader>
    <LargeCode>{delivery.code}</LargeCode><ButtonRow>
      <ActionButton type="button" onClick={() => { void navigator.clipboard?.writeText(delivery.code); }}>Copy</ActionButton>
      <ActionButton as="a" href={delivery.whatsapp} target="_blank" rel="noopener noreferrer" data-analytics-ignore>WhatsApp</ActionButton>
      <ActionButton as="a" href={delivery.sms} target="_blank" rel="noopener noreferrer" data-analytics-ignore>SMS</ActionButton>
    </ButtonRow><Message>{delivery.message}</Message><Notice $tone="warning">If it is lost, use Reissue; the old code stops working.</Notice>
    <Hint>Keep this panel open while sending the message.</Hint><ActionButton type="button" onClick={() => { try { sessionStorage.removeItem(prefix + owner); window.dispatchEvent(new Event(change)); } catch {} done?.(); }}>Done, sent</ActionButton>
  </Panel>;
}
const LargeCode = styled.p`font-size: clamp(1.3rem, 5vw, 2rem); font-weight: 800; overflow-wrap: anywhere;`;
const Message = styled.p`white-space: pre-wrap; overflow-wrap: anywhere;`;
