from PIL import Image,ImageDraw,ImageFont,ImageOps
import json,sys,os
root=sys.argv[1]; items=json.load(open(os.path.join(root,'data','campaigns.json'),encoding='utf8'))
active=[x for x in items if x.get('active') and x.get('image')]
W,H=560,190
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(fontpath,24)
frames=[]
for item in active:
 try:
  f=os.path.join(root,'public',item['image'].lstrip('/'))
  im=Image.open(f).convert('RGB')
  im=ImageOps.fit(im,(W,H),method=Image.Resampling.LANCZOS,centering=(.5,.5))
  frames.append(im)
 except Exception as e: print(e,file=sys.stderr)
if not frames:
 im=Image.new('RGB',(W,H),'#271504');d=ImageDraw.Draw(im)
 d.text((30,70),'IAS • Institut des Algorithmes',font=font,fill='#EFC871');frames=[im]
p=os.path.join(root,'public','assets','campaigns.gif')
frames[0].save(p,save_all=True,append_images=frames[1:],duration=2500,loop=0,optimize=True)
print('generated',p,len(frames))
