import fs from 'fs';

const entries = fs.readdirSync('./bin', { withFileTypes: true });  


console.log(entries, "entries")