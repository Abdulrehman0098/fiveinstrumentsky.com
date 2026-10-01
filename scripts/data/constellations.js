// IAU constellation figures - line segments as pairs of star names
// Each figure has a centroid (ra/dec in degrees) for labeling
window.FI_CONSTELLATIONS = [
  { name: "Ursa Major", centroid: { ra: 14.0, dec: 55.0 }, lines: [
    ["Dubhe","Merak"],["Merak","Phecda"],["Phecda","Megrez"],
    ["Megrez","Alioth"],["Alioth","Mizar"],["Mizar","Alkaid"]
  ]},
  { name: "Ursa Minor", centroid: { ra: 15.0, dec: 70.0 }, lines: [
    ["Polaris","Kochab"]
  ]},
  { name: "Orion", centroid: { ra: 56.0, dec: 0.0 }, lines: [
    ["Betelgeuse","Bellatrix"],["Bellatrix","Mintaka"],
    ["Mintaka","Alnilam"],["Alnilam","Alnitak"],["Alnitak","Saiph"],
    ["Saiph","Rigel"],["Rigel","Mintaka"],["Betelgeuse","Meissa"],
    ["Meissa","Mintaka"]
  ]},
  { name: "Cassiopeia", centroid: { ra: 16.0, dec: 59.0 }, lines: [
    ["Schedar","Caph"],["Caph","Ruchbah"],["Ruchbah","Segin"],["Segin","Navi"]
  ]},
  { name: "Cygnus", centroid: { ra: 304.0, dec: 40.0 }, lines: [
    ["Deneb","Sadr"],["Sadr","Albireo"],["Sadr","Gienah"]
  ]},
  { name: "Lyra", centroid: { ra: 280.0, dec: 35.0 }, lines: [
    ["Vega","Sulafat"],["Sulafat","Sheliak"]
  ]},
  { name: "Aquila", centroid: { ra: 290.0, dec: 5.0 }, lines: [
    ["Altair","Tarazed"],["Tarazed","Alshain"]
  ]},
  { name: "Scorpius", centroid: { ra: 250.0, dec: -35.0 }, lines: [
    ["Antares","Graffaid"],["Graffaid","Dschubba"],
    ["Dschubba","Fang"],["Fang","Shaula"],["Shaula","Lesath"],
    ["Lesath","Alniyat"],["Alniyat","Antares"]
  ]},
  { name: "Crux", centroid: { ra: 12.5, dec: -60.0 }, lines: [
    ["Acrux","Mimosa"],["Mimosa","Gacrux"],["Gacrux","DeltaCru"],["DeltaCru","Acrux"]
  ]},
  { name: "Centaurus", centroid: { ra: 135.0, dec: -50.0 }, lines: [
    ["Rigil Kentaurus","Hadar"],["Hadar","Agena"],["Agena","Menkent"],
    ["Menkent","Rigil Kentaurus"]
  ]},
  { name: "Taurus", centroid: { ra: 50.0, dec: 15.0 }, lines: [
    ["Aldebaran","Elnath"],["Elnath","Alcyone"],["Alcyone","Electra"],
    ["Electra","Maia"],["Maia","Merope"],["Merope","Taygeta"],
    ["Taygeta","Celaeno"],["Celaeno","Asterope"],["Asterope","Alcyone"]
  ]},
  { name: "Gemini", centroid: { ra: 105.0, dec: 22.0 }, lines: [
    ["Castor","Pollux"],["Pollux","Alhena"],["Alhena","Wasat"],
    ["Wasat","Mebsuta"],["Mebsuta","Tejat"],["Tejat","Mekbuda"],
    ["Mekbuda","Castor"]
  ]},
  { name: "Leo", centroid: { ra: 145.0, dec: 15.0 }, lines: [
    ["Regulus","Algieba"],["Algieba","Zosma"],["Zosma","Denebola"],
    ["Denebola","Zubenelgenubi"],["Zubenelgenubi","Ras Elased"],
    ["Ras Elased","Regulus"]
  ]},
  { name: "Virgo", centroid: { ra: 140.0, dec: 5.0 }, lines: [
    ["Spica","Zubenelgenubi"],["Zubenelgenubi","Porrima"],
    ["Porrima","Vindemiatrix"],["Vindemiatrix","Heze"],
    ["Heze","Spica"]
  ]},
  { name: "Canis Major", centroid: { ra: 105.0, dec: -25.0 }, lines: [
    ["Sirius","Adhara"],["Adhara","Wezen"],["Wezen","Aludra"],
    ["Aludra","Muliphein"],["Muliphein","Sirius"]
  ]},
  { name: "Canis Minor", centroid: { ra: 100.0, dec: 10.0 }, lines: [
    ["Procyon","Gomeisa"]
  ]},
  { name: "Auriga", centroid: { ra: 80.0, dec: 38.0 }, lines: [
    ["Capella","Menkalinan"],["Menkalinan","Hassaleh"],["Hassaleh","Elnath"],
    ["Elnath","Maasalet"],["Maasalet","Capella"]
  ]},
  { name: "Boötes", centroid: { ra: 150.0, dec: 35.0 }, lines: [
    ["Arcturus","Izar"],["Izar","Muphrid"],["Muphrid","Alkaid"],
    ["Alkaid","Segin"],["Segin","Arcturus"]
  ]},
  { name: "Sagittarius", centroid: { ra: 265.0, dec: -30.0 }, lines: [
    ["KausAus","Nunki"],["Nunki","Ascella"],["Ascella","KausMedia"],
    ["KausMedia","KausAustralis"]
  ]},
  { name: "Pegasus", centroid: { ra: 335.0, dec: 20.0 }, lines: [
    ["Markab","Scheat"],["Scheat","Algenib"],["Algenib","Enif"],
    ["Enif","Matar"],["Matar","Markab"]
  ]},
  { name: "Andromeda", centroid: { ra: 35.0, dec: 35.0 }, lines: [
    ["Alpheratz","Mirach"],["Mirach","Almach"],["Almach","DeltaAnd"],
    ["DeltaAnd","Alpheratz"]
  ]},
  { name: "Perseus", centroid: { ra: 80.0, dec: 45.0 }, lines: [
    ["Mirfak","Algol"],["Algol","Menkib"],["Menkib","Atik"],
    ["Atik","Mirfak"]
  ]},
  { name: "Corona Borealis", centroid: { ra: 160.0, dec: 28.0 }, lines: [
    ["Alphecca","Nusakan"],["Nusakan","ThetaCrB"],["ThetaCrB","Alphecca"]
  ]}
];

if (typeof Object.freeze === "function") Object.freeze(window.FI_CONSTELLATIONS);
