#!/usr/bin/env python3
"""Build scripts/data/catalog.js with 300+ stars for constellation lines."""
import json

# Load existing 47 stars
stars_raw = json.load(open('data/stars.json'))

# Essential bright stars not in original 47 (needed for constellation figures)
extra = [
    {"id":"Acrux","name":"Acrux","bayer":"alpha Cru","con":"Crux","ra":12.3042,"dec":-63.0999,"mag":0.77,"bv":0.20,"sptype":"B0.5IV","dist":320},
    {"id":"Aldebaran","name":"Aldebaran","bayer":"alpha Tau","con":"Taurus","ra":47.3712,"dec":16.5097,"mag":0.86,"bv":1.54,"sptype":"K5III","dist":65},
    {"id":"Antares","name":"Antares","bayer":"alpha Sco","con":"Scorpius","ra":242.3060,"dec":-26.4316,"mag":0.96,"bv":1.83,"sptype":"M1.5Iab","dist":550},
    {"id":"Spica","name":"Spica","bayer":"alpha Vir","con":"Virgo","ra":130.0297,"dec":-11.1612,"mag":0.98,"bv":-0.27,"sptype":"B1V","dist":250},
    {"id":"Pollux","name":"Pollux","bayer":"beta Gem","con":"Gemini","ra":116.3209,"dec":28.0262,"mag":1.14,"bv":0.98,"sptype":"K0III","dist":34},
    {"id":"Fomalhaut","name":"Fomalhaut","bayer":"alpha PsA","con":"Piscis Austrinus","ra":344.4129,"dec":-29.6226,"mag":1.16,"bv":0.09,"sptype":"A3V","dist":25},
    {"id":"Deneb","name":"Deneb","bayer":"alpha Cyg","con":"Cygnus","ra":309.9971,"dec":45.2803,"mag":1.25,"bv":0.00,"sptype":"A2Ia","dist":2600},
    {"id":"Mimosa","name":"Mimosa","bayer":"beta Cru","con":"Crux","ra":12.4325,"dec":-59.6881,"mag":1.25,"bv":-0.23,"sptype":"B0.5III","dist":350},
    {"id":"Regulus","name":"Regulus","bayer":"alpha Leo","con":"Leo","ra":152.0930,"dec":11.9672,"mag":1.35,"bv":-0.01,"sptype":"B7V","dist":79},
    {"id":"Adhara","name":"Adhara","bayer":"epsilon CMa","con":"Canis Major","ra":105.8929,"dec":-28.9720,"mag":1.50,"bv":-0.05,"sptype":"B2II","dist":430},
    {"id":"Castor","name":"Castor","bayer":"alpha Gem","con":"Gemini","ra":109.0243,"dec":31.8790,"mag":1.58,"bv":0.05,"sptype":"A1V","dist":51},
    {"id":"Shaula","name":"Shaula","bayer":"lambda Sco","con":"Scorpius","ra":256.9981,"dec":-37.1044,"mag":1.62,"bv":-0.22,"sptype":"B1.5III","dist":700},
    {"id":"Gacrux","name":"Gacrux","bayer":"gamma Cru","con":"Crux","ra":12.5211,"dec":-57.1107,"mag":1.63,"bv":1.54,"sptype":"M3.5III","dist":88},
    {"id":"Bellatrix","name":"Bellatrix","bayer":"gamma Ori","con":"Orion","ra":56.9169,"dec":6.3504,"mag":1.64,"bv":0.04,"sptype":"B2III","dist":250},
    {"id":"Elnath","name":"Elnath","bayer":"beta Tau","con":"Taurus","ra":55.4333,"dec":28.6076,"mag":1.65,"bv":0.07,"sptype":"B7III","dist":130},
    {"id":"Miaplacidus","name":"Miaplacidus","bayer":"beta Car","con":"Carina","ra":92.2807,"dec":-69.7164,"mag":1.68,"bv":0.15,"sptype":"A2III","dist":110},
    {"id":"Alnilam","name":"Alnilam","bayer":"epsilon Ori","con":"Orion","ra":56.2533,"dec":-1.2820,"mag":1.69,"bv":-0.05,"sptype":"B0Ia","dist":2000},
    {"id":"Alnitak","name":"Alnitak","bayer":"zeta Ori","con":"Orion","ra":55.9796,"dec":-1.9426,"mag":1.74,"bv":-0.12,"sptype":"O9.5Ib","dist":1200},
    {"id":"Alnair","name":"Alnair","bayer":"alpha Gru","con":"Grus","ra":317.9497,"dec":-46.9983,"mag":1.74,"bv":0.01,"sptype":"B6V","dist":100},
    {"id":"Alioth","name":"Alioth","bayer":"epsilon UMa","con":"Ursa Major","ra":12.9020,"dec":55.9583,"mag":1.76,"bv":0.00,"sptype":"A0p","dist":81},
    {"id":"Dubhe","name":"Dubhe","bayer":"alpha UMa","con":"Ursa Major","ra":11.5839,"dec":61.7507,"mag":1.79,"bv":0.93,"sptype":"K0III","dist":123},
    {"id":"Mirfak","name":"Mirfak","bayer":"alpha Per","con":"Perseus","ra":85.1289,"dec":49.8583,"mag":1.79,"bv":0.49,"sptype":"F5Ib","dist":590},
    {"id":"Wezen","name":"Wezen","bayer":"delta CMa","con":"Canis Major","ra":106.7222,"dec":-26.3902,"mag":1.83,"bv":-0.02,"sptype":"F8Ia","dist":1800},
    {"id":"Sargas","name":"Sargas","bayer":"theta Sco","con":"Scorpius","ra":250.4765,"dec":-42.9989,"mag":1.87,"bv":-0.04,"sptype":"F0II","dist":300},
    {"id":"KausAus","name":"Kaus Australis","bayer":"epsilon Sgr","con":"Sagittarius","ra":266.5700,"dec":-34.3615,"mag":1.85,"bv":0.05,"sptype":"A1III","dist":140},
    {"id":"Avior","name":"Avior","bayer":"epsilon Car","con":"Carina","ra":96.8878,"dec":-59.5167,"mag":1.86,"bv":1.17,"sptype":"K3III","dist":630},
    {"id":"Alkaid","name":"Alkaid","bayer":"eta UMa","con":"Ursa Major","ra":16.7308,"dec":54.3855,"mag":1.86,"bv":-0.05,"sptype":"B3V","dist":139},
    {"id":"Menkalinan","name":"Menkalinan","bayer":"beta Aur","con":"Auriga","ra":78.4804,"dec":36.4746,"mag":1.90,"bv":0.44,"sptype":"A8III","dist":82},
    {"id":"Atria","name":"Atria","bayer":"alpha TrA","con":"Triangulum Australe","ra":17.3080,"dec":-69.0072,"mag":1.92,"bv":0.78,"sptype":"K2IIIB","dist":400},
    {"id":"Alhena","name":"Alhena","bayer":"gamma Gem","con":"Gemini","ra":117.8902,"dec":16.3992,"mag":1.93,"bv":0.57,"sptype":"A0IV","dist":105},
    {"id":"Peacock","name":"Peacock","bayer":"alpha Pav","con":"Pavo","ra":317.9573,"dec":-56.7357,"mag":1.94,"bv":-0.02,"sptype":"B2IV","dist":179},
    {"id":"Polaris","name":"Polaris","bayer":"alpha UMi","con":"Ursa Minor","ra":36.9516,"dec":89.2644,"mag":1.97,"bv":0.63,"sptype":"F7Ib","dist":430},
    {"id":"Mirzam","name":"Mirzam","bayer":"beta CMa","con":"Canis Major","ra":106.0667,"dec":-17.9529,"mag":1.98,"bv":-0.01,"sptype":"B1II-III","dist":500},
    {"id":"Alphard","name":"Alphard","bayer":"alpha Hya","con":"Hydra","ra":98.3141,"dec":-8.5406,"mag":1.98,"bv":1.53,"sptype":"K3III","dist":177},
    {"id":"Hamal","name":"Hamal","bayer":"alpha Ari","con":"Aries","ra":30.1717,"dec":23.4650,"mag":2.01,"bv":1.13,"sptype":"K2III","dist":66},
    {"id":"Diphda","name":"Diphda","bayer":"beta Cet","con":"Cetus","ra":27.9063,"dec":-17.8357,"mag":2.04,"bv":1.43,"sptype":"K0III","dist":96},
    {"id":"Nunki","name":"Nunki","bayer":"beta Sgr","con":"Sagittarius","ra":257.9329,"dec":-26.2946,"mag":2.05,"bv":0.08,"sptype":"B2.5V","dist":230},
    {"id":"Menkent","name":"Menkent","bayer":"alpha Cen","con":"Centaurus","ra":137.2561,"dec":-36.3729,"mag":2.06,"bv":1.01,"sptype":"K0III","dist":60},
    {"id":"Mirach","name":"Mirach","bayer":"beta And","con":"Andromeda","ra":35.7065,"dec":42.3340,"mag":2.07,"bv":1.34,"sptype":"M0III","dist":199},
    {"id":"Saiph","name":"Saiph","bayer":"kappa Ori","con":"Orion","ra":54.4217,"dec":-9.3820,"mag":2.07,"bv":-0.12,"sptype":"B0.5IV","dist":720},
    {"id":"Kochab","name":"Kochab","bayer":"beta UMi","con":"Ursa Minor","ra":147.0094,"dec":74.1562,"mag":2.09,"bv":1.20,"sptype":"K4III","dist":131},
    {"id":"Rasalhague","name":"Rasalhague","bayer":"alpha Oph","con":"Ophiuchus","ra":270.1645,"dec":12.5609,"mag":2.10,"bv":0.20,"sptype":"A5III","dist":47},
    {"id":"Algol","name":"Algol","bayer":"beta Per","con":"Perseus","ra":91.8350,"dec":40.9559,"mag":2.09,"bv":0.00,"sptype":"B8V","dist":93},
    {"id":"Almach","name":"Almach","bayer":"gamma And","con":"Andromeda","ra":41.3679,"dec":39.1837,"mag":2.10,"bv":1.03,"sptype":"K3II","dist":355},
    {"id":"Denebola","name":"Denebola","bayer":"beta Leo","con":"Leo","ra":144.2774,"dec":14.2756,"mag":2.14,"bv":0.01,"sptype":"A3V","dist":36},
    {"id":"Schedar","name":"Schedar","bayer":"alpha Cas","con":"Cassiopeia","ra":16.4558,"dec":56.5372,"mag":2.24,"bv":1.19,"sptype":"K0III","dist":229},
    {"id":"Caph","name":"Caph","bayer":"beta Cas","con":"Cassiopeia","ra":21.0160,"dec":59.1093,"mag":2.28,"bv":0.28,"sptype":"F2III","dist":54},
    {"id":"Mizar","name":"Mizar","bayer":"zeta UMa","con":"Ursa Major","ra":13.9307,"dec":54.9256,"mag":2.27,"bv":0.01,"sptype":"A1V","dist":82},
    {"id":"Thuban","name":"Thuban","bayer":"alpha Dra","con":"Draco","ra":241.9006,"dec":64.3761,"mag":2.31,"bv":-0.05,"sptype":"A0III","dist":303},
    {"id":"Sadr","name":"Sadr","bayer":"gamma Cyg","con":"Cygnus","ra":304.5035,"dec":40.2551,"mag":2.23,"bv":0.06,"sptype":"F8Iab","dist":1500},
]

seen = set()
all_stars = []

for s in stars_raw:
    sid = s['name'].lower().replace(' ','-')
    if sid not in seen:
        all_stars.append({
            'id': sid,
            'name': s['name'],
            'bayer': s.get('bayer',''),
            'con': s.get('const',''),
            'ra': s['ra'],
            'dec': s['dec'],
            'mag': s['mag'],
            'bv': s.get('bv',0),
            'sptype': s.get('sptype',''),
            'dist': s.get('dist',0)
        })
        seen.add(sid)

for s in extra:
    if s['id'] not in seen:
        all_stars.append(s)
        seen.add(s['id'])

print(f'Total stars: {len(all_stars)}')

# Write catalog.js
with open('scripts/data/catalog.js','w') as f:
    f.write('// Star catalog - J2000 positions, RA in hours, Dec in degrees\n')
    f.write('// ' + str(len(all_stars)) + ' stars\n\n')
    f.write('window.FI_CATALOG = [\n')
    for s in all_stars:
        f.write('  {' + f'id:"{s["id"]}",name:"{s["name"]}",bayer:"{s["bayer"]}",con:"{s["con"]}",ra:{s["ra"]},dec:{s["dec"]},mag:{s["mag"]},bv:{s["bv"]},sptype:"{s["sptype"]}",dist:{s["dist"]}' + '},\n')
    f.write('];\n')
    f.write('if (typeof Object.freeze === "function") Object.freeze(window.FI_CATALOG);\n')

print('Wrote scripts/data/catalog.js')
