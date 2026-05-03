const fs = require('fs');
const path = require('path');

let output = '';

function printTree(dir, prefix = '') {
    const files = fs.readdirSync(dir);
    files.forEach((file, index) => {
        if (['node_modules', '.next', '.expo', '.git', 'dist', 'build'].includes(file)) return;
        const isLast = index === files.length - 1;
        const pointer = isLast ? '└── ' : '├── ';
        output += prefix + pointer + file + '\n';
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            printTree(fullPath, prefix + (isLast ? '    ' : '│   '));
        }
    });
}
printTree(process.argv[2]);
fs.writeFileSync(process.argv[3], output, 'utf8');
