import { Stack, router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Card, EmptyState, Screen } from "@/components/ui/layout";
import { ListGroup } from "@/components/ui/list";
import { glide, rise } from "@/components/ui/motion";
import { PressableScale } from "@/components/ui/pressable-scale";
import { senseCount, setWords } from "@/lexiro/library";
import { speak } from "@/lib/speech";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors, space, type } from "@/lib/theme";

export default function SetScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const library = useLibraryStore((store) => store.state);
  const set = library.sets.find((entry) => entry.id === setId);
  const words = useMemo(() => setWords(library, setId), [library, setId]);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLocaleLowerCase();
  const visible = needle
    ? words.filter(
        (entry) =>
          entry.word.toLocaleLowerCase().includes(needle) ||
          entry.senses.some((sense) => sense.meaningZh.includes(needle)),
      )
    : words;

  return (
    <>
      <Stack.Screen options={{ title: set?.setName ?? "" }} />
      <Stack.SearchBar
        placeholder="搜尋單字或中文"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <Screen>
        <Animated.View entering={rise(0)}>
          <Card style={styles.summary}>
            <View style={styles.summaryText}>
              <Text style={styles.count}>{senseCount(library, setId)}</Text>
              <Text style={styles.countLabel}>
                {needle
                  ? `個詞義，符合 ${visible.length} / ${words.length} 個單字`
                  : `個詞義，${words.length} 個單字`}
              </Text>
            </View>
            <Button
              label="練習"
              icon="play.fill"
              disabled={!words.length}
              onPress={() => router.push({ pathname: "/practice", params: { setId } })}
            />
          </Card>
        </Animated.View>

        {visible.length ? (
          <Animated.View entering={rise(1)} layout={glide}>
            <ListGroup iconInset={false}>
              {visible.map((entry) => (
                <View key={entry.wordKey} style={styles.word}>
                  <View style={styles.wordBody}>
                    <Text style={styles.spelling}>{entry.word}</Text>
                    {entry.senses.map((sense) => (
                      <View key={sense.id} style={styles.sense}>
                        <Text style={styles.meaning}>
                          {sense.pos ? <Text style={styles.pos}>{sense.pos} </Text> : null}
                          {sense.meaningZh}
                        </Text>
                        {sense.examples[0] ? (
                          <Text style={styles.example} numberOfLines={2}>
                            {sense.examples[0]}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                  <PressableScale
                    scaleTo={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`播放 ${entry.word} 的讀音`}
                    hitSlop={10}
                    onPress={() => speak(entry.word)}
                    style={styles.speak}
                  >
                    <SymbolView name="speaker.wave.2.fill" size={17} tintColor={colors.brand} />
                  </PressableScale>
                </View>
              ))}
            </ListGroup>
          </Animated.View>
        ) : (
          <EmptyState
            illustrated={!needle}
            title={needle ? "找不到單字" : "這一集還沒有單字"}
            body={
              needle ? `沒有符合「${query}」的英文或中文。` : "在網頁版加入單字後會同步到這裡。"
            }
          />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 16 },
  summaryText: { flex: 1, gap: 2 },
  count: { ...type.display, color: colors.foreground, fontVariant: ["tabular-nums"] },
  countLabel: { ...type.hint, color: colors.muted },
  word: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: space.row,
  },
  wordBody: { flex: 1, gap: 4 },
  spelling: { fontSize: 19, fontWeight: "600", color: colors.foreground },
  sense: { gap: 1 },
  meaning: { ...type.body, color: colors.foreground },
  pos: { color: colors.brand, fontStyle: "italic" },
  example: { ...type.hint, color: colors.muted },
  speak: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
});
