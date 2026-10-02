"""zoom.py n x0 y0 x1 y1 [scale] [fg]: crop of the window (1x coords) at scale with a 10 px grid, labels every 20 px;
with fg, the current fg_<n>.npy boundary is drawn in yellow."""
import sys, numpy as np, os
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
sys.path.insert(0,'.')
from neo1_segment import load
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',12)
n,x0,y0,x1,y1=[int(v) for v in sys.argv[1:6]]; s=int(sys.argv[6]) if len(sys.argv)>6 else 4
c=load(n)[y0:y1,x0:x1]; H,W=c.shape[:2]
a=np.asarray(Image.fromarray((c*255).astype(np.uint8)).resize((W*s,H*s),Image.BICUBIC)).astype(np.float32)
if len(sys.argv)>7 and os.path.exists(os.path.join(os.environ.get('NEO1_SEG_OUT','_seg'),f'fg_{n}.npy')):
    fg=np.load(os.path.join(os.environ.get('NEO1_SEG_OUT','_seg'),f'fg_{n}.npy'))[y0:y1,x0:x1]
    FM=np.kron(fg,np.ones((s,s),bool)); a[FM]=a[FM]*0.5+np.array([255,0,60])*0.5
    e=np.kron(fg^ndi.binary_erosion(fg),np.ones((s,s),bool)); a[e]=a[e]*0.3+np.array([255,235,0])*0.7
for gx in range(0,W):
    if (gx+x0)%10==0: a[:,gx*s]=a[:,gx*s]*0.5+np.array([255,0,255])*0.5
for gy in range(0,H):
    if (gy+y0)%10==0: a[gy*s,:]=a[gy*s,:]*0.5+np.array([255,0,255])*0.5
im=Image.fromarray(a.astype(np.uint8)); dr=ImageDraw.Draw(im)
for gx in range(0,W):
    if (gx+x0)%20==0: dr.text((gx*s+2,1),str(gx+x0),font=F,fill=(255,255,255),stroke_width=2,stroke_fill=(0,0,0))
for gy in range(0,H):
    if (gy+y0)%20==0 and gy>8: dr.text((1,gy*s+1),str(gy+y0),font=F,fill=(255,255,255),stroke_width=2,stroke_fill=(0,0,0))
im.save(os.path.join(os.environ.get('NEO1_SEG_OUT','_seg'),f'z_{n}.png')); print(im.size)
