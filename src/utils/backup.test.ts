import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShopBackupPayload, parseAndValidateShopBackup } from './backup';

test('buildShopBackupPayload and parseAndValidateShopBackup round-trip full shop backup cleanly', () => {
  const payload = buildShopBackupPayload({
    uid: 'uid-1',
    shopProfile: {
      id: 'uid-1',
      ownerUid: 'uid-1',
      ownerName: 'Ramesh',
      shopName: 'Ramesh Store',
      phoneNumber: '9876543210',
      whatsappNumber: '9876543210',
      businessType: 'Kirana',
      address: 'Main Market',
      gstNumber: '',
      email: '',
      aboutBusiness: '',
      stockManagementEnabled: false,
      reminderEnabled: true,
      reminderIntervalDays: 7,
      createdAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-23T00:00:00.000Z',
    },
    customers: [
      {
        id: 'c-1',
        shopId: 'uid-1',
        name: 'Vinay',
        mobileNumber: '9123456789',
        openingBalance: 0,
        outstandingBalance: 100,
        totalCredit: 100,
        totalPaid: 0,
        isActive: true,
        createdAt: '2026-11-21T00:00:00.000Z',
        updatedAt: '2026-11-21T00:00:00.000Z',
      },
    ],
    sales: [],
    payments: [],
    ledger: [],
    exportedAt: '2026-11-23T12:00:00.000Z',
  });

  const parsed = parseAndValidateShopBackup(JSON.stringify(payload));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.payload.shopProfile?.shopName, 'Ramesh Store');
    assert.equal(parsed.counts.customers, 1);
    assert.equal(parsed.payload.customers[0].name, 'Vinay');
  }
});

test('parseAndValidateShopBackup rejects invalid JSON and foreign files safely', () => {
  const badJson = parseAndValidateShopBackup('{not-json');
  assert.equal(badJson.ok, false);

  const foreign = parseAndValidateShopBackup(JSON.stringify({ app: 'OtherApp', customers: [] }));
  assert.equal(foreign.ok, false);

  const missingIds = parseAndValidateShopBackup(
    JSON.stringify({ app: 'KhataNova', customers: [{ name: 'NoId' }] })
  );
  assert.equal(missingIds.ok, false);
});

test('buildShopBackupPayload and parseAndValidateShopBackup preserve novaProducts and rateBook', () => {
  const payload = buildShopBackupPayload({
    uid: 'uid-2',
    shopProfile: null,
    customers: [],
    sales: [],
    payments: [],
    ledger: [],
    novaProducts: [
      {
        id: 'np-1',
        shopId: 'uid-2',
        barcode: '8901234567890',
        name: 'Tata Salt 1kg',
        unit: 'pcs',
        sellingPrice: 28,
        source: 'manual',
        batches: [],
        createdAt: '2026-11-22T00:00:00.000Z',
        updatedAt: '2026-11-23T00:00:00.000Z',
      },
    ],
    rateBook: [
      {
        id: 'rb-1',
        name: 'Mustard Oil',
        unit: 'litre',
        baseRate: 165,
        updatedAt: '2026-11-23T00:00:00.000Z',
      },
    ],
    exportedAt: '2026-11-23T12:00:00.000Z',
  });

  const parsed = parseAndValidateShopBackup(JSON.stringify(payload));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.payload.novaProducts?.length, 1);
    assert.equal(parsed.payload.novaProducts?.[0].name, 'Tata Salt 1kg');
    assert.equal(parsed.payload.rateBook?.length, 1);
    assert.equal(parsed.payload.rateBook?.[0].baseRate, 165);
  }
});
