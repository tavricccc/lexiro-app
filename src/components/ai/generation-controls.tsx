import {
  AI_MODELS,
  estimatePoints,
  TIERS,
  type AiModel,
  type JobKind,
  type Tier,
} from "@/core/ai-contract";
import { CheckRow, ListGroup, PickerRow } from "@/components/ui/list";
import { useManagedAccount } from "@/core/components/ai/use-managed-account";
import { t } from "@/core/lib/i18n";
import { useAiPreferencesStore } from "@/core/stores/ai-preferences-store";

const TIER_ICONS = {
  lite: "bolt",
  thinking: "brain",
  pro: "sparkles",
} as const;

/**
 * Choosing how hard the model should think, as the web's list: each row says
 * what the tier is for and what this run costs on it; the balance sits below.
 */
export function GenerationControls({
  count,
  disabled = false,
  kind,
  onTierChange,
  tier,
  model: requestedModel,
  onModelChange,
}: {
  count: number;
  disabled?: boolean;
  kind: JobKind;
  onTierChange: (tier: Tier) => void;
  tier: Tier;
  model?: AiModel;
  onModelChange?: (model: AiModel) => void;
}) {
  const account = useManagedAccount();
  const preferredModel = useAiPreferencesStore(
    (store) => store.preferences.model,
  );
  const model = requestedModel ?? preferredModel;
  const admin = account.data?.admin === true;
  const footer = [
    onModelChange ? t("managed.organizerModelHint") : "",
    account.error
      ? account.error.message
      : admin
        ? t("admin.unlimited")
        : account.data
          ? t("managed.balance", { points: account.data.points })
          : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <ListGroup title={t("managed.tier")} footer={footer || undefined}>
      {onModelChange ? (
        <PickerRow
          title={t("settings.aiModel")}
          icon="cpu"
          disabled={disabled}
          value={model}
          onChange={onModelChange}
          options={AI_MODELS.map((value) => ({
            value,
            label: value === "gpt-6-luna" ? "GPT-6 Luna" : "GPT-5.6 Luna",
          }))}
        />
      ) : null}
      {TIERS.map((value) => {
        const estimate = estimatePoints(kind, count, value, model);
        return (
          <CheckRow
            key={value}
            icon={TIER_ICONS[value]}
            title={t(`managed.${value}`)}
            subtitle={t(`managed.${value}Hint`)}
            detail={
              admin || !count
                ? undefined
                : estimate.min === estimate.max
                  ? t("managed.expectedShort", { points: estimate.max })
                  : t("managed.expectedRangeShort", estimate)
            }
            checked={tier === value}
            disabled={disabled}
            onPress={() => onTierChange(value)}
          />
        );
      })}
    </ListGroup>
  );
}
