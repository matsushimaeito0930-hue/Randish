const crypto = require('crypto');

const MAX_BODY_BYTES = 24_000;
const MAX_TEXT_LENGTH = 280;
const MAX_ARRAY_ITEMS = 12;

const clampText = (value, fallback = '', maxLength = MAX_TEXT_LENGTH) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clampNumber = (value, fallback = 0, min = 0, max = 10_000_000) =>
  Math.min(max, Math.max(min, asNumber(value, fallback)));

const formatYen = (value) => `${Math.round(asNumber(value)).toLocaleString('ja-JP')}円`;

const splitEnvList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const allowedOrigins = splitEnvList(process.env.AI_REPORT_ALLOWED_ORIGINS);

const getHeader = (req, name) => {
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const timingSafeEqualText = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getBearerToken = (req) => {
  const authorization = getHeader(req, 'authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const isAiReportAuthorized = (req) => {
  const expectedToken = process.env.AI_REPORT_REQUEST_TOKEN?.trim();
  if (!expectedToken) {
    return false;
  }
  const providedToken = getHeader(req, 'x-randish-ai-report-token') || getBearerToken(req);
  return timingSafeEqualText(providedToken, expectedToken);
};

const isOriginAllowed = (req) => {
  if (!allowedOrigins.length) {
    return true;
  }
  const origin = getHeader(req, 'origin');
  return !origin || allowedOrigins.includes(origin);
};

const setCorsHeaders = (req, res) => {
  const origin = getHeader(req, 'origin');
  if (origin && (!allowedOrigins.length || allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Randish-AI-Report-Token');
};

const sanitizeAnalyticsList = (value) =>
  Array.isArray(value)
    ? value.slice(0, MAX_ARRAY_ITEMS).map((item) => ({
        label: clampText(item?.label, '未分類', 80),
        count: clampNumber(item?.count, 0, 0, 365),
        percent: clampNumber(item?.percent, 0, 0, 100),
        amount: clampNumber(item?.amount ?? item?.estimatedSpend, 0),
        estimatedSpend: clampNumber(item?.estimatedSpend ?? item?.amount, 0),
      }))
    : [];

const sanitizePayload = (payload) => ({
  monthLabel: clampText(payload?.monthLabel, '今月', 40),
  drawCount: clampNumber(payload?.drawCount, 0, 0, 365),
  estimatedSpend: clampNumber(payload?.estimatedSpend, 0),
  averageBudget: clampNumber(payload?.averageBudget, 0),
  topGenre: clampText(payload?.topGenre, 'まだなし', 80),
  genreAnalytics: sanitizeAnalyticsList(payload?.genreAnalytics),
  priceRangeAnalytics: sanitizeAnalyticsList(payload?.priceRangeAnalytics),
  weekSpends: sanitizeAnalyticsList(payload?.weekSpends),
  saved: {
    total: clampNumber(payload?.saved?.total, 0, 0, 10_000),
    topGenre: clampText(payload?.saved?.topGenre, 'まだなし', 80),
    topPriceRange: clampText(payload?.saved?.topPriceRange, 'まだなし', 80),
  },
});

const getTopWeek = (payload) =>
  payload.weekSpends
    .filter((item) => asNumber(item.amount) > 0)
    .sort((a, b) => asNumber(b.amount) - asNumber(a.amount))[0] ?? null;

const buildFallbackReport = (payload, source = 'demo') => {
  const genreItems = payload.genreAnalytics.filter((item) => item.count > 0);
  const topGenreItem = genreItems[0] ?? null;
  const topGenre = payload.topGenre || topGenreItem?.label || 'まだなし';
  const drawCount = payload.drawCount;
  const estimatedSpend = payload.estimatedSpend;
  const averageBudget = payload.averageBudget;
  const topPriceRange = payload.priceRangeAnalytics[0]?.label ?? 'まだなし';
  const activeWeek = getTopWeek(payload);
  const topShare = drawCount > 0 && topGenreItem?.count ? Math.round((topGenreItem.count / drawCount) * 100) : 0;
  const otherGenres = genreItems.slice(1, 4).map((item) => item.label).filter(Boolean).join('・');
  const averageLabel = averageBudget ? `約${formatYen(averageBudget)}` : '未計測';

  return {
    title: `${payload.monthLabel}の外食傾向レポート`,
    summary: drawCount
      ? `${payload.monthLabel}は${topGenre}が中心でした。推定外食費は約${formatYen(estimatedSpend)}で、平均単価は${averageLabel}です。`
      : '今月はまだ履歴が少ないため、ルーレット結果が増えるほど傾向が見えやすくなります。',
    mood: drawCount >= 5 ? `${topGenre}軸の探索タイプ` : '傾向づくり中',
    highlights: [
      drawCount
        ? `${topGenre}が${topGenreItem?.count ?? 0}/${drawCount}回${topShare ? `（${topShare}%）` : ''}で、今月の軸になっています。`
        : '履歴が増えると、よく選ばれるジャンルが見えてきます。',
      genreItems.length >= 3
        ? `${otherGenres}にも広がりがあり、同じ月の中で選択肢を分散できています。`
        : '次は別ジャンルを1つ混ぜると、レポートの差が出やすくなります。',
      `価格帯は${topPriceRange}が中心で、平均単価は${averageLabel}です。`,
      activeWeek
        ? `${activeWeek.label}に支出が寄っていて、外食タイミングの山が見えます。`
        : '週ごとの偏りはまだ弱く、使うほど外食タイミングが見えてきます。',
      payload.saved.total
        ? `お気に入り保存は${payload.saved.total}件あり、次回の候補選びの材料になっています。`
        : 'お気に入りを1件残すだけで、来月の提案精度が上がります。',
    ],
    recommendations: [
      `${topGenre}は残しつつ、次の3回のうち1回だけ別ジャンルを指定して回してみましょう。`,
      `${topPriceRange}のまま、エリアだけ変えて抽選すると、予算を大きく崩さず発見を増やせます。`,
      '行った店は写真かお気に入りを1つ残すと、月末スライドショーと年次レポートの材料になります。',
    ],
    savingsTips: [
      averageBudget
        ? `次回は上限を${formatYen(Math.max(700, Math.round(averageBudget * 0.85)))}前後に置くと、満足感を残しながら支出を抑えやすいです。`
        : 'まずは次の3回だけ価格を残すと、節約ポイントが見えやすくなります。',
      `${topGenre}を安心枠にしつつ、高単価になりやすい外食を月1回だけランチ帯に寄せると月合計を整えやすいです。`,
      '「安くて満足」だった店をお気に入りに保存しておくと、迷った日の節約候補として使えます。',
    ],
    nextAction: `次のお店選びは「${topGenre}以外を1回だけ混ぜる」設定で回してみましょう。`,
    closingNotes: [
      `${topGenre}が多い月は、迷った時の安心枠がはっきりしています。`,
      `${drawCount}回だけでも、ジャンルの寄り方と予算のクセは見え始めています。`,
      `平均単価${averageLabel}は、次の店選びの基準として使いやすいラインです。`,
      otherGenres ? `${otherGenres}を混ぜていて、小さな変化もあります。` : '次に別ジャンルを1つ足すと、見え方が変わります。',
      '写真かお気に入りを1つ残すだけで、来月のレポートはもっと自分専用になります。',
    ],
    generatedAt: new Date().toISOString(),
    source,
  };
};

const REPORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    mood: { type: 'STRING' },
    highlights: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 5, maxItems: 5 },
    recommendations: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 3, maxItems: 3 },
    savingsTips: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 3, maxItems: 3 },
    nextAction: { type: 'STRING' },
    closingNotes: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 5, maxItems: 5 },
  },
  required: ['title', 'summary', 'mood', 'highlights', 'recommendations', 'savingsTips', 'nextAction', 'closingNotes'],
};

const extractGeminiText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts)
    ? parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join('\n').trim()
    : '';
};

const parseJsonText = (text) => {
  const trimmed = clampText(text, '', 8000)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!trimmed) {
    throw new Error('Gemini returned empty text.');
  }
  return JSON.parse(trimmed);
};

const normalizeList = (value, fallback, limit) => {
  const items = Array.isArray(value)
    ? value.slice(0, limit).map((item) => clampText(String(item), '', 420)).filter(Boolean)
    : [];
  return [...items, ...fallback].slice(0, limit);
};

const normalizeReport = (value, fallback) => ({
  title: clampText(value?.title, fallback.title, 80),
  summary: clampText(value?.summary, fallback.summary, 620),
  mood: clampText(value?.mood, fallback.mood, 80),
  highlights: normalizeList(value?.highlights, fallback.highlights, 5),
  recommendations: normalizeList(value?.recommendations, fallback.recommendations, 3),
  savingsTips: normalizeList(value?.savingsTips, fallback.savingsTips, 3),
  nextAction: clampText(value?.nextAction, fallback.nextAction, 360),
  closingNotes: normalizeList(value?.closingNotes, fallback.closingNotes, 5),
  generatedAt: new Date().toISOString(),
  source: 'gemini',
});

const sanitizeGeminiModel = (value) => {
  const model = clampText(value, '', 120).replace(/^models\//, '');
  if (!model || model.startsWith('AIza') || !/^gemini-[a-z0-9.-]+$/i.test(model)) {
    return null;
  }
  return model;
};

const resolveGeminiModels = () => {
  const preferred = sanitizeGeminiModel(process.env.GEMINI_MODEL);
  return [...new Set([
    preferred,
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash',
  ].filter(Boolean))];
};

const buildPrompt = (payload) => `Create a paid-tier Japanese monthly food intelligence report for RANDISH Pro.

Return only JSON matching the schema. Do not invent facts. Only use the input data.
Write natural Japanese. Avoid medical, nutrition, investment, or strict budgeting advice.

Required:
- title: 18-28 Japanese characters.
- summary: 2 sentences max.
- highlights: exactly 5 specific insights.
- recommendations: exactly 3 concrete next-month missions.
- savingsTips: exactly 3 practical money-saving tips.
- closingNotes: exactly 5 short, personal notes.

Input data:
${JSON.stringify(payload)}`;

const generateGeminiReport = async (payload, fallback) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ...fallback, source: 'demo' };
  }

  let lastError = null;
  for (const model of resolveGeminiModels()) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You write RANDISH Pro paid monthly reports. Return only valid JSON.' }],
          },
          contents: [{ role: 'user', parts: [{ text: buildPrompt(payload) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: REPORT_SCHEMA,
            temperature: 0.55,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}`);
      }

      return normalizeReport(parseJsonText(extractGeminiText(await response.json())), fallback);
    } catch (error) {
      lastError = error;
      console.error(`[ai-report] Gemini model ${model} failed:`, error?.message ?? error);
    }
  }

  throw lastError ?? new Error('Gemini report generation failed.');
};

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(isOriginAllowed(req) ? 204 : 403).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!isOriginAllowed(req)) {
    return res.status(403).json({ message: 'Origin is not allowed' });
  }

  const contentLength = Number(getHeader(req, 'content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ message: 'Request body is too large' });
  }

  const payload = sanitizePayload(typeof req.body === 'object' && req.body ? req.body : {});
  const fallback = buildFallbackReport(payload);

  if (!isAiReportAuthorized(req)) {
    return res.status(200).json({ ...fallback, source: 'demo' });
  }

  try {
    return res.status(200).json(await generateGeminiReport(payload, fallback));
  } catch {
    return res.status(200).json({ ...fallback, source: 'fallback' });
  }
};
