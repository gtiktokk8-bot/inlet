import sys,os
from PIL import Image, ImageDraw
d=sys.argv[1];names=sys.argv[2:];h=650
ims=[(n,Image.open(os.path.join(d,n+'.png')).convert('RGB')) for n in names if os.path.exists(os.path.join(d,n+'.png'))]
s=Image.new('RGB',(310*min(4,len(ims)),(h+18)*((len(ims)+3)//4)),'white')
for k,(n,i) in enumerate(ims):
  i=i.resize((300,int(i.height*300/i.width)));x=(k%4)*310;y=(k//4)*(h+18);s.paste(i.crop((0,0,300,min(h,i.height))),(x,y+16));ImageDraw.Draw(s).text((x+2,y+2),n,fill='black')
s.save(os.path.join(d,'pick.png'));print('ok')
