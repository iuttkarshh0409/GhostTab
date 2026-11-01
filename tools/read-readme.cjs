const fs = require('fs');
const md = fs.readFileSync('D:\\Side Projects\\UD\\GhostTab\\README.md', 'utf8');
const i = md.indexOf('Quick start (fresh copy');
console.log('found index:', i);
console.log('---');
console.log(md.slice(Math.max(0, i - 200), i + 1600));
