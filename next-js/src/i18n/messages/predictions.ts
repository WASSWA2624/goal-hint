import { predictionShortForms } from "../../domain/betting-short-forms.ts";

/** Display codes and their explanations are independent of stored selection identifiers. */
export const predictionMessages = {
  "prediction.short.home-win": predictionShortForms["home-win"].code,
  "prediction.short.draw": predictionShortForms["draw"].code,
  "prediction.short.away-win": predictionShortForms["away-win"].code,
  "prediction.short.home-or-draw": predictionShortForms["home-or-draw"].code,
  "prediction.short.away-or-draw": predictionShortForms["away-or-draw"].code,
  "prediction.short.home-or-away": predictionShortForms["home-or-away"].code,
  "prediction.short.over": predictionShortForms["over"].code,
  "prediction.short.under": predictionShortForms["under"].code,
  "prediction.short.home-handicap": predictionShortForms["home-handicap"].code,
  "prediction.short.away-handicap": predictionShortForms["away-handicap"].code,
  "prediction.short.exact-count": predictionShortForms["exact-count"].code,
  "prediction.short.and": predictionShortForms["and"].code,
  "prediction.short.other": predictionShortForms["other"].code,
  "prediction.short.home-team": predictionShortForms["home-team"].code,
  "prediction.short.away-team": predictionShortForms["away-team"].code,
  "prediction.short.no-event": predictionShortForms["no-event"].code,
  "prediction.definition.yes": "Both teams score at least one goal",
  "prediction.definition.no": "At least one team does not score",
  "prediction.definition.event-yes": "The specified event occurs",
  "prediction.definition.event-no": "The specified event does not occur",
  "prediction.definitions.title": "Prediction key",
  "prediction.definitions.answers": "Yes / No answers the market shown beside the prediction.",
} as const;
