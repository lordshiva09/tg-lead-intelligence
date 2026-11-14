// Telegram Lead Intelligence & Qualifier Client

let currentLead = null;
let savedLeads = [];
let recentScanResults = [];

const defaultAvatar = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2350a2df"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';

// DOM Elements
const scanForm = document.getElementById('scan-form');
const usernameInp = document.getElementById('username-inp');
const scanBtn = document.getElementById('scan-btn');
const clearInpBtn = document.getElementById('clear-inp-btn');
const leadsTbody = document.getElementById('leads-tbody');
const emptyState = document.getElementById('empty-state');
const leadsCounter = document.getElementById('leads-counter');
const tableSearch = document.getElementById('table-search');
const filterLevel = document.getElementById('filter-level');

// Telegram API elements
const tgConnStatus = document.getElementById('tg-connection-status');
const tgAuthSection = document.getElementById('tg-auth-section');
const authStepPhone = document.getElementById('auth-step-phone');
const authStepCode = document.getElementById('auth-step-code');
const tgPhoneInp = document.getElementById('tg-phone-inp');
const tgOtpInp = document.getElementById('tg-otp-inp');
const tgSendCodeBtn = document.getElementById('tg-send-code-btn');
const tgVerifyCodeBtn = document.getElementById('tg-verify-code-btn');
const authStatusMsg = document.getElementById('auth-status-msg');

// Bulk search elements
const bulkSearchForm = document.getElementById('bulk-search-form');
const bulkKeywordsInp = document.getElementById('bulk-keywords-inp');
const clearBulkInpBtn = document.getElementById('clear-bulk-inp-btn');
const bulkSearchBtn = document.getElementById('bulk-search-btn');
const bulkProgressBar = document.getElementById('bulk-progress-bar');
const bulkStatusText = document.getElementById('bulk-status-text');
const saveAllHighBtn = document.getElementById('save-all-high-btn');

// Receipt Modal elements
const openReceiptBtn = document.getElementById('open-receipt-btn');
const receiptUserCount = document.getElementById('receipt-user-count');
const receiptModal = document.getElementById('receipt-modal');
const receiptCloseBtn = document.getElementById('receipt-close-btn');
const receiptBadgeTotal = document.getElementById('receipt-badge-total');
const receiptListContainer = document.getElementById('receipt-list-container');
const copyAllUsernamesBtn = document.getElementById('copy-all-usernames-btn');
const downloadReceiptTxtBtn = document.getElementById('download-receipt-txt-btn');
const downloadReceiptCsvBtn = document.getElementById('download-receipt-csv-btn');

// Modal Elements
const leadModal = document.getElementById('lead-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const cardAvatar = document.getElementById('card-avatar');
const cardHandleHead = document.getElementById('card-handle-head');
const cardTypeBadge = document.getElementById('card-type-badge');
const cardName = document.getElementById('card-name');
const cardHandleSub = document.getElementById('card-handle-sub');
const cardLink = document.getElementById('card-link');
const cardLinkOpen = document.getElementById('card-link-open');
const cardLinkCopy = document.getElementById('card-link-copy');

const cardTotalScore = document.getElementById('card-total-score');
const cardLevelLabel = document.getElementById('card-level-label');
const cardScoreBio = document.getElementById('card-score-bio');
const cardScoreComp = document.getElementById('card-score-comp');
const cardScoreEvi = document.getElementById('card-score-evi');
const cardScoreRel = document.getElementById('card-score-rel');

const cardBioText = document.getElementById('card-bio-text');
const cardMatchesPills = document.getElementById('card-matches-pills');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalChatBtn = document.getElementById('modal-chat-btn');
const toastEl = document.getElementById('toast');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statHigh = document.getElementById('stat-high');
const statAvg = document.getElementById('stat-avg');

// Toast Helper
function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  setTimeout(() => {
    toastEl.style.display = 'none';
  }, duration);
}

// Escape HTML
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Highlight matched keywords in bio text
function formatBioWithHighlights(bioText, highlightedTokens = []) {
  if (!bioText) return '<span style="color:var(--text-faint);font-style:italic;">No public bio provided</span>';

  let safe = esc(bioText);
  const tokens = (highlightedTokens && highlightedTokens.length > 0) ? highlightedTokens : ['agent'];
  const sorted = [...new Set(tokens.map(t => t.toLowerCase()))].sort((a, b) => b.length - a.length);

  const pattern = sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');

  safe = safe.replace(regex, '<span class="kw-highlight">$1</span>');
  return safe;
}

// Check Telegram MTProto auth status
async function checkTgStatus() {
  try {
    const res = await fetch('/api/tg-status');
    const data = await res.json();
    if (data.isConnected) {
      tgConnStatus.textContent = 'ONLINE (Ready)';
      tgConnStatus.className = 'stat-val text-green';
      tgAuthSection.style.display = 'none';
    } else {
      tgConnStatus.textContent = 'LOGIN NEEDED';
      tgConnStatus.className = 'stat-val text-gold';
      tgAuthSection.style.display = 'block';
    }
  } catch (err) {
    tgConnStatus.textContent = 'ERROR';
    tgConnStatus.className = 'stat-val text-red';
  }
}

// Handle Send Phone OTP
tgSendCodeBtn.addEventListener('click', async () => {
  const phone = tgPhoneInp.value.trim();
  if (!phone) {
    showToast('Please enter your phone number with country code (e.g. +91...)');
    return;
  }
  tgSendCodeBtn.disabled = true;
  tgSendCodeBtn.textContent = 'Sending...';
  authStatusMsg.textContent = 'Requesting Telegram OTP code...';
  authStatusMsg.style.color = '#38bdf8';

  try {
    const res = await fetch('/api/tg-send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (data.ok) {
      authStepPhone.style.display = 'none';
      authStepCode.style.display = 'flex';
      authStatusMsg.textContent = '✓ OTP Code sent to your Telegram app/SMS! Please enter below:';
      authStatusMsg.style.color = '#4ade80';
      showToast('OTP code sent successfully!');
    } else {
      throw new Error(data.error || 'Failed to send OTP');
    }
  } catch (err) {
    authStatusMsg.textContent = 'Error: ' + err.message;
    authStatusMsg.style.color = '#f87171';
    tgSendCodeBtn.disabled = false;
    tgSendCodeBtn.textContent = 'Send Code';
  }
});

// Handle Verify OTP
tgVerifyCodeBtn.addEventListener('click', async () => {
  const code = tgOtpInp.value.trim();
  if (!code) {
    showToast('Please enter the OTP code');
    return;
  }
  tgVerifyCodeBtn.disabled = true;
  tgVerifyCodeBtn.textContent = 'Verifying...';
  authStatusMsg.textContent = 'Authorizing with Telegram servers...';
  authStatusMsg.style.color = '#38bdf8';

  try {
    const res = await fetch('/api/tg-verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('✓ Successfully connected Telegram API!');
      authStatusMsg.textContent = '✓ Connected! Global keyword scanner is ready to use.';
      authStatusMsg.style.color = '#4ade80';
      setTimeout(() => {
        checkTgStatus();
      }, 1000);
    } else {
      throw new Error(data.error || 'Invalid code');
    }
  } catch (err) {
    authStatusMsg.textContent = 'Verification error: ' + err.message;
    authStatusMsg.style.color = '#f87171';
    tgVerifyCodeBtn.disabled = false;
    tgVerifyCodeBtn.textContent = 'Verify & Connect';
  }
});

// Bulk Search Form Submit
bulkSearchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const kw = bulkKeywordsInp.value.trim();
  if (!kw) return;

  bulkSearchBtn.disabled = true;
  bulkProgressBar.style.display = 'block';
  bulkStatusText.textContent = `Connecting to Telegram MTProto... Querying: "${kw}"`;

  try {
    const res = await fetch('/api/tg-bulk-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: kw, limit: 40 })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Bulk search failed');

    recentScanResults = data.leads || [];
    showToast(`✓ Found ${recentScanResults.length} Telegram IDs matching "${kw}"!`);
    bulkStatusText.textContent = `Done! Found ${recentScanResults.length} matching profiles for "${kw}".`;

    // Replace current table view with only fresh search results
    savedLeads = recentScanResults;

    renderLeadsTable();
    updateStats();

    if (recentScanResults.some(l => l.scores?.level === 'HIGH')) {
      saveAllHighBtn.style.display = 'inline-flex';
    }
  } catch (err) {
    bulkStatusText.textContent = 'Search error: ' + err.message;
    alert('Bulk Search Error: ' + err.message + '\n\nMake sure your Telegram account is connected in the box above.');
  } finally {
    bulkSearchBtn.disabled = false;
    setTimeout(() => {
      bulkProgressBar.style.display = 'none';
    }, 4000);
  }
});

// Save All High Leads Button
saveAllHighBtn.addEventListener('click', async () => {
  const highLeads = recentScanResults.filter(l => l.scores?.level === 'HIGH');
  if (highLeads.length === 0) {
    showToast('No High leads to save');
    return;
  }
  try {
    const res = await fetch('/api/save-leads-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: highLeads })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`✓ Saved ${highLeads.length} High Quality Leads to CRM!`);
      saveAllHighBtn.style.display = 'none';
      fetchLeads();
    }
  } catch (e) {
    alert('Failed to save bulk leads: ' + e.message);
  }
});

// Preset chips for Bulk Search
document.querySelectorAll('[data-bulk]').forEach(btn => {
  btn.addEventListener('click', () => {
    bulkKeywordsInp.value = btn.dataset.bulk;
    bulkSearchForm.dispatchEvent(new Event('submit'));
  });
});

if (clearBulkInpBtn) {
  clearBulkInpBtn.addEventListener('click', () => {
    bulkKeywordsInp.value = '';
    bulkKeywordsInp.focus();
  });
}

// Render Modal Card
function openLeadModal(lead) {
  currentLead = lead;

  const scores = lead.scores || {
    bioRelevance: 0, maxBioRelevance: 40,
    completeness: 0, maxCompleteness: 25,
    publicEvidence: 0, maxPublicEvidence: 20,
    reliability: 0, maxReliability: 15,
    total: 0, level: 'LOW'
  };

  if (lead.avatar && lead.avatar.startsWith('http')) {
    cardAvatar.src = `/api/proxy-avatar?url=${encodeURIComponent(lead.avatar)}`;
  } else {
    cardAvatar.src = lead.avatar || defaultAvatar;
  }
  cardAvatar.onerror = () => { cardAvatar.src = defaultAvatar; };

  const handle = lead.username ? `@${lead.username}` : (lead.id || '@user');
  cardHandleHead.textContent = handle;
  cardHandleSub.textContent = handle;
  cardTypeBadge.textContent = lead.type || 'USER';
  cardName.textContent = lead.name || lead.username || 'Telegram User';

  const tgUrl = lead.url || `https://t.me/${lead.username}`;
  cardLink.textContent = tgUrl;
  cardLink.href = tgUrl;
  modalChatBtn.href = tgUrl;

  cardTotalScore.textContent = scores.total;
  cardLevelLabel.textContent = `(${scores.level})`;

  cardScoreBio.textContent = `${scores.bioRelevance} / ${scores.maxBioRelevance} pts`;
  cardScoreComp.textContent = `${scores.completeness} / ${scores.maxCompleteness} pts`;
  cardScoreEvi.textContent = `${scores.publicEvidence} / ${scores.maxPublicEvidence} pts`;
  cardScoreRel.textContent = `${scores.reliability} / ${scores.maxReliability} pts`;

  cardBioText.innerHTML = formatBioWithHighlights(lead.bio, lead.highlightedTokens || scores.highlightedTokens);

  const matches = (lead.matches && lead.matches.length > 0) ? lead.matches : (scores.matches || ['Agent']);
  cardMatchesPills.innerHTML = matches.map(m => `<span class="pill-match">${esc(m)}</span>`).join('');

  const isSaved = savedLeads.some(l => l.id === lead.id || (l.username && lead.username && l.username.toLowerCase() === lead.username.toLowerCase()));
  if (isSaved) {
    modalSaveBtn.innerHTML = '<span>✓</span> Saved in CRM';
  } else {
    modalSaveBtn.innerHTML = '<span>💾</span> Save to Leads CRM';
  }

  leadModal.style.display = 'flex';
}

function closeLeadModal() {
  leadModal.style.display = 'none';
  currentLead = null;
}

// Render Leads Table
function renderLeadsTable() {
  const query = (tableSearch.value || '').trim().toLowerCase();
  const filter = filterLevel.value;

  const filtered = savedLeads.filter(l => {
    if (filter !== 'ALL' && l.scores?.level !== filter) return false;
    if (!query) return true;
    const nameMatch = (l.name || '').toLowerCase().includes(query);
    const handleMatch = (l.username || '').toLowerCase().includes(query);
    const bioMatch = (l.bio || '').toLowerCase().includes(query);
    const matchTerms = (l.matches || []).some(m => m.toLowerCase().includes(query));
    return nameMatch || handleMatch || bioMatch || matchTerms;
  });

  leadsCounter.textContent = `Showing ${filtered.length} of ${savedLeads.length} leads`;

  if (filtered.length === 0) {
    leadsTbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  leadsTbody.innerHTML = filtered.map(lead => {
    const score = lead.scores?.total || 0;
    const level = lead.scores?.level || 'LOW';
    const levelClass = level === 'HIGH' ? 'score-badge-high' : (level === 'MEDIUM' ? 'score-badge-med' : 'score-badge-low');
    const avatarSrc = lead.avatar && lead.avatar.startsWith('http') ? `/api/proxy-avatar?url=${encodeURIComponent(lead.avatar)}` : (lead.avatar || defaultAvatar);
    const matchesHtml = (lead.matches || []).slice(0, 4).map(m => `<span class="tbl-pill">${esc(m)}</span>`).join('');
    const handleDisplay = lead.username ? `@${lead.username}` : (lead.id || 'N/A');
    const bioText = lead.bio ? esc(lead.bio) : '<span style="color:#64748b;font-style:italic;">No bio text</span>';
    const hasAgent = /agent/i.test(lead.bio || '');
    const bioBadge = hasAgent ? '<span style="background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:700;margin-left:6px;">BIO: AGENT FOUND</span>' : '';

    return `
      <tr>
        <td>
          <div class="tbl-profile-cell">
            <img class="tbl-avatar" src="${avatarSrc}" onerror="this.src='${defaultAvatar}'" alt="Avatar">
            <div class="tbl-names">
              <span class="tbl-display-name">${esc(lead.name || lead.username)} ${bioBadge}</span>
              <span class="tbl-bio-snippet" title="${esc(lead.bio || '')}">${bioText.length > 60 ? bioText.slice(0, 60) + '...' : bioText}</span>
            </div>
          </div>
        </td>
        <td><span class="tbl-handle">${esc(handleDisplay)}</span></td>
        <td>
          <span class="tbl-score-badge ${levelClass}">${score} / 100</span>
        </td>
        <td>
          <span class="tbl-type-badge">${esc(lead.type || 'USER')}</span>
        </td>
        <td>
          <div class="tbl-pills-wrap">${matchesHtml || '<span style="color:var(--text-faint);font-size:0.75rem;">None</span>'}</div>
        </td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">
          ${lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'Just now'}
        </td>
        <td style="text-align: right;">
          <div class="tbl-actions">
            <button class="btn-inspect" data-user="${esc(lead.username || lead.id)}" title="Inspect Full Card">
              🔍 Inspect Card
            </button>
            <button class="btn-del" data-del="${esc(lead.id || lead.username)}" title="Remove">✕</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Update Top Bar Stats & Receipt Count
function updateStats() {
  statTotal.textContent = savedLeads.length;
  const highCount = savedLeads.filter(l => l.scores?.level === 'HIGH').length;
  statHigh.textContent = highCount;

  const userCategoryCount = getUserCategoryLeads().length;
  if (receiptUserCount) {
    receiptUserCount.textContent = userCategoryCount;
  }

  if (savedLeads.length > 0) {
    const sum = savedLeads.reduce((acc, l) => acc + (l.scores?.total || 0), 0);
    const avg = Math.round(sum / savedLeads.length);
    statAvg.textContent = `${avg}%`;
  } else {
    statAvg.textContent = '0%';
  }
}

// Fetch Leads from Backend
async function fetchLeads() {
  try {
    const res = await fetch('/api/leads');
    const data = await res.json();
    if (data.ok) {
      savedLeads = data.leads || [];
      renderLeadsTable();
      updateStats();
    }
  } catch (err) {
    console.error('Failed to fetch leads:', err);
  }
}

// Form Submit: Analyze Single Profile
scanForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputVal = usernameInp.value.trim();
  if (!inputVal) return;

  scanBtn.disabled = true;
  scanBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Scanning...</span>';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: inputVal })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to analyze');

    openLeadModal(data.lead);

    const exists = savedLeads.some(l => l.username.toLowerCase() === data.lead.username.toLowerCase());
    if (!exists) {
      savedLeads.unshift(data.lead);
      renderLeadsTable();
      updateStats();
    }
  } catch (err) {
    alert('Scan Error: ' + err.message);
  } finally {
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<span class="btn-icon">⚡</span><span class="btn-text">Analyze Profile</span>';
  }
});

// Quick Test Chips
document.querySelectorAll('[data-user]').forEach(btn => {
  btn.addEventListener('click', () => {
    usernameInp.value = btn.dataset.user;
    scanForm.dispatchEvent(new Event('submit'));
  });
});

clearInpBtn.addEventListener('click', () => {
  usernameInp.value = '';
  usernameInp.focus();
});

// Table Actions (Inspect & Delete)
leadsTbody.addEventListener('click', async (e) => {
  const inspectBtn = e.target.closest('.btn-inspect');
  if (inspectBtn) {
    const u = inspectBtn.dataset.user;
    const found = savedLeads.find(l => (l.username && l.username.toLowerCase() === u.toLowerCase()) || l.id === u);
    if (found) openLeadModal(found);
    return;
  }

  const delBtn = e.target.closest('.btn-del');
  if (delBtn) {
    const id = delBtn.dataset.del;
    if (confirm(`Remove this lead from database?`)) {
      try {
        await fetch(`/api/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('Lead removed');
        fetchLeads();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }
  }
});

// Filter & Search Table
tableSearch.addEventListener('input', renderLeadsTable);
filterLevel.addEventListener('change', renderLeadsTable);

// Save Lead from Modal
modalSaveBtn.addEventListener('click', async () => {
  if (!currentLead) return;
  try {
    const res = await fetch('/api/save-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentLead)
    });
    const data = await res.json();
    if (data.ok) {
      showToast('✓ Lead saved to CRM successfully!');
      modalSaveBtn.innerHTML = '<span>✓</span> Saved in CRM';
      fetchLeads();
    }
  } catch (err) {
    alert('Save error: ' + err.message);
  }
});

// Copy Link Button
cardLinkCopy.addEventListener('click', () => {
  if (!currentLead) return;
  const link = currentLead.url || `https://t.me/${currentLead.username}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Telegram link copied!');
  }).catch(() => {
    showToast('Failed to copy');
  });
});

cardLinkOpen.addEventListener('click', () => {
  if (currentLead) window.open(currentLead.url || `https://t.me/${currentLead.username}`, '_blank');
});

// Modal Close Handlers
modalCloseBtn.addEventListener('click', closeLeadModal);
leadModal.addEventListener('click', (e) => {
  if (e.target === leadModal) closeLeadModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && leadModal.style.display !== 'none') {
    closeLeadModal();
  }
});

// ================= USER RECEIPT & DIRECT REDIRECT LOGIC =================

// Helper: check if a lead qualifies for User/Agent receipt
function isEligibleForUserReceipt(lead) {
  const type = (lead.type || 'USER').toUpperCase();
  if (type === 'USER') return true;

  // Include BOT only if related to agent, teacher, mentor, CSR, or prediction
  if (type === 'BOT') {
    const textToScan = `${lead.username || ''} ${lead.name || ''} ${lead.bio || ''}`.toLowerCase();
    const isAgentTeacherRelated = /agent|teacher|mentor|csr|support|recruiter|official|prediction|forecast|team|assistant/i.test(textToScan);
    const hasMatches = (lead.matches || []).some(m => ['AGENT', 'TEACHER', 'SALARY/COMM'].includes(String(m).toUpperCase()));
    return isAgentTeacherRelated || hasMatches;
  }

  return false;
}

function getUserCategoryLeads() {
  return savedLeads.filter(isEligibleForUserReceipt);
}

function openReceiptModal() {
  const userLeads = getUserCategoryLeads();
  receiptBadgeTotal.textContent = `${userLeads.length} Users`;

  if (userLeads.length === 0) {
    receiptListContainer.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 8px;">📭</div>
        <p>No leads with <b>USER</b> classification found yet.</p>
        <p style="font-size: 0.8rem; color: var(--text-faint);">Run a bulk keyword scan above to collect user profiles.</p>
      </div>
    `;
  } else {
    receiptListContainer.innerHTML = userLeads.map((u, i) => {
      const handle = u.username ? `@${u.username}` : (u.id || `User_${i + 1}`);
      const tgUrl = u.url || (u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.id}`);
      const score = u.scores?.total || 0;
      const avatarSrc = u.avatar && u.avatar.startsWith('http') ? `/api/proxy-avatar?url=${encodeURIComponent(u.avatar)}` : (u.avatar || defaultAvatar);
      const cleanHandleForCopy = u.username || u.id;
      const isBot = (u.type || '').toUpperCase() === 'BOT';
      const badgeHtml = isBot 
        ? '<span style="font-size:0.65rem;font-weight:700;padding:1px 5px;background:rgba(129,140,248,0.2);color:#818cf8;border:1px solid rgba(129,140,248,0.4);border-radius:4px;margin-left:5px;">BOT</span>' 
        : '';

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(13, 21, 39, 0.6); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <img src="${avatarSrc}" onerror="this.src='${defaultAvatar}'" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" alt="Avatar">
            <div style="min-width: 0;">
              <div style="font-weight: 700; color: #ffffff; font-size: 0.86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${esc(u.name || u.username)} ${badgeHtml}
              </div>
              <div style="font-size: 0.78rem; font-family: var(--font-mono); color: #38bdf8;">
                ${esc(handle)} <span style="color: #64748b; font-size: 0.72rem;">(${score}/100)</span>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 6px; flex-shrink: 0;">
            <button type="button" class="btn-secondary copy-single-user-btn" data-copy="${esc(cleanHandleForCopy)}" title="Copy Username" style="padding: 6px 10px; font-size: 0.76rem;">
              📋 Copy
            </button>
            <a href="${esc(tgUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary" title="Open directly in Telegram" style="padding: 6px 12px; font-size: 0.76rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
              <span>✈️</span> Chat
            </a>
          </div>
        </div>
      `;
    }).join('');
  }

  receiptModal.style.display = 'flex';
}

function closeReceiptModal() {
  receiptModal.style.display = 'none';
}

// Open Receipt Modal on Click
if (openReceiptBtn) {
  openReceiptBtn.addEventListener('click', openReceiptModal);
}
if (receiptCloseBtn) {
  receiptCloseBtn.addEventListener('click', closeReceiptModal);
}
if (receiptModal) {
  receiptModal.addEventListener('click', (e) => {
    if (e.target === receiptModal) closeReceiptModal();
  });
}

// Copy single username inside receipt list
if (receiptListContainer) {
  receiptListContainer.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-single-user-btn');
    if (copyBtn) {
      const u = copyBtn.dataset.copy;
      navigator.clipboard.writeText(u.startsWith('@') ? u : `@${u}`).then(() => {
        showToast(`Copied ${u.startsWith('@') ? u : '@' + u} to clipboard!`);
      }).catch(() => {
        showToast('Failed to copy');
      });
    }
  });
}

// Copy All Usernames to Clipboard
if (copyAllUsernamesBtn) {
  copyAllUsernamesBtn.addEventListener('click', () => {
    const userLeads = getUserCategoryLeads();
    if (userLeads.length === 0) {
      showToast('No user leads available to copy');
      return;
    }
    const handles = userLeads.map(u => {
      const h = u.username || u.id;
      return h.startsWith('@') ? h : `@${h}`;
    }).join('\n');

    navigator.clipboard.writeText(handles).then(() => {
      showToast(`✓ Copied ${userLeads.length} usernames to clipboard!`);
    }).catch(() => {
      showToast('Failed to copy usernames');
    });
  });
}

// Download TXT Receipt with direct clickable/copyable Telegram links
if (downloadReceiptTxtBtn) {
  downloadReceiptTxtBtn.addEventListener('click', () => {
    const userLeads = getUserCategoryLeads();
    if (userLeads.length === 0) {
      showToast('No user leads to export');
      return;
    }

    const lines = [
      '=================================================================',
      '         TELEGRAM LEAD INTELLIGENCE - USER RECEIPT               ',
      `         Generated: ${new Date().toLocaleString()}              `,
      `         Total Verified Users: ${userLeads.length}              `,
      '=================================================================\n'
    ];

    userLeads.forEach((u, i) => {
      const handle = u.username ? `@${u.username}` : (u.id || 'N/A');
      const directLink = u.url || (u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.id}`);
      lines.push(`${i + 1}. ${u.name || u.username || 'User'}`);
      lines.push(`   Username/ID : ${handle}`);
      lines.push(`   Direct Link : ${directLink}`);
      lines.push(`   Quality Score: ${u.scores?.total || 0}/100 (${u.scores?.level || 'LOW'})`);
      if (u.bio) lines.push(`   Bio         : ${u.bio.replace(/\r?\n/g, ' ')}`);
      lines.push('-----------------------------------------------------------------');
    });

    lines.push('\n[END OF RECEIPT]');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Telegram_User_Receipt_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ TXT Receipt downloaded successfully!');
  });
}

// Download CSV of Users
if (downloadReceiptCsvBtn) {
  downloadReceiptCsvBtn.addEventListener('click', () => {
    const userLeads = getUserCategoryLeads();
    if (userLeads.length === 0) {
      showToast('No user leads to export');
      return;
    }

    const headers = ['Username', 'Display Name', 'Quality Score', 'Rating', 'Classification', 'Direct Telegram Link', 'Bio'];
    const rows = userLeads.map(u => [
      `"${u.username ? '@' + u.username : (u.id || '')}"`,
      `"${(u.name || '').replace(/"/g, '""')}"`,
      u.scores?.total || 0,
      `"${u.scores?.level || ''}"`,
      `"${u.type || 'USER'}"`,
      `"${u.url || (u.username ? 'https://t.me/' + u.username : '')}"`,
      `"${(u.bio || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Telegram_Users_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ Users CSV downloaded successfully!');
  });
}

// Initial Setup
fetchLeads();
checkTgStatus();
