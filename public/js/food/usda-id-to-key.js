(function (root, factory) {
  const map = Object.freeze(factory());
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = map;
  }
  if (root) {
    root.USDA_ID_TO_KEY = map;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : this,
  function () {
    return {
      1008: 'calories',
      1003: 'protein',
      1004: 'fat',
      1005: 'carbohydrate',
      1079: 'fiber',
      2000: 'sugars',
      1258: 'saturated_fat',
      1257: 'trans_fat',
      1292: 'monounsaturated_fat',
      1293: 'polyunsaturated_fat',
      1253: 'cholesterol',
      1093: 'sodium',
      1087: 'calcium',
      1089: 'iron',
      1090: 'magnesium',
      1091: 'phosphorus',
      1092: 'potassium',
      1095: 'zinc',
      1098: 'copper',
      1103: 'selenium',
      1162: 'vitamin_c',
      1165: 'thiamin',
      1166: 'riboflavin',
      1167: 'niacin',
      1175: 'vitamin_b6',
      1177: 'folate',
      1178: 'vitamin_b12',
      1106: 'vitamin_a',
      1109: 'vitamin_e',
      1114: 'vitamin_d',
      1185: 'vitamin_k',
      1210: 'tryptophan',
      1211: 'threonine',
      1212: 'isoleucine',
      1213: 'leucine',
      1214: 'lysine',
      1215: 'methionine',
      1217: 'phenylalanine',
      1219: 'valine',
      1221: 'histidine',
      1220: 'arginine',
      1222: 'alanine',
      1223: 'aspartic_acid',
      1224: 'glutamic_acid',
      1225: 'glycine',
      1226: 'proline',
      1227: 'serine',
    };
  }
);
