const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const servicesDir = path.join(__dirname, 'services');
const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory());

let mergedSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("USER_DATABASE_URL")
  directUrl = env("USER_DIRECT_URL")
}
`;

console.log('Merging all Prisma schemas into one...');

let seenEnums = new Set();
let seenModels = new Set();

for (const service of services) {
    const schemaPath = path.join(servicesDir, service, 'prisma', 'schema.prisma');
    if (fs.existsSync(schemaPath)) {
        let content = fs.readFileSync(schemaPath, 'utf8');
        
        // Remove generator and datasource blocks
        content = content.replace(/generator\s+\w+\s*{[^}]*}/g, '');
        content = content.replace(/datasource\s+\w+\s*{[^}]*}/g, '');
        
        mergedSchema += `\n\n// --- From ${service} ---\n` + content;
    }
}

// Write the massive schema to root
const mergedPath = path.join(__dirname, 'merged.prisma');
fs.writeFileSync(mergedPath, mergedSchema);

console.log('Running prisma db push with the merged schema to sync ALL tables at once...');
try {
    // Note: We use one of the service env vars that points to the DB. Since they all point to the same DB, it works.
    require('dotenv').config({ path: path.join(servicesDir, 'user-service', '.env') });
    execSync('npx prisma db push --schema merged.prisma', { stdio: 'inherit', cwd: __dirname });
    console.log('✅ Successfully pushed all tables to the database!');
} catch (err) {
    console.error('❌ Failed to push merged schema:', err.message);
}
