// 別途用意する素材の差し込み口。
//   顔画像： public/assets/portraits/<話し手>.png  （player / moku / momo）
//   ムービー：public/assets/movies/<id>.mp4        （opening / dragon-arrival など。story.ts の STORY_MOVIE）
// ファイルが無ければ、顔はドット絵で代用し、ムービーは「未設定」の札を短く出して先へ進む。

const portraits = new Map<string, HTMLImageElement | null>();

export function preloadPortraits(ids: string[]): void {
  for (const id of ids) {
    if (portraits.has(id)) continue;
    portraits.set(id, null);
    const img = new Image();
    img.onload = () => portraits.set(id, img);
    img.src = `assets/portraits/${id}.png`;
  }
}

export function portrait(id: string): HTMLImageElement | null {
  return portraits.get(id) ?? null;
}

export async function movieExists(id: string): Promise<boolean> {
  try {
    const r = await fetch(`assets/movies/${id}.mp4`, { method: 'HEAD' });
    return r.ok && (r.headers.get('content-type') ?? '').startsWith('video');
  } catch {
    return false;
  }
}

/** ムービーを全画面で再生する。終わるか、決定・キャンセルで飛ばすと resolve */
export function playMovie(id: string): Promise<void> {
  const video = document.getElementById('movie') as HTMLVideoElement;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.remove('show');
      window.removeEventListener('keydown', onKey, true);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['Enter', 'Space', 'KeyZ', 'KeyX', 'Escape'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    video.onended = finish;
    video.onerror = finish;
    video.src = `assets/movies/${id}.mp4`;
    video.classList.add('show');
    window.addEventListener('keydown', onKey, true);
    video.play().catch(finish);
  });
}
