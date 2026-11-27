import test from 'node:test';
import assert from 'node:assert/strict';
import type { GlobalProduct, NovaProduct } from '../types/models';
import {
  addSingleScannedProductToSaleRows,
  buildOpenFoodFactsUrl,
  doPackSizesConflict,
  evaluateBatchExpiryStatus,
  isValidBarcode,
  mergeAndSearchGlobalProducts,
  normalizeBarcode,
  parseOpenFoodFactsResponse,
  serializeNovaBillForNewSale,
  shouldIgnoreDuplicateScan,
  summarizeProductExpiryAlerts,
  toSafeBarcodeDocId,
  upsertBillItemFromScan,
} from './novaScan';

test('normalizeBarcode and isValidBarcode handle EAN-13, EAN-8, UPC-A, UPC-E, Code 128, and invalid inputs', () => {
  assert.equal(normalizeBarcode(' 8909 1060 46351 '), '8909106046351');
  assert.equal(isValidBarcode('8909106046351'), true); // EAN-13
  assert.equal(isValidBarcode('96385074'), true); // EAN-8
  assert.equal(isValidBarcode('036000291452'), true); // UPC-A
  assert.equal(isValidBarcode('0425261'), true); // UPC-E
  assert.equal(isValidBarcode('KN-CODE128-A1'), true); // Code 128
  assert.equal(isValidBarcode('12'), false);
  assert.equal(isValidBarcode(''), false);
});

test('buildOpenFoodFactsUrl targets official v3.6 production endpoint with required fields', () => {
  const url = buildOpenFoodFactsUrl('8909106046351');
  assert.equal(
    url,
    'https://world.openfoodfacts.org/api/v3.6/product/8909106046351.json?fields=code,product_name,brands,quantity,categories,image_url,product_quantity'
  );
});

test('parseOpenFoodFactsResponse parses real 8909106046351 Sunsilk payload without inventing missing fields', () => {
  const realSample = {
    code: '8909106046351',
    errors: [],
    product: {
      code: '8909106046351',
      image_url:
        'https://images.openfoodfacts.org/images/products/890/910/604/6351/front_en.13.400.jpg',
      product_name: 'sunsilk',
    },
    result: {
      id: 'product_found',
      lc_name: 'Product found',
      name: 'Product found',
    },
    status: 'success',
    warnings: [],
  };

  const parsed = parseOpenFoodFactsResponse(realSample, '8909106046351');
  assert.equal(parsed.found, true);
  assert.equal(parsed.barcode, '8909106046351');
  assert.equal(parsed.productName, 'sunsilk');
  assert.equal(
    parsed.imageUrl,
    'https://images.openfoodfacts.org/images/products/890/910/604/6351/front_en.13.400.jpg'
  );
  // Missing fields must remain undefined — never invented
  assert.equal(parsed.brand, undefined);
  assert.equal(parsed.packSize, undefined);
});

test('parseOpenFoodFactsResponse handles not-found responses cleanly', () => {
  const missingPayload = {
    code: '9999999999999',
    status: 'failure',
    result: { id: 'product_not_found', name: 'Product not found' },
  };
  const parsed = parseOpenFoodFactsResponse(missingPayload, '9999999999999');
  assert.equal(parsed.found, false);
  assert.equal(parsed.barcode, '9999999999999');
});

test('shouldIgnoreDuplicateScan prevents rapid duplicate frame reads while allowing intentional repeat scans', () => {
  const last = { barcode: '8909106046351', timestampMs: 10000 };
  assert.equal(shouldIgnoreDuplicateScan(last, '8909106046351', 10500, 1800), true);
  assert.equal(shouldIgnoreDuplicateScan(last, '8909106046351', 12000, 1800), false);
  assert.equal(shouldIgnoreDuplicateScan(last, '8901234567890', 10500, 1800), false);
});

test('upsertBillItemFromScan prompts for price when missing, uses saved selling price when available, and increments quantity on repeat scan', () => {
  // 1. First scan without saved shop price -> needs confirmation (never assumes MRP)
  const step1 = upsertBillItemFromScan(
    [],
    {
      barcode: '8909106046351',
      name: 'sunsilk',
      source: 'openfoodfacts',
    },
    1000
  );
  assert.equal(step1.length, 1);
  assert.equal(step1[0].quantity, 1);
  assert.equal(step1[0].sellingPrice, null);
  assert.equal(step1[0].priceConfirmed, false);

  // 2. Second scan of same barcode increments quantity
  const step2 = upsertBillItemFromScan(
    step1,
    {
      barcode: '8909106046351',
      name: 'sunsilk',
      source: 'openfoodfacts',
    },
    3000
  );
  assert.equal(step2.length, 1);
  assert.equal(step2[0].quantity, 2);

  // 3. Product with shop saved selling price auto-fills and marks priceConfirmed
  const step3 = upsertBillItemFromScan(
    step2,
    {
      barcode: '8901491101837',
      productId: 'prod-lays',
      name: 'Lays Classic',
      packSize: '50 g',
      savedSellingPrice: 20,
      source: 'shop',
    },
    4000
  );
  assert.equal(step3.length, 2);
  assert.equal(step3[0].sellingPrice, 20);
  assert.equal(step3[0].priceConfirmed, true);

  const preloaded = serializeNovaBillForNewSale(step3);
  assert.equal(preloaded.length, 1);
  assert.equal(preloaded[0].name, 'Lays Classic (50 g)');
  assert.equal(preloaded[0].unitPrice, 20);
});

test('evaluateBatchExpiryStatus and summarizeProductExpiryAlerts flag expired and soon-to-expire batches accurately', () => {
  const refDate = new Date('2026-11-24T12:00:00Z');
  assert.equal(evaluateBatchExpiryStatus('2026-11-20', refDate).status, 'expired');
  assert.equal(evaluateBatchExpiryStatus('2026-12-10', refDate).status, 'expiring_soon');
  assert.equal(evaluateBatchExpiryStatus('2027-05-01', refDate).status, 'valid');
  assert.equal(evaluateBatchExpiryStatus('', refDate).status, 'unknown');

  const products: NovaProduct[] = [
    {
      id: 'p1',
      shopId: 's1',
      barcode: '8909106046351',
      name: 'sunsilk',
      unit: 'pcs',
      sellingPrice: 185,
      source: 'openfoodfacts',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      batches: [
        {
          id: 'b1',
          batchNumber: 'BATCH-OLD',
          expiryDate: '2026-11-20',
          quantity: 4,
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 'b2',
          batchNumber: 'BATCH-SOON',
          expiryDate: '2026-12-05',
          quantity: 6,
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 'b3',
          batchNumber: 'BATCH-ZERO',
          expiryDate: '2026-11-01',
          quantity: 0,
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ],
    },
  ];

  const alerts = summarizeProductExpiryAlerts(products, refDate);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].status, 'expired');
  assert.equal(alerts[0].batchNumber, 'BATCH-OLD');
  assert.equal(alerts[1].status, 'expiring_soon');
  assert.equal(alerts[1].batchNumber, 'BATCH-SOON');
});

test('addSingleScannedProductToSaleRows adds one row per scan, replaces initial blank row, and respects shop selling price', () => {
  const initialBlank = [{ id: '1', name: '', quantityText: '', priceText: '' }];
  const res1 = addSingleScannedProductToSaleRows(initialBlank, {
    id: 'scan-1',
    barcode: '8909106046351',
    name: 'sunsilk',
    packSize: '180 ml',
  });
  assert.equal(res1.rows.length, 1);
  assert.equal(res1.rows[0].name, 'sunsilk (180 ml)');
  assert.equal(res1.rows[0].quantityText, '1');
  assert.equal(res1.rows[0].priceText, '');
  assert.equal(res1.needsPriceEntry, true);

  const res2 = addSingleScannedProductToSaleRows(res1.rows, {
    id: 'scan-2',
    barcode: '8901491101837',
    productId: 'prod-lays',
    name: 'Lays Classic',
    savedSellingPrice: 20,
  });
  assert.equal(res2.rows.length, 2);
  assert.equal(res2.rows[1].name, 'Lays Classic');
  assert.equal(res2.rows[1].priceText, '20');
  assert.equal(res2.needsPriceEntry, false);
});

test('doPackSizesConflict, toSafeBarcodeDocId, and global suggested price precedence work accurately', () => {
  assert.equal(doPackSizesConflict('100 g', '100g'), false);
  assert.equal(doPackSizesConflict('100 g', '250g'), true);
  assert.equal(doPackSizesConflict('100 g', undefined), false);

  assert.equal(toSafeBarcodeDocId('8901063010017'), '8901063010017');
  assert.ok(toSafeBarcodeDocId('KN/CODE+128').startsWith('bhex_'));

  // Global suggested price pre-fills for Shop B, while Shop saved price takes precedence when set
  const withGlobal = upsertBillItemFromScan(
    [],
    {
      barcode: '8901063010017',
      name: 'Parle-G',
      packSize: '100g',
      suggestedSellingPrice: 20,
      source: 'global',
    },
    1000
  );
  assert.equal(withGlobal[0].sellingPrice, 20);
  assert.equal(withGlobal[0].isGlobalSuggestedPrice, true);
  assert.equal(withGlobal[0].hasSavedPrice, false);
  assert.equal(withGlobal[0].priceConfirmed, true);

  // Different pack size variant with same barcode adds separate line instead of merging
  const withVariant = upsertBillItemFromScan(
    withGlobal,
    {
      barcode: '8901063010017',
      name: 'Parle-G Jumbo',
      packSize: '250g',
      savedSellingPrice: 50,
      source: 'shop',
    },
    2000
  );
  assert.equal(withVariant.length, 2);
  assert.equal(withVariant[0].sellingPrice, 50);
  assert.equal(withVariant[0].hasSavedPrice, true);

  const saleRow = addSingleScannedProductToSaleRows([{ id: '1', name: '', quantityText: '', priceText: '' }], {
    id: 'scan-global-1',
    barcode: '8901063010017',
    name: 'Parle-G',
    packSize: '100g',
    suggestedSellingPrice: 20,
  });
  assert.equal(saleRow.rows[0].priceText, '20');
  assert.equal(saleRow.needsPriceEntry, false);
});

test('mergeAndSearchGlobalProducts deduplicates barcodes by newest updatedAt and filters by name/category/barcode', () => {
  const items: GlobalProduct[] = [
    {
      barcode: '8901063010017',
      name: 'Parle-G Old',
      categories: 'Biscuits',
      unit: 'pack',
      suggestedPrice: 20,
      source: 'community',
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T01:00:00.000Z',
    },
    {
      barcode: '8901063010017',
      name: 'Parle-G Gold',
      categories: 'Biscuits & Snacks',
      unit: 'pack',
      suggestedPrice: 20,
      source: 'community',
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-25T01:00:00.000Z',
    },
    {
      barcode: '8901491101837',
      name: 'Lays Classic',
      categories: 'Chips',
      unit: 'pack',
      suggestedPrice: 20,
      source: 'community',
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T02:00:00.000Z',
    },
  ];

  const all = mergeAndSearchGlobalProducts(items);
  assert.equal(all.length, 2);
  assert.equal(all[0].name, 'Parle-G Gold');

  const byCategory = mergeAndSearchGlobalProducts(items, 'snacks');
  assert.equal(byCategory.length, 1);
  assert.equal(byCategory[0].barcode, '8901063010017');
});

