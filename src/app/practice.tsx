import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { handOffRun } from "@/components/practice/practice-run";
import { ResumeChoice } from "@/components/resume-choice";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen } from "@/components/ui/layout";
import {
  ListGroup,
  MultiPickerRow,
  PickerRow,
  SwitchRow,
} from "@/components/ui/list";
import { glide, swapIn, swapOut } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { isWordTask } from "@/core/components/practice/meaning-questions";
import {
  buildPracticeQueue,
  countQuestionAvailability,
  countTaskAvailability,
  type PracticeEntry,
} from "@/core/components/practice/practice-queue";
import {
  useRestorePracticeSession,
  type PracticeRestoreIssue,
} from "@/core/components/practice/use-practice-persistence";
import {
  liveSetIds,
  practiceScopeLabel,
  usePracticePool,
} from "@/core/components/practice/use-practice-pool";
import { usePracticeSetupChoices } from "@/core/components/practice/use-practice-setup-choices";
import { PRACTICE_TASKS } from "@/core/constants";
import { t } from "@/core/lib/i18n";
import { clearPracticeDraft } from "@/core/lib/practice-storage";
import { rememberPracticedSet } from "@/lib/last-practiced";
import { practiceTaskHint, practiceTaskLabel } from "@/core/lib/practice-tasks";
import { difficultyOptions } from "@/core/lib/question-options";
import { isPassageKind } from "@/core/lib/question-formats";
import { useLibraryStore } from "@/core/stores/library-store";
import type {
  PracticeSessionSnapshot,
  PracticeTask,
  WorkspaceQuestionDifficulty,
} from "@/core/types";
import {
  BRAND_DARK,
  BRAND_LIGHT,
  colors,
  radius,
  space,
  type,
} from "@/lib/theme";

const CUSTOM = "custom";
type Amount = number | typeof CUSTOM;
const PRESETS = [10, 20, 30, 50];
const AMOUNTS: { value: Amount; label: string }[] = [
  ...PRESETS.map((value) => ({ value, label: String(value) })),
  { value: CUSTOM, label: "自訂" },
];

const RESTORE_ISSUE: Record<PracticeRestoreIssue, string> = {
  unreadable:
    "上次的練習草稿無法讀取，原始資料仍保留。選擇重新開始才會清除原進度。",
  source:
    "找不到上次練習的部分來源，原草稿仍保留。選擇重新開始才會清除原進度。",
  storage: "暫時無法讀取或保存上次練習。重新開始會清除已有草稿。",
};

export default function PracticeSetupScreen() {
  const status = useLibraryStore((store) => store.status);
  if (status !== "ready") return null;
  return <PracticeSetup />;
}

/** The web's practice setup: scope, formats, difficulty, how many; resumes a saved session. */
function PracticeSetup() {
  const params = useLocalSearchParams<{ setId?: string }>();
  const initialSet = params.setId ?? "";
  const state = useLibraryStore((store) => store.state);
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const setup = usePracticeSetupChoices(initialSet);
  const { amount, difficulty, oneSensePerWord, tasks } = setup;
  const setIds = useMemo(
    () => liveSetIds(state.sets, setup.setIds),
    [setup.setIds, state.sets],
  );
  // Opened from a set, practice stays in that set; only the tab offers a choice.
  const fixedSet = initialSet
    ? state.sets.find((set) => set.id === initialSet)
    : undefined;

  const {
    allowedSenseIds,
    studyItems,
    allStudyItems,
    questionGroups,
    allQuestionItems,
  } = usePracticePool(state, setIds);
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
  // Saved 學測 questions first, as on the web; a bank without them starts on words.
  const activeTasks = useMemo<PracticeTask[]>(() => {
    const chosen = tasks.filter((task) => counts[task] > 0);
    if (chosen.length) return chosen;
    return counts.meaning > 0 ? ["meaning"] : [];
  }, [counts, tasks]);
  const available = useMemo(
    () =>
      countQuestionAvailability({
        allowedSenseIds,
        difficulty,
        questionGroups,
        studyItems,
        tasks: activeTasks,
        oneSensePerWord,
      }),
    [
      activeTasks,
      allowedSenseIds,
      difficulty,
      oneSensePerWord,
      questionGroups,
      studyItems,
    ],
  );

  // A saved session in progress is offered before anything else, as on the web.
  const [pendingSession, setPendingSession] = useState<{
    snapshot: PracticeSessionSnapshot;
    entries: PracticeEntry[];
  } | null>(null);
  const [restoreIssue, setRestoreIssue] = useState<PracticeRestoreIssue | null>(
    null,
  );
  const [checked, setChecked] = useState(false);
  const restoreAttempted = useRef(false);
  const retiredEntryIds = useMemo(
    () =>
      new Set(
        state.questions.flatMap((question) =>
          question.kind === "multipleChoice" &&
          question.questionStyle === "grammar"
            ? [`question:${question.id}`]
            : [],
        ),
      ),
    [state.questions],
  );
  useRestorePracticeSession({
    allQuestionItems,
    allStudyItems,
    checkRevision: 0,
    enabled: true,
    initialSet,
    library: state,
    retiredEntryIds,
    restoreAttempted,
    onOffer: useCallback((snapshot, entries) => {
      setPendingSession({ snapshot, entries });
      setChecked(true);
    }, []),
    onChecked: useCallback(() => setChecked(true), []),
    onUnavailable: useCallback((issue) => setRestoreIssue(issue), []),
  });

  const [preset, setPreset] = useState<Amount>(() =>
    PRESETS.includes(amount) ? amount : CUSTOM,
  );
  const customMax = Math.max(1, available);
  const shownAmount = Math.min(amount, customMax);

  if (!checked || setup.saved.status === "checking") return null;

  if (pendingSession || restoreIssue)
    return (
      <ResumeChoice
        invalid={Boolean(restoreIssue)}
        description={
          restoreIssue
            ? RESTORE_ISSUE[restoreIssue]
            : t("draft.practiceDescription")
        }
        onResume={() => {
          if (!pendingSession) return;
          const { snapshot, entries } = pendingSession;
          handOffRun({
            choices: {
              setIds: snapshot.setIds,
              tasks: snapshot.tasks,
              amount: snapshot.amount,
              difficulty: snapshot.difficulty,
              oneSensePerWord,
            },
            entries,
            snapshot,
          });
          setPendingSession(null);
          router.push("/session");
        }}
        onRestart={() => {
          try {
            clearPracticeDraft();
          } catch {
            // The next save overwrites it.
          }
          setup.restart();
          setPendingSession(null);
          setRestoreIssue(null);
        }}
      />
    );

  if (setup.saved.status === "offer" || setup.saved.status === "invalid")
    return (
      <ResumeChoice
        invalid={setup.saved.status === "invalid"}
        description={t(
          setup.saved.status === "invalid"
            ? "draft.invalidDescription"
            : "draft.practiceDescription",
        )}
        onResume={setup.resume}
        onRestart={setup.restart}
      />
    );

  const hasWords = Object.keys(state.words).length > 0;
  const formats = PRACTICE_TASKS.filter((task) => counts[task] > 0);
  const groups = [
    {
      title: t("practice.wordReview"),
      formats: formats.filter((task) => isWordTask(task)),
    },
    {
      title: t("practice.examFormats"),
      formats: formats.filter((task) => !isWordTask(task)),
    },
  ].filter((group) => group.formats.length);
  const hasExam = activeTasks.some((task) => !isWordTask(task));
  const sets = [...state.sets].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const queueLength = Math.min(shownAmount, available);

  const toggle = (task: PracticeTask, on: boolean) =>
    setup.changeTasks(
      PRACTICE_TASKS.filter((entry) =>
        entry === task ? on : activeTasks.includes(entry),
      ),
    );
  const changeAmount = (value: Amount) => {
    setPreset(value);
    if (value !== CUSTOM) setup.changeAmount(value);
  };
  const start = () => {
    const choices = {
      setIds,
      tasks: activeTasks,
      amount: shownAmount,
      difficulty,
      oneSensePerWord,
    };
    const entries = buildPracticeQueue({
      allowedSenseIds,
      difficulty,
      questionGroups,
      studyItems,
      amount: shownAmount,
      oneSensePerWord,
      tasks: activeTasks,
    });
    if (!entries.length) return;
    setup.clear();
    handOffRun({ choices, entries });
    if (setIds.length) rememberPracticedSet(setIds[0]);
    router.push("/session");
  };

  return (
    <View style={styles.root}>
      {fixedSet ? <Stack.Screen options={{ title: fixedSet.setName }} /> : null}
      <Screen contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        {!formats.length ? (
          <EmptyState
            illustrated={false}
            title={t("practice.noContent")}
            body={t("practice.addWordsHint")}
          />
        ) : (
          <>
            {fixedSet ? null : (
              <ListGroup title={t("practice.scopeHeader")}>
                <MultiPickerRow
                  title={t("practice.set")}
                  icon="books.vertical"
                  allLabel={t("practice.allSets")}
                  summary={practiceScopeLabel(state.sets, setIds)}
                  value={setIds}
                  options={sets.map((set) => ({
                    value: set.id,
                    label: set.setName,
                  }))}
                  onChange={setup.changeSets}
                />
              </ListGroup>
            )}
            {groups.map((group) => (
              <ListGroup
                key={group.title}
                title={group.title}
                footer={
                  group.formats.some(isWordTask) &&
                  hasWords &&
                  counts.meaning === 0
                    ? t("practice.meaningPoolHint")
                    : undefined
                }
              >
                {group.formats.map((task) => (
                  <SwitchRow
                    key={task}
                    icon={
                      task === "meaning"
                        ? "character.book.closed"
                        : task === "reverse"
                          ? "textformat.abc"
                          : isPassageKind(task)
                            ? "doc.text"
                            : "list.bullet.rectangle"
                    }
                    title={practiceTaskLabel(task)}
                    subtitle={`${practiceTaskHint(task)} · ${t("practice.formatReady", { count: counts[task] })}`}
                    value={activeTasks.includes(task)}
                    onValueChange={(on) => toggle(task, on)}
                  />
                ))}
              </ListGroup>
            ))}

            <ListGroup footer={t("practice.oneSenseHint")}>
              {hasExam ? (
                <PickerRow
                  title={t("practice.difficulty")}
                  icon="dial.medium"
                  value={difficulty}
                  options={difficultyOptions(t("practice.allDifficulties")).map(
                    (option) => ({
                      value: option.value as WorkspaceQuestionDifficulty,
                      label: option.label,
                    }),
                  )}
                  onChange={setup.changeDifficulty}
                />
              ) : null}
              <SwitchRow
                title={t("practice.oneSensePerWord")}
                icon="1.circle"
                value={oneSensePerWord}
                onValueChange={setup.changeOneSense}
              />
            </ListGroup>

            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockTitle}>{t("practice.amount")}</Text>
                <Text style={styles.blockAside}>
                  {t("practice.readyQuestions", { count: available })}
                </Text>
              </View>
              <Segmented
                options={AMOUNTS}
                value={preset}
                onChange={changeAmount}
              />
              {preset === CUSTOM ? (
                <Animated.View
                  entering={swapIn}
                  exiting={swapOut}
                  layout={glide}
                  style={styles.custom}
                >
                  <Text style={styles.customValue}>
                    {t("practice.amountValue", { count: shownAmount })}
                  </Text>
                  <Slider
                    minimumValue={1}
                    maximumValue={customMax}
                    step={1}
                    value={shownAmount}
                    disabled={available < 2}
                    minimumTrackTintColor={
                      scheme === "dark" ? BRAND_DARK : BRAND_LIGHT
                    }
                    onValueChange={(value) => {
                      if (value !== amount) void Haptics.selectionAsync();
                      setup.changeAmount(value);
                    }}
                  />
                  <View style={styles.customRange}>
                    <Text style={styles.blockAside}>1</Text>
                    <Text style={styles.blockAside}>{customMax}</Text>
                  </View>
                </Animated.View>
              ) : null}
            </View>

          </>
        )}
      </Screen>

      <View
        style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <Button
          label={
            queueLength
              ? t("practice.beginCount", { count: queueLength })
              : t("practice.noSelection")
          }
          icon="play.fill"
          variant="field"
          disabled={!activeTasks.length || !queueLength}
          onPress={start}
          style={styles.start}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  block: { gap: 10 },
  blockHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  blockTitle: { ...type.section, color: colors.foreground },
  blockAside: {
    ...type.hint,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  custom: {
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: space.row,
    borderRadius: radius.card,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  customValue: {
    ...type.title,
    fontSize: 32,
    color: colors.foreground,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  customRange: { flexDirection: "row", justifyContent: "space-between" },
  start: { minHeight: 60 },
  // The start action stays at the bottom while the scope list scrolls.
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: space.gutter,
    backgroundColor: colors.canvas,
  },
});
