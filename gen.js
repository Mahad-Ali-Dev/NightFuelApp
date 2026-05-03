const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const servicesDir = "c:\\Users\\saras\\Downloads\\NightFule\\nightfuel\\services";
const outFile = "c:\\Users\\saras\\Downloads\\NightFule\\nightfuel\\all_schemas.sql";

const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory()).sort();

let output = "";
for (const s of services) {
    const schemaPath = path.join(servicesDir, s, "prisma", "schema.prisma");
    if (fs.existsSync(schemaPath)) {
        output += `-- ==========================================\n`;
        output += `-- Service: ${s}\n`;
        output += `-- ==========================================\n`;
        console.log(`Processing ${s}...`);
        try {
            const res = execSync(`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`, {
                cwd: path.join(servicesDir, s),
                encoding: "utf-8"
            });
            output += res;
            output += "\n\n";
        } catch (e) {
            console.error(`Failed ${s}`, e.message);
        }
    }
}
fs.writeFileSync(outFile, output, "utf-8");
