export const concepts = Object.freeze([
  {
    id: 1,
    name: "Compact stack",
    summary:
      "A familiar search row and one quiet row for date, status, and filters.",
    benefit:
      "The everyday controls stay visible without competing with the matches.",
    tradeoff: "Uses two rows even when you are only browsing.",
    hint: "Search a team, choose a date, or open Filters for the remaining options.",
  },
  {
    id: 2,
    name: "Search first",
    summary:
      "Search leads, with the current date and refinement controls kept close by.",
    benefit:
      "A clear starting point when you know the team or competition you want.",
    tradeoff: "Browsing by match status takes an extra tap.",
    hint: "Try a team name, then refine the results using the controls alongside search.",
  },
  {
    id: 3,
    name: "Status tabs",
    summary:
      "Status tabs lead, followed by one date control and compact search and filter actions.",
    benefit:
      "Switching between match states is immediate and easy to understand.",
    tradeoff: "The status row adds height, even if you rarely change it.",
    hint: "Switch match status, choose a date, or tap the search icon to open search.",
  },
  {
    id: 4,
    name: "Day navigator",
    summary:
      "A single date label with previous and next arrows replaces repeated date controls.",
    benefit: "Moving through nearby match days feels direct and predictable.",
    tradeoff: "A distant date or a date range needs the date picker.",
    hint: "Step between days with the arrows; tap the date label for more date options.",
  },
  {
    id: 5,
    name: "Week strip",
    summary:
      "A concise week of dates gives match-day browsing a dedicated home.",
    benefit: "You can see the nearby days and change date in one tap.",
    tradeoff: "The week strip occupies more space than a single date button.",
    hint: "Choose a day in the strip, or open its calendar to select a wider period.",
  },
  {
    id: 6,
    name: "Reveal search",
    summary:
      "A very small browsing toolbar reveals the search field only when you need it.",
    benefit: "Makes room for matches while keeping search one tap away.",
    tradeoff: "Search is less discoverable than an always-visible field.",
    hint: "Tap the search icon to reveal the field; use Filters for the other refinements.",
  },
  {
    id: 7,
    name: "Filter rail",
    summary:
      "Search sits above a horizontally scrollable row of named filter controls.",
    benefit: "Common refinements are visible and individually accessible.",
    tradeoff: "Some controls require a sideways swipe on narrower phones.",
    hint: "Swipe the filter row sideways and tap a named control to change that section.",
  },
  {
    id: 8,
    name: "Match header",
    summary:
      "One date-and-status summary sits below Matches, beside search and filter actions.",
    benefit:
      "The current match scope is readable in one place without a separate search field.",
    tradeoff: "Searching takes an extra tap to open the search sheet.",
    hint: "Tap the scope summary to change dates or status; tap the search icon to open search.",
  },
  {
    id: 9,
    name: "Bottom dock",
    summary:
      "Dates and status stay at the top; search and filters sit in a thumb-friendly bottom dock.",
    benefit: "Refinement is easy to reach while scrolling through results.",
    tradeoff: "The dock permanently reserves some space at the bottom.",
    hint: "Scroll the matches and use the bottom dock to search or adjust your filters.",
  },
  {
    id: 10,
    name: "Inline expander",
    summary:
      "A compact search and summary row opens a filter panel within the page.",
    benefit: "You keep the match list in context while adjusting the filters.",
    tradeoff:
      "Opening the panel moves the first matches farther down the screen.",
    hint: "Expand Refine, make your changes, then collapse the panel to return to the list.",
  },
]);

export function getConcept(id) {
  return concepts.find((concept) => concept.id === Number(id)) ?? concepts[0];
}
