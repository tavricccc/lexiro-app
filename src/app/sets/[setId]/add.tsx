import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import {
  WordFields,
  emptyWordDraft,
  wordDraftIncomplete,
} from "@/components/library/word-fields";
import { ResumeChoice } from "@/components/resume-choice";
import { useResumableDraft } from "@/core/lib/use-resumable-draft";
import { t } from "@/core/lib/i18n";
import { setWordDrafts } from "@/core/lib/word-edit";
import { useCloudStore } from "@/core/stores/cloud-store";
import {
  useLibraryStore,
  type WordDraftInput,
} from "@/core/stores/library-store";
import type { WordDraft } from "@/core/types";

interface AddWordsDraft {
  manual: WordDraft;
}

/** The web's 新增單字: one word by hand. */
export default function AddWordScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const uid = useCloudStore((store) => store.user?.uid);
  const saved = useResumableDraft<AddWordsDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:add-words:${setId}`,
    { manual: emptyWordDraft() },
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
      <WordFields
        draft={manual}
        onChange={(next) => update({ manual: next })}
        submitted={submitted}
        busy={busy}
      />
    </FormScreen>
  );
}
