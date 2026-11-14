// Telegram Agent & Prediction Lead Quality Scoring Engine

const HIGH_VALUE_AGENT_TERMS = [
  'looking experience agent', 'experience agent', 'super agent', 'agent',
  'subordinate', 'referral', 'invite', 'team leader', 'affiliate', 'recruiter', 'promoter'
];

const TEACHER_TERMS = [
  'teacher', 'mentor', 'forecast', 'prediction', 'vip prediction',
  'vip signal', 'signals', 'wingo', 'k3', '5d', 'lottery', 'trader'
];

const PLATFORM_TERMS = [
  'dmwin', 'yaarwin', 'dmfirst', '6eclub', '91club', 'bdgwin',
  'tiranga', 'bigdaddy', 'okwin', 'goa games', 'tashanwin', 'jaldiwin'
];

const MARKETING_TERMS = [
  'seo', 'ad', 'ads', 'traffic', 'google ads', 'meta ads', 'media buyer', 'marketing'
];

const MONETIZATION_TERMS = [
  'salary', 'daily salary', 'weekly salary', 'commission', 'daily bonus', 'usdt'
];

function calculateLeadScore(profile, activeSearchKeywords = []) {
  const bio = (profile.bio || '').trim();
  const bioLower = bio.toLowerCase();
  const name = (profile.name || '').trim();
  const username = (profile.username || '').toLowerCase();

  const detectedMatches = [];
  const highlightedTokens = [];

  // Check categories
  let hasAgent = false;
  let hasTeacher = false;
  let hasPlatform = false;
  let hasMarketing = false;
  let hasMonetization = false;

  for (const term of HIGH_VALUE_AGENT_TERMS) {
    if (bioLower.includes(term)) {
      hasAgent = true;
      if (!detectedMatches.includes('Agent')) detectedMatches.push('Agent');
      highlightedTokens.push(term);
    }
  }

  for (const term of TEACHER_TERMS) {
    if (bioLower.includes(term)) {
      hasTeacher = true;
      if (!detectedMatches.includes('Teacher')) detectedMatches.push('Teacher');
      highlightedTokens.push(term);
    }
  }

  for (const term of PLATFORM_TERMS) {
    if (bioLower.includes(term)) {
      hasPlatform = true;
      const cap = term.toUpperCase();
      if (!detectedMatches.includes(cap)) detectedMatches.push(cap);
      highlightedTokens.push(term);
    }
  }

  for (const term of MARKETING_TERMS) {
    const re = new RegExp(`(^|\\s|\\||,|-)${term}($|\\s|\\||,|-|\\.)`, 'i');
    if (re.test(bioLower) || bioLower.includes(term + ' ') || bioLower.includes(' ' + term)) {
      hasMarketing = true;
      const cap = term.toUpperCase();
      if (!detectedMatches.includes(cap)) detectedMatches.push(cap);
      highlightedTokens.push(term);
    }
  }

  for (const term of MONETIZATION_TERMS) {
    if (bioLower.includes(term)) {
      hasMonetization = true;
      if (!detectedMatches.includes('Salary')) detectedMatches.push('Salary/Comm');
      highlightedTokens.push(term);
    }
  }

  // Also check if any custom search keyword is explicitly present in bio
  if (Array.isArray(activeSearchKeywords)) {
    for (const kw of activeSearchKeywords) {
      const kwLower = String(kw).toLowerCase().trim();
      if (kwLower && bioLower.includes(kwLower)) {
        highlightedTokens.push(kwLower);
        const cap = kw.trim().toUpperCase();
        if (!detectedMatches.includes(cap)) detectedMatches.push(cap);
      }
    }
  }

  // 1. Bio Relevance (Max 40 pts)
  let bioRelevance = 0;
  if (hasAgent) bioRelevance += 14;
  if (hasTeacher) bioRelevance += 8;
  if (hasPlatform) bioRelevance += 6;
  if (hasMonetization) bioRelevance += 6;
  if (bioRelevance === 0 && bio.length > 20) bioRelevance = 10;
  bioRelevance = Math.min(40, bioRelevance);

  // 2. Completeness (Max 25 pts)
  let completeness = 0;
  const hasAvatar = !!profile.avatar && !profile.avatar.includes('telegram_default') && !profile.avatar.includes('default_avatar');
  if (hasAvatar) completeness += 10;
  if (bio.length >= 15) completeness += 10;
  else if (bio.length > 0) completeness += 5;
  if (name && name.toLowerCase() !== username) completeness += 5;
  completeness = Math.min(25, completeness);

  // 3. Public Evidence (Max 20 pts)
  let publicEvidence = 0;
  if (hasMarketing || /https?:\/\/|t\.me\/|@\w+/i.test(bio)) {
    publicEvidence += 10;
  }
  const isChannelOrGroup = profile.type === 'CHANNEL' || profile.type === 'GROUP';
  const hasSubscribers = profile.extra && /\d+.*(?:subscribers|members)/i.test(profile.extra);
  if (isChannelOrGroup || hasSubscribers) {
    publicEvidence += 10;
  }
  publicEvidence = Math.min(20, publicEvidence);

  // 4. Reliability (Max 15 pts)
  let reliability = 0;
  const isCleanHandle = username && username.length >= 4 && username.length <= 25 && !/\d{5,}$/.test(username);
  if (isCleanHandle) reliability += 10;
  else reliability += 5;
  const hasNoSpamWarning = !/scam|fake|warn|cheat/i.test(bio) && !/scam|fake/i.test(name);
  if (hasNoSpamWarning) reliability += 5;
  reliability = Math.min(15, reliability);

  const total = bioRelevance + completeness + publicEvidence + reliability;

  let level = 'LOW';
  if (total >= 70) level = 'HIGH';
  else if (total >= 40) level = 'MEDIUM';

  const uniqueTokens = [...new Set(highlightedTokens)];
  const hasBioKeywordMatch = uniqueTokens.length > 0;

  return {
    bioRelevance,
    maxBioRelevance: 40,
    completeness,
    maxCompleteness: 25,
    publicEvidence,
    maxPublicEvidence: 20,
    reliability,
    maxReliability: 15,
    total,
    level,
    hasBioKeywordMatch,
    matches: detectedMatches.length ? detectedMatches : ['None'],
    highlightedTokens: uniqueTokens.length ? uniqueTokens : ['agent']
  };
}

module.exports = {
  calculateLeadScore,
  HIGH_VALUE_AGENT_TERMS,
  TEACHER_TERMS,
  PLATFORM_TERMS,
  MARKETING_TERMS,
  MONETIZATION_TERMS
};
