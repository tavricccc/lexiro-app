import { router, useLocalSearchParams } from "expo-router";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import {
  InputOrganizer,
  type InputOrganizerDraft,
  type OrganizerPhase,
} from "@/components/library/input-organizer";
import {
  WordAssistant,
  type AssistantPhase,
  type AssistedWordRow,
} from "@/components/library/word-assistant";
import { ResumeChoice } from "@/components/resume-choice";
import { InputRow, ListGroup } from "@/components/ui/list";
import type { AiGenerationSnapshot } from "@/core/components/ai/use-ai-generation";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import { UNCATEGORIZED_FOLDER_ID } from "@/core/lib/folders";
import { t } from "@/core/lib/i18n";
import { createUniqueSetName } from "@/core/lib/set-name";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type { WordDraft } from "@/core/types";

type AiSetPhase = OrganizerPhase | AssistantPhase;

interface AiSetDraft {
  name: string;
  sources: string;
  phase: AiSetPhase;
  input: InputOrganizerDraft;
  run?: AiGenerationSnapshot<WordDraft>;
}

/** The web's AI 建立單字集: sources, the list, the run, then the words. */
export default function OrganizeSetScreen() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  const uid = useCloudStore((store) => store.user?.uid);
  const home = folderId || UNCATEGORIZED_FOLDER_ID;
  const saved = useResumableDraft<AiSetDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:new-set:${home}`,
    {
      name: t("setEditor.defaultSetName"),
      sources: "",
      phase: "input",
      input: { input: "", review: "", addingPhotos: false },
    },
  );

  if (saved.status === "checking") return null;
  if (saved.status === "offer" || saved.status === "invalid")
    return (
      <>
        <SheetHeader
          title={t("setEditor.aiAssist")}
          onCancel={() => router.back()}
        />
        <ResumeChoice
          description={t(
            saved.status === "invalid"
              ? "draft.invalidDescription"
              : "draft.aiSetDescription",
          )}
          invalid={saved.status === "invalid"}
          onRestart={saved.restart}
          onResume={saved.resume}
        />
      </>
    );

  const { draft, update } = saved;
  const { name, sources, phase } = draft;
  const inputPhase = phase === "input" || (phase === "review" && !sources);
  const current =
    phase === "input"
      ? 1
      : phase === "review" && !sources
        ? 2
        : phase === "run"
          ? 3
          : 4;
  const title =
    current === 1
      ? t("setEditor.aiAssist")
      : current === 2
        ? t("setEditor.aiListTitle")
        : current === 3
          ? t("setEditor.aiGenerateTitle")
          : t("setEditor.aiReviewTitle");
  const back =
    current === 1
      ? () => leaveFlow(saved.persistence, saved.clear)
      : current === 2
        ? () => update({ phase: "input" })
        : current === 3
          ? () => update({ sources: "", phase: "review" })
          : () => update({ phase: "run" });

  const save = async (rows: AssistedWordRow[]) => {
    const store = useLibraryStore.getState();
    const created = await store.saveSet({
      folderId: home,
      setName: createUniqueSetName(
        name,
        store.state.sets.map((entry) => entry.setName),
      ),
      words: rows.map((row) => ({
        examples: row.examples.map((value) => value.trim()).filter(Boolean),
        meaningZh: row.meaningZh,
        pos: row.pos,
        supplementary: row.supplementary,
        word: row.word,
      })),
    });
    saved.clear();
    // Out of the whole sheet (the chooser may sit under this screen), then in.
    router.dismissAll();
    router.back();
    router.push({
      pathname: "/library/[setId]",
      params: { setId: created.id },
    });
  };

  return (
    <FormScreen>
      <SheetHeader
        title={title}
        cancelIcon={current === 1 ? undefined : "chevron.left"}
        cancelLabel={current === 1 ? undefined : t("common.back")}
        onCancel={back}
      />
      {inputPhase ? (
        <>
          {phase === "input" ? (
            <ListGroup iconInset={false}>
              <InputRow
                label={t("setEditor.name")}
                value={name}
                placeholder={t("setEditor.namePlaceholder")}
                onChangeText={(next) => update({ name: next })}
                autoCapitalize="sentences"
              />
            </ListGroup>
          ) : null}
          <InputOrganizer
            initialDraft={draft.input}
            onDraftChange={(input) => update({ input })}
            onConfirm={(value) => update({ sources: value, phase: "run" })}
            onPhase={(next) => update({ phase: next })}
            phase={phase as OrganizerPhase}
          />
        </>
      ) : (
        <WordAssistant
          initialRun={draft.run}
          onApply={save}
          onPhase={(next) => update({ phase: next })}
          onRunChange={(run) => update({ run })}
          phase={phase as AssistantPhase}
          sources={sources}
        />
      )}
    </FormScreen>
  );
}
