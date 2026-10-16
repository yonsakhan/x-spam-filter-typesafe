// ==UserScript==
// @name         X 评论垃圾过滤 (TypeSafe/Jev)
// @namespace    local.x-comment-filter
// @version      0.3.1
// @description  用 TypeSafe Jev 语义判断过滤 X 评论区垃圾评论（引流广告、乱码变体、无意义刷屏），支持自定义屏蔽样例
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.typesafe.ai
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 配置 ----------

  const CFG = {
    apiKey: GM_getValue('ts_api_key', ''),
    threshold: GM_getValue('threshold', 0.85),
    onlyStatusPages: GM_getValue('only_status_pages', true),
    handleMode: GM_getValue('handle_mode', 'collapse'),
    examples: GM_getValue('custom_examples', ['只入身体😄💋不入生活']),
    stats: GM_getValue('stats', { judged: 0, hidden: 0, cacheHits: 0, errors: 0, inputTokens: 0, outputTokens: 0 }),
  };
  const verdictCache = GM_getValue('verdict_cache', {});

  function saveStats() { GM_setValue('stats', CFG.stats); }
  function saveCache() { GM_setValue('verdict_cache', verdictCache); }

  GM_registerMenuCommand('打开设置面板', () => togglePanel());

  // ---------- 页面内设置面板 ----------

  function togglePanel() {
    const existing = document.getElementById('xcf-modal');
    if (existing) { existing.remove(); return; }
    const s = CFG.stats;
    const modal = document.createElement('div');
    modal.id = 'xcf-modal';
    modal.style.cssText = 'position:fixed;right:16px;bottom:64px;z-index:99999;width:320px;background:#16181c;color:#e7e9ea;border:1px solid #2f3336;border-radius:12px;padding:16px;font:14px/1.5 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5);';
    modal.innerHTML = `
      <div style="font-weight:700;margin-bottom:10px">X 评论过滤设置</div>
      <div style="margin-bottom:4px">TypeSafe API Key</div>
      <input id="xcf-key" type="password" placeholder="粘贴 API key" style="width:100%;box-sizing:border-box;background:#000;border:1px solid #2f3336;color:#e7e9ea;border-radius:6px;padding:6px;margin-bottom:10px">
      <div style="margin-bottom:4px">隐藏阈值（0.5–0.99，建议先 0.95 观察再下调）</div>
      <input id="xcf-th" type="number" min="0.5" max="0.99" step="0.01" style="width:100%;box-sizing:border-box;background:#000;border:1px solid #2f3336;color:#e7e9ea;border-radius:6px;padding:6px;margin-bottom:10px">
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:10px;cursor:pointer"><input id="xcf-only-status" type="checkbox"> 仅帖子评论区生效</label>
      <div style="margin-bottom:4px">命中垃圾评论后</div>
      <select id="xcf-mode" style="width:100%;box-sizing:border-box;background:#000;border:1px solid #2f3336;color:#e7e9ea;border-radius:6px;padding:6px;margin-bottom:10px">
        <option value="hide">1. 直接隐藏</option>
        <option value="collapse">2. 折叠成占位条（可点开）</option>
      </select>
      <div style="margin-bottom:4px">自定义屏蔽样例（每行一条，最多 50 条；语义类似的评论会被拦截）</div>
      <textarea id="xcf-examples" rows="4" placeholder="例如：&#10;只入身体😄💋不入生活&#10;兼职日结 加V" style="width:100%;box-sizing:border-box;background:#000;border:1px solid #2f3336;color:#e7e9ea;border-radius:6px;padding:6px;margin-bottom:6px;resize:vertical"></textarea>
      <button id="xcf-import" style="width:100%;background:transparent;border:1px solid #2f3336;color:#1d9bf0;border-radius:6px;padding:6px;margin-bottom:10px;cursor:pointer">📥 从 X 账号导入屏蔽词</button>
      <div id="xcf-stats" style="font-size:12px;color:#71767b;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="xcf-save" style="background:#1d9bf0;border:none;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer">保存</button>
        <button id="xcf-clear" style="background:transparent;border:1px solid #2f3336;color:#e7e9ea;border-radius:6px;padding:6px 12px;cursor:pointer">清空缓存</button>
        <button id="xcf-close" style="background:transparent;border:1px solid #2f3336;color:#e7e9ea;border-radius:6px;padding:6px 12px;cursor:pointer">关闭</button>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#xcf-key').value = CFG.apiKey;
    modal.querySelector('#xcf-th').value = CFG.threshold;
    modal.querySelector('#xcf-only-status').checked = CFG.onlyStatusPages;
    modal.querySelector('#xcf-mode').value = CFG.handleMode;
    modal.querySelector('#xcf-examples').value = CFG.examples.join('\n');
    modal.querySelector('#xcf-stats').textContent =
      `已判断 ${s.judged} · 已隐藏 ${s.hidden} · 缓存命中 ${s.cacheHits} · 失败 ${s.errors} · tokens ${s.inputTokens}/${s.outputTokens}`;
    modal.querySelector('#xcf-save').onclick = () => {
      const k = modal.querySelector('#xcf-key').value.trim();
      const th = parseFloat(modal.querySelector('#xcf-th').value);
      if (k) { CFG.apiKey = k; GM_setValue('ts_api_key', k); }
      if (isFinite(th) && th >= 0.5 && th <= 0.99) { CFG.threshold = th; GM_setValue('threshold', th); }
      CFG.onlyStatusPages = modal.querySelector('#xcf-only-status').checked;
      GM_setValue('only_status_pages', CFG.onlyStatusPages);
      CFG.handleMode = modal.querySelector('#xcf-mode').value;
      GM_setValue('handle_mode', CFG.handleMode);
      CFG.examples = modal.querySelector('#xcf-examples').value
        .split('\n').map(s => s.trim()).filter(Boolean)
        .slice(0, 50).map(s => s.slice(0, 200));
      GM_setValue('custom_examples', CFG.examples);
      modal.querySelector('#xcf-save').textContent = '已保存 ✓';
      scan();
    };
    modal.querySelector('#xcf-clear').onclick = () => {
      Object.keys(verdictCache).forEach(k => delete verdictCache[k]);
      saveCache();
      modal.querySelector('#xcf-clear').textContent = '已清空 ✓';
    };
    modal.querySelector('#xcf-close').onclick = () => modal.remove();
    modal.querySelector('#xcf-import').onclick = () => importMutedWords(modal);
  }

  // 读取 X 账号已有的屏蔽词（走 X 网页端内部接口，接口变动会失败并提示）
  async function importMutedWords(modal) {
    const btn = modal.querySelector('#xcf-import');
    btn.textContent = '导入中…';
    try {
      const ct0 = (document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/) || [])[1];
      if (!ct0) throw new Error('未找到登录凭据，请确认已登录 X');
      const BEARER = 'AAAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
      const res = await fetch('https://x.com/i/api/1.1/mutes/keywords/list.json', {
        headers: {
          'authorization': 'Bearer ' + decodeURIComponent(BEARER),
          'x-csrf-token': ct0,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.muted_keywords || []);
      const words = list.map(w => (w.keyword || '').trim()).filter(Boolean);
      if (!words.length) { btn.textContent = '账号里没有屏蔽词'; return; }
      const merged = [...new Set([...CFG.examples, ...words])].slice(0, 50);
      const added = merged.length - CFG.examples.length;
      CFG.examples = merged;
      GM_setValue('custom_examples', CFG.examples);
      modal.querySelector('#xcf-examples').value = merged.join('\n');
      btn.textContent = `已导入 ${words.length} 条（新增 ${added}，共 ${merged.length}）`;
    } catch (e) {
      btn.textContent = '导入失败：' + e.message;
    }
  }

  function ensureButton() {
    if (document.getElementById('xcf-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'xcf-btn';
    btn.textContent = '🛡';
    btn.title = 'X评论过滤设置';
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;width:40px;height:40px;border-radius:50%;background:#1d9bf0;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.4);user-select:none;';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);
  }

  // ---------- 工具 ----------

  function hash53(str) { // cyrb53，足够做缓存键
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- TypeSafe API ----------

  function gmRequest(payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.typesafe.ai/v1/systemone',
        headers: {
          'Authorization': 'Bearer ' + CFG.apiKey,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify(payload),
        onload: res => {
          let body = null;
          try { body = JSON.parse(res.responseText); } catch (e) { /* keep null */ }
          resolve({ status: res.status, body });
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
        timeout: 30000,
      });
    });
  }

  async function judgeComment(commentText, authorName, authorHandle, postContext) {
    const payload = {
      model: 'jev-latest',
      state: {
        post_context: (postContext || '').slice(0, 200),
        comment: {
          author_name: authorName || '',
          author_handle: authorHandle || '',
          text: commentText,
        },
        blocked_examples: CFG.examples,
      },
      questions: {
        is_spam: {
          type: 'noul',
          instructions: '结合评论内容和发布者昵称、用户名，判断这条对主帖的评论是否是垃圾信息？垃圾信息包括：引流广告、色情/赌博/加密货币推广、约炮/性暗示引流、卖粉卖赞、线下报名/兼职类营销、刷屏灌水、与主帖内容无关的蹭热度回复。发布者昵称含营销词汇或emoji符号（如"线下报名""兼职""💧💎"）、用户名为无意义随机字母数字，也是垃圾账号的典型特征。另外，`blocked_examples` 是用户手工标记的垃圾评论样例；评论在语义上与任一样例类似（换字、换词、换符号的变体都算）时，也应判为垃圾信息。',
          criteria: {
            true: '评论是广告引流、推广、性暗示引流、刷屏或蹭热度内容；或与 `blocked_examples` 中样例语义类似；或发布者昵称/用户名呈明显营销号、垃圾号特征',
            false: '评论是真实用户针对主帖的正常表达（观点、情绪、提问、玩梗均可），发布者昵称正常，且与所有样例都不类似',
          },
        },
        is_gibberish: {
          type: 'noul',
          instructions: '这条评论是否是无意义内容？包括：随机汉字或乱码组合、用形近字/谐音字拼凑成的规避审核文本、只有表情或个别字符的无信息量回复、与上下文完全无关的复制粘贴废话。',
          criteria: {
            true: '文本本身无正常语义，是乱码、形近字拼凑或无意义重复',
            false: '文本是正常人类可读的表达，哪怕简短、口语化或带情绪',
          },
        },
      },
    };

    const delays = [1000, 2000, 4000];
    for (let attempt = 0; ; attempt++) {
      const { status, body } = await gmRequest(payload);
      if (status === 200 && body && body.answers) {
        const u = body.usage || {};
        CFG.stats.inputTokens += u.input_tokens || 0;
        CFG.stats.outputTokens += u.output_tokens || 0;
        return {
          spam: body.answers.is_spam ? body.answers.is_spam.noul : 0,
          gibberish: body.answers.is_gibberish ? body.answers.is_gibberish.noul : 0,
        };
      }
      if (status === 401) {
        alert('[X评论过滤] API key 无效，请在油猴菜单重新设置');
        throw new Error('401 unauthorized');
      }
      if ((status === 429 || status === 529) && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      throw new Error('API error, status ' + status);
    }
  }

  // ---------- 判断队列（并发 2，保底间隔） ----------

  const queue = [];
  let running = 0;
  let lastRequestAt = 0;
  const MIN_INTERVAL = 300;

  function enqueue(item) { queue.push(item); pump(); }

  async function pump() {
    while (running < 2 && queue.length > 0) {
      const item = queue.shift();
      running++;
      (async () => {
        try {
          const wait = MIN_INTERVAL - (Date.now() - lastRequestAt);
          if (wait > 0) await sleep(wait);
          lastRequestAt = Date.now();

          const result = await judgeComment(item.text, item.name, item.handle, getPostContext());
          const p = Math.max(result.spam, result.gibberish);
          CFG.stats.judged++;
          const hide = p >= CFG.threshold;
          verdictCache[item.key] = { p, ts: Date.now() };
          saveCache(); saveStats();
          console.log('[X评论过滤]', hide ? (CFG.handleMode === 'hide' ? '隐藏' : '折叠') : '放行',
            'spam=' + result.spam.toFixed(2), 'gib=' + result.gibberish.toFixed(2),
            '|', item.text.slice(0, 30));
          if (hide) { applyAction(item.node, p); CFG.stats.hidden++; saveStats(); }
        } catch (e) {
          CFG.stats.errors++; saveStats();
          console.warn('[X评论过滤] 判断失败，放行:', e.message, '|', item.text.slice(0, 30));
        } finally {
          running--;
          pump();
        }
      })();
    }
  }

  // ---------- DOM ----------

  const processed = new WeakSet();

  function getOwnHandle() {
    const a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (!a) return '';
    const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]+)/);
    return m ? '@' + m[1].toLowerCase() : '';
  }

  function getPostContext() {
    // 帖子详情页中第一个 article 通常是主帖，取其正文做上下文
    const first = document.querySelector('article[data-testid="tweet"] [data-testid="tweetText"]');
    return first ? first.innerText : '';
  }

  function applyAction(article, p) {
    if (CFG.handleMode === 'hide') {
      const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
      cell.style.display = 'none';
    } else {
      collapseNode(article, p);
    }
  }

  function collapseNode(article, p) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    if (cell.dataset.xcfCollapsed) return;
    cell.dataset.xcfCollapsed = '1';
    cell.style.display = 'none';
    const bar = document.createElement('div');
    const foldText = `🚫 已折叠疑似垃圾评论（概率 ${p.toFixed(2)}）· 点击查看`;
    bar.style.cssText = 'padding:10px 16px;color:#71767b;font:14px/1.4 sans-serif;cursor:pointer;border-bottom:1px solid #2f3336;user-select:none;';
    bar.textContent = foldText;
    bar.onclick = () => {
      const show = cell.style.display === 'none';
      cell.style.display = show ? '' : 'none';
      bar.textContent = show ? '🚫 疑似垃圾评论（已展开）· 点击重新折叠' : foldText;
    };
    cell.parentNode.insertBefore(bar, cell);
  }

  function extract(article) {
    const textEl = article.querySelector('[data-testid="tweetText"]');
    if (!textEl) return null;
    const text = textEl.innerText.trim();
    if (!text) return null;
    let handle = '';
    let name = '';
    const userEl = article.querySelector('[data-testid="User-Name"]');
    if (userEl) {
      const raw = userEl.innerText.trim();
      const m = raw.match(/@[A-Za-z0-9_]+/);
      if (m) {
        handle = m[0].toLowerCase();
        name = raw.slice(0, raw.indexOf(m[0])).trim();
      } else {
        name = raw;
      }
    }
    return { text, handle, name };
  }

  function scan() {
    if (!CFG.apiKey) return;
    if (CFG.onlyStatusPages && !location.pathname.includes('/status/')) return;
    const own = getOwnHandle();
    const examplesSig = hash53(CFG.examples.join('\n'));
    document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
      if (processed.has(article)) return;
      processed.add(article);
      const info = extract(article);
      if (!info) return;
      if (own && info.handle === own) return;
      const key = hash53(examplesSig + '|' + info.handle + '|' + info.name + '|' + info.text);
      const cached = verdictCache[key];
      if (cached) {
        CFG.stats.cacheHits++; saveStats();
        if (cached.p >= CFG.threshold) { applyAction(article, cached.p); CFG.stats.hidden++; saveStats(); }
        return;
      }
      enqueue({ key, text: info.text, handle: info.handle, name: info.name, node: article });
    });
  }

  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // SPA 路由切换后再扫一次
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; scan(); }
  }, 1000);

  ensureButton();
  if (!CFG.apiKey) {
    console.warn('[X评论过滤] 未设置 API key，请点击页面右下角 🛡 按钮打开设置面板');
    togglePanel();
  }
  scan();
})();
