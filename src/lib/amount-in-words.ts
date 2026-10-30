const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const UNITS: [number, string][] = [
  [10_000_000, "Crore"],
  [100_000, "Lakh"],
  [1_000, "Thousand"],
];

function toWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred` + (n % 100 ? ` ${toWords(n % 100)}` : "");
  for (const [size, name] of UNITS) {
    if (n >= size) {
      const rest = n % size;
      return `${toWords(Math.floor(n / size))} ${name}` + (rest ? ` ${toWords(rest)}` : "");
    }
  }
  return "";
}

/** An amount in rupees written out the Indian way (lakh, crore) as quotations and invoices show it. */
export function amountInWords(amount: number): string {
  const totalPaise = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  if (rupees === 0 && paise === 0) return "Rupees Zero Only";
  if (rupees === 0) return `${toWords(paise)} Paise Only`;
  return `Rupees ${toWords(rupees)}${paise ? ` and ${toWords(paise)} Paise` : ""} Only`;
}
