import { router } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { SyncRefreshControl } from "@/components/sync-refresh-control";
import { ActiveRoomCard } from "@/components/rooms/active-room-card";
import { Bubble } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/layout";
import { enterUp, pop } from "@/components/ui/motion";
import { senseCount } from "@/lexiro/library";
import { useLibraryStore } from "@/core/stores/library-store";
import { useLastPracticedSetId } from "@/lib/last-practiced";
import { colors, isLatin, latin, radius, type } from "@/lib/theme";

const STEPS = [
  {
    title: "加入想記住的單字",
    body: "手動輸入，或請連上 MCP 的 AI 助理幫你整理成詞義。",
  },
  {
    title: "讓 AI 出題",
    body: "透過 MCP 請 AI 助理用你自己的字出學測型式的題目。",
  },
  {
    title: "練一輪、找朋友比",
    body: "自己選題型練習，答錯的題目可以馬上重練；也能開房間和朋友即時對戰。",
  },
];

const openSet = (setId: string) =>
  router.push({ pathname: "/library/[setId]", params: { setId } });

export default function TodayScreen() {
  const library = useLibraryStore((store) => store.state);
  const lastPracticedId = useLastPracticedSetId();

  // 接著練 follows the last set practiced on this device, and otherwise the
  // most recently changed set.
  const latest = useMemo(() => {
    const remembered = lastPracticedId
      ? library.sets.find((set) => set.id === lastPracticedId)
      : undefined;
    return (
      remembered ??
      [...library.sets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    );
  }, [lastPracticedId, library.sets]);
  const totals = useMemo(
    () => ({
      sets: library.sets.length,
      senses: library.sets.reduce(
        (sum, set) => sum + senseCount(library, set.id),
        0,
      ),
      questions: library.questions.length,
    }),
    [library],
  );

  return (
    <Screen refreshControl={<SyncRefreshControl />}>
      <View style={styles.panel}>
        <ActiveRoomCard />
        {latest ? (
          <>
            <View style={styles.poster}>
              <Animated.View entering={pop} style={styles.giantBubble} />
              <Text style={styles.posterHint}>接著練</Text>
              <Text
                style={[
                  styles.posterTitle,
                  isLatin(latest.setName) && styles.posterTitleLatin,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
              >
                {latest.setName}
              </Text>
              <View style={styles.count}>
                <Text style={styles.countValue}>
                  {senseCount(library, latest.id)}
                </Text>
                <Text style={styles.countLabel}>個詞義</Text>
              </View>
              <View style={styles.actions}>
                <Button
                  label="看單字"
                  variant="onField"
                  onPress={() => openSet(latest.id)}
                  style={styles.secondaryAction}
                />
                <Button
                  label="開始練習"
                  icon="play.fill"
                  variant="ink"
                  onPress={() =>
                    router.push({
                      pathname: "/practice",
                      params: { setId: latest.id },
                    })
                  }
                  style={styles.primaryAction}
                />
              </View>
            </View>
            <Animated.View entering={enterUp.delay(80)} style={styles.totals}>
              <Total value={totals.sets} label="單字集" />
              <Total value={totals.senses} label="詞義" />
              <Total value={totals.questions} label="題目" />
            </Animated.View>
          </>
        ) : (
          <>
            <View style={styles.poster}>
              <Animated.View entering={pop} style={styles.giantBubble} />
              <Text style={[styles.posterTitle, styles.introTitle]}>
                先加入一組單字
              </Text>
              <Text style={styles.posterBody}>
                手動輸入或透過 MCP 加入，儲存後就能開始練習。
              </Text>
            </View>
            <View style={styles.steps}>
              {STEPS.map((step, index) => (
                <Animated.View
                  key={step.title}
                  entering={enterUp.delay(80 + index * 70)}
                  style={styles.step}
                >
                  <Bubble letter={String.fromCharCode(65 + index)} size={26} />
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepBody}>{step.body}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

function Total({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 28 },
  // The answer card's orange as one poster: the latest set, how much is in
  // it, and the way in. Ink on orange in both modes.
  poster: {
    overflow: "hidden",
    gap: 6,
    padding: 22,
    paddingTop: 20,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.field,
  },
  // The bubble at its largest, filled in and cropped by the corner.
  giantBubble: {
    position: "absolute",
    top: -70,
    right: -80,
    width: 270,
    height: 180,
    borderRadius: 999,
    backgroundColor: colors.fieldInk,
  },
  posterHint: { ...type.section, color: colors.fieldInk },
  posterTitle: {
    ...type.display,
    fontSize: 40,
    lineHeight: 46,
    color: colors.fieldInk,
    marginTop: 64,
  },
  posterTitleLatin: {
    ...latin.heavy,
    fontWeight: undefined,
    fontSize: 48,
    lineHeight: 50,
    letterSpacing: -2,
  },
  introTitle: { marginTop: 96 },
  posterBody: { ...type.body, color: colors.fieldInk },
  count: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  countValue: {
    ...type.poster,
    color: colors.fieldInk,
    fontVariant: ["tabular-nums"],
  },
  countLabel: { ...type.section, color: colors.fieldInk },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondaryAction: { flex: 1 },
  primaryAction: { flex: 1.4 },
  // Three counts at a large size on the canvas: no band, no tiles.
  totals: { flexDirection: "row", gap: 16, paddingHorizontal: 4 },
  total: { flex: 1 },
  totalValue: {
    ...latin.heavy,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.5,
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  totalLabel: { ...type.body, color: colors.muted },
  steps: { gap: 22, paddingHorizontal: 4 },
  step: { flexDirection: "row", gap: 14 },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { ...type.section, color: colors.foreground },
  stepBody: { ...type.body, color: colors.muted },
});
