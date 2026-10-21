// Owner payment checks: hints beside a report, never proof. Approval sends nothing (068); access reaches the account's devices.
export type PaymentCheck = Readonly<{ tone: "good" | "warning" | "info"; text: string }>;
/** `received` is the owner's own amount received (null until approval); `transactionId` says the subscriber gave one. */
export function paymentChecks(input: { received: number | null; price: number; transactionId: boolean; approved: string | null; pending: string | null;
  image: string | null; payerAccount: boolean; payerDiffers: boolean }): PaymentCheck[] {
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
  ];
}
