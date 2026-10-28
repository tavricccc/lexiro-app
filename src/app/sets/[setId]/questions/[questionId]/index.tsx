import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  QuestionView,
  type AnsweredBlanks,
} from "@/components/practice/question-view";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen } from "@/components/ui/layout";
import { isCorrectChoice } from "@/core/components/practice/meaning-questions";
import { buildQuestionGroups } from "@/core/components/practice/practice-content";
import { t } from "@/core/lib/i18n";
import { useLibraryStore } from "@/core/stores/library-store";

/**
 * One saved question to answer on its own, straight from the set's list. It
 * is a try, not a practice session: nothing is scheduled or saved, so an
 * unfinished session elsewhere is left as it was.
 */
export default function TryQuestionScreen() {
  const { questionId } = useLocalSearchParams<{
    setId: string;
    questionId: string;
  }>();
  const state = useLibraryStore((store) => store.state);
  const question = state.questions.find((entry) => entry.id === questionId);
  // A passage brings one item per blank or question, answered in turn.
  const items = useMemo(
    () => (question ? (buildQuestionGroups([question], state.words)[0] ?? []) : []),
    [question, state.words],
  );
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<{ id: string; choice: number } | null>(
    null,
  );

  const header = (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>
        完成
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
  const item = items[index];

  if (!item)
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        {header}
        <EmptyState
          illustrated={false}
          title={t("common.loadFailed")}
          body={t("setDetail.missingDescription")}
        />
      </Screen>
    );

  const selected = choices[item.id] ?? null;
  const answered = selected !== null;
  const last = index === items.length - 1;

  // Blanks answered earlier in this passage show their answer in the text.
  const answeredBlanks: AnsweredBlanks = {};
  for (const other of items)
    if (other.blank && choices[other.id] != null)
      answeredBlanks[other.blank] = {
        answer: other.options[other.answerIndex],
      };

  const pendingChoice = pending?.id === item.id ? pending.choice : null;
  const pick = (choice: number) => {
    if (answered) return;
    void Haptics.selectionAsync();
    setPending({ id: item.id, choice });
  };
  const confirm = () => {
    if (answered || pendingChoice === null) return;
    const choice = pendingChoice;
    setPending(null);
    setChoices((current) => ({ ...current, [item.id]: choice }));
    void Haptics.notificationAsync(
      isCorrectChoice(item, choice)
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      {header}
      <QuestionView
        key={item.id}
        item={item}
        selected={selected}
        pending={pendingChoice}
        readOnly={false}
        answeredBlanks={answeredBlanks}
        onAnswer={pick}
      />
      {!answered && pendingChoice !== null ? (
        <View style={styles.actions}>
          <Button
            label={t("practice.confirm")}
            icon="checkmark"
            onPress={confirm}
          />
        </View>
      ) : null}
      {answered ? (
        <View style={styles.actions}>
          {last ? (
            <Button
              label="再做一次"
              icon="arrow.counterclockwise"
              variant="ghost"
              onPress={() => {
                setChoices({});
                setIndex(0);
              }}
            />
          ) : (
            <Button
              label={t("practice.next")}
              icon="chevron.right"
              onPress={() => setIndex(index + 1)}
            />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: 8 },
});
