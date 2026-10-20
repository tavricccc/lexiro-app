import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { FormScreen, SheetHeader, leaveFlow } from "@/components/form-sheet";
import { setFolderOptions } from "@/components/library/folder-options";
import { ResumeChoice } from "@/components/resume-choice";
import { InputRow, ListGroup, PickerRow } from "@/components/ui/list";
import { swapIn } from "@/components/ui/motion";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import { UNCATEGORIZED_FOLDER_ID } from "@/core/lib/folders";
import { t } from "@/core/lib/i18n";
import { setWordDrafts } from "@/core/lib/word-edit";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, type } from "@/lib/theme";

/** 名稱與資料夾: renames a set or files it elsewhere. */
export default function SetSettingsScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const current = useLibraryStore((store) =>
    store.state.sets.find((entry) => entry.id === setId),
  );
  if (!current) {
    return (
      <SheetHeader
        title={t("wordEdit.metadata")}
        onCancel={() => router.back()}
      />
    );
  }
  return (
    <SettingsFlow
      key={`${setId}:${current.updatedAt}`}
      setId={setId}
      revision={current.updatedAt}
      initial={{
        name: current.setName,
        folder: current.folderId || UNCATEGORIZED_FOLDER_ID,
      }}
    />
  );
}

function SettingsFlow({
  setId,
  revision,
  initial,
}: {
  setId: string;
  revision: string;
  initial: { name: string; folder: string };
}) {
  const uid = useCloudStore((store) => store.user?.uid);
  const folders = useLibraryStore((store) => store.state.folders);
  const saved = useResumableDraft(
    `lexiro:flow-draft:v1:${uid ?? "local"}:set-metadata:${setId}:${revision}`,
    initial,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = t("wordEdit.metadata");

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
              : "draft.setMetadataDescription",
          )}
          onResume={saved.resume}
          onRestart={saved.restart}
        />
      </>
    );

  const { name, folder } = saved.draft;
  const save = async () => {
    const store = useLibraryStore.getState();
    if (!name.trim()) return setError(t("setEditor.required"));
    if (
      store.state.sets.some(
        (entry) =>
          entry.id !== setId &&
          entry.setName.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
      )
    )
      return setError(t("setEditor.duplicateName"));
    setBusy(true);
    try {
      await store.saveSet({
        id: setId,
        setName: name,
        folderId: folder,
        words: setWordDrafts(store.state, setId),
      });
      saved.clear();
      router.back();
    } catch {
      setError(t("wordEdit.saveFailed"));
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <SheetHeader
        title={title}
        busy={busy}
        onSave={() => void save()}
        onCancel={() => leaveFlow(saved.persistence, saved.clear)}
      />
      <Animated.View entering={swapIn}>
        <ListGroup>
          <InputRow
            label={t("setEditor.name")}
            value={name}
            editable={!busy}
            invalid={Boolean(error) && !name.trim()}
            placeholder={t("setEditor.namePlaceholder")}
            onChangeText={(next) => {
              saved.update({ name: next });
              setError("");
            }}
          />
          <PickerRow
            title={t("setEditor.folder")}
            icon="folder"
            value={folder}
            options={setFolderOptions(folders)}
            disabled={busy}
            onChange={(next) => {
              saved.update({ folder: next });
              setError("");
            }}
          />
        </ListGroup>
      </Animated.View>
      {error ? (
        <Animated.View entering={FadeIn}>
          <Text style={styles.error}>{error}</Text>
        </Animated.View>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
});
