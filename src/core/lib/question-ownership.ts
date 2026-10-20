// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  SenseId,
  SetMembership,
  WordEntry,
  WordKey,
} from "@/core/types";

/** Retired grammar records remain available to backups, outside active study. */
export function isExamQuestion(question: LibraryQuestion): boolean {
  return question.kind === "reading" || question.questionStyle === "vocabulary";
}

export function questionUsesWords(
  question: LibraryQuestion,
  words: Record<WordKey, WordEntry>,
): boolean {
  function hasSense(wordKey: WordKey, senseId: SenseId): boolean {
    return Boolean(
      words[wordKey]?.senses.some((sense) => sense.id === senseId),
    );
  }
  if (question.kind === "reading")
    return (
      question.wordKeys.length > 0 &&
      question.wordKeys.every((wordKey) => Boolean(words[wordKey])) &&
      question.questions.length > 0 &&
      question.questions.every((child) =>
        hasSense(child.wordKey, child.senseId),
      )
    );
  return hasSense(question.wordKey, question.senseId);
}

export function questionBelongsToMemberships(
  question: LibraryQuestion,
  memberships: SetMembership[],
): boolean {
  const membershipsByWordKey = new Map(
    memberships.map((membership) => [membership.wordKey, membership]),
  );
  if (question.kind === "reading") {
    return (
      question.wordKeys.length > 0 &&
      question.questions.length > 0 &&
      question.wordKeys.every((wordKey) => membershipsByWordKey.has(wordKey)) &&
      question.questions.every((child) => {
        const membership = membershipsByWordKey.get(child.wordKey);
        return Boolean(membership?.senseIds.includes(child.senseId));
      })
    );
  }

  const membership = membershipsByWordKey.get(question.wordKey);
  return Boolean(membership?.senseIds.includes(question.senseId));
}
