import { Fragment, forwardRef, useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CuratedAct } from '../curate';
import type { DaysFestival } from '../festivals';
import { layoutDays, type DayLine } from '../daysLayout';
import { posterLabel } from '../posterEdits';
import { useFontEpoch } from '../useFontEpoch';
import { ActLabel } from './ActLabel';

interface Props {
  festival: DaysFestival;
  acts: CuratedAct[];
  onSelect: (act: CuratedAct) => void;
}

const MEASURE_PX = 100;
const SEPARATOR = ' • ';

export const DaysPoster = forwardRef<HTMLDivElement, Props>(function DaysPoster({ festival, acts, onSelect }, ref) {
  const measureRef = useRef<HTMLDivElement>(null);
  const fontEpoch = useFontEpoch(festival.theme.fontFamily, festival.theme.fontWeight);
  // Remember which acts a layout was computed for, so a stale one is never drawn.
  const [computed, setComputed] = useState<{ acts: CuratedAct[]; lines: DayLine[][] } | null>(null);
  const layout = computed?.acts === acts ? computed.lines : null;
  const { theme } = festival;


  const runLayout = useCallback(() => {
    const els = [...(measureRef.current?.children ?? [])] as HTMLElement[];
    if (els.length !== acts.length + 1) return;
    const em = (el: HTMLElement) => el.getBoundingClientRect().width / MEASURE_PX;
    const measure = { sep: em(els[0]), widths: els.slice(1).map(em) };
    const aspect = festival.height / festival.width;
    const days = festival.days.map((d) => ({
      items: acts.flatMap((a, i) => (a.act.day === d.label ? [i] : [])),
      width: d.zone.w,
      height: d.zone.h * aspect,
    }));
    setComputed({ acts, lines: layoutDays(days, measure) });
  }, [acts, festival]);

  useLayoutEffect(runLayout, [runLayout, fontEpoch]);

  return (
    <div
      ref={ref}
      className="poster poster-days"
      style={{ aspectRatio: `${festival.width} / ${festival.height}`, fontFamily: theme.fontFamily } as CSSProperties}
    >
      <img
        className="poster-bg"
        src={`${import.meta.env.BASE_URL}${festival.background}`}
        alt=""
        draggable={false}
      />

      {layout?.map((lines, d) => {
        const day = festival.days[d];
        return (
          <div
            key={day.label}
            className="zone day-block"
            style={{ left: `${day.zone.x}%`, top: `${day.zone.y}%`, width: `${day.zone.w}%`, height: `${day.zone.h}%` }}
          >
            {lines.map((line, l) => (
              <div
                key={l}
                className="day-line"
                style={{ fontSize: `${line.size}cqw`, color: line.tier < 2 ? day.topColor : day.restColor }}
              >
                {line.items.map((i, j) => (
                  <Fragment key={acts[i].act.display}>
                    {j > 0 && <span className="day-sep">{SEPARATOR}</span>}
                    <button type="button" className="day-name" onClick={() => onSelect(acts[i])}>
                      <ActLabel act={acts[i]} />
                    </button>
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      {acts.length === 0 && (
        <p className="poster-empty days-empty" style={{ color: theme.textColor }}>
          None of your artists are on this lineup — yet.
        </p>
      )}

      {/* Hidden copies of each name, to measure their widths. */}
      <div ref={measureRef} className="measure" aria-hidden style={{ fontSize: MEASURE_PX }}>
        <span className="day-name">{SEPARATOR}</span>
        {acts.map((a) => (
          <span key={a.act.display} className="day-name">
            {posterLabel(a)}
          </span>
        ))}
      </div>
    </div>
  );
});
