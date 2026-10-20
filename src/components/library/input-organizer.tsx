import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";

import { GenerationControls } from "@/components/ai/generation-controls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/layout";
import { showActionSheet } from "@/components/ui/menu";
import { swapIn } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { ProgressBar } from "@/components/ui/progress";
import {
  LIMITS,
  buildWordGenerationSources,
  estimatePoints,
  type AiModel,
  type Tier,
} from "@/core/ai-contract";
import { useManagedAccount } from "@/core/components/ai/use-managed-account";
import { useTokenRate } from "@/core/components/ai/use-token-rate";
import { AiRequestError } from "@/core/lib/ai/errors";
import { createAiSession } from "@/core/lib/ai/session";
import { t } from "@/core/lib/i18n";
import {
  managedGeneration,
  managedTurn,
  type readManagedStream,
} from "@/core/lib/managed-client";
import { parseOrganizedWordInput } from "@/core/lib/word-generation";
import { useAiPreferencesStore } from "@/core/stores/ai-preferences-store";
import { useCloudStore } from "@/core/stores/cloud-store";
import { encodeWordPhoto, type PickedPhoto } from "@/lib/word-photo";
import { colors, type } from "@/lib/theme";

export type OrganizerPhase = "input" | "review";
export interface InputOrganizerDraft {
  input: string;
  review: string;
  addingPhotos: boolean;
  model?: AiModel;
  tier?: Tier;
}

interface PhotoProgress {
  phase: "preparing" | "organizing";
  completed: number;
  total: number;
  currentBatch: number;
  prepared: number;
  batchSize: number;
  startedAt: number;
}

function formatPhotoError(name: string, reason: unknown) {
  const detail =
    reason instanceof AiRequestError && reason.code === "invalid_image"
      ? t("managed.imageRejected")
      : reason instanceof Error
        ? reason.message
        : t("managed.imageInvalid");
  return t("managed.photoError", { file: name, detail });
}

/** Opens the camera or the photo library; resolves with what was picked. */
async function pickPhotos(
  source: "camera" | "library",
): Promise<PickedPhoto[]> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return [];
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 1,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          orderedSelection: true,
          quality: 1,
        });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => ({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    name: asset.fileName ?? `${index + 1}`,
  }));
}

function choosePhotos(onPhotos: (photos: PickedPhoto[]) => void) {
  showActionSheet({
    actions: [
      {
        label: "拍照",
        onSelect: () =>
          void pickPhotos("camera").then((photos) => {
            if (photos.length) onPhotos(photos);
          }),
      },
      {
        label: "從照片選取",
        onSelect: () =>
          void pickPhotos("library").then((photos) => {
            if (photos.length) onPhotos(photos);
          }),
      },
    ],
  });
}

/**
 * The web's InputOrganizer: what was pasted or photographed becomes a list of
 * words, and that list is read and corrected on its own step.
 */
export function InputOrganizer({
  initialDraft,
  onDraftChange,
  onConfirm,
  onPhase,
  phase,
}: {
  initialDraft?: InputOrganizerDraft;
  onDraftChange?: (draft: InputOrganizerDraft) => void;
  onConfirm: (text: string) => void;
  onPhase: (phase: OrganizerPhase) => void;
  phase: OrganizerPhase;
}) {
  const [input, setInput] = useState(initialDraft?.input ?? "");
  const [review, setReview] = useState(initialDraft?.review ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addingPhotos, setAddingPhotos] = useState(
    initialDraft?.addingPhotos ?? false,
  );
  const [pendingPhotos, setPendingPhotos] = useState<PickedPhoto[] | null>(
    null,
  );
  const [nextBatchStart, setNextBatchStart] = useState(0);
  const [photoProgress, setPhotoProgress] = useState<PhotoProgress | null>(
    null,
  );
  const [now, setNow] = useState(Date.now);
  const [startedAt, setStartedAt] = useState(0);
  const [tokens, setTokens] = useState(0);
  const tokenRate = useTokenRate(tokens, busy, startedAt);
  const controller = useRef<AbortController | null>(null);
  const textSession = useRef<ReturnType<typeof createAiSession> | null>(null);
  const photoSessions = useRef(
    new Map<number, ReturnType<typeof createAiSession>>(),
  );
  const onDraftRef = useRef(onDraftChange);
  useEffect(() => {
    onDraftRef.current = onDraftChange;
  });
  const firstDraft = useRef(true);
  const preferredModel = useAiPreferencesStore(
    (store) => store.preferences.model,
  );
  const [modelOverride, setChosenModel] = useState<AiModel | undefined>(
    initialDraft?.model,
  );
  const chosenModel = modelOverride ?? preferredModel;
  const [tier, setTier] = useState<Tier>(initialDraft?.tier ?? "lite");
  const uid = useCloudStore((store) => store.user?.uid);
  const account = useManagedAccount();
  const admin = account.data?.admin === true;
  const textCost = estimatePoints("organizeText", 1, tier, chosenModel).max;
  const photoCost = estimatePoints("organizeImage", 1, tier, chosenModel).max;

  useEffect(() => {
    if (firstDraft.current) {
      firstDraft.current = false;
      return;
    }
    onDraftRef.current?.({
      input,
      review,
      addingPhotos,
      model: chosenModel,
      tier,
    });
  }, [input, review, addingPhotos, chosenModel, tier]);
  useEffect(() => () => controller.current?.abort(), [uid]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const startRun = () => {
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    setBusy(true);
    setStartedAt(Date.now());
    setNow(Date.now());
    setTokens(0);
    setError("");
    return current;
  };

  const controls = (
    <GenerationControls
      count={pendingPhotos ? pendingPhotos.length - nextBatchStart : 1}
      disabled={busy}
      kind={pendingPhotos || addingPhotos ? "organizeImage" : "organizeText"}
      model={chosenModel}
      onModelChange={setChosenModel}
      onTierChange={setTier}
      tier={tier}
    />
  );

  const organizeText = async () => {
    const current = startRun();
    const session =
      textSession.current?.pendingTurn &&
      textSession.current.context === input &&
      textSession.current.model === chosenModel &&
      textSession.current.tier === tier
        ? textSession.current
        : createAiSession(tier, input, chosenModel);
    textSession.current = session;
    try {
      const reply = await managedTurn(
        session,
        { kind: "organizeText", raw: input },
        {
          signal: current.signal,
          onTokens: setTokens,
          onBatchStartedAt: setStartedAt,
        },
      );
      current.signal.throwIfAborted();
      const cleaned = parseOrganizedWordInput(reply.text).join("\n");
      if (!cleaned.trim()) throw new Error(t("managed.noWordsRecognized"));
      setReview(cleaned);
      onPhase("review");
    } catch (reason) {
      if (!current.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : t("managed.failed"),
        );
    } finally {
      if (controller.current === current) setBusy(false);
    }
  };

  const selectPhotos = (photos: PickedPhoto[]) => {
    setPendingPhotos(photos);
    setNextBatchStart(0);
    setError("");
  };
  const cancelPhotoSelection = () => {
    setPendingPhotos(null);
    setNextBatchStart(0);
    setError("");
  };
  const removePhoto = (index: number) => {
    if (!pendingPhotos) return;
    if (pendingPhotos.length - nextBatchStart === 1) {
      cancelPhotoSelection();
      return;
    }
    setPendingPhotos(pendingPhotos.filter((_, at) => at !== index));
    setError("");
  };

  const organizePhotos = async () => {
    const photos = pendingPhotos;
    if (!photos || busy) return;
    const current = startRun();
    const totalBatches = Math.ceil(photos.length / LIMITS.images);
    const runStartedAt = Date.now();
    const model = chosenModel;
    try {
      for (
        let batchStart = nextBatchStart;
        batchStart < photos.length;
        batchStart += LIMITS.images
      ) {
        const batch = photos.slice(batchStart, batchStart + LIMITS.images);
        const images: string[] = [];
        setPhotoProgress({
          phase: "preparing",
          completed: Math.floor(batchStart / LIMITS.images),
          total: totalBatches,
          currentBatch: Math.floor(batchStart / LIMITS.images) + 1,
          prepared: 0,
          batchSize: batch.length,
          startedAt: runStartedAt,
        });
        for (const photo of batch) {
          try {
            current.signal.throwIfAborted();
            images.push(await encodeWordPhoto(photo));
            current.signal.throwIfAborted();
            setPhotoProgress(
              (progress) =>
                progress && { ...progress, prepared: images.length },
            );
          } catch (reason) {
            if (!current.signal.aborted)
              setError(formatPhotoError(photo.name, reason));
            return;
          }
        }
        const photoSession =
          photoSessions.current.get(batchStart) ??
          createAiSession(tier, "photos", model);
        photoSessions.current.set(batchStart, photoSession);
        setTokens(0);
        setStartedAt(Date.now());
        try {
          setPhotoProgress(
            (progress) => progress && { ...progress, phase: "organizing" },
          );
          const reply: Awaited<ReturnType<typeof readManagedStream>> =
            await managedGeneration(
              photoSession,
              "/organize",
              {
                method: "POST",
                headers: {
                  "content-type": "text/plain",
                  "x-session-id": photoSession.sessionId,
                  "x-ai-model": model,
                  "x-ai-tier": tier,
                },
                body: images.join("\n"),
                signal: current.signal,
              },
              {
                signal: current.signal,
                onTokens: setTokens,
                onBatchStartedAt: setStartedAt,
              },
            );
          photoSessions.current.delete(batchStart);
          current.signal.throwIfAborted();
          const cleaned = parseOrganizedWordInput(reply.text).join("\n");
          if (!cleaned.trim()) throw new Error(t("managed.noWordsRecognized"));
          setReview((previous) =>
            [previous, cleaned].filter(Boolean).join("\n"),
          );
          setAddingPhotos(true);
          setNextBatchStart(batchStart + batch.length);
          setPhotoProgress(
            (progress) =>
              progress && {
                ...progress,
                completed: Math.floor(batchStart / LIMITS.images) + 1,
              },
          );
        } catch (reason) {
          if (!current.signal.aborted)
            setError(
              formatPhotoError(
                t("managed.photoBatch", {
                  start: batchStart + 1,
                  end: batchStart + batch.length,
                }),
                reason,
              ),
            );
          return;
        }
      }
      setPendingPhotos(null);
      setNextBatchStart(0);
    } finally {
      if (controller.current === current) {
        setBusy(false);
        setPhotoProgress(null);
      }
    }
  };

  const confirm = () => {
    const sources = buildWordGenerationSources(review);
    if (
      !sources.length ||
      review.length > LIMITS.input ||
      sources.some((source) => source.raw.length > LIMITS.source)
    ) {
      setError(t("managed.reviewLimit"));
      return;
    }
    onConfirm(review);
  };

  const errorText = error ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {error}
    </Text>
  ) : null;
  const seconds = (from: number) =>
    Math.max(0, Math.floor((now - from) / 1000));

  if (phase === "review")
    return (
      <View style={styles.stack}>
        <View style={styles.field}>
          <Text style={styles.label}>{t("managed.reviewLines")}</Text>
          <Card style={styles.areaCard}>
            <TextInput
              accessibilityLabel={t("managed.reviewLines")}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={LIMITS.input}
              multiline
              onChangeText={setReview}
              scrollEnabled={false}
              style={styles.area}
              value={review}
            />
          </Card>
          <Text style={styles.hint}>{t("managed.reviewHint")}</Text>
        </View>
        {errorText}
        <View style={styles.actions}>
          <Button
            label={t("managed.confirmList")}
            icon="arrow.right"
            disabled={!review.trim()}
            onPress={confirm}
          />
          <Button
            label={t(
              addingPhotos ? "managed.backToPhotos" : "managed.reorganize",
            )}
            icon="chevron.left"
            variant="ghost"
            onPress={() => onPhase("input")}
          />
        </View>
      </View>
    );

  if (pendingPhotos && !busy) {
    const remaining = pendingPhotos.length - nextBatchStart;
    return (
      <View style={styles.stack}>
        {controls}
        <View style={styles.field}>
          <Text style={styles.sectionTitle}>
            {t("managed.photoConfirmTitle")}
          </Text>
          <Text style={styles.hint}>
            {t("managed.photoConfirmSummary", {
              count: remaining,
              batches: Math.ceil(remaining / LIMITS.images),
            })}
            {admin
              ? ""
              : `\n${t("managed.photoPoints", { points: photoCost })}`}
            {nextBatchStart
              ? `\n${t("managed.photoCompletedKept", { count: nextBatchStart })}`
              : ""}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
          accessibilityLabel={t("managed.photoSelectedList")}
        >
          {pendingPhotos.slice(nextBatchStart).map((photo, offset) => (
            <Animated.View
              key={`${nextBatchStart + offset}:${photo.uri}`}
              entering={swapIn}
              style={styles.thumb}
            >
              <Image
                source={{ uri: photo.uri }}
                style={styles.thumbImage}
                contentFit="cover"
              />
              <PressableScale
                scaleTo={0.85}
                accessibilityRole="button"
                accessibilityLabel={t("managed.photoRemove", {
                  name: photo.name,
                })}
                hitSlop={8}
                onPress={() => removePhoto(nextBatchStart + offset)}
                style={styles.thumbRemove}
              >
                <SymbolView
                  name="xmark.circle.fill"
                  size={24}
                  tintColor="#ffffff"
                />
              </PressableScale>
            </Animated.View>
          ))}
        </ScrollView>
        <Text style={styles.hint}>
          {t(
            nextBatchStart
              ? "managed.photoRemainingNotSaved"
              : "managed.photoSelectionNotSaved",
          )}
        </Text>
        {errorText}
        <View style={styles.actions}>
          <Button
            label={t(
              nextBatchStart ? "managed.photoResume" : "managed.photoConfirm",
              {
                count: remaining,
              },
            )}
            icon="sparkles"
            onPress={() => void organizePhotos()}
          />
          <Button
            label={t("managed.photoReplace")}
            icon="photo.on.rectangle"
            variant="secondary"
            onPress={() => choosePhotos(selectPhotos)}
          />
          <Button
            label={t("managed.photoCancel")}
            variant="ghost"
            onPress={cancelPhotoSelection}
          />
        </View>
      </View>
    );
  }

  if (photoProgress && busy)
    return (
      <View style={styles.stack}>
        {controls}
        <Card style={styles.progress}>
          <View style={styles.progressHead}>
            <Text style={styles.progressTitle}>
              {t(
                photoProgress.phase === "preparing"
                  ? "managed.photoPreparing"
                  : "managed.photoOrganizing",
              )}
            </Text>
            <Text style={styles.meta}>
              {t("ai.elapsed", { seconds: seconds(photoProgress.startedAt) })}
            </Text>
          </View>
          <ProgressBar
            value={
              (photoProgress.completed +
                (photoProgress.phase === "preparing"
                  ? (0.75 * photoProgress.prepared) / photoProgress.batchSize
                  : 0.9)) /
              photoProgress.total
            }
          />
          <Text style={styles.summary}>
            {t("managed.photoBatchesCompleted", {
              completed: photoProgress.completed,
              total: photoProgress.total,
            })}
          </Text>
          <Text style={styles.meta}>
            {photoProgress.phase === "preparing"
              ? t("managed.photoPreparingDetail", {
                  current: photoProgress.currentBatch,
                  prepared: photoProgress.prepared,
                  total: photoProgress.batchSize,
                })
              : t("ai.progressTps", { rate: tokenRate.toFixed(1) })}
          </Text>
        </Card>
        <Button
          label={t("ai.stop")}
          icon="stop.fill"
          variant="secondary"
          onPress={() => controller.current?.abort()}
        />
      </View>
    );

  return (
    <View style={styles.stack}>
      {controls}
      {addingPhotos ? (
        <Text style={styles.hint}>{t("managed.morePhotosHint")}</Text>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>{t("setEditor.rawWords")}</Text>
          <Card style={styles.areaCard}>
            <TextInput
              accessibilityLabel={t("setEditor.rawWords")}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              maxLength={LIMITS.input}
              multiline
              onChangeText={setInput}
              placeholder={t("setEditor.rawWordsPlaceholder")}
              placeholderTextColor={colors.faint}
              scrollEnabled={false}
              style={[styles.area, styles.areaTall]}
              value={input}
            />
          </Card>
        </View>
      )}
      {busy ? (
        <Animated.View entering={swapIn}>
          <Card style={styles.progress}>
            <View style={styles.progressHead}>
              <Text style={styles.progressTitle}>{t("managed.organize")}</Text>
              <Text style={styles.meta}>
                {t("ai.elapsed", { seconds: seconds(startedAt) })}
              </Text>
            </View>
            <Text style={styles.summary}>{t("ai.generating")}</Text>
            <Text style={styles.meta}>
              {t("ai.progressTps", { rate: tokenRate.toFixed(1) })}
            </Text>
          </Card>
        </Animated.View>
      ) : null}
      {!uid ? (
        <Text style={styles.hint}>{t("managed.signInRequired")}</Text>
      ) : null}
      {errorText}
      <View style={styles.actions}>
        {busy ? (
          <Button
            label={t("ai.stop")}
            icon="stop.fill"
            variant="secondary"
            onPress={() => controller.current?.abort()}
          />
        ) : addingPhotos ? (
          <>
            <Button
              label={t("managed.noMorePhotos")}
              icon="arrow.right"
              onPress={() => onPhase("review")}
            />
            <Button
              label={
                admin
                  ? t("managed.addPhotos")
                  : `${t("managed.addPhotos")} · ${t("managed.photoPointsShort", { points: photoCost })}`
              }
              icon="camera"
              variant="secondary"
              disabled={!uid}
              onPress={() => choosePhotos(selectPhotos)}
            />
          </>
        ) : (
          <>
            <Button
              label={
                admin
                  ? t("managed.organize")
                  : `${t("managed.organize")} · ${t("managed.expectedShort", { points: textCost })}`
              }
              icon="sparkles"
              disabled={!input.trim() || !uid}
              onPress={() => void organizeText()}
            />
            <Button
              label={
                admin
                  ? t("managed.photo")
                  : `${t("managed.photo")} · ${t("managed.photoPointsShort", { points: photoCost })}`
              }
              icon="camera"
              variant="secondary"
              disabled={!uid}
              onPress={() => choosePhotos(selectPhotos)}
            />
            {review ? (
              <Button
                label={t("ai.viewResults")}
                variant="ghost"
                onPress={() => onPhase("review")}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  field: { gap: 8 },
  label: {
    ...type.hint,
    fontWeight: "600",
    color: colors.muted,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    ...type.section,
    color: colors.foreground,
    paddingHorizontal: 4,
  },
  hint: { ...type.hint, color: colors.muted, paddingHorizontal: 4 },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
  areaCard: { paddingVertical: 12 },
  area: { ...type.body, color: colors.foreground, minHeight: 120 },
  areaTall: { minHeight: 180 },
  thumbs: { gap: 10, paddingHorizontal: 2 },
  thumb: {
    width: 96,
    height: 128,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: colors.inset,
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbRemove: { position: "absolute", top: 6, right: 6 },
  progress: { gap: 12 },
  progressHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  progressTitle: { ...type.section, color: colors.foreground, flexShrink: 1 },
  summary: { ...type.body, color: colors.foreground },
  meta: { ...type.hint, color: colors.muted, fontVariant: ["tabular-nums"] },
  actions: { gap: 10 },
});
