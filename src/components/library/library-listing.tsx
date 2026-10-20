import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Alert } from "react-native";
import Animated from "react-native-reanimated";

import { folderParentOptions, ROOT_FOLDER } from "@/components/library/folder-options";
import { parseShareId } from "@/components/library/share-id";
import { SyncRefreshControl } from "@/components/sync-refresh-control";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen } from "@/components/ui/layout";
import { ListGroup, ListRow } from "@/components/ui/list";
import { showActionSheet } from "@/components/ui/menu";
import { glide, swapIn } from "@/components/ui/motion";
import {
  ALL_FOLDER_ID,
  collectFolderIds,
  countDirectItems,
  UNCATEGORIZED_FOLDER_ID,
} from "@/core/lib/folders";
import { t } from "@/core/lib/i18n";
import { buildLibrarySetMetrics } from "@/core/lib/library-metrics";
import { setMatchesQuery } from "@/core/lib/library-search";
import { copySharedSet } from "@/core/lib/set-share";
import { createUniqueSetName } from "@/core/lib/set-name";
import { useLibraryStore } from "@/core/stores/library-store";
import { colors } from "@/lib/theme";
import { pickSetShareFile } from "@/platform/set-share-files";
import { toast } from "@/platform/toast";

const NO_METRICS = { questionCount: 0, senseCount: 0 };

function askFolderName(title: string, initial: string, submit: (name: string) => Promise<unknown>) {
  Alert.prompt(
    title,
    undefined,
    [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.confirm"),
        isPreferred: true,
        onPress: (value?: string) => {
          if (!value?.trim()) return;
          submit(value).catch(() => Alert.alert(t("library.folderNameConflict")));
        },
      },
    ],
    "plain-text",
    initial,
  );
}

/**
 * One level of the library, as on the web: the folders here, then the sets
 * filed here. Searching looks through this folder's whole subtree.
 */
export function LibraryListing({ folderId }: { folderId?: string }) {
  const state = useLibraryStore((store) => store.state);
  const status = useLibraryStore((store) => store.status);
  const loadError = useLibraryStore((store) => store.error);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);

  const currentFolder = folderId
    ? state.folders.find((folder) => folder.id === folderId && folder.id !== UNCATEGORIZED_FOLDER_ID)
    : undefined;
  const metrics = useMemo(() => buildLibrarySetMetrics(state), [state]);
  const needle = query.trim().toLocaleLowerCase();

  const childFolders = useMemo(
    () =>
      state.folders
        .filter(
          (folder) => folder.id !== UNCATEGORIZED_FOLDER_ID && folder.parentId === currentFolder?.id,
        )
        .toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [currentFolder, state.folders],
  );
  const sets = useMemo(() => {
    const scope = currentFolder ? collectFolderIds(state.folders, currentFolder.id) : null;
    return state.sets.filter((entry) => {
      const inLocation = needle
        ? !scope || scope.has(entry.folderId)
        : currentFolder
          ? entry.folderId === currentFolder.id
          : !entry.folderId ||
            entry.folderId === ALL_FOLDER_ID ||
            entry.folderId === UNCATEGORIZED_FOLDER_ID;
      if (!inLocation) return false;
      if (!needle) return true;
      return entry.setName.toLocaleLowerCase().includes(needle) || setMatchesQuery(state, entry.id, needle);
    });
  }, [currentFolder, needle, state]);

  const store = useLibraryStore.getState;
  const createSet = () =>
    router.push({ pathname: "/sets/new", params: currentFolder ? { folderId: currentFolder.id } : {} });
  const createFolder = () =>
    askFolderName(t("library.newFolder"), "", (name) => store().createFolder(name, currentFolder?.id));
  const importSet = async () => {
    setImporting(true);
    try {
      const payload = await pickSetShareFile();
      if (!payload) return;
      const names = new Set(store().state.sets.map((entry) => entry.setName));
      for (const shared of payload.sets) {
        const setName = createUniqueSetName(shared.setName, names);
        names.add(setName);
        await copySharedSet(
          shared,
          { folderId: currentFolder?.id, setName },
          { saveSet: store().saveSet, saveQuestion: store().saveQuestion },
        );
      }
      toast.success(t("library.importDone", { count: payload.sets.length }));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      toast.error(t("library.importFailed", { message }));
    } finally {
      setImporting(false);
    }
  };
  const openShareLink = () =>
    Alert.prompt(
      "開啟分享連結",
      "貼上別人傳給你的 Lexiro 分享連結。",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          isPreferred: true,
          onPress: (value?: string) => {
            const shareId = parseShareId(value ?? "");
            if (!shareId) {
              Alert.alert(t("share.unavailable"));
              return;
            }
            router.push({ pathname: "/sets/shared/[shareId]", params: { shareId } });
          },
        },
      ],
      "plain-text",
      "",
      "url",
    );
  const folderSets = currentFolder
    ? state.sets.filter((entry) => collectFolderIds(state.folders, currentFolder.id).has(entry.folderId))
        .length
    : 0;
  const deleteFolder = () => {
    if (!currentFolder) return;
    Alert.alert(
      t("library.deleteFolder"),
      t("library.deleteFolderConfirm", { name: currentFolder.name, sets: folderSets }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("library.deleteFolder"),
          style: "destructive",
          onPress: () => {
            router.back();
            void store().deleteFolder(currentFolder.id);
          },
        },
      ],
    );
  };
  const moveFolder = () => {
    if (!currentFolder) return;
    const here = currentFolder.parentId ?? ROOT_FOLDER;
    showActionSheet({
      title: t("library.moveFolder"),
      actions: folderParentOptions(state.folders, currentFolder.id).map((option) => ({
        label: option.label,
        disabled: option.value === here,
        onSelect: () =>
          void store()
            .moveFolder(currentFolder.id, option.value === ROOT_FOLDER ? undefined : option.value)
            .catch(() => Alert.alert(t("library.folderNameConflict"))),
      })),
    });
  };

  const listEmpty = !sets.length && (Boolean(needle) || !childFolders.length);
  const missing = Boolean(folderId) && !currentFolder && status === "ready";

  return (
    <>
      <Stack.Screen options={{ title: currentFolder?.name ?? (missing ? "" : t("library.title")) }} />
      <Stack.SearchBar
        placeholder={t("library.searchHere")}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      {missing ? null : (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu icon="plus" accessibilityLabel={t("library.newSet")}>
            <Stack.Toolbar.MenuAction icon="rectangle.stack.badge.plus" onPress={createSet}>
              {t("setEditor.createTitle")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="folder.badge.plus" onPress={createFolder}>
              {t("library.newFolder")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="square.and.arrow.down"
              disabled={importing}
              onPress={() => void importSet()}
            >
              {t(importing ? "library.importing" : "library.importSet")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="link" onPress={openShareLink}>
              開啟分享連結
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
          {currentFolder ? (
            <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={t("common.more")}>
              <Stack.Toolbar.MenuAction
                icon="pencil"
                onPress={() =>
                  askFolderName(t("library.renameFolder"), currentFolder.name, (name) =>
                    store().renameFolder(currentFolder.id, name),
                  )
                }
              >
                {t("library.renameFolder")}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="folder" onPress={moveFolder}>
                {t("library.moveFolder")}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="trash" destructive onPress={deleteFolder}>
                {t("library.deleteFolder")}
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          ) : null}
        </Stack.Toolbar>
      )}
      <Screen refreshControl={<SyncRefreshControl />}>
        {status === "error" ? (
          <EmptyState
            illustrated={false}
            title={t("common.loadFailed")}
            body={t("library.migrationError", { message: loadError ?? "" })}
          />
        ) : missing ? (
          <EmptyState illustrated={false} title={t("library.emptyFolderTitle")} body={t("setDetail.missingDescription")} />
        ) : status !== "ready" ? null : !listEmpty ? (
          <Animated.View entering={swapIn} layout={glide}>
            <ListGroup>
              {[
                ...(needle ? [] : childFolders).map((folder) => (
                  <ListRow
                    key={folder.id}
                    icon="folder.fill"
                    iconTint={colors.success}
                    title={folder.name}
                    subtitle={t("library.itemCount", {
                      count: countDirectItems(state.folders, state.sets, folder.id),
                    })}
                    chevron
                    onPress={() =>
                      router.push({ pathname: "/library/folder/[folderId]", params: { folderId: folder.id } })
                    }
                  />
                )),
                ...sets.map((entry) => {
                  const { senseCount, questionCount } = metrics.get(entry.id) ?? NO_METRICS;
                  return (
                    <ListRow
                      key={entry.id}
                      icon="rectangle.stack"
                      title={entry.setName}
                      subtitle={[
                        t("library.senseCount", { count: senseCount }),
                        ...(questionCount ? [t("library.questionCount", { count: questionCount })] : []),
                      ].join(" · ")}
                      chevron
                      onPress={() =>
                        router.push({ pathname: "/library/[setId]", params: { setId: entry.id } })
                      }
                    />
                  );
                }),
              ]}
            </ListGroup>
          </Animated.View>
        ) : needle ? (
          <EmptyState illustrated={false} title={t("library.noResults")} body={t("library.searchHint")} />
        ) : (
          <EmptyState
            title={t(currentFolder ? "library.emptyFolderTitle" : "library.emptyTitle")}
            body={t(currentFolder ? "library.emptyFolderDescription" : "library.emptyDescription")}
            action={<Button label={t("setEditor.createTitle")} icon="plus" onPress={createSet} />}
          />
        )}
      </Screen>
    </>
  );
}
