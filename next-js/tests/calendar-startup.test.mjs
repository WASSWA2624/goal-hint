import assert from 'node:assert/strict';
import test from 'node:test';
import { addReportingDays, parseReportingDate } from '../src/domain/calendar.ts';
import { feedQueryHref, parseFeedQuery } from '../src/domain/feed-query.ts';
import { createMessages } from '../src/i18n/messages.ts';

test('rerendering date labels and links stays within a bounded timezone-lookup budget', () => {
  const today = parseReportingDate('2520-03-08');
  const query = parseFeedQuery(new URLSearchParams(), { today });
  const messages = createMessages();
  const draw = () => Array.from({ length: 32 }, (_, index) => {
    const date = addReportingDays(today, index - 1);
    return [messages.reportingDayParts(date), messages.reportingDate(date),
      feedQueryHref({ ...query, dates: { kind: 'date', date } }, today)];
  });
  const first = draw(), original = Intl.DateTimeFormat.prototype.formatToParts;
  let lookups = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) {
    lookups++;
    return original.apply(this, args);
  };
  try {
    assert.deepEqual(draw(), first, 'Cached dates retain their labels and navigation');
    assert.ok(lookups <= 64, `Date-strip rerender made ${lookups} timezone lookups`);
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = original;
  }
});
