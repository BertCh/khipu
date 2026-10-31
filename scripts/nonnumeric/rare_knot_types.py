#!/usr/bin/env python3
"""Family D: rare knot types (SP, TF, EE, LL, BL, U) in the KFG corpus.
python3 analysis.py"""
import json, glob, collections, random, statistics, sqlite3, math, re
ROOT='/Users/roc8917/Documents/GitHub/khipu'
RARE=['SP','TF','EE','LL','BL','U']
ks={}
for p in sorted(glob.glob(ROOT+'/public/data/khipus/KH*.json')):
    k=json.load(open(p)); ks[k['id']]=k
def seq(c): return sorted(c['knots'],key=lambda x:x['pos'])
def sig(c): return ' '.join(x['type'] for x in seq(c))
def q(xs,n=4): return [round(v,1) for v in statistics.quantiles(xs,n=n)] if len(xs)>1 else xs

# ---------- 1. positions, values, directions ----------
print('='*70); print('1. POSITION / VALUE / DIRECTION per rare type')
occ=collections.defaultdict(list)   # type -> list of (kid, cord, knot)
for kid,k in ks.items():
    for c in k['cords']:
        for x in c['knots']:
            if x['type'] in RARE: occ[x['type']].append((kid,c,x))
for t in RARE:
    L=occ[t]; print(f'\n--- {t}: {len(L)} knots in {len(set(a for a,_,_ in L))} khipus')
    # rank on cord: lowest / top / middle / alone
    rank=collections.Counter(); valrule=collections.Counter(); dirs=collections.Counter(); bandrel=collections.Counter()
    perk=collections.defaultdict(list)
    for kid,c,x in L:
        s=seq(c); i=s.index(x)
        rank['alone' if len(s)==1 else 'lowest' if i==len(s)-1 else 'top' if i==0 else 'middle']+=1
        v=x.get('value'); n=x['n']
        valrule[('v==n' if v==n else 'v==10n' if v==10*n else 'v==100n' if v==100*n else 'v==1000n' if v==1000*n else 'v==0' if v==0 else f'other')]+=1
        dirs[x['dir']]+=1
        perk[kid].append(x['pos'])
        # is there an S cluster below it on the same cord?
        below=[y for y in s if y['pos']>x['pos']]
        if any(y['type']=='S' for y in below): bandrel['S below it']+=1
        elif any(y['type'] in ('L','E') for y in below): bandrel['L/E below it']+=1
        elif len(s)==1: bandrel['alone']+=1
        else: bandrel['lowest']+=1
    print(' rank on cord:',dict(rank)); print(' KFG value rule:',dict(valrule)); print(' dir:',dict(dirs)); print(' what lies below:',dict(bandrel))
    # per khipu position vs S/L bands
    for kid in sorted(perk,key=lambda z:-len(perk[z]))[:6]:
        k=ks[kid]; Sp=[x['pos'] for c in k['cords'] for x in c['knots'] if x['type']=='S']; Lp=[x['pos'] for c in k['cords'] for x in c['knots'] if x['type']=='L']
        Ep=[x['pos'] for c in k['cords'] for x in c['knots'] if x['type']=='E']
        dk=collections.Counter(x['dir'] for c in k['cords'] for x in c['knots'] if x['type'] not in RARE)
        dr=collections.Counter(x['dir'] for kid2,c,x in L if kid2==kid)
        print(f'  {kid} n={len(perk[kid])} pos q={q(perk[kid])} | S q={q(Sp)} (n={len(Sp)}) | L q={q(Lp)} (n={len(Lp)}) | E q={q(Ep)} (n={len(Ep)}) | dir rare={dict(dr)} ordinary={dict(dk)}')

# ---------- 2. co-occurrence signatures + permutation tests ----------
print('\n'+'='*70); print('2. SIGNATURES and PERMUTATION TESTS (within khipu, 1000 perms, seed 7)')
def chi2(labels,cats):
    # chi-square statistic of contingency labels(bool) x cats
    tab=collections.Counter(zip(labels,cats)); n=len(labels)
    rl=collections.Counter(labels); rc=collections.Counter(cats); st=0
    for a in rl:
        for b in rc:
            e=rl[a]*rc[b]/n; o=tab.get((a,b),0); st+=(o-e)**2/e
    return st
def perm_p(labels,cats,seed=7,N=1000):
    obs=chi2(labels,cats); rng=random.Random(seed); lab=list(labels); ge=0
    for _ in range(N):
        rng.shuffle(lab); 
        if chi2(lab,cats)>=obs-1e-12: ge+=1
    return (ge+1)/(N+1)
for t in RARE:
    byk=collections.Counter(kid for kid,_,_ in occ[t])
    print(f'\n--- {t}')
    sc=collections.Counter(sig(c) for _,c,_ in occ[t])
    print(' cord signatures (top→bottom):',sc.most_common(10))
    for kid,nn in byk.most_common(8):
        k=ks[kid]; cords=[c for c in k['cords'] if c['knots']]
        if len(cords)<8: continue
        has=[any(x['type']==t for x in c['knots']) for c in cords]
        if sum(has)<4 or sum(has)==len(cords): print(f'  {kid}: {sum(has)}/{len(cords)} knotted cords carry {t} (no contrast)'); continue
        res=[]
        feats={'colour':[c['color'] or '?' for c in cords],'attach':[c['attach'] or '?' for c in cords],'twist':[c['twist'] or '?' for c in cords],
               'level':[c['level'] for c in cords],
               'ord_in_group':[ (min(c['ordinal']-k['groups'][c['group']]['first']+1,4) if c.get('group') is not None and c['level']==1 else 'sub') for c in cords],
               'group_tercile':[ (int(3*c['group']/max(1,len(k['groups']))) if c.get('group') is not None and c['level']==1 else 'sub') for c in cords],
               'has_subs':[any(d.get('parent')==c['name'] for d in k['cords']) for c in cords]}
        out=[]
        for f,cats in feats.items():
            if len(set(cats))<2: continue
            p=perm_p(has,cats)
            if p<0.01:
                tab=collections.defaultdict(lambda:[0,0])
                for h,cat in zip(has,cats): tab[cat][0 if h else 1]+=1
                top=sorted(tab.items(),key=lambda z:-(z[1][0]/(sum(z[1]))))[:4]
                out.append(f'{f} p={p:.3f} rate-by-cat={[(str(a),f"{b[0]}/{b[0]+b[1]}") for a,b in top]}')
        print(f'  {kid}: {sum(has)}/{len(cords)} cords; ', '; '.join(out) if out else 'no feature p<0.01')

# ---------- 3. substitution ----------
print('\n'+'='*70); print('3. SUBSTITUTION: rare type vs ordinary type by n, within khipu')
for t,ref in [('SP','L'),('BL','L'),('LL','L'),('EE','E'),('TF','S')]:
    byk=collections.Counter(kid for kid,_,_ in occ[t])
    for kid,nn in byk.most_common(6):
        k=ks[kid]
        rn=collections.Counter(x['n'] for c in k['cords'] for x in c['knots'] if x['type']==t)
        on=collections.Counter(x['n'] for c in k['cords'] for x in c['knots'] if x['type']==ref)
        alone=sum(1 for c in k['cords'] if len(c['knots'])==1 and c['knots'][0]['type']==t)
        only=sum(1 for c in k['cords'] if c['knots'] and all(x['type']==t for x in c['knots']))
        # position rank: rare vs ref
        rr=collections.Counter(); 
        for c in k['cords']:
            s=seq(c)
            for i,x in enumerate(s):
                if x['type'] in (t,ref): rr[(x['type'],'alone' if len(s)==1 else 'low' if i==len(s)-1 else 'top' if i==0 else 'mid')]+=1
        print(f' {t} vs {ref} in {kid}: {t} n-dist={dict(sorted(rn.items()))}; {ref} n-dist={dict(sorted(on.items()))}; both used for n={sorted(set(rn)&set(on))}; cords with only {t}: {only} (single-knot {alone}); rank {dict(rr)}')

# ---------- 4. KH0449 tufted ----------
print('\n'+'='*70); print('4. KH0449 tufted knots')
k=ks['KH0449']; cords=[c for c in k['cords'] if c['level']==1]
vals=[c['value'] for c in cords]
print(' cords',len(cords),'values:',vals)
print(' value = sum over TF clusters of n*10^band? check:')
bands=[(0,8,1000),(8,16,100),(16,23,10),(23,40,1)]
ok=0; bad=[]
for c in cords:
    v=0
    for x in c['knots']:
        if x['type']!='TF': continue
        pv=[b for a,e,b in bands if a<=x['pos']<e]; v+=x['n']*(pv[0] if pv else 0)
    if v==c['value']: ok+=1
    else: bad.append((c['name'],c['value'],v,[(x['n'],x['type'],x['pos']) for x in c['knots']]))
print(f'  band rule (0-8:1000, 8-16:100, 16-23:10, 23+:1) reproduces {ok}/{len(cords)}; mismatches: {bad}')
digs=collections.Counter(); 
for c in cords:
    for x in c['knots']:
        if x['type']=='TF': digs[x['n']]+=1
print('  TF cluster sizes:',dict(digs), ' -> digits >1 only in units band:',all(x['n']==1 for c in cords for x in c['knots'] if x['type']=='TF' and x['pos']<23))
# group structure and arithmetic
gs=collections.defaultdict(list)
for c in cords: gs[c['group']].append(c)
print('  groups (idx: colour, values):')
for g in sorted(gs):
    print(f'   g{g+1}: {collections.Counter(c["color"] for c in gs[g]).most_common(2)} {[c["value"] for c in gs[g]]}')
# any cord = sum of another group? any group sum equal to a cord?
gsum={g:sum(c['value'] or 0 for c in gs[g]) for g in gs}
hits=[(c['name'],c['value'],g) for c in cords for g in gs if c['value'] and c['value']>=3 and c['value']==gsum[g] and c['group']!=g]
print('  cord value == another group total (value>=3):',hits[:10], 'n=',len(hits))
# digit-sum interpretation: values as binary-ish flags? count cords by pattern of bands present
pat=collections.Counter(tuple(sorted({[b for a,e,b in bands if a<=x['pos']<e][0] for x in c['knots'] if x['type']=='TF'})) for c in cords if c['knots'])
print('  band-presence patterns:',pat.most_common())
print('  KFG-recorded 1s with tufts vs ordinary E on p95:',[(c['name'],sig(c)) for c in cords if any(x['type']=='E' for x in c['knots'])])

# ---------- 4b. U knots: A/B/C code in KH0417/0418 ----------
print('\n'+'='*70); print('4b. U (unknown) knots')
for kid in ['KH0417','KH0418','KH0349','KH0247']:
    k=ks[kid]; cs=[c for c in k['cords'] if any(x['type']=='U' for x in c['knots'])]
    allc=[c for c in k['cords'] if c['knots']]
    print(f' {kid}: {len(cs)}/{len(allc)} knotted cords have U; knotTypes={k["stats"]["knotTypes"]}; values of U-cords={collections.Counter(c["value"] for c in cs).most_common(4)}')
    if kid in ('KH0417','KH0418'):
        codes=[]
        for c in k['cords']:
            m=re.findall(r'\b[ABC]\b',c.get('notes') or '')
            if m: codes.append((c['name'],''.join(m),len(c['knots'])))
        print('  A/B/C sequences from notes (n cords with codes):',len(codes),' length match knots:',sum(1 for _,s,n in codes if len(s)==n))
        sc=collections.Counter(s for _,s,_ in codes); print('  sequence inventory:',sc.most_common(12))
        posd=collections.defaultdict(collections.Counter)
        for _,s,_ in codes:
            for i,ch in enumerate(s): posd['first' if i==0 else 'last' if i==len(s)-1 else 'mid'][ch]+=1
        print('  letter by position:',{a:dict(b) for a,b in posd.items()})
        # pairs: adjacent cords identical?
        same=sum(1 for i in range(0,len(codes)-1,2) if codes[i][1]==codes[i+1][1]); print('  adjacent pairs identical:',same,'of',len(codes)//2)

# ---------- 5. Berlin Pachacamac SP khipus ----------
print('\n'+'='*70); print('5. Berlin Pachacamac SP khipus vs other Berlin Pachacamac khipus')
berlin=[kid for kid,k in ks.items() if (k['museum']['canonical'] or '').startswith('Ethnologisches') and 'achacam' in (k['provenance'] or '')]
print(' Berlin+Pachacamac khipus:',len(berlin))
def prof(kid):
    k=ks[kid]; cs=[c for c in k['cords'] if c['level']==1]; kn=[c for c in k['cords'] if c['knots']]
    cols=collections.Counter(c['color'] for c in cs)
    att=collections.Counter(c['attach'] for c in cs); tw=collections.Counter(c['twist'] for c in cs)
    uS=0
    for c in kn:
        s=seq(c); S=[x for x in s if x['type']=='S']; U=[x for x in s if x['type'] in ('L','E','SP','BL','EE','LL')]
        if S and U and min(u['pos'] for u in U)<max(x['pos'] for x in S): uS+=1
    mu=sum(1 for c in kn if sum(1 for x in c['knots'] if x['type'] in ('L','E','SP','BL','EE','LL'))>=2)
    dirs=collections.Counter(x['dir'] for c in kn for x in c['knots'])
    gsz=[g['n'] for g in k['groups']]
    return dict(n=len(cs),subs=k['stats']['nSubsidiaries'],ncol=len(cols),top=[a for a,_ in cols.most_common(4)],R=att.get('R',0),V=att.get('V',0),Stw=tw.get('S',0),Ztw=tw.get('Z',0),
                uS=round(uS/max(1,len(kn)),2),multi=round(mu/max(1,len(kn)),2),Zk=round(dirs.get('Z',0)/max(1,sum(dirs.values())),2),
                SP=k['stats']['knotTypes'].get('SP',0),gmed=statistics.median(gsz) if gsz else None,ng=len(gsz),fiber=k['primary']['fiber'],pcol=k['primary']['color'],plen=k['primary']['length'],created=k['created'],okr=(k['okr'] or {}).get('investigatorNum'))
sp=['KH0431','KH0441','KH0453','KH0455']
print(f"{'id':7}{'inv':8}{'np':>4}{'sub':>4}{'ncol':>5}{'R':>4}{'V':>4}{'Stw':>4}{'Ztw':>4}{'uS':>5}{'mult':>5}{'Zknt':>5}{'SP':>4}{'gmed':>5}{'ng':>4}  fiber pcol plen created top colours")
for kid in sp+[b for b in berlin if b not in sp]:
    p=prof(kid); print(f"{kid:7}{str(p['okr'])[:7]:8}{p['n']:4}{p['subs']:4}{p['ncol']:5}{p['R']:4}{p['V']:4}{p['Stw']:4}{p['Ztw']:4}{p['uS']:5}{p['multi']:5}{p['Zk']:5}{p['SP']:4}{str(p['gmed']):>5}{p['ng']:4}  {p['fiber']} {p['pcol']} {p['plen']} {p['created']} {p['top']}")
# colour Jaccard among the four
cols={kid:set(c['color'] for c in ks[kid]['cords'] if c['color']) for kid in sp}
for i in range(4):
    for j in range(i+1,4):
        a,b=cols[sp[i]],cols[sp[j]]; print(f'  colour Jaccard {sp[i]}-{sp[j]}: {len(a&b)/len(a|b):.2f} shared={sorted(a&b)[:8]}')
