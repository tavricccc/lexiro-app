import { router } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import Animated from "react-native-reanimated";

import { ListGroup, ListRow } from "@/components/ui/list";
import { glide, swapIn, swapOut } from "@/components/ui/motion";
import { alertText } from "@/core/lib/admin-client";
import { t } from "@/core/lib/i18n";
import { useAdminStore } from "@/core/stores/admin-store";
import { useCloudStore } from "@/core/stores/cloud-store";

/**
 * Asks the Worker whether the signed-in account is an admin, again whenever
 * the app comes back to the foreground. A non-admin is asked once per account.
 */
export function useAdminWatch() {
  const uid = useCloudStore((store) => store.user?.uid ?? null);
  const refresh = useAdminStore((store) => store.refresh);
  useEffect(() => {
    void refresh(uid);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh(uid);
    });
    return () => subscription.remove();
  }, [refresh, uid]);
}

/**
 * The only place a quota alert reaches an admin, since nothing is mailed: the
 * first alert, on 今天 and 我的, until it clears.
 */
export function AdminBanner() {
  const admin = useAdminStore((store) => store.admin);
  const alerts = useAdminStore((store) => store.status?.alerts);

  if (!admin || !alerts?.length) return null;
  return (
    <Animated.View entering={swapIn} exiting={swapOut} layout={glide}>
      <ListGroup
        footer={
          alerts.length > 1
            ? t("admin.bannerMore", { count: alerts.length - 1 })
            : undefined
        }
      >
        <ListRow
          icon="exclamationmark.triangle.fill"
          destructive
          title={alertText(alerts[0])}
          chevron
          onPress={() => router.push("/account/admin")}
        />
      </ListGroup>
    </Animated.View>
  );
}
