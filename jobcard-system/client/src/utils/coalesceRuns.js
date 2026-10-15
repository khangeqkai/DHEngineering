// Makes an async job safe to ask for from any number of places. Asking while a run is
// still pending remembers that one more run is wanted and does it once the pending run
// settles (success or failure); any number of asks in that time still make exactly one
// more run. Never two runs at once, and no timers.
export function coalesceRuns(fn) {
  let running = false;
  let again = false;
  const run = () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    again = false;
    let pending;
    try {
      pending = Promise.resolve(fn());
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.catch(() => {}).then(() => {
      running = false;
      if (again) run();
    });
  };
  return run;
}
