// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
// Generated from config/motion.config.json by scripts/generate-motion.mjs.
// Do not edit: change the config and run `bun run generate:all`.

/** Rungs of the duration ladder, in seconds, for animations driven from JavaScript. */
export const motionSeconds = {
  touch: 0.1,
  control: 0.25,
  nav: 0.46,
  sheet: 0.56,
  controlExit: 0.19,
  sheetExit: 0.38,
} as const;

/** The sanctioned easing curves as cubic-bezier control points. */
export const motionEasing = {
  arrive: [0.16, 1, 0.3, 1],
  depart: [0.4, 0, 1, 1],
  move: [0.4, 0, 0.2, 1],
  nav: [0.32, 0.72, 0, 1],
} as const;

/** Indeterminate loops, in seconds. They repeat, so they sit outside the ladder. */
export const motionLoopSeconds = {
  spin: 0.8,
  sweep: 1.1,
  pulse: 2.2,
} as const;

export type MotionRung = keyof typeof motionSeconds;
export type MotionCurve = keyof typeof motionEasing;
export type MotionLoop = keyof typeof motionLoopSeconds;
