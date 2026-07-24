const clampText = (value, fallback = '', maxLength = 280) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const formatYen = (value) => `${Math.round(asNumber(value)).toLocaleString('ja-JP')}円`;

const getTopWeek = (payload) => {
  if (!Array.isArray(payload?.weekSpends)) {
    return null;
  }
  return payload.weekSpends
    .filter((item) => asNumber(item?.amount) > 0)
    .sort((a, b) => asNumber(b?.amount) - asNumber(a?.amount))[0] ?? null;
};

const getGenreItems = (payload) =>
  Array.isArray(payload?.genreAnalytics)
    ? payload.genreAnalytics
      .map((item) => ({
        label: clampText(item?.label, '不明'),
        count: asNumber(item?.count),
        percent: asNumber(item?.percent),
        amount: asNumber(item?.amount, asNumber(item?.estimatedSpend)),
      }))
      .filter((item) => item.label !== '不明' && item.count > 0)
    : [];

const buildFallbackReport = (payload, source = 'fallback') => {
  const monthLabel = clampText(payload?.monthLabel, '今月');
  const genreItems = getGenreItems(payload);
  const topGenreItem = genreItems[0] ?? null;
  const topGenre = clampText(payload?.topGenre, topGenreItem?.label ?? 'まだ傾向なし');
  const topGenreCount = topGenreItem?.count ?? 0;
  const drawCount = asNumber(payload?.drawCount);
  const estimatedSpend = asNumber(payload?.estimatedSpend);
  const averageBudget = asNumber(payload?.averageBudget);
  const savedTotal = asNumber(payload?.saved?.total);
  const topPriceRange = clampText(payload?.priceRangeAnalytics?.[0]?.label, 'まだ少なめ');
  const activeWeek = getTopWeek(payload);
  const genreCount = genreItems.length;
  const topShare = drawCount > 0 && topGenreCount > 0 ? Math.round((topGenreCount / drawCount) * 100) : 0;
  const otherGenres = genreItems
    .slice(1, 4)
    .map((item) => item.label)
    .filter(Boolean)
    .join('・');
  const explorationLabel = genreCount >= 4
    ? 'かなり広め'
    : genreCount >= 3
      ? 'ほどよく広い'
      : genreCount >= 2
        ? '少し偏りあり'
        : 'かなり集中';

  return {
    title: `${monthLabel}の食傾向レポート`,
    summary: drawCount
      ? `${monthLabel}は${topGenre}が${topGenreCount || '複数'}回で中心ですが、${genreCount}ジャンルに分散しています。平均は約${formatYen(averageBudget)}で、気分を広げつつ価格帯は安定していました。`
      : '今月はまだ抽選履歴が少なめです。数回使うと、ジャンルの偏り・予算・お気に入りのクセまで見えるようになります。',
    mood: drawCount >= 5 ? `${topGenre}軸の探索型` : '傾向育成中',
    highlights: [
      drawCount
        ? `${topGenre}が${topGenreCount}/${drawCount}回${topShare ? `（${topShare}%）` : ''}で、今月の軸になっています。`
        : '抽選回数がまだ少ないため、食の軸はこれから見えてきます。',
      genreCount
        ? `冒険度は${explorationLabel}。${otherGenres ? `${otherGenres}にも広がりがあります。` : '次は別ジャンルを1つ混ぜると差が出ます。'}`
        : 'ジャンル履歴がまだないため、次の抽選から分布を作れます。',
      `推定外食費は約${formatYen(estimatedSpend)}、平均は約${formatYen(averageBudget)}。価格帯は${topPriceRange}に寄っています。`,
      activeWeek
        ? `${clampText(activeWeek.label)}に支出が集中。外食タイミングの山が見えています。`
        : '週ごとの偏りはまだ弱く、使うほど外食タイミングが見えてきます。',
      savedTotal
        ? `お気に入り保存は${savedTotal}件。候補を残すほど、次月の提案精度が上がります。`
        : 'お気に入り保存はまだありません。候補を1件残すだけで、次月レポートの精度が上がります。',
    ],
    recommendations: [
      `${topGenre}は残しつつ、次の3回のうち1回だけ${otherGenres ? '未開拓ジャンル' : '別ジャンル'}を固定すると、レポートに差が出ます。`,
      `次回は${topPriceRange}のまま、エリアだけ変えて抽選すると「価格は同じで発見だけ増える」動きになります。`,
      '行った店は写真かお気に入りを1つ残すと、月末スライドショーと年次レポートの材料になります。',
    ],
    nextAction: `次の抽選は「${topGenre}以外を1回だけ混ぜる」設定で回してみましょう。`,
    closingNotes: [
      `${topGenre}が多い月は、迷った時の安心枠がはっきりしています。`,
      `${drawCount}回だけでも、ジャンルの寄り方と予算のクセは見え始めています。`,
      `平均単価${formatYen(averageBudget)}は、次の店選びの基準として使いやすいラインです。`,
      otherGenres ? `${otherGenres}を混ぜているので、同じ月の中にも小さな変化があります。` : '次に別ジャンルを1つ足すと、レポートの見え方が一気に変わります。',
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
    highlights: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      minItems: 5,
      maxItems: 5,
    },
    recommendations: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      minItems: 3,
      maxItems: 3,
    },
    nextAction: { type: 'STRING' },
    closingNotes: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      minItems: 5,
      maxItems: 5,
    },
  },
  required: ['title', 'summary', 'mood', 'highlights', 'recommendations', 'nextAction', 'closingNotes'],
  propertyOrdering: ['title', 'summary', 'mood', 'highlights', 'recommendations', 'nextAction', 'closingNotes'],
};

const extractGeminiText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
};

const parseJsonText = (text) => {
  const trimmed = clampText(text, '', 8000);
  if (!trimmed) {
    throw new Error('Gemini returned empty text.');
  }
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(withoutFence);
};

const normalizeList = (value, fallback, limit) => {
  const items = Array.isArray(value)
    ? value.slice(0, limit).map((item) => clampText(String(item), '', 420)).filter(Boolean)
    : [];
  return items.length ? items : fallback;
};

const normalizeReport = (value, fallback) => ({
  title: clampText(value?.title, fallback.title, 80),
  summary: clampText(value?.summary, fallback.summary, 620),
  mood: clampText(value?.mood, fallback.mood, 80),
  highlights: normalizeList(value?.highlights, fallback.highlights, 5),
  recommendations: normalizeList(value?.recommendations, fallback.recommendations, 3),
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
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ].filter(Boolean))];
};

const buildPrompt = (payload) => `Create a paid-tier Japanese monthly food intelligence report for RANDISH Pro.

This is not a generic cheerful recap. The user must feel the report found a useful pattern they would not notice alone.

Output rules:
- Write in natural Japanese.
- Return only JSON matching the schema.
- Do not invent facts. Only use the input data.
- The input field drawCount means 外食回数. Do not output "ドロー" or "draw"; use 外食回数, お店選び, or 抽選 instead.
- If saved.total is 2, say there are 2 saved items, but do not claim all saved items belong to saved.topGenre. saved.topGenre only means the most frequent saved genre.
- Do not say a restaurant is visited, unvisited, used, unused, completed, or pending unless that exact status exists in the input.
- Avoid vague praise such as "素敵な美味しい出会い" or "大満足" unless backed by data.
- Do not give medical, nutrition, investment, or strict budgeting advice.

Required content quality:
- title: paid-report style, 18-28 Japanese characters.
- summary: 2 sentences max. Mention the strongest pattern and why it matters.
- mood: a short label naming the user's food style this month.
- highlights: exactly 5 strings. Each must be a specific insight, not a raw metric. Include genre concentration, diversity/exploration, budget pattern, week timing pattern, and saved/favorite behavior.
- recommendations: exactly 3 strings. Each must be a concrete next-month mission the user can do in RANDISH: one genre mission, one budget/area mission, and one album/favorite mission.
- nextAction: one concrete call to action for the next meal decision.
- closingNotes: exactly 5 strings. Make these feel personal and observant even when drawCount is low. Each line should be short, concrete, and make the user feel the report is carefully reading their choices.

Tone:
- Product-like and concise.
- Insightful and a little personal, not fluffy.
- Make it feel like a Pro feature worth paying for.

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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: 'You write RANDISH Pro paid monthly reports. Return only valid JSON that matches the response schema. Never use the word ドロー.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: buildPrompt(payload) }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: REPORT_SCHEMA,
            temperature: 0.55,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${detail.slice(0, 240)}`);
      }

      const data = await response.json();
      const text = extractGeminiText(data);
      try {
        return normalizeReport(parseJsonText(text), fallback);
      } catch (parseError) {
        const finishReason = data?.candidates?.[0]?.finishReason ?? 'unknown';
        console.error(
          `[ai-report] Gemini model ${model} returned invalid JSON:`,
          parseError?.message ?? parseError,
          `finishReason=${finishReason}`,
          `text=${text.slice(0, 360)}`,
        );
        throw parseError;
      }
    } catch (error) {
      lastError = error;
      console.error(`[ai-report] Gemini model ${model} failed:`, error?.message ?? error);
    }
  }

  throw lastError ?? new Error('Gemini report generation failed.');
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const payload = typeof req.body === 'object' && req.body ? req.body : {};
  const fallback = buildFallbackReport(payload);

  try {
    return res.status(200).json(await generateGeminiReport(payload, fallback));
  } catch {
    return res.status(200).json(fallback);
  }
};
