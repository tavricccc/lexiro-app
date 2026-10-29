import { useEffect, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";

import { SignInPrompt } from "@/components/sign-in-prompt";
import { EmptyState, Screen } from "@/components/ui/layout";
import { ListRow } from "@/components/ui/list";
import {
  actionLabel,
  formatTime,
  type AdminAction,
} from "@/core/lib/admin-client";
import { t } from "@/core/lib/i18n";
import { useAdminStore } from "@/core/stores/admin-store";
import { useCloudStore } from "@/core/stores/cloud-store";

/** Holds an admin screen until the Worker has said this account is an admin. */
export function AdminGate({ children }: { children: ReactNode }) {
  const uid = useCloudStore((store) => store.user?.uid ?? null);
  const admin = useAdminStore((store) => store.admin);
  const owner = useAdminStore((store) => store.uid);
  const checkedAt = useAdminStore((store) => store.checkedAt);
  const refresh = useAdminStore((store) => store.refresh);
  useEffect(() => {
    void refresh(uid);
  }, [refresh, uid]);
  if (!uid) return <SignInPrompt body={t("agent.signInRequired")} />;
  if (admin) return <>{children}</>;
  return (
    <Screen>
      {owner === uid && checkedAt ? (
        <EmptyState title={t("admin.title")} body={t("admin.notAdmin")} />
      ) : (
        <ActivityIndicator />
      )}
    </Screen>
  );
}

/** One line of the audit trail. */
export function ActionRow({
  action,
  showTarget,
}: {
  action: AdminAction;
  showTarget: boolean;
}) {
  return (
    <ListRow
      title={
        showTarget && action.targetUid
          ? `${actionLabel(action.action)}・${action.targetUid}`
          : actionLabel(action.action)
      }
      subtitle={[action.adminEmail, action.detail].filter(Boolean).join("・")}
      detail={formatTime(action.at)}
    />
  );
}

