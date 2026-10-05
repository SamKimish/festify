import { useEffect, useState } from 'react';

/**
 * A counter that ticks whenever web fonts finish loading. Posters measure text
 * to lay themselves out, so they must re-measure once the real font arrives:
 * on a first visit (especially on phones) the first layout can run against a
 * fallback font of a different width, which made names overflow or overlap.
 *
 * `document.fonts.status === 'loaded'` isn't enough on its own: before any
 * text using the font is on screen, nothing is loading yet, so it already
 * reads "loaded". Asking for the poster font explicitly closes that gap.
 */
export function useFontEpoch(fontFamily: string, fontWeight: number | string = 400): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let live = true;
    const bump = () => live && setEpoch((e) => e + 1);
    document.fonts
      .load(`${fontWeight} 100px ${fontFamily}`)
      .then(bump)
      .catch(() => {});
    document.fonts.ready.then(bump);
    document.fonts.addEventListener('loadingdone', bump);
    return () => {
      live = false;
      document.fonts.removeEventListener('loadingdone', bump);
    };
  }, [fontFamily, fontWeight]);
  return epoch;
}
