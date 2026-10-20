// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { z } from "zod";

/**
 * The set editor's form shape lives apart from its markup so the word rows can
 * be typed against it without importing the page component.
 */
const wordSchema = z.object({
  word: z.string().trim().min(1),
  pos: z.string().trim().min(1),
  meaningZh: z.string().trim().min(1),
  examples: z.array(z.string()),
  supplementary: z.boolean(),
});

export const setFormSchema = z.object({
  setName: z.string().trim().min(1),
  words: z.array(wordSchema).min(1),
});

export type SetFormValues = z.infer<typeof setFormSchema>;

export const emptyWord = {
  examples: [""],
  meaningZh: "",
  pos: "",
  supplementary: false,
  word: "",
};
