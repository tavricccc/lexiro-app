import { router } from "expo-router";
import Animated from "react-native-reanimated";

import { ListGroup, ListRow } from "@/components/ui/list";
import { glide, swapIn, swapOut } from "@/components/ui/motion";
import { t } from "@/core/lib/i18n";
import { colors } from "@/lib/theme";
import { useActiveRoom } from "./use-active-room";

/**
 * A room this person is hosting on another device, on the 今天 page so it is
 * not buried behind the 對戰 tab. Opening it takes the seat over; the room
 * closes the older device's connection.
 */
export function ActiveRoomCard() {
  const room = useActiveRoom();

  if (!room) return null;
  return (
    <Animated.View entering={swapIn} exiting={swapOut} layout={glide}>
      <ListGroup footer={t("rooms.activeRoomHint")}>
        <ListRow
          icon="person.2.wave.2.fill"
          iconTint={colors.success}
          title={t("rooms.activeRoom", { title: room.title })}
          detail={t("rooms.resumeRoom")}
          chevron
          onPress={() =>
            router.push({ pathname: "/rooms/[code]", params: { code: room.code } })
          }
        />
      </ListGroup>
    </Animated.View>
  );
}
