import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ReactNode } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";

import { brand } from "@/lib/theme";

/**
 * The inset grouped list of Settings and Notes, built from React Native views
 * so it scrolls under the native large title. Every color is a system color,
 * so dark mode and increased contrast come from iOS itself.
 */
export function GroupedSection({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {header ? <Text style={styles.header}>{header}</Text> : null}
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function GroupedRow({
  title,
  subtitle,
  detail,
  icon,
  chevron,
  last,
  onPress,
  accessory,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  icon?: SymbolViewProps["name"];
  chevron?: boolean;
  last?: boolean;
  onPress?: () => void;
  accessory?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? (
        <SymbolView name={icon} size={22} tintColor={brand} style={styles.icon} />
      ) : null}
      <View style={[styles.rowBody, !last && styles.separator]}>
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {accessory}
        {chevron ? (
          <SymbolView
            name="chevron.right"
            size={13}
            weight="semibold"
            tintColor={PlatformColor("tertiaryLabel")}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export const groupedBackground = PlatformColor("systemGroupedBackground");

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginTop: 24 },
  header: {
    color: PlatformColor("secondaryLabel"),
    fontSize: 13,
    textTransform: "uppercase",
    marginHorizontal: 16,
    marginBottom: 6,
  },
  footer: {
    color: PlatformColor("secondaryLabel"),
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 6,
  },
  card: {
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
    borderRadius: 26,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  pressed: { backgroundColor: PlatformColor("systemGray4") },
  icon: { width: 28, height: 28, marginRight: 12 },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingVertical: 10,
    paddingRight: 16,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  rowText: { flex: 1, gap: 2 },
  title: { color: PlatformColor("label"), fontSize: 17 },
  subtitle: { color: PlatformColor("secondaryLabel"), fontSize: 15 },
  detail: { color: PlatformColor("secondaryLabel"), fontSize: 17 },
});
