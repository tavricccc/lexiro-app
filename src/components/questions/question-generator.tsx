import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AiRunPanel } from "@/components/ai/ai-run-panel";
import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import { ResumeChoice } from "@/components/resume-choice";
import { Button } from "@/components/ui/button";
import { FinishPanel } from "@/components/ui/finish-panel";
import { EmptyState } from "@/components/ui/layout";
import { CheckRow, ListGroup, ListRow, PickerRow } from "@/components/ui/list";
import {
  useAiGeneration,
  useReviewHandoff,
} from "@/core/components/ai/use-ai-generation";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import {
  rebindQuestionDraftSources,
  retainUnfinishedQuestionCheckpoint,
  type QuestionDraft,
} from "@/core/components/questions/question-generation-draft";
import { questionSourceWords } from "@/core/components/questions/question-source-scope";
import { useSaveGeneratedQuestions } from "@/core/components/questions/use-save-generated-questions";
import { questionTask } from "@/core/lib/ai/tasks";
import type { DraftPersistence } from "@/core/lib/draft-persistence";
import { t } from "@/core/lib/i18n";
import { isPassageKind } from "@/core/lib/question-formats";
import {
  getSetGenerationWords,
  type GeneratedQuestionDifficulty,
  type GeneratedQuestionKind,
} from "@/core/lib/question-generation";
import {
  difficultyLabel,
  difficultyOptions,
  PASSAGE_FORMAT_VALUES,
  questionFormatHint,
  questionFormatLabel,
  SENTENCE_STYLES,
} from "@/core/lib/question-options";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type { LibraryQuestion } from "@/core/types";
import { colors, type } from "@/lib/theme";
import { GeneratedQuestionResults } from "./generated-question-results";

const FORMATS: GeneratedQuestionKind[] = [
  ...SENTENCE_STYLES,
  ...PASSAGE_FORMAT_VALUES,
];

const FORMAT_ICONS: Record<
  string,
  | "textformat"
  | "doc.text"
  | "square.grid.2x2"
  | "text.badge.plus"
  | "text.book.closed"
> = {
  vocabulary: "textformat",
  cloze: "doc.text",
  wordBank: "square.grid.2x2",
  discourse: "text.badge.plus",
  reading: "text.book.closed",
};

/** The web's AI 出題: configure, run, review and save, in the editing sheet. */
export function QuestionGenerator({ setId }: { setId?: string }) {
  const uid = useCloudStore((store) => store.user?.uid);
  const state = useLibraryStore((store) => store.state);
  const [recovery, setRecovery] = useState<{
    setId: string;
    error: string;
  } | null>(null);
  const saved = useResumableDraft<QuestionDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:questions:${setId ?? "all"}`,
    {
      step: "configure",
      chosenSetId: "",
      kind: "vocabulary",
      difficulty: 2,
      excludedQuestionIds: [],
    },
  );
  const title = t("questions.generateTitle");

  const restoreSources = (pending: QuestionDraft, sourceSetId: string) => {
    try {
      saved.update(
        rebindQuestionDraftSources(
          pending,
          sourceSetId,
          Object.values(questionSourceWords(state, sourceSetId)),
        ),
      );
      setRecovery(null);
    } catch (reason) {
      setRecovery({
        setId: sourceSetId,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };

  if (saved.status === "checking") return null;
  if (saved.status === "offer" || saved.status === "invalid")
    return (
      <>
        <SheetHeader title={title} onCancel={() => router.back()} />
        <ResumeChoice
          description={t(
            saved.status === "invalid"
              ? "draft.invalidDescription"
              : "draft.questionDescription",
          )}
          invalid={
            saved.status === "invalid" ||
            Boolean(saved.pending && !FORMATS.includes(saved.pending.kind))
          }
          onRestart={saved.restart}
          onResume={() => {
            const pending = saved.pending!;
            saved.resume();
            restoreSources(pending, setId ?? pending.chosenSetId);
          }}
        />
      </>
    );
  if (recovery)
    return (
      <FormScreen>
        <SheetHeader
          title={t("questions.draftRecoveryTitle")}
          onCancel={() => router.back()}
        />
        <EmptyState
          illustrated={false}
          title={t("questions.draftRecoveryKept", {
            count: saved.draft.run?.state.items.length ?? 0,
          })}
          body={`${recovery.error}\n${t("questions.draftRecoveryHint")}`}
        />
        {setId ? null : (
          <ListGroup>
            <PickerRow
              title={t("questions.sourceSet")}
              icon="folder"
              value={recovery.setId}
              options={state.sets.map((entry) => ({
                value: entry.id,
                label: entry.setName,
              }))}
              onChange={(id) => {
                saved.update({ chosenSetId: id });
                setRecovery({ ...recovery, setId: id });
              }}
            />
          </ListGroup>
        )}
        <Button
          label={t("questions.rebindDraftSources")}
          icon="checkmark"
          disabled={!recovery.setId}
          onPress={() => restoreSources(saved.draft, recovery.setId)}
        />
        <Button
          label={t("draft.restart")}
          variant="ghost"
          onPress={saved.restart}
        />
      </FormScreen>
    );
  return (
    <GeneratorFlow
      setId={setId}
      draft={saved.draft}
      persistence={saved.persistence}
      update={saved.update}
      clear={saved.clear}
    />
  );
}

function GeneratorFlow({
  setId,
  draft,
  persistence,
  update,
  clear,
}: {
  setId?: string;
  draft: QuestionDraft;
  persistence: DraftPersistence;
  update: (patch: Partial<QuestionDraft>) => void;
  clear: () => void;
}) {
  const state = useLibraryStore((store) => store.state);
  const { step, chosenSetId, kind, difficulty } = draft;
  const { saving, save, saveError, saveDiagnostic, clearError } =
    useSaveGeneratedQuestions(() => {
      update({ step: "done", run: undefined });
      clear();
    });

  const defaultSetId =
    state.sets.find((entry) =>
      (state.memberships[entry.id] ?? []).some(
        (membership) => membership.senseIds.length > 0,
      ),
    )?.id ??
    state.sets[0]?.id ??
    "";
  const selectedSetId = setId ?? (chosenSetId || defaultSetId);
  const selectedSet = state.sets.find((entry) => entry.id === selectedSetId);
  const pool = useMemo(() => Object.values(state.words), [state.words]);
  const words = useMemo(
    () => getSetGenerationWords(pool, state.memberships[selectedSetId] ?? []),
    [pool, selectedSetId, state.memberships],
  );
  const senseCount = words.reduce(
    (count, word) => count + word.senses.length,
    0,
  );
  const task = useMemo(
    () => questionTask(words, kind, difficulty),
    [words, kind, difficulty],
  );
  const generation = useAiGeneration<LibraryQuestion>({
    initialSnapshot: draft.run,
    task,
    onSnapshotChange: (run) =>
      update({ run: retainUnfinishedQuestionCheckpoint(draft.run, run) }),
    merge: (items) => {
      const byId = new Map<string, LibraryQuestion>();
      for (const item of items) byId.set(item.fingerprint || item.id, item);
      return [...byId.values()];
    },
  });
  const { reset, state: run } = generation;
  const selectedItems = run.items.filter(
    (item) => !draft.excludedQuestionIds.includes(item.id),
  );
  useReviewHandoff(run.status, () => update({ step: "review" }));

  const configKey = `${selectedSetId}:${kind}:${difficulty}`;
  const previousConfig = useRef(configKey);
  useEffect(() => {
    if (previousConfig.current === configKey) return;
    previousConfig.current = configKey;
    reset();
  }, [configKey, reset]);

  const close = () => {
    generation.cancel();
    leaveFlow(persistence, clear);
  };
  const toConfigure = () => {
    if (saving) return;
    generation.cancel();
    update({ step: "configure" });
  };

  const recap = (
    <ListGroup>
      <ListRow
        icon="slider.horizontal.3"
        title={`${questionFormatLabel(kind)} · ${difficultyLabel(difficulty)}`}
        subtitle={`${selectedSet?.setName ?? ""} · ${t("questions.scopeChosen", { count: senseCount })}`}
        chevron
        onPress={toConfigure}
      />
    </ListGroup>
  );

  if (step === "done")
    return (
      <>
        <SheetHeader
          title={t("questions.generateTitle")}
          onCancel={() => router.back()}
          cancelLabel="完成"
        />
        <FinishPanel
          title={t("questions.generatedCount", { count: selectedItems.length })}
          description={t("questions.generatedDescription")}
          onFinish={() => router.back()}
          moreLabel={t("questions.generateMore")}
          moreIcon="sparkles"
          onMore={() => {
            reset();
            update({ step: "configure", run: undefined });
          }}
        />
      </>
    );

  if (step === "configure")
    return (
      <FormScreen>
        <SheetHeader
          title={t("questions.generateTitle")}
          onCancel={close}
          saveLabel={t("questions.next")}
          onSave={
            senseCount
              ? () => update({ step: "run", chosenSetId: selectedSetId })
              : undefined
          }
        />
        {selectedSet ? (
          <ListGroup>
            {setId ? (
              <ListRow
                icon="folder"
                title={t("practice.set")}
                detail={selectedSet.setName}
              />
            ) : (
              <PickerRow
                icon="folder"
                title={t("practice.set")}
                value={selectedSetId}
                options={state.sets.map((entry) => ({
                  value: entry.id,
                  label: entry.setName,
                }))}
                onChange={(id) => update({ chosenSetId: id })}
              />
            )}
            <ListRow
              icon="text.badge.checkmark"
              title={t("questions.scopeTitle")}
              detail={t("questions.scopeSummary", { count: senseCount })}
            />
          </ListGroup>
        ) : null}
        {!senseCount ? (
          <>
            <EmptyState
              illustrated={false}
              title={t(
                selectedSet ? "questions.noSetWords" : "questions.noSets",
              )}
              body={t(
                selectedSet
                  ? "questions.noSetWordsHint"
                  : "questions.noSetsHint",
              )}
            />
            <Button
              label={t(
                selectedSet
                  ? "questions.addWordsFirst"
                  : "practice.addWordsFirst",
              )}
              icon="plus"
              onPress={() =>
                selectedSet
                  ? router.replace({
                      pathname: "/sets/[setId]/add",
                      params: { setId: selectedSetId },
                    })
                  : router.replace("/sets/new")
              }
            />
          </>
        ) : (
          <>
            <ListGroup title={t("questions.stepFormat")}>
              {FORMATS.map((format) => (
                <CheckRow
                  key={format}
                  icon={FORMAT_ICONS[format] ?? "doc.text"}
                  title={questionFormatLabel(format)}
                  subtitle={questionFormatHint(format)}
                  checked={kind === format}
                  onPress={() => update({ kind: format })}
                />
              ))}
            </ListGroup>
            <ListGroup>
              <PickerRow
                icon="chart.bar"
                title={t("practice.difficulty")}
                value={String(difficulty)}
                options={difficultyOptions()}
                onChange={(value) =>
                  update({
                    difficulty: Number(value) as GeneratedQuestionDifficulty,
                  })
                }
              />
            </ListGroup>
            <Button
              label={t("questions.next")}
              icon="arrow.right"
              onPress={() =>
                update({ step: "run", chosenSetId: selectedSetId })
              }
            />
          </>
        )}
      </FormScreen>
    );

  if (step === "review")
    return (
      <FormScreen>
        <SheetHeader
          title={t("questions.stepReview")}
          cancelIcon="chevron.left"
          cancelLabel={t("ai.reviewBack")}
          busy={saving}
          onCancel={() => update({ step: "run" })}
          saveLabel="儲存"
          onSave={
            selectedItems.length ? () => void save(selectedItems) : undefined
          }
        />
        {recap}
        {saveError ? (
          <View accessibilityRole="alert" style={styles.alert}>
            <Text style={styles.alertText}>{saveError}</Text>
            {saveDiagnostic ? (
              <Text style={styles.alertDetail}>{saveDiagnostic}</Text>
            ) : null}
          </View>
        ) : null}
        <GeneratedQuestionResults
          items={run.items}
          words={words}
          excludedIds={draft.excludedQuestionIds}
          onToggle={(id) =>
            update({
              excludedQuestionIds: draft.excludedQuestionIds.includes(id)
                ? draft.excludedQuestionIds.filter((value) => value !== id)
                : [...draft.excludedQuestionIds, id],
            })
          }
        />
        <Text style={styles.count}>
          {t("questions.selectedQuestions", { count: selectedItems.length })}
        </Text>
        <Button
          label={t(
            saveError ? "questions.retrySave" : "questions.saveSelected",
            {
              count: selectedItems.length,
            },
          )}
          icon="checkmark"
          busy={saving}
          disabled={!selectedItems.length}
          onPress={() => void save(selectedItems)}
        />
      </FormScreen>
    );

  return (
    <FormScreen>
      <SheetHeader
        title={t("questions.stepRun")}
        cancelIcon="chevron.left"
        cancelLabel={t("common.back")}
        busy={saving}
        onCancel={toConfigure}
      />
      {recap}
      <AiRunPanel
        actionLabel={t("questions.generate")}
        configured={generation.configured}
        ready={generation.ready}
        onCancel={generation.cancel}
        onResume={generation.canResume ? generation.resume : undefined}
        onAppend={
          generation.canAppend && task.steps.length
            ? () => generation.append(task)
            : undefined
        }
        onReview={
          run.items.length && run.status !== "running"
            ? () => update({ step: "review" })
            : undefined
        }
        onStart={() => {
          clearError();
          update({ excludedQuestionIds: [] });
          generation.start(task);
        }}
        kind={task.kind}
        billableCount={task.billableCount}
        appendBillableCount={task.billableCount}
        tier={generation.tier}
        onTierChange={generation.setTier}
        state={run}
        unit={t(isPassageKind(kind) ? "ai.packsUnit" : "ai.questionsUnit")}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  alert: {
    gap: 4,
    padding: 16,
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: colors.destructiveSoft,
  },
  alertText: { ...type.body, fontWeight: "600", color: colors.destructive },
  alertDetail: { ...type.hint, color: colors.destructive },
  count: { ...type.hint, color: colors.muted, textAlign: "center" },
});
