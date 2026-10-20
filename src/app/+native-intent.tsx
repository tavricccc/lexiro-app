import { parseShareId } from "@/components/library/share-id";

/**
 * A web share link (…/app/shared/<id>) opens the shared set sheet; every
 * other path is the app's own.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (!path.includes("/app/shared/")) return path;
  const shareId = parseShareId(path);
  return shareId ? `/sets/shared/${shareId}` : "/";
}
