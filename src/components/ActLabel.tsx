import type { CuratedAct } from '../curate';

/** An act's name as printed: "you might like" suggestions get the festify asterisk. */
export function ActLabel({ act }: { act: CuratedAct }) {
  return (
    <>
      {act.act.display}
      {act.origin === 'suggested' && <span className="suggested-star">*</span>}
    </>
  );
}
