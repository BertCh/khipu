#!/usr/bin/env python3
"""Corpus-wide decimal-grammar scan: which cords / khipus break the Inka base-ten knot grammar."""
import json, glob, collections, statistics, sys, os
HERE=os.path.dirname(os.path.abspath(__file__))
ROOT=os.path.join(HERE,'..','..','public','data','khipus')
UNIT={'L','E','EE','LL','BL','SP','TF'}
LABELLED={'KH0015','KH0047','KH0048','KH0094','KH0100','KH0108','KH0584'}
ks=[json.load(open(p)) for p in sorted(glob.glob(ROOT+'/KH*.json'))]
rows=[]; flagtot=collections.Counter(); cordtot=0
percord=[]
for k in ks:
    n=0; f=collections.Counter(); Spos=[]; Upos=[]; nullv=0
    for c in k['cords']:
        if not c['knots']: continue
        n+=1; cordtot+=1
        seq=sorted(c['knots'],key=lambda x:x['pos'])
        S=[x for x in seq if x['type']=='S']; U=[x for x in seq if x['type'] in UNIT]; UK=[x for x in seq if x['type']=='U']
        fl=set()
        if S and U and min(u['pos'] for u in U) < max(s['pos'] for s in S): fl.add('unit_above_S')
        if len(U)>=2: fl.add('multi_unit')
        if any(s['n']>9 for s in S): fl.add('S>9')
        if any(u['type']=='L' and u['n']>9 for u in U): fl.add('L>9')
        dirs=set(ch for x in seq for ch in x['dir'] if ch in 'SZ')
        if len(dirs)==2: fl.add('mixdir')
        if any(x['type'] in ('EE','LL','BL','SP','TF') for x in seq): fl.add('raretype')
        if UK: fl.add('Utype')
        if c['value'] is None: fl.add('nullval'); nullv+=1
        # adjacent S clusters very close (<1.5cm) - segmentation issue, ignore
        bad = bool(fl & {'unit_above_S','multi_unit','S>9','L>9'})
        if bad: fl.add('BAD')
        for x in fl: f[x]+=1; flagtot[x]+=1
        Spos += [s['pos'] for s in S]; Upos += [u['pos'] for u in U]
        percord.append((k['id'],c['name'],c['level'],fl,' '.join(f"{x['n']}{x['type']}" for x in seq)))
    if n==0: continue
    # positional AUC: P(unit knot lower than single knot), sampled pairs
    auc=None
    if Spos and Upos:
        import random; random.seed(1)
        sp=random.sample(Spos,min(400,len(Spos))); up=random.sample(Upos,min(400,len(Upos)))
        auc=sum(1 for u in up for s in sp if u>s)/(len(up)*len(sp))
    rows.append(dict(id=k['id'],alias=k['aliases'][0] if k['aliases'] else '',n=n,bad=f['BAD'],frac=f['BAD']/n,auc=auc,
        uS=f['unit_above_S'],mu=f['multi_unit'],s9=f['S>9'],l9=f['L>9'],mix=f['mixdir'],rare=f['raretype'],ut=f['Utype'],null=nullv,
        museum=k['museum']['canonical'],prov=k['provenance'],lab=k['id'] in LABELLED))
print('knotted cords',cordtot,dict(flagtot))
print(f"\n{'id':7}{'alias':14}{'n':>5}{'bad':>5}{'frac':>6}{'auc':>6}{'uS':>4}{'mu':>4}{'s9':>4}{'l9':>4}{'mix':>4}{'rare':>5}{'U':>4}{'null':>5}  museum / prov")
rows.sort(key=lambda r:-r['frac'])
for r in rows:
    if r['frac']>=0.15 and r['n']>=8 or r['lab']:
        print(f"{r['id']:7}{r['alias'][:13]:14}{r['n']:5}{r['bad']:5}{r['frac']:6.2f}{(r['auc'] if r['auc'] is not None else -1):6.2f}{r['uS']:4}{r['mu']:4}{r['s9']:4}{r['l9']:4}{r['mix']:4}{r['rare']:5}{r['ut']:4}{r['null']:5}  {'*' if r['lab'] else ' '} {str(r['museum'])[:28]} / {r['prov']}")
json.dump(rows,open(os.path.join(HERE,'scan_rows.json'),'w'))
json.dump([(a,b,c,sorted(d),e) for a,b,c,d,e in percord],open(os.path.join(HERE,'scan_cords.json'),'w'))
# distribution
fr=[r['frac'] for r in rows if r['n']>=8]
print('\nkhipus with >=8 knotted cords',len(fr),' frac-bad quantiles',[round(q,3) for q in statistics.quantiles(fr,n=10)])
print('khipus frac>=0.25:',sum(1 for x in fr if x>=0.25),' >=0.15:',sum(1 for x in fr if x>=0.15),' >=0.05:',sum(1 for x in fr if x>=0.05),' ==0:',sum(1 for x in fr if x==0))
au=[r['auc'] for r in rows if r['auc'] is not None and r['n']>=8]
print('auc quantiles',[round(q,3) for q in statistics.quantiles(au,n=10)],' auc<0.8:',sum(1 for x in au if x<0.8))
