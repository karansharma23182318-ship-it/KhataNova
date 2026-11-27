import { roundCurrency } from './finance';

export type CalcUnit = 'kg' | 'litre' | 'dozen' | 'pcs';

export interface RateBookItem {
  id: string;
  name: string;
  unit: CalcUnit;
  baseRate: number;
  updatedAt: string;
}

export interface RateCalculationResult {
  normalizedQty: number;
  totalPrice: number;
  qtyDisplayHi: string;
  qtyDisplayEn: string;
  unitLabelHi: string;
  unitLabelEn: string;
}

export interface BudgetWeightResult {
  normalizedQty: number;
  primaryQty: number;
  subQty: number;
  displayHi: string;
  displayEn: string;
}

export interface ChangeReturnResult {
  changeDue: number;
  shortBy: number;
}

export function getUnitLabels(unit: CalcUnit): { hi: string; en: string } {
  switch (unit) {
    case 'kg':
      return { hi: 'प्रति Kg', en: 'per Kg' };
    case 'litre':
      return { hi: 'प्रति Litre', en: 'per Litre' };
    case 'dozen':
      return { hi: 'प्रति दर्जन', en: 'per Dozen' };
    case 'pcs':
      return { hi: 'प्रति पीस', en: 'per Piece' };
  }
}

export function calculateRateByUnit(params: {
  unit: CalcUnit;
  baseRate: number;
  primaryQty: number;
  subQty?: number;
}): RateCalculationResult {
  const safeRate = Math.max(0, Number(params.baseRate) || 0);
  const safePrimary = Math.max(0, Number(params.primaryQty) || 0);
  const safeSub = Math.max(0, Number(params.subQty) || 0);
  const labels = getUnitLabels(params.unit);

  let normalizedQty = safePrimary;
  let qtyDisplayHi = '';
  let qtyDisplayEn = '';

  if (params.unit === 'kg') {
    normalizedQty = safePrimary + safeSub / 1000;
    const totalGrams = Math.round(normalizedQty * 1000);
    const kgPart = Math.floor(totalGrams / 1000);
    const gmPart = totalGrams % 1000;
    if (kgPart > 0 && gmPart > 0) {
      qtyDisplayHi = `${kgPart} kg ${gmPart} gm`;
      qtyDisplayEn = `${kgPart} kg ${gmPart} g`;
    } else if (kgPart > 0) {
      qtyDisplayHi = `${kgPart} kg`;
      qtyDisplayEn = `${kgPart} kg`;
    } else {
      qtyDisplayHi = `${gmPart} gm`;
      qtyDisplayEn = `${gmPart} g`;
    }
  } else if (params.unit === 'litre') {
    normalizedQty = safePrimary + safeSub / 1000;
    const totalMl = Math.round(normalizedQty * 1000);
    const lPart = Math.floor(totalMl / 1000);
    const mlPart = totalMl % 1000;
    if (lPart > 0 && mlPart > 0) {
      qtyDisplayHi = `${lPart} L ${mlPart} ml`;
      qtyDisplayEn = `${lPart} L ${mlPart} ml`;
    } else if (lPart > 0) {
      qtyDisplayHi = `${lPart} L`;
      qtyDisplayEn = `${lPart} L`;
    } else {
      qtyDisplayHi = `${mlPart} ml`;
      qtyDisplayEn = `${mlPart} ml`;
    }
  } else if (params.unit === 'dozen') {
    normalizedQty = safePrimary + safeSub / 12;
    const totalPcs = Math.round(normalizedQty * 12);
    const dozPart = Math.floor(totalPcs / 12);
    const pcsPart = totalPcs % 12;
    if (dozPart > 0 && pcsPart > 0) {
      qtyDisplayHi = `${dozPart} दर्जन ${pcsPart} पीस`;
      qtyDisplayEn = `${dozPart} doz ${pcsPart} pcs`;
    } else if (dozPart > 0) {
      qtyDisplayHi = `${dozPart} दर्जन`;
      qtyDisplayEn = `${dozPart} doz`;
    } else {
      qtyDisplayHi = `${pcsPart} पीस`;
      qtyDisplayEn = `${pcsPart} pcs`;
    }
  } else {
    normalizedQty = safePrimary;
    const roundedQty = Math.round(normalizedQty * 100) / 100;
    qtyDisplayHi = `${roundedQty} पीस`;
    qtyDisplayEn = `${roundedQty} pcs`;
  }

  const roundedNormalized = Math.round(normalizedQty * 10000) / 10000;
  const totalPrice = roundCurrency(roundedNormalized * safeRate);

  return {
    normalizedQty: roundedNormalized,
    totalPrice,
    qtyDisplayHi,
    qtyDisplayEn,
    unitLabelHi: labels.hi,
    unitLabelEn: labels.en,
  };
}

export function calculateWeightFromBudget(params: {
  unit: CalcUnit;
  baseRate: number;
  budgetAmount: number;
}): BudgetWeightResult {
  const safeRate = Math.max(0, Number(params.baseRate) || 0);
  const safeBudget = Math.max(0, Number(params.budgetAmount) || 0);

  if (safeRate <= 0 || safeBudget <= 0) {
    return {
      normalizedQty: 0,
      primaryQty: 0,
      subQty: 0,
      displayHi: '0',
      displayEn: '0',
    };
  }

  const rawQty = safeBudget / safeRate;
  const normalizedQty = Math.round(rawQty * 1000) / 1000;

  if (params.unit === 'kg' || params.unit === 'litre') {
    const totalSub = Math.round(rawQty * 1000);
    const primaryQty = Math.floor(totalSub / 1000);
    const subQty = totalSub % 1000;
    const primaryLabel = params.unit === 'kg' ? 'kg' : 'L';
    const subLabel = params.unit === 'kg' ? 'gm' : 'ml';
    const parts: string[] = [];
    if (primaryQty > 0) parts.push(`${primaryQty} ${primaryLabel}`);
    if (subQty > 0 || primaryQty === 0) parts.push(`${subQty} ${subLabel}`);
    const text = parts.join(' ');
    return {
      normalizedQty,
      primaryQty,
      subQty,
      displayHi: text,
      displayEn: text,
    };
  }

  if (params.unit === 'dozen') {
    const totalPcs = Math.round(rawQty * 12);
    const primaryQty = Math.floor(totalPcs / 12);
    const subQty = totalPcs % 12;
    const hiParts: string[] = [];
    const enParts: string[] = [];
    if (primaryQty > 0) {
      hiParts.push(`${primaryQty} दर्जन`);
      enParts.push(`${primaryQty} doz`);
    }
    if (subQty > 0 || primaryQty === 0) {
      hiParts.push(`${subQty} पीस`);
      enParts.push(`${subQty} pcs`);
    }
    return {
      normalizedQty: Math.round((totalPcs / 12) * 1000) / 1000,
      primaryQty,
      subQty,
      displayHi: hiParts.join(' '),
      displayEn: enParts.join(' '),
    };
  }

  const roundedPcs = Math.round(rawQty * 100) / 100;
  return {
    normalizedQty: roundedPcs,
    primaryQty: roundedPcs,
    subQty: 0,
    displayHi: `${roundedPcs} पीस`,
    displayEn: `${roundedPcs} pcs`,
  };
}

export function calculateChangeReturn(totalAmount: number, cashGiven: number): ChangeReturnResult {
  const total = Math.max(0, roundCurrency(Number(totalAmount) || 0));
  const given = Math.max(0, roundCurrency(Number(cashGiven) || 0));
  if (given >= total) {
    return {
      changeDue: roundCurrency(given - total),
      shortBy: 0,
    };
  }
  return {
    changeDue: 0,
    shortBy: roundCurrency(total - given),
  };
}
