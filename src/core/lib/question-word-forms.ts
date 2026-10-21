// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import nlp from "compromise";
import { normalizePartOfSpeech } from "@/core/ai-contract";

// Standard alternatives the inflector misses or resolves to a different verb.
// These are inflections, not a suffix-based word-family or synonym lookup.
const VERB_VARIANTS: Record<string, readonly string[]> = {
  am: ["be"],
  is: ["be"],
  are: ["be"],
  was: ["be"],
  were: ["be"],
  been: ["be"],
  being: ["be"],
  could: ["can"],
  might: ["may"],
  should: ["shall"],
  would: ["will"],
  lay: ["lie"],
  lain: ["lie"],
  abode: ["abide"],
  bidden: ["bid"],
  born: ["bear"],
  borne: ["bear"],
  dwelt: ["dwell"],
  shrunken: ["shrink"],
  woke: ["wake"],
  burnt: ["burn"],
  dreamt: ["dream"],
  leant: ["lean"],
  leapt: ["leap"],
  learnt: ["learn"],
  smelt: ["smell"],
  spelt: ["spell"],
  spilt: ["spill"],
  spoilt: ["spoil"],
  focussed: ["focus"],
  focussing: ["focus"],
  panicking: ["panic"],
};

const SPELLING_VARIANTS: Record<string, string> = {
  analyse: "analyze",
  organise: "organize",
  recognise: "recognize",
  realise: "realize",
  specialise: "specialize",
  apologise: "apologize",
  prioritise: "prioritize",
  colour: "color",
  colourful: "colorful",
  labour: "labor",
  favour: "favor",
  favourite: "favorite",
  honour: "honor",
  neighbour: "neighbor",
  centre: "center",
  fulfil: "fulfill",
};

// The inflector folds Latin accents; this comparison never rewrites the stored
// source, supplied usage, answer text, or the actual span we cut.
const spelling = (word: string): string =>
  (SPELLING_VARIANTS[word] ?? word).normalize("NFD").replace(/\p{M}/gu, "");
const normalized = (text: string): string =>
  text.trim().toLocaleLowerCase().replaceAll("’", "'");
const tokens = (text: string): string[] =>
  normalized(text).match(/\p{L}+(?:['-]\p{L}+)*/gu) ?? [];
// Dictionary slot markers: sb/sth, one's, and grammar slots such as V-ing.
const placeholder = (word: string): boolean =>
  /^(?:sb|sth|somebody|someone|something)(?:'s)?$/.test(word) ||
  /^(?:one's|v|v-ing|ving|v-ed|ved|n|adj|adv)$/.test(word);
const REFLEXIVES = new Set([
  "myself",
  "yourself",
  "himself",
  "herself",
  "itself",
  "ourselves",
  "yourselves",
  "themselves",
]);

/** A source POS describes the taught sense, not every legal use of its lemma. */
function hasWordForm(source: string, surface: string, posHint = ""): boolean {
  const word = spelling(normalized(source));
  const candidate = spelling(normalized(surface));
  if (candidate === word) return true;
  if (word === "oneself") return REFLEXIVES.has(candidate);

  if (!/\s/.test(candidate)) {
    if (VERB_VARIANTS[candidate]?.includes(word)) return true;
    const verb = nlp(candidate);
    verb.tag("Verb");
    if (spelling(verb.verbs().toInfinitive().text()) === word) return true;
    const noun = nlp(candidate.replace(/'s$|(?<=s)'$/, ""));
    noun.tag("Noun");
    if (spelling(noun.nouns().toSingular().text()) === word) return true;

    // Forward inflection covers regular forms omitted by reverse analysis.
    // Do not take a guessed
    // infinitive (e.g. found -> find) as proof of source ownership.
    const sourceVerb = nlp(word);
    sourceVerb.tag("Verb");
    if (
      sourceVerb
        .verbs()
        .conjugate()
        .some((forms) => {
          const inflections = forms as Record<string, string>;
          return (
            spelling(inflections.Infinitive) === word &&
            Object.values(inflections).some(
              (form) => spelling(form) === candidate,
            )
          );
        })
    )
      return true;
  }

  const adjective = nlp(word);
  // A forced adjective tag turns rescue into "rescuer". A known adjective or
  // the taught adjective/adverb sense can establish its comparison forms;
  // it never restricts noun/verb inflections checked above.
  if (
    !["adj.", "adv."].includes(posHint) &&
    !adjective.has("#Adjective") &&
    !adjective.has("#Adverb")
  )
    return false;
  adjective.tag("Adjective");
  return (
    candidate === `more ${word}` ||
    candidate === `most ${word}` ||
    candidate === adjective.adjectives().toComparative().text() ||
    candidate === adjective.adjectives().toSuperlative().text()
  );
}

/** Checks only the model's named, already located usage; never guesses a span. */
function hasPhraseUsage(source: string[], usage: string[]): boolean {
  const fixed = source.filter((word) => !placeholder(word));
  if (source.some(placeholder)) {
    // Argument frames can use an object, possessive, or a that-clause. Their
    // exact grammar and taught sense remain review work, not an NLP POS gate.
    return usage.some((word) => hasWordForm(fixed[0], word));
  }
  let cursor = 0;
  for (const expected of fixed) {
    const next = usage.findIndex(
      (word, index) => index >= cursor && hasWordForm(expected, word),
    );
    if (next < 0) return false;
    cursor = next + 1;
  }
  return true;
}

/**
 * Readings of a dictionary entry: parenthesized parts such as "(of...)" are
 * optional, and slash alternatives such as "get/be used to" or "a/an" each
 * form a complete entry on their own.
 */
function entryReadings(source: string): string[] {
  const bare = source.replace(/\([^)]*\)/gu, " ").trim() || source;
  let readings = [""];
  for (const part of bare.split(/\s+/u)) {
    const choices = part.includes("/") ? part.split("/").filter(Boolean) : [part];
    readings = readings
      .flatMap((reading) => choices.map((choice) => `${reading} ${choice}`))
      .slice(0, 16);
  }
  return readings.map((reading) => reading.trim());
}

/** Messages are Chinese for the app; the Agent contract asks for English. */
export function sourceWordFormIssue(
  source: string,
  pos: string,
  answer: string,
  usage?: string,
  language: "zh" | "en" = "zh",
): string | null {
  let first: string | null = null;
  for (const reading of entryReadings(source)) {
    const issue = readingIssue(source, reading, pos, answer, usage, language);
    if (!issue) return null;
    first ??= issue;
  }
  return first;
}

function readingIssue(
  source: string,
  reading: string,
  pos: string,
  answer: string,
  usage: string | undefined,
  language: "zh" | "en",
): string | null {
  const sourceWords = tokens(reading);
  const candidate = normalized(answer);
  const answerWords = tokens(candidate);
  const fixedSource = sourceWords.filter((word) => !placeholder(word));
  const related =
    sourceWords.length === 1
      ? hasWordForm(sourceWords[0], candidate, normalizePartOfSpeech(pos)) ||
        (answerWords.length > 1 &&
          answerWords.some((part) =>
            hasWordForm(sourceWords[0], part, normalizePartOfSpeech(pos)),
          ))
      : usage
        ? fixedSource.some((word) =>
            answerWords.some((part) => hasWordForm(word, part)),
          )
        : fixedSource.some(
            (word, index) =>
              index === 0 &&
              answerWords.some((part) => hasWordForm(word, part)),
          ) ||
          (answerWords.length > 0 &&
            answerWords.every((part) =>
              fixedSource.some((word) => hasWordForm(word, part)),
            ));
  if (!related)
    return language === "en"
      ? `"${answer}" is not a form of the source "${source}"; use an inflection of the source itself, not a synonym or derived word`
      : `「${answer}」不是指定單字「${source}」的合法詞形；請保留來源單字，不要換成同義詞或衍生詞`;
  // Vocabulary and word-bank replies anchor a phrase with its complete
  // actual usage, even when the answer removes only a contiguous part.
  if (
    usage &&
    sourceWords.length > 1 &&
    !hasPhraseUsage(sourceWords, tokens(usage))
  )
    return language === "en"
      ? `usage "${usage}" does not contain the words of the source phrase "${source}"; keep every fixed word of the phrase (inflected forms are fine)`
      : `「${usage}」沒有保留來源片語「${source}」的組成；請使用實際詞形並保留片語中的字詞`;
  return null;
}
