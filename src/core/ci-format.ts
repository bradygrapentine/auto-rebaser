// TRIAGE-POLISH (b) — shared CI-failure render cap. The popup shows the first
// N failing check names then summarizes the rest as "+K more", in two places:
// the PRRow CI-failure chip (mapping over failure OBJECTS with per-name
// link-folding) and the NeedsYouSurface row (a plain `.join(', ')` over names).
// They share ONLY the slice/overflow arithmetic here — each renders `shown` in
// its own way. Generic over the element type so PRRow can slice objects and
// NeedsYouSurface can slice strings through the same helper.

/** Default number of CI-failure entries rendered before collapsing to "+K more". */
export const MAX_RENDERED_CI_NAMES = 2;

export function capCiList<T>(
  items: T[],
  max: number = MAX_RENDERED_CI_NAMES,
): { shown: T[]; extra: number } {
  const shown = items.slice(0, max);
  return { shown, extra: items.length - shown.length };
}
