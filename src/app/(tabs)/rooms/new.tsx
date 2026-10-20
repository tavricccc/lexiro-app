import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";

import { playerName } from "@/components/rooms/player-list";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen } from "@/components/ui/layout";
import { ListGroup, PickerRow, SwitchRow } from "@/components/ui/list";
import { isWordTask } from "@/core/components/practice/meaning-questions";
import {
  buildPracticeQueue,
  countQuestionAvailability,
  countTaskAvailability,
} from "@/core/components/practice/practice-queue";
import { usePracticePool } from "@/core/components/practice/use-practice-pool";
import { PRACTICE_QUESTION_TASKS } from "@/core/constants";
import { t } from "@/core/lib/i18n";
import {
  difficultyLabel,
  questionFormatLabel,
} from "@/core/lib/question-options";
import {
  createRoom,
  ROOM_MAX_QUESTIONS,
  toRoomQuestions,
} from "@/core/lib/room-client";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type { PracticeTask, WorkspaceQuestionDifficulty } from "@/core/types";
import {
  BRAND_DARK,
  BRAND_LIGHT,
  colors,
  radius,
  space,
  type,
} from "@/lib/theme";
import { toast } from "@/platform/toast";

const DIFFICULTIES: WorkspaceQuestionDifficulty[] = ["all", "1", "2", "3"];

function Amount({
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const scheme = useColorScheme();
  return (
    <View style={styles.amount}>
      <View style={styles.amountHead}>
        <Text style={styles.amountLabel}>{label}</Text>
        <Text style={styles.amountValue}>
          {value} {unit}
        </Text>
      </View>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        disabled={max <= min}
        minimumTrackTintColor={scheme === "dark" ? BRAND_DARK : BRAND_LIGHT}
        onValueChange={(next) => {
          if (next !== value) void Haptics.selectionAsync();
          onChange(next);
        }}
      />
      <View style={styles.range}>
        <Text style={styles.rangeText}>{min}</Text>
        <Text style={styles.rangeText}>{max}</Text>
      </View>
    </View>
  );
}

/** The host picks questions from their own bank, the same way solo practice does. */
export default function RoomSetupScreen() {
  const user = useCloudStore((store) => store.user);
  const status = useLibraryStore((store) => store.status);
  if (!user) return <SignInPrompt body={t("rooms.signInRequired")} />;
  if (status !== "ready") return null;
  return <RoomSetup />;
}

function RoomSetup() {
  const user = useCloudStore((store) => store.user);
  const state = useLibraryStore((store) => store.state);
  const [setId, setSetId] = useState("");
  const [difficulty, setDifficulty] =
    useState<WorkspaceQuestionDifficulty>("all");
  const [oneSensePerWord, setOneSensePerWord] = useState(true);
  const [amount, setAmount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [busy, setBusy] = useState(false);

  const { allowedSenseIds, studyItems, questionGroups } = usePracticePool(
    state,
    setId,
  );
  const counts = useMemo(
    () =>
      countTaskAvailability({
        allowedSenseIds,
        difficulty,
        questionGroups,
        studyItems,
      }),
    [allowedSenseIds, difficulty, questionGroups, studyItems],
  );
  // Saved 學測 questions first, as on the web; a bank with none starts on words.
  const [tasks, setTasks] = useState<PracticeTask[]>(() => {
    const exam = PRACTICE_QUESTION_TASKS.filter(
      (task) => !isWordTask(task) && counts[task] > 0,
    );
    return exam.length ? exam : ["meaning"];
  });
  const available = useMemo(
    () =>
      countQuestionAvailability({
        allowedSenseIds,
        difficulty,
        questionGroups,
        studyItems,
        tasks,
        oneSensePerWord,
      }),
    [
      allowedSenseIds,
      difficulty,
      oneSensePerWord,
      questionGroups,
      studyItems,
      tasks,
    ],
  );
  const maxAmount = Math.max(1, Math.min(available, ROOM_MAX_QUESTIONS));
  const chosenAmount = Math.min(amount, maxAmount);
  const queue = useMemo(
    () =>
      buildPracticeQueue({
        allowedSenseIds,
        difficulty,
        questionGroups,
        studyItems,
        amount: chosenAmount,
        oneSensePerWord,
        tasks,
      }),
    [
      allowedSenseIds,
      chosenAmount,
      difficulty,
      oneSensePerWord,
      questionGroups,
      studyItems,
      tasks,
    ],
  );

  const toggle = (task: PracticeTask, on: boolean) =>
    setTasks((current) =>
      on
        ? PRACTICE_QUESTION_TASKS.filter(
            (entry) => entry === task || current.includes(entry),
          )
        : current.filter((entry) => entry !== task),
    );
  const open = async () => {
    setBusy(true);
    try {
      const { code } = await createRoom({
        name: playerName(user),
        title:
          state.sets.find((entry) => entry.id === setId)?.setName ??
          t("practice.allSets"),
        seconds,
        questions: toRoomQuestions(queue),
      });
      router.replace({ pathname: "/rooms/[code]", params: { code } });
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  const hasExam = tasks.some((task) => !isWordTask(task));
  const empty = !Object.keys(state.words).length;

  return (
    // The scroll view is the screen itself, so the large title collapses into
    // the bar; the button ends the form and scrolls clear of the tab bar.
    <Screen>
      {empty ? (
        <EmptyState illustrated={false} title={t("rooms.emptyBank")} body="" />
      ) : (
        <>
          <ListGroup>
            <PickerRow
              title={t("practice.scopeHeader")}
              icon="books.vertical"
              value={setId}
              options={[
                { value: "", label: t("practice.allSets") },
                ...state.sets.map((entry) => ({
                  value: entry.id,
                  label: entry.setName,
                })),
              ]}
              onChange={setSetId}
            />
            {hasExam ? (
              <PickerRow
                title={t("practice.difficulty")}
                icon="dial.medium"
                value={difficulty}
                options={DIFFICULTIES.map((level) => ({
                  value: level,
                  label:
                    level === "all"
                      ? t("practice.allDifficulties")
                      : difficultyLabel(Number(level)),
                }))}
                onChange={setDifficulty}
              />
            ) : null}
          </ListGroup>

          <ListGroup title="題型">
            {PRACTICE_QUESTION_TASKS.map((task) => (
              <SwitchRow
                key={task}
                icon={isWordTask(task) ? "character.book.closed" : "doc.text"}
                title={questionFormatLabel(task)}
                subtitle={`可出 ${counts[task]} 題`}
                value={tasks.includes(task)}
                disabled={!counts[task] && !tasks.includes(task)}
                onValueChange={(on) => toggle(task, on)}
              />
            ))}
          </ListGroup>

          <ListGroup footer={t("practice.oneSenseHint")}>
            <SwitchRow
              icon="1.circle"
              title={t("practice.oneSensePerWord")}
              value={oneSensePerWord}
              onValueChange={setOneSensePerWord}
            />
          </ListGroup>

          <Amount
            label={t("practice.amount")}
            value={chosenAmount}
            unit="題"
            min={1}
            max={maxAmount}
            onChange={setAmount}
          />
          <Amount
            label={t("rooms.secondsLabel")}
            value={seconds}
            unit="秒"
            min={10}
            max={40}
            step={5}
            onChange={setSeconds}
          />

          <Button
            label={
              busy
                ? t("rooms.creating")
                : t("rooms.open", { count: queue.length })
            }
            icon="person.2.fill"
            busy={busy}
            disabled={!tasks.length || !queue.length}
            onPress={() => void open()}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: {
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: space.row,
    borderRadius: radius.card,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  amountHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  amountLabel: { ...type.row, color: colors.foreground },
  amountValue: {
    ...type.section,
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  range: { flexDirection: "row", justifyContent: "space-between" },
  rangeText: {
    ...type.hint,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
});
