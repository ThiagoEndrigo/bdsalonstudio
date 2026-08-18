const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
      });
    }).on('error', reject);
  });
}

async function test() {
  console.log('Fetching /api/schemas...');
  const schemas = await fetchJson('https://bdsalonstudio.onrender.com/api/schemas');
  console.log('SCHEMAS:', JSON.stringify(schemas));

  console.log('Fetching /api/tables for company_deboranails...');
  const tablesDebora = await fetchJson('https://bdsalonstudio.onrender.com/api/tables?schema=company_deboranails');
  console.log('TABLES (company_deboranails):', Object.keys(tablesDebora.tables || {}));

  console.log('Fetching /api/tables for company_keilafrutuoso...');
  const tablesKeila = await fetchJson('https://bdsalonstudio.onrender.com/api/tables?schema=company_keilafrutuoso');
  console.log('TABLES (company_keilafrutuoso):', Object.keys(tablesKeila.tables || {}));
}

test();
