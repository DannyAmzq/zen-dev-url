// Dependency-free ZIP (stored entries) so contributors can package on any OS.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid release version');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries, filename) {
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const n = Buffer.from(name), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(n.length, 26);
    chunks.push(header, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8); c.writeUInt16LE(33, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42); central.push(c, n);
    offset += header.length + n.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...chunks, directory, end]);
  fs.writeFileSync(path.join(dist, filename), bytes);
  return `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${filename}`;
}
function read(name) {
  // A release must contain project files, never the target of a local symlink.
  const parts = name.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink: ${name}`);
    if (index === parts.length - 1 && !stat.isFile()) throw new Error(`Not a regular file: ${name}`);
  }
  return fs.readFileSync(current);
}
// Package tracked public source and new project files only from named areas.
// Reject symlinks on every read, and never include Git, profiles, or build output.
const allowedRoots = new Set(['docs', 'vendor', 'scripts', 'tests', '.github']);
const allowedFiles = new Set(['devbar.uc.js','devbar.css','devbar-policy.uc.js',
  'README.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','package.json',
  'theme.json','.gitignore','.gitattributes','install.ps1','install.sh','install.bat']);
function walk(dir = '') {
  return fs.readdirSync(path.join(root, dir), {withFileTypes:true}).flatMap(entry=>{
    const name=dir ? `${dir}/${entry.name}` : entry.name;
    if (!dir && !allowedRoots.has(entry.name) && !allowedFiles.has(entry.name)) return [];
    if (entry.name.startsWith('.') && !['.gitignore','.gitattributes','.github'].includes(name)) return [];
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${name}`);
    return entry.isDirectory() ? walk(name) : [name];
  });
}
const sourceFiles = walk().filter(name=>!name.endsWith('.log')&&!name.endsWith('.tmp')).sort();
const installFiles = sourceFiles.filter(name =>
  !name.startsWith('tests/')&&(!name.startsWith('scripts/')||['scripts/css-block.ps1','scripts/css-block.sh','scripts/legacy-devbar-v1.1.0.css'].includes(name))&&!name.startsWith('.github/')&&
  !['package.json','.gitignore','.gitattributes','docs/OUTREACH-DRAFTS.md','docs/RELEASE-DRAFT.md'].includes(name));
const hashes = [
  zip(installFiles.map(name => [name, read(name)]), `devbar-${version}.zip`),
  zip(sourceFiles.map(name => [`zen-dev-url/${name}`, read(name)]), `zen-dev-url-${version}-source.zip`)
];
fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
console.log(hashes.join('\n'));
