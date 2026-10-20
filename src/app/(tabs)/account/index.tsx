import { Button, Form, Host, LabeledContent, Section, Text } from "@expo/ui/swift-ui";

import { useSignIn } from "@/components/sign-in-prompt";
import { useApp } from "@/lib/store";

function syncLabel(status: string, syncedAt: number | null): string {
  if (status === "syncing") return "同步中…";
  if (status === "error") return "同步失敗";
  if (!syncedAt) return "尚未同步";
  return new Date(syncedAt).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountScreen() {
  const user = useApp((state) => state.user);
  const status = useApp((state) => state.status);
  const syncedAt = useApp((state) => state.syncedAt);
  const library = useApp((state) => state.library);
  const sync = useApp((state) => state.sync);
  const signOut = useApp((state) => state.signOut);
  const { busy, signIn } = useSignIn();

  return (
    <Host style={{ flex: 1 }}>
      <Form>
        {user ? (
          <>
            <Section title="帳號">
              <LabeledContent label="Google">
                <Text>{user.email ?? ""}</Text>
              </LabeledContent>
            </Section>
            <Section title="雲端同步">
              <LabeledContent label="上次同步">
                <Text>{syncLabel(status, syncedAt)}</Text>
              </LabeledContent>
              <LabeledContent label="單字集">
                <Text>{String(library.sets.length)}</Text>
              </LabeledContent>
              <Button label="立即同步" systemImage="arrow.triangle.2.circlepath" onPress={() => void sync()} />
            </Section>
            <Section>
              <Button label="登出" role="destructive" onPress={() => void signOut()} />
            </Section>
          </>
        ) : (
          <Section title="帳號">
            <Button
              label={busy ? "登入中…" : "用 Google 登入"}
              systemImage="person.crop.circle"
              onPress={() => void signIn()}
            />
          </Section>
        )}
      </Form>
    </Host>
  );
}
