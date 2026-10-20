import { Button, Host } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { allStudyWords, studyWordsFor } from "@/lexiro/library";
import { buildSession, isCorrectChoice, type WordTask } from "@/lexiro/questions";
import { speak } from "@/lib/speech";
import { useApp } from "@/lib/store";
import { BRAND_LIGHT, brand } from "@/lib/theme";

function parseTasks(value: string | undefined): WordTask[] {
  const tasks = (value ?? "meaning")
    .split(",")
    .filter((task): task is WordTask => task === "meaning" || task === "reverse");
  return tasks.length ? tasks : ["meaning"];
}

export default function SessionScreen() {
  const params = useLocalSearchParams<{ setId?: string; tasks?: string; amount?: string }>();
  const library = useApp((state) => state.library);
  const [round, setRound] = useState(0);
  const items = useMemo(
    () =>
      buildSession(
        studyWordsFor(library, params.setId ?? ""),
        allStudyWords(library),
        parseTasks(params.tasks),
        Number(params.amount) || 20,
      ),
    // A new round deals a new session; library updates mid-session do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round],
  );
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);

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
    if (right) setCorrect((value) => value + 1);
    void Haptics.notificationAsync(
      right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  };

  const next = () => {
    setChoice(null);
    setIndex((value) => value + 1);
  };

  const restart = () => {
    setRound((value) => value + 1);
    setIndex(0);
    setChoice(null);
    setCorrect(0);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="結束練習" hitSlop={12} onPress={() => router.back()}>
          <SymbolView name="xmark.circle.fill" size={30} tintColor={PlatformColor("systemGray3")} />
        </Pressable>
        {!finished && items.length ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(index / items.length) * 100}%` }]} />
          </View>
        ) : null}
        {!finished && items.length ? (
          <Text style={styles.counter}>
            {index + 1}/{items.length}
          </Text>
        ) : null}
      </View>

      {!items.length ? (
        <View style={styles.center}>
          <Text style={styles.resultTitle}>沒有可以出的題目</Text>
          <Text style={styles.resultBody}>每題需要另外三個不同意思的單字當選項，請挑單字多一點的範圍。</Text>
        </View>
      ) : finished ? (
        <View style={styles.center}>
          <SymbolView name="checkmark.seal.fill" size={72} tintColor={brand} />
          <Text style={styles.resultTitle}>
            答對 {correct} / {items.length}
          </Text>
          <Text style={styles.resultBody}>{Math.round((correct / items.length) * 100)}%</Text>
          <Host matchContents>
            <Button
              label="再練一次"
              systemImage="arrow.clockwise"
              onPress={restart}
              modifiers={[buttonStyle("glassProminent"), controlSize("large"), tint(BRAND_LIGHT)]}
            />
          </Host>
          <Host matchContents>
            <Button label="完成" onPress={() => router.back()} modifiers={[buttonStyle("glass"), controlSize("large")]} />
          </Host>
        </View>
      ) : item ? (
        <ScrollView contentContainerStyle={styles.question}>
          <Text style={styles.taskLabel}>{item.type === "meaning" ? "英選中" : "中選英"}</Text>
          <View style={styles.promptRow}>
            <Text style={[styles.prompt, item.type === "reverse" && styles.promptZh]}>{item.prompt}</Text>
            {item.type === "meaning" ? (
              <Pressable accessibilityLabel="朗讀單字" hitSlop={10} onPress={() => speak(item.prompt)}>
                <SymbolView name="speaker.wave.2.fill" size={26} tintColor={brand} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.options}>
            {item.options.map((option, optionIndex) => {
              const answered = choice !== null;
              const isRight = isCorrectChoice(item, optionIndex);
              const picked = choice === optionIndex;
              return (
                <Pressable
                  key={`${item.id}:${optionIndex}`}
                  disabled={answered}
                  onPress={() => choose(optionIndex)}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && styles.optionPressed,
                    answered && isRight && styles.optionRight,
                    answered && picked && !isRight && styles.optionWrong,
                  ]}
                >
                  <Text style={styles.optionText}>{option}</Text>
                  {answered && (isRight || picked) ? (
                    <SymbolView
                      name={isRight ? "checkmark.circle.fill" : "xmark.circle.fill"}
                      size={22}
                      tintColor={PlatformColor(isRight ? "systemGreen" : "systemRed")}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {choice !== null ? (
            <View style={styles.footer}>
              <Text style={styles.meaning}>{item.type === "meaning" ? item.meaning : item.options[item.answerIndex]}</Text>
              <Host matchContents>
                <Button
                  label={index + 1 < items.length ? "下一題" : "看結果"}
                  onPress={next}
                  modifiers={[buttonStyle("glassProminent"), controlSize("large"), tint(BRAND_LIGHT)]}
                />
              </Host>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PlatformColor("systemGroupedBackground") },
  topBar: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 8 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: PlatformColor("systemGray5"),
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: brand },
  counter: { color: PlatformColor("secondaryLabel"), fontSize: 15, fontVariant: ["tabular-nums"] },
  question: { padding: 20, gap: 20 },
  taskLabel: { color: PlatformColor("secondaryLabel"), fontSize: 15, fontWeight: "600", marginTop: 24 },
  promptRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  prompt: { color: PlatformColor("label"), fontSize: 40, fontWeight: "700", flexShrink: 1 },
  promptZh: { fontSize: 30 },
  options: { gap: 12, marginTop: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  optionPressed: { backgroundColor: PlatformColor("systemGray4") },
  optionRight: { backgroundColor: PlatformColor("systemGreen"), opacity: 0.9 },
  optionWrong: { backgroundColor: PlatformColor("systemRed"), opacity: 0.9 },
  optionText: { flex: 1, color: PlatformColor("label"), fontSize: 18 },
  footer: { gap: 16, alignItems: "center", marginTop: 8 },
  meaning: { color: PlatformColor("secondaryLabel"), fontSize: 16, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  resultTitle: { color: PlatformColor("label"), fontSize: 28, fontWeight: "700" },
  resultBody: { color: PlatformColor("secondaryLabel"), fontSize: 17, textAlign: "center", marginBottom: 12 },
});
