-- Existing result receipts retain their original observation clocks.
ALTER TABLE FixtureResultState ADD COLUMN lastVerifiedAt DATETIME(3) NULL;
