import { forwardRef } from 'react';
import type { CuratedAct } from '../curate';
import type { Festival } from '../festivals';
import { ColumnsPoster } from './ColumnsPoster';
import { DaysPoster } from './DaysPoster';
import { ReelsPoster } from './ReelsPoster';

interface Props {
  festival: Festival;
  acts: CuratedAct[];
  curatedFor: string;
  onSelect: (act: CuratedAct) => void;
}

/** Renders the personal poster with the festival's layout. */
export const Poster = forwardRef<HTMLDivElement, Props>(function Poster({ festival, ...props }, ref) {
  switch (festival.layout) {
    case 'reels':
      return <ReelsPoster ref={ref} festival={festival} acts={props.acts} onSelect={props.onSelect} />;
    case 'days':
      return <DaysPoster ref={ref} festival={festival} acts={props.acts} onSelect={props.onSelect} />;
    default:
      return <ColumnsPoster ref={ref} festival={festival} {...props} />;
  }
});
