-- Rank and count published picks without fetching immutable market payloads.
CREATE INDEX `MarketPrediction_feed_choice_idx`
  ON `MarketPrediction` (`setId`, `family`, `available`, `selectedProbability`, `selection`);
