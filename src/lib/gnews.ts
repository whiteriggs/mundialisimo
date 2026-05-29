export type NewsArticle = {
  title: string;
  description: string | null;
  source: string;
};

/**
 * Fetches recent news for a list of team names from GNews API.
 * Uses a single request with OR-joined query to stay within free tier limits.
 * Returns up to `max` articles.
 */
export async function fetchTeamNews(teams: string[], max = 8): Promise<NewsArticle[]> {
  const apiKey = process.env.NEXT_PUBLIC_GNEWS_API_KEY;
  if (!apiKey) return [];
  if (teams.length === 0) return [];

  const query = teams.map(t => `"${t}"`).join(" OR ");
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=es&max=${max}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as { articles?: { title: string; description: string | null; source: { name: string } }[] };
    return (data.articles ?? []).map(a => ({
      title: a.title,
      description: a.description ?? null,
      source: a.source.name,
    }));
  } catch {
    return [];
  }
}
