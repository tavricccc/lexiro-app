import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { PassageText } from "@/components/rooms/passage-text";
import { Card } from "@/components/ui/layout";
import { ListGroup, SwitchRow } from "@/components/ui/list";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { t } from "@/core/lib/i18n";
import { senseKey } from "@/core/lib/library";
import { questionFormatLabel } from "@/core/lib/question-options";
import type { LibraryQuestion, ReadingPack, WordEntry } from "@/core/types";
import { colors, type } from "@/lib/theme";
import { QuestionPreview } from "./question-preview";

/** What a run produced, one question at a time, each with its keep switch. */
export function GeneratedQuestionResults({
  items,
  words,
  excludedIds = [],
  onToggle,
}: {
  items: LibraryQuestion[];
  words: WordEntry[];
  excludedIds?: string[];
  onToggle?: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  const sources = new Map(
    words.flatMap((word) =>
      word.senses.map(
        (sense) =>
          [
            senseKey(word.wordKey, sense.id),
            { word: word.word, meaningZh: sense.meaningZh },
          ] as const,
      ),
    ),
  );
  const currentIndex = Math.min(index, items.length - 1);
  const question = items[currentIndex];
  const source =
    question.kind === "reading"
      ? null
      : sources.get(senseKey(question.wordKey, question.senseId));

  return (
    <View style={styles.stack}>
      <View style={styles.pager}>
        <PagerButton
          icon="chevron.left"
          label={t("questions.previousItem")}
          disabled={currentIndex === 0}
          onPress={() => setIndex(currentIndex - 1)}
        />
        <View style={styles.pagerText}>
          <Text style={styles.position}>
            {`${currentIndex + 1} / ${items.length}`}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {question.kind === "reading"
              ? questionFormatLabel(question.format)
              : `${t("questions.targetWord", {
                  word: source?.word ?? question.wordKey,
                })}${source?.meaningZh ? ` · ${source.meaningZh}` : ""}`}
          </Text>
        </View>
        <PagerButton
          icon="chevron.right"
          label={t("questions.nextItem")}
          disabled={currentIndex === items.length - 1}
          onPress={() => setIndex(currentIndex + 1)}
        />
      </View>

      {onToggle ? (
        <ListGroup>
          <SwitchRow
            icon="checkmark.circle"
            title={t("questions.includeQuestion")}
            value={!excludedIds.includes(question.id)}
            onValueChange={() => onToggle(question.id)}
          />
        </ListGroup>
      ) : null}

      <Animated.View key={question.id} entering={swapIn}>
        {question.kind === "reading" ? (
          <ReadingPreview pack={question} />
        ) : (
          <QuestionPreview
            prompt={question.prompt}
            options={question.options}
            answerIndex={question.answerIndex}
            explanation={question.explanation}
            whyWrong={question.whyWrong}
          />
        )}
      </Animated.View>
    </View>
  );
}

function ReadingPreview({ pack }: { pack: ReadingPack }) {
  const answers = Object.fromEntries(
    pack.questions
      .filter((child) => child.blank)
      .map((child) => [child.blank!, child.options[child.answerIndex]]),
  );
  return (
    <View style={styles.stack}>
      <Card style={styles.passage}>
        <Text style={styles.title}>{pack.title}</Text>
        <PassageText passage={pack.passage} answeredBlanks={answers} />
      </Card>
      {pack.questions.map((child, childIndex) => (
        <View key={child.id} style={styles.child}>
          <Text style={styles.childLabel}>
            {child.blank
              ? t("questions.blankLabel", { index: child.blank })
              : t("practice.questionPosition", {
                  current: childIndex + 1,
                  total: pack.questions.length,
                })}
          </Text>
          <QuestionPreview
            prompt={child.blank ? undefined : child.prompt}
            options={child.options}
            answerIndex={child.answerIndex}
            explanation={child.explanation}
            whyWrong={child.whyWrong}
          />
        </View>
      ))}
    </View>
  );
}

function PagerButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "chevron.left" | "chevron.right";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[styles.pagerButton, disabled && styles.disabled]}
    >
      <SymbolView
        name={icon}
        size={16}
        weight="semibold"
        tintColor={colors.foreground}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  pager: { flexDirection: "row", alignItems: "center", gap: 12 },
  pagerText: { flex: 1, alignItems: "center", gap: 2 },
  position: {
    ...type.section,
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  meta: { ...type.hint, color: colors.muted },
  pagerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  disabled: { opacity: 0.35 },
  passage: { gap: 12 },
  title: { ...type.section, color: colors.foreground },
  child: { gap: 8 },
  childLabel: { ...type.hint, fontWeight: "600", color: colors.brand },
});
