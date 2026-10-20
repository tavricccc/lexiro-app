import { useNavigation, useRoute } from "expo-router";
import { useEffect, useState } from "react";

/** In case a transition never reports its end, the page still fills in. */
const FALLBACK_MS = 500;

type TransitionEvents = {
  addListener: (event: "transitionEnd", listener: () => void) => () => void;
};

/**
 * False until the push or sheet that brought this page in has finished, so
 * the page answers the tap with its transition first and fills in after.
 * A tab's first page has no transition and is ready at once.
 */
export function useTransitionDone(): boolean {
  const navigation = useNavigation();
  const route = useRoute();
  const parent = navigation.getParent();
  const first = navigation.getState()?.routes[0]?.key === route.key;
  const immediate = first && (!parent || parent.getState()?.type === "tab");
  const [done, setDone] = useState(immediate);

  useEffect(() => {
    if (done) return;
    const finish = () => setDone(true);
    // A sheet's first page arrives with the sheet, which is its parent's transition.
    const source = (first && parent ? parent : navigation) as unknown as TransitionEvents;
    const unsubscribe = source.addListener("transitionEnd", finish);
    const timer = setTimeout(finish, FALLBACK_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [done, first, navigation, parent]);

  return done;
}
