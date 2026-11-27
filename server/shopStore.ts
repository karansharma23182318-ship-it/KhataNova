import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AccountStatus,
  AdminAuditLog,
  AdminPaymentSettings,
  AdminSiteSettings,
  Customer,
  DueReminderNotification,
  DueReminderSettings,
  GlobalProduct,
  LedgerEntry,
  NovaProduct,
  PaymentRecord,
  PremiumPaymentRequest,
  ProductBatch,
  Sale,
  ShopProfile,
  SubscriptionStatus,
  SupportMessage,
  SupportTicket,
  UserProfile,
} from '../src/types/models.ts';
import {
  formatSaleItemQuantity,
  generateUniqueRef,
  validateCustomerPaymentAmount,
  validateSalePaymentAllocation,
} from '../src/utils/finance.ts';
import {
  doPackSizesConflict,
  isValidBarcode,
  normalizeBarcode,
} from '../src/utils/novaScan.ts';
import type { RateBookItem } from '../src/utils/calculator.ts';
import {
  clampReminderIntervalDays,
  createDefaultReminderSettings,
  normalizeReminderSettings,
  reconcileDueNotifications,
  type CustomerDueEvaluation,
} from '../src/utils/dueReminders.ts';

interface PersistedDatabase {
  users: Record<string, UserProfile>;
  shops: Record<string, ShopProfile>;
  customers: Record<string, Customer[]>;
  sales: Record<string, Sale[]>;
  payments: Record<string, PaymentRecord[]>;
  ledger: Record<string, LedgerEntry[]>;
  dueReminderSettings: Record<string, DueReminderSettings>;
  dueNotifications: Record<string, DueReminderNotification[]>;
  novaProducts: Record<string, NovaProduct[]>;
  globalProducts: Record<string, GlobalProduct>;
  rateBooks: Record<string, RateBookItem[]>;
  supportTickets: SupportTicket[];
  supportMessages: Record<string, SupportMessage[]>;
  premiumRequests: PremiumPaymentRequest[];
  adminPaymentSettings: AdminPaymentSettings | null;
  adminSiteSettings: AdminSiteSettings;
  adminAuditLogs: AdminAuditLog[];
}

function defaultSiteSettings(): AdminSiteSettings {
  return {
    noticeBanner: '',
    supportPhone: '',
    supportEmail: '',
    premiumPriceInr: 199,
    planNotice: 'One-time ₹199 Lifetime Upgrade via UPI QR',
    updatedAt: '',
    updatedByUid: 'system',
  };
}

function emptyDb(): PersistedDatabase {
  return {
    users: {},
    shops: {},
    customers: {},
    sales: {},
    payments: {},
    ledger: {},
    dueReminderSettings: {},
    dueNotifications: {},
    novaProducts: {},
    globalProducts: {},
    rateBooks: {},
    supportTickets: [],
    supportMessages: {},
    premiumRequests: [],
    adminPaymentSettings: null,
    adminSiteSettings: defaultSiteSettings(),
    adminAuditLogs: [],
  };
}

export class ShopDataStore {
  private readonly storePath: string | null;
  private data: PersistedDatabase;

  constructor(storePath?: string | null) {
    this.storePath =
      storePath === undefined ? path.resolve(process.cwd(), '.khatanova-db.json') : storePath;
    this.data = this.loadFromDisk();
  }

  private loadFromDisk(): PersistedDatabase {
    if (!this.storePath || !fs.existsSync(this.storePath)) {
      return emptyDb();
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedDatabase>;
      return {
        ...emptyDb(),
        ...parsed,
        adminSiteSettings: {
          ...defaultSiteSettings(),
          ...(parsed.adminSiteSettings || {}),
        },
      };
    } catch {
      return emptyDb();
    }
  }

  private persist(): void {
    if (!this.storePath) return;
    const tmpPath = `${this.storePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tmpPath, this.storePath);
  }

  public getOrInitProfile(
    uid: string,
    defaults: { email: string; displayName?: string; photoURL?: string }
  ): { userProfile: UserProfile; shopProfile: ShopProfile | null } {
    const now = new Date().toISOString();
    let userProfile = this.data.users[uid];
    if (!userProfile) {
      userProfile = {
        uid,
        displayName: defaults.displayName || 'Shopkeeper',
        email: defaults.email || '',
        ...(defaults.photoURL ? { photoURL: defaults.photoURL } : {}),
        role: 'shopkeeper',
        language: 'hi',
        subscriptionStatus: 'free',
        accountStatus: 'active',
        createdAt: now,
        updatedAt: now,
      };
      this.data.users[uid] = userProfile;
      this.persist();
    }
    const targetShopId = userProfile.shopId || uid;
    const shopProfile = this.data.shops[targetShopId] || null;
    return { userProfile, shopProfile };
  }

  public getUserSnapshot(uid: string): {
    userProfile: UserProfile | null;
    shopProfile: ShopProfile | null;
    customers: Customer[];
    sales: Sale[];
    payments: PaymentRecord[];
    ledger: LedgerEntry[];
    dueReminderSettings: DueReminderSettings;
    dueNotifications: DueReminderNotification[];
    novaProducts: NovaProduct[];
    rateBook: RateBookItem[];
  } {
    const userProfile = this.data.users[uid] || null;
    const targetShopId = userProfile?.shopId || uid;
    return {
      userProfile,
      shopProfile: this.data.shops[targetShopId] || null,
      customers: this.listCustomers(targetShopId),
      sales: this.listSales(targetShopId),
      payments: this.listPayments(targetShopId),
      ledger: this.listLedger(targetShopId),
      dueReminderSettings: this.getDueReminderSettings(targetShopId),
      dueNotifications: [...(this.data.dueNotifications[targetShopId] || [])],
      novaProducts: this.listNovaProducts(targetShopId),
      rateBook: [...(this.data.rateBooks[targetShopId] || [])],
    };
  }

  public syncShopSnapshot(
    uid: string,
    defaults: { email: string; displayName?: string; photoURL?: string },
    incoming?: {
      shopProfile?: ShopProfile | null;
      customers?: Customer[];
      sales?: Sale[];
      payments?: PaymentRecord[];
      ledger?: LedgerEntry[];
      dueReminderSettings?: DueReminderSettings | null;
      dueNotifications?: DueReminderNotification[];
      novaProducts?: NovaProduct[];
      rateBook?: RateBookItem[];
    } | null,
    trustedUserProfile?: UserProfile | null
  ): {
    userProfile: UserProfile;
    shopProfile: ShopProfile | null;
    customers: Customer[];
    sales: Sale[];
    payments: PaymentRecord[];
    ledger: LedgerEntry[];
    dueReminderSettings: DueReminderSettings;
    dueNotifications: DueReminderNotification[];
    novaProducts: NovaProduct[];
    rateBook: RateBookItem[];
  } {
    const existedBefore = Boolean(this.data.users[uid]);
    const { userProfile: initializedUser } = this.getOrInitProfile(uid, defaults);
    const shopId = initializedUser.shopId || uid;
    let changed = false;

    // 0. Restore Pro / account status ONLY from trusted Firebase RTDB snapshot after container reset
    // Never accept subscriptionStatus directly from untrusted client req.body
    if (trustedUserProfile && trustedUserProfile.uid === uid) {
      const current = this.data.users[uid];
      const trustedUpdatedAt = trustedUserProfile.updatedAt || '';
      const currentUpdatedAt = current.updatedAt || '';
      const trustedIsNewer = Boolean(trustedUpdatedAt) && trustedUpdatedAt > currentUpdatedAt;
      const trustedIsPremier = trustedUserProfile.subscriptionStatus === 'premium_active';
      const currentIsPremier = current.subscriptionStatus === 'premium_active';

      const downgradedMoreRecentlyByAdmin = this.data.adminAuditLogs.some(
        (log) =>
          log.targetId === uid &&
          (log.action === 'UPDATE_USER_STATUS' || log.action === 'REJECT_PREMIUM_UTR') &&
          Boolean(log.createdAt) &&
          log.createdAt > trustedUpdatedAt
      );

      const needsPremierRestore =
        trustedIsPremier && !currentIsPremier && !downgradedMoreRecentlyByAdmin;
      const needsInitialRestore = !existedBefore || needsPremierRestore;

      if (needsInitialRestore || trustedIsNewer) {
        // Never accidentally downgrade an active Premier user back to free/pending from a stale RTDB copy
        const resolvedSubscriptionStatus =
          currentIsPremier &&
          !trustedIsPremier &&
          !downgradedMoreRecentlyByAdmin
            ? current.subscriptionStatus
            : trustedUserProfile.subscriptionStatus || current.subscriptionStatus;

        const resolvedProModeEnabled =
          trustedUserProfile.proModeEnabled !== undefined &&
          (trustedIsNewer || !existedBefore || current.proModeEnabled === undefined)
            ? trustedUserProfile.proModeEnabled
            : current.proModeEnabled;

        this.data.users[uid] = {
          ...current,
          ...(trustedUserProfile.displayName ? { displayName: trustedUserProfile.displayName } : {}),
          ...(trustedUserProfile.phoneNumber ? { phoneNumber: trustedUserProfile.phoneNumber } : {}),
          ...(trustedUserProfile.shopId ? { shopId: trustedUserProfile.shopId } : {}),
          ...(trustedUserProfile.language ? { language: trustedUserProfile.language } : {}),
          subscriptionStatus: resolvedSubscriptionStatus,
          ...(resolvedProModeEnabled !== undefined
            ? { proModeEnabled: resolvedProModeEnabled }
            : {}),
          accountStatus: trustedUserProfile.accountStatus || current.accountStatus,
          createdAt: trustedUserProfile.createdAt || current.createdAt,
          updatedAt:
            trustedUpdatedAt > currentUpdatedAt
              ? trustedUpdatedAt
              : currentUpdatedAt || new Date().toISOString(),
        };
        changed = true;
      }
    }

    // 1. Restore shopProfile if missing on server or incoming is strictly newer
    const currentUserAfterRestore = this.data.users[uid];
    const existingShop = this.data.shops[shopId] || null;
    const incShop = incoming?.shopProfile;
    if (
      incShop &&
      incShop.shopName &&
      (!existingShop || (incShop.updatedAt && incShop.updatedAt > (existingShop.updatedAt || '')))
    ) {
      this.data.shops[shopId] = {
        ...incShop,
        id: shopId,
        ownerUid: uid,
      };
      this.data.users[uid] = {
        ...currentUserAfterRestore,
        shopId,
        updatedAt: currentUserAfterRestore.updatedAt || new Date().toISOString(),
      };
      changed = true;
    }

    // 2. Non-destructive merge of Customers by id (never drops saved customers)
    const mergeById = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
      current: T[],
      incomingList: T[] | undefined,
      normalize: (item: T) => T
    ): { list: T[]; didChange: boolean } => {
      if (!Array.isArray(incomingList) || incomingList.length === 0) {
        return { list: current, didChange: false };
      }
      const map = new Map<string, T>();
      for (const item of current) {
        if (item && item.id) map.set(item.id, item);
      }
      let didChange = false;
      for (const raw of incomingList) {
        if (!raw || typeof raw.id !== 'string' || !raw.id) continue;
        const item = normalize(raw);
        const prev = map.get(item.id);
        if (!prev) {
          map.set(item.id, item);
          didChange = true;
        } else {
          const prevStamp = prev.updatedAt || prev.createdAt || '';
          const nextStamp = item.updatedAt || item.createdAt || '';
          if (nextStamp > prevStamp) {
            map.set(item.id, item);
            didChange = true;
          }
        }
      }
      return { list: Array.from(map.values()), didChange };
    };

    const custMerge = mergeById(
      this.data.customers[shopId] || [],
      incoming?.customers,
      (c) => ({ ...c, shopId, isActive: c.isActive ?? true })
    );
    if (custMerge.didChange) {
      this.data.customers[shopId] = custMerge.list;
      changed = true;
    }

    const salesMerge = mergeById(
      this.data.sales[shopId] || [],
      incoming?.sales,
      (s) => ({ ...s, shopId })
    );
    if (salesMerge.didChange) {
      this.data.sales[shopId] = salesMerge.list;
      changed = true;
    }

    const payMerge = mergeById(
      this.data.payments[shopId] || [],
      incoming?.payments,
      (p) => ({ ...p, shopId })
    );
    if (payMerge.didChange) {
      this.data.payments[shopId] = payMerge.list;
      changed = true;
    }

    const ledgerMerge = mergeById(
      this.data.ledger[shopId] || [],
      incoming?.ledger,
      (l) => ({ ...l, shopId })
    );
    if (ledgerMerge.didChange) {
      this.data.ledger[shopId] = ledgerMerge.list;
      changed = true;
    }

    const incSettings = incoming?.dueReminderSettings;
    const currentSettings = this.data.dueReminderSettings[shopId];
    if (
      incSettings &&
      (!currentSettings ||
        (incSettings.updatedAt && incSettings.updatedAt > (currentSettings.updatedAt || '')))
    ) {
      this.data.dueReminderSettings[shopId] = normalizeReminderSettings(incSettings);
      changed = true;
    }

    const notifMerge = mergeById(
      this.data.dueNotifications[shopId] || [],
      incoming?.dueNotifications,
      (n) => ({ ...n, shopId, ownerUid: uid })
    );
    if (notifMerge.didChange) {
      this.data.dueNotifications[shopId] = notifMerge.list;
      changed = true;
    }

    const novaMerge = mergeById(
      this.data.novaProducts[shopId] || [],
      incoming?.novaProducts,
      (p) => ({
        ...p,
        shopId,
        batches: Array.isArray(p.batches) ? p.batches : [],
      })
    );
    if (novaMerge.didChange) {
      this.data.novaProducts[shopId] = novaMerge.list;
      changed = true;
    }

    // Seed shared Global Product DB non-destructively from existing shop barcoded items
    for (const np of this.data.novaProducts[shopId] || []) {
      const cleanBarcode = np.barcode ? normalizeBarcode(np.barcode) : '';
      if (cleanBarcode && isValidBarcode(cleanBarcode) && np.name) {
        this.upsertGlobalProduct(uid, {
          barcode: cleanBarcode,
          name: np.name,
          brand: np.brand,
          packSize: np.packSize,
          categories: np.categories,
          imageUrl: np.imageUrl,
          unit: np.unit,
          suggestedPrice: np.sellingPrice,
          source: np.source === 'openfoodfacts' ? 'openfoodfacts' : 'community',
        });
      }
    }

    const rateMerge = mergeById(
      this.data.rateBooks[shopId] || [],
      incoming?.rateBook,
      (r) => ({
        ...r,
        name: String(r.name || '').trim(),
        baseRate: Math.max(0, Number(r.baseRate) || 0),
      })
    );
    if (rateMerge.didChange) {
      this.data.rateBooks[shopId] = rateMerge.list.slice(0, 60);
      changed = true;
    }

    if (changed) {
      this.persist();
    }

    const reconciled = this.reconcileShopDueNotifications(uid);

    return {
      userProfile: this.data.users[uid],
      shopProfile: this.data.shops[shopId] || null,
      customers: this.listCustomers(shopId),
      sales: this.listSales(shopId),
      payments: this.listPayments(shopId),
      ledger: this.listLedger(shopId),
      dueReminderSettings: reconciled.settings,
      dueNotifications: reconciled.notifications,
      novaProducts: this.listNovaProducts(shopId),
      rateBook: [...(this.data.rateBooks[shopId] || [])],
    };
  }

  public saveShopSetup(
    uid: string,
    emailFallback: string,
    input: {
      ownerName?: string;
      shopName: string;
      phoneNumber: string;
      whatsappNumber?: string;
      businessType: string;
      address: string;
      gstNumber?: string;
      email?: string;
      aboutBusiness?: string;
      logoUrl?: string;
      paymentUpiId?: string;
      paymentQrUrl?: string;
      stockManagementEnabled?: boolean;
      reminderEnabled?: boolean;
      reminderIntervalDays?: number;
    }
  ): { userProfile: UserProfile; shopProfile: ShopProfile } {
    const shopName = input.shopName.trim();
    const phoneNumber = input.phoneNumber.trim();
    const businessType = input.businessType.trim();
    const address = input.address.trim();

    if (!shopName || !phoneNumber || !businessType || !address) {
      throw new Error('Shop Name, Phone Number, Business Category, and Shop Address are required.');
    }

    const now = new Date().toISOString();
    const shopId = uid;
    const existingShop = this.data.shops[shopId];
    const existingUser = this.data.users[uid];

    const ownerName = (input.ownerName || '').trim() || existingUser?.displayName || shopName;
    const finalEmail = (input.email || '').trim() || existingUser?.email || emailFallback || '';

    const resolvedPaymentUpiId =
      input.paymentUpiId !== undefined
        ? input.paymentUpiId.trim().toLowerCase()
        : (existingShop?.paymentUpiId || '');
    if (
      resolvedPaymentUpiId &&
      !/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9]{2,32}$/i.test(resolvedPaymentUpiId)
    ) {
      throw new Error('Please enter a valid UPI ID (e.g. 9876543210@ybl or shop@okicici).');
    }

    const resolvedPaymentQrUrl =
      input.paymentQrUrl !== undefined
        ? input.paymentQrUrl.trim()
        : (existingShop?.paymentQrUrl || '');

    const shopProfile: ShopProfile = {
      id: shopId,
      ownerUid: uid,
      ownerName,
      shopName,
      phoneNumber,
      whatsappNumber: (input.whatsappNumber || '').trim() || phoneNumber,
      businessType,
      address,
      gstNumber: (input.gstNumber || '').trim(),
      email: finalEmail,
      aboutBusiness: (input.aboutBusiness || '').trim(),
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
      ...(resolvedPaymentUpiId ? { paymentUpiId: resolvedPaymentUpiId } : {}),
      ...(resolvedPaymentQrUrl ? { paymentQrUrl: resolvedPaymentQrUrl } : {}),
      stockManagementEnabled: Boolean(input.stockManagementEnabled),
      reminderEnabled: input.reminderEnabled ?? true,
      reminderIntervalDays: Number(input.reminderIntervalDays || 7),
      createdAt: existingShop?.createdAt || now,
      updatedAt: now,
    };

    const userProfile: UserProfile = {
      uid,
      displayName: ownerName,
      email: finalEmail,
      ...(existingUser?.photoURL ? { photoURL: existingUser.photoURL } : {}),
      phoneNumber,
      role: existingUser?.role || 'shopkeeper',
      shopId,
      language: existingUser?.language || 'hi',
      subscriptionStatus: existingUser?.subscriptionStatus || 'free',
      ...(existingUser?.proModeEnabled !== undefined
        ? { proModeEnabled: existingUser.proModeEnabled }
        : {}),
      accountStatus: existingUser?.accountStatus || 'active',
      createdAt: existingUser?.createdAt || now,
      updatedAt: now,
    };

    this.data.shops[shopId] = shopProfile;
    this.data.users[uid] = userProfile;
    const prevNotifSettings = this.data.dueReminderSettings[shopId];
    this.data.dueReminderSettings[shopId] = normalizeReminderSettings({
      enabled: shopProfile.reminderEnabled,
      intervalDays: shopProfile.reminderIntervalDays,
      browserPushEnabled: prevNotifSettings?.browserPushEnabled ?? false,
      updatedAt: now,
    });
    this.persist();

    return { userProfile, shopProfile };
  }

  public listCustomers(shopId: string, mobileFilter?: string): Customer[] {
    const list = [...(this.data.customers[shopId] || [])];
    if (mobileFilter && mobileFilter.trim()) {
      const cleaned = mobileFilter.trim();
      return list.filter((c) => c.mobileNumber.trim() === cleaned);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  public getCustomer(shopId: string, customerId: string): Customer | null {
    const list = this.data.customers[shopId] || [];
    return list.find((c) => c.id === customerId) || null;
  }

  public createCustomer(
    shopId: string,
    input: {
      name: string;
      mobileNumber: string;
      address?: string;
      notes?: string;
      openingBalance?: number;
    }
  ): Customer {
    const ownerProfile = this.data.users[shopId];
    const isPro =
      ownerProfile?.subscriptionStatus === 'premium_active' &&
      ownerProfile?.proModeEnabled !== false;
    const list = this.data.customers[shopId] || [];
    if (!isPro && list.length >= 10) {
      throw new Error(
        ownerProfile?.subscriptionStatus === 'premium_active'
          ? 'Normal/Free Mode active (10-customer cap). Switch Premier Mode back ON to add more customers without paying again.'
          : 'Free plan limit reached: You can add up to 10 customers on Free Plan. Upgrade to Lifetime Pro (₹199) for unlimited customers.'
      );
    }

    const name = input.name.trim();
    const mobileNumber = input.mobileNumber.trim();
    if (name.length < 2 || mobileNumber.length < 10) {
      throw new Error('Enter valid customer name and 10-digit mobile number.');
    }
    const now = new Date().toISOString();
    const opening = Math.max(0, Number(input.openingBalance || 0));
    const customer: Customer = {
      id: crypto.randomUUID(),
      shopId,
      name,
      mobileNumber,
      address: input.address?.trim() || '',
      notes: input.notes?.trim() || '',
      openingBalance: opening,
      outstandingBalance: opening,
      totalCredit: opening > 0 ? opening : 0,
      totalPaid: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    list.push(customer);
    this.data.customers[shopId] = list;
    this.persist();
    return customer;
  }

  public updateCustomer(
    shopId: string,
    customerId: string,
    updates: Partial<Pick<Customer, 'name' | 'mobileNumber' | 'address' | 'notes' | 'isActive'>>
  ): Customer {
    const list = this.data.customers[shopId] || [];
    const idx = list.findIndex((c) => c.id === customerId);
    if (idx === -1) {
      throw new Error('Customer not found.');
    }
    const updated: Customer = {
      ...list[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    this.data.customers[shopId] = list;
    this.persist();
    return updated;
  }

  public listSales(shopId: string): Sale[] {
    const list = [...(this.data.sales[shopId] || [])];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getSale(shopId: string, saleId: string): Sale | null {
    const list = this.data.sales[shopId] || [];
    return list.find((s) => s.id === saleId) || null;
  }

  public createAtomicSale(
    shopId: string,
    uid: string,
    payload: Omit<
      Sale,
      | 'id'
      | 'invoiceId'
      | 'shopId'
      | 'paidAmount'
      | 'dueAmount'
      | 'status'
      | 'createdByUid'
      | 'createdAt'
      | 'updatedAt'
    >
  ): { saleId: string; invoiceId: string; sale: Sale } {
    const allocation = validateSalePaymentAllocation(
      Number(payload.finalTotal),
      payload.paymentMethod,
      payload.splitBreakdown
    );
    if (!allocation.valid) {
      throw new Error(allocation.error || 'Invalid payment allocation');
    }

    const cleanCustomerId = payload.customerId?.trim() || '';
    const cleanCustomerName = payload.customerName?.trim() || 'Walk-in Customer';
    let cleanCustomerPhone = payload.customerPhone?.trim() || '';
    if (allocation.dueAmount > 0 && !cleanCustomerId) {
      throw new Error('Customer selection is required for Udhaar / credit sales.');
    }

    const customers = this.data.customers[shopId] || [];
    let customerIdx = -1;
    if (cleanCustomerId) {
      customerIdx = customers.findIndex((c) => c.id === cleanCustomerId);
      if (customerIdx === -1) {
        throw new Error('Selected customer record does not exist.');
      }
      if (!cleanCustomerPhone) {
        cleanCustomerPhone = customers[customerIdx].mobileNumber || '';
      }
    }

    const cleanItems = payload.items.map((item) => ({
      id: item.id,
      ...(item.itemId ? { itemId: item.itemId } : {}),
      name: item.name.trim(),
      quantity: Number(item.quantity),
      ...(typeof item.quantityLabel === 'string' && item.quantityLabel.trim()
        ? { quantityLabel: item.quantityLabel.trim() }
        : {}),
      unit: item.unit?.trim() || 'pcs',
      unitPrice: Number(item.unitPrice),
      ...(typeof item.purchaseCost === 'number' ? { purchaseCost: item.purchaseCost } : {}),
      lineTotal: Number(item.lineTotal),
    }));

    const now = new Date().toISOString();
    const invoiceId = generateUniqueRef('INV');
    const saleId = crypto.randomUUID();

    const sale: Sale = {
      id: saleId,
      invoiceId,
      shopId,
      ...(cleanCustomerId ? { customerId: cleanCustomerId } : {}),
      customerName: cleanCustomerName,
      ...(cleanCustomerPhone ? { customerPhone: cleanCustomerPhone } : {}),
      items: cleanItems,
      subtotal: Number(payload.subtotal),
      discount: Number(payload.discount),
      finalTotal: Number(payload.finalTotal),
      paymentMethod: payload.paymentMethod,
      ...(payload.splitBreakdown ? { splitBreakdown: payload.splitBreakdown } : {}),
      paidAmount: allocation.paidAmount,
      dueAmount: allocation.dueAmount,
      status: 'completed',
      ...(payload.notes?.trim() ? { notes: payload.notes.trim() } : {}),
      createdByUid: uid,
      createdAt: now,
      updatedAt: now,
    };

    const sales = this.data.sales[shopId] || [];
    sales.push(sale);
    this.data.sales[shopId] = sales;

    if (allocation.paidAmount > 0) {
      const resolvedPaymentMethod: 'cash' | 'upi' | 'other' =
        payload.paymentMethod === 'upi'
          ? 'upi'
          : payload.paymentMethod === 'split' &&
              (payload.splitBreakdown?.upi || 0) > 0 &&
              (payload.splitBreakdown?.cash || 0) === 0
            ? 'upi'
            : 'cash';
      const payment: PaymentRecord = {
        id: crypto.randomUUID(),
        receiptId: generateUniqueRef('RCP'),
        shopId,
        ...(cleanCustomerId ? { customerId: cleanCustomerId } : {}),
        customerName: cleanCustomerName,
        saleId,
        amount: allocation.paidAmount,
        paymentMethod: resolvedPaymentMethod,
        paymentDate: now,
        notes: `Payment for ${invoiceId}`,
        createdByUid: uid,
        createdAt: now,
      };
      const payments = this.data.payments[shopId] || [];
      payments.push(payment);
      this.data.payments[shopId] = payments;
    }

    if (allocation.dueAmount > 0 && customerIdx !== -1) {
      const cust = customers[customerIdx];
      const nextBalance = (cust.outstandingBalance || 0) + allocation.dueAmount;
      customers[customerIdx] = {
        ...cust,
        outstandingBalance: nextBalance,
        totalCredit: (cust.totalCredit || 0) + allocation.dueAmount,
        updatedAt: now,
      };
      this.data.customers[shopId] = customers;

      const ledgerEntry: LedgerEntry = {
        id: crypto.randomUUID(),
        shopId,
        customerId: cleanCustomerId,
        transactionDate: now,
        description: `Credit Sale (${invoiceId})`,
        itemSummary: cleanItems
          .map((i) => `${i.name} (${formatSaleItemQuantity(i)})`)
          .join(', '),
        type: 'debit',
        debit: allocation.dueAmount,
        credit: 0,
        amount: allocation.dueAmount,
        referenceId: invoiceId,
        runningBalance: nextBalance,
        createdByUid: uid,
        createdAt: now,
      };
      const ledger = this.data.ledger[shopId] || [];
      ledger.push(ledgerEntry);
      this.data.ledger[shopId] = ledger;
    }

    this.persist();
    this.reconcileShopDueNotifications(shopId);
    return { saleId, invoiceId, sale };
  }

  public listPayments(shopId: string): PaymentRecord[] {
    const list = [...(this.data.payments[shopId] || [])];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public recordCustomerPayment(
    shopId: string,
    uid: string,
    input: {
      customerId: string;
      amount: number;
      paymentMethod: 'cash' | 'upi' | 'other';
      paymentDate: string;
      notes?: string;
      allowAdvance?: boolean;
    }
  ): { paymentId: string; receiptId: string; remainingBalance: number } {
    const customers = this.data.customers[shopId] || [];
    const customerIdx = customers.findIndex((c) => c.id === input.customerId);
    if (customerIdx === -1) {
      throw new Error('Customer not found.');
    }

    const cust = customers[customerIdx];
    const check = validateCustomerPaymentAmount(
      Number(input.amount),
      cust.outstandingBalance || 0,
      Boolean(input.allowAdvance)
    );
    if (!check.valid) {
      throw new Error(check.error || 'Invalid payment amount.');
    }

    const now = new Date().toISOString();
    const receiptId = generateUniqueRef('RCP');
    const paymentId = crypto.randomUUID();
    const nextBalance = (cust.outstandingBalance || 0) - Number(input.amount);

    const payment: PaymentRecord = {
      id: paymentId,
      receiptId,
      shopId,
      customerId: input.customerId,
      customerName: cust.name,
      amount: Number(input.amount),
      paymentMethod: input.paymentMethod,
      paymentDate: input.paymentDate || now,
      notes: input.notes?.trim() || '',
      createdByUid: uid,
      createdAt: now,
    };

    const payments = this.data.payments[shopId] || [];
    payments.push(payment);
    this.data.payments[shopId] = payments;

    customers[customerIdx] = {
      ...cust,
      outstandingBalance: nextBalance,
      totalPaid: (cust.totalPaid || 0) + Number(input.amount),
      updatedAt: now,
    };
    this.data.customers[shopId] = customers;

    const ledgerEntry: LedgerEntry = {
      id: crypto.randomUUID(),
      shopId,
      customerId: input.customerId,
      transactionDate: input.paymentDate || now,
      description: `Payment Received (${receiptId})`,
      type: 'credit',
      debit: 0,
      credit: Number(input.amount),
      amount: Number(input.amount),
      referenceId: receiptId,
      runningBalance: nextBalance,
      createdByUid: uid,
      createdAt: now,
    };
    const ledger = this.data.ledger[shopId] || [];
    ledger.push(ledgerEntry);
    this.data.ledger[shopId] = ledger;

    this.persist();
    this.reconcileShopDueNotifications(shopId);
    return { paymentId, receiptId, remainingBalance: nextBalance };
  }

  public listLedger(shopId: string, customerId?: string): LedgerEntry[] {
    let list = [...(this.data.ledger[shopId] || [])];
    if (customerId) {
      list = list.filter((e) => e.customerId === customerId);
    }
    return list.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }

  public getDueReminderSettings(shopId: string): DueReminderSettings {
    const saved = this.data.dueReminderSettings[shopId];
    if (saved) {
      return normalizeReminderSettings(saved);
    }
    const shop = this.data.shops[shopId];
    if (shop) {
      return normalizeReminderSettings({
        enabled: shop.reminderEnabled,
        intervalDays: shop.reminderIntervalDays,
        browserPushEnabled: false,
        updatedAt: shop.updatedAt || '',
      });
    }
    return createDefaultReminderSettings();
  }

  public updateDueReminderSettings(
    uid: string,
    patch: Partial<DueReminderSettings>,
    nowIso?: string
  ): {
    settings: DueReminderSettings;
    notifications: DueReminderNotification[];
    newlyCreated: DueReminderNotification[];
    autoClearedCount: number;
    evaluations: CustomerDueEvaluation[];
  } {
    const shopId = this.data.users[uid]?.shopId || uid;
    const current = this.getDueReminderSettings(shopId);
    const now = nowIso || new Date().toISOString();
    const next: DueReminderSettings = {
      enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled,
      intervalDays:
        patch.intervalDays !== undefined
          ? clampReminderIntervalDays(patch.intervalDays)
          : current.intervalDays,
      browserPushEnabled:
        patch.browserPushEnabled !== undefined
          ? Boolean(patch.browserPushEnabled)
          : current.browserPushEnabled,
      updatedAt: now,
    };

    this.data.dueReminderSettings[shopId] = next;
    if (this.data.shops[shopId]) {
      this.data.shops[shopId] = {
        ...this.data.shops[shopId],
        reminderEnabled: next.enabled,
        reminderIntervalDays: next.intervalDays,
        updatedAt: now,
      };
    }
    this.persist();
    return this.reconcileShopDueNotifications(uid, now);
  }

  public reconcileShopDueNotifications(
    uid: string,
    nowIso?: string
  ): {
    settings: DueReminderSettings;
    notifications: DueReminderNotification[];
    newlyCreated: DueReminderNotification[];
    autoClearedCount: number;
    evaluations: CustomerDueEvaluation[];
  } {
    const shopId = this.data.users[uid]?.shopId || uid;
    const settings = this.getDueReminderSettings(shopId);
    const existing = this.data.dueNotifications[shopId] || [];

    const result = reconcileDueNotifications({
      shopId,
      ownerUid: uid,
      customers: this.listCustomers(shopId),
      sales: this.listSales(shopId),
      ledger: this.listLedger(shopId),
      settings,
      existingNotifications: existing,
      nowIso,
      idFactory: () => crypto.randomUUID(),
    });

    if (
      result.newlyCreated.length > 0 ||
      result.autoClearedCount > 0 ||
      result.nextNotifications.length !== existing.length
    ) {
      this.data.dueNotifications[shopId] = result.nextNotifications;
      this.persist();
    }

    return {
      settings,
      notifications: result.nextNotifications,
      newlyCreated: result.newlyCreated,
      autoClearedCount: result.autoClearedCount,
      evaluations: result.evaluations,
    };
  }

  public markNotificationRead(
    uid: string,
    notificationId?: string
  ): DueReminderNotification[] {
    const shopId = this.data.users[uid]?.shopId || uid;
    const list = this.data.dueNotifications[shopId] || [];
    const now = new Date().toISOString();
    let changed = false;

    const next = list.map((item) => {
      if (item.isRead) return item;
      if (!notificationId || item.id === notificationId) {
        changed = true;
        return {
          ...item,
          isRead: true,
          readAt: item.readAt || now,
          updatedAt: now,
        };
      }
      return item;
    });

    if (changed) {
      this.data.dueNotifications[shopId] = next;
      this.persist();
    }
    return [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public clearResolvedNotifications(uid: string): DueReminderNotification[] {
    const shopId = this.data.users[uid]?.shopId || uid;
    const list = this.data.dueNotifications[shopId] || [];
    const next = list.filter((item) => item.status === 'active');
    if (next.length !== list.length) {
      this.data.dueNotifications[shopId] = next;
      this.persist();
    }
    return [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public listSupportTickets(uid: string): SupportTicket[] {
    return this.data.supportTickets
      .filter((t) => t.uid === uid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public createSupportTicket(
    payload: Omit<SupportTicket, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
      message?: string;
    }
  ): SupportTicket {
    const now = new Date().toISOString();
    const { message: rawMessage, ...ticketFields } = payload;
    const fullText = (rawMessage?.trim() || ticketFields.lastMessagePreview || '').trim();
    if (!ticketFields.subject?.trim() || !fullText) {
      throw new Error('Subject and message are required.');
    }
    const ticket: SupportTicket = {
      ...ticketFields,
      subject: ticketFields.subject.trim(),
      lastMessagePreview: fullText.slice(0, 120),
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.data.supportTickets.push(ticket);
    const msg: SupportMessage = {
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      senderUid: ticketFields.uid,
      senderRole: 'shopkeeper',
      senderName: ticketFields.senderName,
      text: fullText,
      createdAt: now,
    };
    this.data.supportMessages[ticket.id] = [msg];
    this.persist();
    return ticket;
  }

  public listTicketMessages(ticketId: string, uid?: string): SupportMessage[] {
    if (uid) {
      const ticket = this.data.supportTickets.find((t) => t.id === ticketId);
      if (!ticket || ticket.uid !== uid) {
        return [];
      }
    }
    const msgs = [...(this.data.supportMessages[ticketId] || [])];
    return msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  public listSupportMessagesForAdmin(ticketId: string): SupportMessage[] {
    const msgs = [...(this.data.supportMessages[ticketId] || [])];
    return msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  public replyToSupportTicket(
    ticketId: string,
    text: string,
    status?: 'replied' | 'resolved'
  ): { ticket: SupportTicket; message?: SupportMessage } {
    const idx = this.data.supportTickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) {
      throw new Error('Support ticket not found.');
    }
    const existing = this.data.supportTickets[idx];
    const now = new Date().toISOString();
    const cleanText = text.trim();
    if (!cleanText && status !== 'resolved') {
      throw new Error('Reply message text is required.');
    }

    let createdMessage: SupportMessage | undefined;
    if (cleanText) {
      createdMessage = {
        id: crypto.randomUUID(),
        ticketId,
        senderUid: 'admin',
        senderRole: 'admin',
        senderName: 'KhataNova Support',
        text: cleanText,
        createdAt: now,
      };
      const existingMsgs = this.data.supportMessages[ticketId] || [];
      existingMsgs.push(createdMessage);
      this.data.supportMessages[ticketId] = existingMsgs;
    }

    const nextStatus: SupportTicket['status'] =
      status === 'resolved' ? 'resolved' : 'replied';

    const updatedTicket: SupportTicket = {
      ...existing,
      status: nextStatus,
      lastMessagePreview: cleanText ? cleanText.slice(0, 120) : existing.lastMessagePreview,
      updatedAt: now,
    };
    this.data.supportTickets[idx] = updatedTicket;

    this.data.adminAuditLogs.push({
      id: crypto.randomUUID(),
      adminUid: 'admin',
      adminEmail: 'owner-admin',
      action: nextStatus === 'resolved' ? 'RESOLVE_SUPPORT_TICKET' : 'REPLY_SUPPORT_TICKET',
      targetId: ticketId,
      details: `${nextStatus.toUpperCase()} ticket "${existing.subject}" (${existing.shopName})`,
      createdAt: now,
    });

    this.persist();
    return { ticket: updatedTicket, message: createdMessage };
  }

  public getAdminPaymentSettings(): AdminPaymentSettings | null {
    return this.data.adminPaymentSettings;
  }

  public saveAdminPaymentSettings(settings: {
    upiId: string;
    instructions: string;
    qrImageUrl?: string;
  }): AdminPaymentSettings {
    const now = new Date().toISOString();
    const resolvedQrUrl =
      settings.qrImageUrl !== undefined
        ? settings.qrImageUrl.trim()
        : this.data.adminPaymentSettings?.qrImageUrl || '';

    if (
      resolvedQrUrl &&
      !resolvedQrUrl.startsWith('data:image/') &&
      !resolvedQrUrl.startsWith('https://')
    ) {
      throw new Error('Invalid QR image format. Please choose an image from your gallery.');
    }

    const updated: AdminPaymentSettings = {
      upiId: settings.upiId.trim(),
      instructions: settings.instructions.trim(),
      qrImageUrl: resolvedQrUrl,
      updatedAt: now,
      updatedByUid: 'admin',
    };
    this.data.adminPaymentSettings = updated;
    this.data.adminAuditLogs.push({
      id: crypto.randomUUID(),
      adminUid: 'admin',
      adminEmail: 'owner-admin',
      action: 'UPDATE_PAYMENT_QR',
      targetId: 'payment',
      details: `Updated UPI QR settings (${updated.upiId || 'QR Image'}${resolvedQrUrl ? ', QR attached' : ', No QR image'})`,
      createdAt: now,
    });
    this.persist();
    return updated;
  }

  public getAdminSiteSettings(): AdminSiteSettings {
    return this.data.adminSiteSettings || defaultSiteSettings();
  }

  public saveAdminSiteSettings(input: {
    noticeBanner?: string;
    supportPhone?: string;
    supportEmail?: string;
    premiumPriceInr?: number;
    planNotice?: string;
  }): AdminSiteSettings {
    const current = this.getAdminSiteSettings();
    const nextPrice =
      typeof input.premiumPriceInr === 'number' && Number.isFinite(input.premiumPriceInr)
        ? Math.max(1, Math.round(input.premiumPriceInr))
        : current.premiumPriceInr;

    const now = new Date().toISOString();
    const updated: AdminSiteSettings = {
      noticeBanner:
        input.noticeBanner !== undefined ? input.noticeBanner.trim() : current.noticeBanner,
      supportPhone:
        input.supportPhone !== undefined ? input.supportPhone.trim() : current.supportPhone,
      supportEmail:
        input.supportEmail !== undefined ? input.supportEmail.trim() : current.supportEmail,
      premiumPriceInr: nextPrice,
      planNotice: input.planNotice !== undefined ? input.planNotice.trim() : current.planNotice,
      updatedAt: now,
      updatedByUid: 'admin',
    };
    this.data.adminSiteSettings = updated;
    this.data.adminAuditLogs.push({
      id: crypto.randomUUID(),
      adminUid: 'admin',
      adminEmail: 'owner-admin',
      action: 'UPDATE_SITE_SETTINGS',
      targetId: 'site',
      details: `Updated website/plan settings (Price ₹${updated.premiumPriceInr})`,
      createdAt: now,
    });
    this.persist();
    return updated;
  }

  public adminUpdateUser(
    uid: string,
    patch: {
      subscriptionStatus?: SubscriptionStatus;
      accountStatus?: AccountStatus;
    }
  ): UserProfile {
    const existing = this.data.users[uid];
    if (!existing) {
      throw new Error('Shopkeeper account not found.');
    }
    const now = new Date().toISOString();
    const allowedSub: SubscriptionStatus[] = [
      'free',
      'pending',
      'premium_active',
      'rejected',
      'suspended',
    ];
    const allowedAcct: AccountStatus[] = ['active', 'suspended'];

    if (patch.subscriptionStatus && !allowedSub.includes(patch.subscriptionStatus)) {
      throw new Error('Invalid subscription status.');
    }
    if (patch.accountStatus && !allowedAcct.includes(patch.accountStatus)) {
      throw new Error('Invalid account status.');
    }

    const updated: UserProfile = {
      ...existing,
      ...(patch.subscriptionStatus ? { subscriptionStatus: patch.subscriptionStatus } : {}),
      ...(patch.subscriptionStatus === 'premium_active' ? { proModeEnabled: true } : {}),
      ...(patch.accountStatus ? { accountStatus: patch.accountStatus } : {}),
      updatedAt: now,
    };
    this.data.users[uid] = updated;
    this.data.adminAuditLogs.push({
      id: crypto.randomUUID(),
      adminUid: 'admin',
      adminEmail: 'owner-admin',
      action: 'UPDATE_USER_STATUS',
      targetId: uid,
      details: `Updated ${existing.displayName} (${updated.subscriptionStatus} / ${updated.accountStatus})`,
      createdAt: now,
    });
    this.persist();
    return updated;
  }

  public isUserSuspended(uid: string): boolean {
    return this.data.users[uid]?.accountStatus === 'suspended';
  }

  public setProModeEnabled(uid: string, enabled: boolean): UserProfile {
    const existing = this.data.users[uid];
    if (!existing || existing.subscriptionStatus !== 'premium_active') {
      throw new Error('Premier Mode switch is only available for active Premier members.');
    }
    const now = new Date().toISOString();
    const updated: UserProfile = {
      ...existing,
      proModeEnabled: Boolean(enabled),
      updatedAt: now,
    };
    this.data.users[uid] = updated;
    this.persist();
    return updated;
  }

  public listUserPremiumRequests(uid: string): PremiumPaymentRequest[] {
    return this.data.premiumRequests
      .filter((r) => r.uid === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public submitPremiumPaymentRequest(
    payload: Omit<PremiumPaymentRequest, 'id' | 'status' | 'createdAt'>
  ): PremiumPaymentRequest {
    const cleanUtr = String(payload.utrNumber || '').trim();
    if (cleanUtr.length < 4) {
      throw new Error('Enter a valid UTR / transaction reference number (at least 4 characters).');
    }

    const now = new Date().toISOString();
    const user = this.data.users[payload.uid];
    const shop = this.data.shops[payload.shopId || payload.uid];

    const req: PremiumPaymentRequest = {
      ...payload,
      utrNumber: cleanUtr,
      shopkeeperName: payload.shopkeeperName?.trim() || user?.displayName || 'Shopkeeper',
      shopName: payload.shopName?.trim() || shop?.shopName || 'My Shop',
      phoneNumber: payload.phoneNumber?.trim() || shop?.phoneNumber || user?.phoneNumber || '',
      email: payload.email?.trim() || user?.email || '',
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: now,
    };
    this.data.premiumRequests.push(req);

    if (user && user.subscriptionStatus !== 'premium_active') {
      this.data.users[payload.uid] = {
        ...user,
        subscriptionStatus: 'pending',
        updatedAt: now,
      };
    }

    this.persist();
    return req;
  }

  public reviewPremiumPaymentRequest(
    requestId: string,
    action: 'approve' | 'reject',
    rejectionReason?: string
  ): PremiumPaymentRequest {
    const idx = this.data.premiumRequests.findIndex((r) => r.id === requestId);
    if (idx === -1) {
      throw new Error('Premium payment request not found.');
    }
    const existing = this.data.premiumRequests[idx];
    const now = new Date().toISOString();
    const nextStatus = action === 'approve' ? 'approved' : 'rejected';

    const updated: PremiumPaymentRequest = {
      ...existing,
      status: nextStatus,
      ...(action === 'reject' && rejectionReason?.trim()
        ? { rejectionReason: rejectionReason.trim() }
        : {}),
      reviewedByAdminUid: 'admin',
      reviewedAt: now,
    };
    this.data.premiumRequests[idx] = updated;

    const user = this.data.users[existing.uid];
    if (user) {
      this.data.users[existing.uid] = {
        ...user,
        subscriptionStatus: action === 'approve' ? 'premium_active' : 'rejected',
        ...(action === 'approve' ? { proModeEnabled: true } : {}),
        updatedAt: now,
      };
    }

    this.data.adminAuditLogs.push({
      id: crypto.randomUUID(),
      adminUid: 'admin',
      adminEmail: 'owner-admin',
      action: action === 'approve' ? 'APPROVE_PREMIUM_UTR' : 'REJECT_PREMIUM_UTR',
      targetId: existing.id,
      details: `${action.toUpperCase()} UTR ${existing.utrNumber} (${existing.shopName})`,
      createdAt: now,
    });

    this.persist();
    return updated;
  }

  public getAdminOverview(): {
    users: UserProfile[];
    shops: Record<string, ShopProfile>;
    premiumRequests: PremiumPaymentRequest[];
    supportTickets: SupportTicket[];
    auditLogs: AdminAuditLog[];
    paymentSettings: AdminPaymentSettings | null;
    siteSettings: AdminSiteSettings;
  } {
    return {
      users: Object.values(this.data.users).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      shops: { ...this.data.shops },
      premiumRequests: [...this.data.premiumRequests].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
      supportTickets: [...this.data.supportTickets].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
      auditLogs: [...this.data.adminAuditLogs].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
      paymentSettings: this.data.adminPaymentSettings,
      siteSettings: this.getAdminSiteSettings(),
    };
  }

  public findGlobalProduct(rawBarcode: string): GlobalProduct | null {
    const clean = normalizeBarcode(rawBarcode);
    if (!clean) return null;
    return this.data.globalProducts[clean] || null;
  }

  public listGlobalProducts(): GlobalProduct[] {
    return Object.values(this.data.globalProducts).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  public searchGlobalProducts(query?: string, limit = 60): GlobalProduct[] {
    const q = String(query || '').trim().toLowerCase();
    const list = Object.values(this.data.globalProducts).filter((item) => {
      if (!item || !item.barcode || !item.name) return false;
      if (!q) return true;
      return (
        item.barcode.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.brand || '').toLowerCase().includes(q) ||
        (item.categories || '').toLowerCase().includes(q) ||
        (item.packSize || '').toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return list.slice(0, Math.max(1, limit));
  }

  public hydrateGlobalProduct(remote: GlobalProduct): GlobalProduct | null {
    if (!remote || !remote.barcode || !remote.name) return null;
    const clean = normalizeBarcode(remote.barcode);
    if (!isValidBarcode(clean)) return null;
    const existing = this.data.globalProducts[clean];
    if (existing) {
      let changed = false;
      const merged: GlobalProduct = { ...existing };
      const remoteIsNewer =
        Boolean(remote.updatedAt) &&
        (!existing.updatedAt || remote.updatedAt > existing.updatedAt);

      if (remoteIsNewer) {
        if (remote.name?.trim() && remote.name.trim() !== merged.name) {
          merged.name = remote.name.trim();
          changed = true;
        }
        if (remote.brand?.trim() && remote.brand.trim() !== merged.brand) {
          merged.brand = remote.brand.trim();
          changed = true;
        }
        if (remote.packSize?.trim() && remote.packSize.trim() !== merged.packSize) {
          merged.packSize = remote.packSize.trim();
          changed = true;
        }
        if (remote.categories?.trim() && remote.categories.trim() !== merged.categories) {
          merged.categories = remote.categories.trim();
          changed = true;
        }
        if (
          remote.imageUrl?.trim() &&
          remote.imageUrl.length <= 450_000 &&
          remote.imageUrl.trim() !== merged.imageUrl
        ) {
          merged.imageUrl = remote.imageUrl.trim();
          changed = true;
        }
        if (remote.unit?.trim() && remote.unit.trim() !== merged.unit) {
          merged.unit = remote.unit.trim();
          changed = true;
        }
        if (
          typeof remote.suggestedPrice === 'number' &&
          Number.isFinite(remote.suggestedPrice) &&
          remote.suggestedPrice > 0 &&
          ((merged.suggestedPrice === undefined || merged.suggestedPrice <= 0) ||
            (existing.createdByUid && remote.createdByUid === existing.createdByUid))
        ) {
          if (merged.suggestedPrice !== remote.suggestedPrice) {
            merged.suggestedPrice = remote.suggestedPrice;
            changed = true;
          }
        }
        if (changed) {
          merged.updatedAt = remote.updatedAt;
        }
      } else {
        // Non-destructive enrichment only
        if (!merged.brand && remote.brand) {
          merged.brand = remote.brand;
          changed = true;
        }
        if (!merged.packSize && remote.packSize) {
          merged.packSize = remote.packSize;
          changed = true;
        }
        if (!merged.categories && remote.categories) {
          merged.categories = remote.categories;
          changed = true;
        }
        if (!merged.imageUrl && remote.imageUrl && remote.imageUrl.length <= 450_000) {
          merged.imageUrl = remote.imageUrl;
          changed = true;
        }
        if (
          (merged.suggestedPrice === undefined || merged.suggestedPrice <= 0) &&
          typeof remote.suggestedPrice === 'number' &&
          remote.suggestedPrice > 0
        ) {
          merged.suggestedPrice = remote.suggestedPrice;
          changed = true;
        }
      }

      if (changed) {
        this.data.globalProducts[clean] = merged;
        this.persist();
      }
      return merged;
    }

    const saved: GlobalProduct = {
      barcode: clean,
      name: String(remote.name).trim(),
      ...(remote.brand?.trim() ? { brand: remote.brand.trim() } : {}),
      ...(remote.packSize?.trim() ? { packSize: remote.packSize.trim() } : {}),
      ...(remote.categories?.trim() ? { categories: remote.categories.trim() } : {}),
      ...(remote.imageUrl?.trim() && remote.imageUrl.length <= 450_000
        ? { imageUrl: remote.imageUrl.trim() }
        : {}),
      unit: remote.unit?.trim() || 'pcs',
      ...(typeof remote.suggestedPrice === 'number' &&
      Number.isFinite(remote.suggestedPrice) &&
      remote.suggestedPrice >= 0
        ? { suggestedPrice: Math.round((remote.suggestedPrice + Number.EPSILON) * 100) / 100 }
        : {}),
      source: remote.source === 'openfoodfacts' ? 'openfoodfacts' : 'community',
      ...(remote.createdByUid ? { createdByUid: remote.createdByUid } : {}),
      createdAt: remote.createdAt || new Date().toISOString(),
      updatedAt: remote.updatedAt || new Date().toISOString(),
    };
    this.data.globalProducts[clean] = saved;
    this.persist();
    return saved;
  }

  public upsertGlobalProduct(
    uid: string,
    input: {
      barcode: string;
      name: string;
      brand?: string;
      packSize?: string;
      categories?: string;
      imageUrl?: string;
      unit?: string;
      suggestedPrice?: number;
      source?: 'community' | 'openfoodfacts';
      allowGlobalUpdate?: boolean;
    }
  ): {
    globalProduct: GlobalProduct | null;
    created: boolean;
    enriched: boolean;
    variantMismatch: boolean;
  } {
    const cleanBarcode = normalizeBarcode(input.barcode || '');
    const cleanName = String(input.name || '').trim();
    if (!isValidBarcode(cleanBarcode) || !cleanName) {
      return {
        globalProduct: null,
        created: false,
        enriched: false,
        variantMismatch: false,
      };
    }

    const safeImageUrl =
      typeof input.imageUrl === 'string' &&
      input.imageUrl.trim() &&
      input.imageUrl.trim().length <= 450_000
        ? input.imageUrl.trim()
        : undefined;

    const cleanSuggestedPrice =
      typeof input.suggestedPrice === 'number' &&
      Number.isFinite(input.suggestedPrice) &&
      input.suggestedPrice > 0
        ? Math.round((input.suggestedPrice + Number.EPSILON) * 100) / 100
        : undefined;

    const existing = this.data.globalProducts[cleanBarcode];
    const now = new Date().toISOString();

    if (existing) {
      const isCreator = Boolean(existing.createdByUid && existing.createdByUid === uid);
      // Variant safety: if existing product has a pack size and incoming differs (and creator isn't explicitly updating global record), NEVER overwrite global canonical record
      if (!input.allowGlobalUpdate && doPackSizesConflict(existing.packSize, input.packSize)) {
        return {
          globalProduct: existing,
          created: false,
          enriched: false,
          variantMismatch: true,
        };
      }
      if (input.allowGlobalUpdate && !isCreator && doPackSizesConflict(existing.packSize, input.packSize)) {
        return {
          globalProduct: existing,
          created: false,
          enriched: false,
          variantMismatch: true,
        };
      }

      let enriched = false;
      const updated: GlobalProduct = { ...existing };

      if (input.allowGlobalUpdate && isCreator) {
        if (cleanName && cleanName !== updated.name) {
          updated.name = cleanName;
          enriched = true;
        }
        if (input.brand?.trim() && input.brand.trim() !== updated.brand) {
          updated.brand = input.brand.trim();
          enriched = true;
        }
        if (input.packSize?.trim() && input.packSize.trim() !== updated.packSize) {
          updated.packSize = input.packSize.trim();
          enriched = true;
        }
        if (input.categories?.trim() && input.categories.trim() !== updated.categories) {
          updated.categories = input.categories.trim();
          enriched = true;
        }
        if (safeImageUrl && safeImageUrl !== updated.imageUrl) {
          updated.imageUrl = safeImageUrl;
          enriched = true;
        }
        if (input.unit?.trim() && input.unit.trim() !== updated.unit) {
          updated.unit = input.unit.trim();
          enriched = true;
        }
        if (cleanSuggestedPrice !== undefined && cleanSuggestedPrice !== updated.suggestedPrice) {
          updated.suggestedPrice = cleanSuggestedPrice;
          enriched = true;
        }
      } else {
        // Preserve existing global name, packSize, and suggestedPrice once set; enrich missing or explicitly shared metadata
        if ((!updated.brand || input.allowGlobalUpdate) && input.brand?.trim() && input.brand.trim() !== updated.brand) {
          updated.brand = input.brand.trim();
          enriched = true;
        }
        if (!updated.packSize && input.packSize?.trim()) {
          updated.packSize = input.packSize.trim();
          enriched = true;
        }
        if ((!updated.categories || input.allowGlobalUpdate) && input.categories?.trim() && input.categories.trim() !== updated.categories) {
          updated.categories = input.categories.trim();
          enriched = true;
        }
        if ((!updated.imageUrl || input.allowGlobalUpdate) && safeImageUrl && safeImageUrl !== updated.imageUrl) {
          updated.imageUrl = safeImageUrl;
          enriched = true;
        }
        if (
          (updated.suggestedPrice === undefined || updated.suggestedPrice <= 0) &&
          cleanSuggestedPrice !== undefined
        ) {
          updated.suggestedPrice = cleanSuggestedPrice;
          enriched = true;
        }
      }

      if (enriched) {
        updated.updatedAt = now;
        this.data.globalProducts[cleanBarcode] = updated;
        this.persist();
      }

      return {
        globalProduct: updated,
        created: false,
        enriched,
        variantMismatch: false,
      };
    }

    const createdRecord: GlobalProduct = {
      barcode: cleanBarcode,
      name: cleanName,
      ...(input.brand?.trim() ? { brand: input.brand.trim() } : {}),
      ...(input.packSize?.trim() ? { packSize: input.packSize.trim() } : {}),
      ...(input.categories?.trim() ? { categories: input.categories.trim() } : {}),
      ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
      unit: input.unit?.trim() || 'pcs',
      ...(cleanSuggestedPrice !== undefined ? { suggestedPrice: cleanSuggestedPrice } : {}),
      source: input.source === 'openfoodfacts' ? 'openfoodfacts' : 'community',
      createdByUid: uid,
      createdAt: now,
      updatedAt: now,
    };

    this.data.globalProducts[cleanBarcode] = createdRecord;
    this.persist();
    return {
      globalProduct: createdRecord,
      created: true,
      enriched: false,
      variantMismatch: false,
    };
  }

  public isUserProActive(uid: string): boolean {
    const user = this.data.users[uid];
    return Boolean(user?.subscriptionStatus === 'premium_active' && user?.proModeEnabled !== false);
  }

  public listNovaProducts(shopId: string): NovaProduct[] {
    const list = [...(this.data.novaProducts[shopId] || [])];
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public findNovaProductByBarcode(
    shopId: string,
    rawBarcode: string,
    packSize?: string
  ): NovaProduct | null {
    const clean = normalizeBarcode(rawBarcode);
    if (!clean) return null;
    const list = this.data.novaProducts[shopId] || [];
    const matches = list.filter((item) => normalizeBarcode(item.barcode || '') === clean);
    if (matches.length === 0) return null;
    if (packSize && packSize.trim()) {
      const exactVariant = matches.find(
        (item) => !doPackSizesConflict(item.packSize, packSize)
      );
      if (exactVariant) return exactVariant;
    }
    return matches[0] || null;
  }

  public upsertNovaProduct(
    shopId: string,
    input: {
      id?: string;
      barcode?: string;
      name: string;
      brand?: string;
      packSize?: string;
      categories?: string;
      imageUrl?: string;
      unit?: string;
      sellingPrice?: number;
      source?: 'global' | 'openfoodfacts' | 'manual';
      batches?: Array<{
        id?: string;
        batchNumber: string;
        expiryDate: string;
        quantity: number;
        notes?: string;
      }>;
    }
  ): NovaProduct {
    return this.upsertNovaProductWithGlobal(shopId, input).product;
  }

  public upsertNovaProductWithGlobal(
    shopId: string,
    input: {
      id?: string;
      barcode?: string;
      name: string;
      brand?: string;
      packSize?: string;
      categories?: string;
      imageUrl?: string;
      unit?: string;
      sellingPrice?: number;
      source?: 'global' | 'openfoodfacts' | 'manual';
      syncToGlobal?: boolean;
      allowGlobalUpdate?: boolean;
      batches?: Array<{
        id?: string;
        batchNumber: string;
        expiryDate: string;
        quantity: number;
        notes?: string;
      }>;
    }
  ): {
    product: NovaProduct;
    globalProduct: GlobalProduct | null;
    globalUpdated: boolean;
    variantMismatch: boolean;
  } {
    const name = String(input.name || '').trim();
    if (!name) {
      throw new Error('Product name is required.');
    }

    const cleanBarcode = input.barcode ? normalizeBarcode(input.barcode) : '';
    if (cleanBarcode && !isValidBarcode(cleanBarcode)) {
      throw new Error(
        'Invalid barcode format. Supported: EAN-13, EAN-8, UPC-A, UPC-E, and Code 128.'
      );
    }

    const list = [...(this.data.novaProducts[shopId] || [])];
    const now = new Date().toISOString();

    const existingIdx = list.findIndex((item) => {
      if (input.id && item.id === input.id) return true;
      if (cleanBarcode && normalizeBarcode(item.barcode || '') === cleanBarcode) {
        return !doPackSizesConflict(item.packSize, input.packSize);
      }
      return false;
    });
    const prev = existingIdx >= 0 ? list[existingIdx] : null;

    let sellingPrice: number | undefined = prev?.sellingPrice;
    if (input.sellingPrice !== undefined) {
      const num = Number(input.sellingPrice);
      if (!Number.isFinite(num) || num < 0) {
        throw new Error('Selling price must be a non-negative number.');
      }
      sellingPrice = Math.round((num + Number.EPSILON) * 100) / 100;
    }

    const cleanBatches: ProductBatch[] = Array.isArray(input.batches)
      ? input.batches
          .filter((b) => b && (String(b.batchNumber || '').trim() || String(b.expiryDate || '').trim()))
          .map((b) => {
            const expiryDate = String(b.expiryDate || '').trim();
            if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
              throw new Error('Batch expiry date must use YYYY-MM-DD format.');
            }
            const qty = Math.max(0, Number(b.quantity) || 0);
            const existingBatch = prev?.batches?.find((eb) => eb.id === b.id);
            return {
              id: b.id?.trim() || crypto.randomUUID(),
              batchNumber: String(b.batchNumber || '').trim() || 'Batch-1',
              expiryDate,
              quantity: Math.round((qty + Number.EPSILON) * 100) / 100,
              ...(b.notes?.trim() ? { notes: b.notes.trim() } : {}),
              createdAt: existingBatch?.createdAt || now,
              updatedAt: now,
            };
          })
      : prev?.batches || [];

    const safeImageUrl =
      input.imageUrl !== undefined
        ? input.imageUrl.trim().slice(0, 450_000) || undefined
        : prev?.imageUrl;

    const saved: NovaProduct = {
      id: prev?.id || input.id?.trim() || crypto.randomUUID(),
      shopId,
      ...(cleanBarcode ? { barcode: cleanBarcode } : {}),
      name,
      ...(input.brand?.trim()
        ? { brand: input.brand.trim() }
        : prev?.brand
          ? { brand: prev.brand }
          : {}),
      ...(input.packSize?.trim()
        ? { packSize: input.packSize.trim() }
        : prev?.packSize
          ? { packSize: prev.packSize }
          : {}),
      ...(input.categories?.trim()
        ? { categories: input.categories.trim() }
        : prev?.categories
          ? { categories: prev.categories }
          : {}),
      ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
      unit: input.unit?.trim() || prev?.unit || 'pcs',
      ...(sellingPrice !== undefined ? { sellingPrice } : {}),
      source: input.source || prev?.source || (cleanBarcode ? 'global' : 'manual'),
      batches: cleanBatches,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      list[existingIdx] = saved;
    } else {
      list.unshift(saved);
    }
    this.data.novaProducts[shopId] = list;
    this.persist();

    let globalResult: {
      globalProduct: GlobalProduct | null;
      created: boolean;
      enriched: boolean;
      variantMismatch: boolean;
    } = {
      globalProduct: cleanBarcode ? this.findGlobalProduct(cleanBarcode) : null,
      created: false,
      enriched: false,
      variantMismatch: false,
    };

    if (cleanBarcode && input.syncToGlobal !== false) {
      globalResult = this.upsertGlobalProduct(shopId, {
        barcode: cleanBarcode,
        name: saved.name,
        brand: saved.brand,
        packSize: saved.packSize,
        categories: saved.categories,
        imageUrl: saved.imageUrl,
        unit: saved.unit,
        suggestedPrice: saved.sellingPrice,
        source: saved.source === 'openfoodfacts' ? 'openfoodfacts' : 'community',
        allowGlobalUpdate: Boolean(input.allowGlobalUpdate),
      });
    }

    return {
      product: saved,
      globalProduct: globalResult.globalProduct,
      globalUpdated: globalResult.created || globalResult.enriched,
      variantMismatch: globalResult.variantMismatch,
    };
  }

  public deleteNovaProduct(shopId: string, productId: string): NovaProduct[] {
    const list = this.data.novaProducts[shopId] || [];
    const next = list.filter((item) => item.id !== productId);
    this.data.novaProducts[shopId] = next;
    this.persist();
    return this.listNovaProducts(shopId);
  }
}
