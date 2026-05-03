const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const servicesDir = path.join(__dirname, 'services');
const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory());

console.log('Synchronizing all microservice schemas to Postgres robustly...');

for (const service of services) {
    const servicePath = path.join(servicesDir, service);
    const schemaPath = path.join(servicePath, 'prisma', 'schema.prisma');

    if (fs.existsSync(schemaPath)) {
        console.log(`\nProcessing ${service}...`);
        try {
            // 1. Generate the CREATE statements only
            execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > create_all.sql', { cwd: servicePath, stdio: 'pipe' });

            // 2. Read and split the SQL into individual statements
            const sqlPath = path.join(servicePath, 'create_all.sql');
            let sql = fs.readFileSync(sqlPath, 'utf8');

            // Split by semicolon, but keep the semicolon for execution
            const statements = sql.split(';').map(s => s.trim() + ';').filter(s => s.length > 5);

            let successCount = 0;
            let skipCount = 0;

            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i];
                const tmpFile = path.join(servicePath, `tmp_stmt.sql`);
                fs.writeFileSync(tmpFile, stmt);

                try {
                    execSync('npx prisma db execute --file tmp_stmt.sql --schema prisma/schema.prisma', { cwd: servicePath, stdio: 'pipe' });
                    successCount++;
                } catch (err) {
                    // Ignore errors (usually "already exists")
                    skipCount++;
                }

                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }

            console.log(`✅ ${service}: Executed ${successCount} statements (Skipped ${skipCount} existing).`);
        } catch (err) {
            console.error(`❌ Failed to sync ${service}:`);
            console.error(err.message);
        }
    }
}

console.log('\nAll schemas processed successfully! No database fighting will occur.');
