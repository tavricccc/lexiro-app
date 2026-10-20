// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";

import type { LibraryState } from "@/core/types";
import { useMemo } from "react";

import { buildQuestionGroups } from "@/core/components/practice/practice-content";
import { senseToStudyWord } from "@/core/lib/library";
import {
  buildMeaningQuestionGroups,
  buildReverseQuestionGroups,
} from "./meaning-questions";

/**
 * Everything a session can draw from, scoped to one set or the whole library.
 * Solo practice and live rooms build their queues from the same pool.
 */
export function usePracticePool(state: LibraryState, setId: string) {
  const allowedSenseIds = useMemo(
    () =>
      new Set(
        (setId
          ? (state.memberships[setId] ?? [])
          : Object.values(state.memberships).flat()
        ).flatMap((entry) => entry.senseIds),
      ),
    [setId, state.memberships],
  );
  const studyItems = useMemo(
    () =>
      Object.values(state.words).flatMap((word) =>
        word.senses
          .filter((sense) => allowedSenseIds.has(sense.id))
          .map((sense) => senseToStudyWord(word, sense)),
      ),
    [allowedSenseIds, state.words],
  );
  const allStudyItems = useMemo(
    () =>
      Object.values(state.words).flatMap((word) =>
        word.senses.map((sense) => senseToStudyWord(word, sense)),
      ),
    [state.words],
  );
  const questionGroups = useMemo(
    () => [
      ...buildMeaningQuestionGroups(allStudyItems),
      ...buildReverseQuestionGroups(allStudyItems),
      ...buildQuestionGroups(state.questions, state.words),
    ],
    [allStudyItems, state.questions, state.words],
  );
  const allQuestionItems = useMemo(
    () => questionGroups.flat(),
    [questionGroups],
  );
  return {
    allowedSenseIds,
    studyItems,
    allStudyItems,
    questionGroups,
    allQuestionItems,
  };
}
