const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(require('os').homedir(), '.desktop-organizer');
const RULES_FILE = path.join(CONFIG_DIR, 'rules.json');
const CATEGORIES_FILE = path.join(CONFIG_DIR, 'categories.json');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const PROFILES_FILE = path.join(CONFIG_DIR, 'profiles.json');
const PREFERENCES_FILE = path.join(CONFIG_DIR, 'preferences.json');
const DEFAULT_RULES = path.join(__dirname, 'default-rules.json');

const RULE_SCORES = {
  pathPattern: 50,
  keyword: 25,
  ext: 30,
  exactNameBonus: 10,
  targetKeywordBonus: 5,
  profileKeyword: 12,
  profilePath: 10,
  profileExt: 8,
};
const PRIOR_MAX_SCORE = 5;
const PROFILE_LIMIT = 30;
const TOKEN_MIN_LENGTH = 2;
const TOKEN_SPLIT_RE = /[^a-z0-9一-龥]+/i;
const DEFAULT_PREFERENCES = {
  directoryMode: 'semantic',
  archiveMode: 'semantic',
};
const ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']);
const OBSOLETE_DEFAULT_RULES = {
  办公文档: [
    { type: 'path_pattern', pattern: 'Kingsoft|WPS' },
    { type: 'path_pattern', pattern: 'PDF24' },
    { type: 'path_pattern', pattern: 'SumatraPDF' },
    { type: 'path_pattern', pattern: 'Typora' },
    { type: 'path_pattern', pattern: 'Obsidian' },
    { type: 'keyword', value: 'WPS' },
    { type: 'keyword', value: 'PDF24' },
    { type: 'keyword', value: 'SumatraPDF' },
    { type: 'keyword', value: 'Typora' },
    { type: 'keyword', value: 'Obsidian' },
  ],
  系统工具: [
    { type: 'path_pattern', pattern: 'Google\\\\Chrome' },
    { type: 'path_pattern', pattern: 'Microsoft\\\\Edge' },
  ],
};

// 确保配置目录存在
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function mergeDefaultRules(rules, defaults) {
  const merged = { ...rules };
  let changed = false;

  for (const [category, obsoleteRules] of Object.entries(OBSOLETE_DEFAULT_RULES)) {
    if (!merged[category]) continue;
    const obsolete = new Set(obsoleteRules.map(rule => JSON.stringify(rule)));
    const nextRules = merged[category].filter(rule => !obsolete.has(JSON.stringify(rule)));
    if (nextRules.length !== merged[category].length) {
      merged[category] = nextRules;
      changed = true;
    }
  }

  for (const [category, defaultRules] of Object.entries(defaults)) {
    if (!merged[category]) {
      merged[category] = defaultRules;
      changed = true;
      continue;
    }

    const existing = new Set(merged[category].map(rule => JSON.stringify(rule)));
    for (const rule of defaultRules) {
      const key = JSON.stringify(rule);
      if (!existing.has(key)) {
        merged[category].push(rule);
        existing.add(key);
        changed = true;
      }
    }
  }

  return { rules: merged, changed };
}

/**
 * 加载分类规则
 * 优先读用户自定义规则，并合并新增默认规则
 */
function loadRules() {
  ensureConfigDir();
  const defaults = JSON.parse(fs.readFileSync(DEFAULT_RULES, 'utf-8'));
  if (fs.existsSync(RULES_FILE)) {
    const userRules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
    const { rules, changed } = mergeDefaultRules(userRules, defaults);
    if (changed) {
      fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8');
    }
    return rules;
  }
  // 复制默认规则
  fs.writeFileSync(RULES_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
  return defaults;
}

/**
 * 保存用户修改后的规则
 */
function saveRules(rules) {
  ensureConfigDir();
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8');
}

/**
 * 加载用户手动分类状态（文件路径 → 分类名）
 */
function loadState() {
  ensureConfigDir();
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return {};
}

function saveState(state) {
  ensureConfigDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function loadProfiles() {
  ensureConfigDir();
  if (fs.existsSync(PROFILES_FILE)) {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
  }
  return {};
}

function saveProfiles(profiles) {
  ensureConfigDir();
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
}

function loadPreferences() {
  ensureConfigDir();
  if (fs.existsSync(PREFERENCES_FILE)) {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf-8')) };
  }
  return { ...DEFAULT_PREFERENCES };
}

function savePreferences(preferences) {
  ensureConfigDir();
  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify({ ...DEFAULT_PREFERENCES, ...preferences }, null, 2), 'utf-8');
}

function incrementProfileValue(bucket, value) {
  if (!value) return;
  bucket[value] = (bucket[value] || 0) + 1;
}

function trimProfileBucket(bucket) {
  return Object.fromEntries(
    Object.entries(bucket)
      .sort((a, b) => b[1] - a[1])
      .slice(0, PROFILE_LIMIT)
  );
}

function extractItemSignals(item) {
  const name = (item.name || '').toLowerCase();
  const fullName = (item.fullName || '').toLowerCase();
  const ext = (item.ext || '').toLowerCase();
  const target = (item.shortcutInfo?.target || '').toLowerCase();
  const keywords = new Set();

  for (const source of [name, fullName.replace(ext, '')]) {
    for (const token of source.split(TOKEN_SPLIT_RE)) {
      if (token.length >= TOKEN_MIN_LENGTH) keywords.add(token);
    }
  }

  const pathParts = target
    ? target.split(/[\\/]+/).map(part => part.replace(/\.[a-z0-9]+$/i, '')).filter(Boolean)
    : [];

  return {
    keywords: [...keywords],
    paths: pathParts.filter(part => part.length >= TOKEN_MIN_LENGTH),
    ext,
  };
}

/**
 * 加载自定义分类列表
 */
function loadCategories() {
  ensureConfigDir();
  const defaults = Object.keys(loadRules());
  if (fs.existsSync(CATEGORIES_FILE)) {
    const categories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
    const merged = [...categories];
    for (const category of defaults) {
      if (!merged.includes(category)) merged.push(category);
    }
    if (merged.length !== categories.length) {
      fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    }
    return merged;
  }
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
  return defaults;
}

function saveCategories(categories) {
  ensureConfigDir();
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf-8');
}

function classifyByPreference(item, preferences) {
  const ext = (item.ext || '').toLowerCase();
  if (item.isDirectory && preferences.directoryMode === 'container') return '文件夹';
  if (ARCHIVE_EXTS.has(ext) && preferences.archiveMode === 'container') return '压缩包';
  if (item.isDirectory && preferences.directoryMode === 'unclassified') return '未分类';
  if (ARCHIVE_EXTS.has(ext) && preferences.archiveMode === 'unclassified') return '未分类';
  return null;
}

function scoreCategoryProfile(item, profile) {
  if (!profile) return 0;
  const signals = extractItemSignals(item);
  let score = 0;
  let strongMatch = false;

  for (const keyword of signals.keywords) {
    if (profile.keywords?.[keyword]) {
      strongMatch = true;
      score += Math.min(RULE_SCORES.profileKeyword, profile.keywords[keyword] * 3);
    }
  }

  for (const pathPart of signals.paths) {
    if (profile.paths?.[pathPart]) {
      strongMatch = true;
      score += Math.min(RULE_SCORES.profilePath, profile.paths[pathPart] * 2);
    }
  }

  if (strongMatch && signals.ext && profile.exts?.[signals.ext]) {
    score += Math.min(RULE_SCORES.profileExt, profile.exts[signals.ext] * 2);
  }

  return strongMatch ? score : 0;
}

function updateCategoryProfile(item, category, profiles = loadProfiles()) {
  const profile = profiles[category] || { keywords: {}, paths: {}, exts: {}, samples: 0 };
  const signals = extractItemSignals(item);

  for (const keyword of signals.keywords) incrementProfileValue(profile.keywords, keyword);
  for (const pathPart of signals.paths) incrementProfileValue(profile.paths, pathPart);
  incrementProfileValue(profile.exts, signals.ext);

  profile.keywords = trimProfileBucket(profile.keywords);
  profile.paths = trimProfileBucket(profile.paths);
  profile.exts = trimProfileBucket(profile.exts);
  profile.samples = (profile.samples || 0) + 1;
  profiles[category] = profile;

  saveProfiles(profiles);
  return profiles;
}

/**
 * 对单条规则进行评分
 */
function scoreRule(item, rule) {
  const name = (item.name || '').toLowerCase();
  const fullName = (item.fullName || '').toLowerCase();
  const ext = (item.ext || '').toLowerCase();
  const target = (item.shortcutInfo?.target || '').toLowerCase();

  if (rule.type === 'keyword') {
    const keyword = (rule.value || '').toLowerCase();
    if (!keyword) return 0;
    let score = 0;
    if (name.includes(keyword) || fullName.includes(keyword)) {
      score += RULE_SCORES.keyword;
      if (name === keyword || fullName === keyword || fullName === `${keyword}${ext}`) {
        score += RULE_SCORES.exactNameBonus;
      }
    }
    if (target && target.includes(keyword)) {
      score += RULE_SCORES.targetKeywordBonus;
    }
    return score;
  }

  if (rule.type === 'ext') {
    return ext && ext === (rule.value || '').toLowerCase() ? RULE_SCORES.ext : 0;
  }

  if (rule.type === 'path_pattern' && target) {
    try {
      return new RegExp(rule.pattern, 'i').test(target) ? RULE_SCORES.pathPattern : 0;
    } catch { return 0; }
  }

  return 0;
}

function scoreCategory(item, ruleList, prior = 0, profile = null) {
  let score = 0;
  let matched = false;
  for (const rule of ruleList || []) {
    const ruleScore = scoreRule(item, rule);
    if (ruleScore > 0) {
      matched = true;
      score += ruleScore;
    }
  }

  const profileScore = scoreCategoryProfile(item, profile);
  if (profileScore > 0) {
    matched = true;
    score += profileScore;
  }

  return matched ? score + prior : 0;
}

function scoreAutomaticCategory(item, rules, categoryPrior = {}, profiles = {}) {
  let bestCategory = '未分类';
  let bestScore = 0;

  const categories = [...new Set([...Object.keys(rules), ...Object.keys(profiles)])];
  for (const category of categories) {
    const ruleList = rules[category] || [];
    const score = scoreCategory(item, ruleList, categoryPrior[category] || 0, profiles[category]);
    if (score > bestScore) {
      bestCategory = category;
      bestScore = score;
    }
  }

  return { category: bestCategory, score: bestScore };
}

function buildCategoryPrior(items, rules, userState, profiles = {}) {
  const counts = {};

  for (const item of items) {
    if (userState[item.id]) {
      counts[userState[item.id]] = (counts[userState[item.id]] || 0) + 1;
      continue;
    }

    const scored = scoreAutomaticCategory(item, rules, {}, profiles);
    if (scored.score > 0) {
      counts[scored.category] = (counts[scored.category] || 0) + 1;
    }
  }

  const prior = {};
  for (const [category, count] of Object.entries(counts)) {
    if (category === '未分类') continue;
    prior[category] = Math.min(PRIOR_MAX_SCORE, Math.log2(count + 1));
  }
  return prior;
}

/**
 * 对单个桌面项目进行分类
 * 优先级：用户手动分类 > 自动规则评分
 */
function classifyItem(item, rules, userState, categoryPrior = {}, profiles = {}, preferences = DEFAULT_PREFERENCES) {
  // 用户手动分类优先
  if (userState[item.id]) {
    return userState[item.id];
  }

  const preferenceCategory = classifyByPreference(item, preferences);
  if (preferenceCategory) {
    return preferenceCategory;
  }

  const scored = scoreAutomaticCategory(item, rules, categoryPrior, profiles);
  return scored.score > 0 ? scored.category : '未分类';
}

/**
 * 对所有桌面项目进行分类
 * 返回 { 分类名: [items] } 结构
 */
function classifyAll(items, options = {}) {
  const rules = options.rules || loadRules();
  const userState = options.userState || loadState();
  const categories = options.categories || loadCategories();
  const profiles = options.profiles || loadProfiles();
  const preferences = options.preferences || loadPreferences();

  const categoryPrior = buildCategoryPrior(items, rules, userState, profiles);

  const result = {};
  // 初始化所有分类
  for (const cat of categories) {
    result[cat] = [];
  }
  if (preferences.directoryMode === 'container') result['文件夹'] = [];
  if (preferences.archiveMode === 'container') result['压缩包'] = [];
  result['未分类'] = [];

  for (const item of items) {
    const category = classifyItem(item, rules, userState, categoryPrior, profiles, preferences);
    item.category = category;
    if (!result[category]) {
      result[category] = [];
    }
    result[category].push(item);
  }

  // 移除空分类
  for (const cat of Object.keys(result)) {
    if (result[cat].length === 0) {
      delete result[cat];
    }
  }

  return result;
}

/**
 * 手动设置某个文件的分类
 */
function setItemCategory(itemId, category, item = null) {
  const state = loadState();
  state[itemId] = category;
  saveState(state);
  if (item) {
    updateCategoryProfile(item, category);
  }
}

/**
 * 移除手动分类（恢复自动分类）
 */
function removeItemCategory(itemId) {
  const state = loadState();
  delete state[itemId];
  saveState(state);
}

module.exports = {
  loadRules,
  saveRules,
  loadCategories,
  saveCategories,
  loadProfiles,
  saveProfiles,
  loadPreferences,
  savePreferences,
  updateCategoryProfile,
  classifyAll,
  setItemCategory,
  removeItemCategory,
  CONFIG_DIR,
};
