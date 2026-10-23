from PIL import Image, ImageDraw, ImageFont, ImageOps
import json, sys, os

# Argument : le dossier de données (DATA_DIR) qui contient campaigns.json, uploads/ et reçoit campaigns.gif.
data = sys.argv[1]
items = json.load(open(os.path.join(data, 'campaigns.json'), encoding='utf8'))
active = sorted((x for x in items if x.get('active') and x.get('image')), key=lambda x: x.get('order', 0))
W, H = 560, 190
frames = []
for item in active:
    try:
        filename = os.path.join(data, 'uploads', os.path.basename(item['image']))
        with Image.open(filename) as source:
            image = source.convert('RGB')
        # Never crop campaign copy, logos or CTA. Letterbox to shared banner ratio.
        image = ImageOps.contain(image, (W, H), method=Image.Resampling.LANCZOS)
        frame = Image.new('RGB', (W, H), '#271504')
        frame.paste(image, ((W-image.width)//2, (H-image.height)//2))
        frames.append(frame)
    except Exception as exc:
        print(str(exc), file=sys.stderr)

if not frames:
    image = Image.new('RGB', (W, H), '#271504')
    draw = ImageDraw.Draw(image)
    draw.text((24, 78), 'IAS - Institut des Algorithmes', fill='#EFC871')
    frames = [image]

dest = os.path.join(data, 'campaigns.gif')
frames[0].save(dest, format='GIF', save_all=True, append_images=frames[1:], duration=2500, loop=0, optimize=True)
print('generated', dest, len(frames))
