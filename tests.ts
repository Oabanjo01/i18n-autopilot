import fs from 'fs';

const entries = fs.readdirSync('./bin', { withFileTypes: true });  


log(entries, "entries")