import { Redirect } from "expo-router";

// The tabs live under /today, /library, /rooms and /account; "/" opens 今天.
export default function Index() {
  return <Redirect href="/today" />;
}
