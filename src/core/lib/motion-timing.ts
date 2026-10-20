// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import {
  motionEasing,
  motionSeconds,
  type MotionCurve,
  type MotionRung,
} from "@/core/generated/motion-tokens";

/**
 * A transition for an animation driven from JavaScript, expressed on the same
 * ladder the stylesheet uses. Nothing animated in the product states a raw
 * duration or curve of its own: both come from `config/motion.config.json`, so
 * retuning the ladder retunes CSS and JavaScript together.
 */
export function timing(rung: MotionRung, curve: MotionCurve = "arrive") {
  return { duration: motionSeconds[rung], ease: motionEasing[curve] };
}
