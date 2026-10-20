import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";

import { useActiveRoom } from "@/components/rooms/use-active-room";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { Card, Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { glide, swapIn, swapOut } from "@/components/ui/motion";
import { t } from "@/core/lib/i18n";
import { normalizeRoomCode, ROOM_CODE_PATTERN } from "@/core/lib/room-client";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, radius, type } from "@/lib/theme";

/** Join a friend's room by its code, or open one with questions from your own bank. */
export default function RoomsScreen() {
  const user = useCloudStore((store) => store.user);
  const libraryStatus = useLibraryStore((store) => store.status);
  const [code, setCode] = useState("");
  // A room this person is hosting on another device can be taken over here.
  const active = useActiveRoom();

  if (!user) return <SignInPrompt body={t("rooms.signInRequired")} />;

  const normalized = normalizeRoomCode(code);
  const valid = ROOM_CODE_PATTERN.test(normalized);
  const openRoom = (roomCode: string) =>
    router.push({ pathname: "/rooms/[code]", params: { code: roomCode } });

  return (
    <Screen keyboardShouldPersistTaps="handled">
      {active ? (
        <Animated.View entering={swapIn} exiting={swapOut} layout={glide}>
          <ListGroup footer={t("rooms.activeRoomHint")}>
            <ListRow
              icon="person.2.wave.2.fill"
              iconTint={colors.success}
              title={t("rooms.activeRoom", { title: active.title })}
              detail={t("rooms.resumeRoom")}
              chevron
              onPress={() => openRoom(active.code)}
            />
          </ListGroup>
        </Animated.View>
      ) : null}

      <Animated.View layout={glide}>
        <Card style={styles.card}>
          <Text style={styles.section}>{t("rooms.joinHeader")}</Text>
          <View style={styles.join}>
            <TextInput
              accessibilityLabel={t("rooms.codeLabel")}
              value={normalized}
              onChangeText={setCode}
              placeholder={t("rooms.codePlaceholder")}
              placeholderTextColor={colors.faint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={() => valid && openRoom(normalized)}
              style={styles.code}
            />
            <Button
              label={t("rooms.join")}
              disabled={!valid}
              onPress={() => openRoom(normalized)}
            />
          </View>
        </Card>
      </Animated.View>

      <Animated.View layout={glide}>
        <Card style={styles.card}>
          <Text style={styles.section}>{t("rooms.createHeader")}</Text>
          <Text style={styles.hint}>{t("rooms.createHint")}</Text>
          <Button
            label={t("rooms.create")}
            icon="plus"
            variant="ghost"
            disabled={libraryStatus !== "ready"}
            onPress={() => router.push("/rooms/new")}
          />
        </Card>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  section: { ...type.section, color: colors.foreground },
  hint: { ...type.hint, color: colors.muted },
  join: { gap: 10 },
  code: {
    height: 56,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.inset,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: 6,
    fontFamily: "Menlo",
    color: colors.foreground,
  },
});
