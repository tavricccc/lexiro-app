import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { CONTENT_MAX_WIDTH } from "@/components/ui/layout";
import {
  buildPracticeQueue,
  type PracticeEntry,
} from "@/core/components/practice/practice-queue";
import { usePracticePool } from "@/core/components/practice/use-practice-pool";
import { t } from "@/core/lib/i18n";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, latin, radius, space, type } from "@/lib/theme";
import type { PracticeChoices } from "./practice-run";
import { pop, swapIn } from "@/components/ui/motion";
import { ParticleBurst } from "@/components/ui/particle-burst";

/** The web's result panel: the score and retries. */
export function ResultView({
  choices,
  correct,
  total,
  skipped,
  marked,
  wrongCount,
  onRetry,
  onRetryMarked,
  onNewRound,
}: {
  choices: PracticeChoices;
  correct: number;
  total: number;
  skipped: number;
  marked: number;
  wrongCount: number;
  onRetry: () => void;
  onRetryMarked?: () => void;
  onNewRound: (entries: PracticeEntry[]) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        styles.column,
        { paddingBottom: 40 + insets.bottom },
      ]}
    >
      <Animated.View entering={pop} style={styles.finish}>
        <Text style={styles.finishLabel}>{t("practice.resultTitle")}</Text>
        <View>
          <Text style={styles.finishScore}>
            {correct}
            <Text style={styles.finishTotal}> / {total}</Text>
          </Text>
          {/* A good round is celebrated once, from the score. */}
          <ParticleBurst
            play={total && correct / total >= 0.6 ? 1 : 0}
            count={28}
            reach={150}
          />
        </View>
        <Tally correct={correct} total={total} />
        <View style={styles.stats}>
          <Stat label={t("practice.skippedLabel")} value={skipped} />
          <Stat label={t("practice.markedLabel")} value={marked} />
        </View>
      </Animated.View>

      <Animated.View entering={swapIn.delay(200)} style={styles.actions}>
        {wrongCount ? (
          <Button
            label={t("practice.retryWrong")}
            icon="arrow.counterclockwise"
            onPress={onRetry}
          />
        ) : null}
        {onRetryMarked ? (
          <Button
            label={t("practice.retryMarked")}
            icon="flag"
            variant="secondary"
            onPress={onRetryMarked}
          />
        ) : null}
        <NewRoundButton
          choices={choices}
          primary={!wrongCount}
          onDeal={onNewRound}
        />
        <Button
          label={t("practice.backHome")}
          variant="ghost"
          onPress={() => router.dismissTo("/today")}
        />
      </Animated.View>
    </ScrollView>
  );
}

/** The round as an answer card: one bubble per question, the right ones filled. */
function Tally({ correct, total }: { correct: number; total: number }) {
  return (
    <View style={styles.tally} accessible={false}>
      {Array.from({ length: total }, (_, index) => (
        <Animated.View
          key={index}
          entering={pop.delay(160 + Math.min(index, 30) * 24)}
          style={[styles.tallyBubble, index < correct && styles.tallyFilled]}
        />
      ))}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Deals a fresh round from the same setup choices, when there is one to deal. */
function NewRoundButton({
  choices,
  primary,
  onDeal,
}: {
  choices: PracticeChoices;
  primary: boolean;
  onDeal: (entries: PracticeEntry[]) => void;
}) {
  const state = useLibraryStore((store) => store.state);
  const { allowedSenseIds, studyItems, questionGroups } = usePracticePool(
    state,
    choices.setIds,
  );
  const entries = useMemo(
    () =>
      buildPracticeQueue({
        allowedSenseIds,
        difficulty: choices.difficulty,
        questionGroups,
        studyItems,
        amount: choices.amount,
        oneSensePerWord: choices.oneSensePerWord,
        tasks: choices.tasks,
      }),
    [allowedSenseIds, choices, questionGroups, studyItems],
  );
  if (!entries.length) return null;
  return (
    <Button
      label="再一輪"
      icon="arrow.clockwise"
      variant={primary ? "primary" : "secondary"}
      onPress={() => onDeal(entries)}
    />
  );
}

const styles = StyleSheet.create({
  column: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  content: { padding: space.gutter, gap: space.section },
  // The one green field of the session, ink on it as on the printed card.
  finish: {
    gap: 6,
    padding: 24,
    paddingTop: 22,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.field,
  },
  finishLabel: { ...type.section, color: colors.fieldInk },
  finishScore: {
    ...type.poster,
    fontSize: 128,
    lineHeight: 132,
    letterSpacing: -6,
    color: colors.fieldInk,
    fontVariant: ["tabular-nums"],
  },
  finishTotal: {
    ...latin.bold,
    fontSize: 36,
    letterSpacing: -1,
    color: colors.fieldInk,
  },
  tally: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  tallyBubble: {
    width: 21,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.fieldInk,
  },
  tallyFilled: { backgroundColor: colors.fieldInk },
  stats: { flexDirection: "row", gap: 28, marginTop: 14 },
  stat: { gap: 0 },
  statValue: {
    ...latin.bold,
    fontSize: 28,
    color: colors.fieldInk,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { ...type.hint, color: colors.fieldInk },
  actions: { gap: 10 },
});
