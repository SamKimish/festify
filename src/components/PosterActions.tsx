import { useEffect, useRef, useState, type RefObject } from 'react';
import { canShareImage, copyImage, downloadBlob, renderPoster } from '../posterImage';

interface Props {
  posterRef: RefObject<HTMLDivElement | null>;
  /** Changes whenever the poster content changes, so the cached image is redrawn. */
  version: string;
  filename: string;
  shareText: string;
  /** Width of the exported PNG in px. */
  width: number;
}

/**
 * Download and Share buttons. The PNG is pre-rendered in the background, because
 * mobile Safari only opens the share sheet if share() is called straight from
 * the tap, with no slow work in between.
 */
export function PosterActions({ posterRef, version, filename, shareText, width }: Props) {
  const cache = useRef<{ version: string; blob: Promise<Blob> } | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const nativeShare = canShareImage();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  const siteUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

  // Bumped whenever the poster changes on screen (fonts arriving, photos
  // loading, relayout on resize…), so a pre-rendered image is never stale.
  const changes = useRef(0);
  const cacheKey = () => `${version}|${changes.current}`;

  const getBlob = () => {
    if (!posterRef.current) return Promise.reject(new Error('No poster'));
    if (cache.current?.version !== cacheKey()) {
      const blob = renderPoster(posterRef.current, width);
      blob.catch(() => (cache.current = null));
      cache.current = { version: cacheKey(), blob };
    }
    return cache.current.blob;
  };

  // Pre-render once the poster has settled, and again after it changes.
  useEffect(() => {
    const poster = posterRef.current;
    let timer = setTimeout(() => getBlob().catch(() => {}), 800);
    const observer = new MutationObserver(() => {
      changes.current++;
      clearTimeout(timer);
      timer = setTimeout(() => getBlob().catch(() => {}), 800);
    });
    if (poster) observer.observe(poster, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Phones put browser downloads in Files (iOS) or Downloads. Instead, "Save
  // image" shows the poster full-screen to press and hold → "Save to Photos",
  // keeping it distinct from Share (which sends it to other apps).
  const saveToPhotos = window.matchMedia('(pointer: coarse)').matches;
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(null);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const download = async () => {
    setBusy('download');
    try {
      const blob = await getBlob();
      if (saveToPhotos) setPreview(URL.createObjectURL(blob));
      else downloadBlob(blob, filename);
    } catch (e) {
      console.error(e);
      setToast("Sorry, the poster couldn't be saved.");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!nativeShare) {
      setMenuOpen((open) => !open);
      return;
    }
    setBusy('share');
    try {
      const blob = await getBlob();
      const file = new File([blob], filename, { type: 'image/png' });
      await navigator.share({ files: [file], text: `${shareText} ${siteUrl}` });
    } catch (e) {
      // AbortError = the user closed the share sheet; anything else, offer the fallbacks.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error(e);
        setMenuOpen(true);
      }
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    setMenuOpen(false);
    try {
      const ok = await copyImage(await getBlob());
      setToast(ok ? 'Poster copied. Paste it into any chat.' : "Your browser can't copy images. Try Download instead.");
    } catch {
      setToast("Sorry, the poster couldn't be copied.");
    }
  };

  const text = encodeURIComponent(`${shareText} ${siteUrl}`);
  const links = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${text}` },
    { label: 'X', href: `https://x.com/intent/post?text=${text}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}` },
  ];

  return (
    <div ref={rootRef} className="poster-actions">
      <button type="button" className="primary" onClick={download} disabled={busy !== null}>
        {busy === 'download' ? 'Saving…' : saveToPhotos ? 'Save image' : 'Download PNG'}
      </button>
      <button
        type="button"
        className="secondary"
        onClick={share}
        disabled={busy !== null}
        aria-expanded={nativeShare ? undefined : menuOpen}
      >
        {busy === 'share' ? 'Preparing…' : 'Share'}
      </button>

      {menuOpen && (
        <div className="share-menu" role="menu">
          <button type="button" role="menuitem" onClick={copy}>
            Copy image
          </button>
          {links.map((l) => (
            <a key={l.label} role="menuitem" href={l.href} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          <p className="share-hint">These links can't attach the image. Copy or download it first, then paste it in.</p>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop save-preview" onClick={() => setPreview(null)}>
          <div className="save-preview-card" role="dialog" aria-modal="true" aria-label="Save your poster" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="Your festival poster" />
            <p>Press and hold the poster, then tap “Save to Photos” (or “Download image” on Android).</p>
            <div className="save-preview-actions">
              <button type="button" className="secondary small" onClick={() => setPreview(null)}>
                Done
              </button>
              <button type="button" className="link-button" onClick={() => getBlob().then((b) => downloadBlob(b, filename))}>
                Download file instead
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
