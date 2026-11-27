import type { SubscriptionStatus, UserProfile } from '../types/models';

export const FREE_CUSTOMER_LIMIT = 10;

export function isPremiumPlan(status?: SubscriptionStatus | null): boolean {
  return status === 'premium_active';
}

export function isEffectiveProMode(
  profile?: Pick<UserProfile, 'subscriptionStatus' | 'proModeEnabled'> | null
): boolean {
  return Boolean(profile?.subscriptionStatus === 'premium_active' && profile?.proModeEnabled !== false);
}

export function canAddMoreCustomers(
  currentCustomerCount: number,
  status?: SubscriptionStatus | null,
  proModeEnabled: boolean = true
): boolean {
  if (isPremiumPlan(status) && proModeEnabled !== false) return true;
  return currentCustomerCount < FREE_CUSTOMER_LIMIT;
}

export interface PlanDefinition {
  id: 'free' | 'premium';
  priceInr: number;
  billingCycle: 'forever' | 'lifetime';
  featuresHi: string[];
  featuresEn: string[];
}

export const PLAN_CONFIG: Record<'free' | 'premium', PlanDefinition> = {
  free: {
    id: 'free',
    priceInr: 0,
    billingCycle: 'forever',
    featuresHi: [
      'बेसिक दुकान डैशबोर्ड',
      'अधिकतम 10 ग्राहक जोड़ने की सीमा',
      'सादा लिखित रसीद (Casual Receipt) व WhatsApp टेक्स्ट शेयर',
      'उधार पेमेंट जमा WhatsApp मैसेज',
      'डिजिटल खाता / उधार रजिस्टर व स्मार्ट रेट कैलकुलेटर',
    ],
    featuresEn: [
      'Basic Dashboard',
      'Up to 10 Customers Limit',
      'Casual Text Receipt & Written WhatsApp Share',
      'Udhaar Payment Deposit WhatsApp Receipt',
      'Digital Khata Ledger & Smart Rate Calculator',
    ],
  },
  premium: {
    id: 'premium',
    priceInr: 199,
    billingCycle: 'lifetime',
    featuresHi: [
      '₹199 एक बार लाइफटाइम पेमेंट (Pro गोल्डन थीम)',
      'Nova Scan – ग्लोबल बारकोड स्कैनर व ऑटो-बिलिंग (केवल Pro)',
      'असीमित (Infinite) ग्राहक जोड़ें',
      'मॉल-स्टाइल PDF बिल जनरेट और डाउनलोड (केवल Pro)',
      'ग्राहक WhatsApp पर लिखित बिल व पेमेंट रसीद',
      'एडवांस बिजनेस रिपोर्ट्स और प्राथमिकता सपोर्ट',
    ],
    featuresEn: [
      '₹199 One-Time Lifetime Payment (Pro Gold Theme)',
      'Nova Scan – Global Barcode Recognition & Auto-Billing (Pro Only)',
      'Unlimited (Infinite) Customers',
      'Mall-Style PDF Invoice Generation & Download (Pro Only)',
      'Written WhatsApp Bills & Payment Deposit Receipts',
      'Advanced Business Reports & Priority Support',
    ],
  },
};

export const DEFAULT_PAYMENT_INSTRUCTIONS = {
  hi: 'ऊपर दिए गए QR कोड को किसी भी UPI ऐप (PhonePe, GPay, Paytm, BHIM) से स्कैन करके ₹199 का भुगतान करें और 12-अंकों का UTR नंबर दर्ज करें।',
  en: 'Scan the QR code above using any UPI app (PhonePe, GPay, Paytm, BHIM) to pay ₹199 and enter your 12-digit UTR reference number below.',
};
