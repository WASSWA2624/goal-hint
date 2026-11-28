"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, type MouseEvent } from "react";
import styled from "styled-components";
import { ButtonLink, SelectInput } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { KeyIcon } from "@/components/ui/icons";
import { authCopy } from "@/i18n/messages/auth";
import { adminPasswordRequestsApi, passwordRequestOwnershipMethods, passwordRequestSentChannels, passwordRequestStatusLabels,
  type PasswordRequestDetails, type PasswordRequestMutation, type PasswordRequestOwnershipMethod, type PasswordRequestRow, type PasswordRequestSentChannel } from "@/domain/admin-password-requests";
import { passwordResetMessage, whatsappDraftHref } from "@/domain/password-reset-links";
import { formatPhone, smsHref, telHref } from "@/domain/phone";
import { startRequestDeadline } from "@/domain/request-deadline";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { ActionButton, Badge, ButtonRow, CheckField, FieldError, FormStack, Hint, adminControl, postAdmin, replyMessage } from "./admin-form";
import { CopyTextButton } from "./copy-text-button";
import { Panel, PanelBody, PanelHead } from "./desk-styles";
import { refreshPendingPasswordRequests } from "./pending-password-requests";
import { RecordToolbar } from "./record-toolbar";
import { RecordBack, RecordBody, RecordCard, RecordDetailHead, RecordDetails, RecordEmpty, RecordFeedback, RecordItem, RecordItemTitle,
  RecordList, RecordListScroll, RecordListTools, RecordRowContent, RecordScroll, RecordWorkspace, useRecordView } from "./record-workspace";
import { ReviewFacts } from "./referral-review-styles";

type ConfirmationAction = "ownership" | "replacement" | "sent";
type Confirmation = Readonly<{ action: ConfirmationAction; generation: number }>;
const unavailable = "Password requests are temporarily unavailable. Try again.";
const detailUnavailable = "This password request is temporarily unavailable. Try again.";
const readDeadlineMs = 30_000;
type ReadKind = "list" | "detail";

function RequestTime({ value }: { value: string }) {
  return <time dateTime={value}>{formatSubscriptionExpiry(new Date(value))}</time>;
}

function RequestStatus({ status }: { status: PasswordRequestRow["status"] }) {
  return <Badge $tone={status === "pending" ? "warning" : status === "completed" ? "good" : "muted"}>{passwordRequestStatusLabels[status]}</Badge>;
}

async function readRequests<T>(query: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${adminPasswordRequestsApi}${query}`, { cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) throw new RequestReadError(response.status, authCopy.ownerSessionEnded);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new RequestReadError(response.status, typeof body?.message === "string" ? body.message : unavailable);
  }
  return response.json();
}

class RequestReadError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function PasswordRequestsEditor({ initialRequestId }: { initialRequestId?: string }) {
  const id = useId();
  const { detailOpen, openDetail, closeDetail } = useRecordView({ initiallyOpen: !!initialRequestId });
  const [rows, setRows] = useState<readonly PasswordRequestRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId ?? null);
  const [detail, setDetail] = useState<PasswordRequestDetails | null>(null);
  const [listBusy, setListBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState(!!initialRequestId);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [method, setMethod] = useState<PasswordRequestOwnershipMethod>("call");
  const [channel, setChannel] = useState<PasswordRequestSentChannel>("sms");
  const [confirmed, setConfirmed] = useState(false);
  const reading = useRef<Partial<Record<ReadKind, AbortController>>>({});
  const accessEnded = useRef(false);
  const writing = useRef(false);
  const detailsScroll = useRef<HTMLDivElement>(null);
  const confirmationTrigger = useRef<HTMLButtonElement>(null);
  const detailActionBusy = detailBusy || saving || sessionEnded;

  function updateDetail(request: PasswordRequestDetails) {
    setDetail(request);
    setRows(previous => previous?.map(row => row.id === request.id ?
      { id: request.id, phone: request.phone, requestedAt: request.requestedAt, status: request.status } : row) ?? null);
  }

  function cancelReads() {
    reading.current.list?.abort();
    reading.current.detail?.abort();
    reading.current = {};
  }

  function endSession() {
    accessEnded.current = true;
    cancelReads();
    setSessionEnded(true);
    setListBusy(false);
    setDetailBusy(false);
    setRows(null);
    setDetail(null);
    setConfirmation(null);
    setNotice("");
    setError("");
    setListError("");
    setDetailError("");
  }

  async function read(requestId: string | null, quiet = false) {
    const kind = requestId === null ? "list" : "detail";
    if (accessEnded.current || writing.current || quiet && reading.current[kind]) return;
    reading.current[kind]?.abort();
    const controller = new AbortController();
    const clearDeadline = startRequestDeadline(controller, readDeadlineMs);
    const setBusy = kind === "list" ? setListBusy : setDetailBusy;
    const setReadError = kind === "list" ? setListError : setDetailError;
    reading.current[kind] = controller;
    if (!quiet) { setBusy(true); setReadError(""); }
    try {
      if (requestId === null) {
        const { requests } = await readRequests<{ requests: readonly PasswordRequestRow[] }>("", controller.signal);
        if (reading.current.list !== controller) return;
        controller.signal.throwIfAborted();
        if (!Array.isArray(requests)) throw new Error(unavailable);
        setRows(requests);
      } else {
        const { request } = await readRequests<{ request: PasswordRequestDetails }>(`?id=${encodeURIComponent(requestId)}`, controller.signal);
        if (reading.current.detail !== controller) return;
        controller.signal.throwIfAborted();
        if (request?.id !== requestId) throw new Error(detailUnavailable);
        updateDetail(request);
      }
      setReadError("");
    } catch (failure) {
      if (reading.current[kind] !== controller) return;
      if (failure instanceof RequestReadError && (failure.status === 401 || failure.status === 403)) { endSession(); return; }
      if (requestId && failure instanceof RequestReadError && failure.status === 404) {
        setDetail(null);
        setConfirmation(null);
        setReadError(failure.message);
      } else if (!quiet) {
        const message = failure instanceof RequestReadError && failure.status < 500 ? failure.message
          : kind === "detail" ? detailUnavailable : unavailable;
        setReadError(controller.signal.aborted ? "The request took too long. Try again." : message);
      }
    } finally {
      clearDeadline();
      if (reading.current[kind] === controller) {
        delete reading.current[kind];
        setBusy(false);
      }
    }
  }

  const recheckDetail = useEffectEvent(() => {
    if (detailOpen && selectedId && document.visibilityState === "visible") void read(selectedId, true);
  });
  const readInitialRequests = useEffectEvent((requestId?: string) => {
    void read(null);
    if (requestId) void read(requestId);
  });
  useEffect(() => {
    const start = window.setTimeout(() => readInitialRequests(initialRequestId), 0);
    return () => window.clearTimeout(start);
  }, [initialRequestId]);
  useEffect(() => {
    const recheck = () => recheckDetail();
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      cancelReads();
    };
  }, []);

  useEffect(() => {
    if (detail?.status !== "link-generated" || !detail.expiresAt) return;
    const expiresAt = Date.parse(detail.expiresAt);
    const expiry = setTimeout(() => {
      setDetail(current => current?.id === detail.id && current.generation === detail.generation
        ? { ...current, status: "expired", link: null } : current);
      setRows(previous => previous?.map(row => row.id === detail.id && row.status === "link-generated" ? { ...row, status: "expired" } : row) ?? null);
      setConfirmation(current => current?.action === "sent" ? null : current);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(expiry);
  }, [detail]);

  function open(event: MouseEvent<HTMLButtonElement>, requestId: string) {
    if (writing.current || accessEnded.current) return;
    if (selectedId !== requestId) {
      setDetail(null);
      setConfirmation(null);
    }
    setSelectedId(requestId);
    setError("");
    setNotice("");
    openDetail(event.currentTarget);
    detailsScroll.current?.scrollTo({ top: 0 });
    void read(requestId);
  }

  function openConfirmation(event: MouseEvent<HTMLButtonElement>, action: ConfirmationAction, generation: number) {
    confirmationTrigger.current = event.currentTarget;
    setConfirmed(false);
    setError("");
    setNotice("");
    setConfirmation({ action, generation });
  }

  function dismissConfirmation() {
    if (writing.current) return;
    setConfirmation(null);
    setError("");
    requestAnimationFrame(() => confirmationTrigger.current?.focus({ preventScroll: true }));
  }

  async function mutate(input: PasswordRequestMutation) {
    if (writing.current || accessEnded.current) return;
    writing.current = true;
    const restartList = !!reading.current.list;
    cancelReads();
    setListBusy(false);
    setDetailBusy(false);
    setSaving(true);
    setError("");
    setNotice("");
    let refreshDetail = false;
    try {
      const reply = await postAdmin(adminPasswordRequestsApi, input);
      if (!reply.ok) {
        if (reply.status === 401 || reply.status === 403) { endSession(); return; }
        setError(replyMessage(reply, unavailable));
        refreshDetail = reply.status === 404 || reply.status === 409;
        return;
      }
      const request = reply.body.request as PasswordRequestDetails | undefined;
      if (request?.id !== input.id) { setError(unavailable); return; }
      updateDetail(request);
      setConfirmation(null);
      setNotice(input.action === "verify-ownership" ? "Ownership verification recorded."
        : input.action === "mark-sent" ? "Your sending declaration was recorded." : "Password reset link generated.");
      if (input.action === "generate-link") void refreshPendingPasswordRequests(true);
      requestAnimationFrame(() => detailsScroll.current?.focus({ preventScroll: true }));
    } finally {
      writing.current = false;
      setSaving(false);
      if (restartList) void read(null);
      if (refreshDetail) void read(input.id, true);
    }
  }

  const selected = detail ?? rows?.find(row => row.id === selectedId);
  const activeRequest = detail && (detail.status === "pending" || detail.status === "expired" || detail.status === "link-generated");
  const link = detail?.status === "link-generated" ? detail.link : null;
  const message = link ? passwordResetMessage(link) : null;
  const confirmationAction = confirmation?.action;
  const confirmationTitle = confirmationAction === "ownership" ? "Confirm phone ownership" : confirmationAction === "sent" ? "Mark as Sent" : "Replace password reset link";
  const confirmationStale = !!confirmation && confirmation.action !== "ownership" && (confirmation.generation !== detail?.generation
    || (confirmation.action === "sent" ? !link || !!detail?.markedSentAt : !activeRequest));
  const canConfirm = !confirmationStale && (confirmationAction === "replacement" || confirmed);
  function confirm() {
    if (!detail || !confirmation || !canConfirm) return;
    if (confirmation.action === "ownership") void mutate({ id: detail.id, action: "verify-ownership", method, confirmed: true });
    if (confirmation.action === "replacement") void mutate({ id: detail.id, action: "generate-link", generation: confirmation.generation });
    if (confirmation.action === "sent" && link) void mutate({ id: detail.id, action: "mark-sent", channel, generation: confirmation.generation, confirmed: true });
  }

  return <RecordWorkspace $compact $detailOpen={detailOpen} data-password-requests data-analytics-ignore aria-busy={saving || undefined}>
    <RequestToolbar><h1>Password Requests</h1><ActionButton type="button" disabled={listBusy || saving || sessionEnded} onClick={() => {
      setNotice("");
      void read(null);
      if (selectedId && detailOpen) void read(selectedId, true);
      void refreshPendingPasswordRequests(true);
    }}>Refresh requests</ActionButton></RequestToolbar>
    {sessionEnded && <RecordFeedback><FieldError role="alert">{authCopy.ownerSessionEnded}</FieldError></RecordFeedback>}
    <RecordList aria-label="Password requests" aria-busy={listBusy || undefined}>
      {listError && <RecordListTools><FieldError role="alert">{listError}</FieldError></RecordListTools>}
      <RecordListScroll aria-label="Requests" tabIndex={0}>{rows?.length ? rows.map(row => <li key={row.id}>
        <RecordItem type="button" aria-current={row.id === selectedId ? "true" : undefined} aria-controls={`${id}-detail`}
          aria-label={`Open password request for +${formatPhone(row.phone)}, ${passwordRequestStatusLabels[row.status]}, ${formatSubscriptionExpiry(new Date(row.requestedAt))}`}
          disabled={saving} onClick={event => open(event, row.id)}>
          <RecordRowContent icon={<KeyIcon />} primary={<><RecordItemTitle>+{formatPhone(row.phone)}</RecordItemTitle><RequestStatus status={row.status} /></>}
            secondary={<><RequestTime value={row.requestedAt} /> · Open</>} />
        </RecordItem>
      </li>) : rows && <li><RecordEmpty>No password requests</RecordEmpty></li>}</RecordListScroll>
    </RecordList>
    <RecordDetails id={`${id}-detail`} aria-label="Selected password request" aria-busy={detailBusy || undefined}>
      <RecordBack onClick={closeDetail} disabled={saving}>Back to requests</RecordBack>
      <RecordCard><RecordScroll ref={detailsScroll} tabIndex={0} aria-label="Password request details">
        {selected && <RecordDetailHead><h2>+{formatPhone(selected.phone)}</h2><RequestStatus status={selected.status} /></RecordDetailHead>}
        {(notice || error && !confirmation) && <RecordBody>
          {notice && <p role="status">{notice}</p>}
          {error && !confirmation && <FieldError role="alert">{error}</FieldError>}
        </RecordBody>}
        {selectedId && !sessionEnded && !detailBusy && (detailError || !detail) && <RecordEmpty>
          {detailError && <FieldError role="alert">{detailError}</FieldError>}
          <ActionButton type="button" disabled={saving} onClick={() => void read(selectedId)}>Retry request details</ActionButton>
        </RecordEmpty>}
        {detail ? <RecordBody>
            <ReviewFacts>
              <div><dt>Registered phone</dt><dd>+{formatPhone(detail.phone)}</dd></div>
              <div><dt>Requested</dt><dd><RequestTime value={detail.requestedAt} /></dd></div>
              <div><dt>Account created</dt><dd><RequestTime value={detail.accountCreatedAt} /></dd></div>
              <div><dt>Account phone verified</dt><dd>{detail.phoneVerifiedAt ? <RequestTime value={detail.phoneVerifiedAt} /> : "No"}</dd></div>
              {detail.completedAt && <div><dt>Password changed</dt><dd><RequestTime value={detail.completedAt} /></dd></div>}
              {detail.markedSentAt && detail.markedSentChannel && <div><dt>Administrator marked as sent</dt>
                <dd>{passwordRequestSentChannels[detail.markedSentChannel]} · <RequestTime value={detail.markedSentAt} /></dd></div>}
            </ReviewFacts>
            {activeRequest && <Panel>
              <PanelHead><h3>Phone ownership</h3></PanelHead>
              <PanelBody>
                {detail.ownershipVerifiedAt ? <p>Ownership confirmed{detail.ownershipMethod && ` by ${passwordRequestOwnershipMethods[detail.ownershipMethod]}`} on <RequestTime value={detail.ownershipVerifiedAt} />.</p>
                  : <><p>Contact the registered phone yourself and confirm the person who answers requested this reset. Send the reset link only to this number.</p>
                    <ButtonRow><ButtonLink variant="secondary" href={telHref(detail.phone)} prefetch={false}>Call registered phone</ButtonLink>
                      <ActionButton type="button" aria-haspopup="dialog" disabled={detailActionBusy} onClick={event => openConfirmation(event, "ownership", detail.generation)}>Confirm phone ownership</ActionButton></ButtonRow></>}
                {detail.ownershipVerifiedAt && <ButtonRow><ActionButton type="button" $variant="primary" disabled={detailActionBusy}
                  aria-haspopup={link ? "dialog" : undefined} onClick={event => link ? openConfirmation(event, "replacement", detail.generation)
                    : void mutate({ id: detail.id, action: "generate-link", generation: detail.generation })}>
                  {link ? "Replace Password Reset Link" : "Generate Password Reset Link"}
                </ActionButton></ButtonRow>}
              </PanelBody>
            </Panel>}
            {detail.status === "expired" && <Hint>The previous link has expired. Generate a new link if the member still needs it.</Hint>}
            {link && message && <Panel>
              <PanelHead><h3>Reset message</h3></PanelHead>
              <PanelBody>
                {detail.expiresAt && <p>Expires <RequestTime value={detail.expiresAt} />.</p>}
                <DraftField aria-label="Prepared password reset message" readOnly value={message} rows={8} />
                <ButtonRow>
                  <CopyTextButton value={message} label="Copy Message" ariaLabel="Copy Message" subject="message" disabled={detailActionBusy} />
                  <ButtonLink variant="secondary" href={smsHref(detail.phone, message)} prefetch={false} onClick={() => setChannel("sms")}>Send via SMS</ButtonLink>
                  <ButtonLink variant="secondary" href={whatsappDraftHref(detail.phone, message)} prefetch={false} onClick={() => setChannel("whatsapp")}>Send via WhatsApp</ButtonLink>
                </ButtonRow>
                <Hint>Press Send in the messaging app. If it does not open, copy the message or select the text and copy it manually.</Hint>
                {!detail.markedSentAt && <ButtonRow><ActionButton type="button" disabled={detailActionBusy} aria-haspopup="dialog" onClick={event => openConfirmation(event, "sent", detail.generation)}>Mark as Sent</ActionButton></ButtonRow>}
              </PanelBody>
            </Panel>}
          </RecordBody> : !selectedId && !sessionEnded && <RecordEmpty><h2>Open a password request</h2></RecordEmpty>}
      </RecordScroll></RecordCard>
    </RecordDetails>
    {confirmation && detail && <CriteriaDialog id={`${id}-confirmation`} title={confirmationTitle} open onCancel={dismissConfirmation} closeLabel="Close" busy={saving}
      footer={<><CriteriaDialogButton type="button" variant="secondary" disabled={saving} onClick={dismissConfirmation}>Cancel</CriteriaDialogButton>
        <CriteriaDialogButton type="button" disabled={saving || !canConfirm} onClick={confirm}>{confirmationTitle}</CriteriaDialogButton></>}>
      <FormStack>
        {confirmationAction === "replacement" ? <p>Replacing the link invalidates the previous link immediately. The new link will be valid for 24 hours.</p>
          : confirmationAction === "sent" ? <>
            <SelectInput label="Channel used" value={channel} onChange={event => setChannel(event.target.value as PasswordRequestSentChannel)} disabled={saving}>
              {Object.entries(passwordRequestSentChannels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectInput>
            <CheckField><input type="checkbox" checked={confirmed} disabled={saving} onChange={event => setConfirmed(event.target.checked)} />I manually sent the password reset message using this channel.</CheckField>
          </> : <>
            <SelectInput label="How you verified ownership" value={method} onChange={event => setMethod(event.target.value as PasswordRequestOwnershipMethod)} disabled={saving}>
              {Object.entries(passwordRequestOwnershipMethods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectInput>
            <CheckField><input type="checkbox" checked={confirmed} disabled={saving} onChange={event => setConfirmed(event.target.checked)} />I independently contacted the registered phone and confirmed that its owner requested this reset.</CheckField>
          </>}
        {error && <FieldError role="alert">{error}</FieldError>}
        {confirmationStale && !error && <FieldError role="alert">The reset link changed. Close this dialog and review the current link.</FieldError>}
      </FormStack>
    </CriteriaDialog>}
  </RecordWorkspace>;
}

const RequestToolbar = styled(RecordToolbar)`
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
`;

const DraftField = styled.textarea`
  ${adminControl}
  min-inline-size: 0;
  resize: vertical;
  overflow-wrap: anywhere;
`;
