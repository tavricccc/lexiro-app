// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/** Deterministic per-seed shuffle, so a rebuilt question keeps its option order. */
function seededOrder(length: number, seed: string): number[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

/**
 * Places the answer among the distractors and reports where it landed. Callers
 * never pass an `answerIndex` in from outside, so it cannot be wrong.
 */
export function placeAnswer(
  answer: string,
  distractors: string[],
  seed: string,
): { answerIndex: number; options: string[] } {
  const pool = [answer, ...distractors];
  const order = seededOrder(pool.length, seed);
  const options = order.map((index) => pool[index]);
  return { answerIndex: order.indexOf(0), options };
}
