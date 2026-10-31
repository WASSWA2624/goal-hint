export const variants = Object.freeze([
  { id: "touchline", name: "Touchline", tag: "The clear all-rounder", description: "A familiar scoreboard, a decisive prediction strip, and spacious underline tabs.", layout: "horizontal", style: "balanced", accent: "#2457c5", surface: "#ffffff" },
  { id: "floodlight", name: "Floodlight", tag: "Under the lights", description: "A broadcast scoreboard, luminous prediction panel, and dark segmented navigation.", layout: "horizontal", style: "broadcast", accent: "#90b6ff", surface: "#111f33" },
  { id: "clubhouse", name: "Clubhouse", tag: "Everything has a place", description: "A vertical section index keeps all eight destinations visible beside the content.", layout: "vertical", style: "club", accent: "#197052", surface: "#ffffff" },
  { id: "matchday", name: "Matchday", tag: "The football journal", description: "An editorial match masthead, an ink-blue prediction brief, and ruled chapter tabs.", layout: "horizontal", style: "editorial", accent: "#354c70", surface: "#fffef9" },
  { id: "analyst", name: "Analyst", tag: "More signal per screen", description: "A compact score ribbon, structured prediction cells, and a dense analytical workspace.", layout: "horizontal", style: "compact", accent: "#2465b0", surface: "#ffffff" },
  { id: "pitchside", name: "Pitchside", tag: "Built around the game", description: "A stadium-inspired match banner and numbered navigation with a strong green signature.", layout: "horizontal", style: "field", accent: "#19744c", surface: "#ffffff" },
  { id: "dugout", name: "Dugout", tag: "A guided match workspace", description: "A quiet cyan accent and a grouped side index distinguish predictions, teams, and match facts.", layout: "vertical", style: "workspace", accent: "#086c80", surface: "#ffffff" },
  { id: "scorebook", name: "Scorebook", tag: "A continuous match record", description: "A square ledger composition with joined prediction cells and full-width table navigation.", layout: "horizontal", style: "ledger", accent: "#5862a0", surface: "#ffffff" },
  { id: "pressbox", name: "Pressbox", tag: "A considered reading view", description: "A two-tone match masthead and a wide left section rail, with room for explanations and sources.", layout: "vertical", style: "reading", accent: "#9a4c2a", surface: "#fffefa" },
  { id: "nightwatch", name: "Nightwatch", tag: "The focused dark workspace", description: "A charcoal scoreboard, mint prediction signal, and an integrated vertical tab rail.", layout: "vertical", style: "night", accent: "#80dfba", surface: "#192625" },
]);

export const tabs = Object.freeze([
  { id: "stats", name: "Statistics & form", short: "Statistics", icon: "chart", description: "Team comparison and recent results" },
  { id: "h2h", name: "Head-to-head", short: "Head-to-head", icon: "versus", description: "Previous meetings in all competitions" },
  { id: "standings", name: "Standings", short: "Standings", icon: "table", description: "Competition table and positions" },
  { id: "lineups", name: "Lineups", short: "Lineups", icon: "shirt", description: "Formations, players and managers" },
  { id: "markets", name: "Other markets", short: "Markets", icon: "target", description: "More selections, probabilities and odds" },
  { id: "events", name: "Match events", short: "Events", icon: "clock", description: "Goals, cards and substitutions" },
  { id: "venue", name: "Venue & officials", short: "Venue", icon: "stadium", description: "The ground, pitch and referee" },
  { id: "analysis", name: "Analysis & news", short: "Analysis", icon: "document", description: "Scenarios, reporting and evidence" },
]);

export const viewers = Object.freeze([
  { id: "subscriber", name: "Subscriber" }, { id: "guest", name: "Visitor · signed out" },
  { id: "member", name: "Member · no subscription" }, { id: "referral", name: "Member · referral access" },
]);

export const statuses = Object.freeze([
  { id: "scheduled", name: "Upcoming" }, { id: "live", name: "Live · 67′" },
  { id: "finished-regulation", name: "Completed" }, { id: "postponed", name: "Postponed" },
]);

export function reviewState(parameters) {
  const choose = (key, values, fallback) => values.some(item => item.id === parameters.get(key)) ? parameters.get(key) : fallback;
  return {
    variant: choose("variant", variants, "touchline"), tab: choose("tab", tabs, "stats"),
    viewer: choose("viewer", viewers, "subscriber"), status: choose("status", statuses, "scheduled"),
  };
}
