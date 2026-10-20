import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { PlayerList, playerName } from "@/components/rooms/player-list";
import { QuestionStage } from "@/components/rooms/question-stage";
import { RoomFinished } from "@/components/rooms/room-finished";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen } from "@/components/ui/layout";
import { swapIn, swapOut } from "@/components/ui/motion";
import { useRoom, type RoomConnection } from "@/core/components/rooms/use-room";
import { t } from "@/core/lib/i18n";
import type { RoomState } from "@/core/lib/room-client";
import { useCloudStore } from "@/core/stores/cloud-store";
import { colors, radius, type } from "@/lib/theme";
import { toast } from "@/platform/toast";

/** A live room. Everything on screen comes from the server's latest state. */
export default function RoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const user = useCloudStore((store) => store.user);
  if (!user)
    return (
      <>
        <Stack.Screen options={{ title: t("rooms.title") }} />
        <SignInPrompt body={t("rooms.signInRequired")} />
      </>
    );
  return <LiveRoom code={code} name={playerName(user)} />;
}

function LiveRoom({ code, name }: { code: string; name: string }) {
  const { state, connection, error, offset, send, takeBack } = useRoom(
    code,
    name,
    true,
  );
  const isHost = state ? state.you === state.hostUid : false;

  const endGame = () =>
    Alert.alert(t("rooms.endGame"), t("rooms.endConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("rooms.endGame"),
        style: "destructive",
        onPress: () => send({ type: "end" }),
      },
    ]);

  const header = (
    <>
      <Stack.Screen options={{ title: state?.title ?? t("rooms.title") }} />
      {isHost && state?.phase !== "ended" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="xmark" onPress={endGame}>
            {t("rooms.endGame")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
    </>
  );

  if (connection === "replaced")
    return (
      <Screen>
        {header}
        <EmptyState
          illustrated={false}
          title={t("rooms.replaced")}
          body=""
          action={<Button label={t("rooms.takeBack")} onPress={takeBack} />}
        />
      </Screen>
    );
  if (connection === "closed" && (!state || error))
    return (
      <Screen>
        {header}
        <EmptyState
          illustrated={false}
          title={error || t("rooms.notFound")}
          body=""
          action={
            <Button
              label={t("rooms.leave")}
              variant="ghost"
              onPress={() => router.back()}
            />
          }
        />
      </Screen>
    );

  return (
    <Screen>
      {header}
      <ConnectionNotice connection={state ? connection : "connecting"} />
      {!state ? null : state.phase === "lobby" ? (
        <Animated.View key="lobby" entering={swapIn}>
          <Lobby
            state={state}
            isHost={isHost}
            onStart={() => send({ type: "start" })}
          />
        </Animated.View>
      ) : state.phase === "ended" ? (
        <Animated.View key="ended" entering={swapIn}>
          <RoomFinished state={state} />
        </Animated.View>
      ) : (
        <Animated.View key={`question:${state.index}`} entering={swapIn}>
          <QuestionStage
            state={state}
            offset={offset}
            onAnswer={(choice) =>
              send({ type: "answer", index: state.index, choice })
            }
          />
        </Animated.View>
      )}
    </Screen>
  );
}

function ConnectionNotice({ connection }: { connection: RoomConnection }) {
  if (connection === "open" || connection === "closed") return null;
  return (
    <Animated.View entering={swapIn} exiting={swapOut} style={styles.notice}>
      <ActivityIndicator size="small" />
      <Text style={styles.noticeText}>
        {connection === "reconnecting"
          ? t("rooms.reconnecting")
          : t("rooms.connecting")}
      </Text>
    </Animated.View>
  );
}

function Lobby({
  state,
  isHost,
  onStart,
}: {
  state: RoomState;
  isHost: boolean;
  onStart: () => void;
}) {
  const copy = async () => {
    await Clipboard.setStringAsync(state.code);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success(t("rooms.copied"));
  };
  return (
    <View style={styles.lobby}>
      <View style={styles.codeCard}>
        <Text style={styles.codeHint}>{t("rooms.shareCode")}</Text>
        <Text
          selectable
          style={styles.code}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {state.code}
        </Text>
        <Button
          label={t("rooms.copyCode")}
          icon="doc.on.doc"
          variant="onField"
          onPress={() => void copy()}
        />
      </View>
      <PlayerList
        state={state}
        title={t("rooms.players", { count: state.players.length })}
      />
      {isHost ? (
        <View style={styles.start}>
          {state.players.length < 2 ? (
            <Text style={styles.hint}>{t("rooms.needPlayers")}</Text>
          ) : null}
          <Button label={t("rooms.start")} icon="play.fill" onPress={onStart} />
        </View>
      ) : (
        <View style={styles.waiting}>
          <SymbolView name="hourglass" size={18} tintColor={colors.muted} />
          <Text style={styles.hint}>{t("rooms.waitingHost")}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.control,
    backgroundColor: colors.secondary,
  },
  noticeText: { ...type.hint, color: colors.muted },
  lobby: { gap: 20 },
  // The code is the room's poster: friends read it off this screen.
  codeCard: {
    gap: 8,
    padding: 22,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.field,
  },
  codeHint: { ...type.section, color: colors.fieldInk },
  code: {
    ...type.poster,
    fontSize: 80,
    lineHeight: 92,
    letterSpacing: 2,
    color: colors.fieldInk,
  },
  hint: { ...type.hint, color: colors.muted, textAlign: "center" },
  start: { gap: 10 },
  waiting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
