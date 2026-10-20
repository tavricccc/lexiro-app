// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { JobKind } from "@/core/ai-contract";
import { isRecord } from "../schema";

export interface StreamCounts {
  units: number;
  senses: number;
  questions: number;
}
type Path = (string | number)[];
interface Frame {
  type: "object" | "array";
  path: Path;
  start: number;
  key?: string;
  index: number;
  expectingKey: boolean;
}
const strings = (value: unknown, count?: number) =>
  Array.isArray(value) &&
  (count === undefined || value.length === count) &&
  value.every((item) => typeof item === "string" && item.trim());
const optionReasons = (value: unknown, count: number) =>
  Array.isArray(value) &&
  value.length === count &&
  value.every(
    (item) =>
      isRecord(item) &&
      typeof item.option === "string" &&
      item.option.trim() &&
      typeof item.reason === "string" &&
      item.reason.trim(),
  );
const sense = (value: unknown) =>
  isRecord(value) &&
  (value.pos === null || typeof value.pos === "string") &&
  typeof value.meaningZh === "string" &&
  value.meaningZh.trim() &&
  typeof value.example === "string" &&
  value.example.trim();
const passageKinds = new Set<JobKind>([
  "reading",
  "cloze",
  "wordBank",
  "discourse",
]);

/** Scan only newly received characters; count complete JSON entries, never open fragments. */
export function createStreamProgress(kind: JobKind) {
  const counts: StreamCounts = { units: 0, senses: 0, questions: 0 };
  const frames: Frame[] = [];
  let offset = 0,
    stringStart = -1,
    escaped = false,
    keyString = false;
  const pathForValue = (): Path => {
    const parent = frames.at(-1);
    return parent
      ? [
          ...parent.path,
          parent.type === "array" ? parent.index : (parent.key ?? ""),
        ]
      : [];
  };
  const complete = (path: Path, value: unknown) => {
    if (kind === "words" || kind === "senses") {
      if (
        path.length === 4 &&
        path[0] === "items" &&
        path[2] === "senses" &&
        sense(value)
      )
        counts.senses++;
      if (
        path.length === 2 &&
        path[0] === "items" &&
        isRecord(value) &&
        Array.isArray(value.senses) &&
        value.senses.every(sense)
      )
        counts.units++;
      return;
    }
    const field =
      kind === "cloze" || kind === "wordBank"
        ? "blanks"
        : kind === "discourse"
          ? "removals"
          : "items";
    if (path.length === 2 && path[0] === field && isRecord(value)) {
      const reasons = kind === "wordBank" ? 9 : kind === "discourse" ? 4 : 3;
      const answer = kind === "discourse" ? value.sentence : value.answer;
      const valid =
        typeof answer === "string" &&
        answer.trim() &&
        typeof value.explanation === "string" &&
        value.explanation.trim() &&
        optionReasons(value.whyWrong, reasons) &&
        (kind === "wordBank" ||
          kind === "discourse" ||
          strings(value.distractors, 3)) &&
        (kind !== "vocabulary" ||
          (typeof value.sentence === "string" &&
            typeof value.usage === "string")) &&
        (kind !== "reading" ||
          (typeof value.question === "string" && strings(value.evidence)));
      if (valid) {
        counts.questions++;
        if (kind === "vocabulary") counts.units++;
      }
    }
    if (
      !path.length &&
      passageKinds.has(kind) &&
      isRecord(value) &&
      typeof value.passage === "string" &&
      counts.questions
    )
      counts.units = 1;
  };
  return (text: string): StreamCounts => {
    if (!text.length) {
      offset = 0;
      stringStart = -1;
      escaped = false;
      keyString = false;
      frames.length = 0;
      counts.units = 0;
      counts.senses = 0;
      counts.questions = 0;
    }
    for (; offset < text.length; offset++) {
      const char = text[offset];
      if (stringStart >= 0) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          if (keyString) {
            try {
              frames.at(-1)!.key = JSON.parse(
                text.slice(stringStart, offset + 1),
              );
            } catch {
              /* An invalid key cannot count an entry. */
            }
          }
          stringStart = -1;
        }
        continue;
      }
      if (char === '"') {
        stringStart = offset;
        keyString = frames.at(-1)?.expectingKey === true;
        continue;
      }
      if (char === "{" || char === "[") {
        frames.push({
          type: char === "{" ? "object" : "array",
          path: pathForValue(),
          start: offset,
          index: 0,
          expectingKey: char === "{",
        });
      } else if (char === "}" || char === "]") {
        const frame = frames.pop();
        if (frame && (frame.type === "object" ? char === "}" : char === "]")) {
          try {
            complete(
              frame.path,
              JSON.parse(text.slice(frame.start, offset + 1)),
            );
          } catch {
            /* Only complete, parseable entries advance progress. */
          }
        }
      } else if (char === ":" && frames.at(-1)?.type === "object")
        frames.at(-1)!.expectingKey = false;
      else if (char === ",") {
        const parent = frames.at(-1);
        if (parent?.type === "array") parent.index++;
        else if (parent) {
          parent.expectingKey = true;
          parent.key = undefined;
        }
      }
    }
    return { ...counts };
  };
}

export function savedStreamCounts(
  items: unknown[],
  kind: JobKind,
): StreamCounts {
  const meanings = kind === "words" || kind === "senses";
  return {
    units: items.length,
    senses: meanings
      ? items.reduce<number>(
          (sum, item) =>
            sum +
            (isRecord(item) && Array.isArray(item.senses)
              ? item.senses.length
              : 0),
          0,
        )
      : 0,
    questions: meanings
      ? 0
      : items.reduce<number>(
          (sum, item) =>
            sum +
            (isRecord(item) && Array.isArray(item.questions)
              ? item.questions.length
              : 1),
          0,
        ),
  };
}
