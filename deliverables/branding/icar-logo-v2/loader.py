# Loader parts: the exact symbol from build.py split into ring (spins) and dot
# (hops). The ring is centred at 50,50 in a 0..100 frame so it rotates about
# its own centre; the app draws the dot itself (components/ui/BrandLoader.tsx).
from build import taper, grad, P
d,h,t=taper()
ring=(f'<path d="{d}" fill="url(#g)"/><circle cx="{h[0]:.2f}" cy="{h[1]:.2f}" r="{h[2]}" fill="url(#g)"/>'
      f'<circle cx="{t[0]:.2f}" cy="{t[1]:.2f}" r="{t[2]}" fill="url(#g)"/>')
open('prod/loader-ring.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="240" height="240"><defs>{grad()}</defs>{ring}</svg>\n')
dx,dy=P(50,50,31,45-110*0.045)
print(f'dot centre {dx:.3f},{dy:.3f} r 10.5')
