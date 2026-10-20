// Synced from the lexiro web repo by scripts/sync-core.mjs; edit there, not here.
export type CloudSyncErrorCode =
  | "cloud/app-check-initialization"
  | "cloud/checksum-mismatch"
  | "cloud/data-invalid"
  | "cloud/not-configured"
  | "cloud/outbox-invalid"
  | "cloud/schema-unsupported";

export type SyncErrorKind =
  | "aborted"
  | "app-check"
  | "auth"
  | "blocked-client"
  | "cloud-data"
  | "cloud-schema"
  | "network"
  | "not-configured"
  | "outbox"
  | "permission"
  | "persistence"
  | "resource"
  | "timeout"
  | "unknown";

export interface CloudSyncErrorContext {
  domain?:
    "library" | "learning" | "settings" | "auth" | "listener" | "persistence";
  operation?: string;
  documentId?: string;
}

export class CloudSyncError extends Error {
  readonly code: CloudSyncErrorCode;
  readonly context: Readonly<CloudSyncErrorContext>;

  constructor(
    code: CloudSyncErrorCode,
    message: string,
    options?: ErrorOptions & { context?: CloudSyncErrorContext },
  ) {
    super(message, options);
    this.name = "CloudSyncError";
    this.code = code;
    this.context = Object.freeze({ ...options?.context });
  }
}

export interface SyncErrorDetails {
  code: string;
  kind: SyncErrorKind;
  message: string;
  context: Readonly<CloudSyncErrorContext>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : String(error.code);
}

export function syncErrorDetails(error: unknown): SyncErrorDetails {
  const message = errorMessage(error);
  const code = errorCode(error);
  const normalized = `${code} ${message}`.toLowerCase();

  const context = error instanceof CloudSyncError ? error.context : {};
  const details = (kind: SyncErrorKind): SyncErrorDetails => ({
    code: code || "unknown",
    kind,
    message,
    context,
  });
  if (code === "cloud/app-check-initialization") return details("app-check");
  if (code === "cloud/schema-unsupported") return details("cloud-schema");
  if (code === "cloud/data-invalid" || code === "cloud/checksum-mismatch")
    return details("cloud-data");
  if (code === "cloud/outbox-invalid") return details("outbox");
  if (code === "cloud/not-configured") return details("not-configured");
  if (
    normalized.includes("invalid-argument") ||
    normalized.includes("unsupported field value")
  )
    return details("cloud-data");
  if (
    normalized.includes("err_blocked_by_client") ||
    normalized.includes("blocked by client")
  )
    return details("blocked-client");
  if (
    normalized.includes("app check") ||
    normalized.includes("appcheck") ||
    normalized.includes("recaptcha") ||
    normalized.includes("token is invalid")
  )
    return details("app-check");
  if (
    normalized.includes("permission-denied") ||
    normalized.includes("missing or insufficient permissions")
  )
    return details("permission");
  if (normalized.includes("unauthenticated") || normalized.includes("auth/"))
    return details("auth");
  if (
    normalized.includes("failed-precondition") ||
    normalized.includes("indexeddb") ||
    normalized.includes("persistence") ||
    normalized.includes("multiple tab")
  )
    return details("persistence");
  if (
    normalized.includes("deadline-exceeded") ||
    normalized.includes("timeout")
  )
    return details("timeout");
  if (normalized.includes("resource-exhausted")) return details("resource");
  if (normalized.includes("aborted")) return details("aborted");
  if (normalized.includes("unavailable") || normalized.includes("network"))
    return details("network");
  return details("unknown");
}

export function isRetryableSyncError(error: unknown): boolean {
  return ["aborted", "network", "resource", "timeout", "unknown"].includes(
    syncErrorDetails(error).kind,
  );
}
