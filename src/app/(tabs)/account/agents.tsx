import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
} from "react-native";

import { SignInPrompt } from "@/components/sign-in-prompt";
import { Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import {
  agentJson,
  agentWorkerUrl,
  type AgentConnection,
} from "@/core/lib/agent-client";
import { t } from "@/core/lib/i18n";
import { useCloudStore } from "@/core/stores/cloud-store";
import { colors, type } from "@/lib/theme";
import { toast } from "@/platform/toast";

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : t("agent.requestFailed");

/** The web's Agent 連線 page: the MCP address, and the apps allowed to use it. */
export default function AgentConnectionsScreen() {
  const uid = useCloudStore((store) => store.user?.uid);
  const endpoint = agentWorkerUrl() ? `${agentWorkerUrl()}/mcp` : "";
  const [connections, setConnections] = useState<AgentConnection[] | null>(
    null,
  );
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      agentJson<{ connections: AgentConnection[] }>("/connections", {
        signal,
      }).then(
        (found) => {
          if (signal?.aborted) return;
          setError("");
          setConnections(found.connections);
        },
        (reason) => {
          if (!signal?.aborted) setError(message(reason));
        },
      ),
    [],
  );

  useEffect(() => {
    if (!uid) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, uid]);

  const copy = () =>
    void Clipboard.setStringAsync(endpoint).then(
      () => {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        toast.success(t("agent.copied"));
      },
      () => toast.error(t("agent.copyFailed")),
    );

  const disconnect = (connection: AgentConnection) =>
    Alert.alert(
      `${t("agent.disconnect")}「${connection.clientName}」？`,
      "它之後就不能再讀寫你的資料，要用的話得重新授權。",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("agent.disconnect"),
          style: "destructive",
          onPress: () => {
            setBusy(connection.id);
            void agentJson(
              `/connections/${encodeURIComponent(connection.id)}`,
              { method: "DELETE" },
            )
              .then(() => load())
              .catch((reason) => setError(message(reason)))
              .finally(() => setBusy(null));
          },
        },
      ],
    );

  if (!uid) return <SignInPrompt body={t("agent.signInRequired")} />;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <ListGroup
        title={t("agent.endpoint")}
        footer={endpoint ? t("agent.endpointHint") : t("agent.unavailable")}
      >
        {endpoint ? (
          <ListRow
            title={endpoint}
            icon="doc.on.doc"
            accessory={<Text style={styles.copy}>{t("agent.copy")}</Text>}
            onPress={copy}
          />
        ) : null}
      </ListGroup>

      {connections === null && !error ? (
        <ActivityIndicator />
      ) : connections ? (
        <ListGroup title={t("agent.oauthConnections")}>
          {connections.length ? (
            connections.map((connection) => (
              <ListRow
                key={connection.id}
                title={connection.clientName}
                subtitle={connection.clientId}
                icon="app.connected.to.app.below.fill"
                accessory={
                  busy === connection.id ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.disconnect}>
                      {t("agent.disconnect")}
                    </Text>
                  )
                }
                onPress={busy ? undefined : () => disconnect(connection)}
              />
            ))
          ) : (
            <ListRow title={t("agent.noConnections")} icon="minus.circle" />
          )}
        </ListGroup>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { ...type.hint, color: colors.brand, fontWeight: "700" },
  disconnect: { ...type.hint, color: colors.destructive, fontWeight: "700" },
  error: { ...type.hint, color: colors.destructive, paddingHorizontal: 4 },
});
