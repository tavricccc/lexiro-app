import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { FormScreen, SheetHeader } from "@/components/form-sheet";
import { setFolderOptions } from "@/components/library/folder-options";
import { ExampleRows } from "@/components/library/word-fields";
import { ResumeChoice } from "@/components/resume-choice";
import {
  ActionRow,
  InputRow,
  ListGroup,
  ListRow,
  PickerRow,
} from "@/components/ui/list";
import { glide, swapIn } from "@/components/ui/motion";
import { useResumableDraft } from "@/core/components/ai/use-resumable-draft";
import { UNCATEGORIZED_FOLDER_ID } from "@/core/lib/folders";
import { t } from "@/core/lib/i18n";
import { randomUUID } from "@/core/lib/id";
import { createUniqueSetName } from "@/core/lib/set-name";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, type } from "@/lib/theme";

interface WordRow {
  key: string;
  word: string;
  pos: string;
  meaningZh: string;
  examples: string[];
  supplementary: boolean;
}

const emptyRow = (word = ""): WordRow => ({
  key: randomUUID(),
  word,
  pos: "",
  meaningZh: "",
  examples: [""],
  supplementary: false,
});

const rowIncomplete = (row: WordRow) =>
  !row.word.trim() || !row.pos.trim() || !row.meaningZh.trim();

interface NewSetDraft {
  setName: string;
  folderId: string;
  words: WordRow[];
}

/** 建立單字集 by hand: a name, where it goes, then one group per word sense. */
export default function NewSetScreen() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  const uid = useCloudStore((store) => store.user?.uid);
  const folders = useLibraryStore((store) => store.state.folders);
  const home = folderId || UNCATEGORIZED_FOLDER_ID;
  const saved = useResumableDraft<NewSetDraft>(
    `lexiro:flow-draft:v1:${uid ?? "local"}:manual-set:${home}`,
    {
      setName: t("setEditor.defaultSetName"),
      folderId: home,
      words: [emptyRow()],
    },
  );
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The web's 要怎麼建立？ choice comes first; a resumed draft is already manual.
  const [entry, setEntry] = useState<"ask" | "manual">("ask");
  const title = t("setEditor.createTitle");

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
              : "draft.manualSetDescription",
          )}
          onResume={() => {
            saved.resume();
            setEntry("manual");
          }}
          onRestart={saved.restart}
        />
      </>
    );
  if (entry === "ask")
    return (
      <FormScreen>
        <SheetHeader
          title={t("setEditor.howTitle")}
          onCancel={() => router.back()}
        />
        <Animated.View entering={swapIn}>
          <ListGroup>
            <ListRow
              icon="pencil"
              title={t("setEditor.manualWay")}
              subtitle={t("setEditor.manualWayHint")}
              chevron
              onPress={() => setEntry("manual")}
            />
            <ListRow
              icon="sparkles"
              title={t("setEditor.aiWay")}
              subtitle={t("setEditor.aiWayHint")}
              chevron
              onPress={() =>
                router.push({
                  pathname: "/sets/organize",
                  params: folderId ? { folderId } : {},
                })
              }
            />
          </ListGroup>
        </Animated.View>
      </FormScreen>
    );

  const { setName, words } = saved.draft;
  const setWords = (next: WordRow[]) => saved.update({ words: next });
  const updateRow = (index: number, patch: Partial<WordRow>) =>
    setWords(words.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSubmitted(true);
    if (!setName.trim() || words.some(rowIncomplete)) return;
    setBusy(true);
    try {
      const store = useLibraryStore.getState();
      const created = await store.saveSet({
        folderId: saved.draft.folderId,
        setName: createUniqueSetName(
          setName,
          store.state.sets.map((entry) => entry.setName),
        ),
        words: words.map((row) => ({
          word: row.word,
          pos: row.pos,
          meaningZh: row.meaningZh,
          examples: row.examples
            .map((example) => example.trim())
            .filter(Boolean),
          supplementary: row.supplementary,
        })),
      });
      saved.clear();
      router.back();
      router.push({
        pathname: "/library/[setId]",
        params: { setId: created.id },
      });
    } catch (reason) {
      setError(
        t("setEditor.saveFailed", {
          message: reason instanceof Error ? reason.message : String(reason),
        }),
      );
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <SheetHeader
        title={title}
        saveLabel="建立"
        busy={busy}
        onSave={() => void save()}
        cancelIcon="chevron.left"
        cancelLabel={t("common.back")}
        onCancel={() => setEntry("ask")}
      />
      <Animated.View entering={swapIn}>
        <ListGroup>
          <InputRow
            label={t("setEditor.name")}
            value={setName}
            editable={!busy}
            invalid={submitted && !setName.trim()}
            placeholder={t("setEditor.namePlaceholder")}
            onChangeText={(next) => saved.update({ setName: next })}
          />
          <PickerRow
            title={t("setEditor.folder")}
            icon="folder"
            value={saved.draft.folderId}
            options={setFolderOptions(folders)}
            disabled={busy}
            onChange={(next) => saved.update({ folderId: next })}
          />
        </ListGroup>
      </Animated.View>

      {words.map((row, index) => {
        const missing = submitted && rowIncomplete(row);
        return (
          <Animated.View
            key={row.key}
            entering={swapIn}
            exiting={FadeOut.duration(160)}
            layout={glide}
          >
            <ListGroup
              title={t("setEditor.wordNumber", { count: index + 1 })}
              footer={missing ? t("setEditor.required") : undefined}
              iconInset={false}
            >
              <InputRow
                label={t("setEditor.word")}
                value={row.word}
                autoFocus={index === 0 && !row.word}
                editable={!busy}
                invalid={submitted && !row.word.trim()}
                placeholder={t("setEditor.wordPlaceholder")}
                onChangeText={(word) => updateRow(index, { word })}
              />
              <InputRow
                label={t("setEditor.pos")}
                value={row.pos}
                editable={!busy}
                invalid={submitted && !row.pos.trim()}
                placeholder={t("setEditor.posPlaceholder")}
                onChangeText={(pos) => updateRow(index, { pos })}
              />
              <InputRow
                label={t("setEditor.meaning")}
                value={row.meaningZh}
                editable={!busy}
                invalid={submitted && !row.meaningZh.trim()}
                placeholder={t("setEditor.meaningPlaceholder")}
                onChangeText={(meaningZh) => updateRow(index, { meaningZh })}
              />
              {ExampleRows({
                values: row.examples,
                editable: !busy,
                onChange: (examples) => updateRow(index, { examples }),
              })}
              <ActionRow
                title={t("setEditor.addSense")}
                disabled={busy}
                onPress={() =>
                  setWords([
                    ...words.slice(0, index + 1),
                    emptyRow(row.word),
                    ...words.slice(index + 1),
                  ])
                }
              />
              {words.length > 1 ? (
                <ActionRow
                  destructive
                  disabled={busy}
                  title={t("setEditor.removeWord")}
                  onPress={() => setWords(words.filter((_, i) => i !== index))}
                />
              ) : null}
            </ListGroup>
          </Animated.View>
        );
      })}

      <Animated.View layout={glide}>
        <ListGroup iconInset={false}>
          <ActionRow
            title={t("setEditor.addWord")}
            disabled={busy}
            onPress={() => setWords([...words, emptyRow()])}
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
