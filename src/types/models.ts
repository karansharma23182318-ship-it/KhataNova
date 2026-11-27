export type Language = 'hi' | 'en';

export type SubscriptionStatus =
  | 'free'
  | 'pending'
  | 'premium_active'
  | 'rejected'
  | 'suspended';

export type AccountStatus = 'active' | 'suspended';

export type PaymentMethod = 'cash' | 'upi' | 'udhaar' | 'split' | 'other';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  phoneNumber?: string;
  role: 'shopkeeper' | 'admin';
  shopId?: string;
  language: Language;
  subscriptionStatus: SubscriptionStatus;
  proModeEnabled?: boolean;
  accountStatus: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShopProfile {
  id: string;
  ownerUid: string;
  ownerName: string;
  shopName: string;
  phoneNumber: string;
  whatsappNumber?: string;
  businessType: string;
  address: string;
  gstNumber?: string;
  email: string;
  aboutBusiness?: string;
  logoUrl?: string;
  paymentUpiId?: string;
  paymentQrUrl?: string;
  stockManagementEnabled: boolean;
  reminderEnabled: boolean;
  reminderIntervalDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  mobileNumber: string;
  address?: string;
  notes?: string;
  openingBalance: number;
  outstandingBalance: number;
  totalCredit: number;
  totalPaid: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: string;
  itemId?: string;
  name: string;
  quantity: number;
  quantityLabel?: string;
  unit: string;
  unitPrice: number;
  purchaseCost?: number;
  lineTotal: number;
}

export interface SplitPaymentBreakdown {
  cash: number;
  upi: number;
  udhaar: number;
}

export interface Sale {
  id: string;
  invoiceId: string;
  shopId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  finalTotal: number;
  paymentMethod: PaymentMethod;
  splitBreakdown?: SplitPaymentBreakdown;
  paidAmount: number;
  dueAmount: number;
  status: 'completed' | 'cancelled';
  cancellationReason?: string;
  notes?: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  receiptId: string;
  shopId: string;
  customerId?: string;
  customerName?: string;
  saleId?: string;
  amount: number;
  paymentMethod: Exclude<PaymentMethod, 'udhaar' | 'split'>;
  paymentDate: string;
  notes?: string;
  createdByUid: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  shopId: string;
  customerId: string;
  transactionDate: string;
  description: string;
  itemSummary?: string;
  type: 'debit' | 'credit';
  debit: number;
  credit: number;
  amount: number;
  referenceId: string;
  runningBalance: number;
  createdByUid: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  shopId: string;
  name: string;
  quantity: number;
  unit: string;
  purchaseCost?: number;
  sellingPrice: number;
  lowStockThreshold: number;
  updatedAt: string;
}

export interface PremiumPaymentRequest {
  id: string;
  uid: string;
  shopId: string;
  shopkeeperName: string;
  shopName: string;
  phoneNumber: string;
  email: string;
  amount: number;
  utrNumber: string;
  paymentDate: string;
  screenshotUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedByAdminUid?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  uid: string;
  shopId: string;
  senderName: string;
  shopName: string;
  phoneNumber: string;
  subject: string;
  status: 'pending' | 'replied' | 'resolved';
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderUid: string;
  senderRole: 'shopkeeper' | 'admin';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface InAppNotification {
  id: string;
  uid: string;
  title: string;
  message: string;
  category: 'premium' | 'support' | 'notice' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface AdminPaymentSettings {
  upiId: string;
  qrImageUrl: string;
  instructions: string;
  updatedAt: string;
  updatedByUid: string;
}

export interface AdminAuditLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface AdminSiteSettings {
  noticeBanner: string;
  supportPhone: string;
  supportEmail: string;
  premiumPriceInr: number;
  planNotice: string;
  updatedAt: string;
  updatedByUid: string;
}

export interface DueReminderSettings {
  enabled: boolean;
  intervalDays: number;
  browserPushEnabled: boolean;
  updatedAt: string;
}

export interface DueReminderNotification {
  id: string;
  shopId: string;
  ownerUid: string;
  customerId: string;
  customerName: string;
  pendingAmount: number;
  dueDate: string;
  anchorDate: string;
  intervalDays: number;
  cycleNumber: number;
  dedupeKey: string;
  status: 'active' | 'cleared';
  isRead: boolean;
  readAt?: string;
  clearedAt?: string;
  actionUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductBatch {
  id: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD verified from physical package; never inferred from barcode
  quantity: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalProduct {
  barcode: string;
  name: string;
  brand?: string;
  packSize?: string;
  categories?: string;
  imageUrl?: string;
  unit: string;
  suggestedPrice?: number;
  source: 'community' | 'openfoodfacts';
  createdByUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NovaProduct {
  id: string;
  shopId: string;
  barcode?: string;
  name: string;
  brand?: string;
  packSize?: string;
  categories?: string;
  imageUrl?: string;
  unit: string;
  sellingPrice?: number;
  source: 'global' | 'openfoodfacts' | 'manual';
  batches: ProductBatch[];
  createdAt: string;
  updatedAt: string;
}

export interface GlobalProductLookupResult {
  found: boolean;
  barcode: string;
  source: 'global' | 'openfoodfacts' | 'cache' | 'shop';
  cached: boolean;
  productName?: string;
  brand?: string;
  packSize?: string;
  productQuantity?: string | number;
  categories?: string;
  imageUrl?: string;
  suggestedPrice?: number;
  globalProduct?: GlobalProduct | null;
  shopProduct?: NovaProduct | null;
  message?: string;
}
