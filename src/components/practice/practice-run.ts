import type { PracticeEntry } from "@/core/components/practice/practice-queue";
import type {
  PracticeSessionSnapshot,
  PracticeTask,
  WorkspaceQuestionDifficulty,
} from "@/core/types";

/** What the setup screen chose; a new round is dealt from the same choices. */
export interface PracticeChoices {
  setIds: string[];
  tasks: PracticeTask[];
  amount: number;
  difficulty: WorkspaceQuestionDifficulty;
  oneSensePerWord: boolean;
}

/**
 * A session handed from the setup screen to the session screen: the entries
 * already dealt, and a saved snapshot when it continues an earlier one.
 */
export interface PracticeRun {
  choices: PracticeChoices;
  entries: PracticeEntry[];
  snapshot?: PracticeSessionSnapshot;
}

let pending: PracticeRun | null = null;

export function handOffRun(run: PracticeRun) {
  pending = run;
}

/** The run the session screen was opened for; the next hand-off replaces it. */
export function currentRun(): PracticeRun | null {
  return pending;
}
