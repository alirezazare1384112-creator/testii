/**
 * Persian formatting helpers — numbers, prices, dates.
 *
 * - toPersianDigits: converts any number/string's latin digits to Persian digits.
 * - formatToman: integer toman -> "۱٬۲۰۰٬۰۰۰ تومان" (Persian digits + Persian
 *   thousands separator «٬»). null/undefined/NaN -> "نامشخص".
 * - formatNumber: integer -> Persian-digit grouped string.
 * - formatPersianDate: ISO string -> "YYYY/MM/DD" Persian digits, or "نامشخص".
 * - formatDistanceKm: number -> "X کیلومتر" Persian digits.
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "نامشخص";
  // Group with Persian thousands separator «٬».
  const grouped = Math.round(n).toLocaleString("en-US");
  return toPersianDigits(grouped);
}

export function formatToman(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "نامشخص";
  return `${formatNumber(n)} تومان`;
}

/** Format a price range compactly for filter chips: "تا ۱٬۰۰۰٬۰۰۰" / "از ۵۰۰٬۰۰۰". */
export function formatTomanShort(n: number | null | undefined, prefix: "از" | "تا"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return `${prefix} ${formatNumber(n)} تومان`;
}

/** ISO date string -> "YYYY/MM/DD" in Persian digits. Returns "نامشخص" on null/invalid. */
export function formatPersianDate(iso: string | null | undefined): string {
  if (!iso) return "نامشخص";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "نامشخص";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return toPersianDigits(`${yyyy}/${mm}/${dd}`);
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return "";
  // Round to 1 decimal for sub-10 km distances, integer otherwise.
  const v = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${toPersianDigits(v)} کیلومتر`;
}
