// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  GeneratedQuestionKind,
  LibraryQuestion,
  QuestionDifficulty,
  WordEntry,
} from "@/core/types";
import type { AiTaskStep } from "@/core/types/ai";
import type { GenerationInput } from "@/core/ai-contract";
import { isRecord } from "../schema";
import {
  assembleGeneratedQuestions,
  wordBankSourceSlots,
} from "../question-assembly";
import {
  generatedQuestionItemIssue,
  generatedQuestionQualityIssue,
  sharedQuestionBankIssue,
  sharedQuestionBankProseIssue,
  sharedTeachingIssue,
} from "../question-quality";
import { extractJsonText } from "./json";
import { discourseStructureIssue } from "../question-discourse";
import { sourceWordFormIssue } from "../question-word-forms";
import { locateUsageAnswer } from "../question-spans";

/** Keep the article and good children; every replacement request produces one child. */
export function passageRepairs({
  text,
  kind,
  difficulty,
  words,
  input,
  parentId,
  parse,
}: {
  text: string;
  kind: GeneratedQuestionKind;
  difficulty: QuestionDifficulty;
  words: WordEntry[];
  input: GenerationInput;
  parentId: string;
  parse: (text: string) => LibraryQuestion[];
}) {
  const draft: unknown = JSON.parse(extractJsonText(text));
  const field =
    kind === "cloze" || kind === "wordBank"
      ? "blanks"
      : kind === "discourse"
        ? "removals"
        : "items";
  if (
    !isRecord(draft) ||
    typeof draft.passage !== "string" ||
    !draft.passage.trim() ||
    !Array.isArray(draft[field]) ||
    !draft[field].length
  )
    return null;
  if (sharedQuestionBankIssue(draft, kind)) return null;
  if (sharedQuestionBankProseIssue(draft, kind)) return null;
  if (sharedTeachingIssue(draft, kind)) return null;
  if (kind === "discourse" && discourseStructureIssue(draft)) return null;
  const items = draft[field] as unknown[];
  let bankSlots: ReturnType<typeof wordBankSourceSlots> | null = null;
  if (kind === "wordBank") {
    try {
      bankSlots = wordBankSourceSlots(words, items);
    } catch {
      return null; // Missing ownership cannot be guessed by a teaching repair.
    }
    if (
      items.some((item) => {
        if (!isRecord(item) || typeof item.answer !== "string") return false;
        const slot = bankSlots!.get(String(item.ref).trim())!;
        return sourceWordFormIssue(
          slot.word.word,
          slot.word.senses[slot.senseIndex].pos,
          item.answer,
          typeof item.usage === "string" ? item.usage : undefined,
        );
      })
    )
      return null; // A new answer also needs new prose and a new shared bank.
  }
  const issue = (index: number) => {
    const value = items[index];
    const quality = generatedQuestionItemIssue(draft, kind, difficulty, index);
    if (quality) return quality;
    if (!isRecord(value)) return "子題資料不完整";
    if (kind === "wordBank") {
      const slot = bankSlots!.get(String(value.ref).trim())!;
      if (typeof value.answer === "string") {
        const formIssue = sourceWordFormIssue(
          slot.word.word,
          slot.word.senses[slot.senseIndex].pos,
          value.answer,
          typeof value.usage === "string" ? value.usage : undefined,
        );
        if (formIssue) return formIssue;
      }
    }
    if (kind === "reading") {
      return (
        assembleGeneratedQuestions(
          { ...draft, items: [value] },
          kind,
          difficulty,
          words,
        ).dropped[0] ?? null
      );
    }
    const answer = kind === "discourse" ? value.sentence : value.answer;
    if (
      typeof answer !== "string" ||
      !answer.trim() ||
      (kind === "discourse" &&
        (draft.passage as string).split(answer).length !== 2)
    )
      return "答案必須在既有文章中恰好出現一次";
    if (kind === "cloze" || kind === "wordBank") {
      const location = locateUsageAnswer(
        draft.passage as string,
        typeof value.usage === "string" ? value.usage.trim() : "",
        answer.trim(),
      );
      if ("issue" in location) return location.issue;
    }
    if (
      kind !== "cloze" &&
      items
        .slice(0, index)
        .some(
          (item) =>
            isRecord(item) &&
            (kind === "discourse" ? item.sentence : item.answer) === answer,
        )
    )
      return "子題答案重複";
    if (
      kind === "cloze" &&
      (!Array.isArray(value.distractors) ||
        value.distractors.length !== 3 ||
        new Set(
          [answer, ...value.distractors].map((entry) =>
            String(entry).toLowerCase(),
          ),
        ).size !== 4)
    )
      return "干擾選項不足或重複";
    return null;
  };
  let bad = items.map((_, index) => index).filter((index) => issue(index));
  const groupIssue = generatedQuestionQualityIssue(draft, kind, difficulty);
  if (groupIssue?.startsWith("文章")) return null;
  if (!bad.length && kind === "reading" && groupIssue) {
    const index = groupIssue.includes("mainIdea")
      ? 0
      : items.findIndex((item) => isRecord(item) && item.skill !== "mainIdea");
    bad = [index >= 0 ? index : items.length - 1];
  }
  if (!bad.length) return null;
  const remaining = bad.map((index, position): AiTaskStep<LibraryQuestion> => {
    const payload = () =>
      JSON.stringify({
        ...input,
        itemRepair: {
          index,
          passage: draft.passage,
          items: items.map((item) => {
            if (!isRecord(item)) return item;
            const {
              explanation: _explanation,
              whyWrong: _whyWrong,
              ...content
            } = item;
            return content;
          }),
          ...(kind === "wordBank" || kind === "discourse"
            ? {
                extraOptions: (draft.options as string[]).filter(
                  (option) =>
                    !items.some(
                      (item) =>
                        isRecord(item) &&
                        (kind === "discourse" ? item.sentence : item.answer) ===
                          option,
                    ),
                ),
              }
            : {}),
        },
      });
    return {
      id: `${parentId}:item:${index}`,
      get context() {
        return payload();
      },
      get prompt() {
        return payload();
      },
      count: position === bad.length - 1 ? 1 : 0,
      get stagedQuestions() {
        return items.filter((_, at) => !issue(at)).length;
      },
      parse: (response) => {
        const value: unknown = JSON.parse(extractJsonText(response));
        if (
          !isRecord(value) ||
          !Array.isArray(value.items) ||
          value.items.length !== 1
        )
          throw new Error("重新生成必須只回傳一個子題");
        const previous = items[index];
        const replacement = value.items[0];
        if (
          kind === "wordBank" &&
          (!isRecord(previous) ||
            !isRecord(replacement) ||
            typeof replacement.ref !== "string" ||
            replacement.ref.trim() !== String(previous.ref).trim())
        )
          throw new Error("文意選填重新生成必須保留本格的來源 ref");
        items[index] = replacement;
        const error = issue(index);
        if (error) {
          items[index] = previous;
          throw new Error(`第 ${index + 1} 題：${error}`);
        }
        return position === bad.length - 1 ? parse(JSON.stringify(draft)) : [];
      },
    };
  });
  return { items: [] as LibraryQuestion[], completed: 0, remaining };
}
