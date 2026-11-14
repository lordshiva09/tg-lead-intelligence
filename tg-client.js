/**
 * Telegram MTProto Client Helper
 * Uses GramJS (telegram package) to search public channels/groups/users and extract bio.
 * Direct MTProto Auth Methods (sendCode + Api.auth.SignIn)
 * 
 * Features:
 * 1. Targeted Sub-Query Generator (e.g. 'DmplayA' -> 'DmplayA', 'Dmplay_A', 'Dmplay A', 'Dmplay Aru', etc.)
 * 2. Prefix & Suffix Expansion (e.g. 'Admplay' -> 'Admplay', 'A Dmplay', 'A_Dmplay')
 * 3. Strict Relevance Filter (Ensures only exact matching handles/bios are returned, no unrelated agents)
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
  if (process.env.TG_SESSION && process.env.TG_SESSION.trim()) {
    return process.env.TG_SESSION.trim();
  }
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
 * Intelligent Query Generator for prefix/suffix patterns
 * 
 * Case 1: 'DmplayA' -> user wants accounts starting with/containing 'dmplay' + 'a...'
 *   Generates: ['DmplayA', 'Dmplay_A', 'Dmplay A', 'dmplay a']
 * 
 * Case 2: 'Admplay' -> user wants accounts starting with 'A' and containing 'dmplay' (like AjuDmplay, ALLI_DmPlay)
 *   Generates: ['Admplay', 'A Dmplay', 'A_Dmplay', 'Aju Dmplay']
 * 
 * Case 3: Standard single words ('agent', 'teacher') -> expands to related terms
 */
function generateKeywordVariants(query) {
  const q = query.trim();
  const qLower = q.toLowerCase();
  const variants = [q];

  // Pattern A: Root + Letter/Suffix (e.g. 'dmplaya', 'dmplayj', 'dmwinb')
  const rootSuffixMatch = qLower.match(/^(dmplay|dmwin|yaarwin|dmfirst|tiranga|6eclub|91club)([a-z0-9_]+)$/i);
  if (rootSuffixMatch) {
    const root = rootSuffixMatch[1];
    const suffix = rootSuffixMatch[2];
    variants.push(
      `${root}${suffix}`,
      `${root}_${suffix}`,
      `${root} ${suffix}`,
      `${suffix}_${root}`,
      `${suffix} ${root}`
    );
    return [...new Set(variants)];
  }

  // Pattern B: Prefix Letter + Root (e.g. 'admplay', 'tdmplay', 'jdmplay')
  const prefixRootMatch = qLower.match(/^([a-z0-9_]+)(dmplay|dmwin|yaarwin|dmfirst|tiranga|6eclub|91club)$/i);
  if (prefixRootMatch) {
    const prefix = prefixRootMatch[1];
    const root = prefixRootMatch[2];
    variants.push(
      `${prefix}${root}`,
      `${prefix} ${root}`,
      `${prefix}_${root}`,
      `${root}_${prefix}`,
      `${root} ${prefix}`
    );
    return [...new Set(variants)];
  }

  // Pattern C: General keywords
  if (qLower === 'agent') {
    variants.push('agents', 'agent recruiter', 'agent team', 'dmwin agent', 'yaarwin agent', 'vip agent', 'super agent');
  } else if (qLower === 'teacher') {
    variants.push('teachers', 'mentor', 'teacher prediction', 'dmwin teacher', 'vip teacher');
  } else if (qLower === 'prediction') {
    variants.push('vip prediction', 'prediction channel', 'wingo prediction', 'lottery prediction', 'signals');
  }

  return [...new Set(variants)].slice(0, 5);
}

/**
 * Precision Relevance Filter
 * Checks if a profile truly belongs to the user's intended search.
 * Filters out completely unrelated agents/channels that Telegram randomly spits out.
 */
function isProfileRelevant(profile, originalQuery) {
  const qNorm = originalQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!qNorm) return true;

  const usernameNorm = (profile.username || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameNorm = (profile.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const bioNorm = (profile.bio || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Direct substring match in username, name, or bio
  if (usernameNorm.includes(qNorm) || nameNorm.includes(qNorm) || bioNorm.includes(qNorm)) {
    return true;
  }

  // 2. Check prefix letter + root pattern (e.g. q = 'admplay', username = 'ajudmplay' or 'allidmplay')
  const prefixRootMatch = qNorm.match(/^([a-z0-9])(dmplay|dmwin|yaarwin|tiranga|6eclub|91club)$/);
  if (prefixRootMatch) {
    const prefix = prefixRootMatch[1];
    const root = prefixRootMatch[2];
    // Must start with prefix AND contain root
    if (usernameNorm.startsWith(prefix) && usernameNorm.includes(root)) return true;
    if (nameNorm.startsWith(prefix) && nameNorm.includes(root)) return true;
    if (usernameNorm.includes(root) && usernameNorm.includes(prefix)) return true;
  }

  // 3. Check root + suffix pattern (e.g. q = 'dmplaya', username = 'dmplayaru' or 'dmplayalina')
  const rootSuffixMatch = qNorm.match(/^(dmplay|dmwin|yaarwin|tiranga|6eclub|91club)([a-z0-9])$/);
  if (rootSuffixMatch) {
    const root = rootSuffixMatch[1];
    const suffix = rootSuffixMatch[2];
    if (usernameNorm.includes(root + suffix) || nameNorm.includes(root + suffix) || bioNorm.includes(root + suffix)) {
      return true;
    }
    if (usernameNorm.startsWith(suffix) && usernameNorm.includes(root)) return true;
  }

  // 4. If query is a general keyword ('agent', 'teacher', etc.), check if word is in bio or name
  if (['agent', 'teacher', 'prediction', 'signals', 'salary'].includes(qNorm)) {
    const rawBio = (profile.bio || '').toLowerCase();
    const rawName = (profile.name || '').toLowerCase();
    return rawBio.includes(qNorm) || rawName.includes(qNorm) || usernameNorm.includes(qNorm);
  }

  return false;
}

// Search Telegram with query expansion + relevance filtering
async function searchTelegram(query, limit = 50) {
  if (!client || !isConnected) {
    throw new Error('Telegram client is not authorized. Please connect with your Telegram account first.');
  }

  const leadsMap = new Map();
  const variants = generateKeywordVariants(query);

  for (const variant of variants) {
    try {
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
            // Bio fallback
          }

          const candidate = {
            id: `tg_user_${u.id}`,
            username: username || `id_${u.id}`,
            name: fullName,
            avatar: username ? `https://t.me/i/userpic/320/${username}.jpg` : 'assets/default_avatar.svg',
            bio: bio,
            extra: `@${username || u.id}`,
            type: u.bot ? 'BOT' : 'USER',
            url: username ? `https://t.me/${username}` : `tg://user?id=${u.id}`,
            fetchedAt: new Date().toISOString()
          };

          // Apply precision relevance check
          if (isProfileRelevant(candidate, query)) {
            leadsMap.set(key, candidate);
          }
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
            // Bio fallback
          }

          const candidate = {
            id: `tg_chat_${c.id}`,
            username: username || `chat_${c.id}`,
            name: title,
            avatar: username ? `https://t.me/i/userpic/320/${username}.jpg` : 'assets/default_avatar.svg',
            bio: bio,
            extra: `${c.participantsCount ? c.participantsCount + ' members' : (username ? '@' + username : '')}`,
            type,
            url: username ? `https://t.me/${username}` : '',
            fetchedAt: new Date().toISOString()
          };

          // Apply precision relevance check
          if (isProfileRelevant(candidate, query)) {
            leadsMap.set(key, candidate);
          }
        }
      }
    } catch (err) {
      console.warn(`Query variant "${variant}" notice:`, err.message);
    }
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
