// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
"use client";

import type { LibrarySet, LibraryState, SenseId } from "@/core/types";
import { useMemo } from "react";

import { buildQuestionGroups } from "@/core/components/practice/practice-content";
import { t } from "@/core/lib/i18n";
import { senseToStudyWord } from "@/core/lib/library";
import {
  buildMeaningQuestionGroups,
  buildReverseQuestionGroups,
} from "./meaning-questions";

/** Chosen sets that still exist; deleting every chosen set widens to all. */
export function liveSetIds(
  sets: readonly LibrarySet[],
  setIds: readonly string[],
): string[] {
  return setIds.filter((id) => sets.some((set) => set.id === id));
}

/** 全部單字集, the one set's name, or how many sets are chosen. */
export function practiceScopeLabel(
  sets: readonly LibrarySet[],
  setIds: readonly string[],
): string {
  const names = setIds.flatMap(
    (id) => sets.find((set) => set.id === id)?.setName ?? [],
  );
  if (!names.length) return t("practice.allSets");
  return names.length === 1
    ? names[0]
    : t("practice.setCount", { count: names.length });
}

/** The senses in the chosen sets; no sets means the whole library. */
export function scopeSenseIds(
  memberships: LibraryState["memberships"],
  setIds: readonly string[],
): Set<SenseId> {
  return new Set(
    (setIds.length
      ? setIds.flatMap((setId) => memberships[setId] ?? [])
      : Object.values(memberships).flat()
    ).flatMap((entry) => entry.senseIds),
  );
}

/**
 * Everything a session can draw from, scoped to some sets or the whole library.
 * Solo practice and live rooms build their queues from the same pool.
 */
export function usePracticePool(
  state: LibraryState,
  setIds: readonly string[],
) {
  const allowedSenseIds = useMemo(
    () => scopeSenseIds(state.memberships, setIds),
    [setIds, state.memberships],
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
