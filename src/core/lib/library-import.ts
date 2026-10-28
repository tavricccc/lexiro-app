// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type {
  LibraryQuestion,
  MultipleChoiceQuestion,
  PassageFormat,
  QuestionDifficulty,
  QuestionStyle,
  ReadingChildQuestion,
  ReadingPack,
  SenseId,
  WordEntry,
  WordKey,
  WordSense,
} from "@/core/types";
import { canonicalHash } from "./hash";
import {
  asSenseId,
  buildQuestionFingerprint,
  buildQuestionId,
  buildSenseId,
  isSetWordKey,
  normalizePartOfSpeech,
  normalizeWordKey,
  senseDescription,
} from "./library";
import {
  isValidAnswerIndex,
  passageBlankIssue,
  questionPromptIssue,
} from "./question-shape";
import { PASSAGE_FORMATS } from "./question-formats";
import { assertKnownKeys, isRecord, requiredText } from "./schema";
import { containsHan } from "./validation";

export interface QuestionSourceRef {
  wordKey: WordKey;
  senseId: SenseId;
}

export type QuestionSourceRefs = Record<string, QuestionSourceRef>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${field} 格式錯誤`);
  return value.trim();
}

function stringList(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim())
  )
    throw new Error(`${field} 必須是非空字串陣列`);
  return value.map((item) => (item as string).trim());
}

function assertSchemaEnvelope(
  value: Record<string, unknown>,
  required = true,
): void {
  if (required && value.schemaVersion !== 1)
    throw new Error("匯入資料缺少 schemaVersion 1");
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1)
    throw new Error("只支援 schemaVersion 1");
  if (
    value.batch !== undefined &&
    (typeof value.batch !== "number" ||
      !Number.isInteger(value.batch) ||
      value.batch < 1)
  )
    throw new Error("batch 必須是正整數");
}

function questionDifficulty(
  value: unknown,
  index: number,
  allowedDifficulty?: QuestionDifficulty,
): QuestionDifficulty {
  if (value === 1 || value === 2 || value === 3) {
    if (allowedDifficulty === undefined || value === allowedDifficulty)
      return value;
  }
  if (allowedDifficulty !== undefined)
    throw new Error(
      `第 ${index + 1} 題 difficulty 必須是 ${allowedDifficulty}`,
    );
  throw new Error(`第 ${index + 1} 題缺少有效 difficulty`);
}

function childQuestionId(question: Omit<ReadingChildQuestion, "id">): string {
  return `child-${canonicalHash(question)}`;
}

function normalizeSense(
  value: unknown,
  wordKey: WordKey,
  index: number,
): WordSense {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`第 ${index + 1} 個詞義格式錯誤`);
  const source = value as Record<string, unknown>;
  assertKnownKeys(
    source,
    ["id", "pos", "meaningZh", "examples", "supplementary", "description"],
    `senses[${index}]`,
  );
  const rawPos = requiredText(source.pos, `senses[${index}].pos`);
  const pos = normalizePartOfSpeech(rawPos);
  if (!pos) throw new Error(`senses[${index}].pos 不是支援的詞性`);
  const meaningZh = requiredText(
    source.meaningZh,
    `senses[${index}].meaningZh`,
  );
  const examples = source.examples;
  if (!Array.isArray(examples))
    throw new Error(`senses[${index}].examples 格式錯誤`);
  if (!examples.every((example) => typeof example === "string"))
    throw new Error(`senses[${index}].examples 格式錯誤`);
  if (typeof source.supplementary !== "boolean")
    throw new Error(`senses[${index}].supplementary 格式錯誤`);
  if (source.description !== undefined && typeof source.description !== "string")
    throw new Error(`senses[${index}].description 格式錯誤`);
  const id = requiredText(source.id, `senses[${index}].id`);
  const expectedId = buildSenseId(wordKey, pos, meaningZh);
  if (id !== expectedId)
    throw new Error(`senses[${index}].id 與 wordKey、pos、meaningZh 不一致`);
  return {
    id: expectedId,
    pos,
    meaningZh,
    examples: examples.map((example) => example.trim()).filter(Boolean),
    supplementary: source.supplementary,
    ...senseDescription(source.description),
  };
}

function normalizeWord(value: unknown, index: number): WordEntry {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`第 ${index + 1} 個單字格式錯誤`);
  const source = value as Record<string, unknown>;
  assertKnownKeys(
    source,
    ["wordKey", "word", "senses", "updatedAt"],
    `words[${index}]`,
  );
  const word = requiredText(source.word, `words[${index}].word`);
  const rawWordKey = requiredText(source.wordKey, `words[${index}].wordKey`);
  const wordKey = normalizeWordKey(rawWordKey);
  if (!isSetWordKey(wordKey) && wordKey !== normalizeWordKey(word))
    throw new Error(`words[${index}].wordKey 必須與 word 相符`);
  const rawSenses = source.senses;
  if (!Array.isArray(rawSenses))
    throw new Error(`第 ${index + 1} 個單字的 senses 格式錯誤`);
  if (!rawSenses.length) throw new Error(`第 ${index + 1} 個單字缺少 senses`);
  const senses = rawSenses.map((sense, senseIndex) =>
    normalizeSense(sense, wordKey, senseIndex),
  );
  if (new Set(senses.map((sense) => sense.id)).size !== senses.length)
    throw new Error(`第 ${index + 1} 個單字包含重複 sense`);
  return {
    wordKey,
    word,
    senses,
    updatedAt: requiredText(source.updatedAt, `words[${index}].updatedAt`),
  };
}

function sourceRef(
  value: Record<string, unknown>,
  index: number,
  refs?: QuestionSourceRefs,
): QuestionSourceRef | null {
  if (!refs) {
    if (value.sourceRef !== undefined)
      throw new Error(`第 ${index + 1} 題不應包含 sourceRef`);
    return null;
  }
  const key = text(value.sourceRef);
  if (!key || !refs[key])
    throw new Error(`第 ${index + 1} 題缺少有效 sourceRef`);
  return refs[key];
}

function assertEnglish(value: string, field: string, requireEnglish = false) {
  if (requireEnglish && containsHan(value))
    throw new Error(`${field} 必須使用英文`);
}

/** The two single-sentence formats: 詞彙題 and 文法題. */
function readQuestionStyle(value: unknown, index: number): QuestionStyle {
  if (value === "vocabulary" || value === "grammar") return value;
  throw new Error(`第 ${index + 1} 題缺少題型`);
}

function readPassageFormat(value: unknown, index: number): PassageFormat {
  if (
    value === "reading" ||
    value === "cloze" ||
    value === "wordBank" ||
    value === "discourse"
  )
    return value;
  throw new Error(`第 ${index + 1} 題的題組格式無效`);
}

function assertGeneratedIdentity(
  value: Record<string, unknown>,
  index: number,
): void {
  const generatedOnlyKeys = [
    "id",
    "fingerprint",
    "createdAt",
    "updatedAt",
    "wordKey",
    "senseId",
  ];
  const present = generatedOnlyKeys.filter((key) => value[key] !== undefined);
  if (present.length)
    throw new Error(
      `第 ${index + 1} 題 AI 回覆不可包含正式身份欄位：${present.join("、")}`,
    );
}

function generatedQuestionId(
  value: unknown,
  refs?: QuestionSourceRefs,
): string {
  return refs
    ? buildQuestionId()
    : buildQuestionId(requiredText(value, "question.id"));
}

function generatedTimestamp(
  value: unknown,
  generatedAt: string,
  refs?: QuestionSourceRefs,
): string {
  return refs ? generatedAt : requiredText(value, "question.timestamp");
}

function normalizeMultipleChoice(
  value: Record<string, unknown>,
  index: number,
  refs?: QuestionSourceRefs,
  allowedDifficulty?: QuestionDifficulty,
  expectedQuestionStyle?: QuestionStyle,
  requireEnglish = false,
): MultipleChoiceQuestion {
  assertKnownKeys(
    value,
    [
      "id",
      "fingerprint",
      "wordKey",
      "senseId",
      "sourceRef",
      "difficulty",
      "explanation",
      "createdAt",
      "updatedAt",
      "kind",
      "questionStyle",
      "prompt",
      "options",
      "answerIndex",
      "trap",
      "whyWrong",
    ],
    `questions[${index}]`,
  );
  if (refs) assertGeneratedIdentity(value, index);
  const prompt = requiredText(value.prompt, `questions[${index}].prompt`);
  const options = stringList(value.options, `questions[${index}].options`);
  const answerIndex =
    typeof value.answerIndex === "number" ? value.answerIndex : Number.NaN;
  if (options.length !== 4 || !isValidAnswerIndex(options.length, answerIndex))
    throw new Error(`第 ${index + 1} 題選擇題資料不完整`);
  const questionStyle = readQuestionStyle(value.questionStyle, index);
  if (expectedQuestionStyle && questionStyle !== expectedQuestionStyle)
    throw new Error(`第 ${index + 1} 題題型必須是 ${expectedQuestionStyle}`);
  if (questionPromptIssue(questionStyle, prompt))
    throw new Error(`第 ${index + 1} 題題幹必須且只能包含一個 _____`);
  assertEnglish(prompt, `第 ${index + 1} 題題幹`, requireEnglish);
  for (const [optionIndex, option] of options.entries())
    assertEnglish(
      option,
      `第 ${index + 1} 題選項 ${optionIndex + 1}`,
      requireEnglish,
    );
  const resolvedSource = sourceRef(value, index, refs);
  const wordKey =
    resolvedSource?.wordKey ??
    normalizeWordKey(
      value.wordKey === undefined
        ? ""
        : requiredText(value.wordKey, `questions[${index}].wordKey`),
    );
  const senseId = asSenseId(
    resolvedSource?.senseId ??
      (value.senseId === undefined
        ? ""
        : requiredText(value.senseId, `questions[${index}].senseId`)),
  );
  if (!wordKey || !senseId)
    throw new Error(`第 ${index + 1} 題必須綁定 wordKey 與 senseId`);
  const trap = optionalText(value.trap, `questions[${index}].trap`);
  const explanation = optionalText(
    value.explanation,
    `questions[${index}].explanation`,
  );
  const whyWrong = readWhyWrong(value.whyWrong, `questions[${index}].whyWrong`);
  const content: Omit<
    MultipleChoiceQuestion,
    "id" | "fingerprint" | "createdAt" | "updatedAt"
  > = {
    kind: "multipleChoice",
    wordKey,
    senseId,
    difficulty: questionDifficulty(value.difficulty, index, allowedDifficulty),
    questionStyle,
    prompt,
    options,
    answerIndex,
    explanation,
    trap,
    whyWrong,
  };
  const fingerprint = buildQuestionFingerprint(content);
  const now = new Date().toISOString();
  return {
    ...content,
    id: generatedQuestionId(value.id, refs),
    fingerprint,
    createdAt: generatedTimestamp(value.createdAt, now, refs),
    updatedAt: generatedTimestamp(value.updatedAt, now, refs),
  };
}

function readWhyWrong(
  value: unknown,
  field: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !Object.values(value).every((item) => typeof item === "string")
  )
    throw new Error(`${field} 格式錯誤`);
  return value as Record<string, string>;
}

function normalizeReading(
  value: Record<string, unknown>,
  index: number,
  refs?: QuestionSourceRefs,
  allowedDifficulty?: QuestionDifficulty,
  requireEnglish = false,
): ReadingPack {
  assertKnownKeys(
    value,
    [
      "id",
      "fingerprint",
      "difficulty",
      "explanation",
      "createdAt",
      "updatedAt",
      "kind",
      "format",
      "title",
      "passage",
      "wordKeys",
      "questions",
      "optionBank",
    ],
    `questions[${index}]`,
  );
  if (refs) assertGeneratedIdentity(value, index);
  const format = readPassageFormat(value.format, index);
  const spec = PASSAGE_FORMATS[format];
  const optionBank =
    value.optionBank === undefined
      ? undefined
      : stringList(value.optionBank, `questions[${index}].optionBank`);
  if (
    spec.sharedBank &&
    (!optionBank || optionBank.length !== spec.optionCount)
  )
    throw new Error(
      `第 ${index + 1} 題必須提供 ${spec.optionCount} 個共用選項`,
    );
  if (!spec.sharedBank && optionBank)
    throw new Error(`第 ${index + 1} 題不該有共用選項`);
  const title = requiredText(value.title, `questions[${index}].title`);
  const passage = requiredText(value.passage, `questions[${index}].passage`);
  assertEnglish(title, `第 ${index + 1} 題標題`, requireEnglish);
  assertEnglish(passage, `第 ${index + 1} 題文章`, requireEnglish);
  const rawWordKeys = stringList(
    value.wordKeys,
    `questions[${index}].wordKeys`,
  );
  const wordKeys = rawWordKeys.map((wordKey) => {
    if (!refs) return normalizeWordKey(wordKey);
    const source = refs[wordKey];
    if (!source) throw new Error(`第 ${index + 1} 題包含未知 sourceRef`);
    return source.wordKey;
  });
  if (new Set(wordKeys).size !== wordKeys.length)
    throw new Error(`第 ${index + 1} 題 wordKeys 不可重複`);
  const rawQuestions = value.questions;
  if (!Array.isArray(rawQuestions))
    throw new Error(`第 ${index + 1} 題 questions 格式錯誤`);
  if (!wordKeys.length || !rawQuestions.length)
    throw new Error(`第 ${index + 1} 題閱讀資料不完整`);
  const childIds = new Set<string>();
  const questions = rawQuestions.map((item, childIndex) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`閱讀題 ${childIndex + 1} 格式錯誤`);
    const child = item as Record<string, unknown>;
    assertKnownKeys(
      child,
      [
        "id",
        "kind",
        "blank",
        "sourceRef",
        "prompt",
        "options",
        "answerIndex",
        "wordKey",
        "senseId",
        "explanation",
        "whyWrong",
      ],
      `reading.questions[${childIndex}]`,
    );
    if (refs) assertGeneratedIdentity(child, childIndex);
    if (child.kind !== "multipleChoice")
      throw new Error(`閱讀題 ${childIndex + 1} 必須是 multipleChoice`);
    const prompt = requiredText(
      child.prompt,
      `reading.questions[${childIndex}].prompt`,
    );
    const options = stringList(
      child.options,
      `reading.questions[${childIndex}].options`,
    );
    const answerIndex =
      typeof child.answerIndex === "number" ? child.answerIndex : Number.NaN;
    if (
      options.length !== spec.optionCount ||
      !isValidAnswerIndex(options.length, answerIndex)
    )
      throw new Error(`第 ${childIndex + 1} 小題選項資料不完整`);
    if (
      spec.sharedBank &&
      optionBank &&
      options.some((option, at) => option !== optionBank[at])
    )
      throw new Error(`第 ${childIndex + 1} 小題必須使用共用選項`);
    assertEnglish(prompt, `閱讀題 ${childIndex + 1} 題幹`, requireEnglish);
    for (const [optionIndex, option] of options.entries())
      assertEnglish(
        option,
        `閱讀題 ${childIndex + 1} 選項 ${optionIndex + 1}`,
        requireEnglish,
      );
    const resolvedSource = sourceRef(child, childIndex, refs);
    const wordKey =
      resolvedSource?.wordKey ??
      normalizeWordKey(
        child.wordKey === undefined
          ? ""
          : requiredText(
              child.wordKey,
              `reading.questions[${childIndex}].wordKey`,
            ),
      );
    const senseId = asSenseId(
      resolvedSource?.senseId ??
        (child.senseId === undefined
          ? ""
          : requiredText(
              child.senseId,
              `reading.questions[${childIndex}].senseId`,
            )),
    );
    if (!wordKey || !senseId)
      throw new Error(`閱讀題 ${childIndex + 1} 必須綁定 wordKey 與 senseId`);
    const normalized: Omit<ReadingChildQuestion, "id"> = {
      kind: "multipleChoice",
      ...(spec.blanks ? { blank: childIndex + 1 } : {}),
      prompt,
      options,
      answerIndex,
      wordKey,
      senseId,
      explanation: optionalText(
        child.explanation,
        `reading.questions[${childIndex}].explanation`,
      ),
      whyWrong: readWhyWrong(
        child.whyWrong,
        `reading.questions[${childIndex}].whyWrong`,
      ),
    };
    const id = refs
      ? childQuestionId(normalized)
      : requiredText(child.id, `reading.questions[${childIndex}].id`);
    if (childIds.has(id))
      throw new Error(`閱讀題 ${childIndex + 1} id 不可重複`);
    childIds.add(id);
    return { ...normalized, id };
  });
  const blankIssue = passageBlankIssue(format, passage, questions.length);
  if (blankIssue) throw new Error(`第 ${index + 1} 題${blankIssue}`);
  if (spec.sharedBank) {
    const answers = questions.map((child) => child.answerIndex);
    if (new Set(answers).size !== answers.length)
      throw new Error(`第 ${index + 1} 題共用選項每個只能用一次`);
  }
  const content: Omit<
    ReadingPack,
    "id" | "fingerprint" | "createdAt" | "updatedAt"
  > = {
    kind: "reading",
    format,
    ...(optionBank ? { optionBank } : {}),
    difficulty: questionDifficulty(value.difficulty, index, allowedDifficulty),
    explanation: optionalText(
      value.explanation,
      `questions[${index}].explanation`,
    ),
    title,
    passage,
    wordKeys,
    questions,
  };
  const fingerprint = buildQuestionFingerprint(content);
  const now = new Date().toISOString();
  return {
    ...content,
    id: generatedQuestionId(value.id, refs),
    fingerprint,
    createdAt: generatedTimestamp(value.createdAt, now, refs),
    updatedAt: generatedTimestamp(value.updatedAt, now, refs),
  };
}

function normalizeQuestion(
  value: unknown,
  index: number,
  refs?: QuestionSourceRefs,
  allowedDifficulty?: QuestionDifficulty,
  expectedQuestionKind?: "multipleChoice" | "reading",
  expectedQuestionStyle?: QuestionStyle,
  requireEnglish = false,
): LibraryQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`第 ${index + 1} 題格式錯誤`);
  const source = value as Record<string, unknown>;
  if (expectedQuestionKind && source.kind !== expectedQuestionKind)
    throw new Error(`第 ${index + 1} 題類型不符合目前生成設定`);
  if (source.kind === "reading")
    return normalizeReading(
      source,
      index,
      refs,
      allowedDifficulty,
      requireEnglish,
    );
  if (source.kind !== "multipleChoice")
    throw new Error(`第 ${index + 1} 題必須是 multipleChoice 或 reading`);
  return normalizeMultipleChoice(
    source,
    index,
    refs,
    allowedDifficulty,
    expectedQuestionStyle,
    requireEnglish,
  );
}

export type LibraryImportPayload =
  | { kind: "words"; words: WordEntry[] }
  | { kind: "questions"; questions: LibraryQuestion[] };

export interface LibraryImportOptions {
  questionSources?: QuestionSourceRefs;
  allowedDifficulty?: QuestionDifficulty;
  expectedQuestionKind?: "multipleChoice" | "reading";
  expectedQuestionStyle?: QuestionStyle;
  requireEnglish?: boolean;
}

export type LibraryImportResult =
  { valid: true; data: LibraryImportPayload } | { valid: false; error: string };

function normalizeLibraryImportValue(
  parsedValue: unknown,
  options: LibraryImportOptions,
): LibraryImportPayload {
  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue)
  )
    throw new Error("匯入資料必須是 object");
  const parsed = parsedValue as Record<string, unknown>;
  assertSchemaEnvelope(parsed, !options.questionSources);
  if (parsed.kind === "words") {
    assertKnownKeys(
      parsed,
      ["kind", "schemaVersion", "batch", "words"],
      "匯入資料",
    );
    if (!Array.isArray(parsed.words))
      throw new Error("找不到有效的 words 陣列");
    return { kind: "words", words: parsed.words.map(normalizeWord) };
  }
  if (parsed.kind === "questions") {
    assertKnownKeys(
      parsed,
      ["kind", "schemaVersion", "batch", "questions"],
      "匯入資料",
    );
    if (!Array.isArray(parsed.questions))
      throw new Error("找不到有效的 questions 陣列");
    const requireEnglish = options.requireEnglish ?? true;
    return {
      kind: "questions",
      questions: parsed.questions.map((question, index) =>
        normalizeQuestion(
          question,
          index,
          options.questionSources,
          options.allowedDifficulty,
          options.expectedQuestionKind,
          options.expectedQuestionStyle,
          requireEnglish,
        ),
      ),
    };
  }
  throw new Error("找不到 words 或 questions");
}

export function parseLibraryImportValue(
  value: unknown,
  options: LibraryImportOptions = {},
): LibraryImportResult {
  try {
    return { valid: true, data: normalizeLibraryImportValue(value, options) };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "JSON 格式錯誤",
    };
  }
}

export function parseLibraryImport(
  textValue: string,
  options: LibraryImportOptions = {},
): LibraryImportResult {
  try {
    return parseLibraryImportValue(JSON.parse(textValue.trim()), options);
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "JSON 格式錯誤",
    };
  }
}
