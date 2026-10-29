import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
} from "react-native";

import { ActionRow, AdminGate } from "@/components/admin/admin-gate";
import { Screen } from "@/components/ui/layout";
import { InputRow, ListGroup, ListRow, PickerRow } from "@/components/ui/list";
import {
  ADMIN_ACCOUNT_VIEWS,
  adminApi,
  alertText,
  formatBytes,
  formatCount,
  formatTime,
  percent,
  quotaLabel,
  VIEW_LABELS,
  type AdminAccount,
  type AdminAccountView,
  type AdminAction,
} from "@/core/lib/admin-client";
import { t } from "@/core/lib/i18n";
import { useAdminStore } from "@/core/stores/admin-store";
import { colors, type } from "@/lib/theme";

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : t("agent.requestFailed");

export default function AdminScreen() {
  return (
    <AdminGate>
      <AdminOverview />
    </AdminGate>
  );
}

function AdminOverview() {
  const status = useAdminStore((store) => store.status);
  const setStatus = useAdminStore((store) => store.setStatus);
  const [view, setView] = useState<AdminAccountView>("recent");
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const paused = status?.agentPaused ?? null;

  const loadAccounts = useCallback(
    (signal?: AbortSignal) =>
      adminApi.accounts({ view, query }, signal).then(
        (found) => {
          if (!signal?.aborted) setAccounts(found.accounts);
        },
        (reason) => {
          if (!signal?.aborted) setError(message(reason));
        },
      ),
    [view, query],
  );
  const loadActions = useCallback(
    () =>
      adminApi.actions().then(
        (found) => setActions(found.actions),
        () => {},
      ),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Typing waits a moment so each keystroke is not a request.
    const timer = setTimeout(
      () => void loadAccounts(controller.signal),
      query ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadAccounts, query]);
  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  const check = () => {
    setBusy(true);
    setError("");
    void adminApi
      .checkUsage()
      .then(setStatus, (reason) => setError(message(reason)))
      .finally(() => setBusy(false));
  };
  const togglePause = () =>
    Alert.alert(
      paused ? t("admin.resumeTitle") : t("admin.pauseTitle"),
      paused ? t("admin.resumeDescription") : t("admin.pauseDescription"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: paused ? t("admin.resumeAgent") : t("admin.pauseAgent"),
          style: paused ? "default" : "destructive",
          onPress: () => {
            setBusy(true);
            void adminApi
              .setAgentPaused(!paused)
              .then((next) => {
                setStatus(next);
                return loadActions();
              })
              .catch((reason) => setError(message(reason)))
              .finally(() => setBusy(false));
          },
        },
      ],
    );

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            const uid = useAdminStore.getState().uid;
            void Promise.all([
              useAdminStore.getState().refresh(uid, { force: true }),
              loadAccounts(),
              loadActions(),
            ]).finally(() => setRefreshing(false));
          }}
        />
      }
    >
      {status?.alerts.length ? (
        <ListGroup title={t("admin.service")}>
          {status.alerts.map((alert) => (
            <ListRow
              key={`${alert.code}:${"quota" in alert ? alert.quota : ""}`}
              icon="exclamationmark.triangle.fill"
              destructive
              title={alertText(alert)}
            />
          ))}
        </ListGroup>
      ) : null}

      <ListGroup
        title={
          status?.usage
            ? t("admin.usageToday", { day: status.usage.day })
            : t("admin.service")
        }
        aside={
          <Pressable onPress={busy ? undefined : check} hitSlop={8}>
            <Text style={styles.link}>
              {busy ? t("admin.checking") : t("admin.checkNow")}
            </Text>
          </Pressable>
        }
        footer={
          status?.usage
            ? t("admin.checkedAt", { time: formatTime(status.usage.checkedAt) })
            : t("admin.usageNever")
        }
      >
        {status?.usage?.quotas.map((quota) => (
          <ListRow
            key={quota.name}
            title={quotaLabel(quota.name)}
            subtitle={`${formatCount(quota.used)} / ${formatCount(quota.limit)}`}
            detail={percent(quota.used / quota.limit)}
            destructive={quota.used / quota.limit >= 0.7}
          />
        ))}
        <ListRow
          title={t("admin.agent")}
          icon="cpu"
          detail={
            paused
              ? t(
                  paused.manual
                    ? "admin.agentPausedManual"
                    : "admin.agentPausedAuto",
                )
              : t("admin.agentRunning")
          }
        />
        <ListRow
          title={paused ? t("admin.resumeAgent") : t("admin.pauseAgent")}
          icon={paused ? "play.circle" : "pause.circle"}
          destructive={!paused}
          onPress={busy ? undefined : togglePause}
        />
      </ListGroup>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ListGroup title={t("admin.accounts")}>
        <InputRow
          label={t("admin.search")}
          value={query}
          onChangeText={setQuery}
          placeholder="ann@…"
        />
        {query ? null : (
          <PickerRow
            title={t("admin.view")}
            value={view}
            options={ADMIN_ACCOUNT_VIEWS.map((value) => ({
              value,
              label: t(VIEW_LABELS[value]),
            }))}
            onChange={(next) => {
              setAccounts(null);
              setView(next);
            }}
          />
        )}
      </ListGroup>

      {accounts === null ? (
        <ActivityIndicator />
      ) : (
        <ListGroup iconInset={false}>
          {accounts.length ? (
            accounts.map((account) => (
              <ListRow
                key={account.uid}
                title={account.email ?? account.uid}
                subtitle={t("admin.rowStats", {
                  writes: formatCount(account.writesToday),
                  reads: formatCount(account.readsToday),
                  bytes: formatBytes(account.storedBytes),
                })}
                detail={[
                  account.disabled ? t("admin.badgeDisabled") : "",
                  account.unlimited ? t("admin.badgeUnlimited") : "",
                ]
                  .filter(Boolean)
                  .join("・")}
                chevron
                onPress={() =>
                  router.push({
                    pathname: "/account/admin/[uid]",
                    params: { uid: account.uid },
                  })
                }
              />
            ))
          ) : (
            <ListRow title={t("admin.noAccounts")} />
          )}
        </ListGroup>
      )}

      <ListGroup title={t("admin.history")} iconInset={false}>
        {actions.length ? (
          actions.map((action) => (
            <ActionRow key={action.id} action={action} showTarget />
          ))
        ) : (
          <ListRow title={t("admin.noHistory")} />
        )}
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { ...type.hint, color: colors.brand, fontWeight: "700" },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
});
