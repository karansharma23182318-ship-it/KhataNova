import { jsPDF } from 'jspdf';
import type { Language, Sale, ShopProfile } from '../types/models';
import { formatSaleItemQuantity } from '../utils/finance';
import {
  buildSaleWhatsAppMessage,
  buildWhatsAppShareUrl,
  calculateThermalReceiptHeightMm,
  formatPdfInr,
} from '../utils/share';

export function exportSalesToCsv(sales: Sale[], filename = 'khatanova-sales-report.csv'): void {
  const headers = ['Invoice ID', 'Date', 'Customer', 'Phone', 'Method', 'Subtotal', 'Discount', 'Total', 'Paid', 'Due', 'Status'];
  const rows = sales.map((s) => [
    s.invoiceId,
    s.createdAt,
    s.customerName || 'Walk-in',
    s.customerPhone || '',
    s.paymentMethod,
    String(s.subtotal),
    String(s.discount),
    String(s.finalTotal),
    String(s.paidAmount),
    String(s.dueAmount),
    s.status,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function resolveShopInfo(shopOrName: ShopProfile | string | null | undefined): {
  shopName: string;
  businessType: string;
  address: string;
  phoneNumber: string;
  email: string;
  gstNumber: string;
} {
  if (!shopOrName || typeof shopOrName === 'string') {
    return {
      shopName: (typeof shopOrName === 'string' && shopOrName.trim()) || 'KhataNova Store',
      businessType: '',
      address: '',
      phoneNumber: '',
      email: '',
      gstNumber: '',
    };
  }
  return {
    shopName: shopOrName.shopName?.trim() || 'KhataNova Store',
    businessType: shopOrName.businessType?.trim() || '',
    address: shopOrName.address?.trim() || '',
    phoneNumber: shopOrName.phoneNumber?.trim() || '',
    email: shopOrName.email?.trim() || '',
    gstNumber: shopOrName.gstNumber?.trim() || '',
  };
}

export function generateSaleInvoicePdf(
  shopOrName: ShopProfile | string | null | undefined,
  sale: Sale,
  customerPhoneOverride?: string
): jsPDF {
  const shop = resolveShopInfo(shopOrName);
  const customerPhone = customerPhoneOverride?.trim() || sale.customerPhone?.trim() || '';
  const totalQty = sale.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

  const pageWidth = 80; // 80mm mall / POS thermal roll width
  const marginX = 4;
  const contentWidth = pageWidth - marginX * 2;
  const rightX = pageWidth - marginX;
  const centerX = pageWidth / 2;

  const estimatedHeight = calculateThermalReceiptHeightMm({
    itemCount: sale.items.length,
    hasDiscount: sale.discount > 0,
    hasGst: Boolean(shop.gstNumber),
    hasEmail: Boolean(shop.email),
    hasCustomerPhone: Boolean(customerPhone),
    hasSplitBreakdown: Boolean(sale.splitBreakdown),
  });

  // Allocate generous vertical strip height so long item names never clip
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidth, Math.max(estimatedHeight, 150 + sale.items.length * 12)],
  });

  let y = 8;

  const drawDashedLine = () => {
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7.5);
    pdf.text('------------------------------------------', centerX, y, { align: 'center' });
    y += 4;
  };

  // 1. Shop Name & Shop Details (Centered Mall Header)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  const shopNameLines = pdf.splitTextToSize(shop.shopName.toUpperCase(), contentWidth);
  for (const line of shopNameLines) {
    pdf.text(line, centerX, y, { align: 'center' });
    y += 4.8;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  if (shop.businessType) {
    pdf.text(shop.businessType.slice(0, 48), centerX, y, { align: 'center' });
    y += 3.6;
  }
  if (shop.address) {
    const addrLines = pdf.splitTextToSize(shop.address, contentWidth);
    for (const line of addrLines) {
      pdf.text(line, centerX, y, { align: 'center' });
      y += 3.5;
    }
  }
  if (shop.phoneNumber) {
    pdf.text(`Ph: ${shop.phoneNumber}`, centerX, y, { align: 'center' });
    y += 3.6;
  }
  if (shop.email) {
    pdf.text(`Email: ${shop.email}`, centerX, y, { align: 'center' });
    y += 3.6;
  }
  if (shop.gstNumber) {
    pdf.text(`GSTIN: ${shop.gstNumber}`, centerX, y, { align: 'center' });
    y += 3.6;
  }

  y += 1;
  drawDashedLine();

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.text(shop.gstNumber ? 'TAX INVOICE / BILL' : 'RETAIL BILL / CASH MEMO', centerX, y, {
    align: 'center',
  });
  y += 4.5;
  drawDashedLine();

  // 2. Bill Meta: Invoice No, Date & Exact Time, Customer Name & Phone Number
  const createdDate = new Date(sale.createdAt);
  const dateStr = createdDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = createdDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text(`Bill No : ${sale.invoiceId}`, marginX, y);
  y += 3.8;
  pdf.text(`Date    : ${dateStr}`, marginX, y);
  y += 3.8;
  pdf.text(`Time    : ${timeStr}`, marginX, y);
  y += 3.8;
  pdf.text(`Customer: ${sale.customerName || 'Walk-in Customer'}`, marginX, y);
  y += 3.8;
  pdf.text(`Cust Ph : ${customerPhone || 'N/A'}`, marginX, y);
  y += 4;

  drawDashedLine();

  // 3. Item Table Header
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.text('ITEM', marginX, y);
  pdf.text('QTY x PRICE', 44, y, { align: 'right' });
  pdf.text('AMT', rightX, y, { align: 'right' });
  y += 3.5;
  drawDashedLine();

  // 4. Item Rows
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  for (const item of sale.items) {
    const nameLines = pdf.splitTextToSize(item.name.trim() || 'Item', contentWidth);
    for (const line of nameLines) {
      pdf.text(line, marginX, y);
      y += 3.6;
    }
    const qtyRateText = `${formatSaleItemQuantity(item, { asciiOnly: true })} x ${formatPdfInr(item.unitPrice)}`;
    pdf.text(qtyRateText, 44, y, { align: 'right' });
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatPdfInr(item.lineTotal), rightX, y, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    y += 4.5;
  }

  drawDashedLine();

  // 5. Totals Section
  pdf.setFontSize(7.5);
  pdf.text(`Items: ${sale.items.length}  |  Qty: ${totalQty}`, marginX, y);
  y += 4.2;

  pdf.text('Subtotal:', marginX, y);
  pdf.text(formatPdfInr(sale.subtotal), rightX, y, { align: 'right' });
  y += 4;

  if (sale.discount > 0) {
    pdf.text('Discount:', marginX, y);
    pdf.text(`-${formatPdfInr(sale.discount)}`, rightX, y, { align: 'right' });
    y += 4;
  }

  drawDashedLine();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('GRAND TOTAL', marginX, y);
  pdf.text(formatPdfInr(sale.finalTotal), rightX, y, { align: 'right' });
  y += 5;
  drawDashedLine();

  // 6. Payment Details & Method
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  const paymentStatusLabel =
    sale.dueAmount <= 0 ? 'PAID' : sale.paidAmount > 0 ? 'PARTIAL' : 'UDHAAR DUE';

  pdf.text(`Payment Method : ${sale.paymentMethod.toUpperCase()}`, marginX, y);
  y += 3.8;
  pdf.text(`Payment Status : ${paymentStatusLabel}`, marginX, y);
  y += 3.8;
  pdf.text(`Paid Amount    : ${formatPdfInr(sale.paidAmount)}`, marginX, y);
  y += 3.8;
  pdf.text(`Balance Due    : ${formatPdfInr(sale.dueAmount)}`, marginX, y);
  y += 3.8;

  if (sale.splitBreakdown) {
    pdf.text(
      `Split: Cash ${formatPdfInr(sale.splitBreakdown.cash)} | UPI ${formatPdfInr(sale.splitBreakdown.upi)} | Due ${formatPdfInr(sale.splitBreakdown.udhaar)}`,
      marginX,
      y
    );
    y += 3.8;
  }

  drawDashedLine();

  // 7. Mall Footer
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('THANK YOU! VISIT AGAIN', centerX, y, { align: 'center' });
  y += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.text('Digital Bill generated by KhataNova', centerX, y, { align: 'center' });

  return pdf;
}

export function buildSaleInvoicePdfFile(
  shopOrName: ShopProfile | string | null | undefined,
  sale: Sale,
  customerPhoneOverride?: string
): File {
  const pdf = generateSaleInvoicePdf(shopOrName, sale, customerPhoneOverride);
  const blob = pdf.output('blob');
  return new File([blob], `${sale.invoiceId}.pdf`, { type: 'application/pdf' });
}

export function downloadSaleInvoicePdf(
  shopOrName: ShopProfile | string | null | undefined,
  sale: Sale,
  customerPhoneOverride?: string
): void {
  const pdf = generateSaleInvoicePdf(shopOrName, sale, customerPhoneOverride);
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sale.invoiceId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareSaleOnWhatsApp(options: {
  shopProfile?: ShopProfile | null;
  shopName: string;
  sale: Sale;
  language: Language;
  customerPhone?: string;
}): Promise<{ mode: 'whatsapp-link'; whatsappUrl: string; message: string }> {
  const { shopProfile, shopName, sale, language, customerPhone } = options;
  const resolvedPhone = customerPhone?.trim() || sale.customerPhone?.trim();
  const message = buildSaleWhatsAppMessage(shopName, sale, language, {
    phoneNumber: shopProfile?.phoneNumber,
    address: shopProfile?.address,
  });
  const whatsappUrl = buildWhatsAppShareUrl(message, resolvedPhone);

  const link = document.createElement('a');
  link.href = whatsappUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return { mode: 'whatsapp-link', whatsappUrl, message };
}

export function openWhatsAppTextLink(whatsappUrl: string): void {
  const link = document.createElement('a');
  link.href = whatsappUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
