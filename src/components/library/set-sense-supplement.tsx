import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AiRunPanel } from "@/components/ai/ai-run-panel";
import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import { ResumeChoice } from "@/components/resume-choice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import {
  ActionRow,
  CheckRow,
  ListGroup,
  PickerRow,
} from "@/components/ui/list";
import {
  useAiGeneration,
  useReviewHandoff,
  type AiGenerationSnapshot,
} from "@/core/components/ai/use-ai-generation";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import { rebindSupplementSources } from "@/core/components/library/supplement-source-scope";
import { questionSourceWords } from "@/core/components/questions/question-source-scope";
import { supplementTask } from "@/core/lib/ai/tasks";
import type { DraftPersistence } from "@/core/lib/draft-persistence";
import { t } from "@/core/lib/i18n";
import { setWordDrafts } from "@/core/lib/word-edit";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type { WordDraft, WordKey } from "@/core/types";
import { colors, space, type } from "@/lib/theme";

const LIMITS = ["1", "2", "3"] as const;
type Limit = 1 | 2 | 3;
const PAGE = 60;

interface SupplementDraft {
  chosen: WordKey[];
  limit: Limit;
  phase: "run" | "review";
  run?: AiGenerationSnapshot<WordDraft>;
}

/** The web's 補充詞義: ask for the meanings a set's words do not have yet. */
export function SetSenseSupplement({ setId }: { setId: string }) {
  const uid = useCloudStore((store) => store.user?.uid);
  const state = useLibraryStore((store) => store.state);
  const [recoveryChosen, setRecoveryChosen] = useState<WordKey[] | null>(null);
  const words = useMemo(
    () => Object.values(questionSourceWords(state, setId)),
    [setId, state],
  );
  const saved = useResumableDraft<SupplementDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:supplement:${setId}`,
    { chosen: [], limit: 1, phase: "run" },
  );
  const title = t("supplement.title");

  if (saved.status === "checking") return null;
  if (saved.status === "offer" || saved.status === "invalid")
    return (
      <>
        <SheetHeader title={title} onCancel={() => router.back()} />
        <ResumeChoice
          description={t(
            saved.status === "invalid"
              ? "draft.invalidDescription"
              : "draft.supplementDescription",
          )}
          invalid={saved.status === "invalid"}
          onRestart={saved.restart}
          onResume={() => {
            const rebound = rebindSupplementSources(
              saved.pending!.chosen,
              words,
            );
            saved.resume();
            if (rebound.missing.length) setRecoveryChosen(rebound.selected);
            else saved.update({ chosen: rebound.selected });
          }}
        />
      </>
    );
  if (recoveryChosen)
    return (
      <FormScreen>
        <SheetHeader
          title={title}
          onCancel={() => router.back()}
          saveLabel={t("supplement.confirmSources")}
          onSave={
            recoveryChosen.length
              ? () => {
                  saved.update({ chosen: recoveryChosen });
                  setRecoveryChosen(null);
                }
              : undefined
          }
        />
        <Text style={styles.notice}>{t("supplement.sourcesUnavailable")}</Text>
        <ListGroup title={t("supplement.wordsHeader")}>
          {words.map((word) => (
            <CheckRow
              key={word.wordKey}
              icon="textformat.abc"
              title={word.word}
              detail={t("supplement.existing", { count: word.senses.length })}
              checked={recoveryChosen.includes(word.wordKey)}
              onPress={() =>
                setRecoveryChosen(
                  recoveryChosen.includes(word.wordKey)
                    ? recoveryChosen.filter((key) => key !== word.wordKey)
                    : [...recoveryChosen, word.wordKey],
                )
              }
            />
          ))}
        </ListGroup>
        {saved.draft.run?.state.items.length ? (
          <ListGroup title={t("supplement.resultsHeader")} iconInset={false}>
            {saved.draft.run.state.items.map((draft) => (
              <SupplementResult draft={draft} key={draft.word} />
            ))}
          </ListGroup>
        ) : null}
      </FormScreen>
    );
  return (
    <SupplementFlow
      setId={setId}
      draft={saved.draft}
      persistence={saved.persistence}
      update={saved.update}
      clear={saved.clear}
    />
  );
}

function SupplementFlow({
  setId,
  draft,
  persistence,
  update,
  clear,
}: {
  setId: string;
  draft: SupplementDraft;
  persistence: DraftPersistence;
  update: (patch: Partial<SupplementDraft>) => void;
  clear: () => void;
}) {
  const state = useLibraryStore((store) => store.state);
  const { chosen, limit, phase } = draft;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const words = useMemo(
    () =>
      (state.memberships[setId] ?? []).flatMap((membership) => {
        const word = state.words[membership.wordKey];
        if (!word) return [];
        const senses = word.senses.filter((sense) =>
          membership.senseIds.includes(sense.id),
        );
        return senses.length
          ? [{ wordKey: word.wordKey, word: word.word, senses }]
          : [];
      }),
    [setId, state.memberships, state.words],
  );
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const sources = useMemo(
    () =>
      words
        .filter((entry) => chosenSet.has(entry.wordKey))
        .map((entry) => ({
          word: entry.word,
          existing: entry.senses.map((sense) => ({
            pos: sense.pos,
            meaningZh: sense.meaningZh,
          })),
        })),
    [chosenSet, words],
  );
  const task = useMemo(() => supplementTask(sources, limit), [limit, sources]);
  const generation = useAiGeneration<WordDraft>({
    initialSnapshot: draft.run,
    task,
    onSnapshotChange: (run) => update({ run }),
  });
  const { items, status } = generation.state;
  useReviewHandoff(status, () => update({ phase: "review" }));
  const running = status === "running";
  const allChosen = chosen.length === words.length;
  const title = t("supplement.title");
  const close = () => {
    generation.cancel();
    leaveFlow(persistence, clear);
  };

  const save = async () => {
    const rows = items.flatMap((entry) =>
      entry.senses.map((sense) => ({
        word: entry.word,
        pos: sense.pos,
        meaningZh: sense.meaning,
        examples: sense.examples,
        supplementary: true,
      })),
    );
    const store = useLibraryStore.getState();
    const current = store.state.sets.find((entry) => entry.id === setId);
    if (!current) return;
    setSaving(true);
    try {
      await store.saveSet({
        id: setId,
        setName: current.setName,
        folderId: current.folderId,
        words: [...setWordDrafts(store.state, setId), ...rows],
      });
      clear();
      router.back();
    } catch {
      setError(t("supplement.saveFailed"));
      setSaving(false);
    }
  };

  if (!words.length)
    return (
      <FormScreen>
        <SheetHeader title={title} onCancel={() => router.back()} />
        <EmptyState
          illustrated={false}
          title={t("supplement.empty")}
          body={t("setDetail.noWordsDescription")}
        />
      </FormScreen>
    );

  if (phase === "review")
    return (
      <FormScreen>
        <SheetHeader
          title={t("supplement.resultsHeader")}
          cancelIcon="chevron.left"
          cancelLabel={t("ai.reviewBack")}
          busy={saving}
          onCancel={() => update({ phase: "run" })}
          saveLabel={t("supplement.apply")}
          onSave={
            items.some((entry) => entry.senses.length)
              ? () => void save()
              : undefined
          }
        />
        <ListGroup iconInset={false}>
          {items.map((entry) => (
            <SupplementResult draft={entry} key={entry.word} />
          ))}
        </ListGroup>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Button
          label={t("supplement.apply")}
          icon="checkmark"
          busy={saving}
          disabled={!items.some((entry) => entry.senses.length)}
          onPress={() => void save()}
        />
      </FormScreen>
    );

  return (
    <FormScreen>
      <SheetHeader title={title} onCancel={close} />
      <ListGroup
        title={t("supplement.wordsHeader")}
        aside={
          <Text style={styles.count}>
            {`${chosen.length} / ${words.length}`}
          </Text>
        }
      >
        <ActionRow
          icon={allChosen ? "circle" : "checkmark.circle"}
          title={t(allChosen ? "supplement.clearAll" : "supplement.selectAll")}
          disabled={running}
          onPress={() =>
            update({
              chosen: allChosen ? [] : words.map((entry) => entry.wordKey),
            })
          }
        />
        {words.slice(0, shown).map((entry) => (
          <CheckRow
            key={entry.wordKey}
            icon="textformat.abc"
            title={entry.word}
            detail={t("supplement.existing", { count: entry.senses.length })}
            checked={chosenSet.has(entry.wordKey)}
            disabled={running}
            onPress={() =>
              update({
                chosen: chosenSet.has(entry.wordKey)
                  ? chosen.filter((key) => key !== entry.wordKey)
                  : [...chosen, entry.wordKey],
              })
            }
          />
        ))}
        {shown < words.length ? (
          <ActionRow
            icon="chevron.down.circle"
            title={`顯示更多（還有 ${words.length - shown} 個）`}
            onPress={() => setShown(shown + PAGE * 2)}
          />
        ) : null}
      </ListGroup>
      <ListGroup footer={t("supplement.limitFooter")}>
        <PickerRow
          icon="number"
          title={t("supplement.limitHeader")}
          disabled={running}
          value={String(limit) as (typeof LIMITS)[number]}
          options={LIMITS.map((value) => ({
            value,
            label: t("supplement.limitOption", { count: Number(value) }),
          }))}
          onChange={(value) => update({ limit: Number(value) as Limit })}
        />
      </ListGroup>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <AiRunPanel
        actionLabel={t("supplement.action")}
        billableCount={sources.length}
        configured={generation.configured}
        kind="senses"
        onCancel={generation.cancel}
        onResume={generation.canResume ? generation.resume : undefined}
        onReview={
          items.length && !running
            ? () => update({ phase: "review" })
            : undefined
        }
        onStart={() => {
          setError("");
          generation.start(task);
        }}
        onTierChange={generation.setTier}
        ready={generation.ready}
        state={generation.state}
        tier={generation.tier}
        unit={t("supplement.unit")}
      />
    </FormScreen>
  );
}

/** One word's answer: what it gained, or that it had nothing to gain. */
function SupplementResult({ draft }: { draft: WordDraft }) {
  return (
    <View style={styles.result}>
      <View style={styles.resultHead}>
        {draft.senses.length ? (
          <SymbolView
            name="checkmark.circle.fill"
            size={18}
            tintColor={colors.brand}
          />
        ) : null}
        <Text style={styles.word}>{draft.word}</Text>
      </View>
      {draft.senses.length ? (
        draft.senses.map((sense) => (
          <View key={sense.id} style={styles.sense}>
            <Text style={styles.meaning}>
              <Text style={styles.pos}>{`${sense.pos}  `}</Text>
              {sense.meaning}
            </Text>
            {sense.examples.map((example) => (
              <Text key={example} style={styles.example}>
                {example}
              </Text>
            ))}
          </View>
        ))
      ) : (
        <Text style={styles.none}>{t("supplement.none")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { ...type.body, color: colors.muted, paddingHorizontal: 4 },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
  count: { ...type.hint, color: colors.muted, fontVariant: ["tabular-nums"] },
  result: { gap: 6, paddingHorizontal: space.row, paddingVertical: 13 },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  word: { ...type.row, fontWeight: "600", color: colors.foreground },
  sense: { gap: 2 },
  meaning: { ...type.body, fontWeight: "500", color: colors.foreground },
  pos: { fontStyle: "italic", fontWeight: "400", color: colors.brand },
  example: { ...type.hint, color: colors.muted },
  none: { ...type.hint, color: colors.muted },
});
