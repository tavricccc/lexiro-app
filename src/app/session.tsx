import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInRight, ZoomIn } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AnswerOption, type OptionState } from "@/components/answer-option";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { ProgressBar } from "@/components/ui/progress";
import { allStudyWords, studyWordsFor } from "@/lexiro/library";
import {
  buildSession,
  isCorrectChoice,
  seededShuffle,
  type QuestionItem,
  type WordTask,
} from "@/lexiro/questions";
import { speak } from "@/lib/speech";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, radius, space, type } from "@/lib/theme";

function parseTasks(value: string | undefined): WordTask[] {
  const tasks = (value ?? "meaning")
    .split(",")
    .filter((task): task is WordTask => task === "meaning" || task === "reverse");
  return tasks.length ? tasks : ["meaning"];
}

/** The same questions in a new order, each with its options dealt again. */
function reshuffle(items: QuestionItem[]): QuestionItem[] {
  return seededShuffle(items, String(Math.random())).map((item) => {
    const order = seededShuffle(
      item.options.map((_, index) => index),
      `${item.id}:${Math.random()}`,
    );
    return {
      ...item,
      options: order.map((index) => item.options[index]!),
      answerIndex: order.indexOf(item.answerIndex),
    };
  });
}

const answerText = (item: QuestionItem) =>
  item.type === "meaning" ? item.meaning : item.options[item.answerIndex]!;

export default function SessionScreen() {
  const params = useLocalSearchParams<{ setId?: string; tasks?: string; amount?: string }>();
  const library = useLibraryStore((store) => store.state);
  const insets = useSafeAreaInsets();
  const deal = () =>
    buildSession(
      studyWordsFor(library, params.setId ?? ""),
      allStudyWords(library),
      parseTasks(params.tasks),
      Number(params.amount) || 20,
    );
  // A round keeps the questions it dealt; library updates mid-round do not change them.
  const [items, setItems] = useState(deal);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [missed, setMissed] = useState<QuestionItem[]>([]);

  const item = items[index];
  const finished = index >= items.length;

  // 英選中 reads the English prompt aloud; 中選英 would give the answer away.
  useEffect(() => {
    if (item?.type === "meaning") speak(item.prompt);
  }, [item]);

  const choose = (option: number) => {
    if (!item || choice !== null) return;
    setChoice(option);
    const right = isCorrectChoice(item, option);
    if (!right) setMissed((list) => [...list, item]);
    void Haptics.notificationAsync(
      right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  };

  const next = () => {
    setChoice(null);
    setIndex((value) => value + 1);
  };

  const startRound = (round: QuestionItem[]) => {
    setItems(round);
    setIndex(0);
    setChoice(null);
    setMissed([]);
  };

  if (!items.length)
    return (
      <SafeAreaView style={styles.root}>
        <TopBar />
        <View style={styles.emptyWrap}>
          <EmptyState
            illustrated={false}
            title="沒有可以出的題目"
            body="每題需要另外三個不同意思的單字當選項，請挑單字多一點的範圍。"
            action={<Button label="返回" variant="ghost" onPress={() => router.back()} />}
          />
        </View>
      </SafeAreaView>
    );

  if (finished) {
    const correct = items.length - missed.length;
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <TopBar />
        <ScrollView contentContainerStyle={[styles.result, { paddingBottom: 140 + insets.bottom }]}>
          <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.finish}>
            <Animated.View
              entering={ZoomIn.delay(180).springify().damping(10)}
              style={styles.finishMark}
            >
              <SymbolView name="checkmark" size={26} weight="bold" tintColor={colors.studyInk} />
            </Animated.View>
            <Text style={styles.finishLabel}>本輪答對</Text>
            <Text style={styles.finishScore}>
              {correct}
              <Text style={styles.finishTotal}> / {items.length}</Text>
            </Text>
            <Text style={styles.finishNote}>
              {missed.length ? `答錯 ${missed.length} 題，可以馬上重練。` : "全部答對。"}
            </Text>
          </Animated.View>

          {missed.length ? (
            <View style={styles.review}>
              <Text style={styles.reviewTitle}>錯題解析</Text>
              {missed.map((entry, missIndex) => (
                <Animated.View
                  key={entry.id}
                  entering={swapIn}
                  style={styles.reviewItem}
                >
                  <Text style={styles.reviewPrompt}>{entry.prompt}</Text>
                  <Text style={styles.reviewAnswer}>{answerText(entry)}</Text>
                </Animated.View>
              ))}
            </View>
          ) : null}
        </ScrollView>
        <Animated.View
          entering={FadeInDown.delay(250).springify().damping(20)}
          style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          {missed.length ? (
            <>
              <Button
                label="再一輪"
                variant="ghost"
                onPress={() => startRound(deal())}
                style={styles.dockSecondary}
              />
              <Button
                label="重練錯題"
                icon="arrow.counterclockwise"
                onPress={() => startRound(reshuffle(missed))}
                style={styles.dockPrimary}
              />
            </>
          ) : (
            <>
              <Button
                label="完成"
                variant="ghost"
                onPress={() => router.back()}
                style={styles.dockSecondary}
              />
              <Button
                label="再一輪"
                icon="arrow.clockwise"
                onPress={() => startRound(deal())}
                style={styles.dockPrimary}
              />
            </>
          )}
        </Animated.View>
      </SafeAreaView>
    );
  }

  const answered = choice !== null;
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <TopBar progress={index / items.length} label={`${index + 1} / ${items.length}`} />
      <ScrollView contentContainerStyle={[styles.question, { paddingBottom: 120 + insets.bottom }]}>
        <Animated.View
          key={item!.id}
          entering={FadeInRight.springify().damping(20).stiffness(200)}
          style={styles.head}
        >
          <Text style={styles.task}>{item!.type === "meaning" ? "英選中" : "中選英"}</Text>
          <View style={styles.promptRow}>
            <Text style={[styles.prompt, item!.type === "reverse" && styles.promptZh]} selectable>
              {item!.prompt}
            </Text>
            {item!.type === "meaning" ? (
              <PressableScale
                scaleTo={0.85}
                accessibilityRole="button"
                accessibilityLabel="朗讀單字"
                hitSlop={10}
                onPress={() => speak(item!.prompt)}
                style={styles.speak}
              >
                <SymbolView name="speaker.wave.2.fill" size={18} tintColor={colors.brand} />
              </PressableScale>
            ) : null}
          </View>
        </Animated.View>

        <View style={styles.options}>
          {item!.options.map((option, optionIndex) => {
            const isRight = isCorrectChoice(item!, optionIndex);
            const state: OptionState = !answered
              ? "idle"
              : isRight
                ? "right"
                : choice === optionIndex
                  ? "wrong"
                  : "dim";
            return (
              <Animated.View key={`${item!.id}:${optionIndex}`} entering={swapIn}>
                <AnswerOption label={option} state={state} onPress={() => choose(optionIndex)} />
              </Animated.View>
            );
          })}
        </View>

        {answered && item!.type === "meaning" ? (
          <Animated.Text entering={FadeInDown.duration(220)} style={styles.meaning}>
            {item!.meaning}
          </Animated.Text>
        ) : null}
      </ScrollView>

      {answered ? (
        <Animated.View
          entering={FadeInDown.springify().damping(20)}
          style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <Button
            label={index + 1 < items.length ? "下一題" : "看結果"}
            icon={index + 1 < items.length ? "arrow.right" : "flag.checkered"}
            onPress={next}
            style={styles.dockPrimary}
          />
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

function TopBar({ progress, label }: { progress?: number; label?: string }) {
  return (
    <View style={styles.topBar}>
      <PressableScale
        scaleTo={0.88}
        accessibilityRole="button"
        accessibilityLabel="結束練習"
        hitSlop={12}
        onPress={() => router.back()}
        style={styles.close}
      >
        <SymbolView name="xmark" size={15} weight="bold" tintColor={colors.foreground} />
      </PressableScale>
      {progress !== undefined ? (
        <View style={styles.progress}>
          <ProgressBar value={progress} tint={colors.brand} />
        </View>
      ) : null}
      {label ? <Text style={styles.counter}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: space.gutter,
    paddingTop: 6,
    paddingBottom: 8,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondary,
  },
  progress: { flex: 1 },
  counter: { ...type.hint, color: colors.muted, fontVariant: ["tabular-nums"] },
  emptyWrap: { padding: space.gutter },

  question: { padding: space.gutter, gap: 18 },
  head: { gap: 18 },
  task: { ...type.hint, color: colors.muted, marginTop: 12 },
  promptRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  prompt: {
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: -1,
    color: colors.foreground,
    flexShrink: 1,
  },
  promptZh: { fontSize: 30, letterSpacing: -0.4 },
  speak: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  options: { gap: 10, marginTop: 6 },
  meaning: { ...type.body, color: colors.muted, paddingHorizontal: 4 },

  result: { padding: space.gutter, gap: space.section },
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
  finishTotal: { fontSize: 28, fontWeight: "500", letterSpacing: 0, color: colors.studySoft },
  finishNote: { ...type.body, color: colors.studySoft },
  review: { gap: 8 },
  reviewTitle: { ...type.section, color: colors.foreground, paddingHorizontal: 4, marginBottom: 2 },
  reviewItem: {
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: space.row,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  reviewPrompt: { fontSize: 19, fontWeight: "700", color: colors.foreground },
  reviewAnswer: { ...type.body, color: colors.muted },

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
