import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdminAuthManager } from './server/adminAuth.ts';
import { verifyFirebaseIdToken, type VerifiedFirebaseUser } from './server/firebaseTokenVerifier.ts';
import { NovaScanLookupError, lookupOpenFoodFactsProduct } from './server/novaScanService.ts';
import {
  fetchAllGlobalProductsFromRtdb,
  fetchGlobalProductFromRtdb,
  fetchUserSnapshotFromRtdb,
  pushGlobalProductToRtdb,
  pushUserSnapshotToRtdb,
} from './server/rtdbSync.ts';
import { ShopDataStore } from './server/shopStore.ts';
import { isValidBarcode, normalizeBarcode } from './src/utils/novaScan.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

const adminAuth = new AdminAuthManager();
const shopStore = new ShopDataStore();

interface AuthedRequest extends Request {
  firebaseUser?: VerifiedFirebaseUser;
  idToken?: string;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

async function requireFirebaseUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: 'Please sign in with Google first.' });
    return;
  }
  try {
    req.firebaseUser = await verifyFirebaseIdToken(token);
    req.idToken = token;
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid or expired Google sign-in session.',
    });
  }
}

function requireAdminSession(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token || !adminAuth.verifyToken(token).valid) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  next();
}

function requireActiveAccount(req: AuthedRequest, res: Response, next: NextFunction) {
  const uid = req.firebaseUser?.uid;
  if (uid && shopStore.isUserSuspended(uid)) {
    res.status(403).json({
      error: 'Your shop account has been suspended by the administrator. Please contact Support.',
      code: 'ACCOUNT_SUSPENDED',
    });
    return;
  }
  next();
}

function requireProUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const uid = req.firebaseUser?.uid;
  if (!uid || !shopStore.isUserProActive(uid)) {
    res.status(403).json({
      error:
        'Nova Scan is a Pro-exclusive feature. Upgrade to Lifetime Pro or turn Premier Mode ON.',
      code: 'PRO_REQUIRED',
    });
    return;
  }
  next();
}

// --- Admin Auth Endpoints ---
app.get('/api/admin/status', (_req, res) => {
  res.json(adminAuth.getStatus());
});

app.post('/api/admin/claim', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const result = adminAuth.claimPasscode(password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, expiresAt: result.expiresAt });
});

app.post('/api/admin/login', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const clientKey = req.ip || 'unknown';
  const result = adminAuth.verifyLogin(password, clientKey);
  if (!result.ok) {
    res.status(result.status).json({
      error: result.error,
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return;
  }
  res.json({ token: result.token, expiresAt: result.expiresAt });
});

app.get('/api/admin/session', (req, res) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }
  const verified = adminAuth.verifyToken(token);
  if (!verified.valid) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, expiresAt: verified.expiresAt });
});

app.post('/api/admin/logout', (req, res) => {
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    adminAuth.revokeToken(token);
  }
  res.json({ ok: true });
});

app.post('/api/admin/change-password', requireAdminSession, (req, res) => {
  const currentPassword =
    typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const result = adminAuth.changePasscode(currentPassword, newPassword);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, expiresAt: result.expiresAt });
});

// --- Protected Admin Console Data Endpoints ---
app.get('/api/admin/overview', requireAdminSession, (_req, res) => {
  res.json(shopStore.getAdminOverview());
});

app.post('/api/admin/payment-settings', requireAdminSession, (req, res) => {
  try {
    const updated = shopStore.saveAdminPaymentSettings({
      upiId: typeof req.body?.upiId === 'string' ? req.body.upiId : '',
      instructions: typeof req.body?.instructions === 'string' ? req.body.instructions : '',
      qrImageUrl: typeof req.body?.qrImageUrl === 'string' ? req.body.qrImageUrl : undefined,
    });
    res.json({ settings: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save QR settings.' });
  }
});

app.post('/api/admin/premium-requests/:id/review', requireAdminSession, (req, res) => {
  const action = req.body?.action === 'approve' ? 'approve' : req.body?.action === 'reject' ? 'reject' : null;
  if (!action) {
    res.status(400).json({ error: 'Action must be "approve" or "reject".' });
    return;
  }
  const rejectionReason = typeof req.body?.rejectionReason === 'string' ? req.body.rejectionReason : undefined;
  try {
    const updated = shopStore.reviewPremiumPaymentRequest(String(req.params.id), action, rejectionReason);
    res.json({ request: updated });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Failed to review request.' });
  }
});

app.patch('/api/admin/users/:uid', requireAdminSession, (req, res) => {
  try {
    const user = shopStore.adminUpdateUser(String(req.params.uid), {
      ...(typeof req.body?.subscriptionStatus === 'string'
        ? { subscriptionStatus: req.body.subscriptionStatus }
        : {}),
      ...(typeof req.body?.accountStatus === 'string'
        ? { accountStatus: req.body.accountStatus }
        : {}),
    });
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update user.' });
  }
});

app.get('/api/admin/support/:id/messages', requireAdminSession, (req, res) => {
  res.json({ messages: shopStore.listSupportMessagesForAdmin(String(req.params.id)) });
});

app.post('/api/admin/support/:id/reply', requireAdminSession, (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const status =
    req.body?.status === 'resolved'
      ? 'resolved'
      : req.body?.status === 'replied'
        ? 'replied'
        : undefined;
  try {
    const result = shopStore.replyToSupportTicket(String(req.params.id), text, status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to send reply.' });
  }
});

app.post('/api/admin/site-settings', requireAdminSession, (req, res) => {
  try {
    const settings = shopStore.saveAdminSiteSettings({
      ...(typeof req.body?.noticeBanner === 'string' ? { noticeBanner: req.body.noticeBanner } : {}),
      ...(typeof req.body?.supportPhone === 'string' ? { supportPhone: req.body.supportPhone } : {}),
      ...(typeof req.body?.supportEmail === 'string' ? { supportEmail: req.body.supportEmail } : {}),
      ...(typeof req.body?.premiumPriceInr === 'number'
        ? { premiumPriceInr: req.body.premiumPriceInr }
        : {}),
      ...(typeof req.body?.planNotice === 'string' ? { planNotice: req.body.planNotice } : {}),
    });
    res.json({ settings });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save settings.' });
  }
});

// --- Shopkeeper Authenticated Data Endpoints ---
app.get('/api/shop/premium/settings', (_req, res) => {
  res.json({ settings: shopStore.getAdminPaymentSettings() });
});

app.get('/api/shop/site-settings', (_req, res) => {
  res.json({ settings: shopStore.getAdminSiteSettings() });
});

app.get('/api/shop/profile', requireFirebaseUser, async (req: AuthedRequest, res) => {
  const u = req.firebaseUser!;
  let result = shopStore.getOrInitProfile(u.uid, {
    email: u.email,
    displayName: u.name,
    photoURL: u.picture,
  });

  // If server restarted or local disk doesn't yet show Premier/shop details, attempt restore from Firebase RTDB
  const snap = shopStore.getUserSnapshot(u.uid);
  if (
    req.idToken &&
    (!snap.userProfile ||
      snap.userProfile.subscriptionStatus !== 'premium_active' ||
      (!snap.shopProfile && snap.customers.length === 0 && snap.sales.length === 0))
  ) {
    const rtdbSnap = await fetchUserSnapshotFromRtdb(u.uid, req.idToken);
    if (rtdbSnap) {
      const merged = shopStore.syncShopSnapshot(
        u.uid,
        { email: u.email, displayName: u.name, photoURL: u.picture },
        rtdbSnap,
        rtdbSnap.userProfile || null
      );
      result = { userProfile: merged.userProfile, shopProfile: merged.shopProfile };
    }
  }

  res.json(result);
});

app.post('/api/shop/sync', requireFirebaseUser, async (req: AuthedRequest, res) => {
  const u = req.firebaseUser!;
  const defaults = { email: u.email, displayName: u.name, photoURL: u.picture };

  // Pull any cloud RTDB backup first if available, then merge client vault snapshot
  if (req.idToken) {
    const rtdbSnap = await fetchUserSnapshotFromRtdb(u.uid, req.idToken);
    if (rtdbSnap) {
      shopStore.syncShopSnapshot(u.uid, defaults, rtdbSnap, rtdbSnap.userProfile || null);
    }
  }

  // Note: req.body intentionally never overrides userProfile subscriptionStatus (trustedUserProfile omitted)
  const merged = shopStore.syncShopSnapshot(u.uid, defaults, req.body || null);

  if (req.idToken) {
    await pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
  }

  res.json(merged);
});

app.put('/api/shop/setup', requireFirebaseUser, requireActiveAccount, async (req: AuthedRequest, res) => {
  const u = req.firebaseUser!;
  try {
    const result = shopStore.saveShopSetup(u.uid, u.email, req.body || {});
    if (req.idToken) {
      await pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not save shop setup.' });
  }
});

app.put('/api/shop/pro-mode', requireFirebaseUser, requireActiveAccount, async (req: AuthedRequest, res) => {
  const u = req.firebaseUser!;
  try {
    const userProfile = shopStore.setProModeEnabled(u.uid, Boolean(req.body?.enabled));
    if (req.idToken) {
      await pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json({ userProfile });
  } catch (err) {
    res.status(403).json({
      error:
        err instanceof Error
          ? err.message
          : 'Premier Mode switch is only available for Premier members.',
    });
  }
});

app.get('/api/shop/customers', requireFirebaseUser, (req: AuthedRequest, res) => {
  const mobile = typeof req.query.mobile === 'string' ? req.query.mobile : undefined;
  res.json({ customers: shopStore.listCustomers(req.firebaseUser!.uid, mobile) });
});

app.get('/api/shop/customers/:id', requireFirebaseUser, (req: AuthedRequest, res) => {
  const customer = shopStore.getCustomer(req.firebaseUser!.uid, String(req.params.id));
  if (!customer) {
    res.status(404).json({ error: 'Customer not found.' });
    return;
  }
  res.json({ customer });
});

app.post('/api/shop/customers', requireFirebaseUser, requireActiveAccount, (req: AuthedRequest, res) => {
  try {
    const u = req.firebaseUser!;
    const customer = shopStore.createCustomer(u.uid, req.body || {});
    if (req.idToken) {
      void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json({ customer });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save customer.' });
  }
});

app.patch('/api/shop/customers/:id', requireFirebaseUser, requireActiveAccount, (req: AuthedRequest, res) => {
  try {
    const u = req.firebaseUser!;
    const customer = shopStore.updateCustomer(
      u.uid,
      String(req.params.id),
      req.body || {}
    );
    if (req.idToken) {
      void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json({ customer });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update customer.' });
  }
});

app.get('/api/shop/sales', requireFirebaseUser, (req: AuthedRequest, res) => {
  res.json({ sales: shopStore.listSales(req.firebaseUser!.uid) });
});

app.get('/api/shop/sales/:id', requireFirebaseUser, (req: AuthedRequest, res) => {
  const sale = shopStore.getSale(req.firebaseUser!.uid, String(req.params.id));
  if (!sale) {
    res.status(404).json({ error: 'Sale not found.' });
    return;
  }
  res.json({ sale });
});

app.post('/api/shop/sales', requireFirebaseUser, requireActiveAccount, (req: AuthedRequest, res) => {
  try {
    const u = req.firebaseUser!;
    const result = shopStore.createAtomicSale(u.uid, u.uid, req.body || {});
    if (req.idToken) {
      void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create sale.' });
  }
});

app.get('/api/shop/payments', requireFirebaseUser, (req: AuthedRequest, res) => {
  res.json({ payments: shopStore.listPayments(req.firebaseUser!.uid) });
});

app.post('/api/shop/payments', requireFirebaseUser, requireActiveAccount, (req: AuthedRequest, res) => {
  try {
    const u = req.firebaseUser!;
    const result = shopStore.recordCustomerPayment(u.uid, u.uid, req.body || {});
    if (req.idToken) {
      void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to record payment.' });
  }
});

app.get('/api/shop/ledger', requireFirebaseUser, (req: AuthedRequest, res) => {
  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
  res.json({ ledger: shopStore.listLedger(req.firebaseUser!.uid, customerId) });
});

// --- Shopkeeper-Only Due Reminder Notification Endpoints ---
app.get('/api/shop/notifications', requireFirebaseUser, (req: AuthedRequest, res) => {
  const u = req.firebaseUser!;
  const result = shopStore.reconcileShopDueNotifications(u.uid);
  if (req.idToken && (result.newlyCreated.length > 0 || result.autoClearedCount > 0)) {
    void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
  }
  res.json(result);
});

app.put('/api/shop/notifications/settings', requireFirebaseUser, requireActiveAccount, (req: AuthedRequest, res) => {
  try {
    const u = req.firebaseUser!;
    const patch = {
      ...(typeof req.body?.enabled === 'boolean' ? { enabled: req.body.enabled } : {}),
      ...(req.body?.intervalDays !== undefined
        ? { intervalDays: Number(req.body.intervalDays) }
        : {}),
      ...(typeof req.body?.browserPushEnabled === 'boolean'
        ? { browserPushEnabled: req.body.browserPushEnabled }
        : {}),
    };
    const result = shopStore.updateDueReminderSettings(u.uid, patch);
    if (req.idToken) {
      void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to update due reminder settings.',
    });
  }
});

app.post('/api/shop/notifications/read', requireFirebaseUser, (req: AuthedRequest, res) => {
  const u = req.firebaseUser!;
  const notificationId =
    typeof req.body?.notificationId === 'string' && req.body.notificationId.trim()
      ? req.body.notificationId.trim()
      : undefined;
  const notifications = shopStore.markNotificationRead(u.uid, notificationId);
  if (req.idToken) {
    void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
  }
  res.json({ notifications });
});

app.delete('/api/shop/notifications/cleared', requireFirebaseUser, (req: AuthedRequest, res) => {
  const u = req.firebaseUser!;
  const notifications = shopStore.clearResolvedNotifications(u.uid);
  if (req.idToken) {
    void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
  }
  res.json({ notifications });
});

app.get('/api/shop/support', requireFirebaseUser, (req: AuthedRequest, res) => {
  res.json({ tickets: shopStore.listSupportTickets(req.firebaseUser!.uid) });
});

app.post('/api/shop/support', requireFirebaseUser, (req: AuthedRequest, res) => {
  try {
    const u = req.firebaseUser!;
    const ticket = shopStore.createSupportTicket({
      ...(req.body || {}),
      uid: u.uid,
      shopId: u.uid,
    });
    res.json({ ticket });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create ticket.' });
  }
});

app.get('/api/shop/support/:id/messages', requireFirebaseUser, (req: AuthedRequest, res) => {
  res.json({
    messages: shopStore.listTicketMessages(String(req.params.id), req.firebaseUser!.uid),
  });
});

app.get('/api/shop/premium/requests', requireFirebaseUser, (req: AuthedRequest, res) => {
  res.json({ requests: shopStore.listUserPremiumRequests(req.firebaseUser!.uid) });
});

app.post('/api/shop/premium/requests', requireFirebaseUser, (req: AuthedRequest, res) => {
  try {
    const u = req.firebaseUser!;
    const request = shopStore.submitPremiumPaymentRequest({
      ...(req.body || {}),
      uid: u.uid,
      shopId: u.uid,
    });
    res.json({ request });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to submit request.' });
  }
});

// --- Nova Scan (Pro-Exclusive Global Product Recognition & Batch Expiry) ---
app.get(
  '/api/nova-scan/lookup/:barcode',
  requireFirebaseUser,
  requireActiveAccount,
  requireProUser,
  async (req: AuthedRequest, res) => {
    const u = req.firebaseUser!;
    const rawBarcode = String(req.params.barcode || '');
    const cleanBarcode = normalizeBarcode(rawBarcode);
    if (!isValidBarcode(cleanBarcode)) {
      res.status(400).json({
        error: 'Invalid barcode format. Supported: EAN-13, EAN-8, UPC-A, UPC-E, and Code 128.',
      });
      return;
    }

    const shopProduct = shopStore.findNovaProductByBarcode(u.uid, cleanBarcode);

    // Priority 1: Shared Global Product Database (local persisted store + Firebase RTDB sync)
    let globalProduct = shopStore.findGlobalProduct(cleanBarcode);
    if (req.idToken) {
      const rtdbGlobal = await fetchGlobalProductFromRtdb(cleanBarcode, req.idToken);
      if (rtdbGlobal) {
        globalProduct = shopStore.hydrateGlobalProduct(rtdbGlobal) || rtdbGlobal;
      }
    }

    if (globalProduct) {
      res.json({
        found: true,
        barcode: globalProduct.barcode || cleanBarcode,
        source: 'global',
        cached: false,
        productName: shopProduct?.name || globalProduct.name,
        ...(shopProduct?.brand || globalProduct.brand
          ? { brand: shopProduct?.brand || globalProduct.brand }
          : {}),
        ...(shopProduct?.packSize || globalProduct.packSize
          ? { packSize: shopProduct?.packSize || globalProduct.packSize }
          : {}),
        ...(shopProduct?.categories || globalProduct.categories
          ? { categories: shopProduct?.categories || globalProduct.categories }
          : {}),
        ...(shopProduct?.imageUrl || globalProduct.imageUrl
          ? { imageUrl: shopProduct?.imageUrl || globalProduct.imageUrl }
          : {}),
        ...(typeof globalProduct.suggestedPrice === 'number'
          ? { suggestedPrice: globalProduct.suggestedPrice }
          : {}),
        globalProduct,
        shopProduct,
      });
      return;
    }

    // Priority 2: Open Food Facts API (seeds Shared Global Product DB on hit)
    try {
      const off = await lookupOpenFoodFactsProduct(cleanBarcode);
      if (off.found && (off.productName || off.brand || off.imageUrl)) {
        const upserted = shopStore.upsertGlobalProduct(u.uid, {
          barcode: off.barcode || cleanBarcode,
          name: off.productName || off.brand || cleanBarcode,
          brand: off.brand,
          packSize: off.packSize,
          categories: off.categories,
          imageUrl: off.imageUrl,
          source: 'openfoodfacts',
        });
        globalProduct = upserted.globalProduct;
        if (req.idToken && upserted.created && globalProduct) {
          void pushGlobalProductToRtdb(globalProduct, req.idToken);
        }
      }

      if (!off.found && shopProduct) {
        res.json({
          found: true,
          barcode: shopProduct.barcode || cleanBarcode,
          source: 'shop',
          cached: true,
          productName: shopProduct.name,
          ...(shopProduct.brand ? { brand: shopProduct.brand } : {}),
          ...(shopProduct.packSize ? { packSize: shopProduct.packSize } : {}),
          ...(shopProduct.categories ? { categories: shopProduct.categories } : {}),
          ...(shopProduct.imageUrl ? { imageUrl: shopProduct.imageUrl } : {}),
          ...(typeof shopProduct.sellingPrice === 'number'
            ? { suggestedPrice: shopProduct.sellingPrice }
            : {}),
          globalProduct,
          shopProduct,
        });
        return;
      }

      res.json({
        ...off,
        ...(shopProduct?.name ? { productName: shopProduct.name } : {}),
        ...(shopProduct?.brand ? { brand: shopProduct.brand } : {}),
        ...(shopProduct?.packSize ? { packSize: shopProduct.packSize } : {}),
        ...(shopProduct?.categories ? { categories: shopProduct.categories } : {}),
        ...(shopProduct?.imageUrl ? { imageUrl: shopProduct.imageUrl } : {}),
        ...(typeof globalProduct?.suggestedPrice === 'number'
          ? { suggestedPrice: globalProduct.suggestedPrice }
          : {}),
        globalProduct,
        shopProduct,
      });
    } catch (err) {
      if (err instanceof NovaScanLookupError) {
        if (shopProduct && err.status !== 400) {
          res.json({
            found: true,
            barcode: shopProduct.barcode || cleanBarcode,
            source: 'shop',
            cached: true,
            productName: shopProduct.name,
            ...(shopProduct.brand ? { brand: shopProduct.brand } : {}),
            ...(shopProduct.packSize ? { packSize: shopProduct.packSize } : {}),
            ...(shopProduct.categories ? { categories: shopProduct.categories } : {}),
            ...(shopProduct.imageUrl ? { imageUrl: shopProduct.imageUrl } : {}),
            ...(typeof shopProduct.sellingPrice === 'number'
              ? { suggestedPrice: shopProduct.sellingPrice }
              : {}),
            globalProduct: null,
            shopProduct,
          });
          return;
        }
        res.status(err.status).json({ error: err.message });
        return;
      }
      if (shopProduct) {
        res.json({
          found: true,
          barcode: shopProduct.barcode || cleanBarcode,
          source: 'shop',
          cached: true,
          productName: shopProduct.name,
          ...(shopProduct.brand ? { brand: shopProduct.brand } : {}),
          ...(shopProduct.packSize ? { packSize: shopProduct.packSize } : {}),
          ...(shopProduct.categories ? { categories: shopProduct.categories } : {}),
          ...(shopProduct.imageUrl ? { imageUrl: shopProduct.imageUrl } : {}),
          globalProduct: null,
          shopProduct,
        });
        return;
      }
      res.status(502).json({ error: 'Failed to look up barcode product.' });
    }
  }
);

app.get(
  '/api/nova-scan/global/search',
  requireFirebaseUser,
  requireActiveAccount,
  requireProUser,
  async (req: AuthedRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (req.idToken) {
      const rtdbGlobals = await fetchAllGlobalProductsFromRtdb(req.idToken);
      for (const item of rtdbGlobals) {
        shopStore.hydrateGlobalProduct(item);
      }
    }
    res.json({ products: shopStore.searchGlobalProducts(q, 60) });
  }
);

app.get(
  '/api/nova-scan/products',
  requireFirebaseUser,
  requireActiveAccount,
  requireProUser,
  (req: AuthedRequest, res) => {
    res.json({ products: shopStore.listNovaProducts(req.firebaseUser!.uid) });
  }
);

app.put(
  '/api/nova-scan/products',
  requireFirebaseUser,
  requireActiveAccount,
  requireProUser,
  (req: AuthedRequest, res) => {
    try {
      const u = req.firebaseUser!;
      const result = shopStore.upsertNovaProductWithGlobal(u.uid, req.body || {});
      if (req.idToken) {
        void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
        if (result.globalUpdated && result.globalProduct) {
          void pushGlobalProductToRtdb(result.globalProduct, req.idToken);
        }
      }
      res.json({
        product: result.product,
        products: shopStore.listNovaProducts(u.uid),
        globalProduct: result.globalProduct,
        variantMismatch: result.variantMismatch,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to save Nova Scan product.',
      });
    }
  }
);

app.delete(
  '/api/nova-scan/products/:id',
  requireFirebaseUser,
  requireActiveAccount,
  requireProUser,
  (req: AuthedRequest, res) => {
    const u = req.firebaseUser!;
    const products = shopStore.deleteNovaProduct(u.uid, String(req.params.id));
    if (req.idToken) {
      void pushUserSnapshotToRtdb(u.uid, req.idToken, shopStore.getUserSnapshot(u.uid));
    }
    res.json({ products });
  }
);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    env: isProduction ? 'production' : 'development',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KhataNova server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
