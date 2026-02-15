const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const FileStoreFactory = require('session-file-store');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.disable('x-powered-by');

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_BASE_PATH = String(process.env.PUBLIC_BASE_PATH || '').trim();

function normalizeBasePath(basePath) {
  const raw = String(basePath || '').trim();
  if (!raw || raw === '/') return '';
  let p = raw.startsWith('/') ? raw : `/${raw}`;
  if (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

const BASE_PATH = normalizeBasePath(PUBLIC_BASE_PATH);

function withBasePath(p) {
  const pathPart = String(p || '');
  if (!BASE_PATH) return pathPart;
  return `${BASE_PATH}${pathPart.startsWith('/') ? '' : '/'}${pathPart}`;
}

const DATA_DIR = path.join(__dirname, 'data');
const SITE_JSON_PATH = path.join(DATA_DIR, 'site.json');
const USERS_JSON_PATH = path.join(DATA_DIR, 'users.json');
const SUBMISSIONS_JSON_PATH = path.join(DATA_DIR, 'submissions.json');

const EDITABLE_PAGES = [
  'dashboard',
  'submissions',
  'meta',
  'nav',
  'hero',
  'about',
  'techstack',
  'projects',
  'casestudies',
  'experience',
  'certifications',
  'blog',
  'github',
  'contact',
  'footer',
  'raw',
];

const EDITABLE_SECTIONS = new Set([
  'meta',
  'nav',
  'hero',
  'about',
  'techstack',
  'projects',
  'casestudies',
  'experience',
  'certifications',
  'blog',
  'github',
  'contact',
  'footer',
]);

function isSectionEnabled(site, sectionId) {
  const section = site && site[sectionId];
  if (!section || typeof section !== 'object') return true;
  return section.enabled !== false;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.name === 'SyntaxError')) return fallbackValue;
    throw err;
  }
}

let writeQueue = Promise.resolve();
function writeJsonAtomic(filePath, value) {
  writeQueue = writeQueue.then(async () => {
    await ensureDir(path.dirname(filePath));
    const tmpPath = `${filePath}.tmp`;
    const raw = JSON.stringify(value, null, 2) + '\n';
    await fs.writeFile(tmpPath, raw, 'utf8');
    await fs.rename(tmpPath, filePath);
  });
  return writeQueue;
}

async function appendSubmission(submission) {
  const current = await readJson(SUBMISSIONS_JSON_PATH, []);
  const next = Array.isArray(current) ? current.slice() : [];
  next.push(submission);
  const MAX = 250;
  if (next.length > MAX) next.splice(0, next.length - MAX);
  await writeJsonAtomic(SUBMISSIONS_JSON_PATH, next);
}

async function patchSubmission(id, patch) {
  const current = await readJson(SUBMISSIONS_JSON_PATH, []);
  const next = Array.isArray(current) ? current.slice() : [];
  const idx = next.findIndex((s) => s && s.id === id);
  if (idx === -1) return;
  next[idx] = Object.assign({}, next[idx], patch);
  await writeJsonAtomic(SUBMISSIONS_JSON_PATH, next);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function buildMailer() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

// ---- security & parsing ----
app.set('trust proxy', 1);
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '250kb' }));
app.use(express.json({ limit: '250kb' }));

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
        "style-src": ["'self'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
      },
    },
  })
);

const FileStore = FileStoreFactory(session);
app.use(
  session({
    store: new FileStore({
      path: path.join(__dirname, '.sessions'),
      retries: 0,
    }),
    secret: process.env.SESSION_SECRET || (IS_PROD ? 'invalid-secret' : 'dev-secret-change-me'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', [path.join(__dirname, 'views'), __dirname]);

app.use((req, res, next) => {
  res.locals.basePath = BASE_PATH;
  res.locals.url = withBasePath;
  res.locals.asset = withBasePath;
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '7d' : 0 }));
if (BASE_PATH) {
  app.use(BASE_PATH, express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '7d' : 0 }));
}

app.use('/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ---- helpers ----
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/admin/login');
}

function ensureCsrf(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

function assertCsrf(req) {
  const expected = req.session && req.session.csrfToken;
  const got = req.body && req.body._csrf;
  return Boolean(expected && got && expected === got);
}

function hasUsersFile(users) {
  return Array.isArray(users) && users.length > 0;
}

function asTrimmedString(v) {
  return String(v == null ? '' : v).trim();
}

function normalizeArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseEnabled(v) {
  const values = normalizeArray(v).map((x) => String(x).trim());
  return values.includes('1');
}

function splitLines(v, max) {
  const raw = asTrimmedString(v);
  if (!raw) return [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  return typeof max === 'number' ? lines.slice(0, max) : lines;
}

function splitBlankParagraphs(v, max) {
  const raw = asTrimmedString(v);
  if (!raw) return [];
  const parts = raw
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return typeof max === 'number' ? parts.slice(0, max) : parts;
}

function splitCsv(v, max) {
  const raw = asTrimmedString(v);
  if (!raw) return [];
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  return typeof max === 'number' ? parts.slice(0, max) : parts;
}

function parseIconTextPair(v) {
  const raw = asTrimmedString(v);
  if (!raw) return null;
  const parts = raw.split('|').map((p) => p.trim());
  const icon = parts[0] || '';
  const text = parts.slice(1).join(' | ').trim();
  if (!text && !icon) return null;
  return { icon, text };
}

function parseIconLabelLines(v, max) {
  const lines = splitLines(v, max);
  return lines
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      const icon = parts[0] || '';
      const label = parts.slice(1).join(' | ').trim();
      if (!label && !icon) return null;
      return { icon, label };
    })
    .filter(Boolean);
}

// ---- pages ----
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/robots.txt', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  return res.send(`User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}${BASE_PATH}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const now = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url>\n` +
    `    <loc>${baseUrl}${BASE_PATH}/</loc>\n` +
    `    <lastmod>${now}</lastmod>\n` +
    `    <changefreq>weekly</changefreq>\n` +
    `    <priority>1.0</priority>\n` +
    `  </url>\n` +
    `</urlset>\n`;

  res.type('application/xml');
  return res.send(xml);
});

app.get('/resume', async (req, res) => {
  const filePath = path.join(__dirname, 'CV - Deepak Pandey.pdf');
  try {
    await fs.access(filePath);
    return res.sendFile(filePath);
  } catch {
    return res.status(404).send('Resume not found.');
  }
});

app.get('/', async (req, res) => {
  const site = await readJson(SITE_JSON_PATH, null);
  if (!site) return res.status(500).send('Missing data/site.json. Please create it.');

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const meta = (site.meta && typeof site.meta === 'object') ? site.meta : {};
  const fullName = (site.hero && site.hero.firstName && site.hero.lastName)
    ? `${site.hero.firstName} ${site.hero.lastName}`
    : 'Portfolio';
  const description =
    (meta.description && String(meta.description).trim())
      ? String(meta.description).trim()
      : (site.hero && site.hero.description ? String(site.hero.description).trim() : `Personal portfolio of ${fullName}.`);

  const socials = (site.hero && Array.isArray(site.hero.socials)) ? site.hero.socials : [];
  const sameAs = socials.map((s) => s && s.href).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 10);
  const jobTitle = (site.hero && Array.isArray(site.hero.titles) && site.hero.titles[0]) ? String(site.hero.titles[0]) : '';

  const seo = {
    title: meta.title ? String(meta.title) : fullName,
    description,
    baseUrl,
    basePath: BASE_PATH,
    ogImage: meta.ogImage ? String(meta.ogImage) : '',
    jsonLdPerson: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: fullName,
      url: `${baseUrl}${BASE_PATH}/`,
      jobTitle,
      sameAs,
    },
  };

  return res.render('index', {
    site,
    seo,
    nowYear: new Date().getFullYear(),
  });
});

// ---- admin ----
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/admin/login', async (req, res) => {
  const users = await readJson(USERS_JSON_PATH, []);
  return res.render('admin-login', {
    csrfToken: ensureCsrf(req),
    missingUsers: !hasUsersFile(users),
    error: req.query.error ? String(req.query.error) : '',
  });
});

app.post('/admin/login', loginLimiter, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin/login?error=Invalid+session');

  const users = await readJson(USERS_JSON_PATH, []);
  if (!hasUsersFile(users)) return res.redirect('/admin/login?error=No+admin+user+found');

  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const user = users.find((u) => u && u.username === username);
  if (!user) return res.redirect('/admin/login?error=Invalid+credentials');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.redirect('/admin/login?error=Invalid+credentials');

  req.session.user = { username };
  return res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?error=Invalid+session');
  if (req.session) req.session.destroy(() => res.redirect('/'));
  else res.redirect('/');
});

app.get('/admin', requireAuth, async (req, res) => {
  const site = await readJson(SITE_JSON_PATH, null);
  const users = await readJson(USERS_JSON_PATH, []);
  const submissions = await readJson(SUBMISSIONS_JSON_PATH, []);
  const json = site ? JSON.stringify(site, null, 2) : '';
  const page = String(req.query.page || 'dashboard');
  const activePage = EDITABLE_PAGES.includes(page) ? page : 'dashboard';
  const viewSubmissionId = req.query.view ? String(req.query.view) : '';

  const submissionsArr = Array.isArray(submissions) ? submissions : [];
  const recentSubmissions = submissionsArr.slice(-10).reverse();
  const selectedSubmission = viewSubmissionId
    ? submissionsArr.find((s) => s && s.id === viewSubmissionId) || null
    : null;

  const counts = site
    ? {
        navLinks: Array.isArray(site.nav && site.nav.links) ? site.nav.links.length : 0,
        projects: Array.isArray(site.projects && site.projects.cards) ? site.projects.cards.length : 0,
        casestudies: Array.isArray(site.casestudies && site.casestudies.cards) ? site.casestudies.cards.length : 0,
        experience: Array.isArray(site.experience && site.experience.items) ? site.experience.items.length : 0,
        certifications: Array.isArray(site.certifications && site.certifications.cards) ? site.certifications.cards.length : 0,
        blogPosts: Array.isArray(site.blog && site.blog.posts) ? site.blog.posts.length : 0,
        submissions: submissionsArr.length,
        enabledSections: [
          'hero',
          'about',
          'techstack',
          'projects',
          'casestudies',
          'experience',
          'certifications',
          'blog',
          'github',
          'contact',
          'footer',
        ].filter((id) => isSectionEnabled(site, id)).length,
      }
    : null;

  return res.render('admin', {
    user: req.session.user,
    csrfToken: ensureCsrf(req),
    activePage,
    viewSubmissionId,
    selectedSubmission,
    recentSubmissions,
    submissions: submissionsArr.slice().reverse(),
    counts,
    site,
    siteJson: json,
    saved: req.query.saved === '1',
    error: req.query.error ? String(req.query.error) : '',
    missingUsers: !hasUsersFile(users),
  });
});

app.post('/admin/hero', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=hero&error=Invalid+session');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=hero&error=Missing+site.json');
  if (!site.hero || typeof site.hero !== 'object') site.hero = {};

  const enabled = parseEnabled(req.body.enabled);

  const greeting = String(req.body.greeting || '').trim();
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const description = String(req.body.description || '').trim();
  const scrollText = String(req.body.scrollText || '').trim();

  const titlesRaw = String(req.body.titles || '');
  const titles = titlesRaw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);

  const cta1Label = String(req.body.cta1Label || '').trim();
  const cta1Href = String(req.body.cta1Href || '').trim();
  const cta2Label = String(req.body.cta2Label || '').trim();
  const cta2Href = String(req.body.cta2Href || '').trim();

  if (greeting.length > 80) return res.redirect('/admin?page=hero&error=Greeting+too+long');
  if (!firstName) return res.redirect('/admin?page=hero&error=First+name+is+required');
  if (!lastName) return res.redirect('/admin?page=hero&error=Last+name+is+required');
  if (firstName.length > 40) return res.redirect('/admin?page=hero&error=First+name+too+long');
  if (lastName.length > 40) return res.redirect('/admin?page=hero&error=Last+name+too+long');
  if (description.length > 320) return res.redirect('/admin?page=hero&error=Description+too+long');
  if (scrollText.length > 40) return res.redirect('/admin?page=hero&error=Scroll+text+too+long');
  if (cta1Label.length > 40 || cta2Label.length > 40) return res.redirect('/admin?page=hero&error=CTA+text+too+long');
  if (cta1Href.length > 240 || cta2Href.length > 240) return res.redirect('/admin?page=hero&error=CTA+URL+too+long');

  const hero = Object.assign({}, site.hero);
  hero.enabled = enabled;
  hero.greeting = greeting;
  hero.firstName = firstName;
  hero.lastName = lastName;
  hero.description = description;
  hero.scrollText = scrollText;
  hero.titles = titles;

  const currentCtas = Array.isArray(hero.ctas) ? hero.ctas.slice() : [];
  const cta1 = Object.assign({ style: 'primary', icon: '' }, currentCtas[0] || {});
  const cta2 = Object.assign({ style: 'outline', icon: '' }, currentCtas[1] || {});
  if (cta1Label) cta1.label = cta1Label;
  if (cta1Href) cta1.href = cta1Href;
  if (cta2Label) cta2.label = cta2Label;
  if (cta2Href) cta2.href = cta2Href;
  hero.ctas = [cta1, cta2].filter((c) => c && (c.label || c.href));

  site.hero = hero;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=hero&saved=1');
});

app.post('/admin/meta', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=meta&error=Invalid+session');

  const title = asTrimmedString(req.body.title);
  if (!title) return res.redirect('/admin?page=meta&error=Title+is+required');
  if (title.length > 120) return res.redirect('/admin?page=meta&error=Title+too+long');

  const description = asTrimmedString(req.body.description);
  const ogImage = asTrimmedString(req.body.ogImage);
  if (description.length > 240) return res.redirect('/admin?page=meta&error=Description+too+long');
  if (ogImage.length > 300) return res.redirect('/admin?page=meta&error=OG+image+URL+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=meta&error=Missing+site.json');

  site.meta = Object.assign({}, site.meta, { title, description, ogImage });
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=meta&saved=1');
});

app.post('/admin/nav', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=nav&error=Invalid+session');

  const logoText = asTrimmedString(req.body.logoText);
  if (!logoText) return res.redirect('/admin?page=nav&error=Logo+text+is+required');
  if (logoText.length > 80) return res.redirect('/admin?page=nav&error=Logo+text+too+long');

  const linksRaw = normalizeArray(req.body.links);
  const links = linksRaw
    .map((l) => {
      const id = asTrimmedString(l && l.id);
      const label = asTrimmedString(l && l.label);
      if (!id || !label) return null;
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/i.test(id)) return null;
      return { id, label };
    })
    .filter(Boolean)
    .slice(0, 20);

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=nav&error=Missing+site.json');

  site.nav = Object.assign({}, site.nav, { logoText, links });
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=nav&saved=1');
});

app.post('/admin/about', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=about&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);
  const paragraphsHtml = splitBlankParagraphs(req.body.paragraphs, 10);

  const resume = req.body.resume && typeof req.body.resume === 'object' ? req.body.resume : {};
  const resumeLabel = asTrimmedString(resume.label);
  const resumeHref = asTrimmedString(resume.href);
  const resumeIcon = asTrimmedString(resume.icon);

  const info = normalizeArray(req.body.info)
    .map((it) => {
      const label = asTrimmedString(it && it.label);
      const value = asTrimmedString(it && it.value);
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean)
    .slice(0, 20);

  const stats = normalizeArray(req.body.stats)
    .map((s) => {
      const icon = asTrimmedString(s && s.icon);
      const countRaw = asTrimmedString(s && s.count);
      const count = countRaw ? Number(countRaw) : NaN;
      const suffix = asTrimmedString(s && s.suffix);
      const label = asTrimmedString(s && s.label);
      if (!label) return null;
      return {
        icon,
        count: Number.isFinite(count) ? count : 0,
        suffix,
        label,
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  if (number.length > 10) return res.redirect('/admin?page=about&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=about&error=Title+is+required');
  if (title.length > 40) return res.redirect('/admin?page=about&error=Title+too+long');
  if (resumeLabel.length > 60) return res.redirect('/admin?page=about&error=Resume+label+too+long');
  if (resumeHref.length > 240) return res.redirect('/admin?page=about&error=Resume+URL+too+long');
  if (resumeIcon.length > 80) return res.redirect('/admin?page=about&error=Resume+icon+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=about&error=Missing+site.json');

  const next = Object.assign({}, site.about);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.paragraphsHtml = paragraphsHtml;
  next.info = info;
  next.resume = { label: resumeLabel, href: resumeHref, icon: resumeIcon };
  next.stats = stats;

  site.about = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=about&saved=1');
});

app.post('/admin/techstack', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=techstack&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);
  const sphereTags = splitLines(req.body.sphereTags, 80);

  const categories = normalizeArray(req.body.categories)
    .map((c) => {
      const icon = asTrimmedString(c && c.icon);
      const catTitle = asTrimmedString(c && c.title);
      const items = parseIconLabelLines(c && c.itemsLines, 60);
      if (!catTitle) return null;
      return { icon, title: catTitle, items };
    })
    .filter(Boolean)
    .slice(0, 12);

  if (number.length > 10) return res.redirect('/admin?page=techstack&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=techstack&error=Title+is+required');
  if (title.length > 40) return res.redirect('/admin?page=techstack&error=Title+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=techstack&error=Missing+site.json');

  const next = Object.assign({}, site.techstack);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.sphereTags = sphereTags;
  next.categories = categories;

  site.techstack = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=techstack&saved=1');
});

app.post('/admin/projects', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=projects&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);

  const filters = splitLines(req.body.filtersLines, 30)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      const label = parts[0] || '';
      const value = parts.slice(1).join(' | ').trim();
      if (!label || !value) return null;
      return { label, value };
    })
    .filter(Boolean);

  const cards = normalizeArray(req.body.cards)
    .map((p) => {
      const category = asTrimmedString(p && p.category);
      const frontIcon = asTrimmedString(p && p.frontIcon);
      const frontTitle = asTrimmedString(p && p.frontTitle);
      const frontDesc = asTrimmedString(p && p.frontDesc);
      const backTitle = asTrimmedString(p && p.backTitle);
      const backDesc = asTrimmedString(p && p.backDesc);
      const tech = splitCsv(p && p.techCsv, 20);

      const linkType = asTrimmedString(p && p.linkType) || 'link';
      const linkLabel = asTrimmedString(p && p.linkLabel);
      const linkHref = asTrimmedString(p && p.linkHref);
      const linkIcon = asTrimmedString(p && p.linkIcon);

      if (!frontTitle) return null;
      const card = {
        category,
        frontIcon,
        frontTitle,
        frontDesc,
        backTitle,
        backDesc,
        tech,
      };

      if (linkLabel || linkHref || linkIcon) {
        if (linkType === 'status') card.link = { type: 'status', icon: linkIcon, label: linkLabel };
        else card.link = { href: linkHref, icon: linkIcon, label: linkLabel };
      }

      return card;
    })
    .filter(Boolean)
    .slice(0, 40);

  if (number.length > 10) return res.redirect('/admin?page=projects&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=projects&error=Title+is+required');
  if (title.length > 60) return res.redirect('/admin?page=projects&error=Title+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=projects&error=Missing+site.json');

  const next = Object.assign({}, site.projects);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.filters = filters;
  next.cards = cards;

  site.projects = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=projects&saved=1');
});

app.post('/admin/casestudies', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=casestudies&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);
  const subtitle = asTrimmedString(req.body.subtitle);

  const cards = normalizeArray(req.body.cards)
    .map((c) => {
      const icon = asTrimmedString(c && c.icon);
      const tag = asTrimmedString(c && c.tag);
      const cardTitle = asTrimmedString(c && c.title);
      const challenge = asTrimmedString(c && c.challenge);
      const architecture = splitCsv(c && c.architectureCsv, 30);
      const impact = splitLines(c && c.impactLines, 20);
      const tech = splitCsv(c && c.techCsv, 30);
      if (!cardTitle) return null;
      return { icon, tag, title: cardTitle, challenge, architecture, impact, tech };
    })
    .filter(Boolean)
    .slice(0, 20);

  if (number.length > 10) return res.redirect('/admin?page=casestudies&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=casestudies&error=Title+is+required');
  if (title.length > 60) return res.redirect('/admin?page=casestudies&error=Title+too+long');
  if (subtitle.length > 120) return res.redirect('/admin?page=casestudies&error=Subtitle+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=casestudies&error=Missing+site.json');

  const next = Object.assign({}, site.casestudies);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.subtitle = subtitle;
  next.cards = cards;

  site.casestudies = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=casestudies&saved=1');
});

app.post('/admin/experience', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=experience&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);

  const items = normalizeArray(req.body.items)
    .map((it) => {
      const role = asTrimmedString(it && it.role);
      const company = asTrimmedString(it && it.company);
      const date = asTrimmedString(it && it.date);
      const location = asTrimmedString(it && it.location);
      const details = splitLines(it && it.detailsLines, 40);
      const tags = splitCsv(it && it.tagsCsv, 30);
      if (!role || !company) return null;
      return { role, company, date, location, details, tags };
    })
    .filter(Boolean)
    .slice(0, 30);

  if (number.length > 10) return res.redirect('/admin?page=experience&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=experience&error=Title+is+required');
  if (title.length > 60) return res.redirect('/admin?page=experience&error=Title+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=experience&error=Missing+site.json');

  const next = Object.assign({}, site.experience);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.items = items;

  site.experience = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=experience&saved=1');
});

app.post('/admin/certifications', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=certifications&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);

  const cards = normalizeArray(req.body.cards)
    .map((c) => {
      const ribbonText = asTrimmedString(c && c.ribbonText);
      const ribbonVariant = asTrimmedString(c && c.ribbonVariant);
      const icon = asTrimmedString(c && c.icon);
      const cardTitle = asTrimmedString(c && c.title);
      const desc = asTrimmedString(c && c.desc);
      const meta1 = parseIconTextPair(c && c.meta1);
      const meta2 = parseIconTextPair(c && c.meta2);
      const meta = [meta1, meta2].filter(Boolean);
      if (!cardTitle) return null;
      const out = { icon, title: cardTitle, desc, meta };
      if (ribbonText) out.ribbon = { text: ribbonText, variant: ribbonVariant };
      return out;
    })
    .filter(Boolean)
    .slice(0, 30);

  if (number.length > 10) return res.redirect('/admin?page=certifications&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=certifications&error=Title+is+required');
  if (title.length > 60) return res.redirect('/admin?page=certifications&error=Title+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=certifications&error=Missing+site.json');

  const next = Object.assign({}, site.certifications);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.cards = cards;

  site.certifications = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=certifications&saved=1');
});

app.post('/admin/blog', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=blog&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);
  const subtitle = asTrimmedString(req.body.subtitle);

  const posts = normalizeArray(req.body.posts)
    .map((p) => {
      const icon = asTrimmedString(p && p.icon);
      const category = asTrimmedString(p && p.category);
      const date = asTrimmedString(p && p.date);
      const postTitle = asTrimmedString(p && p.title);
      const excerpt = asTrimmedString(p && p.excerpt);
      const href = asTrimmedString(p && p.href);
      if (!postTitle) return null;
      return { icon, category, date, title: postTitle, excerpt, href };
    })
    .filter(Boolean)
    .slice(0, 30);

  if (number.length > 10) return res.redirect('/admin?page=blog&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=blog&error=Title+is+required');
  if (title.length > 60) return res.redirect('/admin?page=blog&error=Title+too+long');
  if (subtitle.length > 160) return res.redirect('/admin?page=blog&error=Subtitle+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=blog&error=Missing+site.json');

  const next = Object.assign({}, site.blog);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.subtitle = subtitle;
  next.posts = posts;

  site.blog = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=blog&saved=1');
});

app.post('/admin/github', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=github&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);
  const username = asTrimmedString(req.body.username);
  const tagline = asTrimmedString(req.body.tagline);
  const profileUrl = asTrimmedString(req.body.profileUrl);

  const stats = normalizeArray(req.body.stats)
    .map((s) => {
      const icon = asTrimmedString(s && s.icon);
      const value = asTrimmedString(s && s.value);
      const label = asTrimmedString(s && s.label);
      if (!label) return null;
      return { icon, value, label };
    })
    .filter(Boolean)
    .slice(0, 10);

  const pinned = normalizeArray(req.body.pinned)
    .map((r) => {
      const href = asTrimmedString(r && r.href);
      const icon = asTrimmedString(r && r.icon);
      const name = asTrimmedString(r && r.name);
      const desc = asTrimmedString(r && r.desc);
      const stars = asTrimmedString(r && r.stars);
      const langName = asTrimmedString(r && r.langName);
      const langClass = asTrimmedString(r && r.langClass);
      if (!name) return null;
      return {
        href,
        icon,
        name,
        desc,
        lang: { name: langName, class: langClass },
        stars,
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  if (number.length > 10) return res.redirect('/admin?page=github&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=github&error=Title+is+required');
  if (title.length > 60) return res.redirect('/admin?page=github&error=Title+too+long');
  if (username.length > 40) return res.redirect('/admin?page=github&error=Username+too+long');
  if (tagline.length > 120) return res.redirect('/admin?page=github&error=Tagline+too+long');
  if (profileUrl.length > 240) return res.redirect('/admin?page=github&error=Profile+URL+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=github&error=Missing+site.json');

  const next = Object.assign({}, site.github);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.username = username;
  next.tagline = tagline;
  next.profileUrl = profileUrl;
  next.stats = stats;
  next.pinned = pinned;

  site.github = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=github&saved=1');
});

app.post('/admin/contact', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=contact&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const number = asTrimmedString(req.body.number);
  const title = asTrimmedString(req.body.title);
  const description = asTrimmedString(req.body.description);

  const details = normalizeArray(req.body.details)
    .map((d) => {
      const icon = asTrimmedString(d && d.icon);
      const label = asTrimmedString(d && d.label);
      const value = asTrimmedString(d && d.value);
      const href = asTrimmedString(d && d.href);
      if (!label || !value) return null;
      return { icon, label, value, href };
    })
    .filter(Boolean)
    .slice(0, 12);

  const socials = normalizeArray(req.body.socials)
    .map((s) => {
      const href = asTrimmedString(s && s.href);
      const label = asTrimmedString(s && s.label);
      const icon = asTrimmedString(s && s.icon);
      if (!href || !label) return null;
      return { href, label, icon };
    })
    .filter(Boolean)
    .slice(0, 12);

  const form = req.body.form && typeof req.body.form === 'object' ? req.body.form : {};
  const nameLabel = asTrimmedString(form.nameLabel);
  const emailLabel = asTrimmedString(form.emailLabel);
  const subjectLabel = asTrimmedString(form.subjectLabel);
  const messageLabel = asTrimmedString(form.messageLabel);
  const buttonLabel = asTrimmedString(form.buttonLabel);

  if (number.length > 10) return res.redirect('/admin?page=contact&error=Number+too+long');
  if (!title) return res.redirect('/admin?page=contact&error=Title+is+required');
  if (title.length > 60) return res.redirect('/admin?page=contact&error=Title+too+long');
  if (description.length > 500) return res.redirect('/admin?page=contact&error=Description+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=contact&error=Missing+site.json');

  const next = Object.assign({}, site.contact);
  next.enabled = enabled;
  next.number = number;
  next.title = title;
  next.description = description;
  next.details = details;
  next.socials = socials;
  next.form = { nameLabel, emailLabel, subjectLabel, messageLabel, buttonLabel };

  site.contact = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=contact&saved=1');
});

app.post('/admin/footer', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?page=footer&error=Invalid+session');

  const enabled = parseEnabled(req.body.enabled);
  const logoText = asTrimmedString(req.body.logoText);
  const line1 = asTrimmedString(req.body.line1);

  const links = normalizeArray(req.body.links)
    .map((l) => {
      const href = asTrimmedString(l && l.href);
      const icon = asTrimmedString(l && l.icon);
      const label = asTrimmedString(l && l.label);
      if (!href || !label) return null;
      return { href, icon, label };
    })
    .filter(Boolean)
    .slice(0, 12);

  if (!logoText) return res.redirect('/admin?page=footer&error=Logo+text+is+required');
  if (logoText.length > 80) return res.redirect('/admin?page=footer&error=Logo+text+too+long');
  if (line1.length > 120) return res.redirect('/admin?page=footer&error=Line+too+long');

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?page=footer&error=Missing+site.json');

  const next = Object.assign({}, site.footer);
  next.enabled = enabled;
  next.logoText = logoText;
  next.line1 = line1;
  next.links = links;

  site.footer = next;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect('/admin?page=footer&saved=1');
});

app.post('/admin/section/:id', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?error=Invalid+session');

  const sectionId = String(req.params.id || '');
  if (!EDITABLE_SECTIONS.has(sectionId)) return res.redirect('/admin?error=Unknown+section');

  const raw = String(req.body.sectionJson || '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return res.redirect(`/admin?page=${encodeURIComponent(sectionId)}&error=Invalid+JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return res.redirect(`/admin?page=${encodeURIComponent(sectionId)}&error=Section+must+be+an+object`);
  }

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site || typeof site !== 'object') return res.redirect('/admin?error=Missing+site.json');

  const enabled = parseEnabled(req.body.enabled);

  if (
    sectionId !== 'meta' &&
    sectionId !== 'nav'
  ) {
    parsed.enabled = enabled;
  }

  site[sectionId] = parsed;
  await writeJsonAtomic(SITE_JSON_PATH, site);
  return res.redirect(`/admin?page=${encodeURIComponent(sectionId)}&saved=1`);
});

app.post('/admin/site', requireAuth, async (req, res) => {
  if (!assertCsrf(req)) return res.redirect('/admin?error=Invalid+session');

  const raw = String(req.body.siteJson || '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return res.redirect('/admin?error=Invalid+JSON');
  }

  if (!parsed || typeof parsed !== 'object') return res.redirect('/admin?error=Invalid+JSON');
  if (!parsed.meta || !parsed.hero || !parsed.about) return res.redirect('/admin?error=Missing+required+fields');

  await writeJsonAtomic(SITE_JSON_PATH, parsed);
  return res.redirect('/admin?page=raw&saved=1');
});

// ---- API: contact (SMTP) ----
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

app.post('/api/contact', contactLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  }
  if (name.length > 80 || email.length > 160 || subject.length > 140 || message.length > 4000) {
    return res.status(400).json({ ok: false, error: 'Input too long.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email.' });
  }

  const submissionId = crypto.randomBytes(10).toString('hex');
  const createdAt = new Date().toISOString();
  await appendSubmission({
    id: submissionId,
    createdAt,
    name,
    email,
    subject,
    message,
    status: 'received',
  });

  const transport = buildMailer();
  if (!transport) {
    await patchSubmission(submissionId, { status: 'email_not_configured' });
    return res.status(500).json({ ok: false, error: 'Email is not configured.' });
  }

  let to;
  let from;
  try {
    to = requireEnv('CONTACT_TO');
    from = requireEnv('SMTP_FROM');
  } catch (e) {
    await patchSubmission(submissionId, { status: 'email_not_configured' });
    return res.status(500).json({ ok: false, error: String(e.message || 'Email is not configured.') });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replaceAll('\n', '<br/>');

  try {
    await transport.sendMail({
      to,
      from,
      replyTo: `${name} <${email}>`,
      subject: `Portfolio Contact: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>New Portfolio Contact</h2>
          <p><b>Name:</b> ${safeName}</p>
          <p><b>Email:</b> ${safeEmail}</p>
          <p><b>Subject:</b> ${safeSubject}</p>
          <p><b>Message:</b><br/>${safeMessage}</p>
        </div>
      `,
    });
    await patchSubmission(submissionId, { status: 'sent' });
    return res.json({ ok: true });
  } catch (err) {
    await patchSubmission(submissionId, { status: 'send_failed' });
    return res.status(500).json({ ok: false, error: 'Failed to send email.' });
  }
});

// ---- startup checks ----
(async function start() {
  await ensureDir(DATA_DIR);

  if (IS_PROD && !process.env.SESSION_SECRET) {
    // eslint-disable-next-line no-console
    console.error('Missing SESSION_SECRET in production.');
    process.exit(1);
  }

  const site = await readJson(SITE_JSON_PATH, null);
  if (!site) {
    // eslint-disable-next-line no-console
    console.error('Missing data/site.json. Create it before starting the server.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${PORT}`);
  });
})();
