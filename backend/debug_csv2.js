const { Parser } = require('json2csv');
const rows = [{ productId: '00000000-0000-1000-8000-000000000000', productName: '#', totalAdded: 0, totalRemoved: 0, netChange: 0 }];
const fields = ['productId', 'productName', 'totalAdded', 'totalRemoved', 'netChange'];
const parser = new Parser({ fields });
const csv = parser.parse(rows);

// Simulate what the test does
const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = normalized.split('\n').filter(l => l.trim().length > 0);
console.log('Lines count:', lines.length);
console.log('Line 0:', JSON.stringify(lines[0]));
console.log('Line 1:', JSON.stringify(lines[1]));

function splitLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += ch; }
  }
  result.push(current);
  return result;
}

const unquote = s => s.replace(/^"|"$/g, '').replace(/""/g, '"');
const headers = splitLine(lines[0]).map(unquote);
const values = splitLine(lines[1]).map(unquote);
console.log('Headers:', JSON.stringify(headers));
console.log('Values:', JSON.stringify(values));
const obj = {};
headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
console.log('Parsed:', JSON.stringify(obj));
console.log('productName match:', obj['productName'] === '#');
console.log('totalAdded match:', obj['totalAdded'] === '0');
console.log('netChange match:', obj['netChange'] === '0');
