import { router } from "expo-router";
import { useMemo } from "react";
import { PlatformColor, RefreshControl, ScrollView, StyleSheet, Text } from "react-native";

import { GroupedRow, GroupedSection } from "@/components/grouped";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { senseCount, setsInFolder, sortedFolders } from "@/lexiro/library";
import { useApp } from "@/lib/store";

const UNCATEGORIZED = "uncategorized";

export default function LibraryScreen() {
  const user = useApp((state) => state.user);
  const library = useApp((state) => state.library);
  const status = useApp((state) => state.status);
  const sync = useApp((state) => state.sync);

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
    return [
      ...folders.filter((folder) => folder.sets.length),
      ...(loose.length ? [{ id: UNCATEGORIZED, name: "未分類", sets: loose }] : []),
    ];
  }, [library]);

  if (!user) return <SignInPrompt />;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={status === "syncing"} onRefresh={() => void sync()} />
      }
    >
      {sections.map((section) => (
        <GroupedSection key={section.id} header={section.name}>
          {section.sets.map((set, index) => (
            <GroupedRow
              key={set.id}
              icon="rectangle.stack"
              title={set.setName}
              detail={String(senseCount(library, set.id))}
              chevron
              last={index === section.sets.length - 1}
              onPress={() =>
                router.push({ pathname: "/library/[setId]", params: { setId: set.id } })
              }
            />
          ))}
        </GroupedSection>
      ))}
      {!sections.length && status !== "syncing" ? (
        <Text style={styles.empty}>
          {status === "error" ? "同步失敗，下拉重試。" : "還沒有單字集。在網頁版建立後會同步到這裡。"}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  empty: {
    color: PlatformColor("secondaryLabel"),
    fontSize: 17,
    textAlign: "center",
    marginTop: 80,
    marginHorizontal: 32,
  },
});
