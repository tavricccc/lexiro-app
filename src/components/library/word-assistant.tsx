import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AiRunPanel } from "@/components/ai/ai-run-panel";
import {
  WordFields,
  wordDraftIncomplete,
} from "@/components/library/word-fields";
import { Button } from "@/components/ui/button";
import { ListGroup } from "@/components/ui/list";
import {
  useAiGeneration,
  useReviewHandoff,
  type AiGenerationSnapshot,
} from "@/core/components/ai/use-ai-generation";
import { buildWordGenerationSources } from "@/core/ai-contract";
import { wordTask } from "@/core/lib/ai/tasks";
import { t } from "@/core/lib/i18n";
import { mergeWordDrafts } from "@/core/lib/word-generation";
import type { WordDraft } from "@/core/types";
import { colors, space, type } from "@/lib/theme";

export type AssistantPhase = "run" | "review";
export interface AssistedWordRow {
  examples: string[];
  meaningZh: string;
  pos: string;
  supplementary: boolean;
  word: string;
}

function toRows(drafts: WordDraft[]): AssistedWordRow[] {
  return drafts.flatMap((draft) =>
    draft.senses.map((sense) => ({
      examples: sense.examples,
      meaningZh: sense.meaning,
      pos: sense.pos,
      supplementary: sense.supplementary,
      word: draft.word,
    })),
  );
}

/**
 * The web's WordAssistant: the run on one step and the words it wrote on the
 * next, where each word can be opened and corrected before it is kept.
 */
export function WordAssistant({
  initialRun,
  onApply,
  onPhase,
  onRunChange,
  phase,
  sources: raw,
  applyLabel,
}: {
  initialRun?: AiGenerationSnapshot<WordDraft>;
  onApply: (rows: AssistedWordRow[]) => void | Promise<void>;
  onPhase: (phase: AssistantPhase) => void;
  onRunChange?: (snapshot: AiGenerationSnapshot<WordDraft>) => void;
  phase: AssistantPhase;
  sources: string;
  applyLabel?: string;
}) {
  const [applying, setApplying] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const sources = useMemo(() => buildWordGenerationSources(raw), [raw]);
  const task = useMemo(() => wordTask(sources), [sources]);
  const generation = useAiGeneration<WordDraft>({
    initialSnapshot: initialRun,
    task,
    merge: mergeWordDrafts,
    onSnapshotChange: onRunChange,
  });
  const { state } = generation;
  useReviewHandoff(state.status, () => onPhase("review"));
  const running = state.status === "running";

  if (phase === "review")
    return (
      <View style={styles.stack}>
        <ListGroup
          iconInset={false}
          footer={t("ai.completedItems", {
            completed: state.items.length,
            total: state.items.length,
            unit: t("ai.wordsUnit"),
          })}
        >
          {state.items.map((word, index) => (
            <Pressable
              key={`${word.word}:${index}`}
              accessibilityRole="button"
              accessibilityHint={t("setDetail.edit")}
              disabled={applying}
              onPress={() => setEditing(index)}
              style={({ pressed }) => [styles.word, pressed && styles.pressed]}
            >
              <View style={styles.wordBody}>
                <Text style={styles.headword}>{word.word}</Text>
                {word.senses.map((sense) => (
                  <View key={sense.id} style={styles.sense}>
                    <Text style={styles.meaning}>
                      <Text style={styles.pos}>{`${sense.pos}  `}</Text>
                      {sense.meaning}
                    </Text>
                    {sense.examples.map((example, at) => (
                      <Text key={at} style={styles.example}>
                        {example}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
              <SymbolView name="pencil" size={16} tintColor={colors.faint} />
            </Pressable>
          ))}
        </ListGroup>
        {saveError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {saveError}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={applyLabel ?? t("ai.applyWords")}
            icon="checkmark"
            busy={applying}
            disabled={!state.items.length}
            onPress={async () => {
              setApplying(true);
              setSaveError("");
              try {
                await onApply(toRows(state.items));
              } catch (reason) {
                setSaveError(
                  t("ai.applyFailed", {
                    message:
                      reason instanceof Error ? reason.message : String(reason),
                  }),
                );
                setApplying(false);
              }
            }}
          />
          <Button
            label={t("ai.reviewBack")}
            icon="chevron.left"
            variant="ghost"
            disabled={applying}
            onPress={() => onPhase("run")}
          />
        </View>
        {editing !== null && state.items[editing] ? (
          <WordEditSheet
            word={state.items[editing]}
            onClose={() => setEditing(null)}
            onSave={(draft) => {
              generation.setItems(
                state.items.map((entry, at) =>
                  at === editing ? draft : entry,
                ),
              );
              setEditing(null);
            }}
          />
        ) : null}
      </View>
    );

  return (
    <AiRunPanel
      actionLabel={t("managed.confirmGenerate")}
      billableCount={task.billableCount}
      configured={generation.configured}
      kind={task.kind}
      onCancel={generation.cancel}
      onResume={generation.canResume ? generation.resume : undefined}
      onReview={
        state.items.length && !running ? () => onPhase("review") : undefined
      }
      onStart={() => generation.start(task)}
      onTierChange={generation.setTier}
      ready={generation.ready}
      state={state}
      tier={generation.tier}
      unit={t("ai.wordsUnit")}
    />
  );
}

/** One generated word opened as a page sheet, edited with the usual fields. */
function WordEditSheet({
  word,
  onClose,
  onSave,
}: {
  word: WordDraft;
  onClose: () => void;
  onSave: (draft: WordDraft) => void;
}) {
  const [draft, setDraft] = useState(word);
  const [submitted, setSubmitted] = useState(false);
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.sheetBar}>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onClose}>
            <Text style={styles.sheetCancel}>{t("common.cancel")}</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>{t("setDetail.edit")}</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              setSubmitted(true);
              if (!wordDraftIncomplete(draft)) onSave(draft);
            }}
          >
            <Text style={styles.sheetDone}>完成</Text>
          </Pressable>
        </View>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.sheetContent}
        >
          <WordFields draft={draft} onChange={setDraft} submitted={submitted} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  word: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: space.row,
  },
  pressed: { backgroundColor: colors.secondary },
  wordBody: { flex: 1, gap: 6 },
  headword: { ...type.row, fontWeight: "600", color: colors.foreground },
  sense: { gap: 2 },
  meaning: { ...type.body, color: colors.foreground },
  pos: { fontStyle: "italic", color: colors.brand },
  example: { ...type.hint, color: colors.muted },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
  actions: { gap: 10 },
  sheet: { flex: 1, backgroundColor: colors.canvas },
  sheetBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.gutter,
    paddingVertical: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: "600", color: colors.foreground },
  sheetCancel: { fontSize: 17, color: colors.brand },
  sheetDone: { fontSize: 17, fontWeight: "600", color: colors.brand },
  sheetContent: {
    padding: space.gutter,
    gap: space.section,
    paddingBottom: 48,
  },
});
