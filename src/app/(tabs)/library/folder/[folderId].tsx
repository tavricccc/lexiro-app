import { useLocalSearchParams } from "expo-router";

import { LibraryListing } from "@/components/library/library-listing";

export default function FolderScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  return <LibraryListing folderId={folderId} />;
}
