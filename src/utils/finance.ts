import type {
  LedgerEntry,
  PaymentMethod,
  Sale,
  SaleItem,
  SplitPaymentBreakdown,
} from '../types/models';

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatINR(amount: number): string {
  const safe = roundCurrency(amount);
  const absFormatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return safe < 0 ? `-₹${absFormatted}` : `₹${absFormatted}`;
}

export type SaleQuantityUnit = 'pcs' | 'gm' | 'kg' | 'litre';

export const SALE_QUANTITY_UNITS: ReadonlyArray<{
  value: SaleQuantityUnit;
  labelHi: string;
  labelEn: string;
}> = [
  { value: 'pcs', labelHi: 'पीस (Pcs)', labelEn: 'Piece (pcs)' },
  { value: 'gm', labelHi: 'ग्राम (Gm)', labelEn: 'Gram (gm)' },
  { value: 'kg', labelHi: 'किलो (Kg)', labelEn: 'Kilo (kg)' },
  { value: 'litre', labelHi: 'लीटर (L)', labelEn: 'Liter (L)' },
];

export interface ParsedQuantityInput {
  numericQty: number;
  quantityLabel?: string;
  hasValue: boolean;
}

/**
 * Parses a shopkeeper's flexible quantity entry (numbers, decimals, fractions,
 * words like "आधा किलो", or multi-word entries like "2 packet extra") into:
 * - numericQty for accurate ₹ billing math
 * - optional quantityLabel preserving exact typed words/phrases when not a plain number
 */
export function parseQuantityInput(rawText: string): ParsedQuantityInput {
  const trimmed = String(rawText ?? '').trim();
  if (!trimmed) {
    return { numericQty: 0, hasValue: false };
  }

  // Plain finite numeric input (e.g. "2", "2.5", ".5")
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    const num = Math.max(0, Number(trimmed));
    if (!Number.isFinite(num) || num <= 0) {
      return { numericQty: 0, hasValue: false };
    }
    return { numericQty: roundCurrency(num), hasValue: true };
  }

  // Simple leading fraction (e.g. "1/2", "1/2 kilo", "3/4 box")
  const fractionMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?:\s+.*)?$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      const value = Math.max(0, numerator / denominator);
      return {
        numericQty: value > 0 ? Math.round((value + Number.EPSILON) * 1000) / 1000 : 0,
        quantityLabel: trimmed,
        hasValue: value > 0,
      };
    }
  }

  // Mixed numbers + words (e.g. "2 packet", "1.5 kg pack", "box 3")
  const numericMatch = trimmed.match(/(\d+(?:\.\d+)?|\.\d+)/);
  if (numericMatch) {
    const parsedNum = Number(numericMatch[1]);
    if (Number.isFinite(parsedNum)) {
      const safeNum = Math.max(0, parsedNum);
      return {
        numericQty: safeNum > 0 ? Math.round((safeNum + Number.EPSILON) * 1000) / 1000 : 0,
        quantityLabel: trimmed,
        hasValue: safeNum > 0,
      };
    }
  }

  // Pure words/phrases without digits (e.g. "आधा किलो", "one dozen pack") -> bill as 1 × entered price
  return {
    numericQty: 1,
    quantityLabel: trimmed,
    hasValue: true,
  };
}

export function formatSaleItemQuantity(
  item: Pick<SaleItem, 'quantity' | 'quantityLabel' | 'unit'>,
  options: { asciiOnly?: boolean } = {}
): string {
  const unitStr = String(item.unit || '').trim();
  const rawLabel = typeof item.quantityLabel === 'string' ? item.quantityLabel.trim() : '';

  let qtyStr = rawLabel || String(item.quantity);
  if (options.asciiOnly && /[^\x20-\x7E]/.test(qtyStr)) {
    qtyStr = String(item.quantity);
  }

  if (!unitStr) return qtyStr;
  if (qtyStr.toLowerCase().endsWith(unitStr.toLowerCase())) {
    return qtyStr;
  }
  return `${qtyStr} ${unitStr}`;
}

export function calculateLineTotal(quantity: number, unitPrice: number): number {
  if (quantity < 0 || unitPrice < 0) return 0;
  return roundCurrency(quantity * unitPrice);
}

export interface SaleTotalsResult {
  subtotal: number;
  discount: number;
  finalTotal: number;
}

export function calculateSaleTotals(items: Pick<SaleItem, 'quantity' | 'unitPrice'>[], discount = 0): SaleTotalsResult {
  const subtotal = roundCurrency(
    items.reduce((sum, item) => sum + calculateLineTotal(item.quantity, item.unitPrice), 0)
  );
  const safeDiscount = Math.max(0, Math.min(roundCurrency(discount), subtotal));
  const finalTotal = roundCurrency(subtotal - safeDiscount);
  return { subtotal, discount: safeDiscount, finalTotal };
}

export interface PaymentAllocationValidation {
  valid: boolean;
  paidAmount: number;
  dueAmount: number;
  error?: string;
}

export function validateSalePaymentAllocation(
  finalTotal: number,
  paymentMethod: PaymentMethod,
  split?: SplitPaymentBreakdown
): PaymentAllocationValidation {
  const total = roundCurrency(finalTotal);
  if (total <= 0) {
    return { valid: false, paidAmount: 0, dueAmount: 0, error: 'Sale total must be greater than zero' };
  }

  if (paymentMethod === 'cash' || paymentMethod === 'upi' || paymentMethod === 'other') {
    return { valid: true, paidAmount: total, dueAmount: 0 };
  }

  if (paymentMethod === 'udhaar') {
    return { valid: true, paidAmount: 0, dueAmount: total };
  }

  // split
  if (!split) {
    return { valid: false, paidAmount: 0, dueAmount: 0, error: 'Split payment details are required' };
  }

  const cash = roundCurrency(Math.max(0, split.cash));
  const upi = roundCurrency(Math.max(0, split.upi));
  const udhaar = roundCurrency(Math.max(0, split.udhaar));
  const sum = roundCurrency(cash + upi + udhaar);

  if (Math.abs(sum - total) > 0.01) {
    return {
      valid: false,
      paidAmount: 0,
      dueAmount: 0,
      error: `Split amounts (${formatINR(sum)}) must equal total (${formatINR(total)})`,
    };
  }

  return {
    valid: true,
    paidAmount: roundCurrency(cash + upi),
    dueAmount: udhaar,
  };
}

export function validateCustomerPaymentAmount(
  amount: number,
  outstandingBalance: number,
  allowAdvancePayment = false
): { valid: boolean; error?: string } {
  const safeAmount = roundCurrency(amount);
  const safeOutstanding = roundCurrency(outstandingBalance);

  if (safeAmount <= 0) {
    return { valid: false, error: 'Payment amount must be greater than zero' };
  }

  if (!allowAdvancePayment && safeAmount > safeOutstanding) {
    return {
      valid: false,
      error: `Payment (${formatINR(safeAmount)}) cannot exceed outstanding balance (${formatINR(safeOutstanding)})`,
    };
  }

  return { valid: true };
}

export function computeLedgerRunningBalances(
  openingBalance: number,
  entries: Omit<LedgerEntry, 'runningBalance'>[]
): LedgerEntry[] {
  const sorted = [...entries].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  let running = roundCurrency(openingBalance);
  return sorted.map((entry) => {
    running = roundCurrency(running + entry.debit - entry.credit);
    return {
      ...entry,
      runningBalance: running,
    };
  });
}

export function calculateKnownProfit(items: SaleItem[]): number | null {
  const itemsWithCost = items.filter(
    (item) => typeof item.purchaseCost === 'number' && Number.isFinite(item.purchaseCost) && item.purchaseCost >= 0
  );
  if (itemsWithCost.length === 0) {
    return null;
  }
  const profit = itemsWithCost.reduce((acc, item) => {
    const cost = (item.purchaseCost ?? 0) * item.quantity;
    return acc + (item.lineTotal - cost);
  }, 0);
  return roundCurrency(profit);
}

export function generateUniqueRef(prefix: 'INV' | 'RCP'): string {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const randPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${datePart}-${randPart}`;
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats a Date or timestamp string into a local calendar date key (`YYYY-MM-DD`).
 * Plain `YYYY-MM-DD` strings are preserved verbatim without UTC midnight shifting.
 */
export function getLocalDateKey(input: Date | string = new Date()): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return trimmed.slice(0, 10);
    }
    return `${parsed.getFullYear()}-${padTwo(parsed.getMonth() + 1)}-${padTwo(parsed.getDate())}`;
  }

  if (Number.isNaN(input.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}`;
  }
  return `${input.getFullYear()}-${padTwo(input.getMonth() + 1)}-${padTwo(input.getDate())}`;
}

export function getLocalMonthKey(input: Date | string = new Date()): string {
  return getLocalDateKey(input).slice(0, 7);
}

/**
 * Converts a `YYYY-MM-DD` date picker string into a valid ISO timestamp
 * without UTC-midnight date shifting across local timezones.
 */
export function toLocalIsoTimestamp(dateInput: string): string {
  const clean = String(dateInput || '').trim();
  const todayKey = getLocalDateKey(new Date());
  if (!clean || clean === todayKey) {
    return new Date().toISOString();
  }
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const localNoon = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
    return Number.isNaN(localNoon.getTime()) ? new Date().toISOString() : localNoon.toISOString();
  }
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export interface DailySalesTrendPoint {
  dateKey: string;
  label: string;
  totalSales: number;
  saleCount: number;
}

export function computePast7DaysSalesTrend(
  sales: Pick<Sale, 'createdAt' | 'finalTotal' | 'status'>[],
  referenceDate: Date = new Date()
): DailySalesTrendPoint[] {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const totalsByDay = new Map<string, { totalSales: number; saleCount: number }>();

  for (const sale of sales) {
    if (sale.status === 'cancelled') continue;
    const key = typeof sale.createdAt === 'string' ? getLocalDateKey(sale.createdAt) : '';
    if (!key) continue;
    const prev = totalsByDay.get(key) || { totalSales: 0, saleCount: 0 };
    totalsByDay.set(key, {
      totalSales: roundCurrency(prev.totalSales + (Number(sale.finalTotal) || 0)),
      saleCount: prev.saleCount + 1,
    });
  }

  const points: DailySalesTrendPoint[] = [];
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayDate = new Date(refYear, refMonth, refDay - offset, 12, 0, 0);
    const dateKey = getLocalDateKey(dayDate);
    const label = `${padTwo(dayDate.getDate())} ${monthNames[dayDate.getMonth()]}`;
    const bucket = totalsByDay.get(dateKey);
    points.push({
      dateKey,
      label,
      totalSales: bucket ? bucket.totalSales : 0,
      saleCount: bucket ? bucket.saleCount : 0,
    });
  }

  return points;
}
