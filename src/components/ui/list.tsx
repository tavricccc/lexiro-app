import * as Haptics from "expo-haptics";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View, type ViewStyle } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";

import { BRAND_LIGHT, colors, radius, space, type } from "@/lib/theme";

const ICON_INSET = space.row + 24 + 14;

/**
 * The iOS inset grouped list: one card per group, hairline separators that
 * start after the row icon, and the group title above it.
 */
export function ListGroup({
  title,
  aside,
  footer,
  children,
  iconInset = true,
  style,
}: {
  title?: string;
  aside?: ReactNode;
  footer?: string;
  children: ReactNode;
  /** Separators start after the icon column; turn off for rows without icons. */
  iconInset?: boolean;
  style?: ViewStyle;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {title || aside ? (
        <View style={styles.groupHeader}>
          {title ? <Text style={styles.groupTitle}>{title}</Text> : <View />}
          {aside}
        </View>
      ) : null}
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index ? (
              <View
                style={[styles.separator, { marginLeft: iconInset ? ICON_INSET : space.row }]}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  detail,
  icon,
  iconTint,
  leading,
  chevron,
  accessory,
  destructive,
  onPress,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  icon?: SymbolViewProps["name"];
  iconTint?: ViewStyle["backgroundColor"];
  leading?: ReactNode;
  chevron?: boolean;
  accessory?: ReactNode;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {leading}
      {icon ? (
        <SymbolView
          name={icon}
          size={22}
          tintColor={destructive ? colors.destructive : (iconTint ?? colors.brand)}
          style={styles.icon}
        />
      ) : null}
      <View style={styles.rowText}>
        <Text
          style={[styles.title, destructive && { color: colors.destructive }]}
          numberOfLines={2}
        >
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
        <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={colors.faint} />
      ) : null}
    </Pressable>
  );
}

/** A row that picks one value out of a list; the check pops in on the chosen row. */
export function CheckRow({
  title,
  subtitle,
  icon,
  checked,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: SymbolViewProps["name"];
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      onPress={() => {
        if (!checked) void Haptics.selectionAsync();
        onPress();
      }}
      accessory={
        <View style={styles.check}>
          {checked ? (
            <Animated.View
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(120)}
            >
              <SymbolView name="checkmark" size={17} weight="bold" tintColor={colors.brand} />
            </Animated.View>
          ) : null}
        </View>
      }
    />
  );
}

export function SwitchRow({
  title,
  subtitle,
  icon,
  value,
  onValueChange,
}: {
  title: string;
  subtitle?: string;
  icon?: SymbolViewProps["name"];
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      accessory={
        <Switch value={value} onValueChange={onValueChange} trackColor={{ true: BRAND_LIGHT }} />
      }
    />
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  groupTitle: { ...type.section, color: colors.foreground },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  footer: { ...type.hint, color: colors.muted, paddingHorizontal: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 52,
    paddingHorizontal: space.row,
    paddingVertical: 11,
  },
  pressed: { backgroundColor: colors.pressed },
  icon: { width: 24, height: 24 },
  rowText: { flex: 1, gap: 2 },
  title: { ...type.row, color: colors.foreground },
  subtitle: { ...type.hint, color: colors.muted },
  detail: { fontSize: 17, color: colors.muted, fontVariant: ["tabular-nums"] },
  check: { width: 22, alignItems: "center" },
});
