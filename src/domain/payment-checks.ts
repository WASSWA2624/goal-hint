// Owner payment checks: hints beside a report, never proof. Approval sends nothing (068); access reaches the account's devices.
export type PaymentCheck = Readonly<{ tone: "good" | "warning" | "info"; text: string }>;
/**
 * `received` is the owner's own amount received (null until approval); `transactionId` says the subscriber gave one.
 * `screenshotAmount` is what the subscriber's browser read from their screenshot: undefined without a screenshot, null when no
 * amount could be read. It only points the owner at the image; their wallet SMS stays the proof.
 */
export function paymentChecks(input: { received: number | null; price: number; transactionId: boolean; approved: string | null; pending: string | null;
  image: string | null; payerAccount: boolean; payerDiffers: boolean; screenshotAmount?: number | null; purpose?: "plan" | "topup" }): PaymentCheck[] {
  const shillings = (amount: number) => `UGX ${amount.toLocaleString("en-UG")}`;
  const price = `UGX ${input.price.toLocaleString("en-UG")}`;
  return [
    typeof input.received !== "number" ? { tone: "info", text: `Check your wallet SMS shows ${price} received` }
      : { tone: input.received >= input.price ? "good" : "warning", text: input.received >= input.price ? "Amount received covers the plan price" : `UGX ${input.received.toLocaleString("en-UG")} received is below the ${price} price` },
    ...(input.transactionId ? [
      { tone: input.approved ? "warning" : "good", text: input.approved ? `Already approved in ${input.approved}` : "ID never approved on either network" },
      { tone: input.pending ? "warning" : "good", text: input.pending ? `Also in ${input.pending} (another account)` : "No other account has this ID pending" },
    ] as const : [{ tone: "info", text: "No transaction ID given; take it from your wallet SMS" } as const]),
    { tone: input.image ? "warning" : "good", text: input.image ? `Same file as ${input.image}` : "No identical image" },
    { tone: input.payerAccount ? "warning" : "info", text: input.payerAccount ? "Payer has its own Goal Hint account" : "No other payer account found" },
    { tone: input.payerDiffers && (input.image || input.payerAccount) ? "warning" : "info", text: input.payerDiffers ? "Payer differs from the account number; verify the sender before approving" : "Payer matches the account number" },
    ...(input.screenshotAmount === undefined ? [] : [input.screenshotAmount === null
      ? { tone: "info", text: "No amount read from the screenshot; check it in the image" } as const
      : input.screenshotAmount >= input.price ? { tone: "good", text: `Screenshot shows UGX ${input.screenshotAmount.toLocaleString("en-UG")}` } as const
        : { tone: "warning", text: `Screenshot shows UGX ${input.screenshotAmount.toLocaleString("en-UG")}, below the ${price} price` } as const]),
    // Credit: a top-up credits all of what you record as received; a plan payment credits what you record above its price.
    ...(input.purpose === "topup" ? [{ tone: "info", text: "Credit top-up: the amount you record as received is added to the account's credit" } as const]
      : typeof input.screenshotAmount === "number" && input.screenshotAmount > input.price
        ? [{ tone: "info", text: `${shillings(input.screenshotAmount - input.price)} above the price becomes credit if you record ${shillings(input.screenshotAmount)} received` } as const] : []),
  ];
}
