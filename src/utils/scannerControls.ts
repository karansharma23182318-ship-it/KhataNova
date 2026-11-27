export interface StoppableScannerControls {
  stop: () => void | Promise<void>;
}

/**
 * Stops @zxing/browser scanner controls safely, absorbing both synchronous throws
 * and rejected async promises (e.g. mobile Chrome `setPhotoOptions failed` when
 * @zxing/browser attempts to turn torch off on an already-stopped video track).
 */
export async function safeStopScannerControls(
  controls: StoppableScannerControls | null | undefined
): Promise<void> {
  if (!controls || typeof controls.stop !== 'function') return;
  try {
    await Promise.resolve(controls.stop());
  } catch {
    // Ignore hardware constraint errors (e.g. setPhotoOptions failed) during track teardown
  }
}
