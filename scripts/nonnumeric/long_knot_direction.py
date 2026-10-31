#!/usr/bin/env python3
"""Family C part 2b: direction of the UNITS knot (L/E) as the variable, since S-clusters are almost always Z."""
import json, glob, collections, random, sys, statistics
ROOT='/Users/roc8917/Documents/GitHub/khipu/public/data/khipus'
ks=[json.load(open(p)) for p in sorted(glob.glob(ROOT+'/KH*.json'))]
NPERM=1000
CLUSTER={'S','E','EE','TF'}
def seq(c): return sorted(c['knots'],key=lambda x:x['pos'])
def kd(x):
    d=x['dir']
    if len(d)>1: return [ch for ch in d]
    return [d]*(x['n'] if x['type'] in CLUSTER else 1)
def basecolor(c):
    cp=c.get('colorParsed'); return cp[0]['codes'][0] if cp else (c['color'] or '?')
def chi2(xs,ys):
    ct=collections.Counter(zip(xs,ys)); rx=collections.Counter(xs); ry=collections.Counter(ys); n=len(xs); s=0
    for a in rx:
        for b in ry:
            e=rx[a]*ry[b]/n; s+=(ct[(a,b)]-e)**2/e
    return s
def perm_p(xs,ys,seed):
    obs=chi2(xs,ys); rng=random.Random(seed); ys=list(ys); ge=0
    for _ in range(NPERM):
        rng.shuffle(ys)
        if chi2(xs,ys)>=obs-1e-12: ge+=1
    return (ge+1)/(NPERM+1)
def level1(k): return sorted((c for c in k['cords'] if c['level']==1), key=lambda c:(c['group'] if c.get('group') is not None else 1e9, c['ordinal']))
def group_pos(c,k):
    if c.get('group') is None: return 'none'
    g=k['groups'][c['group']]
    if g['n']==1: return 'solo'
    return 'first' if c['ordinal']==g['first'] else ('last' if c['ordinal']==g['last'] else 'mid')
def units_knot(c):
    s=seq(c)
    if not s: return None
    u=[x for x in s if x['type'] in ('L','E')]
    if not u: return None
    x=u[-1]; ds=kd(x)
    if not ds or x['type']!='L': return None
    d=ds[0]
    return (x, d) if d in 'SZ' else None
def colorkey(c):
    segs=c.get('colorParsed')
    if segs and len(segs)>1 and all(s.get('range') for s in segs):
        lg=max(segs,key=lambda s:s['range'][1]-s['range'][0])
        return ''.join(code if i==0 else (lg.get('ops',[])[i-1] if i-1<len(lg.get('ops',[])) else ':')+code for i,code in enumerate(lg['codes']))
    return c['color']
def sums_for(k):
    sq=level1(k); buckets=collections.defaultdict(list)
    for i,c in enumerate(sq):
        if c['value'] and c['value']>0: buckets[colorkey(c) or ''].append(i)
    sums=set(); summands=set()
    for key,idx in buckets.items():
        vals=[sq[i]['value'] for i in idx]; n=len(idx); pre=[0]
        for v in vals: pre.append(pre[-1]+v)
        for j in range(n):
            v=vals[j]
            if v<11: continue
            best=None
            for e in range(j+4,n+1):
                t=pre[e]-pre[j+1]
                if t==v: best=(e-j-1,list(range(j+1,e))); break
                if t>v: break
            for s in range(j-3,-1,-1):
                t=pre[j]-pre[s]
                if t==v:
                    if best is None or j-s<best[0]: best=(j-s,list(range(s,j)))
                    break
                if t>v: break
            if best: sums.add(sq[j]['name']); summands.update(sq[idx[i]]['name'] for i in best[1])
    return sums,summands

# corpus: direction by knot type / turns / contributor
print('== corpus: units-knot direction')
byturn=collections.defaultdict(collections.Counter); bycon=collections.defaultdict(collections.Counter); conv=[]
for k in ks:
    S=collections.Counter(); L=collections.Counter(); E=collections.Counter()
    for c in k['cords']:
        for x in c['knots']:
            for d in kd(x):
                if d not in 'SZ': continue
                if x['type']=='S': S[d]+=1
                elif x['type']=='L': L[d]+=1; byturn[x['n']][d]+=1
                elif x['type']=='E': E[d]+=1
    con=k.get('contributors') or '?'
    bycon[con]['S-Z']+=S['Z']; bycon[con]['S-S']+=S['S']; bycon[con]['L-Z']+=L['Z']; bycon[con]['L-S']+=L['S']; bycon[con]['E-Z']+=E['Z']; bycon[con]['E-S']+=E['S']
    if sum(S.values())>=10 and sum(L.values())>=10:
        conv.append((k['id'],S['Z']/sum(S.values()),L['Z']/sum(L.values()),E['Z']/sum(E.values()) if sum(E.values())>=5 else None,sum(S.values()),sum(L.values())))
print('L direction by turns (Z share):',{n:f"{v['Z']/(v['Z']+v['S']):.2f} (n={v['Z']+v['S']})" for n,v in sorted(byturn.items()) if v['Z']+v['S']>=20})
print('by contributor (Z share): S-knots / L-knots / E-knots')
for con,v in sorted(bycon.items(),key=lambda x:-sum(x[1].values())):
    f=lambda a,b: f"{v[a]/(v[a]+v[b]):.2f}(n={v[a]+v[b]})" if v[a]+v[b] else 'na'
    print(f"  {con[:28]:28} {f('S-Z','S-S'):>16} {f('L-Z','L-S'):>16} {f('E-Z','E-S'):>16}")
# convention classes
cls=collections.Counter()
for kid,sz,lz,ez,ns,nl in conv:
    a='Z' if sz>=0.9 else ('S' if sz<=0.1 else 'mixed'); b='Z' if lz>=0.9 else ('S' if lz<=0.1 else 'mixed')
    cls[(a,b)]+=1
print('khipus (>=10 S and >=10 L knots) by convention (S-knot dir, L-knot dir):',dict(cls.most_common()))
mixedL=[x for x in conv if 0.1<x[2]<0.9]
print('khipus with mixed L direction:',len(mixedL))

print('\n== per-khipu tests on LONG-knot direction only (E excluded) (>=30 units knots known, minority >=10%); p<0.001 only')
print(f"{'khipu':8}{'n':>5}{'LZ%':>5}  associations")
tested=0; sig=collections.Counter()
for k in ks:
    recs=[(c,u) for c in k['cords'] for u in [units_knot(c)] if u]
    if len(recs)<30: continue
    d=[u[1] for c,u in recs]; z=d.count('Z')/len(d)
    if min(z,1-z)<0.10: continue
    tested+=1
    sums,summands=sums_for(k)
    preds={'attach':[c['attach'] or 'U' for c,u in recs],'twist':[c['twist'] or 'U' for c,u in recs],'colour':[basecolor(c) for c,u in recs],
      'level':['p' if c['level']==1 else 's' for c,u in recs],'grouppos':[group_pos(c,k) if c['level']==1 else 'sub' for c,u in recs],
      'val>=10':['t' if (c['value'] or 0)>=10 else 'u' for c,u in recs],'hasSubs':['y' if any(o.get('parent')==c['name'] for o in k['cords']) else 'n' for c,u in recs],
      'turns':[str(u[0]['n']) if u[0]['type']=='L' else 'E' for c,u in recs],
      'sumrole':['sum' if c['name'] in sums else ('summand' if c['name'] in summands else 'other') for c,u in recs]}
    out=[]
    for name,xs in preds.items():
        if len(set(xs))<2: continue
        p=perm_p(d,xs,seed=hash((k['id'],name))&0xffff)
        if p<0.001:
            sig[name]+=1
            ct=collections.Counter(zip(xs,d)); cats=sorted(set(xs))
            desc=' '.join(f"{a}:Z{ct[(a,'Z')]}/S{ct[(a,'S')]}" for a in cats) if len(cats)<=9 else ''
            out.append(f'{name}(p={p:.3f}) {desc}')
    l1=[u[1] for c in level1(k) for u in [units_knot(c)] if u]
    if len(l1)>=20:
        runs=1+sum(1 for a,b in zip(l1,l1[1:]) if a!=b); rng=random.Random(7); le=0; arr=list(l1)
        for _ in range(NPERM):
            rng.shuffle(arr); r=1+sum(1 for a,b in zip(arr,arr[1:]) if a!=b)
            if r<=runs: le+=1
        p=(le+1)/(NPERM+1)
        if p<0.001: sig['runs']+=1; out.append(f'runs(p={p:.3f}) runs={runs} of n={len(l1)}')
    print(f"{k['id']:8}{len(recs):5}{z*100:5.0f}  "+('; '.join(out) if out else '-'))
print('tested',tested,' significant counts by predictor',dict(sig))
