// Simulate the exact test scenario
jest = {
  mock: () => {},
  fn: () => {
    const calls = [];
    const resolvedValues = [];
    const fn = async (...args) => {
      calls.push(args);
      if (resolvedValues.length > 0) {
        return resolvedValues.shift();
      }
      return { rows: [] };
    };
    fn.mockResolvedValueOnce = (val) => { resolvedValues.push(val); return fn; };
    fn.mockReset = () => { calls.length = 0; resolvedValues.length = 0; };
    return fn;
  }
};

// The key question: does the test's parseCsv correctly handle the CSV output?
// Let me trace through the exact failing case

function parseCsv(csv) {
  // Normalize CRLF (json2csv uses \r\n) to LF before splitting
  const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const unquote = (s) => s.replace(/^"|"$/g, '').replace(/""/g, '"');
  const splitLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result.map(unquote);
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? '';
    });
    return obj;
  });
}

const { Parser } = require('json2csv');

// Test the failing case
const rows = [{ productId: '00000000-0000-1000-8000-000000000000', productName: '#', totalAdded: 0, totalRemoved: 0, netChange: 0 }];
const fields = ['productId', 'productName', 'totalAdded', 'totalRemoved', 'netChange'];
const parser = new Parser({ fields });
const csv = parser.parse(rows);

console.log('CSV:', JSON.stringify(csv));

const parsed = parseCsv(csv);
console.log('Parsed:', JSON.stringify(parsed));
console.log('parsed.length:', parsed.length, 'rows.length:', rows.length);

if (parsed.length !== rows.length) {
  console.log('FAIL: length mismatch');
} else {
  const result = rows.every((row, i) => {
    const csvRow = parsed[i];
    const checks = {
      productId: csvRow['productId'] === String(row.productId),
      productName: csvRow['productName'] === String(row.productName),
      totalAdded: csvRow['totalAdded'] === String(row.totalAdded),
      totalRemoved: csvRow['totalRemoved'] === String(row.totalRemoved),
      netChange: csvRow['netChange'] === String(row.netChange),
    };
    console.log('Row checks:', checks);
    return Object.values(checks).every(Boolean);
  });
  console.log('Result:', result);
}
