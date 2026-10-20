import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  currentRun,
  type PracticeRun,
} from "@/components/practice/practice-run";
import {
  QuestionView,
  type AnsweredBlanks,
} from "@/components/practice/question-view";
import { ResultView } from "@/components/practice/result-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { ProgressBar } from "@/components/ui/progress";
import { useTransitionDone } from "@/components/ui/use-transition-done";
import { isCorrectChoice } from "@/core/components/practice/meaning-questions";
import { type PracticeEntry } from "@/core/components/practice/practice-queue";
import { usePersistPracticeSession } from "@/core/components/practice/use-practice-persistence";
import { usePracticeSessionActions } from "@/core/components/practice/use-practice-session-actions";
import { t } from "@/core/lib/i18n";
import type { SenseId } from "@/core/types";
import { speak } from "@/lib/speech";
import { colors, space, type } from "@/lib/theme";

/** The sheet slides up first; the session is drawn once it is in place. */
export default function SessionScreen() {
  const ready = useTransitionDone();
  // Insets come from here: a native SafeAreaView measures zero while its
  // parent is mid entering animation.
  const insets = useSafeAreaInsets();
  const [run] = useState(currentRun);
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {!ready ? (
        <TopBar />
      ) : run?.entries.length ? (
        <Animated.View entering={swapIn} style={styles.root}>
          <Session run={run} />
        </Animated.View>
      ) : (
        <View style={[styles.root, { paddingBottom: insets.bottom }]}>
          <TopBar />
          <View style={styles.emptyWrap}>
            <EmptyState
              illustrated={false}
              title={t("practice.noContent")}
              body={t("practice.noSelection")}
              action={
                <Button
                  label={t("practice.exit")}
                  variant="ghost"
                  onPress={() => router.back()}
                />
              }
            />
          </View>
        </View>
      )}
    </View>
  );
}

/** The web's practice session: one queue, answered in order, saved as it goes. */
function Session({ run }: { run: PracticeRun }) {
  const insets = useSafeAreaInsets();
  const saved = run.snapshot;
  const { choices } = run;
  const [entries, setEntries] = useState<PracticeEntry[] | null>(run.entries);
  const [index, setIndex] = useState(saved?.index ?? 0);
  const [revealed, setRevealed] = useState(saved?.revealed ?? false);
  const [selected, setSelected] = useState<number | null>(
    saved?.selected ?? null,
  );
  // The web's pick-then-confirm step; here a tap answers, so it stays empty.
  const [, setPendingChoice] = useState<number | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [correct, setCorrect] = useState(saved?.correct ?? 0);
  const [wrong, setWrong] = useState<number[]>(saved?.wrong ?? []);
  const [skipped, setSkipped] = useState<number[]>(saved?.skipped ?? []);
  const [marked, setMarked] = useState<number[]>(saved?.marked ?? []);
  const [retrying, setRetrying] = useState(saved?.retrying ?? false);
  const [, setStarted] = useState(true);
  const [failedSenses, setFailedSenses] = useState<SenseId[]>(
    saved?.failedSenseIds ?? [],
  );
  const [answerChoices, setAnswerChoices] = useState<(number | null)[]>(
    saved?.answerChoices ?? [],
  );

  const activeEntries = entries ?? [];
  const total = activeEntries.length;
  const complete = index >= total;
  const current = activeEntries[index];
  const reviewing = viewIndex !== null && viewIndex < index;
  const viewPosition = reviewing ? viewIndex : index;
  const viewed = activeEntries[viewPosition];
  const viewedChoice = reviewing
    ? (answerChoices[viewPosition] ?? null)
    : selected;
  const completedSteps = selected !== null ? index + 1 : index;
  const progress = total ? Math.min(1, completedSteps / total) : 0;

  // Answers already given in this passage fill their blanks in the text.
  const answeredBlanks: AnsweredBlanks = {};
  if (viewed?.item.question?.kind === "reading") {
    const questionId = viewed.item.question.id;
    activeEntries.forEach((entry, position) => {
      const choice = answerChoices[position];
      if (
        entry.item.blank &&
        entry.item.question?.id === questionId &&
        choice != null
      )
        answeredBlanks[entry.item.blank] = {
          answer: entry.item.options[entry.item.answerIndex],
        };
    });
  }

  usePersistPracticeSession({
    amount: choices.amount,
    answerChoices,
    complete,
    correct,
    difficulty: choices.difficulty,
    entries: activeEntries,
    failedSenseIds: failedSenses,
    index,
    marked,
    retrying,
    revealed,
    selected,
    setId: choices.setId,
    skipped,
    started: true,
    tasks: choices.tasks,
    wrong,
  });

  const actions = usePracticeSessionActions({
    activeEntries,
    index,
    queue: activeEntries,
    questionFailedSenses: failedSenses,
    selected,
    setters: {
      setAnswerChoices,
      setCorrect,
      setEntries,
      setIndex,
      setMarked,
      setPendingChoice,
      setQuestionFailedSenses: setFailedSenses,
      setRetrying,
      setRevealed,
      setSelected,
      setSkipped,
      setStarted,
      setViewIndex,
      setWrong,
    },
  });

  // 英選中 reads the English prompt aloud; 中選英 would give the answer away.
  useEffect(() => {
    if (current?.item.type === "meaning") speak(current.item.prompt);
  }, [current]);

  const answer = (choice: number) => {
    if (reviewing || selected !== null || !current) return;
    actions.answer(choice);
    void Haptics.notificationAsync(
      isCorrectChoice(current.item, choice)
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
  };
  const toggleMark = () => {
    void Haptics.selectionAsync();
    setMarked((values) =>
      values.includes(viewPosition)
        ? values.filter((value) => value !== viewPosition)
        : [...values, viewPosition],
    );
  };
  const goPrevious = () => {
    if (viewPosition > 0) setViewIndex(viewPosition - 1);
  };
  const goForward = () => {
    const next = viewPosition + 1;
    setViewIndex(next < index ? next : null);
  };

  if (complete)
    return (
      <ResultView
        choices={choices}
        correct={correct}
        total={total}
        skipped={skipped.length}
        marked={marked.length}
        wrongCount={wrong.length}
        onRetry={() => actions.retry(wrong)}
        onRetryMarked={marked.length ? () => actions.retry(marked) : undefined}
        onNewRound={(next) => {
          setEntries(next);
          setIndex(0);
          setCorrect(0);
          setWrong([]);
          setSkipped([]);
          setMarked([]);
          setSelected(null);
          setRevealed(false);
          setAnswerChoices([]);
          setViewIndex(null);
          setRetrying(false);
          setFailedSenses([]);
        }}
      />
    );
  if (!viewed) return null;

  const answered = viewedChoice !== null;
  const canGoBack = viewPosition > 0;
  const passageId =
    viewed.item.question?.kind === "reading" ? viewed.item.question.id : null;
  const isMarked = marked.includes(viewPosition);
  const showDock = canGoBack || reviewing || answered;

  return (
    <View style={styles.root}>
      <TopBar
        progress={progress}
        label={t("practice.progress", { current: viewPosition + 1, total })}
        marked={isMarked}
        onMark={toggleMark}
        onSkip={!reviewing && selected === null ? actions.skip : undefined}
      />
      {reviewing ? (
        <Animated.Text entering={FadeIn} style={styles.reviewing}>
          {t("practice.reviewing")}
        </Animated.Text>
      ) : null}
      <ScrollView
        contentContainerStyle={[
          styles.question,
          { paddingBottom: 120 + insets.bottom },
        ]}
      >
        <Animated.View
          key={passageId ? `passage:${passageId}` : viewed.id}
          entering={
            actions.animateNextCard
              ? FadeInRight.duration(240).easing(Easing.out(Easing.cubic))
              : undefined
          }
        >
          <QuestionView
            key={viewed.id}
            item={viewed.item}
            selected={viewedChoice}
            readOnly={reviewing}
            answeredBlanks={answeredBlanks}
            onAnswer={answer}
          />
        </Animated.View>
      </ScrollView>

      {showDock ? (
        <Animated.View
          entering={FadeInDown.duration(210).easing(Easing.out(Easing.cubic))}
          style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          {canGoBack ? (
            <Button
              label={t("practice.previous")}
              icon="chevron.left"
              variant="ghost"
              onPress={goPrevious}
              style={styles.dockSecondary}
            />
          ) : null}
          {reviewing ? (
            <Button
              label={t("practice.forward")}
              icon="chevron.right"
              onPress={goForward}
              style={styles.dockPrimary}
            />
          ) : answered ? (
            <Button
              label={
                index === total - 1
                  ? t("practice.viewResult")
                  : t("practice.next")
              }
              icon={index === total - 1 ? "flag.checkered" : "arrow.right"}
              onPress={() => actions.next()}
              style={styles.dockPrimary}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

function TopBar({
  progress,
  label,
  marked,
  onMark,
  onSkip,
}: {
  progress?: number;
  label?: string;
  marked?: boolean;
  onMark?: () => void;
  onSkip?: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <RoundButton
        icon="xmark"
        label={t("practice.exit")}
        onPress={() => router.back()}
      />
      {progress !== undefined ? (
        <View style={styles.progress}>
          <ProgressBar value={progress} tint={colors.brand} />
        </View>
      ) : (
        <View style={styles.progress} />
      )}
      {label ? <Text style={styles.counter}>{label}</Text> : null}
      {onMark ? (
        <RoundButton
          icon={marked ? "flag.fill" : "flag"}
          label={t("practice.mark")}
          active={marked}
          onPress={onMark}
        />
      ) : null}
      {onSkip ? (
        <RoundButton
          icon="forward.end"
          label={t("practice.skip")}
          onPress={onSkip}
        />
      ) : null}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: "xmark" | "flag" | "flag.fill" | "forward.end";
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      onPress={onPress}
      style={[styles.round, active && styles.roundActive]}
    >
      <SymbolView
        name={icon}
        size={15}
        weight="bold"
        tintColor={active ? colors.brand : colors.foreground}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.gutter,
    paddingTop: 6,
    paddingBottom: 8,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondary,
  },
  roundActive: { backgroundColor: colors.brandSoft },
  progress: { flex: 1 },
  counter: { ...type.hint, color: colors.muted, fontVariant: ["tabular-nums"] },
  reviewing: {
    ...type.hint,
    fontWeight: "600",
    color: colors.brand,
    paddingHorizontal: space.gutter,
  },
  emptyWrap: { padding: space.gutter },
  question: { padding: space.gutter },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: space.gutter,
    backgroundColor: colors.canvas,
  },
  dockSecondary: { flex: 1 },
  dockPrimary: { flex: 1.3 },
});
