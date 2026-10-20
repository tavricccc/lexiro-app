import * as Haptics from "expo-haptics";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";

import { BRAND_LIGHT, colors, radius, space, type } from "@/lib/theme";
import { showActionSheet } from "./menu";

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
                style={[
                  styles.separator,
                  { marginLeft: iconInset ? ICON_INSET : space.row },
                ]}
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
          tintColor={
            destructive ? colors.destructive : (iconTint ?? colors.brand)
          }
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
        <SymbolView
          name="chevron.right"
          size={13}
          weight="semibold"
          tintColor={colors.faint}
        />
      ) : null}
    </Pressable>
  );
}

/** A row that picks one value out of a list; the check pops in on the chosen row. */
export function CheckRow({
  title,
  subtitle,
  icon,
  detail,
  checked,
  disabled,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: SymbolViewProps["name"];
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      detail={detail}
      onPress={
        disabled
          ? undefined
          : () => {
              if (!checked) void Haptics.selectionAsync();
              onPress();
            }
      }
      accessory={
        <View style={styles.check}>
          {checked ? (
            <Animated.View
              entering={ZoomIn.springify().damping(14)}
              exiting={ZoomOut.duration(120)}
            >
              <SymbolView
                name="checkmark"
                size={17}
                weight="bold"
                tintColor={colors.brand}
              />
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
  disabled,
  onValueChange,
}: {
  title: string;
  subtitle?: string;
  icon?: SymbolViewProps["name"];
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      accessory={
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ true: BRAND_LIGHT }}
        />
      }
    />
  );
}

/** A short value on one line: its label on the left, what you type on the right. */
export function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  invalid,
  autoFocus,
  editable = true,
  autoCapitalize = "none",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
}) {
  return (
    <View style={styles.row}>
      <Text
        style={[styles.inputLabel, invalid && { color: colors.destructive }]}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
        editable={editable}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

/** A sentence-length value: the label sits above, the text gets the width. */
export function TextBlockRow({
  label,
  value,
  onChangeText,
  placeholder,
  onRemove,
  removeLabel,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onRemove?: () => void;
  removeLabel?: string;
  editable?: boolean;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={styles.blockLabel}>{label}</Text>
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={removeLabel}
            hitSlop={10}
            onPress={onRemove}
          >
            <SymbolView
              name="minus.circle.fill"
              size={20}
              tintColor={colors.destructive}
            />
          </Pressable>
        ) : null}
      </View>
      <TextInput
        accessibilityLabel={label}
        autoCorrect={false}
        editable={editable}
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        scrollEnabled={false}
        style={styles.blockInput}
        value={value}
      />
    </View>
  );
}

/** A tappable verb inside a group: 新增例句, 刪除此詞義. */
export function ActionRow({
  title,
  icon,
  destructive,
  disabled,
  onPress,
}: {
  title: string;
  icon?: SymbolViewProps["name"];
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const tint = destructive ? colors.destructive : colors.brand;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <SymbolView
        name={icon ?? (destructive ? "minus.circle" : "plus.circle")}
        size={22}
        tintColor={tint}
        style={styles.icon}
      />
      <Text style={[styles.title, { color: tint }]}>{title}</Text>
    </Pressable>
  );
}

/** Picks one option from a native action sheet; shows the current choice on the right. */
export function PickerRow<T extends string>({
  title,
  icon,
  value,
  options,
  onChange,
  disabled,
}: {
  title: string;
  icon?: SymbolViewProps["name"];
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <ListRow
      title={title}
      icon={icon}
      detail={current?.label}
      accessory={
        <SymbolView
          name="chevron.up.chevron.down"
          size={13}
          weight="semibold"
          tintColor={colors.faint}
        />
      }
      onPress={
        disabled
          ? undefined
          : () =>
              showActionSheet({
                title,
                actions: options.map((option) => ({
                  label: option.label,
                  // The current choice is shown greyed out, as iOS has no checkmark here.
                  disabled: option.value === value,
                  onSelect: () => {
                    void Haptics.selectionAsync();
                    onChange(option.value);
                  },
                })),
              })
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
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
  disabled: { opacity: 0.4 },
  inputLabel: { ...type.row, color: colors.foreground, width: 92 },
  input: {
    ...type.row,
    flex: 1,
    color: colors.foreground,
    textAlign: "right",
    paddingVertical: 4,
  },
  block: { gap: 4, paddingHorizontal: space.row, paddingVertical: 12 },
  blockHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockLabel: { ...type.hint, color: colors.muted },
  blockInput: {
    ...type.body,
    color: colors.foreground,
    minHeight: 24,
    paddingVertical: 2,
  },
});
