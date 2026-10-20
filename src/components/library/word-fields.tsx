import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { ActionRow, InputRow, ListGroup, TextBlockRow } from "@/components/ui/list";
import { glide, swapIn } from "@/components/ui/motion";
import { t } from "@/core/lib/i18n";
import { randomUUID } from "@/core/lib/id";
import type { WordDraft } from "@/core/types";
import { colors, type } from "@/lib/theme";

type SenseDraft = WordDraft["senses"][number];

export const emptySense = (): SenseDraft => ({
  id: randomUUID(),
  pos: "",
  meaning: "",
  examples: [""],
  supplementary: false,
});

export const emptyWordDraft = (): WordDraft => ({ word: "", senses: [emptySense()] });

/** The web editor's rule: a headword, at least one sense, each with a POS and meaning. */
export function wordDraftIncomplete(draft: WordDraft): boolean {
  return (
    !draft.word.trim() ||
    !draft.senses.length ||
    draft.senses.some((sense) => !sense.pos.trim() || !sense.meaning.trim())
  );
}

/** The example sentences of one sense, as rows of its group. */
export function ExampleRows({
  values,
  onChange,
  editable,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  editable?: boolean;
}) {
  return [
    ...values.map((example, index) => (
      <Animated.View key={`example-${index}`} entering={FadeIn.duration(200)} exiting={FadeOut.duration(140)} layout={glide}>
        <TextBlockRow
          label={t("wordEdit.example", { count: index + 1 })}
          value={example}
          editable={editable}
          placeholder={t("setEditor.examplePlaceholder")}
          onChangeText={(next) => onChange(values.map((text, i) => (i === index ? next : text)))}
          removeLabel={t("wordEdit.removeExample")}
          onRemove={
            values.length > 1 ? () => onChange(values.filter((_, i) => i !== index)) : undefined
          }
        />
      </Animated.View>
    )),
    <ActionRow
      key="add-example"
      title={t("wordEdit.addExample")}
      disabled={editable === false}
      onPress={() => onChange([...values, ""])}
    />,
  ];
}

/**
 * One word as grouped lists, as on the web: the headword, then one group per
 * sense with its examples and what you can do to it as rows.
 */
export function WordFields({
  draft,
  onChange,
  submitted,
  busy,
}: {
  draft: WordDraft;
  onChange: (draft: WordDraft) => void;
  submitted: boolean;
  busy?: boolean;
}) {
  const updateSense = (index: number, patch: Partial<SenseDraft>) =>
    onChange({
      ...draft,
      senses: draft.senses.map((sense, i) => (i === index ? { ...sense, ...patch } : sense)),
    });

  return (
    <>
      <Animated.View entering={swapIn} layout={glide}>
        <ListGroup iconInset={false}>
          <InputRow
            label={t("setEditor.word")}
            value={draft.word}
            editable={!busy}
            invalid={submitted && !draft.word.trim()}
            placeholder={t("setEditor.wordPlaceholder")}
            onChangeText={(word) => onChange({ ...draft, word })}
          />
        </ListGroup>
      </Animated.View>

      {draft.senses.map((sense, index) => (
        <Animated.View
          key={sense.id}
          entering={swapIn}
          exiting={FadeOut.duration(160)}
          layout={glide}
        >
          <ListGroup
            title={t("wordEdit.sense", { count: index + 1 })}
            footer={sense.supplementary ? t("wordEdit.supplementaryHint") : undefined}
            iconInset={false}
          >
            <InputRow
              label={t("setEditor.pos")}
              value={sense.pos}
              editable={!busy}
              invalid={submitted && !sense.pos.trim()}
              placeholder={t("setEditor.posPlaceholder")}
              onChangeText={(pos) => updateSense(index, { pos })}
            />
            <InputRow
              label={t("setEditor.meaning")}
              value={sense.meaning}
              editable={!busy}
              invalid={submitted && !sense.meaning.trim()}
              placeholder={t("setEditor.meaningPlaceholder")}
              onChangeText={(meaning) => updateSense(index, { meaning })}
            />
            {ExampleRows({
              values: sense.examples,
              editable: !busy,
              onChange: (examples) => updateSense(index, { examples }),
            })}
            {draft.senses.length > 1 ? (
              <ActionRow
                destructive
                disabled={busy}
                title={t("wordEdit.removeSense")}
                onPress={() =>
                  onChange({ ...draft, senses: draft.senses.filter((_, i) => i !== index) })
                }
              />
            ) : null}
          </ListGroup>
        </Animated.View>
      ))}

      <Animated.View layout={glide}>
        <ListGroup iconInset={false}>
          <ActionRow
            title={t("wordEdit.addSense")}
            disabled={busy}
            onPress={() => onChange({ ...draft, senses: [...draft.senses, emptySense()] })}
          />
        </ListGroup>
      </Animated.View>

      {submitted && wordDraftIncomplete(draft) ? (
        <Animated.View entering={FadeIn}>
          <Text style={styles.error}>還有欄位沒填完，紅字標示的欄位需要補齊。</Text>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
});
