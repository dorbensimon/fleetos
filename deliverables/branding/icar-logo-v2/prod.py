# Production assets for the app/web, generated from build.py's geometry.
import math, os
from build import symbol, word, taper, P, grad, INK, MINT
OUT='prod'; os.makedirs(OUT,exist_ok=True)
BGR='<radialGradient id="bgr" cx="0.3" cy="0.2" r="1"><stop offset="0" stop-color="#16294A"/><stop offset="1" stop-color="#070F1C"/></radialGradient>'
def svg(vb,body,defs='',px=None):
    x,y,w,h=vb; px=px or (w,h)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{px[0]}" height="{px[1]}"><defs>{grad()}{BGR}{defs}</defs>{body}</svg>\n'
# exact symbol bounds (default geometry)
d,h,t=taper(); pts=[tuple(map(float,p.split())) for p in d[1:-1].split(' L')]
dx,dy=P(50,50,31,45-110*0.045)
xs=[p[0] for p in pts]+[h[0]-h[2],h[0]+h[2],t[0]-t[2],t[0]+t[2],dx-10.5,dx+10.5]
ys=[p[1] for p in pts]+[h[1]-h[2],h[1]+h[2],t[1]-t[2],t[1]+t[2],dy-10.5,dy+10.5]
sx0,sx1,sy0,sy1=min(xs),max(xs),min(ys),max(ys)
# lockup bounds: symbol + wordmark (ox=124, oy=4): x 124..321.5, y 8.5..94
L=(math.floor(sx0*10)/10, math.floor(min(sy0,8.5)*10)/10); R=(321.5, max(sy1,94))
vb=(L[0]-1,L[1]-1,R[0]-L[0]+2,R[1]-L[1]+2)
print('symbol bounds',round(sx0,2),round(sy0,2),round(sx1,2),round(sy1,2),'lockup vb',[round(v,2) for v in vb])
def centered(**k):
    r=k.get('r',31);gap=k.get('gap',110);w0=k.get('w0',5);w1=k.get('w1',21);dr=k.get('dr',10.5)
    d,h,t=taper(50,50,r,gap,w0,w1); pts=[tuple(map(float,p.split())) for p in d[1:-1].split(' L')]
    dx,dy=P(50,50,r,45-gap*0.045)
    xs=[p[0] for p in pts]+[h[0]-h[2],h[0]+h[2],t[0]-t[2],t[0]+t[2],dx-dr,dx+dr]
    ys=[p[1] for p in pts]+[h[1]-h[2],h[1]+h[2],t[1]-t[2],t[1]+t[2],dy-dr,dy+dr]
    ox=50-(min(xs)+max(xs))/2; oy=50-(min(ys)+max(ys))/2
    return f'<g transform="translate({ox:.2f} {oy:.2f})">'+symbol(**k)+'</g>'
lock=lambda ink:symbol()+word(ink,ox=124,oy=4)
files={
 'logo-on-light.svg':svg(vb,lock(INK)),
 'logo-on-dark.svg':svg(vb,lock('#FFFFFF')),
 # app icon, full-bleed opaque square (iOS / apple-touch / maskable base)
 'app-icon-square.svg':svg((0,0,100,100),'<rect width="100" height="100" fill="url(#bgr)"/>'+centered(r=25,gap=110,w0=4.5,w1=17,dr=8.5)),
 # rounded app icon with transparent corners (favicon, manifest "any")
 'app-icon-rounded.svg':svg((0,0,100,100),'<rect width="100" height="100" rx="22.5" fill="url(#bgr)"/>'+centered(r=25,gap=110,w0=4.5,w1=17,dr=8.5)),
 # small-size favicon: same icon, heavier strokes so it survives 16px
 'favicon-small.svg':svg((0,0,100,100),'<rect width="100" height="100" rx="22" fill="url(#bgr)"/>'+centered(r=27,gap=118,w0=10,w1=22,dr=12)),
 # maskable: full bleed, symbol inside the 80% safe circle
 'maskable.svg':svg((0,0,100,100),'<rect width="100" height="100" fill="url(#bgr)"/>'+centered(r=25,gap=110,w0=4.5,w1=17,dr=8.5)),
 # Android adaptive foreground: transparent, symbol inside the 66% safe zone
 'adaptive-foreground.svg':svg((0,0,100,100),centered(r=20,gap=110,w0=3.6,w1=13.6,dr=6.8)),
 # splash: symbol only, transparent, centred with margin
 'splash-symbol.svg':svg((0,0,100,100),centered(r=31,gap=110,w0=5,w1=21,dr=10.5)),
}
for k,v in files.items(): open(f'{OUT}/{k}','w').write(v)
