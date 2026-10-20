import { SignInPrompt } from "@/components/sign-in-prompt";
import { EmptyState, Screen } from "@/components/ui/layout";
import { useCloudStore } from "@/core/stores/cloud-store";

// Live rooms come in a later batch; the tab already holds the web app's place for them.
export default function RoomsScreen() {
  const user = useCloudStore((state) => state.user);
  if (!user)
    return <SignInPrompt body="登入後就能輸入房號加入，或用自己的題庫開房和朋友即時對戰。" />;
  return (
    <Screen>
      <EmptyState
        illustrated={false}
        title="對戰還在路上"
        body="App 版的即時對戰正在製作中，目前請先在網頁版開房或加入。"
      />
    </Screen>
  );
}
