import { StyleSheet, Text } from "react-native";

import { BLANK_TOKEN_PATTERN } from "@/core/lib/question-formats";
import { colors } from "@/lib/theme";

/**
 * A passage as on a real paper: blanks are numbered in the running text, the
 * one being answered stands out, and answered blanks show their answer.
 */
export function PassageText({
  passage,
  activeBlank,
  answeredBlanks = {},
}: {
  passage: string;
  activeBlank?: number;
  answeredBlanks?: Record<number, string>;
}) {
  const parts: (string | number)[] = [];
  let cursor = 0;
  for (const match of passage.matchAll(BLANK_TOKEN_PATTERN)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push(passage.slice(cursor, at));
    parts.push(Number(match[1]));
    cursor = at + match[0].length;
  }
  if (cursor < passage.length) parts.push(passage.slice(cursor));

  return (
    <Text selectable style={styles.passage}>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          part
        ) : part === activeBlank ? (
          <Text key={index} style={styles.active}>
            {`  ${part}  `}
          </Text>
        ) : answeredBlanks[part] ? (
          <Text key={index} style={styles.answered}>
            {`(${part}) ${answeredBlanks[part]}`}
          </Text>
        ) : (
          <Text key={index} style={styles.blank}>
            {`(${part}) ____`}
          </Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  passage: { fontSize: 16, lineHeight: 29, color: colors.foreground },
  active: {
    fontWeight: "700",
    color: colors.primaryForeground,
    backgroundColor: colors.primary,
  },
  answered: { color: colors.success, fontWeight: "600" },
  blank: { color: colors.muted, fontVariant: ["tabular-nums"] },
});
