// React Native override (kept by sync-core): the draft types of the web's
// reading-child-editor.tsx, which the shared reading-form imports.
export interface ReadingChildDraft {
  answerIndex: number;
  id?: string;
  options: string[];
  prompt: string;
  source: string;
  blank?: number;
  explanation?: string;
  whyWrong?: Record<string, string>;
}

export interface ReadingChildErrors {
  options?: string;
  prompt?: string;
  source?: string;
}
