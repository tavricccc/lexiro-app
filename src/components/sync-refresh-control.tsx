import { useState } from "react";
import { RefreshControl } from "react-native";

import { useCloudStore } from "@/core/stores/cloud-store";

/**
 * Pull to sync. The spinner follows the pull only: the store also syncs on its
 * own in the background, and showing that here would open the refresh gap and
 * push the page down whenever a sync started.
 */
export function SyncRefreshControl() {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void useCloudStore
          .getState()
          .sync({ reconcileAccount: true })
          .finally(() => setRefreshing(false));
      }}
    />
  );
}
