import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { VerdictMark } from "@/components/ui/verdict-mark";
import {
  buildPracticeQueue,
  type PracticeEntry,
} from "@/core/components/practice/practice-queue";
import { usePracticePool } from "@/core/components/practice/use-practice-pool";
import { t } from "@/core/lib/i18n";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, radius, space, type } from "@/lib/theme";
import type { PracticeChoices } from "./practice-run";

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
        { paddingBottom: 40 + insets.bottom },
      ]}
    >
      <Animated.View
        entering={ZoomIn.duration(280).easing(Easing.out(Easing.cubic))}
        style={styles.finish}
      >
        <Animated.View
          entering={ZoomIn.delay(120)
            .duration(260)
            .easing(Easing.out(Easing.back(1.5)))}
          style={styles.finishMark}
        >
          <VerdictMark
            correct
            size={28}
            disc={false}
            markColor={colors.studyInk}
          />
        </Animated.View>
        <Text style={styles.finishLabel}>{t("practice.resultTitle")}</Text>
        <Text style={styles.finishScore}>
          {correct}
          <Text style={styles.finishTotal}> / {total}</Text>
        </Text>
        <View style={styles.stats}>
          <Stat label={t("practice.skippedLabel")} value={skipped} />
          <Stat label={t("practice.markedLabel")} value={marked} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(200)} style={styles.actions}>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Deals a fresh round from the same setup choices. */
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
  return (
    <Button
      label="再一輪"
      icon="arrow.clockwise"
      variant={primary ? "primary" : "secondary"}
      onPress={() => {
        const entries = buildPracticeQueue({
          allowedSenseIds,
          difficulty: choices.difficulty,
          questionGroups,
          studyItems,
          amount: choices.amount,
          oneSensePerWord: choices.oneSensePerWord,
          tasks: choices.tasks,
        });
        if (entries.length) onDeal(entries);
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.gutter, gap: space.section },
  finish: {
    alignItems: "flex-start",
    gap: 4,
    padding: 24,
    paddingTop: 28,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.studyInk,
  },
  finishMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.studyLime,
    marginBottom: 14,
  },
  finishLabel: { ...type.body, color: colors.studySoft },
  finishScore: {
    fontSize: 64,
    fontWeight: "600",
    letterSpacing: -2,
    color: colors.studyPaper,
    fontVariant: ["tabular-nums"],
  },
  finishTotal: {
    fontSize: 28,
    fontWeight: "500",
    letterSpacing: 0,
    color: colors.studySoft,
  },
  stats: { flexDirection: "row", gap: 28, marginTop: 8 },
  stat: { gap: 2 },
  statValue: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.studyPaper,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { ...type.hint, color: colors.studySoft },
  actions: { gap: 10 },
});
