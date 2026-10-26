import "server-only";
import { hasBrowserPrivacySignal, resolveAnalyticsConsent } from "../../domain/analytics-consent.ts";
import { analyticsRules, analyticsStorageKeys } from "../../domain/analytics-settings.ts";

export const consentInitialStyle = "section[data-consent-pending]{display:none}";

/** Reads the existing choice only. No identifiers, storage writes or requests precede consent. */
export function consentBootstrapScript(): string {
  return `(()=>{let stored=null;try{stored=JSON.parse(localStorage.getItem(${JSON.stringify(analyticsStorageKeys.consent)}))}catch{}
const choice=(${resolveAnalyticsConsent.toString()})({stored,now:Date.now(),maxAgeMs:${analyticsRules.consentMaxAgeMs},automated:navigator.webdriver===true,signal:(${hasBrowserPrivacySignal.toString()})(navigator,window)});
if(choice==="unset"){const sheet=document.getElementById("analytics-consent-initial")?.sheet;sheet?.insertRule("section[data-consent-pending]{display:grid}",sheet.cssRules.length)}})();`;
}
