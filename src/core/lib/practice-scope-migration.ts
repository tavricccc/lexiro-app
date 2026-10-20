// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  LibraryState,
  PracticeQuestionTask,
  PracticeSessionSnapshot,
  SenseId,
} from "@/core/types";
import { shuffleOptions } from "@/core/components/practice/practice-content";
import { canonicalHash } from "./hash";
import { buildSenseId, normalizeWordKey } from "./library";
import { questionBelongsToMemberships } from "./question-ownership";

/** Rebind a saved queue once; its positions, answers and counters stay intact. */
export function migratePracticeScope(
  snapshot: PracticeSessionSnapshot,
  library: LibraryState,
): { snapshot: PracticeSessionSnapshot; changed: boolean } | null {
  const sets = library.sets
    .filter(
      (set) => !snapshot.setIds.length || snapshot.setIds.includes(set.id),
    )
    .toSorted((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
  if (snapshot.setIds.length && !sets.length) return null;
  const scopes = sets.map((set) => {
    const memberships = library.memberships[set.id] ?? [];
    const senses = new Map<string, SenseId>();
    for (const member of memberships) {
      const word = library.words[member.wordKey];
      for (const sense of word.senses.filter((entry) =>
        member.senseIds.includes(entry.id),
      )) {
        senses.set(sense.id, sense.id);
        senses.set(
          buildSenseId(normalizeWordKey(word.word), sense.pos, sense.meaningZh),
          sense.id,
        );
      }
    }
    return {
      setId: set.id,
      senses,
      questions: library.questions.filter((question) =>
        questionBelongsToMemberships(question, memberships),
      ),
    };
  });
  const mapSense = (id: string) => {
    // A current ID retains its owner even in an all-library session.
    for (const scope of scopes) {
      const direct = scope.senses.get(id);
      if (direct === id) return direct;
    }
    for (const scope of scopes) {
      const target = scope.senses.get(id);
      if (target) return target;
    }
    return null;
  };
  const scopedId = (prefix: "question" | "child", setId: string, id: string) =>
    `${prefix}-${canonicalHash({ setId, id })}`;
  const resolveQuestion = (
    id: string,
  ): {
    id: string;
    options: string[];
    answerIndex: number;
    shared: boolean;
    task: PracticeQuestionTask;
  } | null => {
    for (const scope of scopes) {
      for (const question of scope.questions) {
        if (question.kind === "multipleChoice") {
          if (
            question.questionStyle === "vocabulary" &&
            id === `question:${question.id}`
          )
            return {
              id,
              options: question.options,
              answerIndex: question.answerIndex,
              shared: false,
              task: "vocabulary",
            };
        } else {
          const child = question.questions.find(
            (entry) => id === `reading:${question.id}:${entry.id}`,
          );
          if (child)
            return {
              id,
              options: child.options,
              answerIndex: child.answerIndex,
              shared: Boolean(question.optionBank),
              task: question.format,
            };
        }
      }
    }
    for (const scope of scopes) {
      if (id.startsWith("question:")) {
        const target = scopedId(
          "question",
          scope.setId,
          id.slice("question:".length),
        );
        const question = scope.questions.find(
          (
            entry,
          ): entry is Extract<LibraryQuestion, { kind: "multipleChoice" }> =>
            entry.kind === "multipleChoice" &&
            entry.questionStyle === "vocabulary" &&
            entry.id === target,
        );
        if (question)
          return {
            id: `question:${question.id}`,
            options: question.options,
            answerIndex: question.answerIndex,
            shared: false,
            task: "vocabulary",
          };
      } else if (id.startsWith("reading:")) {
        const source = id.slice("reading:".length);
        // Imported historical IDs may contain colons; match the actual pair.
        for (
          let separator = source.indexOf(":");
          separator >= 0;
          separator = source.indexOf(":", separator + 1)
        ) {
          const parentId = scopedId(
            "question",
            scope.setId,
            source.slice(0, separator),
          );
          const childId = scopedId(
            "child",
            scope.setId,
            source.slice(separator + 1),
          );
          const parent = scope.questions.find(
            (entry) => entry.kind === "reading" && entry.id === parentId,
          );
          if (!parent || parent.kind !== "reading") continue;
          const child = parent.questions.find((entry) => entry.id === childId);
          if (child)
            return {
              id: `reading:${parent.id}:${child.id}`,
              options: child.options,
              answerIndex: child.answerIndex,
              shared: Boolean(parent.optionBank),
              task: parent.format,
            };
        }
      }
    }
    return null;
  };

  const entryIds: string[] = [];
  // The legacy field name now carries every presented option order.
  const meaningChoices: PracticeSessionSnapshot["meaningChoices"] = {};
  for (const id of snapshot.entryIds) {
    const wordTask = id.startsWith("meaning:")
      ? "meaning"
      : id.startsWith("reverse:")
        ? "reverse"
        : null;
    if (wordTask) {
      const senseId = mapSense(id.slice(wordTask.length + 1));
      const choices = snapshot.meaningChoices[id];
      if (!senseId || !choices || !snapshot.tasks.includes(wordTask))
        return null;
      const target = `${wordTask}:${senseId}`;
      entryIds.push(target);
      meaningChoices[target] = choices;
    } else {
      const question = resolveQuestion(id);
      if (!question || !snapshot.tasks.includes(question.task)) return null;
      entryIds.push(question.id);
      meaningChoices[question.id] =
        snapshot.meaningChoices[id] ??
        (question.shared
          ? { options: question.options, answerIndex: question.answerIndex }
          : shuffleOptions(question.options, question.answerIndex, id));
    }
  }
  if (new Set(entryIds).size !== entryIds.length) return null;
  const failedSenseIds: SenseId[] = [];
  for (const id of snapshot.failedSenseIds) {
    const target = mapSense(id);
    if (!target) return null;
    if (!failedSenseIds.includes(target)) failedSenseIds.push(target);
  }
  const migrated = { ...snapshot, entryIds, meaningChoices, failedSenseIds };
  return {
    snapshot: migrated,
    changed: JSON.stringify(migrated) !== JSON.stringify(snapshot),
  };
}
