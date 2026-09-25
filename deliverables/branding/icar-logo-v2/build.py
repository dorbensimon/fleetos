import math
BLUE1,BLUE2,INK,MINT='#2F5BFF','#19C6F0','#0A1626','#2EE6A8'
def P(cx,cy,r,a): return (cx+r*math.cos(math.radians(a)), cy-r*math.sin(math.radians(a)))
def taper(cx=50,cy=50,r=31,gap=110,w0=5,w1=21,n=140,center=45):
    a_start=center-gap/2           # tail (thin)
    sweep=360-gap                  # clockwise on screen => decreasing angle
    outer=[];inner=[]
    for i in range(n+1):
        t=i/n; e=t**1.35
        a=a_start-sweep*t; w=w0+(w1-w0)*e
        outer.append(P(cx,cy,r+w/2,a)); inner.append(P(cx,cy,r-w/2,a))
    pts=outer+inner[::-1]
    d="M"+" L".join(f"{x:.2f} {y:.2f}" for x,y in pts)+"Z"
    hx,hy=P(cx,cy,r,a_start-sweep); tx,ty=P(cx,cy,r,a_start)
    return d,(hx,hy,w1/2),(tx,ty,w0/2)
def symbol(fill='url(#g)',dot=MINT,r=31,gap=110,w0=5,w1=21,dr=10.5,cx=50,cy=50,da=None):
    d,h,t=taper(cx,cy,r,gap,w0,w1)
    dx,dy=P(cx,cy,r,da if da is not None else 45-gap*0.045)
    return (f'<path d="{d}" fill="{fill}"/><circle cx="{h[0]:.2f}" cy="{h[1]:.2f}" r="{h[2]}" fill="{fill}"/>'
            f'<circle cx="{t[0]:.2f}" cy="{t[1]:.2f}" r="{t[2]}" fill="{fill}"/>'
            f'<circle cx="{dx:.2f}" cy="{dy:.2f}" r="{dr}" fill="{dot}"/>')
def grad(id='g',a=BLUE1,b=BLUE2):
    return f'<linearGradient id="{id}" x1="0.15" y1="0.2" x2="0.9" y2="0.95"><stop offset="0" stop-color="{b}"/><stop offset="1" stop-color="{a}"/></linearGradient>'
def arcpath(cx,cy,r,a0,a1):
    x0,y0=P(cx,cy,r,a0);x1,y1=P(cx,cy,r,a1)
    return f"M{x0:.2f} {y0:.2f} A{r} {r} 0 {1 if (a1-a0)%360>180 else 0} 0 {x1:.2f} {y1:.2f}"
def word(ink,dot=MINT,ox=0,oy=0,s=13):
    return f'''<g transform="translate({ox} {oy})"><g fill="none" stroke="{ink}" stroke-width="{s}" stroke-linecap="round">
<path d="M6.5 37 V83.5"/><path d="{arcpath(55,60,23.5,42,318)}"/><circle cx="118" cy="60" r="23.5"/><path d="M141.5 37 V83.5"/><path d="M168 83.5 V60 A23 23 0 0 1 191 37"/></g>
<circle cx="6.5" cy="12.5" r="8" fill="{dot}"/></g>'''
def svg(w,h,body,bg=None,defs=None,scale=4):
    defs=defs if defs is not None else grad()
    b=f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*scale}" height="{h*scale}"><defs>{defs}</defs>{b}{body}</svg>\n'
W=330
lock=lambda ink,dot=MINT,fill='url(#g)':symbol(fill=fill,dot=dot)+word(ink,dot,ox=124,oy=4)
files={
 'icar-symbol.svg':svg(100,100,symbol()),
 'icar-symbol-mono-ink.svg':svg(100,100,symbol(fill=INK,dot=INK)),
 'icar-symbol-mono-white.svg':svg(100,100,symbol(fill='#fff',dot='#fff'),bg=INK),
 'icar-logo-light.svg':svg(W,100,lock(INK)),
 'icar-logo-dark.svg':svg(W,100,lock('#FFFFFF'),bg=INK),
 'icar-logo-dark-transparent.svg':svg(W,100,lock('#FFFFFF')),
 'icar-logo-mono.svg':svg(W,100,lock(INK,INK,INK)),
 # favicon: short mark. Ink squircle, heavier geometry for 16–32px
 'icar-favicon.svg':svg(100,100,'<rect width="100" height="100" rx="26" fill="'+INK+'"/>'+symbol(r=27,gap=118,w0=10,w1=22,dr=12),scale=5),
 'icar-app-icon.svg':svg(100,100,'<defs><radialGradient id="bgr" cx="0.3" cy="0.2" r="1"><stop offset="0" stop-color="#16294A"/><stop offset="1" stop-color="#070F1C"/></radialGradient></defs><rect width="100" height="100" fill="url(#bgr)"/>'+symbol(r=25,gap=110,w0=4.5,w1=17,dr=8.5),scale=10),
}
for k,v in files.items(): open(k,'w').write(v)
