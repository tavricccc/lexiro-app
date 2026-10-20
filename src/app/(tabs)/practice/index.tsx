import { Button, Form, Host, Picker, Section, Text, Toggle } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, pickerStyle, tag, tint } from "@expo/ui/swift-ui/modifiers";
import { router } from "expo-router";
import { useMemo, useState } from "react";

import { SignInPrompt } from "@/components/sign-in-prompt";
import { allStudyWords, studyWordsFor } from "@/lexiro/library";
import { availableCount, type WordTask } from "@/lexiro/questions";
import { useApp } from "@/lib/store";
import { BRAND_LIGHT } from "@/lib/theme";

const ALL = "__all__";
const AMOUNTS = [10, 20, 30, 50];

export default function PracticeSetupScreen() {
  const user = useApp((state) => state.user);
  const library = useApp((state) => state.library);
  const [setId, setSetId] = useState(ALL);
  const [meaning, setMeaning] = useState(true);
  const [reverse, setReverse] = useState(false);
  const [amount, setAmount] = useState(20);

  const sets = useMemo(
    () => [...library.sets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [library.sets],
  );
  const tasks: WordTask[] = [
    ...(meaning ? (["meaning"] as const) : []),
    ...(reverse ? (["reverse"] as const) : []),
  ];
  const available = useMemo(
    () =>
      availableCount(
        studyWordsFor(library, setId === ALL ? "" : setId),
        allStudyWords(library),
        tasks,
      ),
    // tasks is rebuilt every render; its contents are the two toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library, setId, meaning, reverse],
  );

  if (!user) return <SignInPrompt />;

  const start = () =>
    router.push({
      pathname: "/session",
      params: {
        setId: setId === ALL ? "" : setId,
        tasks: tasks.join(","),
        amount: String(amount),
      },
    });

  return (
    <Host style={{ flex: 1 }}>
      <Form>
        <Section title="範圍">
          <Picker
            label="單字集"
            selection={setId}
            onSelectionChange={setSetId}
            modifiers={[pickerStyle("menu")]}
          >
            <Text modifiers={[tag(ALL)]}>全部單字</Text>
            {sets.map((set) => (
              <Text key={set.id} modifiers={[tag(set.id)]}>
                {set.setName}
              </Text>
            ))}
          </Picker>
        </Section>
        <Section title="題型">
          <Toggle label="英選中" isOn={meaning} onIsOnChange={setMeaning} />
          <Toggle label="中選英" isOn={reverse} onIsOnChange={setReverse} />
        </Section>
        <Section title={`題數（可出 ${available} 題）`}>
          <Picker
            label="題數"
            selection={amount}
            onSelectionChange={setAmount}
            modifiers={[pickerStyle("segmented")]}
          >
            {AMOUNTS.map((value) => (
              <Text key={value} modifiers={[tag(value)]}>
                {String(value)}
              </Text>
            ))}
          </Picker>
        </Section>
        <Section>
          <Button
            label="開始練習"
            systemImage="play.fill"
            onPress={start}
            modifiers={[
              buttonStyle("glassProminent"),
              controlSize("large"),
              tint(BRAND_LIGHT),
            ]}
          />
        </Section>
      </Form>
    </Host>
  );
}
