// Turns each recommendation into a one-sentence reason.
// Rules decide the move; the text only explains it. If ANTHROPIC_API_KEY is set,
// Claude rewrites the sentence from the same facts; otherwise the template stands.

const pos = p => (p.pos === 'DST' ? 'defense' : p.pos === 'K' ? 'kicker' : p.pos);
const pts = n => n.toFixed(1);

export function facts(rec, week) {
  return {
    add: `${rec.add.name} (${rec.add.pos}, ${rec.add.proTeam})`,
    drop: rec.drop ? `${rec.drop.name} (${rec.drop.pos})` : null,
    gainThisWeek: +rec.gainNow.toFixed(1),
    gainNextWeek: +rec.gainNext.toFixed(1),
    coversByeInWeek: rec.coversBye ? week + 1 : null,
    playerOnBye: rec.coversBye ? rec.byePlayer : null,
    ownershipChange: rec.add.pctChange,
    call: rec.advice.label,
    callReason: rec.advice.why,
  };
}

export function templateReason(rec, week) {
  const addPos = pos(rec.add);
  let lead;
  if (rec.coversBye && rec.gainNow < 1) {
    lead = `Covers your ${addPos} slot while ${rec.byePlayer} is on bye in Week ${week + 1}`;
  } else if (rec.coversBye) {
    lead = `Covers ${rec.byePlayer}'s Week ${week + 1} bye and adds ${pts(rec.gainNow)} projected points this week`;
  } else if (rec.gainNow >= rec.gainNext) {
    lead = `Adds ${pts(rec.gainNow)} projected points to your Week ${week} lineup at ${addPos}`;
  } else {
    lead = `Strengthens your Week ${week + 1} lineup by ${pts(rec.gainNext)} projected points at ${addPos}`;
  }
  const why = rec.advice.why.charAt(0).toUpperCase() + rec.advice.why.slice(1);
  return `${lead}. ${why}.`;
}

export async function writeReasons(recs, week) {
  const fallback = recs.map(r => templateReason(r, week));
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || recs.length === 0) return { reasons: fallback, source: 'template' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 600,
        system: 'You write one-sentence waiver-wire explanations for a fantasy football manager. Use only the facts given; never invent stats, injuries or news. Plain, confident, under 30 words each. Respond with only a JSON array of strings, one per move, in order.',
        messages: [{ role: 'user', content: JSON.stringify(recs.map(r => facts(r, week))) }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}`);
    const data = await res.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g, '').trim();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr) || arr.length !== recs.length) throw new Error('Unexpected reason format');
    return { reasons: arr.map(String), source: 'claude' };
  } catch (err) {
    console.warn('Reason writer fell back to templates:', err.message);
    return { reasons: fallback, source: 'template' };
  }
}
