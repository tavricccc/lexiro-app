// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { useState } from "react";

import { useResumableDraft } from "@/core/lib/use-resumable-draft";
import { DEFAULT_CARD_TASKS, DEFAULT_QUESTION_TASKS } from "@/core/constants";
import { isPracticeTask } from "@/core/constants/practice";
import { useCloudStore } from "@/core/stores/cloud-store";
import type {
  PracticeTask,
  PracticeTrack,
  WorkspaceQuestionDifficulty,
} from "@/core/types";

interface PracticeSetupDraft {
  amount: number;
  difficulty: WorkspaceQuestionDifficulty;
  oneSensePerWord: boolean;
  /** Empty means the whole library. Drafts saved before held one `setId`. */
  setIds: string[];
  setId?: string;
  tasks: PracticeTask[];
}

export function usePracticeSetupChoices(
  initialSet: string,
  initialTrack?: PracticeTrack,
) {
  const uid = useCloudStore((store) => store.user?.uid);
  const initialSets = () => (initialSet ? [initialSet] : []);
  const initialTasks = () =>
    initialTrack === "words"
      ? [...DEFAULT_CARD_TASKS]
      : [...DEFAULT_QUESTION_TASKS];
  const saved = useResumableDraft<PracticeSetupDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:practice-setup:${initialSet || "all"}:${initialTrack ?? "choose"}`,
    {
      amount: 10,
      difficulty: "all",
      oneSensePerWord: true,
      setIds: initialSets(),
      tasks: initialTasks(),
    },
  );
  const [tasks, setTasks] = useState<PracticeTask[]>(initialTasks);
  const [setIds, setSetIds] = useState<string[]>(initialSets);
  const [amount, setAmount] = useState(10);
  const [difficulty, setDifficulty] =
    useState<WorkspaceQuestionDifficulty>("all");
  const [oneSensePerWord, setOneSensePerWord] = useState(true);

  const reset = () => {
    setTasks(initialTasks());
    setSetIds(initialSets());
    setAmount(10);
    setDifficulty("all");
    setOneSensePerWord(true);
  };
  const restart = () => {
    saved.restart();
    reset();
  };
  const resume = () => {
    const draft = saved.pending!;
    saved.resume();
    setTasks([
      ...new Set(
        draft.tasks
          .map((task) => (String(task) === "flashcard" ? "meaning" : task))
          .filter(isPracticeTask),
      ),
    ]);
    setSetIds(draft.setIds ?? (draft.setId ? [draft.setId] : []));
    setAmount(draft.amount);
    setDifficulty(draft.difficulty);
    setOneSensePerWord(draft.oneSensePerWord);
  };

  return {
    amount,
    difficulty,
    oneSensePerWord,
    setIds,
    tasks,
    saved,
    reset,
    restart,
    resume,
    changeAmount: (value: number) => {
      setAmount(value);
      saved.update({ amount: value });
    },
    changeDifficulty: (value: WorkspaceQuestionDifficulty) => {
      setDifficulty(value);
      saved.update({ difficulty: value });
    },
    changeOneSense: (value: boolean) => {
      setOneSensePerWord(value);
      saved.update({ oneSensePerWord: value });
    },
    changeSets: (value: string[]) => {
      setSetIds(value);
      saved.update({ setIds: value });
    },
    changeTasks: (value: PracticeTask[]) => {
      setTasks(value);
      saved.update({ tasks: value });
    },
    clear: saved.clear,
    restoreSessionChoices: (value: {
      tasks: PracticeTask[];
      setIds: string[];
      amount: number;
      difficulty: WorkspaceQuestionDifficulty;
    }) => {
      setTasks(value.tasks);
      setSetIds(value.setIds);
      setAmount(value.amount);
      setDifficulty(value.difficulty);
    },
  };
}
