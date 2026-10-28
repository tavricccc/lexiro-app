import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { FormScreen, SheetHeader } from "@/components/form-sheet";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import { ListGroup } from "@/components/ui/list";
import { swapIn } from "@/components/ui/motion";
import { t } from "@/core/lib/i18n";
import { compareWords } from "@/core/lib/library";
import { copySharedSet } from "@/core/lib/set-share";
import { createUniqueSetName } from "@/core/lib/set-name";
import { readSharedSet, type SharedSetView } from "@/core/lib/share-client";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, space, type } from "@/lib/theme";
import { toast } from "@/platform/toast";

const PREVIEW_WORDS = 60;

/**
 * Someone else's set, read straight from their cloud copy, as on the web.
 * Nothing is stored until the reader saves a copy, which is then theirs.
 */
export default function SharedSetScreen() {
  const { shareId } = useLocalSearchParams<{ shareId: string }>();
  const ready = useCloudStore((store) => store.ready);
  const uid = useCloudStore((store) => store.user?.uid);
  const libraryStatus = useLibraryStore((store) => store.status);
  const [view, setView] = useState<SharedSetView | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready || !uid) return;
    const controller = new AbortController();
    readSharedSet(shareId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setView(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [ready, shareId, uid]);

  const rows = useMemo(() => {
    if (!view) return [];
    const wordsByKey = new Map(
      view.set.words.map((word) => [word.wordKey, word]),
    );
    return view.set.memberships
      .flatMap((membership) => {
        const word = wordsByKey.get(membership.wordKey);
        if (!word) return [];
        const senses = word.senses.filter((sense) =>
          membership.senseIds.includes(sense.id),
        );
        return [{ key: membership.wordKey, word: word.word, senses }];
      })
      .sort((a, b) => compareWords(a.word, b.word));
  }, [view]);

  const header = (
    <SheetHeader
      title={view?.set.setName ?? t("share.pageTitle")}
      cancelLabel={t("share.close")}
      busy={saving}
      onCancel={() => router.back()}
    />
  );
  if (ready && !uid)
    return (
      <>
        {header}
        <SignInPrompt body={t("share.viewSignIn")} />
      </>
    );

  const openSet = (setId: string) => {
    router.back();
    router.push({ pathname: "/library/[setId]", params: { setId } });
  };
  const save = async () => {
    if (!view) return;
    setSaving(true);
    try {
      const store = useLibraryStore.getState();
      const setName = createUniqueSetName(
        view.set.setName,
        store.state.sets.map((entry) => entry.setName),
      );
      const imported = await copySharedSet(
        view.set,
        { setName },
        { saveSet: store.saveSet, saveQuestion: store.saveQuestion },
      );
      toast.success(t("share.saved", { name: imported.setName }));
      openSet(imported.id);
    } catch (reason) {
      toast.error(
        t("share.saveFailed", {
          message: reason instanceof Error ? reason.message : String(reason),
        }),
      );
      setSaving(false);
    }
  };
  const senseCount = rows.reduce((count, row) => count + row.senses.length, 0);

  return (
    <FormScreen>
      {header}
      {error ? (
        <EmptyState
          illustrated={false}
          title={t("share.loadFailed")}
          body={error}
        />
      ) : !view ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <Animated.View entering={swapIn} style={styles.stack}>
          <Text style={styles.summary}>
            {t("share.summary", {
              words: rows.length,
              senses: senseCount,
              questions: view.set.questions.length,
            })}
          </Text>
          <ListGroup
            iconInset={false}
            footer={
              rows.length > PREVIEW_WORDS
                ? t("share.more", { count: rows.length - PREVIEW_WORDS })
                : undefined
            }
          >
            {rows.slice(0, PREVIEW_WORDS).map((row) => (
              <View key={row.key} style={styles.word}>
                <Text style={styles.spelling}>{row.word}</Text>
                <Text style={styles.meaning}>
                  {row.senses
                    .map((sense) => `${sense.pos} ${sense.meaningZh}`)
                    .join("；")}
                </Text>
              </View>
            ))}
          </ListGroup>
          <View style={styles.actions}>
            <Text style={styles.hint}>
              {t(view.own ? "share.own" : "share.copyHint")}
            </Text>
            {view.own ? (
              <Button
                label={t("share.openOwn")}
                icon="rectangle.stack"
                onPress={() => openSet(view.set.id)}
              />
            ) : (
              <Button
                label={t(saving ? "share.saving" : "share.save")}
                icon="square.and.arrow.down"
                busy={saving}
                disabled={libraryStatus !== "ready"}
                onPress={() => void save()}
              />
            )}
          </View>
        </Animated.View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: 32 },
  stack: { gap: space.section },
  summary: {
    ...type.hint,
    color: colors.muted,
    paddingHorizontal: 4,
    fontVariant: ["tabular-nums"],
  },
  word: { gap: 2, paddingVertical: 12, paddingHorizontal: space.row },
  spelling: { ...type.body, fontWeight: "600", color: colors.foreground },
  meaning: { ...type.hint, color: colors.muted },
  actions: { gap: 12 },
  hint: { ...type.hint, color: colors.muted, paddingHorizontal: 4 },
});
