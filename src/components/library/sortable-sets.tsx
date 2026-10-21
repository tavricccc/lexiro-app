import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { t } from "@/core/lib/i18n";
import type { LibrarySet } from "@/core/types";
import { colors, isLatin, latin, radius, type } from "@/lib/theme";

/** A folder pill's place in the listing's own coordinate space. */
export interface FolderRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A row's place inside the sets block, before any drag transforms. */
interface RowLayout {
  y: number;
  height: number;
}

/** The shared drag state every row reads and writes, owned by SortableSets. */
interface DragState {
  layouts: SharedValue<Record<string, RowLayout>>;
  draggingId: SharedValue<string | null>;
  fromIndex: SharedValue<number>;
  hoverIndex: SharedValue<number>;
  hoverFolder: SharedValue<string | null>;
  draggedHeight: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  active: SharedValue<boolean>;
}

type Metrics = { senseCount: number; questionCount: number };

const NO_METRICS = { questionCount: 0, senseCount: 0 };
/** The gap between rows, which a displaced row also has to clear. */
const ROW_GAP = 8;
const SPRING = { damping: 22, mass: 0.6, stiffness: 240 };
const SHIFT = { duration: 160 };

const startHaptic = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

const hoverHaptic = () => {
  void Haptics.selectionAsync();
};

/**
 * The sets of one folder. Normally a tap opens a set and a long press opens
 * the system context menu `renderMenu` fills. While `editing`, each row grows
 * a handle that drags it onto a new place or into a folder pill.
 */
export function SortableSets({
  sets,
  metrics,
  folderRects,
  setsOffsetY,
  editing,
  renderMenu,
  onReorder,
  onDropInFolder,
  onDragChange,
  onHoverFolder,
}: {
  sets: LibrarySet[];
  metrics: Map<string, Metrics>;
  folderRects: SharedValue<FolderRect[]>;
  setsOffsetY: number;
  editing: boolean;
  renderMenu(entry: LibrarySet): ReactNode;
  onReorder(id: string, toIndex: number): void;
  onDropInFolder(id: string, folderId: string): void;
  onDragChange(dragging: boolean): void;
  onHoverFolder(folderId: string | null): void;
}) {
  const layouts = useSharedValue<Record<string, RowLayout>>({});
  const draggingId = useSharedValue<string | null>(null);
  const fromIndex = useSharedValue(-1);
  const hoverIndex = useSharedValue(-1);
  const hoverFolder = useSharedValue<string | null>(null);
  const draggedHeight = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const active = useSharedValue(false);
  // Shared values are stable, so this object is too.
  const drag = useMemo<DragState>(
    () => ({
      layouts,
      draggingId,
      fromIndex,
      hoverIndex,
      hoverFolder,
      draggedHeight,
      translateX,
      translateY,
      startX,
      startY,
      active,
    }),
    [
      layouts,
      draggingId,
      fromIndex,
      hoverIndex,
      hoverFolder,
      draggedHeight,
      translateX,
      translateY,
      startX,
      startY,
      active,
    ],
  );

  // A reordered listing already shows the new order: clear whatever the drag
  // left behind so no row keeps an offset that belongs to the old one.
  const orderKey = sets.map((entry) => entry.id).join("|");
  useEffect(() => {
    drag.translateX.set(0);
    drag.translateY.set(0);
    drag.hoverFolder.set(null);
    drag.hoverIndex.set(-1);
    drag.fromIndex.set(-1);
    drag.draggingId.set(null);
    drag.active.set(false);
  }, [orderKey, drag]);

  const ids = sets.map((entry) => entry.id);

  return (
    <View style={styles.sets}>
      {sets.map((entry, index) =>
        editing ? (
          <EditableRow
            key={entry.id}
            entry={entry}
            index={index}
            ids={ids}
            metrics={metrics.get(entry.id) ?? NO_METRICS}
            drag={drag}
            folderRects={folderRects}
            setsOffsetY={setsOffsetY}
            onReorder={onReorder}
            onDropInFolder={onDropInFolder}
            onDragChange={onDragChange}
            onHoverFolder={onHoverFolder}
          />
        ) : (
          <Link
            key={entry.id}
            href={{ pathname: "/library/[setId]", params: { setId: entry.id } }}
            asChild
          >
            <Link.Trigger>
              {/* Link's Slot flattens the trigger's style, so a style function
                  would be lost: the card's look lives on the inner view. */}
              <Pressable accessibilityRole="button" style={styles.trigger}>
                {({ pressed }) => (
                  <View style={[styles.set, pressed && styles.setPressed]}>
                    <RowContent
                      setName={entry.setName}
                      metrics={metrics.get(entry.id) ?? NO_METRICS}
                    />
                  </View>
                )}
              </Pressable>
            </Link.Trigger>
            {renderMenu(entry)}
          </Link>
        ),
      )}
    </View>
  );
}

/** A set, led by its name, with its size set large on the right. */
function RowContent({
  setName,
  metrics,
}: {
  setName: string;
  metrics: Metrics;
}) {
  return (
    <>
      <View style={styles.setText}>
        <Text
          style={[styles.setName, isLatin(setName) && styles.setNameLatin]}
          numberOfLines={2}
        >
          {setName}
        </Text>
        <Text style={styles.setMeta}>
          {metrics.questionCount
            ? t("library.questionCount", { count: metrics.questionCount })
            : "還沒有題目"}
        </Text>
      </View>
      <View style={styles.setSize}>
        <Text style={styles.setCount}>{metrics.senseCount}</Text>
        <Text style={styles.setUnit}>詞義</Text>
      </View>
    </>
  );
}

/** A row in edit mode: its handle lifts it at once, no long press needed. */
function EditableRow({
  entry,
  index,
  ids,
  metrics,
  drag,
  folderRects,
  setsOffsetY,
  onReorder,
  onDropInFolder,
  onDragChange,
  onHoverFolder,
}: {
  entry: LibrarySet;
  index: number;
  ids: string[];
  metrics: Metrics;
  drag: DragState;
  folderRects: SharedValue<FolderRect[]>;
  setsOffsetY: number;
  onReorder(id: string, toIndex: number): void;
  onDropInFolder(id: string, folderId: string): void;
  onDragChange(dragging: boolean): void;
  onHoverFolder(folderId: string | null): void;
}) {
  const { id, setName } = entry;
  // Where the handle sits in the row, to place the finger in listing space.
  const [handle, setHandle] = useState({ x: 0, y: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    drag.layouts.set({ ...drag.layouts.value, [id]: { y, height } });
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart((event) => {
      const layout = drag.layouts.value[id];
      drag.draggingId.set(id);
      drag.fromIndex.set(index);
      drag.hoverIndex.set(index);
      drag.hoverFolder.set(null);
      drag.draggedHeight.set(layout?.height ?? 0);
      drag.translateX.set(0);
      drag.translateY.set(0);
      drag.startX.set(handle.x + event.x);
      drag.startY.set(setsOffsetY + (layout?.y ?? 0) + handle.y + event.y);
      drag.active.set(true);
      runOnJS(onDragChange)(true);
      runOnJS(startHaptic)();
    })
    .onUpdate((event) => {
      if (!drag.active.value || drag.draggingId.value !== id) return;
      drag.translateX.set(event.translationX);
      drag.translateY.set(event.translationY);

      const x = drag.startX.value + event.translationX;
      const y = drag.startY.value + event.translationY;
      let overFolder: string | null = null;
      for (const rect of folderRects.value) {
        if (
          x >= rect.x &&
          x <= rect.x + rect.width &&
          y >= rect.y &&
          y <= rect.y + rect.height
        ) {
          overFolder = rect.id;
          break;
        }
      }
      if (overFolder !== drag.hoverFolder.value) {
        drag.hoverFolder.set(overFolder);
        runOnJS(onHoverFolder)(overFolder);
        if (overFolder !== null) runOnJS(hoverHaptic)();
      }
      // Over a folder the drop is a move, so no row needs to make space.
      if (overFolder !== null) return;

      const layout = drag.layouts.value[id];
      if (!layout) return;
      const from = drag.fromIndex.value;
      const center = layout.y + drag.translateY.value + layout.height / 2;
      let target = from;
      ids.forEach((otherId, otherIndex) => {
        if (otherIndex === from) return;
        const other = drag.layouts.value[otherId];
        if (!other) return;
        const otherCenter = other.y + other.height / 2;
        if (otherIndex < from && center < otherCenter)
          target = Math.min(target, otherIndex);
        else if (otherIndex > from && center > otherCenter)
          target = Math.max(target, otherIndex);
      });
      drag.hoverIndex.set(target);
    })
    .onFinalize(() => {
      if (!drag.active.value) return;
      drag.active.set(false);
      const draggedId = drag.draggingId.value;
      if (!draggedId) return;
      const folder = drag.hoverFolder.value;
      const target = drag.hoverIndex.value;
      const from = drag.fromIndex.value;

      drag.hoverFolder.set(null);
      drag.hoverIndex.set(-1);
      drag.fromIndex.set(-1);
      drag.translateX.set(
        withSpring(0, SPRING, (finished) => {
          if (finished && drag.draggingId.value === draggedId)
            drag.draggingId.set(null);
        }),
      );
      drag.translateY.set(withSpring(0, SPRING));
      runOnJS(onDragChange)(false);
      runOnJS(onHoverFolder)(null);

      if (folder !== null) runOnJS(onDropInFolder)(draggedId, folder);
      else if (target !== -1 && target !== from)
        runOnJS(onReorder)(draggedId, target);
    });

  const animated = useAnimatedStyle(() => {
    const height = drag.draggedHeight.value;
    if (drag.draggingId.value === id) {
      return {
        transform: [
          { translateX: drag.translateX.value },
          { translateY: drag.translateY.value },
          { scale: 1.03 },
        ],
        zIndex: 10,
        opacity: 0.95,
        shadowOpacity: 0.18,
        shadowRadius: 12,
      };
    }
    const from = drag.fromIndex.value;
    const to = drag.hoverIndex.value;
    let offset = 0;
    if (drag.draggingId.value !== null && drag.hoverFolder.value === null) {
      if (from < to && index > from && index <= to)
        offset = -(height + ROW_GAP);
      else if (from > to && to !== -1 && index >= to && index < from)
        offset = height + ROW_GAP;
    }
    return {
      transform: [
        { translateX: withTiming(0, SHIFT) },
        { translateY: withTiming(offset, SHIFT) },
      ],
      zIndex: 0,
      opacity: 1,
      shadowOpacity: 0,
      shadowRadius: 0,
    };
  });

  return (
    <Animated.View onLayout={onLayout} style={[styles.set, animated]}>
      <RowContent setName={setName} metrics={metrics} />
      <GestureDetector gesture={pan}>
        <View
          accessibilityLabel={`拖動「${setName}」`}
          hitSlop={12}
          onLayout={(event) => {
            const { x, y } = event.nativeEvent.layout;
            setHandle({ x, y });
          }}
          style={styles.handle}
        >
          <SymbolView
            name="line.3.horizontal"
            size={20}
            tintColor={colors.muted}
          />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sets: { gap: ROW_GAP },
  trigger: { borderRadius: radius.card, borderCurve: "continuous" },
  set: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 84,
    paddingVertical: 16,
    paddingLeft: 20,
    paddingRight: 18,
    borderRadius: radius.card,
    borderCurve: "continuous",
    backgroundColor: colors.card,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
  },
  setPressed: { backgroundColor: colors.selected },
  setText: { flex: 1, gap: 4 },
  setName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: colors.foreground,
  },
  setNameLatin: {
    ...latin.heavy,
    fontWeight: undefined,
    fontSize: 22,
    letterSpacing: -0.5,
  },
  setMeta: { ...type.hint, color: colors.muted },
  setSize: { alignItems: "flex-end" },
  setCount: {
    ...latin.heavy,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1,
    color: colors.brand,
    fontVariant: ["tabular-nums"],
  },
  setUnit: { ...type.hint, color: colors.muted },
  handle: { paddingVertical: 8, paddingLeft: 4 },
});
