'use strict';
const fs = require('fs');
const path = require('path');

/** Append-only JSON Lines store: one quote per line in DATA_DIR/quotes.jsonl */
function createStorage({ dataDir, enabled = true }) {
  const file = path.join(dataDir, 'quotes.jsonl');
  return {
    enabled,
    file,
    async save(record) {
      if (!enabled) return false;
      await fs.promises.mkdir(dataDir, { recursive: true });
      await fs.promises.appendFile(file, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
      return true;
    },
  };
}

module.exports = { createStorage };
