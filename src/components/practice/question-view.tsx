import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";

import { AnswerOption, type OptionState } from "@/components/answer-option";
import { PassageText } from "@/components/rooms/passage-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Segmented } from "@/components/ui/segmented";
import { VerdictMark } from "@/components/ui/verdict-mark";
import {
  isCorrectChoice,
  isWordTask,
} from "@/core/components/practice/meaning-questions";
import {
  usedBlankForOption,
  type QuestionItem,
} from "@/core/components/practice/practice-content";
import { t } from "@/core/lib/i18n";
import { practiceTaskLabel } from "@/core/lib/practice-tasks";
import { speak } from "@/lib/speech";
import { colors, type } from "@/lib/theme";

export type AnsweredBlanks = Record<number, { answer: string }>;

type Pane = "question" | "passage";

/**
 * One practice question. A reading item gets the web's 題目 / 文章 switch so
 * the passage has the whole screen when it is read.
 */
export function QuestionView({
  item,
  selected,
  readOnly,
  answeredBlanks,
  onAnswer,
}: {
  item: QuestionItem;
  selected: number | null;
  /** An earlier question looked back at: it shows what was recorded. */
  readOnly: boolean;
  answeredBlanks: AnsweredBlanks;
  onAnswer: (choice: number) => void;
}) {
  const [pane, setPane] = useState<Pane>("question");
  const passage = item.question?.kind === "reading" ? item.question : null;
  const childIndex = passage?.questions.findIndex(
    (child) => item.id === `reading:${passage.id}:${child.id}`,
  );
  const answered = selected !== null;
  const wordTask = isWordTask(item.type);

  const optionState = (index: number): OptionState => {
    if (!answered) return "idle";
    if (isCorrectChoice(item, index)) return "right";
    return selected === index ? "wrong" : "dim";
  };

  return (
    <View style={styles.stack}>
      {passage ? (
        <Segmented
          options={[
            { value: "question", label: t("practice.questionTab") },
            { value: "passage", label: t("practice.passageTab") },
          ]}
          value={pane}
          onChange={setPane}
        />
      ) : null}

      {passage && pane === "passage" ? (
        <Animated.View key="passage" entering={swapIn} style={styles.stack}>
          <Card style={styles.passage}>
            <Text style={styles.passageTitle}>{passage.title}</Text>
            <PassageText
              passage={passage.passage}
              activeBlank={item.blank}
              answeredBlanks={Object.fromEntries(
                Object.entries(answeredBlanks).map(([blank, value]) => [
                  blank,
                  value.answer,
                ]),
              )}
            />
          </Card>
          <Button
            label={t("practice.backToQuestion")}
            icon="text.bubble"
            variant="ghost"
            onPress={() => setPane("question")}
          />
        </Animated.View>
      ) : (
        <Animated.View key="question" entering={swapIn} style={styles.stack}>
          <View style={styles.head}>
            <Text style={styles.task}>
              {passage && childIndex !== undefined && childIndex >= 0
                ? `${practiceTaskLabel(item.type)} · ${t(
                    "practice.questionPosition",
                    {
                      current: childIndex + 1,
                      total: passage.questions.length,
                    },
                  )}`
                : practiceTaskLabel(item.type)}
            </Text>
            <View style={styles.promptRow}>
              <Text
                selectable
                style={
                  wordTask
                    ? [
                        styles.wordPrompt,
                        item.type === "reverse" && styles.wordPromptZh,
                      ]
                    : styles.prompt
                }
              >
                {item.blank
                  ? t("questions.blankLabel", { index: item.blank })
                  : item.prompt}
              </Text>
              {item.type === "meaning" ? (
                <PressableScale
                  scaleTo={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t("practice.speak")}
                  hitSlop={10}
                  onPress={() => speak(item.prompt)}
                  style={styles.speak}
                >
                  <SymbolView
                    name="speaker.wave.2.fill"
                    size={18}
                    tintColor={colors.brand}
                  />
                </PressableScale>
              ) : null}
            </View>
            {item.blank ? (
              <Button
                label={t("practice.locateBlank", { index: item.blank })}
                icon="doc.text.magnifyingglass"
                variant="ghost"
                onPress={() => setPane("passage")}
              />
            ) : null}
            {item.optionBank ? (
              <Text style={styles.hint}>{t("practice.sharedBankHint")}</Text>
            ) : null}
          </View>

          <View style={styles.options}>
            {item.options.map((option, index) => {
              const used = usedBlankForOption(item, index, answeredBlanks);
              return (
                <AnswerOption
                  key={`${item.id}:${index}`}
                  label={
                    wordTask
                      ? option
                      : `${String.fromCharCode(65 + index)}  ${option}`
                  }
                  note={
                    used !== undefined && !answered
                      ? t("practice.usedInBlank", { index: used })
                      : undefined
                  }
                  state={optionState(index)}
                  disabled={readOnly || (used !== undefined && !answered)}
                  onPress={() => onAnswer(index)}
                />
              );
            })}
          </View>

          {readOnly && !answered ? (
            <Text style={styles.hint}>{t("practice.skippedNote")}</Text>
          ) : null}
          {answered ? <Feedback item={item} selected={selected} /> : null}
        </Animated.View>
      )}
    </View>
  );
}

const GLOSS_LIMIT = 16;

/** Splits a stored reason into an inline meaning and an optional short note. */
function splitOptionReason(reason: string): { gloss?: string; note?: string } {
  const text = reason.trim();
  // Older generations wrapped each meaning in a repeated "does not fit" clause.
  const legacy = /意為「([^」]+)」/.exec(text);
  if (legacy) return { gloss: legacy[1] };
  const [head, ...rest] = text.split("；");
  if (rest.length && head.length <= GLOSS_LIMIT)
    return { gloss: head, note: rest.join("；") };
  if (text.length <= GLOSS_LIMIT && !/[。，]/.test(text))
    return { gloss: text };
  return { note: text };
}

/** Option notes by display order; shared banks show only what each blank needs. */
function optionNotes(item: QuestionItem) {
  const group = item.question?.kind === "reading" ? item.question : null;
  const used = new Set(
    group?.questions.map((child) => child.options[child.answerIndex]) ?? [],
  );
  return item.options.flatMap((option, index) => {
    const reason = item.whyWrong?.[option];
    if (!reason || isCorrectChoice(item, index)) return [];
    // A discourse bank's own answers are explained at their blanks.
    if (item.type === "discourse" && used.has(option)) return [];
    const parts = splitOptionReason(reason);
    // Older word-bank sets carry nine long reasons per blank; keep the meanings.
    if (item.type === "wordBank" && !parts.gloss) return [];
    return [{ option, index, ...parts }];
  });
}

/** The verdict, the right answer and why, as on the web's feedback panel. */
function Feedback({
  item,
  selected,
}: {
  item: QuestionItem;
  selected: number;
}) {
  const correct = isCorrectChoice(item, selected);
  const notes = optionNotes(item);
  const answerMeaning =
    item.type === "vocabulary" || item.type === "wordBank" ? item.meaning : "";
  return (
    <Animated.View
      entering={FadeInDown.duration(230).easing(Easing.out(Easing.cubic))}
    >
      <Card style={styles.feedback}>
        <View style={styles.verdict}>
          <VerdictMark correct={correct} size={22} />
          <Text
            style={[
              styles.verdictText,
              { color: correct ? colors.success : colors.destructive },
            ]}
          >
            {correct ? t("practice.correct") : t("practice.incorrect")}
          </Text>
        </View>
        <Text style={styles.answer}>
          {item.type === "meaning"
            ? t("practice.answer", { answer: item.meaning })
            : t("practice.answer", { answer: item.options[item.answerIndex] })}
          {answerMeaning ? (
            <Text style={styles.gloss}>{`  ${answerMeaning}`}</Text>
          ) : null}
        </Text>
        {item.explanation ? (
          <Text style={styles.body}>{item.explanation}</Text>
        ) : null}
        {notes.length ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{t("practice.optionReasons")}</Text>
            {notes.map(({ option, index, gloss, note }) => (
              <View key={index} style={styles.note}>
                <Text style={styles.noteHead}>
                  <Text style={styles.noteLetter}>
                    {`${String.fromCharCode(65 + index)}  `}
                  </Text>
                  {option}
                  {gloss ? (
                    <Text style={styles.gloss}>{`  ${gloss}`}</Text>
                  ) : null}
                </Text>
                {note ? <Text style={styles.noteBody}>{note}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  passage: { gap: 12 },
  passageTitle: { ...type.section, color: colors.foreground },
  head: { gap: 14 },
  task: { ...type.hint, fontWeight: "600", color: colors.brand, marginTop: 8 },
  promptRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  wordPrompt: {
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.foreground,
    flexShrink: 1,
  },
  wordPromptZh: { fontSize: 30, letterSpacing: -0.4 },
  prompt: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 30,
    fontWeight: "600",
    color: colors.foreground,
  },
  speak: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  hint: { ...type.hint, color: colors.muted },
  options: { gap: 10 },
  feedback: { gap: 10 },
  verdict: { flexDirection: "row", alignItems: "center", gap: 6 },
  verdictText: { fontSize: 15, fontWeight: "700" },
  answer: { ...type.body, fontWeight: "600", color: colors.foreground },
  gloss: { fontWeight: "400", color: colors.muted },
  body: { ...type.body, color: colors.foreground },
  notes: { gap: 10, marginTop: 4 },
  notesTitle: { ...type.hint, fontWeight: "600", color: colors.muted },
  note: { gap: 2 },
  noteHead: { ...type.body, color: colors.foreground },
  noteLetter: { color: colors.muted },
  noteBody: { ...type.hint, color: colors.muted },
});
