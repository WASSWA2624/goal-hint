import type { ComponentPropsWithoutRef } from "react";
import { predictionOutcome, type PredictionLabelContext } from "@/domain/prediction-label";
import type { Messages } from "@/i18n/messages";

/** A universal display component: server callers retain their formatter without crossing a client boundary. */
export function PredictionOutcome({ messages, selection, context, ...props }: Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  messages: Messages; selection: string; context?: PredictionLabelContext;
}) {
  const { label, description } = predictionOutcome(messages, selection, context);
  return <span {...props} title={description} aria-label={description}>{label}</span>;
}
