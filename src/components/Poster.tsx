import { forwardRef } from 'react';
import type { CuratedAct } from '../curate';
import { festName, type Festival } from '../festivals';
import type { ListeningProfile } from '../spotify/profile';
import { ColumnsPoster } from './ColumnsPoster';
import { DaysPoster } from './DaysPoster';
import { PersonalPoster } from './PersonalPoster';
import { PhotosPoster } from './PhotosPoster';
import { ReelsPoster } from './ReelsPoster';

interface Props {
  festival: Festival;
  acts: CuratedAct[];
  curatedFor: string;
  curatedVia: string;
  profile: ListeningProfile;
  onSelect: (act: CuratedAct) => void;
}

/** Renders the personal poster with the festival's layout. */
export const Poster = forwardRef<HTMLDivElement, Props>(function Poster({ festival, ...props }, ref) {
  switch (festival.layout) {
    case 'reels':
      return <ReelsPoster ref={ref} festival={festival} acts={props.acts} onSelect={props.onSelect} />;
    case 'photos':
      return (
        <PhotosPoster
          ref={ref}
          festival={festival}
          acts={props.acts}
          profile={props.profile}
          curatedFor={props.curatedFor}
          curatedVia={props.curatedVia}
          onSelect={props.onSelect}
        />
      );
    case 'personal':
      return (
        <PersonalPoster
          ref={ref}
          festival={festival}
          acts={props.acts}
          festName={festName(props.profile)}
          curatedVia={props.curatedVia}
          onSelect={props.onSelect}
        />
      );
    case 'days':
      return <DaysPoster ref={ref} festival={festival} acts={props.acts} onSelect={props.onSelect} />;
    default:
      return <ColumnsPoster ref={ref} festival={festival} {...props} />;
  }
});
