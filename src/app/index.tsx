import { Redirect } from "expo-router";

// The tabs live under /library, /practice and /account; "/" opens the library.
export default function Index() {
  return <Redirect href="/library" />;
}
