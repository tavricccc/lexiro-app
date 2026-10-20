// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
import type { AdminAccount, AdminAccountAdjustment } from "@/core/ai-contract";

export interface AdminAccountDraft {
  direction: "add" | "subtract";
  amount: string;
  monthly: string;
  note: string;
}

/** Only the fields the administrator actually changed belong in the write. */
export function accountAdjustment(
  account: AdminAccount,
  draft: AdminAccountDraft,
): AdminAccountAdjustment {
  const amount = Number(draft.amount);
  const monthly = Number(draft.monthly);
  const value: AdminAccountAdjustment = {
    expected: {
      version: account.version,
      points: account.points,
      monthly: account.monthly,
      renews_at: account.renews_at,
      note: account.note,
    },
  };
  if (amount > 0)
    value.addPoints = draft.direction === "add" ? amount : -amount;
  if (monthly !== account.monthly) value.monthly = monthly;
  if (draft.note !== (account.note ?? "")) value.note = draft.note;
  return value;
}

export function adjustmentBalance(
  account: AdminAccount,
  value: AdminAccountAdjustment,
) {
  const points = Math.max(0, account.points + (value.addPoints ?? 0));
  return value.monthly !== undefined && value.monthly > 0
    ? Math.max(points, value.monthly)
    : value.addPoints === undefined && value.monthly === undefined
      ? account.points
      : points;
}

export function hasAccountAdjustment(value: AdminAccountAdjustment) {
  return (
    value.addPoints !== undefined ||
    value.monthly !== undefined ||
    value.note !== undefined
  );
}
