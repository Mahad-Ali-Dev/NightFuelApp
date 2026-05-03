const fs = require('fs');
const sql = fs.readFileSync('c:\\Users\\saras\\Downloads\\NightFule\\nightfuel\\all_schemas.sql', 'utf8');
const out = '```sql\n' + sql + '\n```';
fs.writeFileSync('c:\\Users\\saras\\.gemini\\antigravity\\brain\\716801cc-83d7-4e6b-a8cd-a53175613972\\database_schemas.md', out, 'utf8');
