import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import { ResumeChoice } from "@/components/resume-choice";
import {
  ActionRow,
  ListGroup,
  PickerRow,
  TextBlockRow,
} from "@/components/ui/list";
import { swapIn } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { useResumableDraft } from "@/core/lib/use-resumable-draft";
import {
  normalizeOptionReasons,
  remapOptionReasons,
} from "@/core/components/questions/option-reasons";
import {
  questionSourceOptions,
  questionSourceWords,
} from "@/core/components/questions/question-source-scope";
import { t } from "@/core/lib/i18n";
import { randomUUID } from "@/core/lib/id";
import { parseSenseKey, senseKey } from "@/core/lib/library";
import { difficultyOptions } from "@/core/lib/question-options";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type {
  LibraryQuestion,
  MultipleChoiceQuestion,
  QuestionStyle,
} from "@/core/types";
import { colors, type } from "@/lib/theme";
import { AnswerFields, ReasonFields, SensePickerRow } from "./answer-fields";
import { confirmDeleteQuestion } from "./delete-question";
import { QuestionPreview } from "./question-preview";

interface Values {
  answerIndex: number;
  difficulty: 1 | 2 | 3;
  explanation: string;
  options: string[];
  prompt: string;
  questionStyle: QuestionStyle;
  source: string;
  whyWrong?: Record<string, string>;
  reasonsVersion: 1;
}

type Pane = "edit" | "preview";

/** The web's single-question editor: source sense, prompt, four options, reasons. */
export function QuestionEditor({
  setId,
  current,
}: {
  setId: string;
  current?: MultipleChoiceQuestion;
}) {
  const uid = useCloudStore((store) => store.user?.uid);
  const state = useLibraryStore((store) => store.state);
  const sourceWords = useMemo(
    () => questionSourceWords(state, setId),
    [setId, state],
  );
  const senses = useMemo(
    () => questionSourceOptions(sourceWords),
    [sourceWords],
  );
  const initial: Values = current
    ? {
        answerIndex: current.answerIndex,
        difficulty: current.difficulty,
        explanation: current.explanation ?? "",
        options: [0, 1, 2, 3].map((index) => current.options[index] ?? ""),
        prompt: current.prompt,
        questionStyle: current.questionStyle,
        source: senseKey(current.wordKey, current.senseId),
        whyWrong: current.whyWrong,
        reasonsVersion: 1,
      }
    : {
        answerIndex: 0,
        difficulty: 1,
        explanation: "",
        options: ["", "", "", ""],
        prompt: "",
        questionStyle: "vocabulary",
        source: senses[0]?.value ?? "",
        reasonsVersion: 1,
      };
  const saved = useResumableDraft<Values>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:edit-question:${current?.id ?? "new"}:${current?.updatedAt ?? "new"}`,
    initial,
  );
  const [pane, setPane] = useState<Pane>("edit");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = t("questions.editFormat", { name: t("questions.vocabulary") });

  if (saved.status === "checking") return null;
  if (saved.status === "offer" || saved.status === "invalid")
    return (
      <>
        <SheetHeader title={title} onCancel={() => router.back()} />
        <ResumeChoice
          invalid={
            saved.status === "invalid" ||
            saved.pending?.questionStyle === "grammar"
          }
          description={t(
            saved.status === "invalid"
              ? "draft.invalidDescription"
              : "draft.questionEditDescription",
          )}
          onResume={() => {
            // Drafts saved before reasons were keyed by option lack the version.
            const pending = saved.pending! as
              Values | Omit<Values, "reasonsVersion">;
            saved.resume();
            if (!("reasonsVersion" in pending))
              saved.update({
                reasonsVersion: 1,
                whyWrong: remapOptionReasons(
                  initial.options,
                  pending.options,
                  initial.whyWrong,
                  pending.answerIndex,
                ),
              });
          }}
          onRestart={saved.restart}
        />
      </>
    );

  const values = saved.draft;
  const change = (patch: Partial<Values>) => {
    setError("");
    saved.update(patch);
  };
  const missingOption = values.options.some((option) => !option.trim());
  const source = parseSenseKey(values.source, sourceWords);

  const save = async () => {
    setSubmitted(true);
    if (!values.prompt.trim() || missingOption) {
      setError(
        missingOption
          ? t("questions.optionsRequired")
          : t("questions.fixErrors"),
      );
      setPane("edit");
      return;
    }
    if (!source) {
      setError(t("questions.sourceOutsideSet"));
      setPane("edit");
      return;
    }
    const timestamp = new Date().toISOString();
    const question: MultipleChoiceQuestion = {
      answerIndex: values.answerIndex,
      createdAt: current?.createdAt ?? timestamp,
      difficulty: values.difficulty,
      explanation: values.explanation.trim() || undefined,
      whyWrong: normalizeOptionReasons(
        values.options,
        values.whyWrong,
        values.answerIndex,
      ),
      fingerprint: current?.fingerprint ?? "pending",
      id: current?.id ?? randomUUID(),
      kind: "multipleChoice",
      options: values.options.map((value) => value.trim()),
      prompt: values.prompt.trim(),
      questionStyle: values.questionStyle,
      senseId: source.senseId,
      updatedAt: timestamp,
      wordKey: source.wordKey,
      ...(current ? { trap: current.trap } : {}),
    };
    setBusy(true);
    try {
      const result = await useLibraryStore
        .getState()
        .saveQuestion(question as LibraryQuestion);
      if (result === "duplicate") {
        setError(t("questions.duplicate"));
        setBusy(false);
        return;
      }
      saved.clear();
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <SheetHeader
        title={title}
        saveLabel="儲存"
        busy={busy}
        onSave={() => void save()}
        onCancel={() => leaveFlow(saved.persistence, saved.clear)}
      />
      <Segmented
        options={[
          { value: "edit", label: t("questions.editing") },
          { value: "preview", label: t("questions.preview") },
        ]}
        value={pane}
        onChange={setPane}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {pane === "edit" ? (
        <Animated.View key="edit" entering={swapIn} style={styles.stack}>
          <ListGroup>
            <PickerRow
              title={t("practice.difficulty")}
              icon="dial.medium"
              value={String(values.difficulty)}
              options={difficultyOptions()}
              onChange={(value) =>
                change({ difficulty: Number(value) as Values["difficulty"] })
              }
            />
          </ListGroup>
          <ListGroup iconInset={false}>
            <SensePickerRow
              value={values.source}
              options={senses}
              invalid={submitted && !source}
              onChange={(value) => change({ source: value })}
            />
          </ListGroup>
          <ListGroup iconInset={false}>
            <TextBlockRow
              label={t("questions.prompt")}
              value={values.prompt}
              placeholder={t("questions.prompt")}
              onChangeText={(prompt) => change({ prompt })}
            />
          </ListGroup>
          <AnswerFields
            options={values.options}
            answerIndex={values.answerIndex}
            error={submitted && missingOption && t("questions.optionsRequired")}
            onAnswerChange={(answerIndex) =>
              change({
                answerIndex,
                whyWrong: remapOptionReasons(
                  values.options,
                  values.options,
                  values.whyWrong,
                  answerIndex,
                ),
              })
            }
            onOptionChange={(index, value) => {
              const options = values.options.map((option, at) =>
                at === index ? value : option,
              );
              change({
                options,
                whyWrong: remapOptionReasons(
                  values.options,
                  options,
                  values.whyWrong,
                  values.answerIndex,
                ),
              });
            }}
          />
          <ListGroup iconInset={false}>
            <TextBlockRow
              label={t("questions.explanation")}
              value={values.explanation}
              placeholder={t("questions.explanation")}
              onChangeText={(explanation) => change({ explanation })}
            />
          </ListGroup>
          <ReasonFields
            options={values.options}
            answerIndex={values.answerIndex}
            reasons={values.whyWrong}
            onChange={(whyWrong) => change({ whyWrong })}
          />
          {current ? <DeleteGroup id={current.id} /> : null}
        </Animated.View>
      ) : (
        <Animated.View key="preview" entering={swapIn}>
          {source ? (
            <QuestionPreview
              prompt={values.prompt}
              options={values.options}
              answerIndex={values.answerIndex}
              explanation={values.explanation}
              whyWrong={values.whyWrong}
            />
          ) : (
            <Text style={styles.hint}>{t("questions.selectSense")}</Text>
          )}
        </Animated.View>
      )}
    </FormScreen>
  );
}

/** 刪除題目, behind the same confirmation as the web. */
export function DeleteGroup({ id }: { id: string }) {
  return (
    <ListGroup>
      <ActionRow
        title={t("questions.delete")}
        icon="trash"
        destructive
        onPress={() => confirmDeleteQuestion(id, () => router.back())}
      />
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 24 },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
  hint: { ...type.body, color: colors.muted },
});
