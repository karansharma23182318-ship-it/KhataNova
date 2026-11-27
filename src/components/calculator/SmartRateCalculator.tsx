import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calculator,
  Plus,
  ReceiptIndianRupee,
  RotateCcw,
  Scale,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  calculateChangeReturn,
  calculateRateByUnit,
  calculateWeightFromBudget,
  getUnitLabels,
  type CalcUnit,
} from '../../utils/calculator';
import { formatINR } from '../../utils/finance';

export interface CalculatorBasketLine {
  id: string;
  name: string;
  unit: CalcUnit;
  baseRate: number;
  normalizedQty: number;
  qtyDisplay: string;
  lineTotal: number;
}

interface SmartRateCalculatorProps {
  variant?: 'page' | 'drawer' | 'inline';
  initialBillTotal?: number;
  onAddLineToBill?: (line: {
    name: string;
    quantity: number;
    unitPrice: number;
  }) => void;
  onCloseDrawer?: () => void;
}

export function SmartRateCalculator({
  variant = 'page',
  initialBillTotal,
  onAddLineToBill,
  onCloseDrawer,
}: SmartRateCalculatorProps) {
  const { isProMode } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const isHindi = language === 'hi';
  const isPro = isProMode;

  const [mode, setMode] = useState<'qtyToPrice' | 'budgetToQty'>('qtyToPrice');
  const [itemName, setItemName] = useState('');
  const [unit, setUnit] = useState<CalcUnit>('kg');
  const [baseRateText, setBaseRateText] = useState('');
  const [primaryQtyText, setPrimaryQtyText] = useState('1');
  const [subQtyText, setSubQtyText] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [cashGivenText, setCashGivenText] = useState('');

  const [basket, setBasket] = useState<CalculatorBasketLine[]>([]);

  const baseRate = Math.max(0, Number(baseRateText) || 0);
  const primaryQty = Math.max(0, Number(primaryQtyText) || 0);
  const subQty = Math.max(0, Number(subQtyText) || 0);
  const budgetAmount = Math.max(0, Number(budgetText) || 0);

  const qtyResult = useMemo(
    () =>
      calculateRateByUnit({
        unit,
        baseRate,
        primaryQty,
        subQty,
      }),
    [unit, baseRate, primaryQty, subQty]
  );

  const budgetResult = useMemo(
    () =>
      calculateWeightFromBudget({
        unit,
        baseRate,
        budgetAmount,
      }),
    [unit, baseRate, budgetAmount]
  );

  const basketTotal = useMemo(
    () => basket.reduce((sum, line) => sum + line.lineTotal, 0),
    [basket]
  );

  const activeTotalForChange =
    basket.length > 0
      ? basketTotal
      : mode === 'qtyToPrice' && qtyResult.totalPrice > 0
        ? qtyResult.totalPrice
        : initialBillTotal && initialBillTotal > 0
          ? initialBillTotal
          : 0;

  const cashGiven = Math.max(0, Number(cashGivenText) || 0);
  const changeResult = useMemo(
    () => calculateChangeReturn(activeTotalForChange, cashGiven),
    [activeTotalForChange, cashGiven]
  );

  const unitLabels = getUnitLabels(unit);

  const applyQuickSubDelta = (deltaPrimary: number, deltaSub: number) => {
    if (unit === 'kg' || unit === 'litre') {
      const currentTotalSub = Math.round(primaryQty * 1000 + subQty);
      const nextTotalSub = Math.max(0, currentTotalSub + deltaPrimary * 1000 + deltaSub);
      setPrimaryQtyText(String(Math.floor(nextTotalSub / 1000)));
      const rem = nextTotalSub % 1000;
      setSubQtyText(rem > 0 ? String(rem) : '');
      return;
    }
    if (unit === 'dozen') {
      const currentTotalPcs = Math.round(primaryQty * 12 + subQty);
      const nextTotalPcs = Math.max(0, currentTotalPcs + deltaPrimary * 12 + deltaSub);
      setPrimaryQtyText(String(Math.floor(nextTotalPcs / 12)));
      const rem = nextTotalPcs % 12;
      setSubQtyText(rem > 0 ? String(rem) : '');
      return;
    }
    const nextPcs = Math.max(0, primaryQty + deltaPrimary);
    setPrimaryQtyText(String(nextPcs));
  };

  const handleAddCalculatedLine = () => {
    const cleanName = itemName.trim() || (isHindi ? 'सामान' : 'Item');
    if (mode === 'qtyToPrice') {
      if (qtyResult.normalizedQty <= 0 || baseRate <= 0) return;
      const qtyText = isHindi ? qtyResult.qtyDisplayHi : qtyResult.qtyDisplayEn;
      if (variant === 'inline' && onAddLineToBill) {
        onAddLineToBill({
          name: `${cleanName} (${qtyText})`,
          quantity: qtyResult.normalizedQty,
          unitPrice: baseRate,
        });
        return;
      }
      setBasket((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          unit,
          baseRate,
          normalizedQty: qtyResult.normalizedQty,
          qtyDisplay: qtyText,
          lineTotal: qtyResult.totalPrice,
        },
      ]);
      return;
    }

    if (budgetResult.normalizedQty <= 0 || baseRate <= 0 || budgetAmount <= 0) return;
    const qtyText = isHindi ? budgetResult.displayHi : budgetResult.displayEn;
    if (variant === 'inline' && onAddLineToBill) {
      onAddLineToBill({
        name: `${cleanName} (${qtyText})`,
        quantity: budgetResult.normalizedQty,
        unitPrice: baseRate,
      });
      return;
    }
    setBasket((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        unit,
        baseRate,
        normalizedQty: budgetResult.normalizedQty,
        qtyDisplay: qtyText,
        lineTotal: budgetAmount,
      },
    ]);
  };

  const handleSendBasketToNewSale = () => {
    const lines =
      basket.length > 0
        ? basket.map((line) => ({
            name: `${line.name} (${line.qtyDisplay})`,
            quantity: line.normalizedQty,
            unitPrice: line.baseRate,
          }))
        : mode === 'qtyToPrice' && qtyResult.normalizedQty > 0 && baseRate > 0
          ? [
              {
                name: `${itemName.trim() || (isHindi ? 'सामान' : 'Item')} (${
                  isHindi ? qtyResult.qtyDisplayHi : qtyResult.qtyDisplayEn
                })`,
                quantity: qtyResult.normalizedQty,
                unitPrice: baseRate,
              },
            ]
          : [];

    if (lines.length === 0) return;
    if (onCloseDrawer) onCloseDrawer();
    navigate('/sales/new', { state: { preloadedItems: lines } });
  };

  const cardSurface = isPro ? 'pro-card border-amber-400/30' : 'glass-surface';

  return (
    <div className="space-y-4">
      <div className={`${cardSurface} rounded-2xl p-4 sm:p-5 space-y-4`}>
        {/* Header & Mode Switch */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
                isPro
                  ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                  : 'bg-cyan-500/15 border-cyan-400/25 text-cyan-300'
              }`}
            >
              <Scale className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white font-display">
                {isHindi ? 'स्मार्ट दुकान रेट कैलकुलेटर' : 'Smart Shop Rate Calculator'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isHindi
                  ? 'सामान का नाम और वज़न/मात्रा लिखते ही पूरा दाम व छुट्टा पाएं'
                  : 'Instant item rate by Kg/gm, Litre/ml, Dozen, or Rupee budget'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0A142D] border border-blue-400/20">
            <button
              type="button"
              onClick={() => setMode('qtyToPrice')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                mode === 'qtyToPrice'
                  ? isPro
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {isHindi ? 'मात्रा → दाम' : 'Qty → Price'}
            </button>
            <button
              type="button"
              onClick={() => setMode('budgetToQty')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                mode === 'budgetToQty'
                  ? isPro
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {isHindi ? 'रुपये → वज़न' : '₹ → Weight'}
            </button>
          </div>
        </div>

        {/* Item Name + Unit + Rate Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              {isHindi ? 'सामान का नाम' : 'Item Name'}
            </label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder={isHindi ? 'जैसे: चावल, चीनी, दूध' : 'e.g. Rice, Sugar, Milk'}
              className="w-full px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              {isHindi ? 'माप / इकाई' : 'Rate Unit'}
            </label>
            <select
              value={unit}
              onChange={(e) => {
                const next = e.target.value as CalcUnit;
                setUnit(next);
                setSubQtyText('');
              }}
              className="w-full px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="kg">{isHindi ? 'प्रति Kg (किलो/ग्राम)' : 'Per Kg (kg/gm)'}</option>
              <option value="litre">{isHindi ? 'प्रति Litre (ली/मिली)' : 'Per Litre (L/ml)'}</option>
              <option value="dozen">{isHindi ? 'प्रति दर्जन (12 पीस)' : 'Per Dozen (12 pcs)'}</option>
              <option value="pcs">{isHindi ? 'प्रति पीस / पैकेट' : 'Per Piece / Packet'}</option>
            </select>
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              {isHindi ? `रेट (₹ ${unitLabels.hi})` : `Rate (₹ ${unitLabels.en})`}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={baseRateText}
              onChange={(e) => setBaseRateText(e.target.value)}
              placeholder={isHindi ? 'जैसे: 60' : 'e.g. 60'}
              className="w-full px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 placeholder:font-sans tabular-nums focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Quantity or Budget Input */}
        {mode === 'qtyToPrice' ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  {unit === 'kg'
                    ? isHindi
                      ? 'किलो (Kg)'
                      : 'Kg'
                    : unit === 'litre'
                      ? isHindi
                        ? 'लीटर (Litre)'
                        : 'Litre'
                      : unit === 'dozen'
                        ? isHindi
                          ? 'दर्जन (Dozen)'
                          : 'Dozen'
                        : isHindi
                          ? 'मात्रा (Quantity)'
                          : 'Quantity'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={primaryQtyText}
                  onChange={(e) => setPrimaryQtyText(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white tabular-nums focus:outline-none focus:border-cyan-400"
                />
              </div>

              {unit !== 'pcs' ? (
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    {unit === 'kg'
                      ? isHindi
                        ? 'ग्राम (Gram)'
                        : 'Grams'
                      : unit === 'litre'
                        ? isHindi
                          ? 'मिलीलीटर (ml)'
                          : 'Millilitres (ml)'
                        : isHindi
                          ? 'अतिरिक्त पीस'
                          : 'Extra Pcs'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={subQtyText}
                    onChange={(e) => setSubQtyText(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white tabular-nums focus:outline-none focus:border-cyan-400"
                  />
                </div>
              ) : null}
            </div>

            {/* 1-Tap Weight/Qty Increments */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(unit === 'kg' || unit === 'litre'
                ? [
                    { label: unit === 'kg' ? '+100g' : '+100ml', p: 0, s: 100 },
                    { label: unit === 'kg' ? '+250g' : '+250ml', p: 0, s: 250 },
                    { label: unit === 'kg' ? '+500g' : '+500ml', p: 0, s: 500 },
                    { label: unit === 'kg' ? '+1kg' : '+1L', p: 1, s: 0 },
                  ]
                : unit === 'dozen'
                  ? [
                      { label: '+1 pc', p: 0, s: 1 },
                      { label: '+3 pcs', p: 0, s: 3 },
                      { label: '+6 pcs', p: 0, s: 6 },
                      { label: '+1 doz', p: 1, s: 0 },
                    ]
                  : [
                      { label: '+1', p: 1, s: 0 },
                      { label: '+2', p: 2, s: 0 },
                      { label: '+5', p: 5, s: 0 },
                      { label: '+10', p: 10, s: 0 },
                    ]
              ).map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => applyQuickSubDelta(btn.p, btn.s)}
                  className="px-2.5 py-1 rounded-lg bg-[#0A142D] hover:bg-blue-600/20 border border-blue-400/20 text-xs font-mono-num text-cyan-300"
                >
                  {btn.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPrimaryQtyText('0');
                  setSubQtyText('');
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isHindi ? 'रीसेट' : 'Reset'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              {isHindi ? 'ग्राहक कितने रुपये का सामान माँग रहा है? (₹)' : 'Customer Budget Amount (₹)'}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={budgetText}
              onChange={(e) => setBudgetText(e.target.value)}
              placeholder={isHindi ? 'जैसे: 50 या 100' : 'e.g. 50 or 100'}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white tabular-nums focus:outline-none focus:border-cyan-400"
            />
          </div>
        )}

        {/* Live Result Bar */}
        <div
          className={`rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 border ${
            isPro
              ? 'bg-[#090E1E] border-amber-400/35'
              : 'bg-[#0A142D] border-cyan-400/25'
          }`}
        >
          <div>
            <div className="text-[11px] text-slate-400">
              {mode === 'qtyToPrice'
                ? `${itemName.trim() || (isHindi ? 'सामान' : 'Item')} · ${
                    isHindi ? qtyResult.qtyDisplayHi : qtyResult.qtyDisplayEn
                  }`
                : `${itemName.trim() || (isHindi ? 'सामान' : 'Item')} · ${formatINR(budgetAmount)}`}
            </div>
            <div
              className={`text-xl font-bold font-mono-num tabular-nums ${
                isPro ? 'text-amber-300' : 'text-cyan-300'
              }`}
            >
              {mode === 'qtyToPrice'
                ? formatINR(qtyResult.totalPrice)
                : isHindi
                  ? budgetResult.displayHi
                  : budgetResult.displayEn}
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddCalculatedLine}
            disabled={
              baseRate <= 0 ||
              (mode === 'qtyToPrice' ? qtyResult.normalizedQty <= 0 : budgetAmount <= 0)
            }
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-45 whitespace-nowrap shrink-0 ${
              isPro
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {variant === 'inline'
                ? isHindi
                  ? 'बिल में जोड़ें'
                  : 'Add to Bill'
                : isHindi
                  ? 'हिसाब में जोड़ें'
                  : 'Add to Slip'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Estimate Slip & Change Return Helper (shown in page and drawer modes) */}
      {variant !== 'inline' ? (
        <div className={`${cardSurface} rounded-2xl p-4 sm:p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-white">
                {isHindi ? 'कच्ची पर्ची व छुट्टा हिसाब' : 'Estimate Slip & Change Return'}
              </h3>
            </div>
            {basket.length > 0 ? (
              <button
                type="button"
                onClick={() => setBasket([])}
                className="text-xs text-slate-400 hover:text-rose-300"
              >
                {isHindi ? 'साफ़ करें' : 'Clear'}
              </button>
            ) : null}
          </div>

          {basket.length > 0 ? (
            <div className="divide-y divide-blue-400/15">
              {basket.map((line) => (
                <div key={line.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{line.name}</div>
                    <div className="text-slate-400 font-mono-num">
                      {line.qtyDisplay} × ₹{line.baseRate}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono-num font-semibold text-cyan-300">
                      {formatINR(line.lineTotal)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => setBasket((prev) => prev.filter((item) => item.id !== line.id))}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="pt-2.5 flex items-center justify-between text-sm font-bold">
                <span className="text-slate-200">{isHindi ? 'कुल हिसाब' : 'Slip Total'}</span>
                <span className="font-mono-num text-white">{formatINR(basketTotal)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              {initialBillTotal && initialBillTotal > 0
                ? isHindi
                  ? `रसीद राशि: ${formatINR(initialBillTotal)} — नीचे ग्राहक से मिले पैसे डालकर छुट्टा जांचें।`
                  : `Receipt Bill Total: ${formatINR(initialBillTotal)} — enter cash received below to see change.`
                : isHindi
                  ? 'ऊपर सामान का हिसाब करके "+ हिसाब में जोड़ें" दबाएं या सीधे छुट्टा चेक करें।'
                  : 'Calculate items above and tap "+ Add to Slip", or use the cash change helper below.'}
            </p>
          )}

          {/* Cash Change Return Helper */}
          <div className="pt-3 border-t border-blue-400/15 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs text-slate-300">
                {isHindi ? 'ग्राहक ने नकद दिए (₹):' : 'Cash Received from Customer (₹):'}
              </label>
              <div className="flex items-center gap-1.5">
                {[100, 200, 500].map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => setCashGivenText(String(note))}
                    className="px-2 py-1 rounded-lg bg-[#0A142D] border border-blue-400/20 text-[11px] font-mono-num text-slate-200 hover:border-cyan-400"
                  >
                    ₹{note}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <input
                type="number"
                min="0"
                step="1"
                value={cashGivenText}
                onChange={(e) => setCashGivenText(e.target.value)}
                placeholder={isHindi ? 'मिले रुपये' : 'Cash given'}
                className="w-full px-3 py-2 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white tabular-nums focus:outline-none focus:border-cyan-400"
              />
              <div className="text-right">
                {cashGiven > 0 && activeTotalForChange > 0 ? (
                  changeResult.changeDue > 0 ? (
                    <div>
                      <div className="text-[11px] text-slate-400">
                        {isHindi ? 'ग्राहक को वापस करें' : 'Change to Return'}
                      </div>
                      <div className="text-base font-bold font-mono-num text-emerald-300">
                        {formatINR(changeResult.changeDue)}
                      </div>
                    </div>
                  ) : changeResult.shortBy > 0 ? (
                    <div>
                      <div className="text-[11px] text-slate-400">
                        {isHindi ? 'और लेने बाकी हैं' : 'Balance Short'}
                      </div>
                      <div className="text-base font-bold font-mono-num text-amber-300">
                        {formatINR(changeResult.shortBy)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-emerald-300">
                      {isHindi ? 'पूरा हिसाब बराबर' : 'Exact Cash'}
                    </div>
                  )
                ) : (
                  <div className="text-[11px] text-slate-500">
                    {isHindi ? 'छुट्टा यहाँ दिखेगा' : 'Change shows here'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transfer Basket to Official Bill */}
          {(basket.length > 0 || (mode === 'qtyToPrice' && qtyResult.normalizedQty > 0 && baseRate > 0)) ? (
            <button
              type="button"
              onClick={handleSendBasketToNewSale}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold transition-colors"
            >
              <ReceiptIndianRupee className="w-4 h-4" />
              <span>
                {isHindi ? 'इस हिसाब का पक्का बिल व रसीद बनाएं' : 'Create Official Bill & Receipt'}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
