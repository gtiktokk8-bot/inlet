import sys,os
from PIL import Image, ImageDraw
# usage: ba.py out.png before_dir after_dir shot1 [shot2 ...]
out,bd,ad,*names=sys.argv[1:];h=650;cols=[]
for n in names:
  for d,lab in ((bd,'BEFORE'),(ad,'AFTER')):
    f=os.path.join(d,n+'.png')
    if os.path.exists(f):cols.append((f'{lab} {n}',Image.open(f).convert('RGB')))
s=Image.new('RGB',(310*len(cols),h+18),'white')
for k,(l,i) in enumerate(cols):
  i=i.resize((300,int(i.height*300/i.width)));s.paste(i.crop((0,0,300,min(h,i.height))),(k*310,18));ImageDraw.Draw(s).text((k*310+2,3),l,fill='black')
s.save(out);print(out)
