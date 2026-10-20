import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { AnswerOption, type OptionState } from "@/components/answer-option";
import { Card } from "@/components/ui/layout";
import { enterUp, swapIn } from "@/components/ui/motion";
import { ProgressBar } from "@/components/ui/progress";
import { VerdictMark } from "@/components/ui/verdict-mark";
import { t } from "@/core/lib/i18n";
import type { RoomState } from "@/core/lib/room-client";
import { colors, radius, type } from "@/lib/theme";
import { PassageText } from "./passage-text";
import { PlayerList } from "./player-list";

/** Seconds to the deadline on the server's clock, ticking four times a second. */
function useSecondsLeft(endsAt: number | null, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - (now + offset)) / 1000));
}

/** One live question. Everything on it comes from the room's latest state. */
export function QuestionStage({
  state,
  offset,
  onAnswer,
}: {
  state: RoomState;
  offset: number;
  onAnswer: (choice: number) => boolean;
}) {
  const question = state.question;
  const reveal = state.reveal;
  const [pending, setPending] = useState<number | null>(null);
  const secondsLeft = useSecondsLeft(state.endsAt, offset);
  const locked = state.yourChoice !== null || reveal !== null;
  const chosen = state.yourChoice ?? pending;
  const correct =
    state.yourChoice !== null &&
    Boolean(reveal?.accepted.includes(state.yourChoice));

  // The reveal lands with the same feel as solo practice.
  const announced = useRef(false);
  useEffect(() => {
    if (!reveal || announced.current) return;
    announced.current = true;
    if (state.yourChoice === null) return;
    void Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
  }, [correct, reveal, state.yourChoice]);

  if (!question) return null;

  const choose = (index: number) => {
    if (locked || pending !== null) return;
    void Haptics.selectionAsync();
    setPending(index);
    if (!onAnswer(index)) setPending(null);
  };
  const otherBlanks = Object.entries(state.revealedBlanks).filter(
    ([blank]) => Number(blank) !== question.blank,
  );
  const usedBy = (option: string) =>
    question.sharedBank
      ? otherBlanks.find(([, answer]) => answer === option)?.[0]
      : undefined;
  const optionState = (index: number): OptionState => {
    if (reveal) {
      if (reveal.accepted.includes(index)) return "right";
      return chosen === index ? "wrong" : "dim";
    }
    if (chosen === index) return "chosen";
    return chosen !== null ? "dim" : "idle";
  };
  const connected = state.players.filter((player) => player.connected);
  const mine = reveal?.gained[state.you] ?? 0;
  const urgent = !reveal && secondsLeft <= 5;
  const wordTask = question.type === "meaning" || question.type === "reverse";

  return (
    <View style={styles.stage}>
      <View style={styles.meta}>
        <Text style={styles.position}>
          {t("rooms.question", {
            current: state.index + 1,
            total: state.total,
          })}
        </Text>
        <View style={[styles.timer, urgent && styles.timerUrgent]}>
          <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
            {reveal
              ? t("rooms.nextIn", { seconds: secondsLeft })
              : t("rooms.secondsLeft", { seconds: secondsLeft })}
          </Text>
        </View>
      </View>
      <ProgressBar
        value={state.duration ? (secondsLeft * 1000) / state.duration : 0}
        tint={reveal ? colors.faint : colors.primary}
      />

      {question.passage ? (
        <Card style={styles.passage}>
          <Text style={styles.passageTitle}>{question.passage.title}</Text>
          <PassageText
            passage={question.passage.text}
            activeBlank={question.blank}
            answeredBlanks={state.revealedBlanks}
          />
        </Card>
      ) : null}

      <Text style={wordTask ? styles.wordPrompt : styles.prompt}>
        {question.blank
          ? t("questions.blankLabel", { index: question.blank })
          : question.prompt}
      </Text>

      <View style={styles.options}>
        {question.options.map((option, index) => {
          const used = usedBy(option);
          return (
            <AnswerOption
              key={index}
              label={`${String.fromCharCode(65 + index)}  ${option}`}
              note={
                used ? t("practice.usedInBlank", { index: used }) : undefined
              }
              state={optionState(index)}
              celebrate={
                Boolean(reveal?.accepted.includes(index)) && chosen === index
              }
              disabled={used !== undefined && !reveal}
              onPress={() => choose(index)}
            />
          );
        })}
      </View>

      {reveal ? (
        <Animated.View
          entering={enterUp}
          style={styles.result}
        >
          <View style={styles.verdict}>
            {state.yourChoice !== null ? (
              <VerdictMark correct={correct} size={22} />
            ) : null}
            <Text
              style={[
                styles.verdictText,
                {
                  color:
                    state.yourChoice === null
                      ? colors.muted
                      : correct
                        ? colors.success
                        : colors.destructive,
                },
              ]}
            >
              {state.yourChoice === null
                ? t("rooms.missed")
                : correct
                  ? t("rooms.correct", { points: mine })
                  : t("rooms.wrong")}
            </Text>
          </View>
          {reveal.explanation ? (
            <Card>
              <Text style={styles.explanation}>{reveal.explanation}</Text>
            </Card>
          ) : null}
        </Animated.View>
      ) : (
        <Animated.View entering={swapIn} style={styles.waiting}>
          {state.yourChoice !== null ? (
            <Animated.Text entering={swapIn} style={styles.answered}>
              {t("rooms.answered")}
            </Animated.Text>
          ) : null}
          <Text style={styles.count}>
            {t("rooms.answeredCount", {
              count: connected.filter((player) => player.answered).length,
              total: connected.length,
            })}
          </Text>
        </Animated.View>
      )}

      <PlayerList
        state={state}
        title={
          reveal
            ? t("rooms.scoreboard")
            : t("rooms.players", { count: state.players.length })
        }
        showScore
        showAnswered={!reveal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { gap: 18 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  position: {
    ...type.hint,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  timer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.control,
    backgroundColor: colors.secondary,
  },
  timerUrgent: { backgroundColor: colors.destructiveSoft },
  timerText: {
    fontWeight: "600",
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  timerTextUrgent: { color: colors.destructive },
  passage: { gap: 10 },
  passageTitle: { ...type.section, color: colors.foreground },
  wordPrompt: { ...type.display, color: colors.foreground },
  prompt: {
    fontSize: 17,
    lineHeight: 28,
    fontWeight: "600",
    color: colors.foreground,
  },
  options: { gap: 10 },
  result: { gap: 12 },
  verdict: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  verdictText: { fontSize: 18, fontWeight: "700" },
  explanation: { ...type.body, color: colors.foreground },
  waiting: { alignItems: "center", gap: 4 },
  answered: { ...type.body, color: colors.muted },
  count: { ...type.hint, color: colors.muted, fontVariant: ["tabular-nums"] },
});
