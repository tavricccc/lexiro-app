import { router } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Illustration, Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { rise } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { senseCount } from "@/lexiro/library";
import { useApp } from "@/lib/store";
import { colors, type } from "@/lib/theme";

type Tab = "tasks" | "recent";

const TABS = [
  { value: "tasks", label: "今日任務" },
  { value: "recent", label: "最近教材" },
] as const;

const STEPS = [
  { title: "加入想記住的單字", body: "手動輸入，或貼一串字讓 AI 整理成詞義。" },
  { title: "讓 AI 出題", body: "用你自己的字產生學測型式的題目。" },
  {
    title: "練一輪、找朋友比",
    body: "自己選題型練習，答錯的題目可以馬上重練；也能開房間和朋友即時對戰。",
  },
];

const openSet = (setId: string) => router.push({ pathname: "/library/[setId]", params: { setId } });

export default function TodayScreen() {
  const user = useApp((state) => state.user);
  const library = useApp((state) => state.library);
  const status = useApp((state) => state.status);
  const sync = useApp((state) => state.sync);
  const [tab, setTab] = useState<Tab>("tasks");

  const recent = useMemo(
    () => [...library.sets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
    [library.sets],
  );
  const totals = useMemo(
    () => ({
      sets: library.sets.length,
      senses: library.sets.reduce((sum, set) => sum + senseCount(library, set.id), 0),
      questions: library.questions.length,
    }),
    [library],
  );

  if (!user) return <SignInPrompt />;

  const latest = recent[0];

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={status === "syncing"} onRefresh={() => void sync()} />
      }
    >
      <Segmented options={TABS} value={tab} onChange={setTab} />

      <Animated.View key={tab} entering={rise(0)} style={styles.panel}>
        {tab === "tasks" ? (
          latest ? (
            <>
              <Card style={styles.task}>
                <View style={styles.hero}>
                  <Illustration size={200} />
                </View>
                <Text style={styles.taskHint}>接著練</Text>
                <Text style={styles.taskTitle} numberOfLines={2}>
                  {latest.setName}
                </Text>
                <Text style={styles.taskBody}>{senseCount(library, latest.id)} 個詞義</Text>
                <View style={styles.actions}>
                  <Button
                    label="看單字"
                    variant="ghost"
                    onPress={() => openSet(latest.id)}
                    style={styles.secondaryAction}
                  />
                  <Button
                    label="開始練習"
                    icon="play.fill"
                    onPress={() =>
                      router.push({ pathname: "/practice", params: { setId: latest.id } })
                    }
                    style={styles.primaryAction}
                  />
                </View>
              </Card>
              <Animated.View entering={rise(1)} style={styles.totals}>
                <Total value={totals.sets} label="單字集" />
                <Total value={totals.senses} label="詞義" />
                <Total value={totals.questions} label="題目" />
              </Animated.View>
            </>
          ) : (
            <>
              <Card style={styles.intro}>
                <View style={styles.introText}>
                  <Text style={styles.introTitle}>先加入一組單字</Text>
                  <Text style={styles.taskBody}>手動輸入或交給 AI 整理，儲存後就能開始練習。</Text>
                </View>
                <Illustration size={104} />
              </Card>
              <View style={styles.steps}>
                {STEPS.map((step, index) => (
                  <Animated.View key={step.title} entering={rise(index + 1)} style={styles.step}>
                    <View style={styles.stepMark}>
                      <Text style={styles.stepNumber}>{index + 1}</Text>
                    </View>
                    <View style={styles.stepText}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      <Text style={styles.taskBody}>{step.body}</Text>
                    </View>
                  </Animated.View>
                ))}
              </View>
            </>
          )
        ) : recent.length ? (
          <ListGroup>
            {recent.map((set) => (
              <ListRow
                key={set.id}
                icon="rectangle.stack"
                title={set.setName}
                detail={String(senseCount(library, set.id))}
                chevron
                onPress={() => openSet(set.id)}
              />
            ))}
          </ListGroup>
        ) : (
          <EmptyState title="還沒有教材" body="新增的單字集會出現在這裡。" />
        )}
      </Animated.View>
    </Screen>
  );
}

function Total({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 24 },
  task: { gap: 6, paddingTop: 22 },
  hero: { alignItems: "center", marginBottom: 8 },
  taskHint: { ...type.hint, color: colors.muted },
  taskTitle: { ...type.display, color: colors.foreground },
  taskBody: { ...type.body, color: colors.muted },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondaryAction: { flex: 1 },
  primaryAction: { flex: 1.3 },
  // One band for the three counts, not a row of identical tiles.
  totals: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: colors.inset,
  },
  total: { flex: 1, gap: 2 },
  totalValue: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  totalLabel: { ...type.hint, color: colors.muted },
  intro: { flexDirection: "row", alignItems: "center", gap: 12 },
  introText: { flex: 1, gap: 6 },
  introTitle: { ...type.title, color: colors.foreground },
  steps: { gap: 22, paddingHorizontal: 4 },
  step: { flexDirection: "row", gap: 14 },
  stepMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  stepNumber: { fontSize: 16, fontWeight: "700", color: colors.brand },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { ...type.section, color: colors.foreground },
});
