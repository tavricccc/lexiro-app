// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
/** Frontend and Worker use the same exam-format contract. */
export {
  SENTENCE_FORMATS,
  PASSAGE_FORMATS,
  READING_MIN_QUESTIONS,
  READING_MAX_QUESTIONS,
  PASSAGE_KINDS,
  SENTENCE_KINDS,
  isPassageKind,
  passageSpec,
  sensesPerRequest,
  blankToken,
  BLANK_TOKEN_PATTERN,
  SENTENCE_BLANK,
  countBlankTokens,
  blankTokenNumbers,
  type SentenceFormatSpec,
  type PassageFormatSpec,
} from "@/core/ai-contract";
