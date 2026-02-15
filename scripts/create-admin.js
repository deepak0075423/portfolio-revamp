const path = require('path');
const fs = require('fs/promises');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_JSON_PATH = path.join(DATA_DIR, 'users.json');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeUsers(users) {
  await ensureDir(DATA_DIR);
  const raw = JSON.stringify(users, null, 2) + '\n';
  await fs.writeFile(USERS_JSON_PATH, raw, 'utf8');
}

async function main() {
  const username = String(process.argv[2] || '').trim();
  const password = String(process.argv[3] || '');

  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.error('Usage: npm run create-admin -- <username> <password>');
    process.exit(1);
  }
  if (password.length < 10) {
    // eslint-disable-next-line no-console
    console.error('Password must be at least 10 characters.');
    process.exit(1);
  }

  const users = await readUsers();
  const exists = users.some((u) => u && u.username === username);
  if (exists) {
    // eslint-disable-next-line no-console
    console.error('User already exists.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  users.push({
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  await writeUsers(users);
  // eslint-disable-next-line no-console
  console.log(`Admin user created: ${username}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

