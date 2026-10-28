import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import {
  WordFields,
  wordDraftIncomplete,
} from "@/components/library/word-fields";
import { ResumeChoice } from "@/components/resume-choice";
import { EmptyState } from "@/components/ui/layout";
import { useResumableDraft } from "@/core/lib/use-resumable-draft";
import { t } from "@/core/lib/i18n";
import { prepareWordEdit } from "@/core/lib/word-edit";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import type { WordDraft, WordKey } from "@/core/types";

export default function EditWordScreen() {
  const { setId, wordKey } = useLocalSearchParams<{
    setId: string;
    wordKey: string;
  }>();
  const state = useLibraryStore((store) => store.state);
  const key = wordKey as WordKey;
  const word = state.words[key];
  const membership = (state.memberships[setId] ?? []).find(
    (entry) => entry.wordKey === key,
  );
  const senses = word?.senses.filter((sense) =>
    membership?.senseIds.includes(sense.id),
  );

  if (!word || !membership || !senses?.length)
    return (
      <FormScreen>
        <SheetHeader
          title={t("setDetail.editWord")}
          onCancel={() => router.back()}
        />
        <EmptyState
          illustrated={false}
          title={t("setDetail.missingWord")}
          body={t("setDetail.missingWordDescription")}
        />
      </FormScreen>
    );

  const value: WordDraft = {
    word: word.word,
    senses: senses.map((sense) => ({
      id: sense.id,
      pos: sense.pos,
      meaning: sense.meaningZh,
      examples: sense.examples.length ? sense.examples : [""],
      supplementary: sense.supplementary,
      description: sense.description ?? "",
    })),
  };
  return (
    <EditWordFlow
      key={`${key}:${word.updatedAt}`}
      setId={setId}
      wordKey={key}
      revision={word.updatedAt}
      value={value}
    />
  );
}

function EditWordFlow({
  setId,
  wordKey,
  revision,
  value,
}: {
  setId: string;
  wordKey: WordKey;
  revision: string;
  value: WordDraft;
}) {
  const uid = useCloudStore((store) => store.user?.uid);
  const saved = useResumableDraft<WordDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:edit-word:${setId}:${wordKey}:${revision}`,
    value,
  );
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  if (saved.status === "checking") return null;
  if (saved.status === "offer" || saved.status === "invalid")
    return (
      <>
        <SheetHeader
          title={t("setDetail.editWord")}
          onCancel={() => router.back()}
        />
        <ResumeChoice
          invalid={saved.status === "invalid"}
          description={t(
            saved.status === "invalid"
              ? "draft.invalidDescription"
              : "draft.wordEditDescription",
          )}
          onResume={saved.resume}
          onRestart={saved.restart}
        />
      </>
    );

  const save = async () => {
    setSubmitted(true);
    if (wordDraftIncomplete(saved.draft)) return;
    setBusy(true);
    try {
      const store = useLibraryStore.getState();
      await store.saveSet(
        prepareWordEdit(store.state, setId, wordKey, saved.draft),
      );
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
        title={t("setDetail.editWord")}
        saveLabel="儲存"
        busy={busy}
        onSave={() => void save()}
        onCancel={() => leaveFlow(saved.persistence, saved.clear)}
      />
      <WordFields
        draft={saved.draft}
        onChange={(draft) => saved.update(draft)}
        submitted={submitted}
        busy={busy}
      />
    </FormScreen>
  );
}
