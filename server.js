const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { calculateLeadScore } = require('./scoring.js');
const tgClient = require('./tg-client.js');

const PORT = process.env.PORT || 3030;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'leads.json');

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function loadLeads() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch (e) {
    console.error('Failed to load leads:', e.message);
    return [];
  }
}

function saveLeads(leads) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to save leads:', e.message);
    return false;
  }
}

async function scrapeTelegramProfile(rawUsername) {
  const clean = rawUsername.replace(/^@+/, '').replace(/^https?:\/\/(?:t\.me|telegram\.me)\//i, '').replace(/[/?#].*$/, '').trim();
  if (!clean) {
    throw new Error('Invalid Telegram username');
  }

  const tgUrl = `https://t.me/${clean}`;
  let html = '';
  let status = 200;

  try {
    const res = await fetch(tgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    status = res.status;
    html = await res.text();
  } catch (err) {
    console.warn(`Scrape network error for @${clean}:`, err.message);
  }

  // Parse HTML OpenGraph & page elements
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
  const extraMatch = html.match(/class="tgme_page_extra">([^<]+)</);

  // Fallback checks for page_description div
  const divDescMatch = html.match(/class="tgme_page_description[^"]*">([\s\S]*?)<\/div>/);
  let pageDesc = descMatch ? descMatch[1] : (divDescMatch ? divDescMatch[1].replace(/<[^>]+>/g, '').trim() : '');

  // Decode common HTML entities
  pageDesc = pageDesc
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  let name = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : clean;
  let avatar = imageMatch ? imageMatch[1] : '';
  let extra = extraMatch ? extraMatch[1].trim() : `@${clean}`;

  // Type classification
  let type = 'USER';
  if (/channel/i.test(html) || /subscribers/i.test(extra)) {
    type = 'CHANNEL';
  } else if (/group/i.test(html) || /members/i.test(extra)) {
    type = 'GROUP';
  } else if (/bot$/i.test(clean)) {
    type = 'BOT';
  }

  return {
    username: clean,
    name: name || clean,
    avatar: avatar || 'assets/default_avatar.svg',
    bio: pageDesc || '',
    extra: extra || `@${clean}`,
    type,
    url: tgUrl,
    fetchedAt: new Date().toISOString()
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. API: Telegram Auth Status
  if (pathname === '/api/tg-status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tgClient.getAuthStatus()));
    return;
  }

  // 2. API: Send Telegram Auth Code
  if (pathname === '/api/tg-send-code' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const phone = payload.phone;
        const result = await tgClient.sendAuthCode(phone);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 3. API: Verify Telegram Auth Code
  if (pathname === '/api/tg-verify-code' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const code = payload.code;
        const password = payload.password || '';
        const result = await tgClient.verifyAuthCode(code, password);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 4. API: Telegram Bulk Keyword Search
  if (pathname === '/api/tg-bulk-search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        let keywords = payload.keywords;
        if (typeof keywords === 'string') {
          keywords = keywords.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (!Array.isArray(keywords) || keywords.length === 0) {
          keywords = ['agent', 'teacher', 'dmwin', 'yaarwin', 'vip prediction'];
        }

        const limit = Number(payload.limit) || 30;
        const allLeadsMap = new Map();

        for (const kw of keywords) {
          try {
            console.log(`[TG Search] Querying keyword: "${kw}"...`);
            const rawResults = await tgClient.searchTelegram(kw, limit);
            for (const item of rawResults) {
              const key = item.username || item.id;
              if (!allLeadsMap.has(key)) {
                // Score the lead with scoring engine passing keywords
                const scores = calculateLeadScore(item, keywords);
                allLeadsMap.set(key, {
                  ...item,
                  matchedKeyword: kw,
                  scores,
                  matches: scores.matches,
                  highlightedTokens: scores.highlightedTokens
                });
              }
            }
          } catch (e) {
            console.error(`Error querying keyword "${kw}":`, e.message);
          }
        }

        const scoredLeads = Array.from(allLeadsMap.values());
        // Sort by quality score descending
        scoredLeads.sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          count: scoredLeads.length,
          leads: scoredLeads
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 5. API: Analyze single username
  if (pathname === '/api/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const rawUsername = payload.username;
        if (!rawUsername) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Username is required' }));
          return;
        }

        const profile = await scrapeTelegramProfile(rawUsername);
        if (payload.customBio !== undefined && payload.customBio !== null) {
          profile.bio = String(payload.customBio).trim();
        }

        const scores = calculateLeadScore(profile);
        const result = {
          ...profile,
          scores,
          matches: scores.matches,
          highlightedTokens: scores.highlightedTokens
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, lead: result }));
      } catch (err) {
        console.error('Analyze error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Failed to analyze lead' }));
      }
    });
    return;
  }

  // 6. API: Save Lead
  if (pathname === '/api/save-lead' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const lead = JSON.parse(body || '{}');
        if (!lead || (!lead.username && !lead.id)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid lead payload' }));
          return;
        }

        const leads = loadLeads();
        const existingIdx = leads.findIndex(l => (l.username && lead.username && l.username.toLowerCase() === lead.username.toLowerCase()) || (l.id && lead.id && l.id === lead.id));
        lead.id = lead.id || `lead_${lead.username ? lead.username.toLowerCase() : Date.now()}`;
        lead.updatedAt = new Date().toISOString();

        if (existingIdx >= 0) {
          leads[existingIdx] = { ...leads[existingIdx], ...lead };
        } else {
          lead.createdAt = new Date().toISOString();
          leads.unshift(lead);
        }

        saveLeads(leads);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, lead }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 7. API: Save Multiple Leads in Bulk
  if (pathname === '/api/save-leads-bulk' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const incoming = Array.isArray(payload.leads) ? payload.leads : [];
        const leads = loadLeads();
        let addedCount = 0;

        for (const lead of incoming) {
          if (!lead.username && !lead.id) continue;
          const existingIdx = leads.findIndex(l => (l.username && lead.username && l.username.toLowerCase() === lead.username.toLowerCase()) || (l.id && lead.id && l.id === lead.id));
          lead.id = lead.id || `lead_${lead.username ? lead.username.toLowerCase() : Date.now()}`;
          lead.updatedAt = new Date().toISOString();

          if (existingIdx >= 0) {
            leads[existingIdx] = { ...leads[existingIdx], ...lead };
          } else {
            lead.createdAt = new Date().toISOString();
            leads.unshift(lead);
            addedCount++;
          }
        }

        saveLeads(leads);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: leads.length, added: addedCount }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 8. API: Get Leads
  if (pathname === '/api/leads' && req.method === 'GET') {
    const leads = loadLeads();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, leads, count: leads.length }));
    return;
  }

  // 9. API: Delete Lead
  if (pathname.startsWith('/api/leads/') && req.method === 'DELETE') {
    const id = pathname.replace('/api/leads/', '');
    let leads = loadLeads();
    leads = leads.filter(l => l.id !== id && (!l.username || l.username.toLowerCase() !== id.toLowerCase()));
    saveLeads(leads);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, deleted: id }));
    return;
  }

  // 10. API: Export CSV
  if (pathname === '/api/export-csv' && req.method === 'GET') {
    const leads = loadLeads();
    const headers = ['Username', 'Display Name', 'Score', 'Rating', 'Type', 'Matches', 'Bio', 'Telegram Link', 'Date'];
    const rows = leads.map(l => [
      `"${l.username || ''}"`,
      `"${(l.name || '').replace(/"/g, '""')}"`,
      l.scores?.total || 0,
      `"${l.scores?.level || ''}"`,
      `"${l.type || 'USER'}"`,
      `"${(l.matches || []).join(', ')}"`,
      `"${(l.bio || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
      `"${l.url || 'https://t.me/' + (l.username || '')}"`,
      `"${l.createdAt || ''}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="telegram_leads_report.csv"'
    });
    res.end(csv);
    return;
  }

  // 11. API: Proxy avatar image
  if (pathname === '/api/proxy-avatar' && req.method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl || !targetUrl.startsWith('http')) {
      res.writeHead(400);
      res.end('Missing or invalid url parameter');
      return;
    }
    try {
      const imgRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const ct = imgRes.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await imgRes.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(buf);
    } catch (e) {
      res.writeHead(502);
      res.end('Proxy error: ' + e.message);
    }
    return;
  }

  // Static file serving
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, reqPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Initialize Telegram MTProto Client in background on startup
tgClient.initClient().catch(err => {
  console.warn('[Telegram MTProto] Initial auto-connect info:', err.message);
});

server.listen(PORT, () => {
  console.log(`[TG LEAD INTEL] Server running at http://localhost:${PORT}`);
});
