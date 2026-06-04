const crypto = require('crypto');

const PW_HASH = 'dbd48f0dfd0fe4b5547c205ddf04f3259475a3ed6a72619790b822cc7ede0a19';
const GH_OWNER  = 'mmilte';
const GH_REPO   = 'OneFacility-tijdlijn';
const GH_FILE   = 'index.html';
const GH_BRANCH = 'main';

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password, entries } = req.body;

  // Controleer wachtwoord
  const hash = crypto.createHash('sha256').update(password || '').digest('hex');
  if (hash !== PW_HASH) {
    return res.status(401).json({ error: 'Onjuist wachtwoord' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server niet geconfigureerd' });

  try {
    // Haal huidige bestand op (SHA nodig)
    const metaRes = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}?ref=${GH_BRANCH}`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (!metaRes.ok) throw new Error(`GitHub meta fout: ${metaRes.status}`);
    const meta = await metaRes.json();

    // Haal ruwe HTML op
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_FILE}`
    );
    if (!rawRes.ok) throw new Error(`GitHub raw fout: ${rawRes.status}`);
    const rawHtml = await rawRes.text();

    // Vervang entries-array in de HTML
    const newEntries = JSON.stringify(entries, null, 2);
    const updated = rawHtml.replace(
      /let entries = \[[\s\S]*?\];/,
      `let entries = ${newEntries};`
    );

    // Push naar GitHub
    const body = JSON.stringify({
      message: `Update tijdlijn — ${new Date().toLocaleString('nl-NL')}`,
      content: Buffer.from(updated).toString('base64'),
      sha: meta.sha,
      branch: GH_BRANCH
    });

    const pushRes = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body
      }
    );
    if (!pushRes.ok) {
      const err = await pushRes.json();
      throw new Error(err.message || pushRes.status);
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};
