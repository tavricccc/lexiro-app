import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Share, StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { FormScreen, SheetHeader } from "@/components/form-sheet";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { rise } from "@/components/ui/motion";
import { t } from "@/core/lib/i18n";
import {
  createSetShareLink,
  findSetShareLink,
  revokeSetShareLink,
  shareLinkUrl,
  type SetShareLink,
} from "@/core/lib/share-client";
import { useCloudStore } from "@/core/stores/cloud-store";
import { colors, type } from "@/lib/theme";

/** 分享連結: the web dialog as a sheet; the system share sheet does the copying. */
export default function ShareLinkScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const uid = useCloudStore((store) => store.user?.uid);
  const [link, setLink] = useState<SetShareLink | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) return;
    const controller = new AbortController();
    findSetShareLink(setId, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setLink(found);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [setId, uid]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const url = link ? shareLinkUrl(link.id) : "";

  if (!uid)
    return (
      <>
        <SheetHeader title={t("share.title")} onCancel={() => router.back()} />
        <SignInPrompt body={t("share.signInRequired")} />
      </>
    );

  return (
    <FormScreen>
      <SheetHeader title={t("share.title")} busy={busy} onCancel={() => router.back()} />
      <Animated.View entering={rise(0)}>
        <Text style={styles.description}>{t("share.description")}</Text>
      </Animated.View>
      {loading ? (
        <ActivityIndicator />
      ) : link ? (
        <Animated.View entering={rise(1)} style={styles.stack}>
          <Card style={styles.link}>
            <Text style={styles.label}>{t("share.linkLabel")}</Text>
            <Text selectable style={styles.url}>
              {url}
            </Text>
          </Card>
          <Button
            label="分享…"
            icon="square.and.arrow.up"
            onPress={() => void Share.share({ url })}
          />
          <Button
            label={t("share.revoke")}
            variant="destructive"
            busy={busy}
            onPress={() =>
              void act(async () => {
                await revokeSetShareLink(link.id);
                setLink(null);
              })
            }
          />
          <Text style={styles.hint}>{t("share.revokeHint")}</Text>
        </Animated.View>
      ) : (
        <Animated.View entering={rise(1)}>
          <Button
            label={t(busy ? "share.creating" : "share.create")}
            icon="link"
            busy={busy}
            onPress={() =>
              void act(async () => {
                const created = await createSetShareLink(setId);
                setLink(created);
                void Share.share({ url: shareLinkUrl(created.id) });
              })
            }
          />
        </Animated.View>
      )}
      {error ? (
        <Animated.View entering={FadeIn}>
          <Text style={styles.error}>{error}</Text>
        </Animated.View>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  description: { ...type.body, color: colors.muted, paddingHorizontal: 4 },
  stack: { gap: 12 },
  link: { gap: 4 },
  label: { ...type.hint, color: colors.muted },
  url: { ...type.body, color: colors.foreground },
  hint: { ...type.hint, color: colors.muted, paddingHorizontal: 4 },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
});
