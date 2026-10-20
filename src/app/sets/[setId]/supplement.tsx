import { useLocalSearchParams } from "expo-router";

import { SetSenseSupplement } from "@/components/library/set-sense-supplement";

export default function SupplementScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  return <SetSenseSupplement setId={setId} />;
}
