import { Disclosure } from "@/components/ui/disclosure";
import { Stack } from "@/components/ui/layout";
import { marketSelections } from "@/domain/markets";
import { predictionOutcome } from "@/domain/prediction-label";
import { createMessages } from "@/i18n/messages";

/** Touch-accessible explanations of every outcome used by the shared match and slip cards. */
export function PredictionDefinitions({ locale }: { locale: string }) {
  const messages = createMessages(locale);
  return <Disclosure $plain data-prediction-definitions>
    <summary>{messages.text("prediction.definitions.title")}</summary>
    <Stack $gap="sm">
      <p>{messages.text("prediction.definitions.answers")}</p>
      <dl>
        {Object.values(marketSelections).flat().map((selection) => {
          const outcome = predictionOutcome(messages, selection);
          return <div key={selection}><dt><strong>{outcome.label}</strong></dt><dd>{outcome.description}</dd></div>;
        })}
      </dl>
    </Stack>
  </Disclosure>;
}
