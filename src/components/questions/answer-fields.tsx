import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

import { ListGroup, ListRow, TextBlockRow } from "@/components/ui/list";
import { glide, swapIn, swapOut } from "@/components/ui/motion";
import { remapOptionReasons } from "@/core/components/questions/option-reasons";
import { t } from "@/core/lib/i18n";
import { colors, radius, space, type } from "@/lib/theme";

/**
 * The four choices with the right one marked in place: tap the circle to make
 * an option the answer, type in the field to change its text.
 */
export function AnswerFields({
  title = t("questions.options"),
  options,
  answerIndex,
  error,
  multiline = false,
  onAnswerChange,
  onOptionChange,
}: {
  title?: string;
  options: string[];
  answerIndex: number;
  error?: string | false;
  multiline?: boolean;
  onAnswerChange: (index: number) => void;
  onOptionChange: (index: number, value: string) => void;
}) {
  return (
    <ListGroup
      title={title}
      footer={error || t("questions.correctHint")}
      iconInset={false}
    >
      {options.map((option, index) => {
        const correct = index === answerIndex;
        return (
          <View key={index} style={[styles.option, correct && styles.correct]}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: correct }}
              accessibilityLabel={t("questions.markCorrect", {
                index: index + 1,
              })}
              hitSlop={8}
              onPress={() => {
                if (correct) return;
                void Haptics.selectionAsync();
                onAnswerChange(index);
              }}
              style={styles.mark}
            >
              <SymbolView
                name={correct ? "checkmark.circle.fill" : "circle"}
                size={24}
                tintColor={correct ? colors.success : colors.faint}
              />
            </Pressable>
            <Text style={styles.letter}>{String.fromCharCode(65 + index)}</Text>
            <TextInput
              accessibilityLabel={t("questions.optionLabel", {
                index: index + 1,
              })}
              autoCorrect={false}
              autoCapitalize="none"
              multiline={multiline}
              scrollEnabled={false}
              onChangeText={(value) => onOptionChange(index, value)}
              placeholder={t("questions.optionLabel", { index: index + 1 })}
              placeholderTextColor={colors.faint}
              style={styles.input}
              value={option}
            />
          </View>
        );
      })}
    </ListGroup>
  );
}

/** Why each wrong option is wrong, folded away until asked for, as on the web. */
export function ReasonFields({
  options,
  answerIndex,
  reasons,
  onChange,
}: {
  options: string[];
  answerIndex: number;
  reasons?: Record<string, string>;
  onChange: (reasons: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrong = options.flatMap((option, index) =>
    index === answerIndex || !option.trim() ? [] : [{ option, index }],
  );
  return (
    <ListGroup iconInset={false}>
      <ListRow
        title={t("questions.distractorReasons")}
        accessory={
          <SymbolView
            name={open ? "chevron.up" : "chevron.down"}
            size={13}
            weight="semibold"
            tintColor={colors.faint}
          />
        }
        onPress={() => setOpen((value) => !value)}
      />
      {open
        ? wrong.map(({ option, index }) => (
            <Animated.View
              key={index}
              entering={swapIn}
              exiting={swapOut}
              layout={glide}
            >
              <TextBlockRow
                label={t("questions.reasonForOption", {
                  letter: String.fromCharCode(65 + index),
                  option: option.trim(),
                })}
                value={reasons?.[option.trim()] ?? ""}
                placeholder={t("questions.reasonPlaceholder")}
                onChangeText={(value) =>
                  onChange({
                    ...remapOptionReasons(
                      options,
                      options,
                      reasons,
                      answerIndex,
                    ),
                    [option.trim()]: value,
                  })
                }
              />
            </Animated.View>
          ))
        : null}
    </ListGroup>
  );
}

export interface SenseOption {
  label: string;
  value: string;
}

/**
 * The sense a question tests. A set can hold thousands, so the choice opens a
 * searchable sheet instead of an action sheet.
 */
export function SensePickerRow({
  value,
  options,
  invalid,
  onChange,
}: {
  value: string;
  options: SenseOption[];
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle
        ? options.filter((option) =>
            option.label.toLowerCase().includes(needle),
          )
        : options,
    [needle, options],
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.senseRow, pressed && styles.pressed]}
      >
        <View style={styles.senseText}>
          <Text
            style={[
              styles.senseTitle,
              invalid && { color: colors.destructive },
            ]}
          >
            {t("questions.linkedSense")}
          </Text>
          <Text
            numberOfLines={2}
            style={current ? styles.senseValue : styles.sensePlaceholder}
          >
            {current?.label ?? t("questions.selectSense")}
          </Text>
        </View>
        <SymbolView
          name="chevron.right"
          size={13}
          weight="semibold"
          tintColor={colors.faint}
        />
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t("questions.selectSense")}</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setOpen(false)}
            >
              <Text style={styles.sheetDone}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <SymbolView
              name="magnifyingglass"
              size={16}
              tintColor={colors.faint}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setQuery}
              placeholder="搜尋單字或中文"
              placeholderTextColor={colors.faint}
              style={styles.searchInput}
              value={query}
            />
          </View>
          <FlatList
            data={shown}
            keyExtractor={(option) => option.value}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => {
              const chosen = item.value === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.choiceText}>{item.label}</Text>
                  {chosen ? (
                    <SymbolView
                      name="checkmark"
                      size={16}
                      weight="semibold"
                      tintColor={colors.brand}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: space.row,
    paddingVertical: 8,
  },
  correct: { backgroundColor: colors.successSoft },
  mark: { width: 28, alignItems: "center" },
  letter: { width: 16, ...type.hint, color: colors.muted },
  input: {
    flex: 1,
    ...type.row,
    color: colors.foreground,
    paddingVertical: 6,
  },
  senseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: space.row,
    paddingVertical: 11,
  },
  pressed: { backgroundColor: colors.pressed },
  senseText: { flex: 1, gap: 2 },
  senseTitle: { ...type.hint, color: colors.muted },
  senseValue: { ...type.row, color: colors.foreground },
  sensePlaceholder: { ...type.row, color: colors.faint },
  sheet: { flex: 1, backgroundColor: colors.canvas },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.gutter + 4,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitle: { ...type.section, color: colors.foreground },
  sheetDone: { fontSize: 17, color: colors.brand },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: space.gutter,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: colors.secondary,
  },
  searchInput: { flex: 1, fontSize: 17, color: colors.foreground },
  sheetList: {
    marginHorizontal: space.gutter,
    borderRadius: radius.card,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: colors.card,
    marginBottom: 40,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space.row,
    backgroundColor: colors.separator,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 50,
    paddingHorizontal: space.row,
    paddingVertical: 12,
  },
  choiceText: { flex: 1, ...type.body, color: colors.foreground },
});
