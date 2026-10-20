import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import { WordFields, emptyWordDraft, wordDraftIncomplete } from "@/components/library/word-fields";
import { ResumeChoice } from "@/components/resume-choice";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import { t } from "@/core/lib/i18n";
import { setWordDrafts } from "@/core/lib/word-edit";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type { WordDraft } from "@/core/types";

/** Adds one word with its senses to the end of a set, as the web's manual path. */
export default function AddWordScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const uid = useCloudStore((store) => store.user?.uid);
  const saved = useResumableDraft<{ mode: "manual"; manual: WordDraft }>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:add-words:${setId}`,
    { mode: "manual", manual: emptyWordDraft() },
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
            saved.status === "invalid" ? "draft.invalidDescription" : "draft.addWordsDescription",
          )}
          onResume={saved.resume}
          onRestart={saved.restart}
        />
      </>
    );

  const draft = saved.draft.manual;
  const save = async () => {
    setSubmitted(true);
    if (wordDraftIncomplete(draft)) return;
    setBusy(true);
    try {
      const store = useLibraryStore.getState();
      const current = store.state.sets.find((entry) => entry.id === setId);
      if (!current) throw new Error("missing-set");
      await store.saveSet({
        id: setId,
        setName: current.setName,
        folderId: current.folderId,
        words: [
          ...setWordDrafts(store.state, setId),
          ...draft.senses.map((sense) => ({
            word: draft.word,
            pos: sense.pos,
            meaningZh: sense.meaning,
            examples: sense.examples.map((example) => example.trim()).filter(Boolean),
            supplementary: sense.supplementary,
          })),
        ],
      });
      saved.clear();
      router.back();
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
      <WordFields
        draft={draft}
        onChange={(manual) => saved.update({ manual })}
        submitted={submitted}
        busy={busy}
      />
    </FormScreen>
  );
}
