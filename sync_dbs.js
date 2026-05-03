const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const servicesDir = path.join(__dirname, 'services');
const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory());

console.log('Synchronizing all microservice schemas to Postgres without dropping existing tables...');

for (const service of services) {
    const servicePath = path.join(servicesDir, service);
    const schemaPath = path.join(servicePath, 'prisma', 'schema.prisma');
    
    if (fs.existsSync(schemaPath)) {
        console.log(`\nProcessing ${service}...`);
        try {
            // 1. Generate the CREATE statements only
            execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > create_all.sql', { cwd: servicePath, stdio: 'pipe' });
            
            // Make the sql script idempotent
            const sqlPath = path.join(servicePath, 'create_all.sql');
            let sql = fs.readFileSync(sqlPath, 'utf8');
            sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
            fs.writeFileSync(sqlPath, sql);

            // 2. Execute the statements against the database
            execSync('npx prisma db execute --file create_all.sql --schema prisma/schema.prisma', { cwd: servicePath, stdio: 'pipe' });
            
            console.log(`✅ Successfully synced ${service}`);
        } catch (err) {
            console.error(`❌ Failed to sync ${service}:`);
            console.error(err.message);
            if (err.stdout) console.error(err.stdout.toString());
            if (err.stderr) console.error(err.stderr.toString());
        }
    }
}

console.log('\nAll schemas processed.');
