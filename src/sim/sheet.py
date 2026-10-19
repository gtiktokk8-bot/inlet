import sys,os
from PIL import Image, ImageDraw
d=sys.argv[1]
G={'A':['p1-triage-1-people','p1-triage-2-jordan','p1-triage-6-sent','p1-triage-8-feed','p1-triage-10-ring','p3-group-1-thread','p12-person-1-info','p10-compose-1-sheet'],
   'B':['p8-dark-1-people','p8-dark-2-conv','p8-dark-3-feed','p8-dark-4-ring','p8-dark-5-settings','p6-empty-1','p5-nomcp-1','p5-reply-toolerr-1'],
   'D':['p13-swipe-1-right','p13-swipe-2-left','p14-calendar-1-sheet','p15-noai-1-conv','p15-noai-2-settings','p16-feedzero-1-cleared','p17-settings-1','p18-bottommenu-1-menu'],
   'E':['p1-triage-2b-more','p1-triage-3-catchup','p1-triage-5-sending','p19-moments-1-celebrate','p19-moments-2-toast','p20-longdraft-1','p21-scam-1-conv','p22-darksmall-1-group'],
   'C':['p2-react-1-menu','p4-edge-Dana','p11-search-1','p12-person-2-snooze','p9-small-1-people','p9-small-2-conv','p7-heavy-1-scrolled','p6-empty-3-ring']}
for g,names in G.items():
  ims=[];lab=[]
  for n in names:
    f=os.path.join(d,n+'.png')
    if os.path.exists(f):i=Image.open(f).convert('RGB');ims.append(i.resize((300,int(i.height*300/i.width))));lab.append(n)
  h=650;s=Image.new('RGB',(1230,(h+18)*2),'white')
  for k,i in enumerate(ims):
    x=(k%4)*310;y=(k//4)*(h+18);s.paste(i.crop((0,0,300,min(h,i.height))),(x,y+16));ImageDraw.Draw(s).text((x+2,y+2),lab[k],fill='black')
  s.save(os.path.join(d,g+'.png'))
print('ok')
