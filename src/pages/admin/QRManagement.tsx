import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, QrCode, Trash2, Upload } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { saveAdminQrPaymentSettings } from '../../services/adminService';
import { getActiveAdminPaymentSettings } from '../../services/premiumService';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });
}

function isLikelyImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif|svg)$/i.test(file.name || '');
}

async function compressGalleryImageToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);
  if (file.size <= 400 * 1024 && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(rawDataUrl)) {
    return rawDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 900;
      let width = img.naturalWidth || img.width || 600;
      let height = img.naturalHeight || img.height || 600;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.9);
      resolve(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

export function QRManagement() {
  const { adminToken } = useAdminAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [upiId, setUpiId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [qrDirty, setQrDirty] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [processingFile, setProcessingFile] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getActiveAdminPaymentSettings()
      .then((res) => {
        if (res.settings) {
          setUpiId(res.settings.upiId || '');
          setInstructions(res.settings.instructions || '');
          setPreviewUrl(res.settings.qrImageUrl || '');
        }
      })
      .catch(() => {
        // Ignore initial preload failures
      });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isLikelyImageFile(file)) {
      setStatus({
        type: 'error',
        text: 'कृपया गैलरी से सही इमेज फ़ाइल (PNG, JPG, WebP या Screenshot) चुनें।',
      });
      return;
    }

    setProcessingFile(true);
    setStatus(null);
    try {
      const optimizedDataUrl = await compressGalleryImageToDataUrl(file);
      setPreviewUrl(optimizedDataUrl);
      setQrDirty(true);
      setStatus({
        type: 'success',
        text: 'QR इमेज गैलरी से लोड हो गई है। अब नीचे "Save Active QR" बटन दबाएँ।',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to load selected QR image.',
      });
    } finally {
      setProcessingFile(false);
    }
  };

  const handleRemoveQr = () => {
    setPreviewUrl('');
    setQrDirty(true);
    setStatus({
      type: 'success',
      text: 'QR preview removed. Click "Save Active QR" to apply.',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setStatus({ type: 'error', text: 'Admin session expired. Please sign in again.' });
      return;
    }
    if (!previewUrl && !upiId.trim()) {
      setStatus({
        type: 'error',
        text: 'कृपया गैलरी से QR कोड अपलोड करें या कम से कम UPI ID दर्ज करें।',
      });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveAdminQrPaymentSettings(adminToken, {
        upiId: upiId.trim(),
        instructions: instructions.trim(),
        ...(qrDirty ? { qrImageUrl: previewUrl } : {}),
      });
      setPreviewUrl(saved.qrImageUrl || '');
      setQrDirty(false);
      setStatus({
        type: 'success',
        text: 'QR कोड और UPI विवरण सफलतापूर्वक सेव हो गए! अब यह सभी दुकानदारों को Premium Pay पेज पर दिखेगा।',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update QR settings',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="QR Code Management">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form onSubmit={handleSave} className="lg:col-span-3 glass-surface rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-white">
              UPI QR Upload (Direct Gallery)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              अपने फ़ोन की गैलरी से PhonePe / GPay / Paytm / BharatPe QR स्क्रीनशॉट या फोटो सीधे अपलोड करें।
            </p>
          </div>

          {status ? (
            <div
              role="status"
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                status.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-400/30 text-rose-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{status.text}</span>
            </div>
          ) : null}

          <div className="space-y-2.5">
            <label className="block text-xs font-medium text-slate-300">
              1. गैलरी से QR कोड चुनें (Gallery Image)
            </label>
            <input
              ref={fileInputRef}
              id="admin-qr-gallery-input"
              type="file"
              accept="image/*"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={processingFile}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs sm:text-sm font-semibold shadow-md transition-all"
              >
                <ImagePlus className="w-4 h-4" />
                <span>
                  {processingFile
                    ? 'प्रोसेस हो रहा है...'
                    : 'गैलरी से QR इमेज चुनें (Select from Gallery)'}
                </span>
              </button>

              {previewUrl ? (
                <button
                  type="button"
                  onClick={handleRemoveQr}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-xs font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove QR</span>
                </button>
              ) : null}
            </div>
            <p className="text-[11px] text-slate-400">
              Supports PNG, JPG, JPEG, WebP & mobile screenshots (auto-optimized on device).
            </p>
          </div>

          <div>
            <label htmlFor="admin-upi-id" className="block text-xs font-medium text-slate-300 mb-1.5">
              2. Merchant UPI ID (Optional if QR image is uploaded)
            </label>
            <input
              id="admin-upi-id"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. 8757209126@ybl or merchant@upi"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white font-mono-num focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label
              htmlFor="admin-payment-instructions"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              3. Payment Instructions (Shown on Shopkeeper Payment Page)
            </label>
            <textarea
              id="admin-payment-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="QR स्कैन करके ₹199 का भुगतान करें और UTR नंबर सबमिट करें।"
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A142D] border border-blue-400/20 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={saving || processingFile}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold w-full sm:w-auto"
          >
            <Upload className="w-4 h-4" />
            <span>{saving ? 'Saving QR Settings...' : 'Save Active QR / QR सेव करें'}</span>
          </button>
        </form>

        <div className="lg:col-span-2 glass-surface-elevated rounded-2xl p-6 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Live Shopkeeper Preview</h3>
            <span className="text-[11px] text-cyan-300 font-medium">/premium/pay</span>
          </div>
          {previewUrl || upiId.trim() ? (
            <div className="p-5 rounded-xl bg-white text-slate-900 flex flex-col items-center gap-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Active UPI QR Preview"
                  className="w-52 h-52 object-contain rounded-lg"
                />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <QrCode className="w-16 h-16" />
                </div>
              )}
              {upiId.trim() ? (
                <div className="text-xs font-mono-num font-semibold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg">
                  UPI ID: {upiId.trim()}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-[#0A142D] border border-dashed border-blue-400/25 text-center space-y-2">
              <QrCode className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-400">
                No QR image selected yet. Click &ldquo;गैलरी से QR इमेज चुनें&rdquo; to upload from your phone gallery.
              </p>
            </div>
          )}
          <p className="text-xs text-slate-300 leading-relaxed">
            {instructions.trim() ||
              'ऊपर दिए गए QR कोड को किसी भी UPI ऐप (PhonePe, GPay, Paytm, BHIM) से स्कैन करके भुगतान करें और UTR नंबर दर्ज करें।'}
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
