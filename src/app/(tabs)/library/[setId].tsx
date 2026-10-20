import { Stack, router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { GroupedSection } from "@/components/grouped";
import { senseCount, setWords } from "@/lexiro/library";
import { speak } from "@/lib/speech";
import { useApp } from "@/lib/store";
import { brand } from "@/lib/theme";

export default function SetScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const library = useApp((state) => state.library);
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
      <Stack.SearchBar placeholder="搜尋單字或中文" onChangeText={(event) => setQuery(event.nativeEvent.text)} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="play.fill"
          onPress={() => router.push({ pathname: "/session", params: { setId, tasks: "meaning" } })}
        >
          練習
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={styles.summary}>{senseCount(library, setId)} 個詞義</Text>
        <GroupedSection>
          {visible.map((entry, index) => (
            <View
              key={entry.wordKey}
              style={[styles.word, index < visible.length - 1 && styles.separator]}
            >
              <View style={styles.wordBody}>
                <Text style={styles.spelling}>{entry.word}</Text>
                {entry.senses.map((sense) => (
                  <Text key={sense.id} style={styles.sense}>
                    {sense.pos ? <Text style={styles.pos}>{sense.pos} </Text> : null}
                    {sense.meaningZh}
                  </Text>
                ))}
              </View>
              <Pressable
                accessibilityLabel={`播放 ${entry.word} 的讀音`}
                hitSlop={10}
                onPress={() => speak(entry.word)}
              >
                <SymbolView name="speaker.wave.2.fill" size={20} tintColor={brand} />
              </Pressable>
            </View>
          ))}
        </GroupedSection>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  summary: {
    color: PlatformColor("secondaryLabel"),
    fontSize: 15,
    marginHorizontal: 32,
    marginTop: 8,
  },
  word: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  wordBody: { flex: 1, gap: 3 },
  spelling: { color: PlatformColor("label"), fontSize: 19, fontWeight: "600" },
  sense: { color: PlatformColor("secondaryLabel"), fontSize: 15 },
  pos: { fontStyle: "italic" },
});
