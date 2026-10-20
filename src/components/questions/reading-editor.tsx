import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import Animated from "react-native-reanimated";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import { ResumeChoice } from "@/components/resume-choice";
import { PassageText } from "@/components/rooms/passage-text";
import { Card } from "@/components/ui/layout";
import {
  ActionRow,
  InputRow,
  ListGroup,
  ListRow,
  PickerRow,
  TextBlockRow,
} from "@/components/ui/list";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Segmented } from "@/components/ui/segmented";
import { countEnglishWords } from "@/core/ai-contract";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import { remapOptionReasons } from "@/core/components/questions/option-reasons";
import {
  questionSourceOptions,
  questionSourceWords,
} from "@/core/components/questions/question-source-scope";
import type { ReadingChildDraft } from "@/core/components/questions/reading-child-editor";
import {
  emptyReadingChild,
  migrateReadingFormDraft,
  readingFormFromPack,
  readingPackFromForm,
  updateReadingOptionBank,
  type ReadingFormDraft,
} from "@/core/components/questions/reading-form";
import { t } from "@/core/lib/i18n";
import { parseSenseKey } from "@/core/lib/library";
import {
  difficultyOptions,
  questionFormatLabel,
} from "@/core/lib/question-options";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type { ReadingPack } from "@/core/types";
import { colors, radius, type } from "@/lib/theme";
import { AnswerFields, ReasonFields, SensePickerRow } from "./answer-fields";
import { DeleteGroup } from "./question-editor";

type Pane = "passage" | "questions" | "bank";

/** The web's reading-pack editor: the passage, then each sub-question or blank. */
export function ReadingEditor({
  setId,
  current,
}: {
  setId: string;
  current?: ReadingPack;
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
  const initial = readingFormFromPack(current);
  const saved = useResumableDraft<ReadingFormDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:edit-reading:${current?.id ?? "new"}:${current?.updatedAt ?? "new"}`,
    initial,
  );
  const [pane, setPane] = useState<Pane>("passage");
  const [previewing, setPreviewing] = useState(false);
  const [index, setIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const draft = saved.draft;
  const title = t("questions.editFormat", {
    name: questionFormatLabel(draft.format),
  });

  if (saved.status === "checking") return null;
  if (saved.status === "offer" || saved.status === "invalid")
    return (
      <>
        <SheetHeader title={title} onCancel={() => router.back()} />
        <ResumeChoice
          invalid={saved.status === "invalid"}
          description={t(
            saved.status === "invalid"
              ? "draft.invalidDescription"
              : "draft.readingEditDescription",
          )}
          onResume={() => {
            const migrated = migrateReadingFormDraft(saved.pending!, initial);
            saved.resume();
            saved.update(migrated);
          }}
          onRestart={saved.restart}
        />
      </>
    );

  const { children, optionBank } = draft;
  const blanks = draft.format !== "reading";
  const at = Math.min(index, children.length - 1);
  const child = children[at];
  const change = (patch: Partial<ReadingFormDraft>) => {
    setError("");
    saved.update(patch);
  };
  const updateChild = (patch: Partial<ReadingChildDraft>) =>
    change({
      children: children.map((entry, position) =>
        position === at ? { ...entry, ...patch } : entry,
      ),
    });

  const childErrors = children.map((entry) => ({
    options: (optionBank ?? entry.options).some((option) => !option.trim()),
    prompt: !blanks && !entry.prompt.trim(),
    source: !parseSenseKey(entry.source, sourceWords),
  }));
  const fullPassage = children.reduce(
    (text, entry) =>
      entry.blank === undefined
        ? text
        : text.replace(
            `__${entry.blank}__`,
            (optionBank ?? entry.options)[entry.answerIndex] ?? "",
          ),
    draft.passage,
  );

  const save = async () => {
    setSubmitted(true);
    if (!draft.title.trim() || !draft.passage.trim()) {
      setError(t("questions.fixErrors"));
      setPane("passage");
      setPreviewing(false);
      return;
    }
    const missing = childErrors.findIndex(
      (errors) => errors.options || errors.prompt || errors.source,
    );
    if (missing >= 0) {
      setError(t("questions.fixErrors"));
      setIndex(missing);
      setPane(
        optionBank?.some((option) => !option.trim()) ? "bank" : "questions",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await useLibraryStore
        .getState()
        .saveQuestion(readingPackFromForm(draft, sourceWords, current));
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
          { value: "passage", label: t("questions.passage") },
          { value: "questions", label: t("questions.questionsPane") },
          ...(optionBank
            ? [{ value: "bank" as const, label: t("questions.sharedOptions") }]
            : []),
        ]}
        value={pane}
        onChange={setPane}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {pane === "passage" ? (
        <Animated.View key="passage" entering={swapIn} style={styles.stack}>
          <ListGroup>
            <InputRow
              label="標題"
              value={draft.title}
              invalid={submitted && !draft.title.trim()}
              autoCapitalize="sentences"
              onChangeText={(value) => change({ title: value })}
            />
            <PickerRow
              title={t("practice.difficulty")}
              icon="dial.medium"
              value={String(draft.difficulty)}
              options={difficultyOptions()}
              onChange={(value) =>
                change({ difficulty: Number(value) as 1 | 2 | 3 })
              }
            />
          </ListGroup>
          <ListGroup
            iconInset={false}
            footer={t("questions.passageWordCount", {
              count: countEnglishWords(fullPassage),
            })}
          >
            <ListRow
              title={
                previewing
                  ? t("questions.editPassage")
                  : t("questions.passagePreview")
              }
              accessory={
                <SymbolView
                  name={previewing ? "pencil" : "eye"}
                  size={17}
                  tintColor={colors.brand}
                />
              }
              onPress={() => setPreviewing((value) => !value)}
            />
            {previewing ? (
              <Animated.View entering={swapIn} style={styles.passage}>
                <PassageText
                  passage={draft.passage}
                  activeBlank={child?.blank}
                />
              </Animated.View>
            ) : (
              <TextBlockRow
                label={t("questions.passage")}
                value={draft.passage}
                onChangeText={(value) => change({ passage: value })}
              />
            )}
          </ListGroup>
          <ListGroup iconInset={false}>
            <TextBlockRow
              label={t("questions.explanation")}
              value={draft.explanation ?? ""}
              placeholder={t("questions.explanation")}
              onChangeText={(value) => change({ explanation: value })}
            />
          </ListGroup>
          {current ? <DeleteGroup id={current.id} /> : null}
        </Animated.View>
      ) : pane === "bank" && optionBank ? (
        <Animated.View key="bank" entering={swapIn} style={styles.stack}>
          <ListGroup iconInset={false} footer={t("questions.optionBankHint")}>
            {optionBank.map((option, position) => (
              <TextBlockRow
                key={position}
                label={String.fromCharCode(65 + position)}
                value={option}
                onChangeText={(value) =>
                  change(updateReadingOptionBank(draft, position, value))
                }
              />
            ))}
          </ListGroup>
        </Animated.View>
      ) : child ? (
        <Animated.View key="questions" entering={swapIn} style={styles.stack}>
          <Pager
            labels={children.map((entry, position) =>
              blanks && entry.blank
                ? t("questions.blankLabel", { index: entry.blank })
                : String(position + 1),
            )}
            index={at}
            flagged={childErrors.map(
              (errors) =>
                submitted && (errors.options || errors.prompt || errors.source),
            )}
            onChange={setIndex}
          />
          {blanks && child.blank ? (
            <Card style={styles.context}>
              <ScrollView nestedScrollEnabled style={styles.contextScroll}>
                <PassageText
                  passage={draft.passage}
                  activeBlank={child.blank}
                />
              </ScrollView>
            </Card>
          ) : null}
          <ListGroup
            iconInset={false}
            title={
              blanks && child.blank
                ? t("questions.blankLabel", { index: child.blank })
                : t("questions.childPrompt", { index: at + 1 })
            }
          >
            <SensePickerRow
              value={child.source}
              options={senses}
              invalid={submitted && childErrors[at].source}
              onChange={(source) => updateChild({ source })}
            />
            {blanks ? null : (
              <TextBlockRow
                label={t("questions.prompt")}
                value={child.prompt}
                placeholder={t("questions.prompt")}
                onChangeText={(prompt) => updateChild({ prompt })}
              />
            )}
            {optionBank ? (
              <PickerRow
                title={t("questions.blankAnswer", {
                  index: child.blank ?? at + 1,
                })}
                value={String(child.answerIndex)}
                options={optionBank.map((option, position) => ({
                  value: String(position),
                  label: `${String.fromCharCode(65 + position)} · ${option}`,
                }))}
                onChange={(value) =>
                  updateChild({
                    answerIndex: Number(value),
                    whyWrong: remapOptionReasons(
                      optionBank,
                      optionBank,
                      child.whyWrong,
                      Number(value),
                    ),
                  })
                }
              />
            ) : null}
          </ListGroup>
          {optionBank ? null : (
            <AnswerFields
              options={child.options}
              answerIndex={child.answerIndex}
              multiline={draft.format === "discourse"}
              error={
                submitted &&
                childErrors[at].options &&
                t("questions.optionsRequired")
              }
              onAnswerChange={(answerIndex) =>
                updateChild({
                  answerIndex,
                  whyWrong: remapOptionReasons(
                    child.options,
                    child.options,
                    child.whyWrong,
                    answerIndex,
                  ),
                })
              }
              onOptionChange={(position, value) => {
                const options = child.options.map((option, entry) =>
                  entry === position ? value : option,
                );
                updateChild({
                  options,
                  whyWrong: remapOptionReasons(
                    child.options,
                    options,
                    child.whyWrong,
                    child.answerIndex,
                  ),
                });
              }}
            />
          )}
          <ListGroup iconInset={false}>
            <TextBlockRow
              label={t("questions.explanation")}
              value={child.explanation ?? ""}
              placeholder={t("questions.explanation")}
              onChangeText={(explanation) => updateChild({ explanation })}
            />
          </ListGroup>
          <ReasonFields
            options={optionBank ?? child.options}
            answerIndex={child.answerIndex}
            reasons={child.whyWrong}
            onChange={(whyWrong) => updateChild({ whyWrong })}
          />
          {blanks ? null : (
            <ListGroup>
              <ActionRow
                title={t("questions.addChild")}
                onPress={() => {
                  change({ children: [...children, emptyReadingChild()] });
                  setIndex(children.length);
                }}
              />
              {children.length > 1 ? (
                <ActionRow
                  title={t("questions.removeChild", { index: at + 1 })}
                  destructive
                  onPress={() => {
                    change({
                      children: children.filter(
                        (_, position) => position !== at,
                      ),
                    });
                    setIndex(Math.max(0, at - 1));
                  }}
                />
              ) : null}
            </ListGroup>
          )}
        </Animated.View>
      ) : null}
    </FormScreen>
  );
}

/** Sub-questions as a row of chips; one with a missing field shows red. */
function Pager({
  labels,
  index,
  flagged,
  onChange,
}: {
  labels: string[];
  index: number;
  flagged: boolean[];
  onChange: (index: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pager}
    >
      {labels.map((label, position) => {
        const active = position === index;
        return (
          <PressableScale
            key={position}
            scaleTo={0.92}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onChange(position);
            }}
            style={[
              styles.chip,
              active && styles.chipActive,
              flagged[position] && !active && styles.chipFlagged,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                active && styles.chipTextActive,
                flagged[position] && !active && styles.chipTextFlagged,
              ]}
            >
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 24 },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
  passage: { paddingHorizontal: 20, paddingVertical: 14 },
  context: { paddingVertical: 12 },
  contextScroll: { maxHeight: 220 },
  pager: { gap: 8, paddingHorizontal: 2 },
  chip: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary },
  chipFlagged: { backgroundColor: colors.destructiveSoft },
  chipText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  chipTextActive: { color: colors.primaryForeground },
  chipTextFlagged: { color: colors.destructive },
});
