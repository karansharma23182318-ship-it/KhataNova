import React from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { SmartRateCalculator } from '../../components/calculator/SmartRateCalculator';
import { useLanguage } from '../../context/LanguageContext';

export function SmartCalculator() {
  const { language } = useLanguage();
  const isHindi = language === 'hi';

  return (
    <AppLayout title={isHindi ? 'स्मार्ट रेट कैलकुलेटर' : 'Smart Rate Calculator'}>
      <div className="max-w-3xl">
        <SmartRateCalculator variant="page" />
      </div>
    </AppLayout>
  );
}
