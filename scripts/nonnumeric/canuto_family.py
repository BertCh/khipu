#!/usr/bin/env python3
"""Family A: khipus whose cords carry several long knots each (no / few single knots).
Describe, band-cluster the long-knot positions, discriminate additive (sum of turns)
vs positional readings by arithmetic (sum-cord excess vs shuffles), look for repeated words.
"""
import json, glob, sqlite3, random, statistics, collections, re
ROOT='/Users/roc8917/Documents/GitHub/khipu'
DATA=ROOT+'/public/data/khipus'
DB=ROOT+'/data/okr/data/khipu.db'
CORE=['KH0280','KH0281','KH0282','KH0288','KH0289','KH0271','KH0384','KH0346','KH0348','KH0103','KH0692','KH0269','KH0104','KH0028']
SHUF=200; random.seed(2024)
ks={}
for p in sorted(glob.glob(DATA+'/KH*.json')):
    k=json.load(open(p)); ks[k['id']]=k
def seq(c): return sorted(c['knots'],key=lambda x:x['pos'])
# ---------- selection ----------
sel=[]
for kid,k in ks.items():
    kn=[c for c in k['cords'] if c['knots']]
    if len(kn)<8: continue
    multiL=sum(1 for c in kn if sum(1 for x in c['knots'] if x['type']=='L')>=2)
    nS=sum(1 for c in kn for x in c['knots'] if x['type']=='S'); nL=sum(1 for c in kn for x in c['knots'] if x['type']=='L')
    if multiL/len(kn)>=0.4 and nS<nL: sel.append(kid)
print('auto-selected (>=40% cords with >=2 L, S<L):',sel)
allset=sorted(set(sel)|set(CORE))
print('core set not auto-selected:',sorted(set(CORE)-set(sel)))
# ---------- OKR canutos / notes ----------
db=sqlite3.connect(DB)
canuto={}  # kid -> {pendant ordinal: canuto ordinal}
for kid in allset:
    rows=db.execute("select c.CORD_ORDINAL, cn.CTO_ORDINAL, cn.NUM_CORDS from cord c join khipu_main m on c.KHIPU_ID=m.KHIPU_ID left join canuto cn on c.CANUTO_ID=cn.CANUTO_ID where m.OKR_NUM=? and c.CORD_LEVEL=1 and c.CANUTO_ID is not null and c.CANUTO_ID<>0",(kid,)).fetchall()
    if rows: canuto[kid]={r[0]:r[1] for r in rows}
notes={r[0]:r[1:] for r in db.execute("select OKR_NUM, INVESTIGATOR_NUM, PROVENANCE, MUSEUM_NAME, NOTES from khipu_main").fetchall()}
# ---------- helpers ----------
def pend(k): return sorted((c for c in k['cords'] if c['level']==1 and c['kind']=='pendant'),key=lambda c:c['ordinal'])
def groups_of(k):
    kid=k['id']; ps=pend(k)
    if kid in canuto:
        g=collections.defaultdict(list)
        for c in ps: g[canuto[kid].get(c['ordinal'],('x',c['ordinal']))].append(c)
        return [g[key] for key in sorted(g,key=lambda x:(str(type(x)),x))]
    g=collections.defaultdict(list)
    for c in ps: g[c.get('group',c['ordinal'])].append(c)
    return [g[key] for key in sorted(g)]
def bands(positions,k):
    """split sorted positions at the k-1 largest gaps"""
    ps=sorted(positions)
    if k<=1 or len(ps)<k: return [ps]
    gaps=sorted(range(1,len(ps)),key=lambda i:ps[i]-ps[i-1],reverse=True)[:k-1]
    cuts=sorted(gaps); out=[]; prev=0
    for cidx in cuts: out.append(ps[prev:cidx]); prev=cidx
    out.append(ps[prev:]); return out
def band_of(pos,edges):
    for i,(lo,hi) in enumerate(edges):
        if lo<=pos<=hi: return i
    # nearest
    return min(range(len(edges)),key=lambda i:min(abs(pos-edges[i][0]),abs(pos-edges[i][1])))
def sum_excess(vals,groups_idx,subs,shuf=SHUF):
    """count cords equal to sum of >=2 consecutive same-level neighbours (window <=8) or of own subsidiaries; z vs shuffles"""
    n=len(vals)
    def count(v):
        c=0
        for i in range(n):
            if v[i] is None or v[i]<2: continue
            hit=False
            for w in range(2,9):
                for s in range(max(0,i-w),min(n-w,i)+1):
                    if s<=i<s+w: continue
                    if sum(x or 0 for x in v[s:s+w])==v[i]: hit=True;break
                if hit: break
            if hit: c+=1
        return c
    # subsidiaries sums
    ssum=sum(1 for i,sv in subs.items() if vals[i] and len(sv)>=2 and sum(sv)==vals[i])
    obs=count(vals)
    idx=[i for i in range(n) if vals[i] is not None]
    dist=[]
    for _ in range(shuf):
        v=list(vals); vv=[vals[i] for i in idx]; random.shuffle(vv)
        for i,x in zip(idx,vv): v[i]=x
        dist.append(count(v))
    mu=statistics.mean(dist); sd=statistics.pstdev(dist) or 1e-9
    return obs,ssum,mu,sd,(obs-mu)/sd
def group_sum_matches(vals,groups_idx):
    tot=[sum(vals[i] or 0 for i in g) for g in groups_idx if len(g)>=2]
    tot=[t for t in tot if t>=5]
    c=collections.Counter(tot); return sum(v-1 for v in c.values() if v>1), len(tot)
# ---------- main ----------
words=collections.Counter(); words_by=collections.defaultdict(set)
pooled=collections.defaultdict(list)
rows=[]
for kid in allset:
    k=ks[kid]; kn=[c for c in k['cords'] if c['knots']]
    ps=pend(k)
    tc=collections.Counter(); ktype=collections.Counter(); nLper=collections.Counter()
    for c in kn:
        for x in c['knots']: ktype[x['type']]+=1
        Ls=[x for x in c['knots'] if x['type']=='L']; nLper[len(Ls)]+=1
        for x in Ls: tc[x['n']]+=1
    onlyL=sum(1 for c in kn if all(x['type']=='L' for x in c['knots']))
    gs=groups_of(k); gsizes=collections.Counter(len(g) for g in gs)
    colors=collections.Counter(c['color'] for c in k['cords'])
    fib=k['primary']['fiber']; plen=k['primary']['length']
    # bands over level-1 pendants only (cords hang from the primary)
    Lpos=[(x['pos'],c['ordinal'],x['n']) for c in ps for x in c['knots'] if x['type']=='L']
    perc=sorted(sum(1 for x in c['knots'] if x['type']=='L') for c in ps if c['knots'])
    kb=perc[int(0.95*(len(perc)-1))] if perc else 1
    bs=bands([p for p,_,_ in Lpos],kb)
    edges=[(min(b),max(b)) for b in bs if b]
    centres=[round(statistics.median(b),1) for b in bs if b]
    widths=[round(max(b)-min(b),1) for b in bs if b]
    # one-L-per-band consistency
    cons=0; nk=0; perband_turns=collections.defaultdict(collections.Counter)
    r1={};r2={};r3={}
    for c in ps:
        Ls=[x for x in seq(c) if x['type']=='L']
        if not c['knots']: r1[c['ordinal']]=r2[c['ordinal']]=r3[c['ordinal']]=0; continue
        nk+=1
        bl=[band_of(x['pos'],edges) for x in Ls]
        if len(set(bl))==len(bl): cons+=1
        for x,b in zip(Ls,bl): perband_turns[b][x['n']]+=1
        others=sum(x['value'] or 0 for x in c['knots'] if x['type']!='L')  # S/E under KFG
        r1[c['ordinal']]=sum(x['n'] for x in Ls)+others
        nb=len(edges)
        r2[c['ordinal']]=sum(x['n']*10**(nb-1-b) for x,b in zip(Ls,bl))+others
        r3[c['ordinal']]=sum(x['n']*10**b for x,b in zip(Ls,bl))+others
        w=' '.join(f"{x['n']}" for x in Ls)
        if len(Ls)>=2: words[w]+=1; words_by[w].add(kid)
    # arithmetic tests
    ords=[c['ordinal'] for c in ps]
    subs={}
    for i,c in enumerate(ps):
        sv=[s['value'] for s in k['cords'] if s.get('parent')==c['name'] and s['value'] is not None]
        if sv: subs[i]=sv
    gidx=[[ords.index(c['ordinal']) for c in g] for g in gs]
    res={}
    for name,rd in (('R1',r1),('R2',r2),('R3',r3)):
        vals=[rd[o] for o in ords]
        # subs only meaningful under R1 (KFG values of subs); skip for R2/R3 unless no L on subs
        obs,ss,mu,sd,z=sum_excess(vals,gidx,subs if name=='R1' else {})
        gm,gn=group_sum_matches(vals,gidx)
        res[name]=(obs,mu,z,ss,gm,gn)
        pooled[name].append((obs,mu,sd))
    # canuto/group turn-sum constancy
    gtot=[sum(r1[c['ordinal']] for c in g) for g in gs if len(g)>=2]
    gcv=round(statistics.pstdev(gtot)/statistics.mean(gtot),2) if len(gtot)>=2 and statistics.mean(gtot) else None
    inv=notes.get(kid,('?',)*4)[0]
    rows.append((kid,inv,len(kn),onlyL/len(kn),dict(sorted(tc.items())),dict(sorted(nLper.items())),dict(ktype),dict(sorted(gsizes.items())),fib,plen,colors.most_common(4),centres,widths,cons/nk if nk else 0,res,gcv,dict((b,dict(sorted(t.items()))) for b,t in sorted(perband_turns.items())),bool(kid in canuto)))
for r in rows:
    kid,inv,n,fl,tc,nlp,kt,gsz,fib,plen,cols,cen,wid,cons,res,gcv,pbt,iscan=r
    print(f"\n=== {kid} ({inv})  knotted cords {n}  only-L cords {fl:.2f}  knot types {kt}  fibre {fib} primary {plen} cm")
    print(f"  turns dist {tc}\n  L per cord {nlp}\n  groups({'canuto' if iscan else 'json'}) sizes {gsz}\n  colours {cols}")
    print(f"  bands centres {cen} widths {wid}  one-L-per-band consistency {cons:.2f}")
    print(f"  turns per band {pbt}")
    for name,(obs,mu,z,ss,gm,gn) in res.items():
        print(f"  {name}: sum-cords obs {obs} shuffle-mean {mu:.1f} z {z:+.2f}  subs-sums {ss}  equal-group-totals {gm}/{gn}")
    print(f"  group turn-sum CV {gcv}")
    nt=notes.get(kid)
    if nt: print(f"  OKR: prov={nt[1]!r} museum={nt[2]!r}\n  notes: {(nt[3] or '')[:500]!r}")
print('\n=== pooled sum-cord excess (sum over khipus of obs - mean, z from pooled variance)')
for name,lst in pooled.items():
    d=sum(o-m for o,m,s in lst); v=sum(s*s for o,m,s in lst)**0.5
    print(f"  {name}: excess {d:+.1f}  z {d/v:+.2f}  obs {sum(o for o,_,_ in lst)} vs {sum(m for _,m,_ in lst):.1f}")
print('\n=== repeated L-turn words (>=2 L, count>=4)')
for w,c in words.most_common(25): print(f"  {c:4} '{w}'  in {sorted(words_by[w])}")
cross=[(w,c) for w,c in words.items() if len(words_by[w])>=3 and len(w.split())>=3]
print('  words of >=3 L shared by >=3 khipus:',sorted(cross,key=lambda x:-x[1])[:15])

# =====================================================================
# PART 2: better band test (ordinal-position overlap + k-means), group
# structure vs shuffles, turn counts by ordinal, within-canuto similarity
# =====================================================================
print('\n\n########## PART 2 ##########')
def kmeans1d(xs,k,it=50):
    xs=sorted(xs); 
    if k<=1 or len(xs)<k: return [min(xs)] if xs else [], [0]*len(xs)
    cents=[xs[int((i+0.5)*len(xs)/k)] for i in range(k)]
    for _ in range(it):
        lab=[min(range(k),key=lambda j:abs(x-cents[j])) for x in xs]
        new=[statistics.mean([x for x,l in zip(xs,lab) if l==j]) if any(l==j for l in lab) else cents[j] for j in range(k)]
        if new==cents: break
        cents=new
    return cents,lab
def assign(x,cents): return min(range(len(cents)),key=lambda j:abs(x-cents[j]))
summary=[]
for kid in allset:
    k=ks[kid]; ps=[c for c in pend(k) if c['knots']]
    Lc=collections.Counter(sum(1 for x in c['knots'] if x['type']=='L') for c in ps)
    m=Lc.most_common(1)[0][0]
    if m<2: 
        print(f"\n=== {kid}: modal L per cord = {m}; skipping band test"); continue
    # ordinal position distributions on cords with exactly m L knots
    cords_m=[[x['pos'] for x in seq(c) if x['type']=='L'] for c in ps if sum(1 for x in c['knots'] if x['type']=='L')==m]
    q=[]
    for i in range(m):
        col=sorted(v[i] for v in cords_m)
        q.append((round(statistics.median(col),1),round(col[int(0.1*(len(col)-1))],1),round(col[int(0.9*(len(col)-1))],1)))
    # overlap: over random cord pairs (A,B), P(pos_i(A) >= pos_{i+1}(B))
    ov=[]
    for i in range(m-1):
        a=[v[i] for v in cords_m]; b=[v[i+1] for v in cords_m]
        ov.append(round(sum(1 for x in a for y in b if x>=y)/(len(a)*len(b)),2))
    # relative positions (pos/length)
    rel=[]
    for c in ps:
        if c['length']:
            for x in c['knots']:
                if x['type']=='L': rel.append((x['pos'],c['length']))
    r=None
    if len(rel)>5:
        xs=[a for a,_ in rel]; ys=[b for _,b in rel]
        mx,my=statistics.mean(xs),statistics.mean(ys)
        sxy=sum((a-mx)*(b-my) for a,b in rel); sxx=sum((a-mx)**2 for a in xs); syy=sum((b-my)**2 for b in ys)
        r=round(sxy/(sxx*syy)**0.5,2) if sxx and syy else None
    # k-means bands on all pendant L positions
    allpos=[x['pos'] for c in ps for x in c['knots'] if x['type']=='L']
    cents,_=kmeans1d(allpos,m)
    cons=sum(1 for c in ps if len({assign(x['pos'],cents) for x in c['knots'] if x['type']=='L'})==sum(1 for x in c['knots'] if x['type']=='L'))/len(ps)
    # turns by ordinal (cords with m L)
    tb=[round(statistics.mean(sum(1 for _ in [0])*0+[x['n'] for x in seq(c) if x['type']=='L'][i] for c in ps if sum(1 for x in c['knots'] if x['type']=='L')==m),2) for i in range(m)]
    # monotone turn order? fraction of m-cords with non-decreasing turns top->bottom vs non-increasing
    seqs=[[x['n'] for x in seq(c) if x['type']=='L'] for c in ps if sum(1 for x in c['knots'] if x['type']=='L')==m]
    nd=sum(1 for s in seqs if all(s[i]<=s[i+1] for i in range(len(s)-1)))/len(seqs)
    ni=sum(1 for s in seqs if all(s[i]>=s[i+1] for i in range(len(s)-1)))/len(seqs)
    # group structure: canuto/json groups; equal-total count and CV vs shuffles of cords among groups
    gs=groups_of(k); gs=[[c for c in g if c['knots']] for g in gs]; gs=[g for g in gs if len(g)>=2]
    if len(gs)>=3:
        tv={c['name']:sum(x['n'] for x in c['knots'] if x['type']=='L') for g in gs for c in g}
        names=[c['name'] for g in gs for c in g]; sizes=[len(g) for g in gs]
        def stats(order):
            tots=[]; i=0
            for s in sizes: tots.append(sum(tv[n] for n in order[i:i+s])); i+=s
            cnt=collections.Counter(tots); eq=sum(v-1 for v in cnt.values() if v>1)
            cv=statistics.pstdev(tots)/statistics.mean(tots)
            # within-group similarity: mean |turn-sum diff| between cord pairs in the same group
            i=0; d=[]
            for s in sizes:
                grp=order[i:i+s]; i+=s
                d+= [abs(tv[a]-tv[b]) for ai,a in enumerate(grp) for b in grp[ai+1:]]
            return eq,cv,statistics.mean(d)
        oe,ocv,od=stats(names)
        dist=[]
        for _ in range(SHUF):
            o=list(names); random.shuffle(o); dist.append(stats(o))
        def z(o,i): 
            v=[d[i] for d in dist]; sd=statistics.pstdev(v) or 1e-9; return (o-statistics.mean(v))/sd, statistics.mean(v)
        ze,me=z(oe,0); zc,mc=z(ocv,1); zd,md=z(od,2)
        gtxt=f"groups {len(gs)}: equal-totals {oe} (shuffle {me:.1f}, z {ze:+.2f}); CV {ocv:.2f} (shuffle {mc:.2f}, z {zc:+.2f}); within-group |Δturn-sum| {od:.2f} (shuffle {md:.2f}, z {zd:+.2f})"
    else: gtxt='too few groups'
    print(f"\n=== {kid}: modal L/cord {m} ({Lc[m]}/{len(ps)} pendants)")
    print(f"  ordinal knot positions (median, p10, p90): {q}")
    print(f"  overlap P(pos_i >= pos_i+1 across cords): {ov}   corr(pos, cord length) r={r}")
    print(f"  k-means {m} bands centres {[round(c,1) for c in cents]}  cords with <=1 L per band: {cons:.2f}")
    print(f"  mean turns by ordinal (top->bottom) {tb}; non-decreasing {nd:.2f} non-increasing {ni:.2f}")
    print(f"  {gtxt}")
    summary.append((kid,m,ov,cons,gtxt))

# =====================================================================
# PART 3: digit-likeness per band (zero rate, chi-square vs uniform 1-9),
# which band varies within a canuto group, identical-vector groups, colour
# =====================================================================
print('\n\n########## PART 3 ##########')
def chi_uniform(counter,cats):
    n=sum(counter[c] for c in cats); e=n/len(cats)
    return round(sum((counter[c]-e)**2/e for c in cats),1), n
for kid in allset:
    k=ks[kid]; ps=[c for c in pend(k) if c['knots']]
    Lc=collections.Counter(sum(1 for x in c['knots'] if x['type']=='L') for c in ps); m=Lc.most_common(1)[0][0]
    if m<2: continue
    allpos=[x['pos'] for c in ps for x in c['knots'] if x['type']=='L']
    cents,_=kmeans1d(allpos,m)
    # zero rate: cords with fewer L than bands, and which band is empty
    empty=collections.Counter(); nz=0
    perband=collections.defaultdict(collections.Counter)
    vec={}
    for c in ps:
        Ls=[x for x in seq(c) if x['type']=='L']; bl=[assign(x['pos'],cents) for x in Ls]
        if len(set(bl))!=len(bl): continue
        v=[None]*m
        for x,b in zip(Ls,bl): v[b]=x['n']; perband[b][x['n']]+=1
        for b in range(m):
            if v[b] is None: empty[b]+=1
        if any(x is None for x in v): nz+=1
        vec[c['name']]=v
    chis={b:chi_uniform(perband[b],range(1,10)) for b in range(m)}
    print(f"\n=== {kid}: bands {[round(c,1) for c in cents]}  cords with an empty band {nz}/{len(vec)} (by band {dict(empty)})")
    print(f"  chi2 vs uniform digits 1-9 per band (chi2, n; df=8, 95% crit 15.5): {chis}")
    print(f"  turns per band: {[dict(sorted(perband[b].items())) for b in range(m)]}")
    gs=groups_of(k); gs=[[c['name'] for c in g if c['name'] in vec] for g in gs]; gs=[g for g in gs if len(g)>=2]
    if len(gs)>=3:
        names=[n for g in gs for n in g]; sizes=[len(g) for g in gs]
        def st(order):
            i=0; d=[0.0]*m; ident=0; pairs=0
            for s in sizes:
                grp=order[i:i+s]; i+=s
                if all(vec[a]==vec[grp[0]] for a in grp): ident+=1
                for ai,a in enumerate(grp):
                    for b in grp[ai+1:]:
                        pairs+=1
                        for j in range(m):
                            if vec[a][j] is not None and vec[b][j] is not None: d[j]+=abs(vec[a][j]-vec[b][j])
            return [x/pairs for x in d]+[ident]
        o=st(names); dist=[]
        for _ in range(SHUF):
            oo=list(names); random.shuffle(oo); dist.append(st(oo))
        out=[]
        for j in range(m+1):
            v=[d[j] for d in dist]; mu=statistics.mean(v); sd=statistics.pstdev(v) or 1e-9
            out.append(f"{'band'+str(j) if j<m else 'identical-groups'} {o[j]:.2f} (shuf {mu:.2f}, z {(o[j]-mu)/sd:+.2f})")
        print('  within-group |Δturns| per band vs shuffle: '+'; '.join(out))
    # colour vs turn-sum
    cols=collections.defaultdict(list)
    for c in ps:
        if c['name'] in vec: cols[c['color']].append(sum(x for x in vec[c['name']] if x))
    cols={c:v for c,v in cols.items() if len(v)>=5}
    if len(cols)>=2:
        means={c:round(statistics.mean(v),2) for c,v in cols.items()}
        allv=[x for v in cols.values() for x in v]; gm=statistics.mean(allv)
        def F(groups): 
            return sum(len(v)*(statistics.mean(v)-gm)**2 for v in groups)
        o=F(cols.values()); dist=[]
        for _ in range(SHUF):
            a=list(allv); random.shuffle(a); i=0; gg=[]
            for v in cols.values(): gg.append(a[i:i+len(v)]); i+=len(v)
            dist.append(F(gg))
        p=sum(1 for d in dist if d>=o)/SHUF
        print(f"  colour vs turn-sum: means {means}  permutation p={p:.3f}")
# full note for KH0103 and KH0089
for kid in ('KH0103','KH0089'):
    print(f"\n--- full OKR note {kid}:\n{notes[kid][3]}")

# PART 4: colour vs number of L knots (confound check) and knot-count tuples per canuto group
print('\n\n########## PART 4 ##########')
for kid in ('KH0282','KH0346','KH0384','KH0281','KH0280','KH0288','KH0289','KH0271','KH0348'):
    k=ks[kid]; ps=[c for c in pend(k) if c['knots']]
    cc=collections.defaultdict(list)
    for c in ps: cc[c['color']].append(sum(1 for x in c['knots'] if x['type']=='L'))
    print(kid,'L-knots per cord by colour:',{c:(len(v),round(statistics.mean(v),2)) for c,v in cc.items() if len(v)>=3})
    gs=groups_of(k)
    tup=collections.Counter(tuple(sum(1 for x in c['knots'] if x['type']=='L') for c in g) for g in gs if len(g)>=2)
    print('   knot-count tuples per group:',tup.most_common(6))
    ctup=collections.Counter(tuple(c['color'] for c in g) for g in gs if len(g)>=2)
    print('   colour tuples per group:',ctup.most_common(4))
