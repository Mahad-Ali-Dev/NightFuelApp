const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const servicesDir = path.join(__dirname, 'services');
const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory());

let models = new Map();
let enums = new Map();

for (const service of services) {
    const schemaPath = path.join(servicesDir, service, 'prisma', 'schema.prisma');
    if (fs.existsSync(schemaPath)) {
        let content = fs.readFileSync(schemaPath, 'utf8');
        
        // Match models and enums including their curly brace blocks
        const blockRegex = /(?:model|enum)\s+(\w+)\s*{[^}]*}/g;
        let match;
        
        while ((match = blockRegex.exec(content)) !== null) {
            const block = match[0];
            const name = match[1];
            
            if (block.startsWith('model')) {
                // Keep the FIRST defined version of a model across all services, 
                // assuming the first or any identical definition is the authoritative one
                if (!models.has(name)) {
                    models.set(name, block);
                }
            } else if (block.startsWith('enum')) {
                if (!enums.has(name)) {
                    enums.set(name, block);
                }
            }
        }
    }
}

let mergedSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("MERGED_DB_URL")
  directUrl = env("MERGED_DIRECT_URL")
}
`;

for (const [name, block] of models.entries()) {
    mergedSchema += `\n\n${block}`;
}

for (const [name, block] of enums.entries()) {
    mergedSchema += `\n\n${block}`;
}

const mergedPath = path.join(__dirname, 'merged.prisma');
fs.writeFileSync(mergedPath, mergedSchema);
console.log('Merged schema successfully created without duplicates.');
