import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { useSignIn } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { t } from "@/core/lib/i18n";
import { syncStatusLabel } from "@/core/lib/sync-status";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, latin, radius, type } from "@/lib/theme";

export default function AccountScreen() {
  const user = useCloudStore((state) => state.user);
  const status = useCloudStore((state) => state.status);
  const pending = useCloudStore((state) => state.pending);
  const library = useLibraryStore((store) => store.state);
  const sync = useCloudStore((state) => state.sync);
  const signOut = useCloudStore((state) => state.signOut);
  const deleteAccount = useCloudStore((state) => state.deleteAccount);
  const [deleting, setDeleting] = useState(false);
  const { busy, signIn } = useSignIn();

  const name = user?.displayName || user?.email || "本機使用者";
  // The Google photo, as on the web; the initial stands in without one.
  const [photoFailed, setPhotoFailed] = useState("");
  const photo = user?.photoURL && photoFailed !== user.photoURL ? user.photoURL : null;
  const confirmSignOut = () =>
    Alert.alert("登出 Lexiro？", "這台裝置上的單字快取會保留，再次登入同一個帳號時沿用。", [
      { text: "取消", style: "cancel" },
      { text: "登出", style: "destructive", onPress: () => void signOut() },
    ]);

  const removeAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      Alert.alert("帳號已刪除", "雲端與這台裝置上的資料都已清除。");
    } catch (reason) {
      Alert.alert("沒有刪除帳號", reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeleting(false);
    }
  };
  // Deleting asks twice and then a fresh Google sign-in: nothing undoes it.
  const confirmDelete = () =>
    Alert.alert(
      "刪除帳號？",
      "雲端上的單字集、題目、練習紀錄、分享連結和 AI 連線會全部刪除，這台裝置上這個帳號的資料也會清掉，無法復原。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "繼續",
          style: "destructive",
          onPress: () =>
            Alert.alert("最後確認", "接下來會請你重新登入 Google，登入後立即刪除。", [
              { text: "取消", style: "cancel" },
              { text: "刪除帳號", style: "destructive", onPress: () => void removeAccount() },
            ]),
        },
      ],
    );

  return (
    <Screen>
      <View style={styles.account}>
        <View style={styles.avatar}>
          {photo ? (
            <Image
              source={photo}
              style={styles.avatarImage}
              accessibilityIgnoresInvertColors
              onError={() => setPhotoFailed(photo)}
            />
          ) : (
            <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.accountText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {user ? (user.email ?? "") : "登入後在每台裝置同步單字集"}
          </Text>
        </View>
      </View>

      {user ? (
        <>
          <ListGroup title="雲端同步">
            <ListRow
              title="同步狀態"
              icon="clock"
              detail={syncStatusLabel(status, pending)}
              accessory={status === "syncing" ? <ActivityIndicator /> : undefined}
            />
            <ListRow title="單字集" icon="rectangle.stack" detail={String(library.sets.length)} />
            <ListRow
              title="題目"
              icon="list.bullet.rectangle"
              detail={String(library.questions.length)}
            />
            <ListRow
              title="立即同步"
              icon="arrow.triangle.2.circlepath"
              onPress={status === "syncing" ? undefined : () => void sync({ reconcileAccount: true })}
            />
          </ListGroup>
          <ListGroup footer={t("agent.connectionsHint")}>
            <ListRow
              title={t("agent.connections")}
              icon="app.connected.to.app.below.fill"
              chevron
              onPress={() => router.push("/account/agents")}
            />
          </ListGroup>
          <ListGroup>
            <ListRow
              title="登出"
              icon="rectangle.portrait.and.arrow.right"
              destructive
              onPress={confirmSignOut}
            />
          </ListGroup>
          <ListGroup footer="刪除雲端與這台裝置上這個帳號的所有資料。">
            <ListRow
              title={deleting ? "刪除中…" : "刪除帳號"}
              icon="trash"
              destructive
              accessory={deleting ? <ActivityIndicator /> : undefined}
              onPress={deleting ? undefined : confirmDelete}
            />
          </ListGroup>
        </>
      ) : (
        <Button
          label={busy ? "登入中…" : "使用 Google 登入"}
          icon="arrow.right.circle"
          busy={busy}
          onPress={() => void signIn()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The account on the green poster; the photo is cut to the bubble.
  account: {
    gap: 16,
    padding: 22,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.field,
  },
  avatar: {
    width: 108,
    height: 72,
    borderRadius: radius.bubble,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.fieldInk,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { ...latin.heavy, fontSize: 34, color: colors.field },
  accountText: { gap: 2 },
  name: { ...type.display, fontSize: 30, color: colors.fieldInk },
  email: { ...type.body, color: colors.fieldInk },
});
