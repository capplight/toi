/**
 * Navigate after a sheet/dialog closes: an open sheet holds a history entry (system «Back» closes it, Ф1) and
 * closing it calls `history.back()` — navigating in the same tick would be undone by that back.
 */
export function afterSheetClosed(fn: () => void) {
  if (!window.history.state?.toiSheet) return fn();
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", run);
    fn();
  };
  window.addEventListener("popstate", run);
  window.setTimeout(run, 400);
}
