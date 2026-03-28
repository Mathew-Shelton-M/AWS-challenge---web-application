// Simulate the actual test scenario more closely
const express = require('express');
const request = require('supertest');

// We need to mock the pool and auth before requiring routes
// Let's just test the CSV parsing directly with the actual route

async function main() {
  // Test what json2csv produces for the failing case
  const { Parser } = require('json2csv');
  
  const rows = [{ productId: '00000000-0000-1000-8000-000000000000', productName: '#', totalAdded: 0, totalRemoved: 0, netChange: 0 }];
  const fields = ['productId', 'productName', 'totalAdded', 'totalRemoved', 'netChange'];
  const parser = new Parser({ fields });
  const csv = parser.parse(rows);
  
  console.log('CSV output:', JSON.stringify(csv));
  
  // The test checks: csvRow['totalAdded'] === String(row.totalAdded)
  // row.totalAdded = 0, String(0) = '0'
  // But what does the CSV contain for numeric 0?
  // From the CSV: "0" (unquoted) -> parsed as "0" string -> matches String(0) = "0"
  
  // Let's check what happens with the actual test comparison
  // The test does: csvRow['productId'] === String(row.productId)
  // row.productId = '00000000-0000-1000-8000-000000000000'
  // String('00000000-0000-1000-8000-000000000000') = '00000000-0000-1000-8000-000000000000'
  // csvRow['productId'] = '00000000-0000-1000-8000-000000000000'
  // These should match!
  
  // Wait - maybe the issue is that the test's safeStringArb filter allows '#' but
  // the actual problem is something else. Let me check if the issue is with
  // how supertest returns the response body vs res.text
  
  console.log('\nChecking if the issue is with the response...');
  console.log('The test uses res.text to get the CSV content');
  console.log('But maybe the issue is that the mock is not being called correctly?');
  
  // Let me check: the test does mockQuery.mockResolvedValueOnce({ rows })
  // But the CSV endpoint does pool.query(...) which should use the mock
  // The mock returns { rows } where rows has the test data
  // Then the route does: const parser = new Parser({ fields }); const csv = parser.parse(rows);
  // And sends it back
  
  // The issue might be that the mock is shared between tests and not reset properly
  // Or that the app is being built once and the mock state leaks
  
  // Actually wait - looking at the test again:
  // The safeStringArb filters out strings with '"', ',', '\n'
  // But '#' passes this filter
  // The CSV for '#' would be: "\"#\"" (quoted)
  // After parsing: '#' -> matches
  
  // Let me check if there's a \r issue in the response
  console.log('\nChecking \r\n in CSV:');
  const hasCarriageReturn = csv.includes('\r');
  console.log('Has \\r:', hasCarriageReturn);
  
  // The test's parseCsv now normalizes \r\n -> \n
  // So that should be fine
  
  // Maybe the issue is that the test is checking parsed.length !== rows.length
  // and the CSV has an extra empty line?
  const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter(l => l.trim().length > 0);
  console.log('Lines after normalization:', lines.length, '(expected 2: header + 1 data row)');
}

main().catch(console.error);
