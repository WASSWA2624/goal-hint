"use client";

import { AlertIcon, DocumentIcon } from "@/components/ui/icons";
import type { PaymentOcrQuality } from "@/domain/payment-ocr-result";
import { CheckoutTranscriptionStatus } from "./checkout-details-styles";

const score = (value: number | null) => value === null ? "Unavailable" : `${Math.round(value)}/100`;

/** Reading scores always describe the retained OCR, never the member's corrections. */
export function PaymentTranscriptionStatus({ ocr, needsReview, warning, imageText, showImageText }: {
  ocr: PaymentOcrQuality | null; needsReview: boolean; warning?: string | undefined; imageText: string; showImageText: boolean;
}) {
  return <CheckoutTranscriptionStatus role="status" data-transcription-status={needsReview ? "review" : "extracted"}>
    <strong>{needsReview ? <AlertIcon /> : <DocumentIcon />}{needsReview ? "Needs review" : "Text extracted"}
      {ocr && <span data-ocr-confidence>OCR {score(ocr.confidence)}</span>}
    </strong>
    {needsReview && <p>{warning ?? "Check the transaction ID, amount and number used to pay against the image."}</p>}
    {ocr && <details>
      <summary>Reading confidence</summary>
      <dl>
        <div><dt>Transaction ID</dt><dd>{score(ocr.fieldConfidence.transactionId)}</dd></div>
        <div><dt>Amount paid</dt><dd>{score(ocr.fieldConfidence.amountUgx)}</dd></div>
      </dl>
      <p>Scores estimate the original image reading, not your corrections or payment verification. Check unclear text against the image.</p>
    </details>}
    {showImageText && imageText && <details><summary>Text from image</summary><p>{imageText}</p></details>}
  </CheckoutTranscriptionStatus>;
}
