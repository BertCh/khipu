"""Canuto family: does an offset / non-decimal positional reading produce arithmetic above chance?
Readings: digit = turns - off (off in 0,2,3), base b in (5,6,10), bands = rank of knot from bottom; plus plain sums of (turns-off).
Test statistic: number of level-1 cords equal to the sum of a run of 2..6 consecutive level-1 cords (either side), vs 300 shuffles."""
import json,random,statistics,itertools
import os
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','public','data','khipus')+'/'
CORE=['KH0280','KH0281','KH0282','KH0288','KH0289','KH0271','KH0346','KH0348','KH0384','KH0103']
def readings(cord):
    seq=sorted([k for k in cord['knots'] if k['type'] in ('L','LL','BL','SP')],key=lambda k:k['pos'])
    if not seq or len(seq)!=len(cord['knots']): return None
    turns=[k['n'] for k in seq]  # top->bottom
    out={}
    for off in (0,2,3):
        d=[t-off for t in turns]
        out[f'sum-{off}']=sum(d)
        for b in (5,6,10):
            v=0
            for i,x in enumerate(reversed(d)): v+=x*(b**i)   # bottom = units
            out[f'pos{b}-{off}']=v
            v=0
            for i,x in enumerate(d): v+=x*(b**i)               # top = units
            out[f'rpos{b}-{off}']=v
    return out
def nsums(vals):
    n=len(vals); hits=0
    for i,v in enumerate(vals):
        if v is None or v<4: continue
        for L in range(2,7):
            if i+L<n and sum(x or 0 for x in vals[i+1:i+1+L])==v: hits+=1; break
            if i-L>=0 and sum(x or 0 for x in vals[i-L:i])==v: hits+=1; break
    return hits
random.seed(3)
keys=None; pooled={}
for kid in CORE:
    k=json.load(open(ROOT+kid+'.json'))
    cords=sorted([c for c in k['cords'] if c['level']==1],key=lambda c:c['ordinal'])
    R=[readings(c) for c in cords]
    keys=keys or list(next(r for r in R if r).keys())
    line=[]
    for key in keys:
        vals=[r[key] if r else None for r in R]
        obs=nsums(vals)
        sh=[]
        for _ in range(300):
            v2=vals[:]; random.shuffle(v2); sh.append(nsums(v2))
        m=statistics.mean(sh); s=statistics.pstdev(sh) or 1
        z=(obs-m)/s; pooled.setdefault(key,[]).append(z)
        line.append(f'{key}:{obs}/{m:.1f}(z{z:+.1f})')
    print(kid,' '.join(line))
print('\nPOOLED mean z per reading (10 khipus):')
for key in keys: print(f'  {key:10} {statistics.mean(pooled[key]):+.2f}  max {max(pooled[key]):+.1f}')
