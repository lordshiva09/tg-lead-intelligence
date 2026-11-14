/**
 * Telegram MTProto Client Helper
 * Uses GramJS (telegram package) to search public channels/groups/users and extract bio.
 * Direct MTProto Auth Methods (sendCode + Api.auth.SignIn)
 * 
 * Includes:
 * 1. Deep Query Decomposition (Prefix/Suffix stemmer: e.g. 'tdmplay' -> 'tdmplay', 'dmplay', 'teacher dmplay', 'agent dmplay', 'csr dmplay', etc.)
 * 2. Multi-pattern Expansion (TinaDmplay, teacherdmplay, TaradmplayCSR, Dmplay_agent, etc.)
 * 3. contacts.Search across all variants with deduplication
 * 4. messages.SearchGlobal across public groups/channels for bios/posts
 */
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('node:fs');
const path = require('node:path');

const API_ID = 35214728;
const API_HASH = '1c6cabbf505e62c4c0bdb1ca1f199213';
const SESSION_FILE = path.join(__dirname, 'data', 'tg_session.txt');

let client = null;
let isConnected = false;
let loginState = {
  status: 'idle',
  phone: '',
  phoneCodeHash: '',
  error: null
};

function getSavedSession() {
  // 1. Check environment variable first (Ideal for Render / cloud deployments)
  if (process.env.TG_SESSION && process.env.TG_SESSION.trim()) {
    return process.env.TG_SESSION.trim();
  }
  // 2. Check local session file
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return fs.readFileSync(SESSION_FILE, 'utf8').trim();
    }
  } catch (e) {
    console.error('Error reading session file:', e.message);
  }
  return '';
}

function saveSession(sessionStr) {
  try {
    const dir = path.dirname(SESSION_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSION_FILE, sessionStr, 'utf8');
  } catch (e) {
    console.error('Error saving session file:', e.message);
  }
}

async function initClient() {
  const sessionStr = getSavedSession();
  const session = new StringSession(sessionStr);

  client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
    useWSS: false
  });

  try {
    await client.connect();
    const authorized = await client.isUserAuthorized();
    if (authorized) {
      isConnected = true;
      loginState.status = 'authenticated';
      console.log('✅ Telegram MTProto Client connected & authorized with saved session!');
    } else {
      console.log('⚠️ Telegram MTProto Client connected, waiting for authentication.');
    }
  } catch (err) {
    console.error('Telegram MTProto connect error:', err.message);
  }
}

// 1. Send OTP code to Telegram / SMS
async function sendAuthCode(phone) {
  if (!client) await initClient();
  if (!phone) throw new Error('Phone number is required');

  loginState.phone = phone.trim();
  loginState.error = null;

  try {
    const res = await client.sendCode(
      {
        apiId: API_ID,
        apiHash: API_HASH
      },
      loginState.phone
    );

    loginState.phoneCodeHash = res.phoneCodeHash;
    loginState.status = 'code_sent';
    return { ok: true, message: 'OTP sent to your Telegram app/SMS' };
  } catch (err) {
    loginState.error = err.message;
    loginState.status = 'error';
    throw err;
  }
}

// 2. Verify OTP directly via MTProto invoke
async function verifyAuthCode(code, password = '') {
  if (!client) throw new Error('Client not initialized');
  if (!loginState.phoneCodeHash) throw new Error('Please request code first');

  try {
    let result;
    try {
      result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: loginState.phone,
          phoneCodeHash: loginState.phoneCodeHash,
          phoneCode: String(code).trim()
        })
      );
    } catch (err) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        if (!password) {
          throw new Error('2FA_PASSWORD_REQUIRED');
        }
        result = await client.signInWithPassword(
          {
            apiId: API_ID,
            apiHash: API_HASH
          },
          {
            password: async () => password,
            onError: (e) => { throw e; }
          }
        );
      } else {
        throw err;
      }
    }

    const sessionStr = client.session.save();
    saveSession(sessionStr);
    isConnected = true;
    loginState.status = 'authenticated';
    loginState.error = null;
    return { ok: true, message: 'Successfully logged in to Telegram!' };
  } catch (err) {
    loginState.error = err.message;
    throw err;
  }
}

function getAuthStatus() {
  return {
    isConnected,
    status: loginState.status,
    phone: loginState.phone ? loginState.phone.slice(-4).padStart(loginState.phone.length, '*') : '',
    error: loginState.error
  };
}

/**
 * Intelligent Query Decomposer & Family Expander
 * Handles queries like 'tdmplay' by stripping prefixes ('t', 'dm') and finding root ('dmplay', 'play')
 * Generates combinations like:
 * - 'tdmplay'
 * - 'dmplay'
 * - 'teacher dmplay' (teacherdmplay)
 * - 'tina dmplay' (TinaDmplay)
 * - 'tara dmplay' (TaradmplayCSR)
 * - 'agent dmplay'
 * - 'csr dmplay'
 * - 'dmplay csr'
 * - 'support dmplay'
 * - 'official dmplay'
 */
function generateKeywordVariants(query) {
  const q = query.trim().toLowerCase();
  const variants = [q];

  // Common root extraction (e.g. 'tdmplay' -> 'dmplay')
  let root = q;
  if (/^[a-z](dmplay|dmwin|yaarwin|tiranga|6eclub|91club)/i.test(q)) {
    root = q.slice(1); // 'tdmplay' -> 'dmplay'
    variants.push(root);
  } else if (/^(teacher|tina|tara|agent|csr|vip|official)(.*)/i.test(q)) {
    const m = q.match(/^(teacher|tina|tara|agent|csr|vip|official)(.*)/i);
    if (m && m[2] && m[2].length >= 3) {
      root = m[2];
      variants.push(root);
    }
  }

  // Common gaming platform stems
  const platformKeywords = ['dmplay', 'dmwin', 'yaarwin', 'dmfirst', 'tiranga', '6eclub', '91club', 'jaldiwin', 'okwin'];
  const matchedPlat = platformKeywords.find(p => q.includes(p) || p.includes(q));
  if (matchedPlat) {
    root = matchedPlat;
    variants.push(root);
  }

  // Cross-combinations with prefixes and suffixes for this family
  if (root.length >= 3) {
    variants.push(
      `teacher ${root}`,
      `agent ${root}`,
      `csr ${root}`,
      `${root} csr`,
      `support ${root}`,
      `official ${root}`,
      `tina ${root}`,
      `tara ${root}`,
      `${root} teacher`,
      `${root} agent`
    );
  }

  if (q === 'agent') {
    variants.push('agents', 'agent recruiter', 'agent team', 'dmwin agent', 'yaarwin agent', 'vip agent', 'super agent');
  } else if (q === 'teacher') {
    variants.push('teachers', 'mentor', 'teacher prediction', 'dmwin teacher', 'vip teacher');
  } else if (q === 'prediction') {
    variants.push('vip prediction', 'prediction channel', 'wingo prediction', 'lottery prediction', 'signals');
  }

  return [...new Set(variants)].slice(0, 8); // Top 8 variants
}

// Search Telegram with query expansion + root variations + global messages
async function searchTelegram(query, limit = 60) {
  if (!client || !isConnected) {
    throw new Error('Telegram client is not authorized. Please connect with your Telegram account first.');
  }

  const leadsMap = new Map();
  const variants = generateKeywordVariants(query);

  for (const variant of variants) {
    try {
      // 1. contacts.Search API
      const result = await client.invoke(
        new Api.contacts.Search({
          q: variant,
          limit: Math.min(limit, 100)
        })
      );

      // Process Users
      if (result.users && result.users.length) {
        for (const u of result.users) {
          if (u.deleted) continue;
          const key = u.username ? u.username.toLowerCase() : `id_${u.id}`;
          if (leadsMap.has(key)) continue;

          const username = u.username || '';
          const firstName = u.firstName || '';
          const lastName = u.lastName || '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ') || username || `User_${u.id}`;

          let bio = '';
          try {
            const fullUser = await client.invoke(new Api.users.GetFullUser({ id: u.id }));
            bio = fullUser?.fullUser?.about || fullUser?.about || '';
          } catch (e) {
            // Bio fetch fallback
          }

          leadsMap.set(key, {
            id: `tg_user_${u.id}`,
            username: username || `id_${u.id}`,
            name: fullName,
            avatar: username ? `https://t.me/i/userpic/320/${username}.jpg` : 'assets/default_avatar.svg',
            bio: bio,
            extra: `@${username || u.id}`,
            type: u.bot ? 'BOT' : 'USER',
            url: username ? `https://t.me/${username}` : `tg://user?id=${u.id}`,
            fetchedAt: new Date().toISOString()
          });
        }
      }

      // Process Chats / Channels
      if (result.chats && result.chats.length) {
        for (const c of result.chats) {
          const key = c.username ? c.username.toLowerCase() : `chat_${c.id}`;
          if (leadsMap.has(key)) continue;

          const username = c.username || '';
          const title = c.title || username || `Chat_${c.id}`;
          let type = 'GROUP';
          if (c.broadcast) type = 'CHANNEL';

          let bio = '';
          try {
            if (c.broadcast || c.megagroup) {
              const fullChannel = await client.invoke(new Api.channels.GetFullChannel({ channel: c.id }));
              bio = fullChannel?.fullChat?.about || fullChannel?.about || '';
            }
          } catch (e) {
            // Fallback
          }

          leadsMap.set(key, {
            id: `tg_chat_${c.id}`,
            username: username || `chat_${c.id}`,
            name: title,
            avatar: username ? `https://t.me/i/userpic/320/${username}.jpg` : 'assets/default_avatar.svg',
            bio: bio,
            extra: `${c.participantsCount ? c.participantsCount + ' members' : (username ? '@' + username : '')}`,
            type,
            url: username ? `https://t.me/${username}` : '',
            fetchedAt: new Date().toISOString()
          });
        }
      }

      if (leadsMap.size >= limit * 1.5) break;
    } catch (err) {
      console.warn(`Query variant "${variant}" failed:`, err.message);
    }
  }

  // 2. SearchGlobal across public groups/channels
  try {
    const rootSearch = variants[1] || query;
    const msgRes = await client.invoke(
      new Api.messages.SearchGlobal({
        q: rootSearch,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
        limit: 25
      })
    );

    if (msgRes.users && msgRes.users.length) {
      for (const u of msgRes.users) {
        if (u.deleted) continue;
        const key = u.username ? u.username.toLowerCase() : `id_${u.id}`;
        if (leadsMap.has(key)) continue;

        const username = u.username || '';
        const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || username || `User_${u.id}`;

        let bio = '';
        try {
          const fullUser = await client.invoke(new Api.users.GetFullUser({ id: u.id }));
          bio = fullUser?.fullUser?.about || fullUser?.about || '';
        } catch (e) {}

        leadsMap.set(key, {
          id: `tg_user_${u.id}`,
          username: username || `id_${u.id}`,
          name: fullName,
          avatar: username ? `https://t.me/i/userpic/320/${username}.jpg` : 'assets/default_avatar.svg',
          bio: bio,
          extra: `@${username || u.id}`,
          type: u.bot ? 'BOT' : 'USER',
          url: username ? `https://t.me/${username}` : `tg://user?id=${u.id}`,
          fetchedAt: new Date().toISOString()
        });
      }
    }
  } catch (e) {
    console.warn('messages.SearchGlobal fallback notice:', e.message);
  }

  return Array.from(leadsMap.values());
}

module.exports = {
  initClient,
  sendAuthCode,
  verifyAuthCode,
  getAuthStatus,
  searchTelegram,
  API_ID,
  API_HASH
};
