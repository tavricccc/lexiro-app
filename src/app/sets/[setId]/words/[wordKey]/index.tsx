import { router, Stack, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";

import { Card, EmptyState, Screen } from "@/components/ui/layout";
import { PressableScale } from "@/components/ui/pressable-scale";
import { t } from "@/core/lib/i18n";
import { useLibraryStore } from "@/core/stores/library-store";
import type { WordKey } from "@/core/types";
import { speak } from "@/lib/speech";
import { colors, latin, type } from "@/lib/theme";

/** One word read in full: every meaning in this set with all its examples. */
export default function WordDetailScreen() {
  const { setId, wordKey } = useLocalSearchParams<{
    setId: string;
    wordKey: string;
  }>();
  const state = useLibraryStore((store) => store.state);
  const key = wordKey as WordKey;
  const word = state.words[key];
  const membership = (state.memberships[setId] ?? []).find(
    (entry) => entry.wordKey === key,
  );
  const senses = word?.senses.filter((sense) =>
    membership?.senseIds.includes(sense.id),
  );

  const header = (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>
        完成
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );

  if (!word || !senses?.length)
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        {header}
        <EmptyState
          illustrated={false}
          title={t("setDetail.missingWord")}
          body={t("setDetail.missingWordDescription")}
        />
      </Screen>
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      {header}
      <View style={styles.head}>
        <Text style={styles.spelling} selectable>
          {word.word}
        </Text>
        <PressableScale
          scaleTo={0.85}
          accessibilityRole="button"
          accessibilityLabel={t("setDetail.speak")}
          hitSlop={10}
          onPress={() => speak(word.word)}
          style={styles.speak}
        >
          <SymbolView
            name="speaker.wave.2.fill"
            size={19}
            tintColor={colors.fieldInk}
          />
        </PressableScale>
      </View>
      {senses.map((sense) => (
        <Card key={sense.id} style={styles.sense}>
          <Text style={styles.meaning} selectable>
            {sense.pos ? <Text style={styles.pos}>{sense.pos} </Text> : null}
            {sense.meaningZh}
          </Text>
          {sense.examples
            .filter((example) => example.trim())
            .map((example, index) => (
              <Text key={index} style={styles.example} selectable>
                {example}
              </Text>
            ))}
          {sense.supplementary ? (
            <Text style={styles.hint}>{t("wordEdit.supplementaryHint")}</Text>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  spelling: {
    ...latin.heavy,
    flexShrink: 1,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.5,
    color: colors.foreground,
  },
  // A bubble in the card's orange.
  speak: {
    width: 56,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.field,
  },
  sense: { gap: 8 },
  meaning: { ...type.section, color: colors.foreground },
  pos: { ...latin.semibold, color: colors.brand },
  example: { ...type.body, color: colors.muted },
  hint: { ...type.hint, color: colors.muted },
});
