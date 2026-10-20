import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { swapIn } from "@/components/ui/motion";
import { ProgressBar } from "@/components/ui/progress";
import { estimatePoints, type JobKind, type Tier } from "@/core/ai-contract";
import type { AiRunState } from "@/core/components/ai/use-ai-generation";
import { useManagedAccount } from "@/core/components/ai/use-managed-account";
import { useTokenRate } from "@/core/components/ai/use-token-rate";
import { t } from "@/core/lib/i18n";
import { useAiPreferencesStore } from "@/core/stores/ai-preferences-store";
import type { AiBatchProgress } from "@/core/types/ai";
import { colors, type } from "@/lib/theme";
import { GenerationControls } from "./generation-controls";

/**
 * The screen a generation runs on: the tier list, the progress card, and one
 * main button, with the rarer verbs as quiet buttons underneath.
 */
export function AiRunPanel<T>({
  actionLabel,
  appendBillableCount,
  billableCount,
  configured,
  kind,
  onAppend,
  onCancel,
  onResume,
  onReview,
  onStart,
  onTierChange,
  ready,
  state,
  tier,
  unit,
}: {
  actionLabel: string;
  appendBillableCount?: number;
  billableCount: number;
  configured: boolean;
  kind: JobKind;
  onAppend?: () => void;
  onCancel: () => void;
  onResume?: () => void;
  /** Going on to the step that reviews what came back. */
  onReview?: () => void;
  onStart: () => void;
  onTierChange: (tier: Tier) => void;
  ready: boolean;
  state: AiRunState<T>;
  tier: Tier;
  unit: string;
}) {
  const [now, setNow] = useState(Date.now);
  const account = useManagedAccount();
  const model = useAiPreferencesStore((store) => store.preferences.model);
  const admin = account.data?.admin === true;
  const running = state.status === "running",
    started = state.status !== "idle",
    done = state.status === "done";
  const tokenRate = useTokenRate(
    state.tokens ?? 0,
    running,
    state.batchStartedAt ?? state.startedAt ?? 0,
  );
  const progress = running
    ? (state.receivedUnits ?? state.completed)
    : state.completed;
  const runModel = started && !done ? (state.model ?? model) : model;
  const canRun = ready && configured && billableCount > 0;
  const appendCost = estimatePoints(
    kind,
    appendBillableCount ?? billableCount,
    tier,
    model,
  );
  const startCost = estimatePoints(kind, billableCount, tier, runModel);
  const insufficientPoints =
    !admin && account.data !== undefined && account.data.points < startCost.min;
  const canStart = canRun && !insufficientPoints;
  const resumable = state.remaining > 0 && Boolean(onResume);
  const reviewPrimary = Boolean(onReview && (done || (started && !onResume)));

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const seconds = Math.floor(
    (state.elapsedMs +
      (state.startedAt ? Math.max(0, now - state.startedAt) : 0)) /
      1000,
  );
  const title = state.resumeUnavailable
    ? t("ai.keptResults")
    : running
      ? t(`ai.${state.phase}`)
      : done
        ? t("ai.done")
        : state.status === "cancelled"
          ? t("ai.paused")
          : state.status === "error"
            ? t("ai.needsAttention")
            : t("ai.ready");

  const details = [
    t("ai.completedSegments", { count: state.segments }),
    kind === "words" || kind === "senses"
      ? t("ai.parsedSenses", { count: state.parsedSenses ?? 0 })
      : "",
    ["reading", "cloze", "wordBank", "discourse"].includes(kind)
      ? t("ai.parsedQuestions", { count: state.parsedQuestions ?? 0 })
      : "",
  ].filter(Boolean);

  const primary = reviewPrimary
    ? {
        label: t(done ? "ai.viewResults" : "ai.viewCompletedResults"),
        icon: "arrow.right" as const,
        onPress: onReview,
        disabled: false,
      }
    : resumable && canRun
      ? {
          label: t(state.status === "error" ? "ai.retryCurrent" : "ai.resume"),
          icon: "play.fill" as const,
          onPress: onResume,
          disabled: false,
        }
      : {
          label: started ? t("ai.regenerate") : actionLabel,
          icon: "sparkles" as const,
          onPress: onStart,
          disabled: resumable ? !canRun : !canStart,
        };

  return (
    <View style={styles.stack}>
      <GenerationControls
        count={billableCount}
        disabled={running || resumable}
        kind={kind}
        onTierChange={onTierChange}
        tier={tier}
        model={runModel}
      />

      {started ? (
        <Animated.View entering={swapIn}>
          <Card style={styles.progress}>
            <View style={styles.progressHead}>
              <Text style={styles.progressTitle}>
                {ready ? title : t("common.loading")}
              </Text>
              <Text style={styles.meta}>{t("ai.elapsed", { seconds })}</Text>
            </View>
            <ProgressBar
              value={state.total ? progress / state.total : done ? 1 : 0}
            />
            <Text style={styles.summary}>
              {t(running ? "ai.parsedItems" : "ai.completedItems", {
                completed: progress,
                total: state.total,
                unit,
              })}
            </Text>
            <View style={styles.details}>
              {details.map((line) => (
                <Text key={line} style={styles.meta}>
                  {line}
                </Text>
              ))}
              {running && (state.batches?.length ?? 0) > 1 ? (
                state.batches!.map((batch) => (
                  <BatchRate key={batch.id} batch={batch} />
                ))
              ) : running ? (
                <Text style={styles.meta}>
                  {t("ai.progressTps", { rate: tokenRate.toFixed(1) })}
                </Text>
              ) : null}
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {state.resumeUnavailable ? (
        <Text style={styles.notice}>
          {t(
            `ai.restore${state.resumeUnavailable === "expired" ? "Expired" : state.resumeUnavailable === "changed" ? "Changed" : "Legacy"}`,
          )}
        </Text>
      ) : null}
      {state.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {state.error}
        </Text>
      ) : null}
      {ready && !configured && billableCount > 0 ? (
        <Text style={styles.notice}>{t("managed.signInRequired")}</Text>
      ) : null}
      {!running && insufficientPoints && state.remaining === 0 && !done ? (
        <Text style={styles.error}>{t("managed.noPoints")}</Text>
      ) : null}
      {started ? (
        <Text style={styles.notice}>
          {t(running ? "ai.keepWorking" : "ai.keptResults")}
        </Text>
      ) : null}
      {Array.from(new Set(state.notices)).map((notice) => (
        <Text key={notice} style={styles.notice}>
          {notice}
        </Text>
      ))}

      <View style={styles.actions}>
        {running ? (
          <Button
            label={t("ai.stop")}
            icon="stop.fill"
            variant="secondary"
            onPress={onCancel}
          />
        ) : (
          <>
            <Button
              label={primary.label}
              icon={primary.icon}
              disabled={primary.disabled}
              onPress={primary.onPress}
            />
            {(state.remaining > 0 || reviewPrimary) && canStart ? (
              <Button
                label={t("ai.regenerate")}
                icon="arrow.clockwise"
                variant="ghost"
                onPress={onStart}
              />
            ) : null}
            {resumable && state.items.length > 0 && onReview ? (
              <Button
                label={t("ai.viewCompletedResults")}
                icon="arrow.right"
                variant="ghost"
                onPress={onReview}
              />
            ) : null}
            {done && onAppend && configured ? (
              <Button
                label={
                  admin
                    ? t("ai.append")
                    : t("managed.appendCost", {
                        points:
                          appendCost.min === appendCost.max
                            ? appendCost.max
                            : `${appendCost.min}–${appendCost.max}`,
                      })
                }
                icon="plus"
                variant="ghost"
                disabled={
                  !admin &&
                  account.data !== undefined &&
                  account.data.points < appendCost.min
                }
                onPress={onAppend}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function BatchRate({ batch }: { batch: AiBatchProgress }) {
  const rate = useTokenRate(batch.tokens, true, batch.startedAt);
  return (
    <Text style={styles.meta}>
      {t("ai.batchTps", { batch: batch.order, rate: rate.toFixed(1) })}
    </Text>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  progress: { gap: 12 },
  progressHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  progressTitle: { ...type.section, color: colors.foreground, flexShrink: 1 },
  summary: {
    ...type.body,
    color: colors.foreground,
    fontVariant: ["tabular-nums"],
  },
  details: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 2 },
  meta: { ...type.hint, color: colors.muted, fontVariant: ["tabular-nums"] },
  notice: { ...type.hint, color: colors.muted, paddingHorizontal: 4 },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
  actions: { gap: 10 },
});
