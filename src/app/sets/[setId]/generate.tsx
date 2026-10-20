import { useLocalSearchParams } from "expo-router";

import { QuestionGenerator } from "@/components/questions/question-generator";

export default function GenerateQuestionsScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  return <QuestionGenerator setId={setId} />;
}
