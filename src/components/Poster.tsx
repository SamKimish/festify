import { forwardRef } from 'react';
import type { CuratedAct } from '../curate';
import type { Festival } from '../festivals';
import { ColumnsPoster } from './ColumnsPoster';
import { ReelsPoster } from './ReelsPoster';

interface Props {
  festival: Festival;
  acts: CuratedAct[];
  curatedFor: string;
  onSelect: (act: CuratedAct) => void;
}

/** Renders the personal poster with the festival's layout. */
export const Poster = forwardRef<HTMLDivElement, Props>(function Poster({ festival, ...props }, ref) {
  return festival.layout === 'reels' ? (
    <ReelsPoster ref={ref} festival={festival} acts={props.acts} onSelect={props.onSelect} />
  ) : (
    <ColumnsPoster ref={ref} festival={festival} {...props} />
  );
});
