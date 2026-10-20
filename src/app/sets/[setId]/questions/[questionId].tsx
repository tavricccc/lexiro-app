import { router, useLocalSearchParams } from "expo-router";

import { FormScreen, SheetHeader } from "@/components/form-sheet";
import { QuestionEditor } from "@/components/questions/question-editor";
import { ReadingEditor } from "@/components/questions/reading-editor";
import { EmptyState } from "@/components/ui/layout";
import { t } from "@/core/lib/i18n";
import { useLibraryStore } from "@/core/stores/library-store";

/** Edits one saved question or reading pack, as the web's edit pages do. */
export default function EditQuestionScreen() {
  const { setId, questionId } = useLocalSearchParams<{
    setId: string;
    questionId: string;
  }>();
  const current = useLibraryStore((store) =>
    store.state.questions.find((entry) => entry.id === questionId),
  );

  if (
    !current ||
    (current.kind === "multipleChoice" && current.questionStyle === "grammar")
  )
    return (
      <FormScreen>
        <SheetHeader
          title={t("questions.retiredTitle")}
          onCancel={() => router.back()}
        />
        <EmptyState
          illustrated={false}
          title={current ? t("questions.retiredTitle") : t("questions.empty")}
          body={current ? t("questions.retiredHint") : ""}
        />
      </FormScreen>
    );

  return current.kind === "reading" ? (
    <ReadingEditor key={current.updatedAt} setId={setId} current={current} />
  ) : (
    <QuestionEditor key={current.updatedAt} setId={setId} current={current} />
  );
}
