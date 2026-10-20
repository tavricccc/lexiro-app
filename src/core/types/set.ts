// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { GeneratedQuestionKind, QuestionDifficulty } from './library'

export type PracticeQuestionType = GeneratedQuestionKind
export type PracticeDifficulty = QuestionDifficulty | 'all'

export interface PracticeQuestion {
  questionId: string
  questionType: PracticeQuestionType
  difficulty: QuestionDifficulty
  prompt: string
  options: string[]
  answerIndex: number
}

export interface EditorItem {
  id: string
  word: string
  senses: EditorSenseDraft[]
}

export interface EditorSenseDraft {
  id: string
  pos: string
  meaning: string
  examples: string[]
  /** Carried through every edit so a supplemented meaning stays marked as one. */
  supplementary: boolean
}

export interface WordDraft {
  word: string
  senses: EditorSenseDraft[]
}
