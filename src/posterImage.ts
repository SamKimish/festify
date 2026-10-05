const baseOptions = {
  // Only embed the woff2 files (browsers that render the poster all support them).
  preferredFontFormat: 'woff2',
  // Proxied photo URLs differ only in their query string; without this the
  // exporter's cache treats them as one image and repeats the first photo.
  includeQueryParams: true,
  // Skip the hidden word-measuring layer.
  filter: (node: HTMLElement) => !(node instanceof HTMLElement && node.classList.contains('measure')),
};

/**
 * Renders the poster element to a PNG blob at `width` px (normally the artwork's
 * own width), whatever size it's displayed at on screen.
 */
export async function renderPoster(poster: HTMLElement, width: number): Promise<Blob> {
  // Loaded on first use, so it isn't part of the initial download.
  const { toBlob } = await import('html-to-image');
  const pixelRatio = Math.min(4, Math.max(1, width / poster.clientWidth));
  const options = { ...baseOptions, pixelRatio };
  // Safari often drops images and fonts on the first render, so warm up once.
  await toBlob(poster, options).catch(() => null);
  const blob = await toBlob(poster, options);
  if (!blob) throw new Error('Could not render the poster');
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** True if the browser can open the native share sheet with an image attached. */
export function canShareImage(): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' });
  try {
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Copies the image to the clipboard, where supported. */
export async function copyImage(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
