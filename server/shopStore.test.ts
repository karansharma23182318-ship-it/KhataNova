import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from './firebaseTokenVerifier.ts';
import {
  NovaScanLookupError,
  clearNovaScanCache,
  lookupOpenFoodFactsProduct,
} from './novaScanService.ts';
import { ShopDataStore } from './shopStore.ts';
import { canAddMoreCustomers, isEffectiveProMode } from '../src/config/planConfig.ts';

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwtRs256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyPem: string
): string {
  const h = toBase64Url(JSON.stringify(header));
  const p = toBase64Url(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  signer.end();
  const sig = toBase64Url(signer.sign(privateKeyPem));
  return `${h}.${p}.${sig}`;
}

test('verifyFirebaseIdToken validates RS256 signature and claims, and rejects tampered/expired tokens', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const now = 1_700_000_000;

  const validToken = signJwtRs256(
    { alg: 'RS256', kid: 'test-kid-1' },
    {
      aud: 'khatanova-f42f1',
      iss: 'https://securetoken.google.com/khatanova-f42f1',
      sub: 'user-123',
      user_id: 'user-123',
      email: 'shop@example.com',
      iat: now - 10,
      exp: now + 3600,
    },
    privatePem
  );

  const verified = await verifyFirebaseIdToken(validToken, {
    certsOverride: { 'test-kid-1': publicPem },
    nowSeconds: now,
  });
  assert.equal(verified.uid, 'user-123');
  assert.equal(verified.email, 'shop@example.com');

  const expiredToken = signJwtRs256(
    { alg: 'RS256', kid: 'test-kid-1' },
    {
      aud: 'khatanova-f42f1',
      iss: 'https://securetoken.google.com/khatanova-f42f1',
      sub: 'user-123',
      iat: now - 4000,
      exp: now - 1,
    },
    privatePem
  );

  await assert.rejects(
    () =>
      verifyFirebaseIdToken(expiredToken, {
        certsOverride: { 'test-kid-1': publicPem },
        nowSeconds: now,
      }),
    /expired or invalid/
  );

  const tamperedToken = `${validToken.slice(0, -4)}AAAA`;
  await assert.rejects(
    () =>
      verifyFirebaseIdToken(tamperedToken, {
        certsOverride: { 'test-kid-1': publicPem },
        nowSeconds: now,
      }),
    /signature/
  );
});

test('ShopDataStore saves flexible shop setup, customers, atomic walk-in/udhaar sales, and payments', () => {
  const store = new ShopDataStore(null);

  // Flexible shop setup: email & ownerName omitted or empty, arbitrary phone format, only 4 required fields provided
  const setup = store.saveShopSetup('uid-1', '', {
    ownerName: '',
    email: '',
    gstNumber: '',
    whatsappNumber: '',
    shopName: 'Chit Dukan',
    phoneNumber: '87572',
    businessType: 'General Kirana / Retail',
    address: 'Daltonganj',
  });
  assert.equal(setup.shopProfile.shopName, 'Chit Dukan');
  assert.equal(setup.shopProfile.ownerName, 'Chit Dukan');
  assert.equal(setup.userProfile.shopId, 'uid-1');

  assert.throws(
    () =>
      store.saveShopSetup('uid-2', '', {
        shopName: 'Test Dukan',
        phoneNumber: '98765',
        businessType: 'Kirana',
        address: '',
      }),
    /Shop Address are required/
  );

  // Walk-in cash sale works without customerId
  const cashSale = store.createAtomicSale('uid-1', 'uid-1', {
    items: [{ id: '1', name: 'Dudh', quantity: 2, unit: 'pcs', unitPrice: 100, lineTotal: 200 }],
    subtotal: 200,
    discount: 0,
    finalTotal: 200,
    paymentMethod: 'cash',
  });
  assert.equal(cashSale.sale.customerName, 'Walk-in Customer');
  assert.equal(cashSale.sale.finalTotal, 200);

  // Customer + Udhaar sale + payment updates balance and ledger atomically
  const cust = store.createCustomer('uid-1', {
    name: 'Vinay Sharma',
    mobileNumber: '8757209126',
    address: 'Kanda mohalla',
  });
  const udhaarSale = store.createAtomicSale('uid-1', 'uid-1', {
    customerId: cust.id,
    customerName: cust.name,
    items: [{ id: '2', name: 'Chini', quantity: 5, unit: 'pcs', unitPrice: 44, lineTotal: 220 }],
    subtotal: 220,
    discount: 0,
    finalTotal: 220,
    paymentMethod: 'udhaar',
  });
  assert.equal(udhaarSale.sale.dueAmount, 220);
  assert.equal(udhaarSale.sale.customerPhone, '8757209126');
  assert.equal(store.getCustomer('uid-1', cust.id)?.outstandingBalance, 220);

  store.recordCustomerPayment('uid-1', 'uid-1', {
    customerId: cust.id,
    amount: 100,
    paymentMethod: 'upi',
    paymentDate: new Date().toISOString(),
  });
  assert.equal(store.getCustomer('uid-1', cust.id)?.outstandingBalance, 120);
  assert.equal(store.listLedger('uid-1', cust.id).length, 2);

  // Premium UTR submission & Admin panel verification/approval flow
  const utrReq = store.submitPremiumPaymentRequest({
    uid: 'uid-1',
    shopId: 'uid-1',
    shopkeeperName: 'Chit Dukan',
    shopName: 'Chit Dukan',
    phoneNumber: '87572',
    email: 'owner@example.com',
    amount: 199,
    utrNumber: '432198765432',
    paymentDate: '2026-11-23',
  });
  assert.equal(utrReq.utrNumber, '432198765432');
  assert.equal(utrReq.status, 'pending');
  assert.equal(store.getAdminOverview().premiumRequests[0].utrNumber, '432198765432');

  const approved = store.reviewPremiumPaymentRequest(utrReq.id, 'approve');
  assert.equal(approved.status, 'approved');
  assert.equal(
    store.getOrInitProfile('uid-1', { email: 'owner@example.com' }).userProfile.subscriptionStatus,
    'premium_active'
  );
});

test('ShopDataStore handles admin QR save/clear, user updates, support replies, and site settings', () => {
  const store = new ShopDataStore(null);

  store.getOrInitProfile('uid-shop', {
    email: 'shop@example.com',
    displayName: 'Ramesh',
  });
  store.saveShopSetup('uid-shop', 'shop@example.com', {
    shopName: 'Ramesh Kirana',
    phoneNumber: '9988776655',
    businessType: 'Kirana',
    address: 'Main Market',
  });

  // Admin saves gallery QR image (data URL) and later clears it
  const qrSaved = store.saveAdminPaymentSettings({
    upiId: '8757209126@ybl',
    instructions: 'Pay 199 and enter UTR',
    qrImageUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  });
  assert.equal(qrSaved.upiId, '8757209126@ybl');
  assert.ok(qrSaved.qrImageUrl.startsWith('data:image/jpeg;base64,'));
  assert.equal(store.getAdminPaymentSettings()?.qrImageUrl, qrSaved.qrImageUrl);

  const qrCleared = store.saveAdminPaymentSettings({
    upiId: '8757209126@ybl',
    instructions: 'Pay via UPI ID',
    qrImageUrl: '',
  });
  assert.equal(qrCleared.qrImageUrl, '');

  // Admin updates user subscription and account status
  const upgraded = store.adminUpdateUser('uid-shop', {
    subscriptionStatus: 'premium_active',
    accountStatus: 'suspended',
  });
  assert.equal(upgraded.subscriptionStatus, 'premium_active');
  assert.equal(upgraded.accountStatus, 'suspended');

  // Shopkeeper support ticket -> admin reply & resolve
  const ticket = store.createSupportTicket({
    uid: 'uid-shop',
    shopId: 'uid-shop',
    senderName: 'Ramesh',
    shopName: 'Ramesh Kirana',
    phoneNumber: '9988776655',
    subject: 'Need QR Help',
    lastMessagePreview: 'How to share PDF on WhatsApp?',
  });

  const replied = store.replyToSupportTicket(ticket.id, 'Open Sale Details and click WhatsApp Share.', 'replied');
  assert.equal(replied.ticket.status, 'replied');
  assert.equal(store.listSupportMessagesForAdmin(ticket.id).length, 2);

  const resolved = store.replyToSupportTicket(ticket.id, '', 'resolved');
  assert.equal(resolved.ticket.status, 'resolved');

  // Admin site settings update
  const site = store.saveAdminSiteSettings({
    noticeBanner: '24x7 Support Available',
    supportPhone: '+91 8757209126',
    supportEmail: 'help@khatanova.in',
    premiumPriceInr: 249,
    planNotice: 'Limited Offer',
  });
  assert.equal(site.premiumPriceInr, 249);
  assert.equal(site.noticeBanner, '24x7 Support Available');

  const overview = store.getAdminOverview();
  assert.equal(overview.users.length, 1);
  assert.equal(overview.shops['uid-shop']?.shopName, 'Ramesh Kirana');
  assert.equal(overview.supportTickets.length, 1);
  assert.ok(overview.auditLogs.length >= 5);
});

test('ShopDataStore syncShopSnapshot restores full shop data across restarts and keeps multiple users isolated', () => {
  const originalStore = new ShopDataStore(null);
  originalStore.saveShopSetup('user-a', 'a@example.com', {
    shopName: 'A Kirana Store',
    phoneNumber: '9876543210',
    businessType: 'Kirana',
    address: 'Market Road',
  });
  const custA = originalStore.createCustomer('user-a', {
    name: 'Ramesh Verma',
    mobileNumber: '9123456789',
  });
  originalStore.createAtomicSale('user-a', 'user-a', {
    customerId: custA.id,
    customerName: custA.name,
    items: [{ id: '1', name: 'Rice', quantity: 2, unit: 'kg', unitPrice: 60, lineTotal: 120 }],
    subtotal: 120,
    discount: 0,
    finalTotal: 120,
    paymentMethod: 'udhaar',
  });
  originalStore.recordCustomerPayment('user-a', 'user-a', {
    customerId: custA.id,
    amount: 50,
    paymentMethod: 'cash',
    paymentDate: '2026-11-23T10:00:00.000Z',
  });

  const snapshotA = originalStore.getUserSnapshot('user-a');
  assert.equal(snapshotA.customers.length, 1);
  assert.equal(snapshotA.sales.length, 1);
  assert.equal(snapshotA.payments.length, 1);
  assert.equal(snapshotA.ledger.length, 2);

  // Simulate brand new server container after phone off/on or restart
  const restartedStore = new ShopDataStore(null);
  restartedStore.saveShopSetup('user-b', 'b@example.com', {
    shopName: 'B Electronics',
    phoneNumber: '9999988888',
    businessType: 'Electronics',
    address: 'Station Chowk',
  });

  const restoredA = restartedStore.syncShopSnapshot(
    'user-a',
    { email: 'a@example.com', displayName: 'Owner A' },
    snapshotA
  );

  assert.equal(restoredA.shopProfile?.shopName, 'A Kirana Store');
  assert.equal(restoredA.customers.length, 1);
  assert.equal(restoredA.customers[0].name, 'Ramesh Verma');
  assert.equal(restoredA.customers[0].outstandingBalance, 70);
  assert.equal(restoredA.sales.length, 1);
  assert.equal(restoredA.payments.length, 1);
  assert.equal(restoredA.ledger.length, 2);

  // User B remains completely isolated
  const snapshotB = restartedStore.getUserSnapshot('user-b');
  assert.equal(snapshotB.shopProfile?.shopName, 'B Electronics');
  assert.equal(snapshotB.customers.length, 0);
  assert.equal(snapshotB.sales.length, 0);
});

test('ShopDataStore enforces 10-customer cap on Free plan and unlocks unlimited customers on Pro plan', () => {
  const store = new ShopDataStore(null);
  store.getOrInitProfile('free-shop', { email: 'free@example.com', displayName: 'Free Owner' });

  for (let i = 1; i <= 10; i++) {
    store.createCustomer('free-shop', {
      name: `Customer ${i}`,
      mobileNumber: `98765432${String(i).padStart(2, '0')}`,
    });
  }
  assert.equal(store.listCustomers('free-shop').length, 10);

  // 11th customer must fail on Free plan
  assert.throws(
    () =>
      store.createCustomer('free-shop', {
        name: 'Customer 11',
        mobileNumber: '9876543211',
      }),
    /Free plan limit reached/
  );

  // Upgrade to Pro -> 11th+ customer succeeds cleanly
  store.adminUpdateUser('free-shop', { subscriptionStatus: 'premium_active' });
  const c11 = store.createCustomer('free-shop', {
    name: 'Customer 11',
    mobileNumber: '9876543211',
  });
  assert.equal(c11.name, 'Customer 11');
  assert.equal(store.listCustomers('free-shop').length, 11);
});

test('ShopDataStore restricts Pro Mode ON/OFF switch to Premier holders and switches back ON without repayment', () => {
  const store = new ShopDataStore(null);
  store.getOrInitProfile('free-user', { email: 'free@example.com', displayName: 'Free Shop' });

  // Free user cannot toggle Pro Mode ON or OFF
  assert.throws(
    () => store.setProModeEnabled('free-user', true),
    /only available for active Premier members/
  );

  // Premier user is approved
  store.getOrInitProfile('pro-user', { email: 'pro@example.com', displayName: 'Pro Shop' });
  const req = store.submitPremiumPaymentRequest({
    uid: 'pro-user',
    shopId: 'pro-user',
    shopkeeperName: 'Pro Owner',
    shopName: 'Pro Dukaan',
    phoneNumber: '9876543210',
    email: 'pro@example.com',
    amount: 199,
    utrNumber: '998877665544',
    paymentDate: '2026-11-23',
  });
  store.reviewPremiumPaymentRequest(req.id, 'approve');

  let profile = store.getUserSnapshot('pro-user').userProfile!;
  assert.equal(profile.subscriptionStatus, 'premium_active');
  assert.equal(profile.proModeEnabled, true);

  // Toggle OFF -> enters Normal/Free Mode while preserving subscriptionStatus === 'premium_active'
  profile = store.setProModeEnabled('pro-user', false);
  assert.equal(profile.subscriptionStatus, 'premium_active');
  assert.equal(profile.proModeEnabled, false);

  // Verify Normal/Free mode rules apply when toggled OFF (e.g. 10-customer cap)
  for (let i = 1; i <= 10; i++) {
    store.createCustomer('pro-user', {
      name: `Cust ${i}`,
      mobileNumber: `90000000${String(i).padStart(2, '0')}`,
    });
  }
  assert.throws(
    () =>
      store.createCustomer('pro-user', {
        name: 'Cust 11',
        mobileNumber: '9000000011',
      }),
    /Normal\/Free Mode active/
  );

  // Toggle back ON -> returns immediately to Pro Mode with ZERO repayment
  profile = store.setProModeEnabled('pro-user', true);
  assert.equal(profile.subscriptionStatus, 'premium_active');
  assert.equal(profile.proModeEnabled, true);

  const c11 = store.createCustomer('pro-user', {
    name: 'Cust 11',
    mobileNumber: '9000000011',
  });
  assert.equal(c11.name, 'Cust 11');

  // Client-side helper alignment checks
  assert.equal(isEffectiveProMode({ subscriptionStatus: 'free', proModeEnabled: true }), false);
  assert.equal(isEffectiveProMode({ subscriptionStatus: 'premium_active', proModeEnabled: undefined }), true);
  assert.equal(isEffectiveProMode({ subscriptionStatus: 'premium_active', proModeEnabled: false }), false);
  assert.equal(isEffectiveProMode({ subscriptionStatus: 'premium_active', proModeEnabled: true }), true);
  assert.equal(canAddMoreCustomers(10, 'free', true), false);
  assert.equal(canAddMoreCustomers(10, 'premium_active', false), false);
  assert.equal(canAddMoreCustomers(10, 'premium_active', true), true);
});

test('ShopDataStore reconciles due reminders with 7-day default, prevents duplicates, and auto-clears on full payment', () => {
  const store = new ShopDataStore(null);
  store.getOrInitProfile('shop-rem', { email: 'rem@example.com', displayName: 'Owner' });

  const oldDateIso = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
  const newerIso = new Date(Date.now() + 5000).toISOString();
  const c1 = store.createCustomer('shop-rem', {
    name: 'Anil Sharma',
    mobileNumber: '9876543211',
    openingBalance: 0,
  });

  // Sync a 9-day-old unpaid Udhaar customer via syncShopSnapshot
  const synced = store.syncShopSnapshot(
    'shop-rem',
    { email: 'rem@example.com', displayName: 'Owner' },
    {
      customers: [
        {
          ...c1,
          openingBalance: 750,
          outstandingBalance: 750,
          totalCredit: 750,
          createdAt: oldDateIso,
          updatedAt: newerIso,
        },
      ],
    }
  );

  assert.equal(synced.dueReminderSettings.intervalDays, 7);
  assert.equal(synced.dueNotifications.length, 1);
  assert.equal(synced.dueNotifications[0].customerId, c1.id);
  assert.equal(synced.dueNotifications[0].pendingAmount, 750);
  assert.equal(synced.dueNotifications[0].status, 'active');

  // Calling reconcile again must NOT create duplicate notifications
  const secondCheck = store.reconcileShopDueNotifications('shop-rem');
  assert.equal(secondCheck.newlyCreated.length, 0);
  assert.equal(secondCheck.notifications.length, 1);

  // Mark notification read
  const readList = store.markNotificationRead('shop-rem', secondCheck.notifications[0].id);
  assert.equal(readList[0].isRead, true);

  // Paying off the full balance automatically stops & clears the active reminder
  store.recordCustomerPayment('shop-rem', 'shop-rem', {
    customerId: c1.id,
    amount: 750,
    paymentMethod: 'cash',
    paymentDate: new Date().toISOString(),
  });

  const afterPay = store.reconcileShopDueNotifications('shop-rem');
  assert.equal(afterPay.notifications.length, 1);
  assert.equal(afterPay.notifications[0].status, 'cleared');
  assert.equal(afterPay.notifications[0].pendingAmount, 0);

  // Custom interval & disable setting persists
  const updatedSettings = store.updateDueReminderSettings('shop-rem', {
    enabled: false,
    intervalDays: 14,
  });
  assert.equal(updatedSettings.settings.enabled, false);
  assert.equal(updatedSettings.settings.intervalDays, 14);
});

test('ShopDataStore enforces Pro status for Nova Scan and persists shop selling prices & batch expiry across restarts', () => {
  const store = new ShopDataStore(null);
  store.getOrInitProfile('free-u', { email: 'free@example.com', displayName: 'Free' });
  assert.equal(store.isUserProActive('free-u'), false);

  store.adminUpdateUser('free-u', { subscriptionStatus: 'premium_active' });
  assert.equal(store.isUserProActive('free-u'), true);

  store.setProModeEnabled('free-u', false);
  assert.equal(store.isUserProActive('free-u'), false);

  store.setProModeEnabled('free-u', true);
  assert.equal(store.isUserProActive('free-u'), true);

  const saved = store.upsertNovaProduct('free-u', {
    barcode: '8909106046351',
    name: 'sunsilk',
    sellingPrice: 185,
    source: 'openfoodfacts',
    batches: [
      {
        batchNumber: 'B2611',
        expiryDate: '2027-08-31',
        quantity: 12,
      },
    ],
  });
  assert.equal(saved.sellingPrice, 185);
  assert.equal(saved.batches.length, 1);
  assert.equal(store.findNovaProductByBarcode('free-u', '8909106046351')?.sellingPrice, 185);

  const snap = store.getUserSnapshot('free-u');
  const restarted = new ShopDataStore(null);
  const restored = restarted.syncShopSnapshot('free-u', { email: 'free@example.com' }, snap);
  assert.equal(restored.novaProducts.length, 1);
  assert.equal(restored.novaProducts[0].name, 'sunsilk');
  assert.equal(restored.novaProducts[0].batches[0].batchNumber, 'B2611');
});

test('lookupOpenFoodFactsProduct sends User-Agent, caches hits, and handles 404/429 errors cleanly', async () => {
  clearNovaScanCache();
  let calls = 0;
  let capturedUserAgent = '';
  let capturedUrl = '';

  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    capturedUrl = String(url);
    const headers = (init?.headers || {}) as Record<string, string>;
    capturedUserAgent = headers['User-Agent'] || '';

    if (capturedUrl.includes('8909106046351')) {
      return new Response(
        JSON.stringify({
          code: '8909106046351',
          status: 'success',
          result: { id: 'product_found' },
          product: {
            code: '8909106046351',
            product_name: 'sunsilk',
            image_url:
              'https://images.openfoodfacts.org/images/products/890/910/604/6351/front_en.13.400.jpg',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (capturedUrl.includes('4290000000000')) {
      return new Response('{}', { status: 429 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;

  const first = await lookupOpenFoodFactsProduct('8909106046351', { fetchImpl: mockFetch });
  assert.equal(first.found, true);
  assert.equal(first.productName, 'sunsilk');
  assert.equal(first.cached, false);
  assert.equal(calls, 1);
  assert.match(capturedUserAgent, /KhataNova\/1\.0/);
  assert.match(capturedUrl, /https:\/\/world\.openfoodfacts\.org\/api\/v3\.6\/product\/8909106046351\.json/);

  // Second call hits cache without extra network fetch
  const second = await lookupOpenFoodFactsProduct('8909106046351', { fetchImpl: mockFetch });
  assert.equal(second.found, true);
  assert.equal(second.cached, true);
  assert.equal(second.source, 'cache');
  assert.equal(calls, 1);

  const missing = await lookupOpenFoodFactsProduct('9999999999999', { fetchImpl: mockFetch });
  assert.equal(missing.found, false);

  await assert.rejects(
    () => lookupOpenFoodFactsProduct('4290000000000', { fetchImpl: mockFetch }),
    (err: unknown) => err instanceof NovaScanLookupError && err.status === 429
  );
});

test('ShopDataStore.saveShopSetup validates, persists, and preserves paymentUpiId and paymentQrUrl', () => {
  const store = new ShopDataStore(null);
  store.getOrInitProfile('uid-pay', { email: 'pay@example.com', displayName: 'Karan' });

  assert.throws(
    () =>
      store.saveShopSetup('uid-pay', 'pay@example.com', {
        shopName: 'Chit Dukan',
        phoneNumber: '8757209126',
        businessType: 'Kirana',
        address: 'Daltonganj',
        paymentUpiId: 'invalid upi',
      }),
    /valid UPI ID/i
  );

  const saved = store.saveShopSetup('uid-pay', 'pay@example.com', {
    shopName: 'Chit Dukan',
    phoneNumber: '8757209126',
    businessType: 'Kirana',
    address: 'Daltonganj',
    paymentUpiId: ' 8757209126@YBL ',
    paymentQrUrl: 'data:image/jpeg;base64,abc123',
  });
  assert.equal(saved.shopProfile.paymentUpiId, '8757209126@ybl');
  assert.equal(saved.shopProfile.paymentQrUrl, 'data:image/jpeg;base64,abc123');

  // Updating unrelated shop fields without passing paymentUpiId/paymentQrUrl preserves them
  const preserved = store.saveShopSetup('uid-pay', 'pay@example.com', {
    shopName: 'Chit Dukan Updated',
    phoneNumber: '8757209126',
    businessType: 'Kirana',
    address: 'Daltonganj',
  });
  assert.equal(preserved.shopProfile.paymentUpiId, '8757209126@ybl');
  assert.equal(preserved.shopProfile.paymentQrUrl, 'data:image/jpeg;base64,abc123');
});

test('ShopDataStore merges rateBook across restarts and restores Pro subscription strictly from trustedUserProfile', () => {
  const store = new ShopDataStore(null);
  const nowIso = new Date().toISOString();

  // Untrusted incoming snapshot cannot self-upgrade subscriptionStatus even if someone sends a fake userProfile field
  const untrustedAttempt = store.syncShopSnapshot(
    'uid-pro-guard',
    { email: 'owner@shop.in', displayName: 'Owner' },
    {
      ...({ userProfile: { subscriptionStatus: 'premium_active' } } as Record<string, unknown>),
      rateBook: [
        { id: 'rb-1', name: 'Basmati Rice', unit: 'kg', baseRate: 110, updatedAt: nowIso },
      ],
    } as Parameters<ShopDataStore['syncShopSnapshot']>[2]
  );

  assert.equal(untrustedAttempt.userProfile.subscriptionStatus, 'free');
  assert.equal(untrustedAttempt.rateBook.length, 1);
  assert.equal(untrustedAttempt.rateBook[0].name, 'Basmati Rice');

  // Trusted RTDB profile restores premium_active & proModeEnabled on fresh server container
  const freshContainer = new ShopDataStore(null);
  const restoredFromTrusted = freshContainer.syncShopSnapshot(
    'uid-pro-guard',
    { email: 'owner@shop.in', displayName: 'Owner' },
    {
      rateBook: [
        { id: 'rb-1', name: 'Basmati Rice', unit: 'kg', baseRate: 110, updatedAt: nowIso },
        { id: 'rb-2', name: 'Toor Dal', unit: 'kg', baseRate: 145, updatedAt: nowIso },
      ],
    },
    {
      uid: 'uid-pro-guard',
      displayName: 'Owner',
      email: 'owner@shop.in',
      phoneNumber: '9876543210',
      role: 'shopkeeper',
      shopId: 'uid-pro-guard',
      language: 'hi',
      subscriptionStatus: 'premium_active',
      proModeEnabled: true,
      accountStatus: 'active',
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  );

  assert.equal(restoredFromTrusted.userProfile.subscriptionStatus, 'premium_active');
  assert.equal(restoredFromTrusted.userProfile.proModeEnabled, true);
  assert.equal(restoredFromTrusted.rateBook.length, 2);
  assert.equal(restoredFromTrusted.rateBook[1].baseRate, 145);
});

test('Global Product Database shares metadata across 3 separate shops while strictly isolating per-shop custom price, name, duplicates, and pack variants', () => {
  const store = new ShopDataStore(null);

  // Shop A saves Parle-G (₹20, photo, 100g) for barcode 8901063010017
  const shopASave = store.upsertNovaProductWithGlobal('uid-shop-a', {
    barcode: '8901063010017',
    name: 'Parle-G',
    brand: 'Parle',
    packSize: '100g',
    imageUrl: 'data:image/jpeg;base64,parlegA',
    unit: 'pack',
    sellingPrice: 20,
    source: 'manual',
  });
  assert.equal(shopASave.product.name, 'Parle-G');
  assert.equal(shopASave.product.sellingPrice, 20);
  assert.equal(shopASave.globalUpdated, true);
  assert.equal(shopASave.variantMismatch, false);

  const global1 = store.findGlobalProduct('8901063010017');
  assert.ok(global1);
  assert.equal(global1.name, 'Parle-G');
  assert.equal(global1.suggestedPrice, 20);
  assert.equal(global1.packSize, '100g');
  assert.equal(global1.imageUrl, 'data:image/jpeg;base64,parlegA');
  assert.equal(global1.createdByUid, 'uid-shop-a');

  // Shop B scans same barcode -> sees Global info, has no private record yet
  assert.equal(store.findNovaProductByBarcode('uid-shop-b', '8901063010017'), null);
  const globalForB = store.findGlobalProduct('8901063010017');
  assert.equal(globalForB?.name, 'Parle-G');
  assert.equal(globalForB?.suggestedPrice, 20);

  // Shop B edits price to ₹30 and renames item privately
  const shopBSave = store.upsertNovaProductWithGlobal('uid-shop-b', {
    barcode: '8901063010017',
    name: 'Parle-G Shop B Pack',
    packSize: '100g',
    imageUrl: 'data:image/jpeg;base64,parlegA',
    sellingPrice: 30,
    source: 'global',
  });
  assert.equal(shopBSave.product.name, 'Parle-G Shop B Pack');
  assert.equal(shopBSave.product.sellingPrice, 30);
  assert.equal(shopBSave.globalUpdated, false);

  // Shop C scans same barcode -> sees original Global info (Parle-G, ₹20), NOT Shop B's custom ₹30 or name
  assert.equal(store.findNovaProductByBarcode('uid-shop-c', '8901063010017'), null);
  const globalForC = store.findGlobalProduct('8901063010017');
  assert.equal(globalForC?.name, 'Parle-G');
  assert.equal(globalForC?.suggestedPrice, 20);
  assert.equal(globalForC?.imageUrl, 'data:image/jpeg;base64,parlegA');

  // Re-verify all 3 shops independently
  assert.equal(store.findNovaProductByBarcode('uid-shop-a', '8901063010017')?.sellingPrice, 20);
  assert.equal(store.findNovaProductByBarcode('uid-shop-a', '8901063010017')?.name, 'Parle-G');
  assert.equal(store.findNovaProductByBarcode('uid-shop-b', '8901063010017')?.sellingPrice, 30);
  assert.equal(store.findNovaProductByBarcode('uid-shop-b', '8901063010017')?.name, 'Parle-G Shop B Pack');

  // Duplicate prevention: re-saving same barcode + packSize in Shop A updates in-place
  store.upsertNovaProductWithGlobal('uid-shop-a', {
    barcode: '8901063010017',
    name: 'Parle-G',
    packSize: '100g',
    sellingPrice: 20,
  });
  assert.equal(store.listNovaProducts('uid-shop-a').length, 1);
  assert.equal(store.listGlobalProducts().length, 1);

  // Variant mismatch safety: different packSize ('250g') does NOT corrupt Global '100g' record
  const variantSave = store.upsertNovaProductWithGlobal('uid-shop-b', {
    barcode: '8901063010017',
    name: 'Parle-G Family Pack',
    packSize: '250g',
    sellingPrice: 50,
  });
  assert.equal(variantSave.variantMismatch, true);
  assert.equal(store.listNovaProducts('uid-shop-b').length, 2);
  assert.equal(store.findGlobalProduct('8901063010017')?.packSize, '100g');
  assert.equal(store.findGlobalProduct('8901063010017')?.suggestedPrice, 20);
  assert.equal(store.findGlobalProduct('8901063010017')?.name, 'Parle-G');
});

test('ShopDataStore persists word/mixed quantityLabel and unit (gm/kg/pcs/litre) on sales & ledger', () => {
  const store = new ShopDataStore(null);
  store.getOrInitProfile('uid-qty', { email: 'qty@shop.in', displayName: 'Qty Shop' });
  const cust = store.createCustomer('uid-qty', {
    name: 'Sohan',
    mobileNumber: '9876543210',
  });

  const { sale } = store.createAtomicSale('uid-qty', 'uid-qty', {
    customerId: cust.id,
    customerName: cust.name,
    items: [
      {
        id: 'row-1',
        name: 'Sugar',
        quantity: 1,
        quantityLabel: 'आधा किलो',
        unit: 'gm',
        unitPrice: 25,
        lineTotal: 25,
      },
      {
        id: 'row-2',
        name: 'Milk',
        quantity: 2,
        quantityLabel: '2 packet',
        unit: 'litre',
        unitPrice: 32,
        lineTotal: 64,
      },
    ],
    subtotal: 89,
    discount: 0,
    finalTotal: 89,
    paymentMethod: 'udhaar',
  });

  assert.equal(sale.items[0].quantityLabel, 'आधा किलो');
  assert.equal(sale.items[0].unit, 'gm');
  assert.equal(sale.items[1].quantityLabel, '2 packet');
  assert.equal(sale.items[1].unit, 'litre');

  const ledger = store.listLedger('uid-qty', cust.id);
  assert.equal(ledger.length, 1);
  assert.match(ledger[0].itemSummary || '', /आधा किलो gm/);
  assert.match(ledger[0].itemSummary || '', /2 packet litre/);
});

test('ShopDataStore permanently preserves Premier active state across server restart even if local disk initialized free/pending first', () => {
  const store = new ShopDataStore(null);
  const olderTrustedIso = '2026-11-24T10:00:00.000Z';

  // Suppose cold start created an unupgraded profile first (newer timestamp than older RTDB snapshot)
  store.getOrInitProfile('uid-prem', { email: 'prem@shop.in', displayName: 'Prem Owner' });

  // Syncing trusted RTDB snapshot with premium_active MUST restore Premier status & proModeEnabled
  const restored = store.syncShopSnapshot(
    'uid-prem',
    { email: 'prem@shop.in', displayName: 'Prem Owner' },
    null,
    {
      uid: 'uid-prem',
      displayName: 'Prem Owner',
      email: 'prem@shop.in',
      role: 'shopkeeper',
      language: 'hi',
      subscriptionStatus: 'premium_active',
      proModeEnabled: true,
      accountStatus: 'active',
      createdAt: olderTrustedIso,
      updatedAt: olderTrustedIso,
    }
  );
  assert.equal(restored.userProfile.subscriptionStatus, 'premium_active');
  assert.equal(restored.userProfile.proModeEnabled, true);

  // Syncing a stale/older free profile later NEVER downgrades active Premier user
  const afterStale = store.syncShopSnapshot(
    'uid-prem',
    { email: 'prem@shop.in', displayName: 'Prem Owner' },
    null,
    {
      uid: 'uid-prem',
      displayName: 'Prem Owner',
      email: 'prem@shop.in',
      role: 'shopkeeper',
      language: 'hi',
      subscriptionStatus: 'free',
      accountStatus: 'active',
      createdAt: olderTrustedIso,
      updatedAt: '2026-11-23T09:00:00.000Z',
    }
  );
  assert.equal(afterStale.userProfile.subscriptionStatus, 'premium_active');

  // Admin explicit downgrade IS respected
  const downgraded = store.adminUpdateUser('uid-prem', { subscriptionStatus: 'free' });
  assert.equal(downgraded.subscriptionStatus, 'free');
});

test('Global Product Sharing shares category/image updates across 3 shops, supports Global Search, and keeps Shop A ₹20, B ₹30, C ₹25 private', () => {
  const store = new ShopDataStore(null);

  // Shop A saves Parle-G with barcode, photo, packSize, category & ₹20
  const saveA = store.upsertNovaProductWithGlobal('shop-a-uid', {
    barcode: '8901063010017',
    name: 'Parle-G',
    brand: 'Parle',
    packSize: '100g',
    categories: 'Biscuits',
    imageUrl: 'data:image/jpeg;base64,imgA',
    unit: 'pack',
    sellingPrice: 20,
    source: 'manual',
  });
  assert.equal(saveA.globalProduct?.categories, 'Biscuits');
  assert.equal(saveA.globalProduct?.suggestedPrice, 20);

  // Shop B searches Global catalog by category/name and sets private price ₹30
  const searchB = store.searchGlobalProducts('Biscuits');
  assert.equal(searchB.length, 1);
  assert.equal(searchB[0].name, 'Parle-G');
  assert.equal(searchB[0].suggestedPrice, 20);
  store.upsertNovaProductWithGlobal('shop-b-uid', {
    barcode: '8901063010017',
    name: 'Parle-G',
    packSize: '100g',
    categories: 'Biscuits',
    imageUrl: 'data:image/jpeg;base64,imgA',
    sellingPrice: 30,
    source: 'global',
  });

  // Shop C scans/searches same barcode and sets private price ₹25 -> Global suggested stays ₹20
  const globalForC = store.findGlobalProduct('8901063010017');
  assert.equal(globalForC?.suggestedPrice, 20);
  assert.equal(globalForC?.categories, 'Biscuits');
  store.upsertNovaProductWithGlobal('shop-c-uid', {
    barcode: '8901063010017',
    name: 'Parle-G',
    packSize: '100g',
    sellingPrice: 25,
    source: 'global',
  });
  assert.equal(store.findGlobalProduct('8901063010017')?.suggestedPrice, 20);

  // Creator Shop A updates Global Product metadata (category + image + name)
  const updateA = store.upsertNovaProductWithGlobal('shop-a-uid', {
    id: saveA.product.id,
    barcode: '8901063010017',
    name: 'Parle-G Original Gold',
    brand: 'Parle',
    packSize: '100g',
    categories: 'Biscuits & Snacks',
    imageUrl: 'data:image/jpeg;base64,imgA_v2',
    sellingPrice: 20,
    allowGlobalUpdate: true,
  });
  assert.equal(updateA.globalUpdated, true);

  // Other shops receive updated Global details on lookup/search while retaining their own private prices
  const updatedGlobal = store.findGlobalProduct('8901063010017');
  assert.equal(updatedGlobal?.name, 'Parle-G Original Gold');
  assert.equal(updatedGlobal?.categories, 'Biscuits & Snacks');
  assert.equal(updatedGlobal?.imageUrl, 'data:image/jpeg;base64,imgA_v2');
  assert.equal(updatedGlobal?.suggestedPrice, 20);

  assert.equal(store.findNovaProductByBarcode('shop-a-uid', '8901063010017')?.sellingPrice, 20);
  assert.equal(store.findNovaProductByBarcode('shop-b-uid', '8901063010017')?.sellingPrice, 30);
  assert.equal(store.findNovaProductByBarcode('shop-c-uid', '8901063010017')?.sellingPrice, 25);

  // Hydrate from newer remote Global record updates stale local cache
  const hydrated = store.hydrateGlobalProduct({
    barcode: '8901063010017',
    name: 'Parle-G Cloud Synced',
    categories: 'Bakery & Biscuits',
    unit: 'pack',
    suggestedPrice: 20,
    source: 'community',
    createdByUid: 'shop-a-uid',
    createdAt: updatedGlobal!.createdAt,
    updatedAt: '2099-01-01T00:00:00.000Z',
  });
  assert.equal(hydrated?.name, 'Parle-G Cloud Synced');
  assert.equal(hydrated?.categories, 'Bakery & Biscuits');
});

test('ShopDataStore preserves full untruncated support messages and tracks user suspension status', () => {
  const store = new ShopDataStore(null);
  store.getOrInitProfile('uid-sup', { email: 'sup@shop.in', displayName: 'Sup Owner' });

  assert.equal(store.isUserSuspended('uid-sup'), false);
  store.adminUpdateUser('uid-sup', { accountStatus: 'suspended' });
  assert.equal(store.isUserSuspended('uid-sup'), true);

  store.adminUpdateUser('uid-sup', { accountStatus: 'active' });
  assert.equal(store.isUserSuspended('uid-sup'), false);

  const longMessage =
    'Namaste team, my Parle-G 100g barcode scanner works great on mobile Chrome, however I need help updating my shop GSTIN and UPI scanner QR image from gallery without losing existing customers.';
  assert.ok(longMessage.length > 120);

  const ticket = store.createSupportTicket({
    uid: 'uid-sup',
    shopId: 'uid-sup',
    senderName: 'Sup Owner',
    shopName: 'Sup Kirana',
    phoneNumber: '9876543210',
    subject: 'Need GST and QR assistance',
    lastMessagePreview: longMessage.slice(0, 120),
    message: longMessage,
  });

  assert.equal(ticket.lastMessagePreview.length, 120);
  const messages = store.listTicketMessages(ticket.id, 'uid-sup');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, longMessage);
  assert.equal((ticket as unknown as { message?: string }).message, undefined);
});


