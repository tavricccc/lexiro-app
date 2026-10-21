// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
const PART_OF_SPEECH_ALIASES: Record<string, string> = {
  n: "n.",
  "n.": "n.",
  noun: "n.",
  v: "v.",
  "v.": "v.",
  verb: "v.",
  adj: "adj.",
  "adj.": "adj.",
  adjective: "adj.",
  adv: "adv.",
  "adv.": "adv.",
  adverb: "adv.",
  pron: "pron.",
  "pron.": "pron.",
  pronoun: "pron.",
  prep: "prep.",
  "prep.": "prep.",
  preposition: "prep.",
  conj: "conj.",
  "conj.": "conj.",
  conjunction: "conj.",
  interj: "interj.",
  "interj.": "interj.",
  interjection: "interj.",
  det: "det.",
  "det.": "det.",
  determiner: "det.",
  aux: "aux.",
  "aux.": "aux.",
  auxiliary: "aux.",
  "modal v": "modal v.",
  "modal v.": "modal v.",
  "modal verb": "modal v.",
  "phr v": "phr. v.",
  "phr. v.": "phr. v.",
  "phrasal verb": "phr. v.",
  phr: "phr.",
  "phr.": "phr.",
  phrase: "phr.",
};

/** Canonical part-of-speech values that normalizePartOfSpeech can return. */
export const SUPPORTED_PARTS_OF_SPEECH: readonly string[] = [
  ...new Set(Object.values(PART_OF_SPEECH_ALIASES)),
];

export function normalizePartOfSpeech(pos: string): string {
  const normalized = pos.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return PART_OF_SPEECH_ALIASES[normalized] ?? "";
}

export function createSourceRef(index: number): string { return "source-" + (index + 1); }

export interface WordGenerationSource {
  sourceRef: string;
  word: string;
  posHint?: string;
  hint?: string;
  raw: string;
}

const POS_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:phrasal\s+verb|phr\.?\s+v\.?)\b/iu, "phr. v."],
  [/\b(?:modal\s+verb|modal\s+v\.?)\b/iu, "modal v."],
  [/\b(?:adjective|adj\.?)\b/iu, "adj."],
  [/\b(?:adverb|adv\.?)\b/iu, "adv."],
  [/\b(?:pronoun|pron\.?)\b/iu, "pron."],
  [/\b(?:preposition|prep\.?)\b/iu, "prep."],
  [/\b(?:conjunction|conj\.?)\b/iu, "conj."],
  [/\b(?:interjection|interj\.?)\b/iu, "interj."],
  [/\b(?:determiner|det\.?)\b/iu, "det."],
  [/\b(?:auxiliary|aux\.?)\b/iu, "aux."],
  [/\b(?:noun|n\.?)\b/iu, "n."],
  [/\b(?:verb|v\.?)\b/iu, "v."],
  [/\b(?:phrase|phr\.?)\b/iu, "phr."],
  [/(?:片語動詞|動詞片語)/u, "phr. v."],
  [/(?:情態動詞)/u, "modal v."],
  [/(?:形容詞)/u, "adj."],
  [/(?:副詞)/u, "adv."],
  [/(?:代名詞|代詞)/u, "pron."],
  [/(?:介系詞|介詞)/u, "prep."],
  [/(?:連接詞|連詞)/u, "conj."],
  [/(?:感嘆詞)/u, "interj."],
  [/(?:限定詞)/u, "det."],
  [/(?:助動詞)/u, "aux."],
  [/(?:名詞)/u, "n."],
  [/(?:動詞)/u, "v."],
  [/(?:片語|詞組)/u, "phr."],
];

function extractSource(
  segment: string,
): Omit<WordGenerationSource, "sourceRef"> {
  const marker = POS_HINTS.map(([pattern, pos]) => {
    const match = pattern.exec(segment);
    return match?.index === undefined
      ? null
      : { index: match.index, pos, text: match[0] };
  })
    .filter((value): value is { index: number; pos: string; text: string } =>
      Boolean(value),
    )
    .sort((a, b) => a.index - b.index)[0];
  const wordRegion = marker ? segment.slice(0, marker.index) : segment;
  const match = wordRegion.match(
    /[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)*/u,
  );
  if (!match || match.index === undefined)
    return { word: "", raw: segment, hint: segment };

  const english = match[0].trim();
  const tokens = english.split(/\s+/u);
  let word = english;
  let posHint = marker?.pos ?? "";
  for (const length of [2, 1]) {
    if (tokens.length <= length) continue;
    const candidate = tokens.slice(-length).join(" ");
    const normalized = normalizePartOfSpeech(candidate);
    if (normalized) {
      word = tokens.slice(0, -length).join(" ");
      posHint = normalized;
      break;
    }
  }
  const before = segment.slice(0, match.index);
  const afterWord = segment.slice(match.index + word.length);
  let hint = `${before}${afterWord}`.replace(/^[\s.:：—–-]+/u, "").trim();
  if (posHint)
    hint = hint
      .replace(marker?.text ?? "", "")
      .replace(
        /^(?:(?:phrasal|modal)\s+verb|noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|auxiliary|phr(?:ase)?|modal\s+v|phr(?:\.?\s+)?v|n|v|adj|adv|pron|prep|conj|interj|det|aux)\.?\s*/iu,
        "",
      )
      .replace(
        /^(?:片語動詞|動詞片語|情態動詞|形容詞|副詞|代名詞|代詞|介系詞|介詞|連接詞|連詞|感嘆詞|限定詞|助動詞|名詞|動詞|片語|詞組)\s*/u,
        "",
      )
      .replace(/^[\s.:：—–-]+/u, "")
      .trim();
  return {
    word,
    raw: segment,
    ...(posHint ? { posHint } : {}),
    ...(hint ? { hint } : {}),
  };
}

export function buildWordGenerationSources(
  rawInput: string,
): WordGenerationSource[] {
  return rawInput
    .split(/[\r\n,，;；/／|、]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((raw, index) => ({
      sourceRef: createSourceRef(index),
      ...extractSource(raw),
    }))
    .filter((source) => Boolean(source.word));
}
