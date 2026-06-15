/**
 * Food name → emoji heuristics.
 */
/**
 * IndexedDB layer: fdcStore, nutrientStore, fdcMeta, recipeStore, recipeIngredients.
 */

/**
 * Match `token` as its own word (delimited by non-alphanumeric), not as a substring of a longer token
 * (e.g. "water" vs "watermelon", "tea" vs "steak", "egg" vs "eggplant").
 * Optional trailing English plural (`apples`, `tomatoes`) via `(?:es|s)?`.
 */
function foodEmojiToken(lowerFoodName, token) {
    if (!token) return false;
    const t = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${t}(?:es|s)?([^a-z0-9]|$)`, 'i').test(lowerFoodName);
}

function getFoodEmoji(name) {
    if (!name) return '';
    const s = name.toLowerCase();
    const hits = [];

    // Prepared dishes & meals (most specific first)
    if (foodEmojiToken(s, 'sushi'))                                   hits.push('🍣');
    if (foodEmojiToken(s, 'ramen'))                                   hits.push('🍜');
    if (foodEmojiToken(s, 'dumpling'))                                hits.push('🥟');
    if (foodEmojiToken(s, 'pizza'))                                   hits.push('🍕');
    if (foodEmojiToken(s, 'burger') || foodEmojiToken(s, 'hamburger')) hits.push('🍔');
    if (s.includes('hot dog') || foodEmojiToken(s, 'hotdog'))         hits.push('🌭');
    if (foodEmojiToken(s, 'taco'))                                    hits.push('🌮');
    if (foodEmojiToken(s, 'burrito'))                                 hits.push('🌯');
    if (foodEmojiToken(s, 'sandwich') || foodEmojiToken(s, 'sub'))           hits.push('🥪');
    if (foodEmojiToken(s, 'pasta') || foodEmojiToken(s, 'spaghetti') || foodEmojiToken(s, 'noodle') || foodEmojiToken(s, 'macaroni')) hits.push('🍝');
    if (foodEmojiToken(s, 'soup') || foodEmojiToken(s, 'stew') || foodEmojiToken(s, 'chili') || foodEmojiToken(s, 'chowder')) hits.push('🍲');
    if (foodEmojiToken(s, 'salad'))                                   hits.push('🥗');
    if (foodEmojiToken(s, 'pancake') || foodEmojiToken(s, 'flapjack'))       hits.push('🥞');
    if (foodEmojiToken(s, 'waffle'))                                  hits.push('🧇');
    if (s.includes('fried rice'))                              hits.push('🍳');
    if (s.includes('stir fry') || s.includes('stir-fry'))      hits.push('🥘');

    // Baked goods & sweets
    if (foodEmojiToken(s, 'croissant'))                               hits.push('🥐');
    if (foodEmojiToken(s, 'bagel'))                                   hits.push('🥯');
    if (foodEmojiToken(s, 'pretzel'))                                 hits.push('🥨');
    if (foodEmojiToken(s, 'cupcake'))                                 hits.push('🧁');
    if (s.includes('birthday cake') || (foodEmojiToken(s, 'cake') && !foodEmojiToken(s, 'pancake') && !foodEmojiToken(s, 'cheesecake'))) hits.push('🎂');
    if (foodEmojiToken(s, 'cheesecake'))                              hits.push('🍰');
    if (foodEmojiToken(s, 'pie') && !foodEmojiToken(s, 'pineapple'))         hits.push('🥧');
    if (foodEmojiToken(s, 'cookie') || foodEmojiToken(s, 'biscuit'))         hits.push('🍪');
    if (foodEmojiToken(s, 'donut') || foodEmojiToken(s, 'doughnut'))         hits.push('🍩');
    if (foodEmojiToken(s, 'chocolate'))                               hits.push('🍫');
    if (foodEmojiToken(s, 'candy') || foodEmojiToken(s, 'gummy'))            hits.push('🍬');
    if (foodEmojiToken(s, 'lollipop'))                                hits.push('🍭');
    if (s.includes('ice cream') || s.includes('ice-cream') || foodEmojiToken(s, 'gelato')) hits.push('🍦');
    if (foodEmojiToken(s, 'popcorn'))                                 hits.push('🍿');

    // Proteins (cooked/processed before raw)
    if (foodEmojiToken(s, 'bacon'))                                   hits.push('🥓');
    if (foodEmojiToken(s, 'sausage') || foodEmojiToken(s, 'pepperoni') || foodEmojiToken(s, 'salami')) hits.push('🌭');
    if (s.includes('fried chicken'))                           hits.push('🍗');
    if (foodEmojiToken(s, 'chicken'))                                 hits.push('🍗');
    if (foodEmojiToken(s, 'turkey'))                                  hits.push('🦃');
    if (foodEmojiToken(s, 'beef') || foodEmojiToken(s, 'steak') || foodEmojiToken(s, 'brisket') || s.includes('ground beef')) hits.push('🥩');
    if (foodEmojiToken(s, 'pork') || foodEmojiToken(s, 'ham') || foodEmojiToken(s, 'prosciutto')) hits.push('🥓');
    if (foodEmojiToken(s, 'lamb') || foodEmojiToken(s, 'mutton'))            hits.push('🥩');
    if (foodEmojiToken(s, 'shrimp') || foodEmojiToken(s, 'prawn'))           hits.push('🍤');
    if (foodEmojiToken(s, 'lobster') || foodEmojiToken(s, 'crab'))           hits.push('🦞');
    if (foodEmojiToken(s, 'salmon'))                                  hits.push('🐟');
    if (foodEmojiToken(s, 'tuna'))                                    hits.push('🐟');
    if (foodEmojiToken(s, 'fish'))         hits.push('🐟');
    if (foodEmojiToken(s, 'egg'))                                     hits.push('🥚');

    // Dairy
    if (foodEmojiToken(s, 'cheese'))                                  hits.push('🧀');
    if (foodEmojiToken(s, 'butter'))                                  hits.push('🧈');
    if (foodEmojiToken(s, 'milk') || foodEmojiToken(s, 'yogurt') || foodEmojiToken(s, 'kefir')) hits.push('🥛');

    // Compound fruits (before simple to avoid substring false-positives)
    if (foodEmojiToken(s, 'pineapple'))                               hits.push('🍍');
    if (s.includes('strawberr'))                               hits.push('🍓');
    if (s.includes('blueberr'))                                hits.push('🫐');
    if (foodEmojiToken(s, 'watermelon'))                              hits.push('🍉');
    if (foodEmojiToken(s, 'grapefruit'))                              hits.push('🍊');
    if (s.includes('blackberr') || s.includes('raspberr'))     hits.push('🍇');

    // Simple fruits
    if (foodEmojiToken(s, 'apple'))       hits.push('🍎');
    if (foodEmojiToken(s, 'banana'))                                  hits.push('🍌');
    if (s.includes('blood orange'))                            hits.push('🍊');
    if (foodEmojiToken(s, 'orange') && !foodEmojiToken(s, 'grapefruit') && !s.includes('blood orange')) hits.push('🍊');
    if (foodEmojiToken(s, 'grape'))      hits.push('🍇');
    if (foodEmojiToken(s, 'peach'))                                   hits.push('🍑');
    if (foodEmojiToken(s, 'pear'))                                    hits.push('🍐');
    if (s.includes('cherr'))                                   hits.push('🍒');
    if (foodEmojiToken(s, 'mango'))                                   hits.push('🥭');
    if (foodEmojiToken(s, 'lemon') || foodEmojiToken(s, 'lime'))             hits.push('🍋');
    if (foodEmojiToken(s, 'kiwi'))                                    hits.push('🥝');
    if (foodEmojiToken(s, 'coconut'))                                 hits.push('🥥');
    if (foodEmojiToken(s, 'pomegranate'))                             hits.push('🍎');
    if (foodEmojiToken(s, 'melon'))      hits.push('🍈');
    if (foodEmojiToken(s, 'plum') || foodEmojiToken(s, 'prune'))             hits.push('🍑');

    // Vegetables (compound before simple)
    if (s.includes('sweet potato') || foodEmojiToken(s, 'yam'))       hits.push('🍠');
    if (s.includes('bell pepper') || s.includes('sweet pepper')) hits.push('🫑');
    if (s.includes('hot pepper') || s.includes('chili pepper') || s.includes('jalape')) hits.push('🌶️');
    if (foodEmojiToken(s, 'broccoli'))                                hits.push('🥦');
    if (foodEmojiToken(s, 'carrot'))                                  hits.push('🥕');
    if (foodEmojiToken(s, 'corn') || foodEmojiToken(s, 'maize'))             hits.push('🌽');
    if (foodEmojiToken(s, 'potato') && !s.includes('sweet potato'))   hits.push('🥔');
    if (foodEmojiToken(s, 'tomato'))                                  hits.push('🍅');
    if (foodEmojiToken(s, 'mushroom'))                                hits.push('🍄');
    if (foodEmojiToken(s, 'pepper') && !s.includes('bell pepper') && !s.includes('hot pepper') && !s.includes('chili pepper')) hits.push('🌶️');
    if (foodEmojiToken(s, 'lettuce') || foodEmojiToken(s, 'spinach') || foodEmojiToken(s, 'kale') || foodEmojiToken(s, 'arugula')) hits.push('🥬');
    if (foodEmojiToken(s, 'cucumber'))                                hits.push('🥒');
    if (foodEmojiToken(s, 'onion') || foodEmojiToken(s, 'scallion') || foodEmojiToken(s, 'leek')) hits.push('🧅');
    if (foodEmojiToken(s, 'garlic'))                                  hits.push('🧄');
    if (foodEmojiToken(s, 'eggplant') || foodEmojiToken(s, 'aubergine'))     hits.push('🍆');
    if (foodEmojiToken(s, 'zucchini') || foodEmojiToken(s, 'courgette'))     hits.push('🥒');
    if (foodEmojiToken(s, 'pumpkin') || foodEmojiToken(s, 'squash'))         hits.push('🎃');
    if (foodEmojiToken(s, 'cauliflower'))                             hits.push('🥦');
    if (foodEmojiToken(s, 'asparagus'))                               hits.push('🌿');
    if (foodEmojiToken(s, 'celery'))                                  hits.push('🥬');
    if (foodEmojiToken(s, 'beet') || foodEmojiToken(s, 'beetroot'))          hits.push('🫀');
    if (foodEmojiToken(s, 'avocado'))                                 hits.push('🥑');

    // Grains & breads
    if (foodEmojiToken(s, 'bread') || foodEmojiToken(s, 'loaf') || foodEmojiToken(s, 'baguette')) hits.push('🍞');
    if (foodEmojiToken(s, 'rice') && !s.includes('fried rice'))       hits.push('🍚');
    if (s.includes('oat') || foodEmojiToken(s, 'granola') || foodEmojiToken(s, 'muesli')) hits.push('🥣');
    if (foodEmojiToken(s, 'cereal'))                                  hits.push('🥣');
    if (foodEmojiToken(s, 'tortilla') || foodEmojiToken(s, 'wrap'))          hits.push('🫓');

    // Legumes & nuts
    if (s.includes('peanut butter'))                           hits.push('🥜');
    if (foodEmojiToken(s, 'almond') || foodEmojiToken(s, 'walnut') || foodEmojiToken(s, 'cashew') || foodEmojiToken(s, 'pistachio') || foodEmojiToken(s, 'pecan')) hits.push('🥜');
    if (foodEmojiToken(s, 'peanut') && !s.includes('peanut butter'))  hits.push('🥜');
    if (foodEmojiToken(s, 'pea') || foodEmojiToken(s, 'edamame') || foodEmojiToken(s, 'soy') || foodEmojiToken(s, 'soybean') || foodEmojiToken(s, 'soya')) hits.push('🫛');
    if (foodEmojiToken(s, 'bean') || foodEmojiToken(s, 'lentil') || foodEmojiToken(s, 'chickpea') || foodEmojiToken(s, 'tofu')) hits.push('🫘');

    // Condiments & misc
    if (foodEmojiToken(s, 'honey'))                                   hits.push('🍯');
    if (foodEmojiToken(s, 'oil'))                                     hits.push('🟡');
    if (foodEmojiToken(s, 'flour'))                                   hits.push('🌾');
    if (foodEmojiToken(s, 'salt') || foodEmojiToken(s, 'sugar'))             hits.push('🧂');

    // Drinks
    if (foodEmojiToken(s, 'coffee') || foodEmojiToken(s, 'espresso') || foodEmojiToken(s, 'latte') || foodEmojiToken(s, 'cappuccino')) hits.push('☕');
    if (foodEmojiToken(s, 'tea'))             hits.push('🍵');
    if (foodEmojiToken(s, 'juice'))                                   hits.push('🧃');
    if (foodEmojiToken(s, 'smoothie'))                                hits.push('🥤');
    if (foodEmojiToken(s, 'beer') || foodEmojiToken(s, 'ale') || foodEmojiToken(s, 'lager')) hits.push('🍺');
    if (foodEmojiToken(s, 'wine'))                                    hits.push('🍷');
    if (foodEmojiToken(s, 'water'))                                   hits.push('💧');

    return hits.slice(0, 2).join('');
}
