"""Build the five-minute pitch from captured application screens and narration."""
import asyncio, json, subprocess, textwrap, html
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import edge_tts
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
SCENES = json.loads((ROOT/'scenes.json').read_text())
REG='/usr/share/fonts/TTF/DejaVuSans.ttf'
BOLD='/usr/share/fonts/TTF/DejaVuSans-Bold.ttf'
BG='#09120f'; FG='#eef4e8'; GREEN='#c9efa2'; MUTED='#9baea0'; LINE='#2a4033'
def font(size,bold=False): return ImageFont.truetype(BOLD if bold else REG,size)
def run(args): subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
def wrap(draw,text,f,width):
    lines=[]
    for p in text.split('\n'):
        line=''
        for word in p.split():
            trial=(line+' '+word).strip()
            if draw.textlength(trial,font=f)>width and line:
                lines.append(line); line=word
            else: line=trial
        lines.append(line)
    return lines
def block(draw,text,xy,size,width,color=FG,bold=False,gap=1.25):
    x,y=xy; f=font(size,bold)
    for line in wrap(draw,text,f,width):
        draw.text((x,y),line,font=f,fill=color); y+=int(size*gap)
    return y
def frame(i,s):
    im=Image.new('RGB',(1920,1080),BG); d=ImageDraw.Draw(im)
    for y in range(1080):
        a=int(7*(1-y/1080)); d.line((0,y,1920,y),fill=(9+a,18+a,15+a))
    d.rounded_rectangle((64,49,109,94),radius=10,outline=GREEN,width=3)
    d.text((77,55),'B',font=font(26,True),fill=GREEN)
    d.text((126,53),'BlindPass',font=font(32,True),fill=FG)
    d.text((65,120),s['section'],font=font(21,True),fill=GREEN)
    d.text((1615,58),f'{i+1:02d} / 15   •   5:00',font=font(22),fill=MUTED)
    d.line((65,104,1855,104),fill=LINE,width=2)
    if s.get('image'):
        y=block(d,s['title'],(65,224),57,520,bold=True)
        y+=55
        for point in s['points']:
            d.ellipse((67,y+10,75,y+18),fill=GREEN)
            y=block(d,point,(93,y),28,455,color=MUTED)+28
        screen=Image.open(ASSETS/(s['image']+'.png')).convert('RGB').resize((1232,770),Image.Resampling.LANCZOS)
        d.rounded_rectangle((612,150,1858,936),radius=18,fill=LINE)
        im.paste(screen,(619,158))
        d.text((66,858),'CAPTURED FROM THE RUNNING APP',font=font(18),fill=GREEN)
        d.text((66,886),'Payment simulation · real credentials',font=font(17),fill=MUTED)
    else:
        block(d,s['title'],(65,189),80,1670,bold=True,gap=1.15)
        for n,p in enumerate(s['points']):
            x=65+n*605
            d.rounded_rectangle((x,504,x+570,775),radius=24,fill='#13221a',outline=LINE,width=2)
            d.text((x+30,530),f'0{n+1}',font=font(28),fill=GREEN)
            block(d,p,(x+30,595),34,502,bold=True)
        note={
            'problem':'The opportunity: separate permission from purchase identity.',
            'flow':'PAYMENT  →  BLIND ISSUANCE  →  SINGLE-USE ACCESS',
            'layers':'Protocol unlinkability is one layer of privacy.',
            'developer':'Implemented in this repository · SDK packages are not yet published to npm',
            'roadmap':'Roadmap items · not claims of completed production deployment',
            'close':'A working prototype. A clear boundary. A practical next step.'
        }.get(s['kind'],'')
        block(d,note,(65,835),27,1760,color=MUTED)
    d.rectangle((0,960,1920,1080),fill='#060b09')
    d.rectangle((0,1075,int(1920*(i+1)/15),1079),fill=GREEN)
    im.save(ASSETS/f'frame-{i:02}.png')

async def voice(i,s,sem):
    async with sem:
        target=ASSETS/f'voice-{i:02}.mp3'; meta=ASSETS/f'words-{i:02}.json'
        if target.exists() and meta.exists(): return
        words=[]
        for attempt in range(3):
            try:
                with target.open('wb') as out:
                    stream=edge_tts.Communicate(s['speech'],'en-US-AndrewNeural',rate='+0%',boundary='WordBoundary')
                    async for chunk in stream.stream():
                        if chunk['type']=='audio': out.write(chunk['data'])
                        elif chunk['type']=='WordBoundary': words.append(chunk)
                meta.write_text(json.dumps(words)); print(f'Voice {i+1}/15 ready',flush=True); return
            except Exception:
                words=[]
                if attempt==2: raise
                await asyncio.sleep(2)

def stamp(t,ass=False):
    h=int(t//3600); m=int(t%3600//60); sec=t%60
    if ass: return f'{h}:{m:02}:{sec:05.2f}'
    return f'{h:02}:{m:02}:{int(sec):02},{int((sec-int(sec))*1000):03}'

def prepare(i,s):
    mp3=ASSETS/f'voice-{i:02}.mp3'
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(mp3)]))
    speed=max(0.93,duration/18.7)
    words=json.loads((ASSETS/f'words-{i:02}.json').read_text())
    original=s['speech'].split()
    cues=[]
    for n in range(0,len(words),11):
        chunk=words[n:n+11]
        start=.55+chunk[0]['offset']/1e7/speed
        end=min(19.6,.55+(chunk[-1]['offset']+chunk[-1]['duration'])/1e7/speed+.12)
        if n+11<len(words):
            end=min(end,.55+words[n+11]['offset']/1e7/speed-.01)
        content=' '.join(original[n:n+11]) if len(original)==len(words) else html.unescape(' '.join(w['text'] for w in chunk))
        cues.append((start,end,content))
    ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,34,&H00F2F5EE,&H00FFFFFF,&H00060B09,&H00060B09,0,0,0,0,100,100,0,0,1,1,0,2,100,100,34,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    for start,end,content in cues:
        ass+=f'Dialogue: 0,{stamp(start,True)},{stamp(end,True)},Default,,0,0,0,,{content}\n'
    (ASSETS/f'captions-{i:02}.ass').write_text(ass)
    return speed,cues

def render(i,s,speed):
    target=ASSETS/f'segment-{i:02}.mp4'
    vf=f"zoompan=z='1+0.000012*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=24,subtitles={ASSETS}/captions-{i:02}.ass,fade=t=in:st=0:d=0.25,fade=t=out:st=19.75:d=0.25"
    run(['ffmpeg','-y','-loop','1','-framerate','24','-i',str(ASSETS/f'frame-{i:02}.png'),'-i',str(ASSETS/f'voice-{i:02}.mp3'),'-vf',vf,'-af',f'atempo={speed},adelay=550|550,apad','-t','20','-c:v','libx264','-preset','ultrafast','-crf','22','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000',str(target)])
    print(f'Render {i+1}/15 ready',flush=True)

async def main():
    for i,s in enumerate(SCENES): frame(i,s)
    sem=asyncio.Semaphore(3)
    await asyncio.gather(*(voice(i,s,sem) for i,s in enumerate(SCENES)))
    prepared=[prepare(i,s) for i,s in enumerate(SCENES)]
    srt=''; count=0; script='# BlindPass — five-minute demo pitch\n\nEnglish synthetic narration: en-US-AndrewNeural. Captured local application; simulated payments.\n\n'
    for i,s in enumerate(SCENES):
        script+=f"## {i*20//60:02}:{i*20%60:02} — {s['section']}\n\n{s['speech']}\n\n"
        for start,end,content in prepared[i][1]:
            count+=1; srt+=f'{count}\n{stamp(i*20+start)} --> {stamp(i*20+end)}\n{content}\n\n'
    (ROOT/'blindpass-pitch.srt').write_text(srt)
    (ROOT/'narration.md').write_text(script)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda x:render(x,SCENES[x],prepared[x][0]),range(15)))
    (ASSETS/'concat.txt').write_text(''.join(f"file 'segment-{i:02}.mp4'\n" for i in range(15)))
    run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(ASSETS/'concat.txt'),'-c','copy','-movflags','+faststart',str(ROOT/'blindpass-5-minute-pitch.mp4')])
    print('COMPLETE',flush=True)

if __name__=='__main__': asyncio.run(main())
