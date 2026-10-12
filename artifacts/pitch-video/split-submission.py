"""Build separate two-minute pitch and three-minute demo from verified captures."""
import concurrent.futures
import json
from pathlib import Path
import re
import subprocess

SOURCE = Path(__file__).resolve().parent
OUTPUT = SOURCE.parent / 'submission-videos'
SCENES = json.loads((SOURCE / 'scenes.json').read_text())
FONT = subprocess.check_output(['fc-match', 'DejaVuSans', '-f', '%{file}'], text=True)
EDITS = {
    'pitch': [1, 2, 11, 12, 13, 14],
    'demo': [3, 4, 5, 6, 7, 8, 9, 10, 11],
}


def run(args):
    subprocess.run(args, check=True)


def seconds(stamp):
    hours, minutes, tail = stamp.split(':')
    return int(hours) * 3600 + int(minutes) * 60 + float(tail.replace(',', '.'))


def stamp(seconds_value):
    milliseconds = round(seconds_value * 1000)
    return f'{milliseconds // 3600000:02}:{milliseconds // 60000 % 60:02}:{milliseconds // 1000 % 60:02},{milliseconds % 1000:03}'


def render(kind, position, source_index):
    total = len(EDITS[kind])
    label = f'{kind.upper()}   {position + 1:02}/{total:02}   {total * 20 // 60} MIN'
    filters = (
        'drawbox=x=1490:y=35:w=410:h=65:color=0x0f1815:t=fill,'
        f"drawtext=fontfile='{FONT}':text='{label}':x=1530:y=58:fontsize=22:fontcolor=0x9baea0,"
        'drawbox=x=0:y=1074:w=1920:h=6:color=0x060b09:t=fill,'
        f'drawbox=x=0:y=1075:w={round(1920 * (position + 1) / total)}:h=5:color=0xc9efa2:t=fill'
    )
    target = OUTPUT / 'segments' / f'{kind}-{position:02}.mp4'
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(SOURCE / 'assets' / f'segment-{source_index:02}.mp4'),
         '-vf', filters, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-threads', '2',
         '-pix_fmt', 'yuv420p', '-c:a', 'copy', str(target)])
    print(f'{kind}: chapter {position + 1}/{total} complete', flush=True)


def main():
    (OUTPUT / 'segments').mkdir(parents=True, exist_ok=True)
    jobs = [(kind, pos, index) for kind, indices in EDITS.items() for pos, index in enumerate(indices)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(lambda job: render(*job), jobs))
    original_cues = []
    for block in re.split(r'\n\s*\n', (SOURCE / 'blindpass-pitch.srt').read_text().strip()):
        lines = block.splitlines()
        start, end = lines[1].split(' --> ')
        original_cues.append((seconds(start), seconds(end), '\n'.join(lines[2:])))
    for kind, indices in EDITS.items():
        minutes = len(indices) * 20 // 60
        basename = f'blindpass-{kind}-{minutes}min'
        concat = OUTPUT / 'segments' / f'{kind}-concat.txt'
        concat.write_text(''.join(f"file '{kind}-{pos:02}.mp4'\n" for pos in range(len(indices))))
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat),
             '-c', 'copy', '-movflags', '+faststart', str(OUTPUT / f'{basename}.mp4')])
        cues = []
        script = f'# BlindPass — {minutes}-minute {kind}\n\n'
        for pos, source_index in enumerate(indices):
            scene = SCENES[source_index]
            script += f"## {pos * 20 // 60:02}:{pos * 20 % 60:02} — {scene['section']}\n\n{scene['speech']}\n\n"
            for start, end, words in original_cues:
                if source_index * 20 <= start < (source_index + 1) * 20:
                    offset = (pos - source_index) * 20
                    cues.append(f'{len(cues) + 1}\n{stamp(start + offset)} --> {stamp(end + offset)}\n{words}\n')
        (OUTPUT / f'{basename}.srt').write_text('\n'.join(cues))
        (OUTPUT / f'{basename}-script.md').write_text(script)
        print(f'Created {basename}.mp4', flush=True)


if __name__ == '__main__':
    main()
