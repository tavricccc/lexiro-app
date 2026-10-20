import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import Animated from "react-native-reanimated";

import { SyncRefreshControl } from "@/components/sync-refresh-control";
import { EmptyState, Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { glide, rise } from "@/components/ui/motion";
import { senseCount, setsInFolder, sortedFolders } from "@/lexiro/library";
import { useCloudStore } from "@/core/stores/cloud-store";
import { useLibraryStore } from "@/core/stores/library-store";

const UNCATEGORIZED = "uncategorized";

export default function LibraryScreen() {
  const library = useLibraryStore((store) => store.state);
  const status = useCloudStore((state) => state.status);
  const [query, setQuery] = useState("");

  // Folders in their saved order, then sets the folders do not claim.
  const sections = useMemo(() => {
    const folders = sortedFolders(library).map((folder) => ({
      id: folder.id,
      name: folder.name,
      sets: setsInFolder(library, folder.id),
    }));
    const known = new Set(folders.map((folder) => folder.id));
    const loose = library.sets
      .filter((set) => !known.has(set.folderId) || set.folderId === UNCATEGORIZED)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const needle = query.trim().toLocaleLowerCase();
    return [
      ...folders,
      ...(loose.length ? [{ id: UNCATEGORIZED, name: "未分類", sets: loose }] : []),
    ]
      .map((section) => ({
        ...section,
        sets: needle
          ? section.sets.filter((set) => set.setName.toLocaleLowerCase().includes(needle))
          : section.sets,
      }))
      .filter((section) => section.sets.length);
  }, [library, query]);

  return (
    <>
      <Stack.SearchBar
        placeholder="搜尋單字集"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <Screen
        refreshControl={<SyncRefreshControl />}
      >
        {sections.map((section, index) => (
          <Animated.View key={section.id} entering={rise(index)} layout={glide}>
            <ListGroup title={section.name}>
              {section.sets.map((set) => (
                <ListRow
                  key={set.id}
                  icon="rectangle.stack"
                  title={set.setName}
                  detail={String(senseCount(library, set.id))}
                  chevron
                  onPress={() =>
                    router.push({ pathname: "/library/[setId]", params: { setId: set.id } })
                  }
                />
              ))}
            </ListGroup>
          </Animated.View>
        ))}
        {!sections.length && status !== "syncing" ? (
          query ? (
            <EmptyState
              illustrated={false}
              title="找不到單字集"
              body={`沒有名稱含「${query}」的單字集。`}
            />
          ) : status === "error" ? (
            <EmptyState illustrated={false} title="同步失敗" body="下拉重新同步。" />
          ) : (
            <EmptyState title="還沒有單字集" body="在網頁版建立後會同步到這裡。" />
          )
        ) : null}
      </Screen>
    </>
  );
}
