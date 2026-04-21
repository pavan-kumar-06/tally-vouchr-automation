import type { StatementEntry } from "@vouchr/contracts";

const sampleNarrations = [
  "UPI/AR/218716584238/DR/NA/00060010008",
  "NEFTO-SHRI DHARJWAL MATA MANDIR 000523138615",
  "IMPSAR/2094215523/63/IBKL0000530/0530",
  "Charges for PORD Customer Payment",
  "NETBANKING TRANSFER TO VENDOR"
];

export function mockStatementEntries(count = 850): StatementEntry[] {
  return Array.from({ length: count }).map((_, index) => {
    const isDebit = index % 4 !== 0;
    return {
      row_id: `tx_${String(index + 1).padStart(6, "0")}`,
      date: `2024-03-${String((index % 28) + 1).padStart(2, "0")}`,
      narration: `${sampleNarrations[index % sampleNarrations.length]} ${index + 1}`,
      amount: Number((Math.random() * 12000 + 50).toFixed(2)),
      type: isDebit ? "DEBIT" : "CREDIT",
      voucher_type: isDebit ? "Payment" : "Receipt",
      is_contra: false,
      excluded: false,
      ledger_name: index % 5 === 0 ? "Bank Charges" : null,
      confidence: 0.8,
      raw_reference: `${index + 1}`
    };
  });
}
