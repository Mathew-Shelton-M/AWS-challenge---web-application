const { Parser } = require('json2csv');

// Test case: productName "#"
const rows1 = [{ productId: '00000000-0000-1000-8000-000000000000', productName: '#', totalAdded: 0, totalRemoved: 0, netChange: 0 }];
const fields1 = ['productId', 'productName', 'totalAdded', 'totalRemoved', 'netChange'];
const parser1 = new Parser({ fields: fields1 });
const csv1 = parser1.parse(rows1);
console.log('RAW CSV:', JSON.stringify(csv1));

// Simulate parseCsv with \r\n normalization
const normalized = csv1.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = normalized.split('\n').filter(l => l.trim().length > 0);
console.log('Lines:', JSON.stringify(lines));

function splitLine(line) {
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
  return result;
}

const headers = splitLine(lines[0]);
console.log('Headers:', JSON.stringify(headers));
const dataLine = splitLine(lines[1]);
console.log('Data:', JSON.stringify(dataLine));

const obj = {};
headers.forEach((h, i) => { obj[h] = dataLine[i] ?? ''; });
console.log('Parsed row:', JSON.stringify(obj));
console.log('productId match:', obj['productId'] === '00000000-0000-1000-8000-000000000000');
console.log('productName match:', obj['productName'] === '#');
console.log('totalAdded match:', obj['totalAdded'] === '0');
console.log('netChange match:', obj['netChange'] === '0');
