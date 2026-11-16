# Package validation

These checks concern the prompt package only. No GoalHint repository, production
API, deployment or forecasting accuracy was tested while splitting the source.

| Check | Result |
|---|---|
| Executable prompt files | 61 Markdown files |
| Numbering | Consecutive 001–061; no gaps or duplicate numbers |
| Filename format | Three-digit number, hyphen, short lowercase hyphenated task name, `.md` |
| Task boundaries | Every prompt has one named task, a scope boundary, acceptance checks and a handoff |
| Prerequisites | All listed prerequisites refer only to earlier numbered tasks |
| Source preservation | 284 substantive source lines retained verbatim in numbered prompts/shared context |
| Unassigned substantive source lines | 0 |
| Original copy | Byte-for-byte identical to the uploaded file |
| Source SHA-256 | `95e201448fab1ff289859efc67b0df77486b419d861c0921c9f1d1375523b017` |
| Original source size | 54,811 bytes; 443 text lines |
| Prompt lengths | 277–799 whitespace-delimited words; median 421 |
| Reference treatment | Original references preserved; not independently refreshed |
| Implementation/deployment claims | None; actual execution belongs to the implementing agent |

The source was divided by responsibility rather than by equal word count. Tables
and tightly coupled rules remain together where needed. Original numeric defaults,
endpoint spellings, status values, probability rules, layout requirements and all
20 acceptance criteria are retained in the mapped excerpts.

All 1203 relative Markdown links were checked: no missing destinations.
