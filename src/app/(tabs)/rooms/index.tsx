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
import { colors, latin, radius, type } from "@/lib/theme";

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
        <View style={styles.poster}>
          <View style={styles.posterBubble} />
          <Text style={styles.posterHint}>{t("rooms.joinHeader")}</Text>
          <View style={styles.join}>
            <TextInput
              accessibilityLabel={t("rooms.codeLabel")}
              value={normalized}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={() => valid && openRoom(normalized)}
              style={styles.code}
            />
            <Button
              label={t("rooms.join")}
              variant="ink"
              disabled={!valid}
              onPress={() => openRoom(normalized)}
            />
          </View>
        </View>
      </Animated.View>

      <Animated.View layout={glide}>
        <Card style={styles.card}>
          <Text style={styles.section}>{t("rooms.createHeader")}</Text>
          <Text style={styles.hint}>{t("rooms.createHint")}</Text>
          <Button
            label={t("rooms.create")}
            icon="plus"
            disabled={libraryStatus !== "ready"}
            onPress={() => router.push("/rooms/new")}
          />
        </Card>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Joining is the common case: the orange poster, with the code at its size.
  poster: {
    overflow: "hidden",
    gap: 14,
    padding: 22,
    paddingTop: 20,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.field,
  },
  posterBubble: {
    position: "absolute",
    top: -64,
    right: -70,
    width: 200,
    height: 134,
    borderRadius: 999,
    backgroundColor: colors.fieldInk,
  },
  // A label at the top, as on 今天's card, set a size up.
  posterHint: { ...type.title, color: colors.fieldInk },
  card: { gap: 12 },
  section: { ...type.section, color: colors.foreground },
  hint: { ...type.hint, color: colors.muted },
  // Clears the bubble cropped into the corner.
  join: { gap: 10, marginTop: 28 },
  // The code is written into one long bubble.
  code: {
    ...latin.heavy,
    height: 72,
    borderRadius: radius.bubble,
    backgroundColor: "rgba(255,255,255,0.35)",
    textAlign: "center",
    fontSize: 36,
    letterSpacing: 8,
    color: colors.fieldInk,
  },
});
