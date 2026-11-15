/** A link that opens `mode` with `code` on the stage (main.ts reads ?mode=<id>&code=<text>). */
export function shareUrl(mode: string, code: string): string {
  const u = new URL(location.pathname, location.origin);
  u.searchParams.set('mode', mode);
  u.searchParams.set('code', code);
  return u.href;
}

/**
 * The system share sheet where there is one, else the clipboard. Call it straight from a click:
 * both need the tap (user activation), so nothing may be awaited before.
 */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share && navigator.canShare?.({ title, url }) !== false) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'; // closed the sheet
      // no share target, or the sheet refused: the clipboard still works
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
