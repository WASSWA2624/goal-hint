import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const directory = process.argv[2];
if (!directory) throw new Error("Pass the preview screenshot directory.");
await mkdir(directory, { recursive: true });
const examples = [
  ["valid-payment", "888877776666"], ["another-payment", "888877776667"], ["reported-payment", "999988887777"], ["not-payment", null],
  ["airtel-payment", "888877776668", "Airtel Money", "0700000902"], ["wrong-recipient", "888877776669", "Airtel Money", "0700000901"],
];
for (const [name, transactionId, network = "MTN Mobile Money", recipient = "0700000901"] of examples) {
  const lines = transactionId ? ["SYNTHETIC TEST PAYMENT", network, "Payment successful", "Paid UGX 5,000", `Transaction ID: ${transactionId}`,
    `To: ${recipient}`, "Date: 01/11/2026 17:00", "Never send real money"] : ["SHOPPING LIST", "Apples", "Rice", "Milk", "This is not a payment receipt"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1050"><rect width="1000" height="1050" fill="white"/>
    <g fill="black" font-family="Arial, sans-serif" font-size="36">${lines.map((line, i) => `<text x="48" y="${80 + i * 100}">${line}</text>`).join("")}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(directory, `${name}.png`));
}
