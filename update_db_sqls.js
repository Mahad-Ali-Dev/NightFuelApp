const fs = require('fs');
const path = require('path');

const allSchemasPath = "c:\\Users\\saras\\Downloads\\NightFule\\nightfuel\\all_schemas.sql";
const dbDir = "c:\\Users\\saras\\Downloads\\NightFule\\nightfuel\\db";

const content = fs.readFileSync(allSchemasPath, 'utf8');

const blocks = content.split('-- ==========================================\n-- Service: ');

const serviceMap = {
    'auth-service': 'auth-service_schema.sql',
    'chat-service': 'chat-service_schema.sql',
    'community-service': 'community-service_schema.sql',
    'exercise-service': 'exercise_schema.sql',
    'meal-service': 'meal_schema.sql',
    'notification-service': 'notification-service_schema.sql',
    'plan-service': 'plan-service_schema.sql',
    'progress-service': 'progress_schema.sql',
    'shift-service': 'shift-service_schema.sql',
    'sleep-service': 'sleep-service_schema.sql',
    'state-service': 'state-service_schema.sql',
    'subscription-service': 'subscription-service_schema.sql',
    'user-service': 'user-service_schema.sql',
};

let completeSchema = "";

for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const firstNewlineIndex = block.indexOf('\n');
    const serviceName = block.substring(0, firstNewlineIndex).trim();

    // Removing the separator header stuff
    const rest = block.substring(block.indexOf('-- ==========================================\n') + '-- ==========================================\n'.length);

    if (serviceMap[serviceName]) {
        const destFile = path.join(dbDir, serviceMap[serviceName]);
        // Also combine for complete schema
        const header = `-- ==========================================\n-- Service: ${serviceName}\n-- ==========================================\n\n`;
        fs.writeFileSync(destFile, header + rest.trim() + '\n', 'utf8');
        console.log(`Updated ${destFile}`);

        completeSchema += header + rest.trim() + "\n\n";
    }
}

// Update complete schemas
fs.writeFileSync(path.join(dbDir, 'nightfuel_complete_schema.sql'), completeSchema, 'utf8');
fs.writeFileSync(path.join(dbDir, 'nightfuel_single_db.sql'), completeSchema, 'utf8');
console.log("Updated complete schemas.");
