import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { useSignIn } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { Card, Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { useApp } from "@/lib/store";
import { colors, type } from "@/lib/theme";

function syncLabel(status: string, syncedAt: number | null): string {
  if (status === "syncing") return "同步中…";
  if (status === "error") return "同步失敗";
  if (!syncedAt) return "尚未同步";
  return new Date(syncedAt).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountScreen() {
  const user = useApp((state) => state.user);
  const status = useApp((state) => state.status);
  const syncedAt = useApp((state) => state.syncedAt);
  const library = useApp((state) => state.library);
  const sync = useApp((state) => state.sync);
  const signOut = useApp((state) => state.signOut);
  const { busy, signIn } = useSignIn();

  const name = user?.displayName || user?.email || "本機使用者";
  const confirmSignOut = () =>
    Alert.alert("登出 Lexiro？", "這台裝置上的單字快取會保留，再次登入同一個帳號時沿用。", [
      { text: "取消", style: "cancel" },
      { text: "登出", style: "destructive", onPress: () => void signOut() },
    ]);

  return (
    <Screen>
      <Card style={styles.account}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.accountText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {user ? (user.email ?? "") : "登入後在每台裝置同步單字集"}
          </Text>
        </View>
      </Card>

      {user ? (
        <>
          <ListGroup title="雲端同步">
            <ListRow
              title="上次同步"
              icon="clock"
              detail={syncLabel(status, syncedAt)}
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
              onPress={status === "syncing" ? undefined : () => void sync()}
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
  account: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  avatarText: { fontSize: 22, fontWeight: "700", color: colors.brand },
  accountText: { flex: 1, gap: 2 },
  name: { ...type.section, color: colors.foreground },
  email: { ...type.hint, color: colors.muted },
});
