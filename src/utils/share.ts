import type { Sale } from '../types/models';
import { formatSaleItemQuantity } from './finance';

export function formatPdfInr(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return `${safe < 0 ? '-' : ''}Rs. ${formatted}`;
}

export function normalizeIndianPhoneForWhatsApp(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length >= 12) {
    return digits;
  }
  return '';
}

function formatAmountDisplay(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return `${safe < 0 ? '-' : ''}₹${formatted}`;
}

function formatMethodLabel(method: Sale['paymentMethod'], language: 'hi' | 'en'): string {
  if (language === 'hi') {
    if (method === 'cash') return 'नकद (Cash)';
    if (method === 'upi') return 'UPI';
    if (method === 'udhaar') return 'उधार (Credit)';
    if (method === 'split') return 'मिश्रित (Split)';
    return 'अन्य';
  }
  if (method === 'cash') return 'Cash';
  if (method === 'upi') return 'UPI';
  if (method === 'udhaar') return 'Udhaar (Credit)';
  if (method === 'split') return 'Split';
  return 'Other';
}

export function buildSaleWhatsAppMessage(
  shopName: string,
  sale: Sale,
  language: 'hi' | 'en' = 'hi',
  shopDetails?: { phoneNumber?: string; address?: string }
): string {
  const cleanShop = shopName.trim() || 'KhataNova Store';
  const customerLabel = sale.customerName?.trim() || (language === 'hi' ? 'ग्राहक' : 'Walk-in Customer');
  const created = new Date(sale.createdAt);
  const dateText = created.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeText = created.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const itemLines = sale.items.map(
    (item, idx) =>
      `${idx + 1}. ${item.name} (${formatSaleItemQuantity(item)} × ${formatAmountDisplay(item.unitPrice)}) = ${formatAmountDisplay(item.lineTotal)}`
  );

  if (language === 'hi') {
    const lines = [
      `*${cleanShop}*`,
      ...(shopDetails?.address?.trim() ? [shopDetails.address.trim()] : []),
      ...(shopDetails?.phoneNumber?.trim() ? [`दुकान फ़ोन: ${shopDetails.phoneNumber.trim()}`] : []),
      `बिल नं: ${sale.invoiceId}`,
      `तारीख व समय: ${dateText}, ${timeText}`,
      `ग्राहक: ${customerLabel}`,
      ...(sale.customerPhone?.trim() ? [`फ़ोन: ${sale.customerPhone.trim()}`] : []),
      ``,
      `*सामान विवरण:*`,
      ...itemLines,
      ``,
    ];
    if (sale.discount > 0) {
      lines.push(`उप-कुल: ${formatAmountDisplay(sale.subtotal)}`);
      lines.push(`छूट: -${formatAmountDisplay(sale.discount)}`);
    }
    lines.push(`*कुल राशि: ${formatAmountDisplay(sale.finalTotal)}*`);
    lines.push(`भुगतान: ${formatMethodLabel(sale.paymentMethod, 'hi')}`);
    if (sale.dueAmount > 0) {
      lines.push(`बकाया (उधार): ${formatAmountDisplay(sale.dueAmount)}`);
    }
    lines.push(``);
    lines.push(`धन्यवाद! 🙏`);
    return lines.join('\n');
  }

  const lines = [
    `*${cleanShop}*`,
    ...(shopDetails?.address?.trim() ? [shopDetails.address.trim()] : []),
    ...(shopDetails?.phoneNumber?.trim() ? [`Shop Ph: ${shopDetails.phoneNumber.trim()}`] : []),
    `Invoice: ${sale.invoiceId}`,
    `Date & Time: ${dateText}, ${timeText}`,
    `Customer: ${customerLabel}`,
    ...(sale.customerPhone?.trim() ? [`Phone: ${sale.customerPhone.trim()}`] : []),
    ``,
    `*Items:*`,
    ...itemLines,
    ``,
  ];
  if (sale.discount > 0) {
    lines.push(`Subtotal: ${formatAmountDisplay(sale.subtotal)}`);
    lines.push(`Discount: -${formatAmountDisplay(sale.discount)}`);
  }
  lines.push(`*Final Total: ${formatAmountDisplay(sale.finalTotal)}*`);
  lines.push(`Payment: ${formatMethodLabel(sale.paymentMethod, 'en')}`);
  if (sale.dueAmount > 0) {
    lines.push(`Balance Due: ${formatAmountDisplay(sale.dueAmount)}`);
  }
  lines.push(``);
  lines.push(`Thank you for shopping with us!`);
  return lines.join('\n');
}

export function buildPaymentWhatsAppMessage(input: {
  shopName: string;
  shopPhone?: string;
  customerName: string;
  customerPhone?: string;
  receiptId: string;
  amountPaid: number;
  paymentMethod: 'cash' | 'upi' | 'other';
  paymentDate: string;
  remainingBalance?: number;
  notes?: string;
  language?: 'hi' | 'en';
}): string {
  const language = input.language || 'hi';
  const cleanShop = input.shopName.trim() || 'KhataNova Store';
  const cleanCustomer = input.customerName.trim() || (language === 'hi' ? 'ग्राहक' : 'Customer');
  const dateObj = new Date(input.paymentDate || Date.now());
  const dateText = dateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeText = dateObj.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const methodLabel =
    input.paymentMethod === 'upi'
      ? 'UPI'
      : input.paymentMethod === 'cash'
        ? language === 'hi'
          ? 'नकद (Cash)'
          : 'Cash'
        : language === 'hi'
          ? 'अन्य'
          : 'Other';

  if (language === 'hi') {
    const lines = [
      `*${cleanShop}* — पेमेंट जमा रसीद ✅`,
      ...(input.shopPhone?.trim() ? [`दुकान फ़ोन: ${input.shopPhone.trim()}`] : []),
      `रसीद नं: ${input.receiptId}`,
      `तारीख व समय: ${dateText}, ${timeText}`,
      `ग्राहक: ${cleanCustomer}`,
      ...(input.customerPhone?.trim() ? [`फ़ोन: ${input.customerPhone.trim()}`] : []),
      ``,
      `*जमा राशि: ${formatAmountDisplay(input.amountPaid)}*`,
      `भुगतान माध्यम: ${methodLabel}`,
      ...(typeof input.remainingBalance === 'number'
        ? [
            input.remainingBalance > 0
              ? `बाकी उधार राशि: ${formatAmountDisplay(input.remainingBalance)}`
              : `बाकी उधार: ₹0 (हिसाब पूरा ✅)`,
          ]
        : []),
      ...(input.notes?.trim() ? [`नोट: ${input.notes.trim()}`] : []),
      ``,
      `पेमेंट जमा करने के लिए धन्यवाद! 🙏`,
    ];
    return lines.join('\n');
  }

  const lines = [
    `*${cleanShop}* — Payment Receipt ✅`,
    ...(input.shopPhone?.trim() ? [`Shop Ph: ${input.shopPhone.trim()}`] : []),
    `Receipt No: ${input.receiptId}`,
    `Date & Time: ${dateText}, ${timeText}`,
    `Customer: ${cleanCustomer}`,
    ...(input.customerPhone?.trim() ? [`Phone: ${input.customerPhone.trim()}`] : []),
    ``,
    `*Amount Paid: ${formatAmountDisplay(input.amountPaid)}*`,
    `Payment Method: ${methodLabel}`,
    ...(typeof input.remainingBalance === 'number'
      ? [
          input.remainingBalance > 0
            ? `Remaining Balance: ${formatAmountDisplay(input.remainingBalance)}`
            : `Remaining Balance: ₹0 (Settled ✅)`,
        ]
      : []),
    ...(input.notes?.trim() ? [`Note: ${input.notes.trim()}`] : []),
    ``,
    `Thank you for your payment! 🙏`,
  ];
  return lines.join('\n');
}

export function formatReminderDirectDate(dateInput?: Date | string): string {
  const dateObj =
    dateInput instanceof Date
      ? dateInput
      : dateInput
        ? new Date(dateInput)
        : new Date();
  const safeDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  return safeDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function buildCustomerWhatsAppReminderMessage(input: {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  customerName: string;
  outstandingBalance: number;
  currentDate?: Date | string;
}): string {
  const cleanShopName = input.shopName.trim() || 'KhataNova';
  const cleanShopAddress = (input.shopAddress || '').trim();
  const cleanShopPhone = (input.shopPhone || '').trim();
  const cleanCustomerName = input.customerName.trim() || 'ग्राहक';
  const safeBalance = Number.isFinite(input.outstandingBalance)
    ? input.outstandingBalance
    : 0;
  const directDate = formatReminderDirectDate(input.currentDate);

  const lines = [
    `*${cleanShopName}*`,
    ...(cleanShopAddress ? [`पता: ${cleanShopAddress}`] : []),
    ...(cleanShopPhone ? [`फ़ोन: ${cleanShopPhone}`] : []),
    directDate,
    ``,
    `ग्राहक: ${cleanCustomerName}`,
    `*बकाया राशि: ${formatAmountDisplay(safeBalance)}*`,
    ``,
    `कृपया आप अपना बकाया पैसा जल्द से जल्द दुकान पर जमा कर दें।`,
    ``,
    `धन्यवाद!`,
  ];

  return lines.join('\n');
}

export function buildWhatsAppShareUrl(message: string, phoneNumber?: string): string {
  const normalizedPhone = normalizeIndianPhoneForWhatsApp(phoneNumber);
  const encoded = encodeURIComponent(message);
  return normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function calculateThermalReceiptHeightMm(options: {
  itemCount: number;
  hasDiscount?: boolean;
  hasGst?: boolean;
  hasEmail?: boolean;
  hasCustomerPhone?: boolean;
  hasSplitBreakdown?: boolean;
}): number {
  const baseHeaderAndFooterMm = 112;
  const optionalLinesMm =
    (options.hasDiscount ? 10 : 0) +
    (options.hasGst ? 5 : 0) +
    (options.hasEmail ? 5 : 0) +
    (options.hasCustomerPhone ? 5 : 0) +
    (options.hasSplitBreakdown ? 8 : 0);
  const perItemMm = 10;
  return Math.max(138, baseHeaderAndFooterMm + optionalLinesMm + options.itemCount * perItemMm);
}
