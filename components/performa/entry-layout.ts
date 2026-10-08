/*
 * One grid template for the weekly entry list: the header row and every staff row use
 * it, so the columns line up like a table from 900 px (nav) up. Below that each row
 * reflows into a card: name, three score inputs per line (six from 640 px), result,
 * observer, notes, save.
 */
export const ROW_GRID =
  "grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6 " +
  "nav:grid-cols-[10rem_repeat(6,4.5rem)_8rem_8rem_minmax(9.5rem,1fr)_7.5rem] nav:items-center nav:gap-x-1.5 nav:gap-y-0";

export const CELL = {
  name: "col-span-3 sm:col-span-6 nav:col-span-1",
  score: "col-span-1",
  result: "col-span-3 sm:col-span-6 nav:col-span-1",
  observer: "col-span-3 nav:col-span-1",
  notes: "col-span-3 nav:col-span-1",
  save: "col-span-3 sm:col-span-6 nav:col-span-1",
  message: "col-span-3 sm:col-span-6 nav:col-span-full",
} as const;

/** The sticky first column: stays visible while the grid scrolls sideways on desktop. */
export const STICKY_FIRST =
  "nav:sticky nav:left-0 nav:z-[1] nav:self-stretch nav:pl-3 nav:pr-2 nav:shadow-[inset_-1px_0_0_var(--line)]";
