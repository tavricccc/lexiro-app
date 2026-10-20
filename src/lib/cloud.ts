import type { User } from "firebase/auth";

import type { CloudRecord } from "@/lexiro/types";
import { AGENT_WORKER_URL } from "./config";

async function request<T>(user: User, path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await user.getIdToken(attempt > 0);
    const response = await fetch(`${AGENT_WORKER_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 && attempt === 0) continue;
    if (!response.ok) throw new Error(`cloud_${response.status}`);
    return (await response.json()) as T;
  }
  throw new Error("cloud_401");
}

/** Every record written since `cursor`, following the server pagination. */
export async function pullRecords(
  user: User,
  cursor: string,
): Promise<{ records: CloudRecord[]; cursor: string }> {
  const records: CloudRecord[] = [];
  let next = cursor;
  for (;;) {
    const page = await request<{
      records: CloudRecord[];
      cursor: string;
      hasMore: boolean;
    }>(user, `/sync/records?cursor=${encodeURIComponent(next)}`);
    records.push(...page.records);
    next = page.cursor;
    if (!page.hasMore || !page.records.length) break;
  }
  return { records, cursor: next };
}
