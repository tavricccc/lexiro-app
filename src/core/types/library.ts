// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { Brand } from './brand'

/**
 * A checked word identity. Persisted Library keys include the owning set;
 * normalized spellings are used only while preparing or migrating material.
 * `buildSetWordKey` creates the persisted identity from a set and its spelling.
 */
export type WordKey = Brand<string, 'WordKey'>

/**
 * Identifies one meaning of one word. It keys FSRS scheduling and question
 * statistics, so it must never be confused with a word key or with a composite
 * key built from one.
 */
export type SenseId = Brand<string, 'SenseId'>

export type QuestionDifficulty = 1 | 2 | 3
export type QuestionCreateChoice = 'question' | 'reading'
export type VocabularyDifficultyFilter = 'all' | '1' | '2' | '3'

/**
 * Persisted single-sentence records. grammar is retained only for historical
 * backups; it is excluded from authoring, the bank and practice.
 */
export type QuestionStyle = 'vocabulary' | 'grammar'

/**
 * Passage formats, named for the 學測 sections they model. `reading` asks about
 * the passage; the other three cut blanks into it.
 */
export type PassageFormat = 'reading' | 'cloze' | 'wordBank' | 'discourse'

/** What the generator can be asked to produce. */
export type GeneratedQuestionKind = 'vocabulary' | PassageFormat

export type VocabularyQuestionTypeFilter = 'all' | QuestionStyle | PassageFormat

export interface WordSense {
  id: SenseId
  pos: string
  meaningZh: string
  examples: string[]
  /**
   * Whether this meaning came from 補充多義 rather than from the source the word
   * was created from. It is what lets the interface say so, and it is stated on
   * every sense: a meaning whose origin is unrecorded would read as original,
   * which is the more confident of the two claims.
   */
  supplementary: boolean
  /**
   * Textbook notes on this meaning: usage, register, collocations. Kept apart
   * from meaningZh so a word task can show it after the answer without the
   * prompt or the options giving the answer away. Absent when there is none.
   */
  description?: string
}

export interface SenseEditValue {
  pos: string
  meaningZh: string
  examples: string[]
}

export interface WordEntry {
  wordKey: WordKey
  word: string
  senses: WordSense[]
  updatedAt: string
}

export interface StudyWord {
  id: SenseId
  wordKey: WordKey
  word: string
  pos: string
  meaning: string
  examples: string[]
  example: string
  supplementary: boolean
  description: string
}

export interface LibrarySet {
  id: string
  setName: string
  folderId: string
  /**
   * Where the person placed this set among the others in its folder, lowest
   * first. Absent until that folder is first reordered by hand.
   */
  order?: number
  createdAt: string
  updatedAt: string
}

export interface SetMembership {
  wordKey: WordKey
  senseIds: SenseId[]
}

export interface VocabFolder {
  id: string
  name: string
  parentId?: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface LibraryQuestionBase {
  id: string
  fingerprint: string
  difficulty: QuestionDifficulty
  explanation?: string
  createdAt: string
  updatedAt: string
}

export interface MultipleChoiceQuestion extends LibraryQuestionBase {
  kind: 'multipleChoice'
  questionStyle: QuestionStyle
  wordKey: WordKey
  senseId: SenseId
  prompt: string
  options: string[]
  answerIndex: number
  trap?: string
  whyWrong?: Record<string, string>
}

export interface ReadingChildQuestion {
  id: string
  kind: 'multipleChoice'
  /** For blank formats, the 1-based blank this item fills. */
  blank?: number
  prompt: string
  options: string[]
  answerIndex: number
  wordKey: WordKey
  senseId: SenseId
  explanation?: string
  whyWrong?: Record<string, string>
}

/**
 * One passage and the items hanging off it. The four 學測 passage sections
 * share this record because they differ only in how the options are offered:
 * `reading` asks questions about the passage, `cloze` gives every blank its own
 * four options, and `wordBank` / `discourse` draw every blank from one
 * `optionBank` in which each entry may be used at most once.
 */
export interface ReadingPack extends LibraryQuestionBase {
  kind: 'reading'
  format: PassageFormat
  title: string
  passage: string
  wordKeys: WordKey[]
  questions: ReadingChildQuestion[]
  optionBank?: string[]
}

export type LibraryQuestion = MultipleChoiceQuestion | ReadingPack

export interface LibraryState {
  version: number
  words: Record<WordKey, WordEntry>
  sets: LibrarySet[]
  memberships: Record<string, SetMembership[]>
  folders: VocabFolder[]
  questions: LibraryQuestion[]
  updatedAt: string
}
