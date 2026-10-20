// Copied from lexiro/src/types/library.ts: the shapes the cloud records carry.
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type WordKey = Brand<string, "WordKey">;
export type SenseId = Brand<string, "SenseId">;

export interface WordSense {
  id: SenseId;
  pos: string;
  meaningZh: string;
  examples: string[];
  supplementary: boolean;
}

export interface WordEntry {
  wordKey: WordKey;
  word: string;
  senses: WordSense[];
  updatedAt: string;
}

export interface StudyWord {
  id: SenseId;
  wordKey: WordKey;
  word: string;
  pos: string;
  meaning: string;
  examples: string[];
}

export interface LibrarySet {
  id: string;
  setName: string;
  folderId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SetMembership {
  wordKey: WordKey;
  senseIds: SenseId[];
}

export interface VocabFolder {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Saved questions stay opaque until the app practises them. */
export interface LibraryQuestion {
  id: string;
  kind: string;
  [field: string]: unknown;
}

export interface LibraryState {
  words: Record<string, WordEntry>;
  sets: LibrarySet[];
  memberships: Record<string, SetMembership[]>;
  folders: VocabFolder[];
  questions: LibraryQuestion[];
}

export const EMPTY_LIBRARY: LibraryState = {
  words: {},
  sets: [],
  memberships: {},
  folders: [],
  questions: [],
};

export type CloudRecordType =
  | "folder"
  | "set"
  | "membership"
  | "word"
  | "question";

export interface CloudRecord {
  type: CloudRecordType;
  recordKey: string;
  deleted: boolean;
  updatedAt: string;
  payload: Record<string, unknown> | null;
}
