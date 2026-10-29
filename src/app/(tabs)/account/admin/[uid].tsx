import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text } from "react-native";

import { ActionRow, AdminGate } from "@/components/admin/admin-gate";
import { EmptyState, Screen } from "@/components/ui/layout";
import { InputRow, ListGroup, ListRow } from "@/components/ui/list";
import {
  adminApi,
  formatBytes,
  formatCount,
  formatTime,
  type AdminAccountAction,
  type AdminAccountDetail,
} from "@/core/lib/admin-client";
import { t, type TranslationKey } from "@/core/lib/i18n";
import { useAdminStore } from "@/core/stores/admin-store";
import { colors, type } from "@/lib/theme";

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : t("agent.requestFailed");

/** What each change asks before it runs. */
const CONFIRM: Record<
  AdminAccountAction["action"],
  { title: TranslationKey; description: TranslationKey; label: TranslationKey }
> = {
  disable: {
    title: "admin.disableTitle",
    description: "admin.disableDescription",
    label: "admin.disable",
  },
  enable: {
    title: "admin.enableTitle",
    description: "admin.enableDescription",
    label: "admin.enable",
  },
  exempt: {
    title: "admin.exemptTitle",
    description: "admin.exemptDescription",
    label: "admin.exempt",
  },
  unexempt: {
    title: "admin.unexemptTitle",
    description: "admin.unexemptDescription",
    label: "admin.unexempt",
  },
  revoke_access: {
    title: "admin.revokeTitle",
    description: "admin.revokeDescription",
    label: "admin.revokeAccess",
  },
};
const SAFE = new Set<AdminAccountAction["action"]>(["enable", "unexempt"]);

export default function AdminAccountScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  return (
    <AdminGate>
      <AccountDetail uid={uid} />
    </AdminGate>
  );
}

function AccountDetail({ uid }: { uid: string }) {
  const self = useAdminStore((store) => store.uid);
  const [account, setAccount] = useState<AdminAccountDetail | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminApi.account(uid, signal).then(
        (found) => {
          if (!signal?.aborted) setAccount(found);
        },
        (reason) => {
          if (!signal?.aborted) setError(message(reason));
        },
      ),
    [uid],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const confirm = (action: AdminAccountAction["action"]) => {
    const copy = CONFIRM[action];
    Alert.alert(t(copy.title), t(copy.description), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t(copy.label),
        style: SAFE.has(action) ? "default" : "destructive",
        onPress: () => {
          setBusy(true);
          setError("");
          const input: AdminAccountAction =
            action === "disable"
              ? { action, reason: reason.trim() }
              : { action };
          void adminApi
            .act(uid, input)
            .then((next) => {
              setAccount(next);
              setReason("");
            })
            .catch((reason) => setError(message(reason)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  if (!account)
    return (
      <Screen>
        {error ? (
          <EmptyState title={t("common.loadFailed")} body={error} />
        ) : (
          <ActivityIndicator />
        )}
      </Screen>
    );

  const own = account.uid === self;
  return (
    <Screen>
      <Stack.Screen options={{ title: account.email ?? t("admin.account") }} />
      <ListGroup iconInset={false}>
        <ListRow title={t("admin.uid")} subtitle={account.uid} />
        <ListRow
          title={t("admin.email")}
          detail={account.email ?? t("admin.noEmail")}
        />
        <ListRow title={t("admin.lastSeen")} detail={account.seenDay ?? "—"} />
        <ListRow
          title={
            account.disabled
              ? t("admin.statusDisabled", { reason: account.disabled.reason })
              : t("admin.statusActive")
          }
          subtitle={
            account.disabled ? formatTime(account.disabled.at) : undefined
          }
          destructive={Boolean(account.disabled)}
        />
      </ListGroup>

      <ListGroup iconInset={false}>
        <ListRow
          title={t("admin.writesToday")}
          detail={formatCount(account.writesToday)}
        />
        <ListRow
          title={t("admin.readsToday")}
          detail={formatCount(account.readsToday)}
        />
        <ListRow
          title={t("admin.storage")}
          detail={formatBytes(account.storedBytes)}
        />
        <ListRow
          title={t("admin.library")}
          detail={t("admin.librarySummary", {
            sets: formatCount(account.sets),
            words: formatCount(account.words),
            questions: formatCount(account.questions),
          })}
        />
        <ListRow
          title={t("admin.shares")}
          detail={formatCount(account.shares)}
        />
        <ListRow
          title={t("admin.activeLinks")}
          detail={formatCount(account.activeLinks)}
        />
      </ListGroup>

      <ListGroup title={t("admin.connections")} iconInset={false}>
        {account.connections.length ? (
          account.connections.map((connection) => (
            <ListRow
              key={connection.id}
              title={connection.clientName}
              detail={formatTime(connection.createdAt * 1000)}
            />
          ))
        ) : (
          <ListRow title={t("admin.noConnections")} />
        )}
      </ListGroup>

      {account.disabled ? (
        <ListGroup>
          <ListRow
            title={t("admin.enable")}
            icon="checkmark.circle"
            onPress={busy ? undefined : () => confirm("enable")}
          />
        </ListGroup>
      ) : own ? null : (
        <ListGroup footer={t("admin.disableDescription")}>
          <InputRow
            label={t("admin.reason")}
            value={reason}
            onChangeText={(next) => setReason(next.slice(0, 200))}
            placeholder={t("admin.reasonPlaceholder")}
          />
          <ListRow
            title={t("admin.disable")}
            icon="nosign"
            destructive
            onPress={
              busy || !reason.trim() ? undefined : () => confirm("disable")
            }
          />
        </ListGroup>
      )}

      <ListGroup>
        <ListRow
          title={account.unlimited ? t("admin.unexempt") : t("admin.exempt")}
          icon={account.unlimited ? "gauge.with.dots.needle.33percent" : "infinity"}
          onPress={
            busy
              ? undefined
              : () => confirm(account.unlimited ? "unexempt" : "exempt")
          }
        />
        <ListRow
          title={t("admin.revokeAccess")}
          icon="xmark.circle"
          destructive
          onPress={busy ? undefined : () => confirm("revoke_access")}
        />
      </ListGroup>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ListGroup title={t("admin.history")} iconInset={false}>
        {account.actions.length ? (
          account.actions.map((action) => (
            <ActionRow key={action.id} action={action} showTarget={false} />
          ))
        ) : (
          <ListRow title={t("admin.noHistory")} />
        )}
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
});
