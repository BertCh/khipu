#!/usr/bin/env python3
"""Family C: the nL+E compound and knot direction (S/Z) as a channel."""
import json, glob, collections, statistics, random, math, sys
ROOT='/Users/roc8917/Documents/GitHub/khipu/public/data/khipus'
ks=[json.load(open(p)) for p in sorted(glob.glob(ROOT+'/KH*.json'))]
K={k['id']:k for k in ks}
UNIT={'L','E','EE','LL','BL','SP','TF'}
CLUSTER={'S','E','EE','TF'}
NPERM=1000
PARTS=set(sys.argv[1:]) or {'1','2','3'}

def seq(c): return sorted(c['knots'],key=lambda x:x['pos'])
def knot_dirs(x):
    d=x['dir']
    if len(d)>1: return [ch for ch in d]
    n=x['n'] if x['type'] in CLUSTER else 1
    return [d]*n
def colorkey(c):
    segs=c.get('colorParsed')
    if segs and len(segs)>1 and all(s.get('range') for s in segs):
        lg=max(segs,key=lambda s:s['range'][1]-s['range'][0])
        return ''.join(code if i==0 else (lg.get('ops',[])[i-1] if i-1<len(lg.get('ops',[])) else ':')+code for i,code in enumerate(lg['codes']))
    return c['color']
def basecolor(c):
    cp=c.get('colorParsed'); return cp[0]['codes'][0] if cp else (c['color'] or '?')
def chi2(xs,ys):
    ct=collections.Counter(zip(xs,ys)); rx=collections.Counter(xs); ry=collections.Counter(ys); n=len(xs); s=0
    for a in rx:
        for b in ry:
            e=rx[a]*ry[b]/n; o=ct[(a,b)]; s+=(o-e)**2/e if e>0 else 0
    return s
def perm_p(xs,ys,seed):
    """p-value of association between categorical xs and ys by permuting ys"""
    obs=chi2(xs,ys); rng=random.Random(seed); ys=list(ys); ge=0
    for _ in range(NPERM):
        rng.shuffle(ys); 
        if chi2(xs,ys)>=obs-1e-12: ge+=1
    return (ge+1)/(NPERM+1), obs
def level1(k):
    return sorted((c for c in k['cords'] if c['level']==1), key=lambda c:(c['group'] if c.get('group') is not None else 1e9, c['ordinal']))
def group_pos(c,k):
    if c.get('group') is None: return 'none'
    g=k['groups'][c['group']]
    if g['n']==1: return 'solo'
    if c['ordinal']==g['first']: return 'first'
    if c['ordinal']==g['last']: return 'last'
    return 'mid'
def has_subs(c,k):
    return any(o.get('parent')==c['name'] for o in k['cords'])

# ---------- Part 1: nL+E ----------
print('='*70); print('PART 1  nL+E compound'); print('='*70)
def units_form(c):
    s=seq(c); t=[x['type'] for x in s]
    if not s: return None
    if len(t)>=2 and t[-2]=='L' and t[-1]=='E':
        return ('nL+E', s[-2]['n']+1, s[-2], s[-1])
    if t[-1]=='L' and (len(t)==1 or t[-2]=='S'):
        return ('L', s[-1]['n'], s[-1], None)
    if t[-1]=='E' and (len(t)==1 or t[-2]=='S'):
        return ('E', 1, s[-1], None)
    if len(t)>=2 and t[-2]=='E' and t[-1]=='L':
        return ('E+nL', s[-1]['n']+1, s[-2], s[-1])
    if len(t)>=2 and t[-2]=='L' and t[-1]=='L' and s[-1]['n']==1:
        return ('nL+1L', s[-2]['n']+1, s[-2], s[-1])
    return ('other',None,None,None)

rows=[]  # per cord record
for k in ks:
    for c in k['cords']:
        f=units_form(c)
        if f: rows.append((k['id'],c,f))
use=collections.defaultdict(collections.Counter)  # khipu -> (form,value) counts
for kid,c,f in rows:
    if f[0] in ('nL+E','L','E','E+nL','nL+1L'): use[kid][(f[0],f[1])]+=1
lek=[kid for kid in use if any(f=='nL+E' for f,_ in use[kid])]
print('khipus using nL+E:',len(lek),' cords:',sum(v for kid in lek for (f,_),v in use[kid].items() if f=='nL+E'))
onlyLE=[];both=[]
print(f"\n{'khipu':8}{'contrib':22}{'nL+E':>5}{'(n+1)L':>7} | per value v=2..10: nL+E/plainL")
for kid in (lek if '1' in PARTS else []):
    k=K[kid]; u=use[kid]
    le=sum(v for (f,val),v in u.items() if f=='nL+E'); 
    plain=sum(v for (f,val),v in u.items() if f=='L' and val>=2)
    cells=[]
    for v in range(2,11):
        a=u[('nL+E',v)]; b=u[('L',v)]
        cells.append(f'{a}/{b}' if a or b else '.')
    contrib=(k.get('contributors') or '?')[:20]
    print(f"{kid:8}{contrib:22}{le:5}{plain:7} | "+' '.join(f'{x:>5}' for x in cells))
    if plain==0: onlyLE.append(kid)
    elif le>=5 and plain>=5: both.append(kid)
print('\nkhipus with nL+E and NO plain (n+1)L for v>=2:',onlyLE)
print('1L+E cords (value 2 by rule):',sum(use[kid][('nL+E',2)] for kid in lek))
print('E+nL (E above L):',sum(v for kid in use for (f,_),v in use[kid].items() if f=='E+nL'),' nL+1L:',sum(v for kid in use for (f,_),v in use[kid].items() if f=='nL+1L'))
# contributor summary
byc=collections.defaultdict(lambda:[0,0,0])
for kid in use:
    k=K[kid]; c=(k.get('contributors') or '?')
    le=sum(v for (f,val),v in use[kid].items() if f=='nL+E'); plain=sum(v for (f,val),v in use[kid].items() if f=='L' and val>=2)
    byc[c][0]+=1; byc[c][1]+=le; byc[c][2]+=plain
    if le: byc[c].append(kid)
print('\ncontributor: khipus, nL+E cords, plain L(>=2) cords, share nL+E, khipus using it')
for c,(n,le,pl,*kids) in sorted(byc.items(),key=lambda x:-x[1][1]):
    if le or n>=5: print(f'  {c[:40]:40} {n:4} {le:5} {pl:6} {le/(le+pl) if le+pl else 0:6.2f}  {len(kids)}')

# coexistence tests
if '1' not in PARTS: both=[]
print('\nCoexistence tests (khipus with >=5 of each form; permutation p<0.01 only):')
for kid in both:
    k=K[kid]; recs=[(c,f) for kk,c,f in rows if kk==kid and f[0] in ('nL+E','L') and f[1]>=2]
    form=[f[0] for c,f in recs]
    preds={
     'colour':[basecolor(c) for c,f in recs],
     'attach':[c['attach'] or 'U' for c,f in recs],
     'Ldir':[f[2]['dir'] for c,f in recs],
     'level':['p' if c['level']==1 else 's' for c,f in recs],
     'grouppos':[group_pos(c,k) if c['level']==1 else 'sub' for c,f in recs],
     'tens':[('t' if (c['value'] or 0)>=10 else 'u') for c,f in recs],
     'unitsval':[str(f[1]) for c,f in recs],
    }
    out=[]
    for name,xs in preds.items():
        if len(set(xs))<2: continue
        p,st=perm_p(form,xs,seed=hash((kid,name))&0xffff)
        if p<0.01:
            ct=collections.Counter(zip(form,xs)); out.append(f'{name} p={p:.3f} {dict(ct)}')
    print(f'  {kid} n={len(recs)} nL+E={form.count("nL+E")} L={form.count("L")}: '+('; '.join(out) if out else 'no association p<0.01'))

# spacing
print('\nSpacing: L->E gap vs tier spacing (median cm) per khipu (>=5 nL+E cords):')
for kid in lek:
    k=K[kid]; gaps=[];sl=[];tiers=[]
    for c in k['cords']:
        s=seq(c); f=units_form(c)
        if f and f[0]=='nL+E':
            gaps.append(f[3]['pos']-f[2]['pos'])
            if len(s)>=3 and s[-3]['type']=='S': sl.append(s[-2]['pos']-s[-3]['pos'])
        ss=[x for x in s if x['type']=='S']
        for a,b in zip(ss,ss[1:]): tiers.append(b['pos']-a['pos'])
    if len(gaps)>=5:
        print(f"  {kid}: L->E {statistics.median(gaps):5.1f} (n={len(gaps)})  S->L {statistics.median(sl) if sl else float('nan'):5.1f}  S->S tier {statistics.median(tiers) if tiers else float('nan'):5.1f} (n={len(tiers)})")

# ---------- Part 2: direction ----------
print('\n'+'='*70); print('PART 2  knot direction'); print('='*70)
tot=collections.Counter()
for k in ks:
    for c in k['cords']:
        for x in c['knots']:
            for d in knot_dirs(x): tot[d]+=1
print('knots by direction',dict(tot),' Z share of known: %.3f'%(tot['Z']/(tot['Z']+tot['S'])))
def cord_dir(c):
    d=collections.Counter(dd for x in c['knots'] for dd in knot_dirs(x))
    if d['U']>0 and (d['S']+d['Z'])==0: return None
    if d['S']==d['Z']: return 'M'
    return 'Z' if d['Z']>d['S'] else 'S'
# cords known
known=[(k,c) for k in ks for c in k['cords'] if c['knots'] and all(dd in 'SZ' for x in c['knots'] for dd in knot_dirs(x))]
print('cords with all-known direction',len(known),' cord-majority Z share %.3f'%(sum(1 for k,c in known if cord_dir(c)=='Z')/len(known)))
mixed=[(k,c) for k,c in known if len({dd for x in c['knots'] for dd in knot_dirs(x)})==2]
print('mixed-direction cords',len(mixed),'in',len({k['id'] for k,c in mixed}),'khipus')

def sums_for(k):
    """coloured pendant sum rule; returns set of sum cord names, set of summand names"""
    sq=level1(k); buckets=collections.defaultdict(list)
    for i,c in enumerate(sq):
        if not c['value'] or c['value']<=0: continue
        buckets[colorkey(c) or ''].append(i)
    sums=set(); summands=set()
    for key,idx in buckets.items():
        vals=[sq[i]['value'] for i in idx]; n=len(idx)
        pre=[0]
        for v in vals: pre.append(pre[-1]+v)
        for j in range(n):
            v=vals[j]
            if v<11: continue
            best=None
            # right: run j+1..e with sum v ; left: run s..j-1
            for hand in ('R','L'):
                if hand=='R':
                    for e in range(j+1+3,n+1):
                        tot_=pre[e]-pre[j+1]
                        if tot_==v: best=(e-(j+1),hand,list(range(j+1,e))) if best is None or e-(j+1)<best[0] else best; break
                        if tot_>v: break
                else:
                    for s in range(j-3,-1,-1):
                        tot_=pre[j]-pre[s]
                        if tot_==v: best=(j-s,hand,list(range(s,j))) if best is None or j-s<best[0] else best; break
                        if tot_>v: break
            if best:
                sums.add(sq[j]['name']); summands.update(sq[idx[i]]['name'] for i in best[2])
    return sums,summands

print('\nPer-khipu association tests (>=30 known cords, minority direction >=10%): p<0.001 only')
print(f"{'khipu':8}{'n':>5}{'Z%':>5}  associations")
cand=[]
for k in ks:
    cs=[c for kk,c in known if kk is k]
    cs=[c for c in cs if cord_dir(c) in ('S','Z')]
    if len(cs)<30: continue
    z=sum(1 for c in cs if cord_dir(c)=='Z')/len(cs)
    if min(z,1-z)<0.10: continue
    cand.append(k)
    d=[cord_dir(c) for c in cs]
    sums,summands=sums_for(k)
    preds={'attach':[c['attach'] or 'U' for c in cs],'twist':[c['twist'] or 'U' for c in cs],'colour':[basecolor(c) for c in cs],
      'level':['p' if c['level']==1 else 's' for c in cs],'grouppos':[group_pos(c,k) if c['level']==1 else 'sub' for c in cs],
      'val>=10':['t' if (c['value'] or 0)>=10 else 'u' for c in cs],'hasSubs':['y' if has_subs(c,k) else 'n' for c in cs],
      'sumrole':['sum' if c['name'] in sums else ('summand' if c['name'] in summands else 'other') for c in cs]}
    out=[]
    for name,xs in preds.items():
        if len(set(xs))<2: continue
        p,st=perm_p(d,xs,seed=hash((k['id'],name))&0xffff)
        if p<0.001:
            ct=collections.Counter(zip(xs,d)); cats=sorted(set(xs))
            desc=' '.join(f"{a}:Z{ct[(a,'Z')]}/S{ct[(a,'S')]}" for a in cats if len(cats)<=6)
            out.append(f'{name}(p={p:.4f}) {desc}')
    # runs test on level-1 sequence
    l1=[cord_dir(c) for c in level1(k) if c in cs]
    if len(l1)>=20:
        runs=1+sum(1 for a,b in zip(l1,l1[1:]) if a!=b); rng=random.Random(7); le=0; arr=list(l1)
        for _ in range(NPERM):
            rng.shuffle(arr); r=1+sum(1 for a,b in zip(arr,arr[1:]) if a!=b)
            if r<=runs: le+=1
        p=(le+1)/(NPERM+1)
        if p<0.001: out.append(f'runs(p={p:.4f}) runs={runs} of n={len(l1)} clustered')
    print(f"{k['id']:8}{len(cs):5}{z*100:5.0f}  "+('; '.join(out) if out else '-'))
print('candidates tested',len(cand))

# within-cord mixing pattern
print('\nWithin-cord mixing pattern per khipu (mixed cords >=5): which knot carries the odd direction')
pat_by=collections.defaultdict(collections.Counter)
for k,c in mixed:
    s=seq(c); ds=[collections.Counter(knot_dirs(x)).most_common(1)[0][0] for x in s]
    types=[x['type'] for x in s]
    maj=collections.Counter(ds).most_common(1)[0][0]
    odd=[i for i,dd in enumerate(ds) if dd!=maj]
    if len(set(ds))<2: 
        # mixing inside one cluster only
        pat='intra-cluster'
    elif len(odd)==1 and odd[0]==len(ds)-1: pat='bottom(units) differs: %s-%s'%(types[-1],ds[-1])
    elif len(odd)==1 and odd[0]==0: pat='top differs: %s-%s'%(types[0],ds[0])
    elif all(types[i] in UNIT for i in odd) and all(types[i]=='S' for i in range(len(ds)) if i not in odd): pat='unit knots vs S clusters'
    elif len(odd)==1: pat='one middle knot differs'
    else: pat='other'
    pat_by[k['id']][pat]+=1
for kid,cnt in sorted(pat_by.items(),key=lambda x:-sum(x[1].values())):
    n=sum(cnt.values())
    if n>=5:
        top,tn=cnt.most_common(1)[0]
        print(f"  {kid} n={n:4} {'CONSISTENT' if tn/n>0.9 else '          '} {tn/n*100:3.0f}% {top} | {dict(cnt.most_common(3))}")

# ---------- Part 3: Incahuasi ----------
print('\n'+'='*70); print('PART 3  Incahuasi'); print('='*70)
inc=[k for k in ks if k.get('provenance') and ('incahuasi' in k['provenance'].lower() or 'inkawasi' in k['provenance'].lower())]
print('Incahuasi khipus',len(inc),[k['id'] for k in inc])
print(f"{'khipu':8}{'cords':>6}{'Zknot%':>7}{'S-type Z%':>10}{'L Z%':>6}{'E Z%':>6}{'mixed':>6}{'nL+E':>6} | sum/summand/other Z% (n)   p")
agg=collections.Counter()
for k in inc:
    cs=[c for c in k['cords'] if c['knots']]
    if not cs: continue
    byt=collections.defaultdict(collections.Counter)
    for c in cs:
        for x in c['knots']:
            for dd in knot_dirs(x): byt[x['type']][dd]+=1; agg[(x['type'],dd)]+=1
    def zs(t): 
        d=byt[t]; return f"{100*d['Z']/(d['S']+d['Z']):5.0f}" if d['S']+d['Z'] else '   na'
    allk=collections.Counter(); [allk.update(v) for v in byt.values()]
    mixedn=sum(1 for c in cs if len({dd for x in c['knots'] for dd in knot_dirs(x)}-{'U'})==2)
    le=sum(1 for c in cs if (units_form(c) or ('',))[0]=='nL+E')
    sums,summands=sums_for(k)
    role=collections.defaultdict(collections.Counter)
    cs2=[c for c in cs if cord_dir(c) in ('S','Z')]
    for c in cs2:
        r='sum' if c['name'] in sums else ('summand' if c['name'] in summands else 'other'); role[r][cord_dir(c)]+=1
    rs=' '.join(f"{r}:{100*role[r]['Z']/sum(role[r].values()):3.0f}%({sum(role[r].values())})" for r in ('sum','summand','other') if role[r])
    p=''
    if sums and len(cs2)>=20:
        xs=['sum' if c['name'] in sums else ('summand' if c['name'] in summands else 'other') for c in cs2]
        pv,_=perm_p([cord_dir(c) for c in cs2],xs,seed=3); p=f'{pv:.3f}'
    print(f"{k['id']:8}{len(cs):6}{100*allk['Z']/(allk['S']+allk['Z']) if allk['S']+allk['Z'] else float('nan'):7.0f}{zs('S'):>10}{zs('L'):>6}{zs('E'):>6}{mixedn:6}{le:6} | {rs}  {p}")
print('aggregate Incahuasi knots by type/dir',{f'{t}-{d}':n for (t,d),n in sorted(agg.items())})
