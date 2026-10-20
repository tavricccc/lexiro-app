import { Stack, router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { setFolderOptions } from "@/components/library/folder-options";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { showActionSheet } from "@/components/ui/menu";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Segmented } from "@/components/ui/segmented";
import { UNCATEGORIZED_FOLDER_ID } from "@/core/lib/folders";
import { t } from "@/core/lib/i18n";
import { questionMatchesQuery, wordMatchesQuery } from "@/core/lib/library-search";
import { difficultyLabel, questionFormatLabel } from "@/core/lib/question-options";
import { questionBelongsToMemberships } from "@/core/lib/question-ownership";
import { createSetSharePayload } from "@/core/lib/set-share";
import { useLibraryStore } from "@/core/stores/library-store";
import type { LibraryQuestion } from "@/core/types";
import { senseCount, setWords } from "@/lexiro/library";
import { speak } from "@/lib/speech";
import { colors, space, type } from "@/lib/theme";
import { shareSetShareFile } from "@/platform/set-share-files";
import { toast } from "@/platform/toast";

type Tab = "words" | "questions" | "tools";

const itemCount = (question: LibraryQuestion) =>
  question.kind === "reading" ? question.questions.length : 1;

function questionFormat(question: LibraryQuestion) {
  return question.kind === "reading" ? question.format : question.questionStyle;
}

function questionText(question: LibraryQuestion) {
  return question.kind === "reading" ? question.title || question.passage : question.prompt;
}

/** One set, as on the web: its words, its questions, and what can be done with it. */
export default function SetScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const library = useLibraryStore((store) => store.state);
  const status = useLibraryStore((store) => store.status);
  const set = library.sets.find((entry) => entry.id === setId);
  const words = useMemo(() => setWords(library, setId), [library, setId]);
  const questions = useMemo(() => {
    const memberships = library.memberships[setId] ?? [];
    return library.questions.filter((question) => questionBelongsToMemberships(question, memberships));
  }, [library, setId]);
  const [tab, setTab] = useState<Tab>("words");
  const [query, setQuery] = useState("");
  const [sharing, setSharing] = useState(false);

  const needle = query.trim().toLocaleLowerCase();
  const visibleWords = needle ? words.filter((entry) => wordMatchesQuery(entry, needle)) : words;
  const visibleQuestions = needle
    ? questions.filter((question) => questionMatchesQuery(question, needle))
    : questions;
  const questionTotal = questions.reduce((total, question) => total + itemCount(question), 0);
  const senses = senseCount(library, setId);

  if (!set)
    return (
      <>
        <Stack.Screen options={{ title: "" }} />
        <Screen>
          {status === "ready" ? (
            <EmptyState
              illustrated={false}
              title={t("setDetail.missingTitle")}
              body={t("setDetail.missingDescription")}
            />
          ) : null}
        </Screen>
      </>
    );

  const store = useLibraryStore.getState;
  const openSheet = (pathname: "/sets/[setId]/add" | "/sets/[setId]/settings" | "/sets/[setId]/share") =>
    router.push({ pathname, params: { setId } });
  const moveSet = () =>
    showActionSheet({
      title: t("setEditor.folder"),
      actions: setFolderOptions(library.folders).map((option) => ({
        label: option.label,
        disabled: option.value === (set.folderId || UNCATEGORIZED_FOLDER_ID),
        onSelect: () => void store().moveSet(setId, option.value),
      })),
    });
  const downloadShare = async () => {
    setSharing(true);
    try {
      await shareSetShareFile(createSetSharePayload(store().state, setId));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSharing(false);
    }
  };
  const deleteSet = () =>
    Alert.alert(t("setDetail.delete"), t("setDetail.deleteConfirm", { name: set.setName }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("setDetail.delete"),
        style: "destructive",
        onPress: () => {
          router.back();
          void store().deleteSet(setId);
        },
      },
    ]);
  const clearQuestions = () => {
    const packs = questions.filter((question) => question.kind === "reading").length;
    Alert.alert(
      t("questions.clearSet"),
      [
        t("questions.clearSetConfirm", { name: set.setName, count: questionTotal }),
        ...(packs ? [t("questions.clearPacks", { count: packs })] : []),
        t("questions.clearPreserves"),
      ].join("\n\n"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("questions.confirmClear"),
          style: "destructive",
          onPress: () =>
            void store()
              .clearQuestions(setId)
              .then(() => toast.success(t("questions.cleared", { count: questionTotal }))),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: set.setName }} />
      {tab !== "tools" ? (
        <Stack.SearchBar
          placeholder={t(tab === "words" ? "setDetail.searchWords" : "setDetail.searchQuestions")}
          onChangeText={(event) => setQuery(event.nativeEvent.text)}
          onCancelButtonPress={() => setQuery("")}
        />
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={t("common.more")}>
          <Stack.Toolbar.MenuAction icon="pencil" onPress={() => openSheet("/sets/[setId]/settings")}>
            {t("setDetail.edit")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="folder" onPress={moveSet}>
            {t("setEditor.folder")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="link" onPress={() => openSheet("/sets/[setId]/share")}>
            {t("setDetail.shareLink")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="square.and.arrow.up"
            disabled={sharing}
            onPress={() => void downloadShare()}
          >
            {t("setDetail.share")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="trash" destructive onPress={deleteSet}>
            {t("setDetail.delete")}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Screen>
        <Animated.View entering={swapIn}>
          <Card style={styles.summary}>
            <Text style={styles.summaryText}>
              {t("setDetail.summary", { senses, questions: questionTotal })}
            </Text>
            <View style={styles.actions}>
              <Button
                label={t("setEditor.addWord")}
                icon="plus"
                variant="ghost"
                style={styles.action}
                onPress={() => openSheet("/sets/[setId]/add")}
              />
              <Button
                label="開始練習"
                icon="play.fill"
                style={styles.action}
                disabled={!words.length}
                onPress={() => router.push({ pathname: "/practice", params: { setId } })}
              />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={swapIn}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "words", label: `${t("setDetail.wordsTab")} ${words.length}` },
              { value: "questions", label: `${t("setDetail.questions")} ${questionTotal}` },
              { value: "tools", label: "工具" },
            ]}
          />
        </Animated.View>

        {tab === "words" ? (
          <Animated.View key="words" entering={swapIn}>
            {visibleWords.length ? (
              <ListGroup
                iconInset={false}
                footer={
                  needle
                    ? t("setDetail.wordSearchCount", { count: visibleWords.length, total: words.length })
                    : undefined
                }
              >
                {visibleWords.map((entry) => (
                  <Pressable
                    key={entry.wordKey}
                    accessibilityRole="button"
                    accessibilityLabel={t("setDetail.editWord")}
                    onPress={() =>
                      router.push({
                        pathname: "/sets/[setId]/words/[wordKey]",
                        params: { setId, wordKey: entry.wordKey },
                      })
                    }
                    style={({ pressed }) => [styles.word, pressed && styles.pressed]}
                  >
                    <View style={styles.wordBody}>
                      <Text style={styles.spelling}>{entry.word}</Text>
                      {entry.senses.map((sense) => (
                        <View key={sense.id} style={styles.sense}>
                          <Text style={styles.meaning}>
                            {sense.pos ? <Text style={styles.pos}>{sense.pos} </Text> : null}
                            {sense.meaningZh}
                          </Text>
                          {sense.examples[0] ? (
                            <Text style={styles.example} numberOfLines={2}>
                              {sense.examples[0]}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                    <PressableScale
                      scaleTo={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={t("setDetail.speak")}
                      hitSlop={10}
                      onPress={() => speak(entry.word)}
                      style={styles.speak}
                    >
                      <SymbolView name="speaker.wave.2.fill" size={17} tintColor={colors.brand} />
                    </PressableScale>
                  </Pressable>
                ))}
              </ListGroup>
            ) : needle ? (
              <EmptyState
                illustrated={false}
                title={t("setDetail.noSearchResults")}
                body={t("setDetail.noSearchResultsHint")}
              />
            ) : (
              <EmptyState
                title={t("setDetail.noWords")}
                body="用上方的「新增單字」加入第一個。"
                action={
                  <Button label={t("setEditor.addWord")} icon="plus" onPress={() => openSheet("/sets/[setId]/add")} />
                }
              />
            )}
          </Animated.View>
        ) : tab === "questions" ? (
          <Animated.View key="questions" entering={swapIn}>
            {visibleQuestions.length ? (
              <View style={styles.stack}>
                <ListGroup
                  footer={
                    needle
                      ? t("setDetail.questionSearchCount", {
                          count: visibleQuestions.length,
                          total: questions.length,
                        })
                      : undefined
                  }
                >
                  {visibleQuestions.map((question) => (
                    <ListRow
                      key={question.id}
                      icon={question.kind === "reading" ? "doc.text" : "list.bullet.rectangle"}
                      title={questionText(question)}
                      subtitle={[
                        questionFormatLabel(questionFormat(question)),
                        difficultyLabel(question.difficulty),
                        ...(question.kind === "reading"
                          ? [t("library.questionCount", { count: question.questions.length })]
                          : []),
                      ].join(" · ")}
                    />
                  ))}
                </ListGroup>
                {!needle ? (
                  <ListGroup>
                    <ListRow icon="trash" destructive title={t("questions.clearSet")} onPress={clearQuestions} />
                  </ListGroup>
                ) : null}
              </View>
            ) : needle ? (
              <EmptyState
                illustrated={false}
                title={t("setDetail.noSearchResults")}
                body={t("setDetail.noSearchResultsHint")}
              />
            ) : (
              <EmptyState
                illustrated={false}
                title="這個單字集還沒有題目"
                body="AI 出題會在下一個階段加入 App。"
              />
            )}
          </Animated.View>
        ) : (
          <Animated.View key="tools" entering={swapIn}>
            <ListGroup title={t("setDetail.toolsHeader")}>
              <ListRow
                icon="plus.circle"
                title={t("setEditor.addWord")}
                chevron
                onPress={() => openSheet("/sets/[setId]/add")}
              />
              <ListRow
                icon="pencil"
                title={t("setDetail.edit")}
                subtitle={`${t("setEditor.name")} · ${t("setEditor.folder")}`}
                chevron
                onPress={() => openSheet("/sets/[setId]/settings")}
              />
            </ListGroup>
            <ListGroup>
              <ListRow icon="link" title={t("setDetail.shareLink")} chevron onPress={() => openSheet("/sets/[setId]/share")} />
              <ListRow
                icon="square.and.arrow.up"
                title={t("setDetail.share")}
                onPress={sharing ? undefined : () => void downloadShare()}
              />
              <ListRow icon="trash" destructive title={t("setDetail.delete")} onPress={deleteSet} />
            </ListGroup>
          </Animated.View>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 14 },
  summaryText: { ...type.body, color: colors.muted, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  stack: { gap: 20 },
  word: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: space.row,
  },
  pressed: { backgroundColor: colors.secondary },
  wordBody: { flex: 1, gap: 4 },
  spelling: { fontSize: 19, fontWeight: "600", color: colors.foreground },
  sense: { gap: 1 },
  meaning: { ...type.body, color: colors.foreground },
  pos: { color: colors.brand, fontStyle: "italic" },
  example: { ...type.hint, color: colors.muted },
  speak: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
});
