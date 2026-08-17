/**
 * Currencies offered in the bill-splitting UI.
 *
 * `fxSupported` marks the ones Frankfurter (ECB reference rates) can quote. For
 * anything else the app still works — the user just enters the rate by hand, or
 * uses the statement total, which is the better answer anyway.
 */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  /** Quotable via the Frankfurter/ECB rate feed. */
  fxSupported: boolean;
}

export const CURRENCIES: ReadonlyArray<CurrencyInfo> = [
  { code: "USD", name: "US Dollar", symbol: "$", fxSupported: true },
  { code: "EUR", name: "Euro", symbol: "€", fxSupported: true },
  { code: "GBP", name: "British Pound", symbol: "£", fxSupported: true },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", fxSupported: true },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", fxSupported: true },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", fxSupported: true },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", fxSupported: true },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", fxSupported: true },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", fxSupported: true },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", fxSupported: true },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", fxSupported: true },
  { code: "DKK", name: "Danish Krone", symbol: "kr", fxSupported: true },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", fxSupported: true },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", fxSupported: true },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", fxSupported: true },
  { code: "RON", name: "Romanian Leu", symbol: "lei", fxSupported: true },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", fxSupported: true },
  { code: "ISK", name: "Icelandic Krona", symbol: "kr", fxSupported: true },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", fxSupported: true },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪", fxSupported: true },
  { code: "ZAR", name: "South African Rand", symbol: "R", fxSupported: true },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", fxSupported: true },
  { code: "INR", name: "Indian Rupee", symbol: "₹", fxSupported: true },
  { code: "CNY", name: "Chinese Yuan", symbol: "CN¥", fxSupported: true },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", fxSupported: true },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", fxSupported: true },
  { code: "KRW", name: "South Korean Won", symbol: "₩", fxSupported: true },
  { code: "THB", name: "Thai Baht", symbol: "฿", fxSupported: true },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", fxSupported: true },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", fxSupported: true },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", fxSupported: true },
  // Common travel destinations the ECB feed does not quote — manual rate only.
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", fxSupported: false },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$", fxSupported: false },
  { code: "CLP", name: "Chilean Peso", symbol: "CL$", fxSupported: false },
  { code: "COP", name: "Colombian Peso", symbol: "CO$", fxSupported: false },
  { code: "CRC", name: "Costa Rican Colon", symbol: "₡", fxSupported: false },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$", fxSupported: false },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", fxSupported: false },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH", fxSupported: false },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/", fxSupported: false },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$", fxSupported: false },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", fxSupported: false },
];

export const DEFAULT_CURRENCY = "USD";

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string | null | undefined): CurrencyInfo | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function getCurrencyName(code: string | null | undefined): string {
  return getCurrency(code)?.name ?? (code ?? DEFAULT_CURRENCY).toUpperCase();
}

/** True when the Frankfurter rate feed can quote this pair. */
export function canAutoConvert(from: string, to: string): boolean {
  return !!getCurrency(from)?.fxSupported && !!getCurrency(to)?.fxSupported;
}

/** A well-formed ISO 4217 code — not necessarily one we list above. */
export function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}
