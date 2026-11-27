import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const shopSetupSchema = z.object({
  ownerName: z.string().optional(),
  shopName: z.string().trim().min(1, 'Shop name is required'),
  phoneNumber: z.string().trim().min(1, 'Phone number is required'),
  whatsappNumber: z.string().optional(),
  businessType: z.string().trim().min(1, 'Business category is required'),
  address: z.string().trim().min(1, 'Shop address is required'),
  gstNumber: z.string().optional(),
  email: z.string().optional(),
  aboutBusiness: z.string().optional(),
});

type ShopSetupForm = z.infer<typeof shopSetupSchema>;

export function ShopSetup() {
  const { user, saveShopSetup } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const isHindi = language === 'hi';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ShopSetupForm>({
    resolver: zodResolver(shopSetupSchema),
    defaultValues: {
      ownerName: user?.displayName || '',
      email: user?.email || '',
      businessType: 'General Kirana / Retail',
      shopName: '',
      phoneNumber: '',
      address: '',
      gstNumber: '',
    },
  });

  const onSubmit = async (values: ShopSetupForm) => {
    setSubmitError(null);
    try {
      await saveShopSetup({
        ownerName: (values.ownerName || '').trim() || values.shopName.trim(),
        shopName: values.shopName.trim(),
        phoneNumber: values.phoneNumber.trim(),
        whatsappNumber: (values.whatsappNumber || '').trim() || values.phoneNumber.trim(),
        businessType: values.businessType.trim(),
        address: values.address.trim(),
        gstNumber: (values.gstNumber || '').trim(),
        email: (values.email || '').trim(),
        aboutBusiness: (values.aboutBusiness || '').trim(),
        stockManagementEnabled: false,
        reminderEnabled: true,
        reminderIntervalDays: 7,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save shop setup');
    }
  };

  return (
    <div className="min-h-screen bg-[#060D1E] text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-2xl w-full glass-surface-elevated rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-cyan-300">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white font-display">
              {t('auth.shopSetupTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">{t('auth.shopSetupSubtitle')}</p>
          </div>
        </div>

        {submitError ? (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs leading-relaxed">
            {submitError}
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="setup-owner-name" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'मालिक का नाम (वैकल्पिक)' : 'Owner Name (Optional)'}
            </label>
            <input
              id="setup-owner-name"
              {...register('ownerName')}
              placeholder={isHindi ? 'जैसे: राजेश कुमार' : 'e.g. Rajesh Kumar'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="setup-shop-name" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'दुकान का नाम *' : 'Shop Name *'}
            </label>
            <input
              id="setup-shop-name"
              {...register('shopName')}
              placeholder={isHindi ? 'जैसे: श्री गणेश किराना' : 'e.g. Shri Ganesh Kirana'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
            />
            {errors.shopName ? (
              <p className="mt-1 text-xs text-rose-400">{errors.shopName.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="setup-phone" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'फोन नंबर *' : 'Phone Number *'}
            </label>
            <input
              id="setup-phone"
              {...register('phoneNumber')}
              placeholder={isHindi ? 'मोबाइल नंबर' : 'Phone number'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 font-mono-num focus:outline-none focus:border-cyan-400"
            />
            {errors.phoneNumber ? (
              <p className="mt-1 text-xs text-rose-400">{errors.phoneNumber.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="setup-category" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'व्यवसाय की श्रेणी *' : 'Business Category *'}
            </label>
            <input
              id="setup-category"
              {...register('businessType')}
              placeholder="General Kirana / Retail"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
            />
            {errors.businessType ? (
              <p className="mt-1 text-xs text-rose-400">{errors.businessType.message}</p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="setup-address" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'दुकान का पता *' : 'Shop Address *'}
            </label>
            <input
              id="setup-address"
              {...register('address')}
              placeholder={isHindi ? 'बाज़ार / गली / शहर' : 'Market / Street / City'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
            />
            {errors.address ? (
              <p className="mt-1 text-xs text-rose-400">{errors.address.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="setup-email" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'ईमेल (वैकल्पिक)' : 'Email (Optional)'}
            </label>
            <input
              id="setup-email"
              {...register('email')}
              placeholder="owner@example.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="setup-gst" className="block text-xs font-medium text-slate-300 mb-1.5">
              {isHindi ? 'GST नंबर (वैकल्पिक)' : 'GST Number (Optional)'}
            </label>
            <input
              id="setup-gst"
              {...register('gstNumber')}
              placeholder="Optional GSTIN"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white placeholder:text-slate-400/55 font-mono-num focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="sm:col-span-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {isSubmitting
                ? isHindi
                  ? 'सेव हो रहा है...'
                  : 'Saving Shop Details...'
                : t('auth.saveAndContinue')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
