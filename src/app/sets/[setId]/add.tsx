import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import {
  InputOrganizer,
  type InputOrganizerDraft,
  type OrganizerPhase,
} from "@/components/library/input-organizer";
import {
  WordAssistant,
  type AssistantPhase,
} from "@/components/library/word-assistant";
import {
  WordFields,
  emptyWordDraft,
  wordDraftIncomplete,
} from "@/components/library/word-fields";
import { ResumeChoice } from "@/components/resume-choice";
import { ActionRow, ListGroup } from "@/components/ui/list";
import type { AiGenerationSnapshot } from "@/core/components/ai/use-ai-generation";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import { t } from "@/core/lib/i18n";
import { setWordDrafts } from "@/core/lib/word-edit";
import { useCloudStore } from "@/core/stores/cloud-store";
import {
  useLibraryStore,
  type WordDraftInput,
} from "@/core/stores/library-store";
import type { WordDraft } from "@/core/types";

interface AddWordsDraft {
  mode: "ai" | "manual";
  sources: string;
  phase: AssistantPhase;
  organizerPhase: OrganizerPhase;
  input: InputOrganizerDraft;
  manual: WordDraft;
  run?: AiGenerationSnapshot<WordDraft>;
}

/** The web's 新增單字: one word by hand, or a list through the AI assistant. */
export default function AddWordScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const uid = useCloudStore((store) => store.user?.uid);
  const saved = useResumableDraft<AddWordsDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:add-words:${setId}`,
    {
      mode: "manual",
      sources: "",
      phase: "run",
      organizerPhase: "input",
      input: { input: "", review: "", addingPhotos: false },
      manual: emptyWordDraft(),
    },
  );
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const title = t("setEditor.addWord");

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
              : "draft.addWordsDescription",
          )}
          onResume={saved.resume}
          onRestart={saved.restart}
        />
      </>
    );

  const { draft, update } = saved;
  // Drafts the app saved before the AI path carry only the manual word.
  const mode = draft.mode ?? "manual";
  const sources = draft.sources ?? "";
  const phase = draft.phase ?? "run";
  const organizerPhase = draft.organizerPhase ?? "input";

  const add = async (words: WordDraftInput[]) => {
    const store = useLibraryStore.getState();
    const current = store.state.sets.find((entry) => entry.id === setId);
    if (!current) throw new Error("missing-set");
    await store.saveSet({
      id: setId,
      setName: current.setName,
      folderId: current.folderId,
      words: [...setWordDrafts(store.state, setId), ...words],
    });
    saved.clear();
    router.back();
  };

  if (mode === "ai") {
    const back = sources
      ? phase === "review"
        ? () => update({ phase: "run" })
        : () => update({ sources: "" })
      : organizerPhase === "review"
        ? () => update({ organizerPhase: "input" })
        : () => update({ mode: "manual" });
    return (
      <FormScreen>
        <SheetHeader
          title={
            sources
              ? phase === "review"
                ? t("setEditor.aiReviewTitle")
                : t("setEditor.aiGenerateTitle")
              : organizerPhase === "review"
                ? t("setEditor.aiListTitle")
                : t("setEditor.aiOrganize")
          }
          cancelIcon="chevron.left"
          cancelLabel={t("common.back")}
          onCancel={back}
        />
        {sources ? (
          <>
            <WordAssistant
              initialRun={draft.run}
              onApply={add}
              onPhase={(next) => update({ phase: next })}
              onRunChange={(run) => update({ run })}
              phase={phase}
              sources={sources}
            />
            {phase === "run" ? (
              <ListGroup>
                <ActionRow
                  icon="chevron.left"
                  title={t("setEditor.backToSources")}
                  onPress={() => update({ sources: "" })}
                />
              </ListGroup>
            ) : null}
          </>
        ) : (
          <>
            <InputOrganizer
              initialDraft={draft.input}
              onDraftChange={(input) => update({ input })}
              onConfirm={(value) => update({ sources: value, phase: "run" })}
              onPhase={(next) => update({ organizerPhase: next })}
              phase={organizerPhase}
            />
            {organizerPhase === "input" ? (
              <ListGroup>
                <ActionRow
                  icon="pencil"
                  title={t("setEditor.manualWay")}
                  onPress={() => update({ mode: "manual" })}
                />
              </ListGroup>
            ) : null}
          </>
        )}
      </FormScreen>
    );
  }

  const manual = draft.manual;
  const save = async () => {
    setSubmitted(true);
    if (wordDraftIncomplete(manual)) return;
    setBusy(true);
    try {
      await add(
        manual.senses.map((sense) => ({
          word: manual.word,
          pos: sense.pos,
          meaningZh: sense.meaning,
          examples: sense.examples
            .map((example) => example.trim())
            .filter(Boolean),
          supplementary: sense.supplementary,
        })),
      );
    } catch {
      Alert.alert(t("wordEdit.saveFailed"));
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <SheetHeader
        title={title}
        saveLabel="加入"
        busy={busy}
        onSave={() => void save()}
        onCancel={() => leaveFlow(saved.persistence, saved.clear)}
      />
      <ListGroup>
        <ActionRow
          icon="sparkles"
          title={t("setEditor.aiOrganize")}
          disabled={busy}
          onPress={() => update({ mode: "ai" })}
        />
      </ListGroup>
      <WordFields
        draft={manual}
        onChange={(next) => update({ manual: next })}
        submitted={submitted}
        busy={busy}
      />
    </FormScreen>
  );
}
