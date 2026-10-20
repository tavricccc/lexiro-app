import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/layout";
import { normalizeOptionReasons } from "@/core/components/questions/option-reasons";
import { t } from "@/core/lib/i18n";
import { colors, radius, space, type } from "@/lib/theme";

/** One question as a learner meets it, with the answer and the reasons shown. */
export function QuestionPreview({
  prompt,
  options,
  answerIndex,
  explanation,
  whyWrong,
}: {
  prompt?: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
  whyWrong?: Record<string, string>;
}) {
  const reasons = normalizeOptionReasons(options, whyWrong, answerIndex);
  return (
    <View style={styles.stack}>
      {prompt ? <Text style={styles.prompt}>{prompt}</Text> : null}
      <View style={styles.options}>
        {options.map((option, index) => {
          const correct = index === answerIndex;
          return (
            <View
              key={index}
              style={[styles.option, correct && styles.optionCorrect]}
            >
              <Text style={styles.optionText}>
                {`${String.fromCharCode(65 + index)}  ${option}`}
              </Text>
              {correct ? (
                <SymbolView
                  name="checkmark.circle.fill"
                  size={22}
                  tintColor={colors.success}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      {explanation?.trim() || reasons ? (
        <Card style={styles.explain}>
          {explanation?.trim() ? (
            <View style={styles.block}>
              <Text style={styles.label}>{t("questions.explanation")}</Text>
              <Text style={styles.body}>{explanation.trim()}</Text>
            </View>
          ) : null}
          {reasons
            ? Object.entries(reasons).map(([option, reason]) => (
                <View key={option} style={styles.block}>
                  <Text style={styles.label}>{option}</Text>
                  <Text style={styles.body}>{reason}</Text>
                </View>
              ))
            : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  prompt: {
    fontSize: 17,
    lineHeight: 28,
    fontWeight: "600",
    color: colors.foreground,
  },
  options: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: space.row,
    paddingVertical: 12,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.card,
  },
  optionCorrect: { backgroundColor: colors.successSoft },
  optionText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    color: colors.foreground,
  },
  explain: { gap: 14 },
  block: { gap: 4 },
  label: { ...type.hint, fontWeight: "600", color: colors.muted },
  body: { ...type.body, color: colors.foreground },
});
