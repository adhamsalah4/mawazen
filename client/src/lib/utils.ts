import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** رمز العملة للريال السعودي - يستخدم في عرض المبالغ */
export const CURRENCY_SYMBOL = "ر.س";

/** يعيد رمز العملة للعرض - SAR يُعرض كـ ر.س */
export function formatCurrencySymbol(currency?: string | null): string {
  const c = (currency ?? "SAR").toUpperCase();
  return c === "SAR" ? CURRENCY_SYMBOL : c;
}
