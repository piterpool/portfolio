export default async function handler(req, res) {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    return res.status(500).json({ error: 'Missing NOTION_TOKEN or NOTION_DATABASE_ID in environment variables.' });
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          property: 'Published',
          checkbox: { equals: true }
        },
        sorts: [{ property: 'Date', direction: 'descending' }]
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.message || 'Notion API error' });
    }

    const data = await response.json();

    const thoughts = data.results.map(page => ({
      id: page.id,
      title: page.properties.Name?.title?.[0]?.plain_text || '',
      body: (page.properties.Body?.rich_text || []).map(t => t.plain_text).join(''),
      date: page.properties.Date?.date?.start || page.created_time.split('T')[0],
    }));

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ thoughts });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
