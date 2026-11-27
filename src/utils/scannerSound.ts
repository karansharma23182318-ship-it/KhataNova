export interface ScanBeepOptions {
  /** Number of rapid crisp POS tones (default 2-tone ascending hardware scanner chirp) */
  pulses?: number;
  frequencyHz?: number;
  pulseDurationSec?: number;
  gapSec?: number;
  volume?: number;
}

export interface ScanBeepStep {
  startOffsetSec: number;
  durationSec: number;
  frequencyHz: number;
  waveform: OscillatorType;
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContextConstructor():
  | (new () => AudioContext)
  | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as Window &
    typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return win.AudioContext || win.webkitAudioContext;
}

/**
 * Builds an authentic supermarket / hardware POS barcode scanner tone schedule.
 * Default mimics a real laser scanner ("pi-pip" ascending dual-tone piezo chime).
 */
export function buildScanBeepSchedule(options: ScanBeepOptions = {}): ScanBeepStep[] {
  const hasCustomOverrides =
    options.pulses !== undefined ||
    options.frequencyHz !== undefined ||
    options.pulseDurationSec !== undefined ||
    options.gapSec !== undefined;

  if (!hasCustomOverrides) {
    return [
      {
        startOffsetSec: 0,
        durationSec: 0.042,
        frequencyHz: 2350,
        waveform: 'triangle',
      },
      {
        startOffsetSec: 0.042,
        durationSec: 0.088,
        frequencyHz: 3100,
        waveform: 'triangle',
      },
    ];
  }

  const pulses = Math.max(1, Math.min(8, Math.round(options.pulses ?? 2)));
  const frequencyHz = Math.max(400, Math.min(5000, Number(options.frequencyHz ?? 2650)));
  const pulseDurationSec = Math.max(0.02, Math.min(0.3, Number(options.pulseDurationSec ?? 0.055)));
  const gapSec = Math.max(0, Math.min(0.2, Number(options.gapSec ?? 0.008)));

  const schedule: ScanBeepStep[] = [];
  for (let i = 0; i < pulses; i += 1) {
    schedule.push({
      startOffsetSec: Number((i * (pulseDurationSec + gapSec)).toFixed(4)),
      durationSec: pulseDurationSec,
      frequencyHz,
      waveform: 'triangle',
    });
  }
  return schedule;
}

/**
 * Plays a realistic hardware POS barcode scanner beep using the Web Audio API.
 * Fails silently when audio hardware or AudioContext is blocked/unavailable.
 */
export function playScanBeepSound(options: ScanBeepOptions = {}): boolean {
  try {
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return false;

    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => {
        // Ignore autoplay restriction errors
      });
    }

    const ctx = sharedAudioContext;
    const baseTime = ctx.currentTime + 0.004;
    const peakGain = Math.max(0.02, Math.min(0.35, Number(options.volume ?? 0.2)));
    const schedule = buildScanBeepSchedule(options);

    for (const step of schedule) {
      const start = baseTime + step.startOffsetSec;
      const end = start + step.durationSec;

      // Primary piezo-like triangle body
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.waveform;
      osc.frequency.setValueAtTime(step.frequencyHz, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.003);
      gain.gain.setValueAtTime(peakGain * 0.92, Math.max(start + 0.004, end - 0.014));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.004);

      // Subtle clean sine brightness layer for authentic checkout scanner ring
      const harmonicOsc = ctx.createOscillator();
      const harmonicGain = ctx.createGain();
      harmonicOsc.type = 'sine';
      harmonicOsc.frequency.setValueAtTime(step.frequencyHz * 1.004, start);

      harmonicGain.gain.setValueAtTime(0.0001, start);
      harmonicGain.gain.exponentialRampToValueAtTime(peakGain * 0.45, start + 0.003);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, end);

      harmonicOsc.connect(harmonicGain);
      harmonicGain.connect(ctx.destination);
      harmonicOsc.start(start);
      harmonicOsc.stop(end + 0.004);
    }

    return true;
  } catch {
    return false;
  }
}
