// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { LibraryState, SenseId } from "@/core/types";

import { isExamQuestion } from "./question-ownership";

export interface LibrarySetMetrics {
  questionCount: number;
  senseCount: number;
}

export function countQuestionItems(state: LibraryState): number {
  let count = 0;
  for (const question of state.questions) {
    if (!isExamQuestion(question)) continue;
    count += question.kind === "reading" ? question.questions.length : 1;
  }
  return count;
}

export function buildLibrarySetMetrics(
  state: LibraryState,
): Map<string, LibrarySetMetrics> {
  const metrics = new Map<string, LibrarySetMetrics>();
  const setIdsBySense = new Map<SenseId, Set<string>>();

  for (const set of state.sets) {
    const senseIds = new Set(
      (state.memberships[set.id] ?? []).flatMap(
        (membership) => membership.senseIds,
      ),
    );
    for (const senseId of senseIds) {
      const setIds = setIdsBySense.get(senseId) ?? new Set<string>();
      setIds.add(set.id);
      setIdsBySense.set(senseId, setIds);
    }

    metrics.set(set.id, {
      questionCount: 0,
      senseCount: senseIds.size,
    });
  }

  for (const question of state.questions) {
    if (!isExamQuestion(question)) continue;
    const senseIds =
      question.kind === "reading"
        ? question.questions.map((child) => child.senseId)
        : [question.senseId];
    const affectedSetIds = new Set<string>();
    for (const senseId of senseIds) {
      for (const setId of setIdsBySense.get(senseId) ?? [])
        affectedSetIds.add(setId);
    }
    for (const setId of affectedSetIds) {
      const current = metrics.get(setId);
      if (current) current.questionCount += 1;
    }
  }

  return metrics;
}
