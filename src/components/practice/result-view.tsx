import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { Markdown } from "@/components/ui/markdown";
import { swapIn } from "@/components/ui/motion";
import { VerdictMark } from "@/components/ui/verdict-mark";
import { estimatePoints } from "@/core/ai-contract";
import {
  buildPracticeQueue,
  type PracticeEntry,
} from "@/core/components/practice/practice-queue";
import { usePracticePool } from "@/core/components/practice/use-practice-pool";
import { createAiSession } from "@/core/lib/ai/session";
import { t } from "@/core/lib/i18n";
import { managedTurn } from "@/core/lib/managed-client";
import { useAiPreferencesStore } from "@/core/stores/ai-preferences-store";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, radius, space, type } from "@/lib/theme";
import type { PracticeChoices } from "./practice-run";

/** The web's result panel: the score, an AI read of the misses, and retries. */
export function ResultView({
  choices,
  correct,
  total,
  skipped,
  marked,
  wrongCount,
  wrongContent,
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
  wrongContent: string;
  onRetry: () => void;
  onRetryMarked?: () => void;
  onNewRound: (entries: PracticeEntry[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const uid = useCloudStore((store) => store.user?.uid);
  const model = useAiPreferencesStore((store) => store.preferences.model);
  const cost = estimatePoints("explain", 1, "lite", model).max;
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);

  // Leaving the result drops the request instead of letting it run on.
  useEffect(() => () => request.current?.abort(), [uid]);

  const explain = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await managedTurn(
        createAiSession("lite", wrongContent),
        { kind: "explain", raw: wrongContent },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setExplanation(result.text);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };

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

      {wrongContent && !explanation ? (
        uid ? (
          <Button
            label={
              busy
                ? t("practice.explaining")
                : `${t("practice.explainWrong")} · ${t("managed.expectedShort", { points: cost })}`
            }
            icon="sparkles"
            variant="secondary"
            busy={busy}
            onPress={() => void explain()}
          />
        ) : (
          <Text style={styles.hint}>{t("managed.signInRequired")}</Text>
        )
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {explanation ? (
        <Animated.View entering={swapIn}>
          <Card style={styles.explanation}>
            <Text style={styles.section}>{t("practice.explanationTitle")}</Text>
            <Markdown text={explanation} />
          </Card>
        </Animated.View>
      ) : null}

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
    choices.setId,
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
  hint: { ...type.hint, color: colors.muted, textAlign: "center" },
  error: { ...type.hint, color: colors.destructive },
  explanation: { gap: 12 },
  section: { ...type.section, color: colors.foreground },
  actions: { gap: 10 },
});
