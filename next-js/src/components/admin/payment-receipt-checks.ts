export const paymentReceiptChecks = [
  ["transactionChecked", "Transaction ID matches the transfer"],
  ["recipientChecked", "Correct receiving account"],
  ["successfulReceipt", "Funds received and amount checked"],
  ["senderChecked", "Sender details checked where available"],
] as const;
