import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { ListGroup } from "@/components/ui/list";
import { glide, pop, swapIn, swapOut } from "@/components/ui/motion";
import { t } from "@/core/lib/i18n";
import type { RoomPlayer, RoomState } from "@/core/lib/room-client";
import { colors, space, type, latin } from "@/lib/theme";

/** The name a player goes by in a room, as on the web. */
export function playerName(
  user: { displayName: string | null; email: string | null } | null,
) {
  return (user?.displayName || user?.email?.split("@")[0] || "Player").slice(
    0,
    40,
  );
}

function tags(player: RoomPlayer, state: RoomState) {
  return [
    player.uid === state.you && t("rooms.you"),
    player.uid === state.hostUid && t("rooms.host"),
    !player.connected && t("rooms.offline"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The room's players in rank order. Someone joining fades in and players
 * glide to their new rank when scores land.
 */
export function PlayerList({
  state,
  title,
  showScore = false,
  showAnswered = false,
}: {
  state: RoomState;
  title?: string;
  showScore?: boolean;
  showAnswered?: boolean;
}) {
  return (
    <ListGroup title={title} iconInset={false}>
      {state.players.map((player, rank) => {
        const detail = tags(player, state);
        return (
          <Animated.View
            key={player.uid}
            entering={swapIn}
            exiting={swapOut}
            layout={glide}
            style={styles.row}
          >
            {showScore ? <Text style={styles.rank}>{rank + 1}</Text> : null}
            <View style={styles.name}>
              <Text
                numberOfLines={1}
                style={[styles.title, !player.connected && styles.offline]}
              >
                {player.name}
              </Text>
              {detail ? <Text style={styles.tags}>{detail}</Text> : null}
            </View>
            {showAnswered && player.answered ? (
              <Animated.View entering={pop}>
                <SymbolView
                  name="checkmark.circle.fill"
                  size={20}
                  tintColor={colors.success}
                  accessibilityLabel={t("rooms.answered")}
                />
              </Animated.View>
            ) : null}
            {showScore ? (
              <Text style={styles.score}>
                {t("rooms.points", { points: player.score })}
              </Text>
            ) : null}
          </Animated.View>
        );
      })}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: space.row,
  },
  rank: {
    ...latin.heavy,
    width: 26,
    fontSize: 22,
    textAlign: "center",
    color: colors.brand,
    fontVariant: ["tabular-nums"],
  },
  name: { flex: 1, gap: 1 },
  title: { ...type.row, color: colors.foreground },
  offline: { color: colors.muted },
  tags: { ...type.hint, color: colors.muted },
  score: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
});
