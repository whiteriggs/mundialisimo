export type NewsArticle = {
  team: string;
  title: string;
  description: string | null;
  source: string;
};

/**
 * Fetches 1 recent football news article per team from GNews API.
 * One request per team so each team is guaranteed its own article.
 */
export async function fetchTeamNews(teams: string[]): Promise<NewsArticle[]> {
  const apiKey = process.env.NEXT_PUBLIC_GNEWS_API_KEY;
  if (!apiKey || teams.length === 0) return [];

  const results = await Promise.all(
    teams.map(async (team): Promise<NewsArticle[]> => {
      const query = `${team} fútbol`;
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=es&max=1&sortby=publishedAt&apikey=${apiKey}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return [];
        const data = await res.json() as { articles?: { title: string; description: string | null; source: { name: string } }[] };
        return (data.articles ?? []).slice(0, 1).map(a => ({
          team,
          title: a.title,
          description: a.description ?? null,
          source: a.source.name,
        }));
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}
