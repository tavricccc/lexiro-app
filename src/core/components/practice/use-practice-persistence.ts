// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";

import { useEffect, useState } from "react";

import {
  clearPracticeDraft,
  readPracticeDraft,
  writePracticeDraft,
} from "@/core/lib/practice-storage";
import type {
  PracticeSessionSnapshot,
  PracticeTask,
  LibraryState,
  SenseId,
  StudyWord,
  WorkspaceQuestionDifficulty,
} from "@/core/types";
import type { QuestionItem } from "@/core/components/practice/practice-content";
import type { PracticeEntry } from "@/core/components/practice/practice-queue";
import type { DraftPersistence } from "@/core/lib/draft-persistence";
import { entriesFromIds } from "@/core/components/practice/practice-queue";
import { scopeSenseIds } from "@/core/components/practice/use-practice-pool";
import {
  canRestorePracticeSession,
  parsePracticeSession,
} from "@/core/lib/practice-session";
import { migratePracticeScope } from "@/core/lib/practice-scope-migration";

export type PracticeRestoreIssue = "unreadable" | "source" | "storage";

export function useRestorePracticeSession({
  allQuestionItems,
  allStudyItems,
  checkRevision,
  enabled,
  initialSet,
  library,
  retiredEntryIds,
  restoreAttempted,
  onOffer,
  onChecked,
  onUnavailable,
}: {
  allQuestionItems: QuestionItem[];
  allStudyItems: StudyWord[];
  /** Bumped to check again after another device replaced the draft. */
  checkRevision: number;
  enabled: boolean;
  initialSet: string;
  library: LibraryState;
  retiredEntryIds: ReadonlySet<string>;
  restoreAttempted: { current: boolean };
  onOffer: (
    snapshot: PracticeSessionSnapshot,
    entries: PracticeEntry[],
  ) => void;
  onChecked: () => void;
  onUnavailable: (issue: PracticeRestoreIssue) => void;
}) {
  useEffect(() => {
    if (restoreAttempted.current || !enabled) return;
    restoreAttempted.current = true;
    let raw: string | null;
    try {
      raw = readPracticeDraft();
    } catch {
      onUnavailable("storage");
      onChecked();
      return;
    }
    const saved = parsePracticeSession(raw, retiredEntryIds);
    if (!saved) {
      if (raw) onUnavailable("unreadable");
      onChecked();
      return;
    }
    if (!canRestorePracticeSession(saved, initialSet)) {
      onChecked();
      return;
    }

    const migrated = migratePracticeScope(saved, library);
    if (!migrated) {
      onUnavailable("source");
      onChecked();
      return;
    }
    const restored = migrated.snapshot;
    const allowed = scopeSenseIds(library.memberships, restored.setIds);
    if (migrated.changed) {
      try {
        writePracticeDraft(restored);
      } catch {
        onUnavailable("storage");
        onChecked();
        return;
      }
    }
    const entries = entriesFromIds(
      restored.entryIds,
      restored.tasks,
      allStudyItems,
      allQuestionItems,
      restored.meaningChoices,
    );
    const outOfScope = entries?.some(
      (entry) => !allowed.has(entry.item.senseId),
    );
    if (!entries || outOfScope) {
      onUnavailable("source");
      onChecked();
      return;
    }
    onOffer(restored, entries);
  }, [
    allQuestionItems,
    allStudyItems,
    checkRevision,
    enabled,
    initialSet,
    library,
    retiredEntryIds,
    onOffer,
    onChecked,
    onUnavailable,
    restoreAttempted,
  ]);
}

export function usePersistPracticeSession({
  amount,
  answerChoices,
  complete,
  correct,
  difficulty,
  entries,
  failedSenseIds,
  index,
  marked,
  retrying,
  revealed,
  selected,
  setIds,
  skipped,
  started,
  tasks,
  wrong,
}: {
  amount: number;
  answerChoices: Array<number | null>;
  complete: boolean;
  correct: number;
  difficulty: WorkspaceQuestionDifficulty;
  entries: readonly PracticeEntry[];
  failedSenseIds: SenseId[];
  index: number;
  marked: number[];
  retrying: boolean;
  revealed: boolean;
  selected: number | null;
  setIds: string[];
  skipped: number[];
  started: boolean;
  tasks: PracticeTask[];
  wrong: number[];
}) {
  const [persistence, setPersistence] = useState<DraftPersistence>("idle");
  useEffect(() => {
    if (!started) return;
    if (complete) {
      try {
        clearPracticeDraft();
        setPersistence("idle");
      } catch {
        setPersistence("error");
      }
      return;
    }
    if (!entries.length) return;
    const snapshot = buildPracticeSnapshot({
      entries,
      answerChoices,
      tasks,
      setIds,
      amount,
      index,
      correct,
      wrong,
      skipped,
      marked,
      selected,
      revealed,
      difficulty,
      failedSenseIds,
      retrying,
    });
    try {
      writePracticeDraft(snapshot);
      setPersistence("saved");
    } catch {
      setPersistence("error");
    }
  }, [
    amount,
    answerChoices,
    complete,
    correct,
    difficulty,
    entries,
    failedSenseIds,
    index,
    marked,
    retrying,
    revealed,
    selected,
    setIds,
    skipped,
    started,
    tasks,
    wrong,
  ]);
  return persistence;
}

/** Use the same snapshot for disk persistence and an in-app pause. */
function buildPracticeSnapshot({
  entries,
  answerChoices,
  ...session
}: Omit<
  Parameters<typeof usePersistPracticeSession>[0],
  "started" | "complete"
>): PracticeSessionSnapshot {
  return {
    ...session,
    schemaVersion: 5,
    meaningChoices: Object.fromEntries(
      entries.map((entry) => [
        entry.id,
        {
          options: [...entry.item.options],
          answerIndex: entry.item.answerIndex,
        },
      ]),
    ),
    entryIds: entries.map((entry) => entry.id),
    answerChoices: entries.map(
      (_, position) => answerChoices[position] ?? null,
    ),
  };
}
