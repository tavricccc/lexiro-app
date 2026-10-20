import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { glide, pop, swapIn } from "@/components/ui/motion";
import { ParticleBurst } from "@/components/ui/particle-burst";
import { t } from "@/core/lib/i18n";
import type { RoomReview, RoomState } from "@/core/lib/room-client";
import { colors, latin, radius, type } from "@/lib/theme";
import { PassageText } from "./passage-text";
import { PlayerList } from "./player-list";

/** The final ranking, then the questions this player got wrong or missed. */
export function RoomFinished({ state }: { state: RoomState }) {
  const winner = state.players[0];
  return (
    <View style={styles.stack}>
      <View style={styles.hero}>
        <View style={styles.heroBubble} />
        <View style={styles.trophy}>
          <Animated.View entering={pop}>
            <SymbolView
              name="trophy.fill"
              size={40}
              tintColor={colors.fieldInk}
            />
          </Animated.View>
          <ParticleBurst play={1} count={28} reach={140} />
        </View>
        <Text style={styles.final}>{t("rooms.final")}</Text>
        {winner ? (
          <Animated.View entering={swapIn.delay(180)}>
            <Text style={styles.winner} numberOfLines={1}>
              {winner.name}
            </Text>
            <Text style={styles.winnerScore}>
              {winner.score}
              <Text style={styles.winnerUnit}> 分</Text>
            </Text>
          </Animated.View>
        ) : null}
      </View>
      <PlayerList state={state} showScore />
      {state.review ? <Review review={state.review} /> : null}
      <View style={styles.actions}>
        <Button
          label={t("rooms.newRoom")}
          icon="plus"
          onPress={() => router.replace("/rooms/new")}
        />
        <Button
          label={t("rooms.leave")}
          variant="ghost"
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

function Review({ review }: { review: RoomReview }) {
  return (
    <View style={styles.review}>
      <Text style={styles.section}>{t("rooms.review")}</Text>
      <Text style={styles.hint}>
        {review.items.length
          ? t("rooms.reviewCount", { count: review.items.length })
          : t("rooms.reviewEmpty")}
      </Text>
      {review.items.map((item) => (
        <ReviewItem key={item.index} item={item} passages={review.passages} />
      ))}
    </View>
  );
}

function ReviewItem({
  item,
  passages,
}: {
  item: RoomReview["items"][number];
  passages: RoomReview["passages"];
}) {
  const [showPassage, setShowPassage] = useState(false);
  const passage = item.question.passageId
    ? passages[item.question.passageId]
    : undefined;
  return (
    <Animated.View layout={glide}>
      <ListGroup
        title={[
          t("rooms.reviewItem", { number: item.index + 1 }),
          ...(item.choice === null ? [t("rooms.missed")] : []),
        ].join(" · ")}
        footer={item.explanation ?? undefined}
        iconInset={false}
      >
        {passage ? (
          <ListRow
            icon="doc.text"
            title={`${t("rooms.showPassage")} · ${passage.title}`}
            accessory={
              <SymbolView
                name={showPassage ? "chevron.up" : "chevron.down"}
                size={13}
                weight="semibold"
                tintColor={colors.faint}
              />
            }
            onPress={() => setShowPassage((value) => !value)}
          />
        ) : null}
        {passage && showPassage ? (
          <Animated.View entering={swapIn} style={styles.passage}>
            <PassageText
              passage={passage.text}
              activeBlank={item.question.blank}
            />
          </Animated.View>
        ) : null}
        <View style={styles.prompt}>
          <Text style={styles.promptText}>
            {item.question.blank
              ? t("questions.blankLabel", { index: item.question.blank })
              : item.question.prompt}
          </Text>
        </View>
        {item.question.options.flatMap((option, index) => {
          const accepted = item.accepted.includes(index);
          const chosen = item.choice === index;
          if (!accepted && !chosen) return [];
          return [
            <View key={index} style={styles.option}>
              <View
                style={[
                  styles.letter,
                  {
                    backgroundColor: accepted
                      ? colors.success
                      : colors.destructive,
                  },
                ]}
              >
                <Text style={styles.letterText}>
                  {String.fromCharCode(65 + index)}
                </Text>
              </View>
              <Text style={styles.optionText}>
                {option}
                {chosen ? (
                  <Text
                    style={styles.yours}
                  >{`  ${t("rooms.yourAnswer")}`}</Text>
                ) : null}
              </Text>
            </View>,
          ];
        })}
      </ListGroup>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  // The winner on the orange poster, the score at poster size.
  hero: {
    overflow: "hidden",
    gap: 4,
    padding: 22,
    borderRadius: radius.stage,
    borderCurve: "continuous",
    backgroundColor: colors.field,
  },
  heroBubble: {
    position: "absolute",
    bottom: -60,
    right: -70,
    width: 210,
    height: 140,
    borderRadius: 999,
    backgroundColor: colors.fieldInk,
  },
  trophy: { alignSelf: "flex-start", marginBottom: 10 },
  final: { ...type.section, color: colors.fieldInk },
  winner: { ...type.display, color: colors.fieldInk },
  winnerScore: {
    ...type.poster,
    color: colors.fieldInk,
    fontVariant: ["tabular-nums"],
  },
  winnerUnit: { fontSize: 24, fontFamily: undefined, fontWeight: "800", letterSpacing: 0 },
  actions: { gap: 10 },
  review: { gap: 12 },
  section: { ...type.section, color: colors.foreground, paddingHorizontal: 4 },
  hint: { ...type.hint, color: colors.muted, paddingHorizontal: 4 },
  passage: { paddingHorizontal: 20, paddingVertical: 12 },
  prompt: { paddingHorizontal: 20, paddingVertical: 14 },
  promptText: {
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "600",
    color: colors.foreground,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  // The answer-card bubble, filled in green or red.
  letter: {
    width: 39,
    height: 26,
    borderRadius: radius.bubble,
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: { ...latin.bold, fontSize: 15, color: "#ffffff" },
  optionText: { flex: 1, ...type.body, color: colors.foreground },
  yours: { ...type.hint, color: colors.muted },
});
