"""Refresh the starter-story catalog after adding audio to example-stories/. Python 3 only."""
from pathlib import Path
import hashlib, json, re, wave

ROOT = Path(__file__).resolve().parent
FOLDER = ROOT / 'example-stories'
EXTENSIONS = {'.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.webm'}
DEFAULTS = {
    'hello.mp3': ('demo-hello', 'A little hello', 'bear', 'Hello, little listener. Welcome to StoryTouch. A familiar voice can take you anywhere. Find a comfortable spot, take a slow breath, and let a little story begin.'),
    'chimes.wav': ('demo-chimes', 'A pocketful of stars', 'moon', '[Gentle musical chimes. No speech.]'),
    'rain.wav': ('demo-rain', 'Rain in the garden', 'leaf', '[Soft simulated rain. No speech.]')
}

def prepare():
    FOLDER.mkdir(exist_ok=True)
    entries = []
    for p in sorted(FOLDER.rglob('*')):
        if not p.is_file() or p.is_symlink() or p.suffix.lower() not in EXTENSIONS: continue
        relative = p.relative_to(FOLDER).as_posix()
        if p.stat().st_size > 100 * 1024 * 1024: raise ValueError('Audio exceeds 100 MB: ' + relative)
        fallback = ('starter-' + hashlib.sha256(relative.encode()).hexdigest()[:20], re.sub(r'[_-]+', ' ', p.stem).strip()[:100] or 'Starter story', 'book', '')
        id, title, symbol, transcript = DEFAULTS.get(relative, fallback)
        text = p.with_suffix('.txt')
        if text.exists(): transcript = text.read_text(encoding='utf-8')[:20000]
        duration = 0
        if p.suffix.lower() == '.wav':
            with wave.open(str(p)) as w: duration = w.getnframes()/w.getframerate()
        entries.append({'id':id,'title':title,'symbol':symbol,'transcript':transcript,'duration':duration,'file':relative})
    if len(entries) > 2000: raise ValueError('Keep the starter folder below 2,000 audio files.')
    catalog = json.dumps({'version':1,'stories':entries},ensure_ascii=False,indent=2)+'\n'
    (FOLDER/'stories.json').write_text(catalog,encoding='utf-8')
    # Changing folder contents also changes the service-worker release cache identifier.
    digest = hashlib.sha256(catalog.encode())
    for item in entries: digest.update((FOLDER/item['file']).read_bytes())
    sw = ROOT/'sw.js'
    if sw.exists():
        script=sw.read_text(encoding='utf-8')
        script=re.sub(r"const EXAMPLE_REV = '[^']*';", "const EXAMPLE_REV = '"+digest.hexdigest()[:12]+"';",script)
        sw.write_text(script,encoding='utf-8')
    return len(entries)

if __name__ == '__main__': print(f'Ready: {prepare()} starter audio files. Deploy the whole StoryTouch folder.')
