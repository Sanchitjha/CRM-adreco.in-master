/**
 * A WhatsApp chat link for a phone number written the way people write them in India ("98765 43210", "+91 98765
 * 43210", "098765-43210"). Ten-digit numbers get the country code 91; longer ones are used as they are. Returns null
 * when there are too few digits to be a number.
 */
export function whatsappUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.length === 10 ? `91${digits}` : digits.startsWith("0") ? `91${digits.slice(-10)}` : digits;
  return `https://wa.me/${international}`;
}
