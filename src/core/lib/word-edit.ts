// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { LibraryState, WordDraft, WordKey } from "@/core/types";
import {
  buildSenseId,
  buildSetWordKey,
  normalizePartOfSpeech,
  normalizeWordKey,
} from "./library";

export function setWordDrafts(state: LibraryState, setId: string) {
  return (state.memberships[setId] ?? []).flatMap((membership) => {
    const entry = state.words[membership.wordKey];
    return entry.senses
      .filter((sense) => membership.senseIds.includes(sense.id))
      .map((sense) => ({
        word: entry.word,
        pos: sense.pos,
        meaningZh: sense.meaningZh,
        examples: sense.examples,
        supplementary: sense.supplementary,
      }));
  });
}

/** Build against the latest library at save time, replacing only this word's rows. */
export function prepareWordEdit(
  state: LibraryState,
  setId: string,
  originalKey: WordKey,
  draft: WordDraft,
) {
  const current = state.sets.find((entry) => entry.id === setId);
  if (
    !current ||
    !(state.memberships[setId] ?? []).some(
      (entry) => entry.wordKey === originalKey,
    )
  )
    throw new Error("word-no-longer-in-set");
  const wordKey = buildSetWordKey(setId, draft.word);
  const original = state.words[originalKey];
  const edited = draft.senses.map((sense) => ({
    word: draft.word.trim(),
    pos: normalizePartOfSpeech(sense.pos) || sense.pos.trim(),
    meaningZh: sense.meaning.trim(),
    examples: sense.examples.map((example) => example.trim()).filter(Boolean),
    supplementary: sense.supplementary,
  }));
  if (
    !normalizeWordKey(draft.word) ||
    !edited.length ||
    edited.some((sense) => !sense.pos || !sense.meaningZh)
  )
    throw new Error("invalid-word");
  const remaps = draft.senses.flatMap((sense, index) => {
    const old = original.senses.find((entry) => entry.id === sense.id);
    const newSenseId = buildSenseId(
      wordKey,
      edited[index].pos,
      edited[index].meaningZh,
    );
    return old && (old.id !== newSenseId || originalKey !== wordKey)
      ? [
          {
            oldWordKey: originalKey,
            oldSenseId: old.id,
            newWordKey: wordKey,
            newSenseId,
          },
        ]
      : [];
  });
  return {
    id: setId,
    setName: current.setName,
    folderId: current.folderId,
    words: [
      ...setWordDrafts(state, setId).filter(
        (row) => buildSetWordKey(setId, row.word) !== originalKey,
      ),
      ...edited,
    ],
    remaps,
  };
}
