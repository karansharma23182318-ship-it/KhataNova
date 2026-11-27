import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  Camera,
  CameraOff,
  Flashlight,
  Pause,
  Play,
  RefreshCw,
  SwitchCamera,
} from 'lucide-react';
import { safeStopScannerControls } from '../../utils/scannerControls';

interface BarcodeCameraScannerProps {
  isHindi: boolean;
  isPro: boolean;
  onBarcodeDetected: (barcode: string) => void;
  lastScanLabel?: string | null;
  variant?: 'default' | 'compact';
  autoStart?: boolean;
}

const SUPPORTED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
];

function formatCameraError(err: unknown, isHindi: boolean): string {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = `${name} ${msg}`.toLowerCase();

  if (lower.includes('notallowed') || lower.includes('permission')) {
    return isHindi
      ? 'कैमरा अनुमति (Permission) अस्वीकार की गई है। कृपया ब्राउज़र सेटिंग्स से कैमरा अनुमति चालू करें या नीचे USB/मैनुअल बारकोड बॉक्स का उपयोग करें।'
      : 'Camera permission was denied. Please allow camera access in browser settings or use the USB/manual barcode box below.';
  }
  if (lower.includes('notfound') || lower.includes('overconstrained') || lower.includes('requested device not found')) {
    return isHindi
      ? 'इस डिवाइस पर कोई सक्रिय कैमरा नहीं मिला। आप USB/Bluetooth स्कैनर या मैनुअल बारकोड से स्कैन कर सकते हैं।'
      : 'No active camera device was found. You can still scan using a USB/Bluetooth scanner or manual barcode entry.';
  }
  if (lower.includes('notreadable') || lower.includes('trackstarterror')) {
    return isHindi
      ? 'कैमरा किसी अन्य ऐप में उपयोग हो रहा है। उसे बंद करके पुनः प्रयास करें।'
      : 'Camera is currently in use by another application. Close it and tap Retry.';
  }
  if (lower.includes('secure') || lower.includes('https')) {
    return isHindi
      ? 'कैमरा एक्सेस के लिए सुरक्षित HTTPS कनेक्शन आवश्यक है।'
      : 'Camera access requires a secure HTTPS or localhost connection.';
  }
  return isHindi
    ? `कैमरा शुरू करने में समस्या आई (${msg || 'Unknown error'})। आप USB/मैनुअल बारकोड का उपयोग कर सकते हैं।`
    : `Unable to start camera (${msg || 'Unknown error'}). You can use USB/manual barcode entry.`;
}

export function BarcodeCameraScanner({
  isHindi,
  isPro,
  onBarcodeDetected,
  lastScanLabel,
  variant = 'default',
  autoStart = false,
}: BarcodeCameraScannerProps) {
  const isCompact = variant === 'compact';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(false);
  const mountedRef = useRef(true);
  const startSeqRef = useRef(0);
  const torchOnRef = useRef(false);
  const onDetectRef = useRef(onBarcodeDetected);
  onDetectRef.current = onBarcodeDetected;

  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanPulse, setScanPulse] = useState(false);

  pausedRef.current = paused;
  torchOnRef.current = torchOn;

  const stopCamera = useCallback(() => {
    startSeqRef.current += 1;

    const currentStream = streamRef.current;
    if (currentStream && torchOnRef.current) {
      for (const track of currentStream.getVideoTracks()) {
        if (track.readyState === 'live' && typeof track.applyConstraints === 'function') {
          void Promise.resolve(
            track.applyConstraints({
              advanced: [{ torch: false } as MediaTrackConstraintSet],
            })
          ).catch(() => {
            // Ignore devices that reject torch off on teardown
          });
        }
      }
    }

    const activeControls = controlsRef.current;
    controlsRef.current = null;
    void safeStopScannerControls(
      activeControls as { stop: () => void | Promise<void> } | null
    );

    if (currentStream) {
      for (const track of currentStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (mountedRef.current) {
      setCameraActive(false);
      setTorchOn(false);
      setTorchSupported(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = useCallback(
    async (explicitDeviceId?: string) => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          isHindi
            ? 'यह ब्राउज़र कैमरा स्कैनिंग सपोर्ट नहीं करता। USB/Bluetooth स्कैनर या मैनुअल इनपुट का उपयोग करें।'
            : 'Camera scanning is not supported in this browser. Use a USB/Bluetooth scanner or manual entry.'
        );
        return;
      }

      stopCamera();
      const callSeq = ++startSeqRef.current;
      setStarting(true);
      setCameraError(null);

      try {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 400,
        });

        // Request rear camera by default on mobile unless a specific camera was chosen
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: explicitDeviceId
            ? { deviceId: { exact: explicitDeviceId } }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mountedRef.current || startSeqRef.current !== callSeq) {
          for (const t of stream.getTracks()) {
            try {
              t.stop();
            } catch {
              // ignore
            }
          }
          return;
        }
        streamRef.current = stream;

        const videoEl = videoRef.current;
        if (!videoEl) {
          stopCamera();
          return;
        }

        const [track] = stream.getVideoTracks();
        if (track) {
          const settings = track.getSettings?.();
          if (settings?.deviceId) {
            setSelectedDeviceId(settings.deviceId);
          }
          const capabilities = track.getCapabilities?.() as
            | (MediaTrackCapabilities & { torch?: boolean })
            | undefined;
          setTorchSupported(Boolean(capabilities?.torch));
        }

        try {
          const videoInputs = await BrowserMultiFormatReader.listVideoInputDevices();
          if (mountedRef.current && startSeqRef.current === callSeq) {
            setDevices(videoInputs);
            if (!explicitDeviceId && videoInputs.length > 0 && !track?.getSettings?.().deviceId) {
              const rear = videoInputs.find((d) =>
                /back|rear|environment/i.test(d.label || '')
              );
              setSelectedDeviceId(rear?.deviceId || videoInputs[0].deviceId);
            }
          }
        } catch {
          // Optional camera list enumeration
        }

        if (!mountedRef.current || startSeqRef.current !== callSeq) {
          stopCamera();
          return;
        }

        const controls = await reader.decodeFromStream(stream, videoEl, (result) => {
          if (pausedRef.current || !result) return;
          const text = result.getText()?.trim();
          if (!text) return;
          setScanPulse(true);
          window.setTimeout(() => {
            if (mountedRef.current) setScanPulse(false);
          }, 380);
          onDetectRef.current(text);
        });

        if (!mountedRef.current || startSeqRef.current !== callSeq) {
          void safeStopScannerControls(
            controls as unknown as { stop: () => void | Promise<void> }
          );
          stopCamera();
          return;
        }

        controlsRef.current = controls;
        setCameraActive(true);
        setPaused(false);
      } catch (err) {
        stopCamera();
        if (mountedRef.current) {
          setCameraError(formatCameraError(err, isHindi));
        }
      } finally {
        if (mountedRef.current) {
          setStarting(false);
        }
      }
    },
    [isHindi, stopCamera]
  );

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && isPro && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startCamera();
    }
  }, [autoStart, isPro, startCamera]);

  const handleSwitchCamera = () => {
    if (devices.length < 2) {
      void startCamera();
      return;
    }
    const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const next = devices[(idx + 1) % devices.length];
    if (next?.deviceId) {
      setSelectedDeviceId(next.deviceId);
      void startCamera(next.deviceId);
    }
  };

  const handleToggleTorch = async () => {
    const stream = streamRef.current;
    if (!stream || !torchSupported) return;
    const [track] = stream.getVideoTracks();
    if (!track) return;
    const nextTorch = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorch);
    } catch {
      setTorchSupported(false);
      setTorchOn(false);
    }
  };

  return (
    <div
      className={`${isPro ? 'pro-card' : 'glass-surface'} rounded-2xl p-4 space-y-3 border border-amber-400/30`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-white font-display">
            {isHindi ? 'कैमरा बारकोड स्कैनर' : 'Camera Barcode Scanner'}
          </h2>
          {cameraActive ? (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
              {paused ? (isHindi ? 'रुका हुआ' : 'Paused') : isHindi ? 'लाइव' : 'Live'}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cameraActive ? (
            <>
              <button
                type="button"
                onClick={() => setPaused((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0B1530] hover:bg-blue-500/15 border border-blue-400/25 text-xs text-slate-200"
              >
                {paused ? <Play className="w-3.5 h-3.5 text-emerald-300" /> : <Pause className="w-3.5 h-3.5 text-amber-300" />}
                <span>{paused ? (isHindi ? 'जारी रखें' : 'Resume') : isHindi ? 'रोकें' : 'Pause'}</span>
              </button>

              {devices.length > 1 ? (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  aria-label="Switch Camera"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0B1530] hover:bg-blue-500/15 border border-blue-400/25 text-xs text-slate-200"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-cyan-300" />
                  <span>{isHindi ? 'कैमरा बदलें' : 'Switch'}</span>
                </button>
              ) : null}

              {torchSupported ? (
                <button
                  type="button"
                  onClick={() => void handleToggleTorch()}
                  aria-label={torchOn ? 'Turn Torch Off' : 'Turn Torch On'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                    torchOn
                      ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                      : 'bg-[#0B1530] hover:bg-blue-500/15 border-blue-400/25 text-slate-200'
                  }`}
                >
                  <Flashlight className="w-3.5 h-3.5" />
                  <span>{torchOn ? (isHindi ? 'टॉर्च बंद' : 'Torch ON') : isHindi ? 'टॉर्च' : 'Torch'}</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-xs text-rose-200"
              >
                <CameraOff className="w-3.5 h-3.5" />
                <span>{isHindi ? 'बंद करें' : 'Stop'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={starting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-60 text-slate-950 text-xs font-bold"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>
                {starting
                  ? isHindi
                    ? 'कैमरा चालू हो रहा है...'
                    : 'Starting Camera...'
                  : isHindi
                    ? 'कैमरा स्कैन शुरू करें'
                    : 'Start Camera Scan'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Viewport */}
      <div
        className={`relative rounded-xl overflow-hidden bg-[#060C1C] border border-blue-400/20 flex items-center justify-center ${
          isCompact ? 'h-44 sm:h-48 w-full' : 'aspect-[16/10]'
        }`}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
        />

        {cameraActive ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4">
            <div
              className={`rounded-xl border-2 transition-colors duration-200 ${
                isCompact ? 'w-56 max-w-[82%] h-20' : 'w-64 max-w-[80%] h-28'
              } ${
                scanPulse
                  ? 'border-emerald-400 bg-emerald-400/10'
                  : paused
                    ? 'border-amber-400/50 bg-black/30'
                    : 'border-cyan-400/80'
              }`}
            />
            <span className="mt-2 px-2.5 py-1 rounded-md bg-black/70 text-[11px] text-slate-200">
              {paused
                ? isHindi
                  ? 'स्कैन रुका हुआ है'
                  : 'Scanning Paused'
                : isHindi
                  ? 'बारकोड को बॉक्स के अंदर रखें (लगातार स्कैन)'
                  : 'Align barcode inside frame (Continuous scan)'}
            </span>
          </div>
        ) : (
          <div className="p-5 text-center space-y-2 max-w-sm">
            <Camera className="w-8 h-8 text-amber-300/80 mx-auto" />
            <p className="text-xs text-slate-300">
              {isHindi
                ? 'मोबाइल का बैक कैमरा डिफ़ॉल्ट रूप से खुलेगा। EAN-13, EAN-8, UPC-A, UPC-E और Code 128 सपोर्टेड हैं।'
                : 'Uses your rear camera by default on mobile. Supports EAN-13, EAN-8, UPC-A, UPC-E & Code 128.'}
            </p>
            {cameraError ? (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-400/30 text-[11px] text-rose-200 text-left space-y-2">
                <p>{cameraError}</p>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-medium"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>{isHindi ? 'पुनः प्रयास करें' : 'Retry Camera'}</span>
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {lastScanLabel ? (
        <div className="text-[11px] text-emerald-300 font-mono-num truncate">
          {lastScanLabel}
        </div>
      ) : null}
    </div>
  );
}
