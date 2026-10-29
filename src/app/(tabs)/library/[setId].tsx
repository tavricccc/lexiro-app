import { Link, Stack, router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { DescriptionPoints } from "@/components/library/description-points";
import { setFolderOptions } from "@/components/library/folder-options";
import { confirmDeleteQuestion } from "@/components/questions/delete-question";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Segmented } from "@/components/ui/segmented";
import { UNCATEGORIZED_FOLDER_ID } from "@/core/lib/folders";
import { t } from "@/core/lib/i18n";
import {
  questionMatchesQuery,
  wordMatchesQuery,
} from "@/core/lib/library-search";
import {
  difficultyLabel,
  questionFormatLabel,
} from "@/core/lib/question-options";
import { questionBelongsToMemberships } from "@/core/lib/question-ownership";
import { createSetSharePayload } from "@/core/lib/set-share";
import { useLibraryStore } from "@/core/stores/library-store";
import type { LibraryQuestion } from "@/core/types";
import { senseCount, setWords } from "@/lexiro/library";
import { speak } from "@/lib/speech";
import { colors, latin, radius, space, type } from "@/lib/theme";
import { shareSetShareFile } from "@/platform/set-share-files";
import { toast } from "@/platform/toast";

type Tab = "words" | "questions" | "tools";

/** Rows drawn at first, and added each time the reader nears the end. */
const PAGE = 60;
const NEAR_END = 600;

const itemCount = (question: LibraryQuestion) =>
  question.kind === "reading" ? question.questions.length : 1;

function questionFormat(question: LibraryQuestion) {
  return question.kind === "reading" ? question.format : question.questionStyle;
}

function questionText(question: LibraryQuestion) {
  return question.kind === "reading"
    ? question.title || question.passage
    : question.prompt;
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
    return library.questions.filter((question) =>
      questionBelongsToMemberships(question, memberships),
    );
  }, [library, setId]);
  const [tab, setTab] = useState<Tab>("words");
  const [query, setQuery] = useState("");
  const [sharing, setSharing] = useState(false);
  // A large set draws a page of rows and adds more as the reader scrolls.
  const listKey = `${tab}:${query}`;
  const [shown, setShown] = useState({ key: listKey, limit: PAGE });
  const limit = shown.key === listKey ? shown.limit : PAGE;

  const needle = query.trim().toLocaleLowerCase();
  const visibleWords = needle
    ? words.filter((entry) => wordMatchesQuery(entry, needle))
    : words;
  const visibleQuestions = needle
    ? questions.filter((question) => questionMatchesQuery(question, needle))
    : questions;
  const questionTotal = questions.reduce(
    (total, question) => total + itemCount(question),
    0,
  );
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
  const openSheet = (
    pathname:
      "/sets/[setId]/add" | "/sets/[setId]/settings" | "/sets/[setId]/share",
  ) => router.push({ pathname, params: { setId } });
  const currentFolder = set.folderId || UNCATEGORIZED_FOLDER_ID;
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
    Alert.alert(
      t("setDetail.delete"),
      t("setDetail.deleteConfirm", { name: set.setName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("setDetail.delete"),
          style: "destructive",
          onPress: () => {
            router.back();
            void store().deleteSet(setId);
          },
        },
      ],
    );
  const clearQuestions = () => {
    const packs = questions.filter(
      (question) => question.kind === "reading",
    ).length;
    Alert.alert(
      t("questions.clearSet"),
      [
        t("questions.clearSetConfirm", {
          name: set.setName,
          count: questionTotal,
        }),
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
              .then(() =>
                toast.success(t("questions.cleared", { count: questionTotal })),
              ),
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: set.setName }} />
      {tab !== "tools" ? (
        <Stack.SearchBar
          placeholder={t(
            tab === "words"
              ? "setDetail.searchWords"
              : "setDetail.searchQuestions",
          )}
          onChangeText={(event) => setQuery(event.nativeEvent.text)}
          onCancelButtonPress={() => setQuery("")}
        />
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          icon="ellipsis"
          accessibilityLabel={t("common.more")}
        >
          <Stack.Toolbar.MenuAction
            icon="pencil"
            onPress={() => openSheet("/sets/[setId]/settings")}
          >
            {t("setDetail.edit")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.Menu icon="folder" title={t("setEditor.folder")}>
            {setFolderOptions(library.folders).map((option) => (
              <Stack.Toolbar.MenuAction
                key={option.value}
                isOn={option.value === currentFolder}
                onPress={() => {
                  if (option.value !== currentFolder)
                    void store().moveSet(setId, option.value);
                }}
              >
                {option.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.MenuAction
            icon="link"
            onPress={() => openSheet("/sets/[setId]/share")}
          >
            {t("setDetail.shareLink")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="square.and.arrow.up"
            disabled={sharing}
            onPress={() => void downloadShare()}
          >
            {t("setDetail.share")}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="trash"
            destructive
            onPress={deleteSet}
          >
            {t("setDetail.delete")}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Screen
        scrollEventThrottle={100}
        onScroll={({
          nativeEvent: { contentOffset, contentSize, layoutMeasurement },
        }) => {
          const total =
            tab === "words" ? visibleWords.length : visibleQuestions.length;
          if (limit >= total) return;
          if (
            contentOffset.y + layoutMeasurement.height >
            contentSize.height - NEAR_END
          )
            setShown({ key: listKey, limit: limit + PAGE });
        }}
      >
        <Animated.View entering={swapIn}>
          <View style={styles.summary}>
            <View style={styles.summaryBubble} />
            <View style={styles.figures}>
              <Figure value={senses} label="詞義" />
              <Figure value={questionTotal} label="題目" />
            </View>
            <View style={styles.actions}>
              <Button
                label={t("setEditor.addWord")}
                icon="plus"
                variant="onField"
                style={styles.action}
                onPress={() => openSheet("/sets/[setId]/add")}
              />
              <Button
                label="開始練習"
                icon="play.fill"
                variant="ink"
                style={styles.action}
                disabled={!words.length}
                onPress={() =>
                  router.push({ pathname: "/practice", params: { setId } })
                }
              />
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={swapIn}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              {
                value: "words",
                label: `${t("setDetail.wordsTab")} ${words.length}`,
              },
              {
                value: "questions",
                label: `${t("setDetail.questions")} ${questionTotal}`,
              },
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
                    ? t("setDetail.wordSearchCount", {
                        count: visibleWords.length,
                        total: words.length,
                      })
                    : undefined
                }
              >
                {visibleWords.slice(0, limit).map((entry) => (
                  <Link
                    key={entry.wordKey}
                    href={{
                      pathname: "/sets/[setId]/words/[wordKey]",
                      params: { setId, wordKey: entry.wordKey },
                    }}
                    asChild
                  >
                    <Link.Trigger>
                      {/* Link's Slot flattens the trigger's style, so the
                          pressed look lives on the inner view. */}
                      <Pressable accessibilityRole="button">
                        {({ pressed }) => (
                          <View
                            style={[styles.word, pressed && styles.pressed]}
                          >
                        <View style={styles.wordBody}>
                          <Text style={styles.spelling}>{entry.word}</Text>
                          {entry.senses.map((sense) => (
                            <View key={sense.id} style={styles.sense}>
                              <Text style={styles.meaning}>
                                {sense.pos ? (
                                  <Text style={styles.pos}>{sense.pos} </Text>
                                ) : null}
                                {sense.meaningZh}
                              </Text>
                              {sense.description ? (
                                <DescriptionPoints
                                  text={sense.description}
                                  max={3}
                                  style={styles.description}
                                  textStyle={styles.descriptionText}
                                  numberOfLines={2}
                                />
                              ) : null}
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
                          <SymbolView
                            name="speaker.wave.2.fill"
                            size={17}
                            tintColor={colors.fieldInk}
                          />
                        </PressableScale>
                          </View>
                        )}
                      </Pressable>
                    </Link.Trigger>
                    <Link.Menu title={entry.word}>
                      <Link.MenuAction
                        icon="pencil"
                        onPress={() =>
                          router.push({
                            pathname: "/sets/[setId]/words/[wordKey]/edit",
                            params: { setId, wordKey: entry.wordKey },
                          })
                        }
                      >
                        {t("setDetail.editWord")}
                      </Link.MenuAction>
                      <Link.MenuAction
                        icon="speaker.wave.2"
                        onPress={() => speak(entry.word)}
                      >
                        {t("setDetail.speak")}
                      </Link.MenuAction>
                    </Link.Menu>
                  </Link>
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
                  <Button
                    label={t("setEditor.addWord")}
                    icon="plus"
                    onPress={() => openSheet("/sets/[setId]/add")}
                  />
                }
              />
            )}
          </Animated.View>
        ) : tab === "questions" ? (
          <Animated.View key="questions" entering={swapIn}>
            {visibleQuestions.length ? (
              <View style={styles.stack}>
                <ListGroup
                  iconInset={false}
                  footer={
                    needle
                      ? t("setDetail.questionSearchCount", {
                          count: visibleQuestions.length,
                          total: questions.length,
                        })
                      : undefined
                  }
                >
                  {visibleQuestions.slice(0, limit).map((question) => (
                    <Link
                      key={question.id}
                      href={{
                        pathname: "/sets/[setId]/questions/[questionId]",
                        params: { setId, questionId: question.id },
                      }}
                      asChild
                    >
                      <Link.Trigger>
                        <Pressable accessibilityRole="button">
                          {({ pressed }) => (
                            <View
                              style={[styles.word, pressed && styles.pressed]}
                            >
                          <View style={styles.wordBody}>
                            <Text style={styles.questionMeta}>
                              <Text style={styles.format}>
                                {questionFormatLabel(questionFormat(question))}
                              </Text>
                              {[
                                "",
                                difficultyLabel(question.difficulty),
                                ...(question.kind === "reading"
                                  ? [
                                      t("library.questionCount", {
                                        count: question.questions.length,
                                      }),
                                    ]
                                  : []),
                              ].join(" · ")}
                            </Text>
                            <Text style={styles.questionTitle} numberOfLines={3}>
                              {questionText(question)}
                            </Text>
                            {question.kind === "reading" && question.title ? (
                              <Text style={styles.example} numberOfLines={2}>
                                {question.passage}
                              </Text>
                            ) : null}
                          </View>
                          <SymbolView
                            name="chevron.right"
                            size={13}
                            weight="semibold"
                            tintColor={colors.faint}
                          />
                            </View>
                          )}
                        </Pressable>
                      </Link.Trigger>
                      <Link.Menu>
                        <Link.MenuAction
                          icon="pencil"
                          onPress={() =>
                            router.push({
                              pathname:
                                "/sets/[setId]/questions/[questionId]/edit",
                              params: { setId, questionId: question.id },
                            })
                          }
                        >
                          編輯題目
                        </Link.MenuAction>
                        <Link.Menu inline>
                          <Link.MenuAction
                            icon="trash"
                            destructive
                            onPress={() => confirmDeleteQuestion(question.id)}
                          >
                            刪除題目
                          </Link.MenuAction>
                        </Link.Menu>
                      </Link.Menu>
                    </Link>
                  ))}
                </ListGroup>
                {!needle ? (
                  <ListGroup>
                    <ListRow
                      icon="trash"
                      destructive
                      title={t("questions.clearSet")}
                      onPress={clearQuestions}
                    />
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
                body="透過 MCP 連線的 AI 助理可以依這個單字集出題並存進題庫。"
              />
            )}
          </Animated.View>
        ) : (
          <Animated.View key="tools" entering={swapIn} style={styles.stack}>
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
                chevron
                onPress={() => openSheet("/sets/[setId]/settings")}
              />
            </ListGroup>
            <ListGroup>
              <ListRow
                icon="link"
                title={t("setDetail.shareLink")}
                chevron
                onPress={() => openSheet("/sets/[setId]/share")}
              />
              <ListRow
                icon="square.and.arrow.up"
                title={t("setDetail.share")}
                onPress={sharing ? undefined : () => void downloadShare()}
              />
              <ListRow
                icon="trash"
                destructive
                title={t("setDetail.delete")}
                onPress={deleteSet}
              />
            </ListGroup>
          </Animated.View>
        )}
      </Screen>
    </>
  );
}

/** One of the set's sizes, at poster size on the green. */
function Figure({ value, label }: { value: number; label: string }) {
  return (
    <View>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The set's size on the answer card's green, with the way in.
  summary: {
    overflow: "hidden",
    gap: 18,
    padding: 22,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.field,
  },
  summaryBubble: {
    position: "absolute",
    top: -56,
    right: -84,
    width: 180,
    height: 120,
    borderRadius: 999,
    backgroundColor: colors.fieldInk,
  },
  figures: { flexDirection: "row", gap: 32 },
  figureValue: {
    ...latin.heavy,
    fontSize: 56,
    lineHeight: 58,
    letterSpacing: -2.5,
    color: colors.fieldInk,
    fontVariant: ["tabular-nums"],
  },
  figureLabel: { ...type.section, color: colors.fieldInk },
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
  spelling: {
    ...latin.bold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.foreground,
  },
  sense: { gap: 1 },
  meaning: { ...type.body, color: colors.foreground },
  pos: { ...latin.semibold, color: colors.brand },
  format: { color: colors.brand, fontWeight: "600" },
  example: { ...type.hint, color: colors.muted },
  // The same tinted note as the word sheet, so a remark never reads as an example.
  description: {
    alignSelf: "flex-start",
    marginTop: 4,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.segment,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: colors.brandSoft,
  },
  descriptionText: { ...type.hint, color: colors.foreground },
  questionMeta: { ...type.hint, color: colors.muted },
  questionTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    color: colors.foreground,
  },
  // A bubble in the card's green.
  speak: {
    width: 50,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.field,
  },
});
