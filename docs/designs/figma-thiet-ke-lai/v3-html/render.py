import subprocess, sys, os
from PIL import Image
CH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
D = os.path.dirname(os.path.abspath(__file__))
OUT = r"C:\project_v2\docs\designs\figma-thiet-ke-lai"
for name in sys.argv[1:]:
    src, dst = name.split('=')
    tmp = os.path.join(D, src + '.png')
    subprocess.run([CH, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                    '--window-size=1440,4200', '--virtual-time-budget=4000', f'--screenshot={tmp}',
                    'file:///' + os.path.join(D, src + '.html').replace('\\', '/')], check=True, capture_output=True)
    im = Image.open(tmp).convert('RGB')
    w, h = im.size
    bg = im.getpixel((w - 1, h - 1))
    px = im.load()
    last = h - 1
    while last > 0 and all(px[x, last] == bg for x in range(0, w, 7)):
        last -= 1
    im.crop((0, 0, w, min(h, last + 24))).save(os.path.join(OUT, dst + '.png'))
    print(dst, w, last + 24)
