// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { LibraryQuestion, WordEntry } from "@/core/types";
import type { AiGenerationSnapshot } from "@/core/components/ai/use-ai-generation";
import type { AiRunCheckpoint } from "@/core/lib/ai/run-checkpoint";
import type {
  GeneratedQuestionDifficulty,
  GeneratedQuestionKind,
} from "@/core/lib/question-generation";
import { rebindSetQuestionDrafts } from "@/core/lib/library-set-migration";
import { t } from "@/core/lib/i18n";

type QuestionGenerationStep = "configure" | "run" | "review" | "done";
export interface QuestionDraft {
  step: QuestionGenerationStep;
  chosenSetId: string;
  kind: GeneratedQuestionKind;
  difficulty: GeneratedQuestionDifficulty;
  excludedQuestionIds: string[];
  run?: AiGenerationSnapshot<LibraryQuestion>;
}

type StoredQuestionRun = AiRunCheckpoint<LibraryQuestion>["run"];

/** A blocked operation remains in the draft until a new run explicitly replaces it. */
export function retainUnfinishedQuestionCheckpoint(
  previous: AiGenerationSnapshot<LibraryQuestion> | undefined,
  next: AiGenerationSnapshot<LibraryQuestion>,
): AiGenerationSnapshot<LibraryQuestion> {
  if (
    previous?.checkpoint &&
    !next.checkpoint &&
    next.state.resumeUnavailable &&
    next.state.remaining > 0
  )
    return { ...next, checkpoint: previous.checkpoint };
  return next;
}

/** Rebind accepted output without rewriting the recipe or identity of paid work. */
export function rebindQuestionDraftSources(
  draft: QuestionDraft,
  setId: string,
  words: WordEntry[],
): QuestionDraft {
  if (!draft.run)
    return { ...draft, excludedQuestionIds: draft.excludedQuestionIds ?? [] };
  if (!setId || !words.length)
    throw new Error(t("questions.draftSourceRequired"));
  const ids = new Map<string, string>();
  const mapItems = (items: LibraryQuestion[]) => {
    const rebound = rebindSetQuestionDrafts(setId, words, items);
    items.forEach((item, index) => ids.set(item.id, rebound[index].id));
    return rebound;
  };
  const mapRun = (stored: StoredQuestionRun): StoredQuestionRun => ({
    ...stored,
    items: mapItems(stored.items),
    ...(stored.parallel
      ? {
          parallel: {
            ...stored.parallel,
            base: {
              ...stored.parallel.base,
              items: mapItems(stored.parallel.base.items),
            },
            lanes: stored.parallel.lanes.map(
              ([id, lane]): [string, StoredQuestionRun] => [id, mapRun(lane)],
            ),
          },
        }
      : {}),
  });
  const items = mapItems(draft.run.state.items);
  const checkpoint = draft.run.checkpoint
    ? { ...draft.run.checkpoint, run: mapRun(draft.run.checkpoint.run) }
    : undefined;
  return {
    ...draft,
    chosenSetId: setId,
    excludedQuestionIds: (draft.excludedQuestionIds ?? []).map(
      (id) => ids.get(id) ?? id,
    ),
    run: {
      ...draft.run,
      state: { ...draft.run.state, items },
      ...(checkpoint ? { checkpoint } : {}),
    },
  };
}
