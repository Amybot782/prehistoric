import sys, os
from PIL import Image
import numpy as np
from scipy import ndimage
# Cuts large terrain sheets (3 tiles on top, optional left/right walls below)
# into game-size textures. Each sheet is named after its terrain, e.g. grass.png.
# Usage: python3 scripts/slice-terrain.py <sheets dir> public/assets/terrain
# (needs pillow, numpy, scipy)
D=sys.argv[1]+'/'
OUT=sys.argv[2]
# Several sheets can feed one terrain (grass.png, grass-b.png...): their tiles become extra variants.
SHEETS={f[:-4]:f[:-4].split('-')[0] for f in sorted(os.listdir(D),key=lambda f:(f[:-4].split('-')[0],'-' in f,f)) if f.endswith('.png') and not f.startswith('apercu')}
count={}
tiles={}  # key -> [(variant, pixels, sheet)]
INSET=float(os.environ.get('INSET','0.1'))  # skips the drawn outline of each tile
def comps(a):
  rgb=a[...,:3].astype(int); al=a[...,3]
  mx=rgb.max(-1); mn=rgb.min(-1)
  fg=(al>128)&~((mn>150)&(mx-mn<30))&(mx>25)
  fg=ndimage.binary_opening(fg,iterations=3)
  lab,n=ndimage.label(fg)
  sizes=ndimage.sum(fg,lab,range(1,n+1))
  return [(lab==i+1) for i in range(n) if sizes[i]>0.15*sizes.max()]
def down(img,w,h):
  return img.resize((w,h),Image.BOX)
def poly_mask(w,h,fn):
  m=np.zeros((h,w),bool)
  for y in range(h):
    for x in range(w): m[y,x]=fn(x+0.5,y+0.5)
  return m
dia=poly_mask(32,16,lambda x,y: abs(x-16)/16+abs(y-8)/8<=1)
# left face: (0,0),(16,8),(16,16),(0,8); right: (0,8),(16,0),(16,8),(0,16)
lf=poly_mask(16,16,lambda x,y: x/2<=y<=x/2+8)
rf=poly_mask(16,16,lambda x,y: 8-x/2<=y<=16-x/2)
def flat(t):
  # remove the sheet's lighting gradient so neighbouring tiles join without seams
  ys,xs=np.nonzero(dia); A=np.c_[xs-16,ys-8,np.ones(len(xs))]
  for c in range(3):
    k=np.linalg.lstsq(A,t[ys,xs,c],rcond=None)[0]
    t[...,c]-=k[0]*(np.arange(32)[None,:]-16)+k[1]*(np.arange(16)[:,None]-8)
  return np.clip(t,0,255)
def save(arr,mask,path):
  arr=arr.copy(); arr[...,3]=np.where(mask,255,0)
  Image.fromarray(arr.astype(np.uint8)).save(path)
for f,key in SHEETS.items():
  im=Image.open(D+f+'.png').convert('RGBA'); a=np.asarray(im)
  cs=comps(a)
  tops=[]; faces=[]
  for m in cs:
    ys,xs=np.nonzero(m)
    x0,x1,y0=xs.min(),xs.max(),ys.min()
    if x1-x0>ys.max()-y0: tops.append((x0,x1,y0,m))
    else: faces.append((x0,x1,y0,ys.max()))
  tops.sort(key=lambda t:t[0]); faces.sort()
  first=key not in count; count.setdefault(key,0)
  for x0,x1,y0,m in tops:
    v=count[key]; count[key]+=1
    ys,xs=np.nonzero(m)
    yl=int(np.median(ys[xs<=x0+3])); yr=int(np.median(ys[xs>=x1-3]))
    yc=(yl+yr)/2; cx=(x0+x1)/2; W=(x1-x0)*(1-2*INSET)
    box=(int(cx-W/2),int(yc-W/4),int(cx+W/2),int(yc+W/4))
    t=flat(np.asarray(down(im.crop(box),32,16)).copy().astype(float))
    tiles.setdefault(key,[]).append((v,t,f))
  for side,(x0,x1,y0,y1) in zip(['left','right'],faces if first else []):
    i=int((x1-x0)*0.03)
    t=np.asarray(down(im.crop((x0+i,y0+i,x1-i,y1-i)),16,16)).copy()
    save(t,lf if side=='left' else rf,f'{OUT}/{key}_{side}.png')
  print(f,key,len(tops),len(faces))
# Sheets of one terrain are drawn in slightly different tones: bring each sheet
# to the terrain's average colour so their tiles mix without patches.
for key,lst in tiles.items():
  mean=lambda ts: np.mean([t[dia][:,:3].mean(0) for t in ts],0)
  target=mean([t for _,t,_ in lst])
  for sheet in {f for _,_,f in lst}:
    ts=[t for _,t,f in lst if f==sheet]; d=target-mean(ts)
    for t in ts: t[...,:3]=np.clip(t[...,:3]+d,0,255)
  for v,t,_ in lst: save(t,dia,f'{OUT}/{key}_{v}.png')
print('variants',count)
