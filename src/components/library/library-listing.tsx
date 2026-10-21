import { Link, router, Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SymbolView } from "expo-symbols";
import { Alert, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  folderParentOptions,
  ROOT_FOLDER,
  setFolderOptions,
} from "@/components/library/folder-options";
import { parseShareId } from "@/components/library/share-id";
import {
  SortableSets,
  type FolderRect,
} from "@/components/library/sortable-sets";
import { SyncRefreshControl } from "@/components/sync-refresh-control";
import { Button } from "@/components/ui/button";
import { EmptyState, Screen } from "@/components/ui/layout";
import { PressableScale } from "@/components/ui/pressable-scale";
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
import { sortSets, planSetReorder } from "@/core/lib/set-order";
import { copySharedSet } from "@/core/lib/set-share";
import { createUniqueSetName } from "@/core/lib/set-name";
import { useLibraryStore } from "@/core/stores/library-store";
import type { LibrarySet } from "@/core/types";
import { colors, latin, radius } from "@/lib/theme";
import { pickSetShareFile } from "@/platform/set-share-files";
import { toast } from "@/platform/toast";

const PILL = { duration: 160 };

function askFolderName(
  title: string,
  initial: string,
  submit: (name: string) => Promise<unknown>,
) {
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
          submit(value).catch(() =>
            Alert.alert(t("library.folderNameConflict")),
          );
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
    ? state.folders.find(
        (folder) =>
          folder.id === folderId && folder.id !== UNCATEGORIZED_FOLDER_ID,
      )
    : undefined;
  const metrics = useMemo(() => buildLibrarySetMetrics(state), [state]);
  const needle = query.trim().toLocaleLowerCase();

  const childFolders = useMemo(
    () =>
      state.folders
        .filter(
          (folder) =>
            folder.id !== UNCATEGORIZED_FOLDER_ID &&
            folder.parentId === currentFolder?.id,
        )
        .toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [currentFolder, state.folders],
  );
  const sets = useMemo(() => {
    const scope = currentFolder
      ? collectFolderIds(state.folders, currentFolder.id)
      : null;
    return sortSets(
      state.sets.filter((entry) => {
        const inLocation = needle
          ? !scope || scope.has(entry.folderId)
          : currentFolder
            ? entry.folderId === currentFolder.id
            : !entry.folderId ||
              entry.folderId === ALL_FOLDER_ID ||
              entry.folderId === UNCATEGORIZED_FOLDER_ID;
        if (!inLocation) return false;
        if (!needle) return true;
        return (
          entry.setName.toLocaleLowerCase().includes(needle) ||
          setMatchesQuery(state, entry.id, needle)
        );
      }),
    );
  }, [currentFolder, needle, state]);

  const store = useLibraryStore.getState;

  // Where a set may be dropped: the folder pills, in the listing's own space.
  const folderRects = useSharedValue<FolderRect[]>([]);
  const foldersOffset = useRef(0);
  const pillLayouts = useRef(
    new Map<string, { x: number; y: number; width: number; height: number }>(),
  );
  const publishFolderRects = useCallback(() => {
    folderRects.set(
      [...pillLayouts.current.entries()].map(([id, rect]) => ({
        id,
        x: rect.x,
        y: rect.y + foldersOffset.current,
        width: rect.width,
        height: rect.height,
      })),
    );
  }, [folderRects]);
  const measurePill = useCallback(
    (
      id: string,
      rect: { x: number; y: number; width: number; height: number },
    ) => {
      pillLayouts.current.set(id, rect);
      publishFolderRects();
    },
    [publishFolderRects],
  );
  // Pills from the folder we came from must not catch drops in this one.
  const folderKey = childFolders.map((folder) => folder.id).join("|");
  useEffect(() => {
    const live = new Set(folderKey ? folderKey.split("|") : []);
    for (const id of pillLayouts.current.keys())
      if (!live.has(id)) pillLayouts.current.delete(id);
    publishFolderRects();
  }, [folderKey, publishFolderRects]);

  const [dragging, setDragging] = useState(false);
  // Edit mode gives every set a drag handle; searching leaves it.
  const [editRequested, setEditing] = useState(false);
  const canEdit = !needle && sets.length > 0;
  const editing = editRequested && canEdit;
  const [hoverFolder, setHoverFolder] = useState<string | null>(null);
  const [setsOffsetY, setSetsOffsetY] = useState(0);

  const reorder = (id: string, toIndex: number) => {
    const plan = planSetReorder(sets, id, toIndex);
    void store().reorderSets(plan);
  };
  const folderLabel = (folderId: string) =>
    setFolderOptions(state.folders).find((option) => option.value === folderId)
      ?.label ?? "";
  const moveSetTo = (id: string, folderId: string) =>
    void store()
      .moveSet(id, folderId)
      .then(() => toast.success(`已移到「${folderLabel(folderId)}」`))
      .catch(() => toast.error("無法移動單字集，請再試一次。"));
  const renameSet = (id: string, currentName: string) => {
    Alert.prompt(
      "重新命名",
      undefined,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.confirm"),
          isPreferred: true,
          onPress: (value?: string) => {
            const name = value?.trim();
            if (!name) return;
            void store()
              .renameSet(id, name)
              .catch((reason: unknown) => {
                if (
                  reason instanceof Error &&
                  reason.message === "set-name-conflict"
                )
                  Alert.alert("已經有同名的單字集");
                else Alert.alert("無法重新命名，請再試一次。");
              });
          },
        },
      ],
      "plain-text",
      currentName,
    );
  };
  const askDeleteSet = (id: string, name: string) =>
    Alert.alert(t("setDetail.delete"), t("setDetail.deleteConfirm", { name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("setDetail.delete"),
        style: "destructive",
        onPress: () => void store().deleteSet(id),
      },
    ]);
  // The system context menu a long press on a set opens.
  const folderOptions = setFolderOptions(state.folders);
  const renderMenu = (entry: LibrarySet) => {
    const home =
      !entry.folderId || entry.folderId === ALL_FOLDER_ID
        ? UNCATEGORIZED_FOLDER_ID
        : entry.folderId;
    return (
      <Link.Menu title={entry.setName}>
        <Link.MenuAction
          icon="play"
          onPress={() =>
            router.push({ pathname: "/practice", params: { setId: entry.id } })
          }
        >
          開始練習
        </Link.MenuAction>
        <Link.Menu inline>
          <Link.MenuAction
            icon="pencil"
            onPress={() => renameSet(entry.id, entry.setName)}
          >
            重新命名
          </Link.MenuAction>
          <Link.Menu title="移到資料夾" icon="folder">
            {folderOptions.map((option) => (
              <Link.MenuAction
                key={option.value}
                isOn={option.value === home}
                onPress={() => {
                  if (option.value !== home) moveSetTo(entry.id, option.value);
                }}
              >
                {option.label}
              </Link.MenuAction>
            ))}
          </Link.Menu>
          <Link.MenuAction
            icon="square.and.arrow.up"
            onPress={() =>
              router.push({
                pathname: "/sets/[setId]/share",
                params: { setId: entry.id },
              })
            }
          >
            分享
          </Link.MenuAction>
          <Link.MenuAction
            icon="arrow.up.arrow.down"
            hidden={!canEdit}
            onPress={() => setEditing(true)}
          >
            重新排序
          </Link.MenuAction>
        </Link.Menu>
        <Link.Menu inline>
          <Link.MenuAction
            icon="trash"
            destructive
            onPress={() => askDeleteSet(entry.id, entry.setName)}
          >
            刪除
          </Link.MenuAction>
        </Link.Menu>
      </Link.Menu>
    );
  };
  const createSet = () =>
    router.push({
      pathname: "/sets/new",
      params: currentFolder ? { folderId: currentFolder.id } : {},
    });
  const createFolder = () =>
    askFolderName(t("library.newFolder"), "", (name) =>
      store().createFolder(name, currentFolder?.id),
    );
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
            router.push({
              pathname: "/sets/shared/[shareId]",
              params: { shareId },
            });
          },
        },
      ],
      "plain-text",
      "",
      "url",
    );
  const folderSets = currentFolder
    ? state.sets.filter((entry) =>
        collectFolderIds(state.folders, currentFolder.id).has(entry.folderId),
      ).length
    : 0;
  const deleteFolder = () => {
    if (!currentFolder) return;
    Alert.alert(
      t("library.deleteFolder"),
      t("library.deleteFolderConfirm", {
        name: currentFolder.name,
        sets: folderSets,
      }),
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
  const moveFolderTo = (parent: string) => {
    if (!currentFolder) return;
    if (parent === (currentFolder.parentId ?? ROOT_FOLDER)) return;
    void store()
      .moveFolder(currentFolder.id, parent === ROOT_FOLDER ? undefined : parent)
      .catch(() => Alert.alert(t("library.folderNameConflict")));
  };

  const listEmpty = !sets.length && (Boolean(needle) || !childFolders.length);
  const missing = Boolean(folderId) && !currentFolder && status === "ready";

  return (
    <>
      <Stack.Screen
        options={{
          title: currentFolder?.name ?? (missing ? "" : t("library.title")),
        }}
      />
      <Stack.SearchBar
        placeholder={t("library.searchHere")}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery("")}
      />
      {missing ? null : editing ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            variant="done"
            onPress={() => setEditing(false)}
          >
            完成
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : (
        <Stack.Toolbar placement="right">
          {canEdit ? (
            <Stack.Toolbar.Button
              icon="arrow.up.arrow.down"
              accessibilityLabel="重新排序"
              onPress={() => setEditing(true)}
            />
          ) : null}
          <Stack.Toolbar.Menu
            icon="plus"
            accessibilityLabel={t("library.newSet")}
          >
            <Stack.Toolbar.MenuAction
              icon="rectangle.stack.badge.plus"
              onPress={createSet}
            >
              {t("setEditor.createTitle")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="folder.badge.plus"
              onPress={createFolder}
            >
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
            <Stack.Toolbar.Menu
              icon="ellipsis"
              accessibilityLabel={t("common.more")}
            >
              <Stack.Toolbar.MenuAction
                icon="pencil"
                onPress={() =>
                  askFolderName(
                    t("library.renameFolder"),
                    currentFolder.name,
                    (name) => store().renameFolder(currentFolder.id, name),
                  )
                }
              >
                {t("library.renameFolder")}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.Menu icon="folder" title={t("library.moveFolder")}>
                {folderParentOptions(state.folders, currentFolder.id).map(
                  (option) => (
                    <Stack.Toolbar.MenuAction
                      key={option.value}
                      isOn={
                        option.value === (currentFolder.parentId ?? ROOT_FOLDER)
                      }
                      onPress={() => moveFolderTo(option.value)}
                    >
                      {option.label}
                    </Stack.Toolbar.MenuAction>
                  ),
                )}
              </Stack.Toolbar.Menu>
              <Stack.Toolbar.MenuAction
                icon="trash"
                destructive
                onPress={deleteFolder}
              >
                {t("library.deleteFolder")}
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          ) : null}
        </Stack.Toolbar>
      )}
      <Screen refreshControl={<SyncRefreshControl />} scrollEnabled={!dragging}>
        {status === "error" ? (
          <EmptyState
            illustrated={false}
            title={t("common.loadFailed")}
            body={t("library.migrationError", { message: loadError ?? "" })}
          />
        ) : missing ? (
          <EmptyState
            illustrated={false}
            title={t("library.emptyFolderTitle")}
            body={t("setDetail.missingDescription")}
          />
        ) : status !== "ready" ? null : !listEmpty ? (
          <Animated.View
            entering={swapIn}
            layout={glide}
            style={styles.listing}
          >
            {!needle && childFolders.length ? (
              <View
                style={styles.folders}
                onLayout={(event) => {
                  foldersOffset.current = event.nativeEvent.layout.y;
                  publishFolderRects();
                }}
              >
                {childFolders.map((folder) => (
                  <FolderPill
                    key={folder.id}
                    id={folder.id}
                    name={folder.name}
                    count={countDirectItems(
                      state.folders,
                      state.sets,
                      folder.id,
                    )}
                    highlighted={hoverFolder === folder.id}
                    onMeasure={measurePill}
                    onPress={() =>
                      router.push({
                        pathname: "/library/folder/[folderId]",
                        params: { folderId: folder.id },
                      })
                    }
                  />
                ))}
              </View>
            ) : null}
            {sets.length ? (
              <View
                onLayout={(event) => setSetsOffsetY(event.nativeEvent.layout.y)}
              >
                <SortableSets
                  sets={sets}
                  metrics={metrics}
                  folderRects={folderRects}
                  setsOffsetY={setsOffsetY}
                  editing={editing}
                  renderMenu={renderMenu}
                  onReorder={reorder}
                  onDropInFolder={moveSetTo}
                  onDragChange={setDragging}
                  onHoverFolder={setHoverFolder}
                />
              </View>
            ) : null}
          </Animated.View>
        ) : needle ? (
          <EmptyState
            illustrated={false}
            title={t("library.noResults")}
            body={t("library.searchHint")}
          />
        ) : (
          <EmptyState
            title={t(
              currentFolder ? "library.emptyFolderTitle" : "library.emptyTitle",
            )}
            body={t(
              currentFolder
                ? "library.emptyFolderDescription"
                : "library.emptyDescription",
            )}
            action={
              <Button
                label={t("setEditor.createTitle")}
                icon="plus"
                onPress={createSet}
              />
            }
          />
        )}
      </Screen>
    </>
  );
}

/** A folder as an oval on the answer card: its name and how much is in it. */
function FolderPill({
  id,
  name,
  count,
  highlighted,
  onPress,
  onMeasure,
}: {
  id: string;
  name: string;
  count: number;
  highlighted: boolean;
  onPress: () => void;
  onMeasure: (
    id: string,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
}) {
  // A pill lights up while a set is held over it.
  const glow = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(highlighted ? 1.05 : 1, PILL) }],
  }));
  return (
    <Animated.View
      onLayout={(event) => onMeasure(id, event.nativeEvent.layout)}
      style={[
        styles.folderShell,
        highlighted && styles.folderHighlighted,
        glow,
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${name}，${t("library.itemCount", { count })}`}
        onPress={onPress}
        style={styles.folder}
      >
        <SymbolView name="folder.fill" size={17} tintColor={colors.brand} />
        <Text style={styles.folderName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.folderCount}>{count}</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  listing: { gap: 20 },
  folders: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  folderShell: {
    borderRadius: radius.bubble,
    backgroundColor: colors.card,
  },
  folderHighlighted: { backgroundColor: colors.selected },
  folder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    minHeight: 44,
    paddingLeft: 16,
    paddingRight: 18,
    borderRadius: radius.bubble,
  },
  folderName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    flexShrink: 1,
  },
  folderCount: { ...latin.bold, fontSize: 16, color: colors.muted },
});
