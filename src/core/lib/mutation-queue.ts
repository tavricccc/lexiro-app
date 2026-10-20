// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/** Serialize complete read-modify-write actions and let account switches drain them. */
export function createMutationQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    serial<Args extends unknown[], Result>(
      action: (...args: Args) => Promise<Result>,
    ) {
      return (...args: Args): Promise<Result> => {
        const next = pending.then(() => action(...args));
        pending = next.catch(() => undefined);
        return next;
      };
    },
    async flush() {
      await pending;
    },
  };
}
