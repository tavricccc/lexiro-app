import { StyleSheet, Text, View } from "react-native";

import { colors, type } from "@/lib/theme";

/** **bold** runs inside one line. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={index} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * The little Markdown the AI explanations use: headings, bullet and numbered
 * lists, bold, and paragraphs.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split("\n");
  return (
    <View style={styles.stack}>
      {blocks.map((raw, index) => {
        const line = raw.trimEnd();
        if (!line.trim()) return null;
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading)
          return (
            <Text
              key={index}
              selectable
              style={heading[1].length <= 2 ? styles.h2 : styles.h3}
            >
              <Inline text={heading[2]} />
            </Text>
          );
        const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
        const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
        if (bullet || numbered) {
          const indent = (bullet ?? numbered)![1].length >= 2 ? 16 : 0;
          return (
            <View key={index} style={[styles.item, { paddingLeft: indent }]}>
              <Text style={styles.marker}>
                {bullet ? "•" : `${numbered![2]}.`}
              </Text>
              <Text selectable style={styles.itemText}>
                <Inline text={bullet ? bullet[2] : numbered![3]} />
              </Text>
            </View>
          );
        }
        return (
          <Text key={index} selectable style={styles.paragraph}>
            <Inline text={line} />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  h2: { ...type.section, color: colors.foreground, marginTop: 6 },
  h3: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.foreground,
    marginTop: 4,
  },
  paragraph: { ...type.body, color: colors.foreground },
  bold: { fontWeight: "700" },
  item: { flexDirection: "row", gap: 8 },
  marker: { ...type.body, color: colors.muted, minWidth: 16 },
  itemText: { flex: 1, ...type.body, color: colors.foreground },
});
