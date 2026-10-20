import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/layout";
import { CheckRow, ListGroup, SwitchRow } from "@/components/ui/list";
import { glide, swapIn, swapOut } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { allStudyWords, senseCount, studyWordsFor } from "@/lexiro/library";
import { availableCount, type WordTask } from "@/lexiro/questions";
import { useLibraryStore } from "@/core/stores/library-store";
import { BRAND_DARK, BRAND_LIGHT, colors, radius, space, type } from "@/lib/theme";

const ALL = "";
const CUSTOM = "custom";
type Amount = number | typeof CUSTOM;
const AMOUNTS: { value: Amount; label: string }[] = [
  ...[10, 20, 30, 50].map((value) => ({ value, label: String(value) })),
  { value: CUSTOM, label: "自訂" },
];

export default function PracticeSetupScreen() {
  const params = useLocalSearchParams<{ setId?: string }>();
  const library = useLibraryStore((store) => store.state);
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  // Opened from a set, practice stays in that set; only the tab offers a choice.
  const fixedSet = params.setId
    ? library.sets.find((set) => set.id === params.setId)
    : undefined;
  const [setId, setSetId] = useState(params.setId ?? ALL);
  const [meaning, setMeaning] = useState(true);
  const [reverse, setReverse] = useState(false);
  const [preset, setPreset] = useState<Amount>(20);
  const [custom, setCustom] = useState(20);

  const sets = useMemo(
    () =>
      [...library.sets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [library.sets],
  );
  const tasks: WordTask[] = [
    ...(meaning ? (["meaning"] as const) : []),
    ...(reverse ? (["reverse"] as const) : []),
  ];
  const available = useMemo(
    () =>
      availableCount(
        studyWordsFor(library, setId),
        allStudyWords(library),
        tasks,
      ),
    // tasks is rebuilt every render; its contents are the two toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library, setId, meaning, reverse],
  );

  // The slider runs up to every question the scope can make.
  const customMax = Math.max(1, available);
  const amount = preset === CUSTOM ? Math.min(custom, customMax) : preset;

  const start = () =>
    router.push({
      pathname: "/session",
      params: { setId, tasks: tasks.join(","), amount: String(amount) },
    });

  return (
    <View style={styles.root}>
      {fixedSet ? <Stack.Screen options={{ title: fixedSet.setName }} /> : null}
      <Screen contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <ListGroup title="題型" footer="英選中會朗讀英文；中選英看中文選英文。">
          <SwitchRow
            title="英選中"
            icon="character.book.closed"
            value={meaning}
            onValueChange={setMeaning}
          />
          <SwitchRow
            title="中選英"
            icon="textformat.abc"
            value={reverse}
            onValueChange={setReverse}
          />
        </ListGroup>

        <View style={styles.block}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>題數</Text>
            <Text style={styles.blockAside}>可出 {available} 題</Text>
          </View>
          <Segmented options={AMOUNTS} value={preset} onChange={setPreset} />
          {preset === CUSTOM ? (
            <Animated.View
              entering={swapIn}
              exiting={swapOut}
              layout={glide}
              style={styles.custom}
            >
              <Text style={styles.customValue}>{amount} 題</Text>
              <Slider
                minimumValue={1}
                maximumValue={customMax}
                step={1}
                value={amount}
                disabled={available < 2}
                minimumTrackTintColor={scheme === "dark" ? BRAND_DARK : BRAND_LIGHT}
                onValueChange={(value) => {
                  if (value !== custom) void Haptics.selectionAsync();
                  setCustom(value);
                }}
              />
              <View style={styles.customRange}>
                <Text style={styles.blockAside}>1</Text>
                <Text style={styles.blockAside}>{customMax}</Text>
              </View>
            </Animated.View>
          ) : null}
        </View>

        {fixedSet ? null : (
          <ListGroup title="範圍">
            <CheckRow
              title="全部單字"
              icon="books.vertical"
              subtitle={`${sets.length} 個單字集`}
              checked={setId === ALL}
              onPress={() => setSetId(ALL)}
            />
            {sets.map((set) => (
              <CheckRow
                key={set.id}
                icon="rectangle.stack"
                title={set.setName}
                subtitle={`${senseCount(library, set.id)} 個詞義`}
                checked={setId === set.id}
                onPress={() => setSetId(set.id)}
              />
            ))}
          </ListGroup>
        )}
      </Screen>

      <View
        style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <Button
          label={
            available
              ? `開始練習 · ${Math.min(available, amount)} 題`
              : "沒有可以出的題目"
          }
          icon="play.fill"
          disabled={!tasks.length || !available}
          onPress={start}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  block: { gap: 10 },
  blockHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  blockTitle: { ...type.section, color: colors.foreground },
  blockAside: {
    ...type.hint,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  custom: {
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: space.row,
    borderRadius: radius.card,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  customValue: {
    ...type.title,
    color: colors.foreground,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  customRange: { flexDirection: "row", justifyContent: "space-between" },
  // The start action stays at the bottom while the scope list scrolls.
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: space.gutter,
    backgroundColor: colors.canvas,
  },
});
