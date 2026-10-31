import json,glob,collections,random,statistics
ROOT='/Users/roc8917/Documents/GitHub/khipu'
ks={json.load(open(p))['id']:json.load(open(p)) for p in glob.glob(ROOT+'/public/data/khipus/KH*.json')}
def seq(c): return sorted(c['knots'],key=lambda x:x['pos'])
def chi2(labels,cats):
    tab=collections.Counter(zip(labels,cats)); n=len(labels); rl=collections.Counter(labels); rc=collections.Counter(cats); st=0
    for a in rl:
        for b in rc:
            e=rl[a]*rc[b]/n; st+=(tab.get((a,b),0)-e)**2/e
    return st
def perm_p(labels,cats,seed=11,N=2000):
    obs=chi2(labels,cats); rng=random.Random(seed); lab=list(labels); ge=0
    for _ in range(N):
        rng.shuffle(lab)
        if chi2(lab,cats)>=obs-1e-12: ge+=1
    return (ge+1)/(N+1)
def contrast(kid,rare,ref,label):
    k=ks[kid]; cs=[c for c in k['cords'] if c['knots'] and any(x['type'] in (rare,ref) for x in c['knots'])]
    has=[any(x['type']==rare for x in c['knots']) for c in cs]
    feats={'colour':[c['color'] or '?' for c in cs],'attach':[c['attach'] or '?' for c in cs],'twist':[c['twist'] or '?' for c in cs],'level':[c['level'] for c in cs],
           'ord':[(min(c['ordinal']-k['groups'][c['group']]['first']+1,4) if c.get('group') is not None and c['level']==1 else 'sub') for c in cs],
           'grp3':[(int(3*c['group']/max(1,len(k['groups']))) if c.get('group') is not None and c['level']==1 else 'sub') for c in cs],
           'nknots':[min(len(c['knots']),3) for c in cs],'value':[('0' if not c['value'] else '1' if c['value']==1 else '2-9' if c['value']<10 else '10+') for c in cs]}
    out=[]
    for f,cats in feats.items():
        if len(set(cats))<2: continue
        p=perm_p(has,cats)
        if p<0.01:
            tab=collections.defaultdict(lambda:[0,0])
            for h,cat in zip(has,cats): tab[cat][0 if h else 1]+=1
            out.append(f"{f} p={p:.4f} {[(str(a),f'{b[0]}/{b[0]+b[1]}') for a,b in sorted(tab.items(),key=lambda z:-z[1][0])[:5]]}")
    # position of the rare vs ref knot (same rank)
    pr=[x['pos'] for c in cs for x in c['knots'] if x['type']==rare]; pf=[x['pos'] for c in cs for x in c['knots'] if x['type']==ref and x['n']==(3 if rare=='LL' else x['n'])]
    print(f'{label} {kid}: {sum(has)} {rare}-cords vs {len(cs)-sum(has)} {ref}-cords; pos {rare} med={statistics.median(pr):.1f} {ref} med={statistics.median(pf):.1f}; ',' ; '.join(out) if out else 'no feature p<0.01')
for kid in ['KH0667','KH0198','KH0204','KH0603','KH0191']: contrast(kid,'EE','E','EE vs E')
for kid in ['KH0082','KH0083']:
    # restrict ref to L with n==3
    k=ks[kid]
    for c in k['cords']:
        for x in c['knots']:
            if x['type']=='L' and x['n']==3: x['type']='L3'
    contrast(kid,'LL','L3','LL vs L3')
for kid in ['KH0431','KH0441','KH0453']:
    k=ks[kid]
    for c in k['cords']:
        for x in c['knots']:
            if x['type']=='L' and x['n']<=3: x['type']='Lsmall'
    contrast(kid,'SP','Lsmall','SP vs L(2-3)')
print()
for kid in ['KH0349','KH0247']:
    k=ks[kid]
    for c in k['cords']:
        if any(x['type']=='U' for x in c['knots']):
            print(kid,c['name'],c['color'],c['attach'],c['value'],' '.join(f"{x['n']}{x['type']}({x['pos']}{x['dir']})={x.get('value')}" for x in seq(c)),'|',(c.get('notes') or '')[:110])
