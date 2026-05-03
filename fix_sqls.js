const fs = require('fs');
const path = require('path');

function processContent(content) {
    content = content.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
    content = content.replace(/CREATE TABLE IF NOT EXISTS IF NOT EXISTS "/g, 'CREATE TABLE IF NOT EXISTS "');

    content = content.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
    content = content.replace(/CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');

    content = content.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
    content = content.replace(/CREATE INDEX IF NOT EXISTS IF NOT EXISTS "/g, 'CREATE INDEX IF NOT EXISTS "');

    content = content.replace(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" (.*);/g, (match, tableName, constraintName, rest) => {
        return `DO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN\n    ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" ${rest};\n  END IF;\nEND $$;`;
    });
    return content;
}

const dbDir = "c:\\Users\\saras\\Downloads\\NightFule\\nightfuel\\db";
const files = fs.readdirSync(dbDir).filter(f => f.endsWith('.sql'));

for (const file of files) {
    const filePath = path.join(dbDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    content = processContent(content);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${file}`);
}

const allSchemasPath = "c:\\Users\\saras\\Downloads\\NightFule\\nightfuel\\all_schemas.sql";
if (fs.existsSync(allSchemasPath)) {
    let content = fs.readFileSync(allSchemasPath, 'utf8');
    content = processContent(content);
    fs.writeFileSync(allSchemasPath, content, 'utf8');

    // Also update the artifact
    const artifactPath = "c:\\Users\\saras\\.gemini\\antigravity\\brain\\716801cc-83d7-4e6b-a8cd-a53175613972\\database_schemas.md";
    const artifactOut = '```sql\n' + content + '\n```';
    fs.writeFileSync(artifactPath, artifactOut, 'utf8');
}
