// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import { create } from "zustand";

import { adminApi, type ServiceStatus } from "@/core/lib/admin-client";
import { AgentRequestError } from "@/core/lib/agent-client";

/** An admin's status is read again when the app returns after this long. */
export const ADMIN_STATUS_TTL_MS = 10 * 60_000;

interface AdminState {
  /** The account the answer below belongs to. */
  uid: string | null;
  /** Known only once the Worker answered; a failed request leaves it false. */
  admin: boolean;
  status: ServiceStatus | null;
  checkedAt: number;
  /**
   * Asks the Worker whether this account is an admin and, if so, for the
   * service status. A non-admin is asked once per account and session; an
   * admin again after ADMIN_STATUS_TTL_MS, or at once when forced.
   */
  refresh: (uid: string | null, options?: { force?: boolean }) => Promise<void>;
  setStatus: (status: ServiceStatus) => void;
}

let pending: Promise<void> | null = null;

export const useAdminStore = create<AdminState>((set, get) => ({
  uid: null,
  admin: false,
  status: null,
  checkedAt: 0,
  refresh: async (uid, options = {}) => {
    if (!uid) {
      set({ uid: null, admin: false, status: null, checkedAt: 0 });
      return;
    }
    const known = get();
    if (known.uid !== uid)
      set({ uid, admin: false, status: null, checkedAt: 0 });
    else if (
      !options.force &&
      known.checkedAt &&
      (!known.admin || Date.now() - known.checkedAt < ADMIN_STATUS_TTL_MS)
    )
      return;
    if (pending && !options.force) return pending;
    const run = adminApi.status().then(
      (status) => {
        if (get().uid === uid)
          set({ admin: true, status, checkedAt: Date.now() });
      },
      (reason: unknown) => {
        if (get().uid !== uid) return;
        if (reason instanceof AgentRequestError && reason.code === "not_admin")
          set({ admin: false, status: null, checkedAt: Date.now() });
        // Offline or a server error says nothing either way; ask next time.
      },
    );
    pending = run;
    void run.finally(() => {
      if (pending === run) pending = null;
    });
    return run;
  },
  setStatus: (status) => set({ status, checkedAt: Date.now() }),
}));
