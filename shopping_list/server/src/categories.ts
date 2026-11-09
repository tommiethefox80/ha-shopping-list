import type { Category } from './domain.js';
import { normalize } from './matching.js';

/** Default aisles, roughly in the order of a big UK supermarket. Ids are stable. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'fruit-veg', name: 'Fruit & veg', emoji: '🥦' },
  { id: 'bakery', name: 'Bakery', emoji: '🍞' },
  { id: 'meat-fish', name: 'Meat & fish', emoji: '🥩' },
  { id: 'dairy', name: 'Milk, dairy & eggs', emoji: '🥛' },
  { id: 'chilled', name: 'Chilled & deli', emoji: '🧀' },
  { id: 'cupboard', name: 'Food cupboard', emoji: '🥫' },
  { id: 'world', name: 'World foods & sauces', emoji: '🌶️' },
  { id: 'breakfast', name: 'Cereal & breakfast', emoji: '🥣' },
  { id: 'snacks', name: 'Snacks & sweets', emoji: '🍫' },
  { id: 'drinks', name: 'Drinks', emoji: '🧃' },
  { id: 'alcohol', name: 'Beer, wine & spirits', emoji: '🍷' },
  { id: 'frozen', name: 'Frozen', emoji: '🧊' },
  { id: 'baby', name: 'Baby', emoji: '🍼' },
  { id: 'pets', name: 'Pets', emoji: '🐱' },
  { id: 'health', name: 'Health & beauty', emoji: '🧴' },
  { id: 'household', name: 'Household & cleaning', emoji: '🧽' },
  { id: 'other', name: 'Other', emoji: '🛒' },
];

/**
 * Keyword -> category for common UK grocery words. Matched on whole words (and simple plurals)
 * anywhere in the name, longest keyword first, so "frozen peas" -> Frozen and "coconut milk" -> World.
 */
const KEYWORDS: Record<string, string[]> = {
  frozen: ['frozen', 'ice cream', 'fish fingers', 'oven chips', 'chips', 'fries', 'ice lolly', 'lollies', 'ice', 'yorkshire puddings', 'pizza'],
  'fruit-veg': ['apple', 'banana', 'orange', 'satsuma', 'easy peeler', 'clementine', 'grape', 'strawberry', 'raspberry', 'blueberry', 'melon',
    'pear', 'plum', 'peach', 'nectarine', 'kiwi', 'mango', 'pineapple', 'lemon', 'lime', 'avocado', 'tomato', 'cucumber', 'lettuce',
    'salad', 'spinach', 'rocket', 'carrot', 'potato', 'onion', 'spring onion', 'garlic', 'ginger', 'pepper', 'chilli', 'courgette',
    'aubergine', 'broccoli', 'cauliflower', 'cabbage', 'leek', 'celery', 'mushroom', 'sweetcorn', 'corn on the cob', 'peas', 'green beans',
    'beansprouts', 'herbs', 'coriander', 'parsley', 'basil', 'mint', 'stir fry', 'parsnip', 'swede', 'sweet potato', 'beetroot', 'kale', 'fruit', 'veg'],
  bakery: ['bread', 'loaf', 'rolls', 'baps', 'baguette', 'wraps', 'tortilla', 'pitta', 'naan', 'bagel', 'crumpet', 'muffin', 'croissant',
    'brioche', 'teacakes', 'scones', 'pancakes', 'waffles', 'doughnut', 'cake', 'sourdough'],
  'meat-fish': ['chicken', 'beef', 'mince', 'pork', 'lamb', 'bacon', 'sausage', 'gammon', 'steak', 'turkey', 'duck', 'salmon', 'cod', 'haddock',
    'tuna steak', 'prawns', 'fish', 'meatballs', 'burgers', 'chorizo', 'ham', 'salami', 'pepperoni'],
  dairy: ['milk', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'yoghurt', 'yogurt', 'cream', 'creme fraiche', 'eggs', 'egg',
    'fromage frais', 'petits filous', 'custard', 'margarine', 'spread', 'cheese spread', 'oat milk', 'soya milk'],
  chilled: ['houmous', 'hummus', 'coleslaw', 'dip', 'quiche', 'pasta salad', 'fresh pasta', 'ready meal', 'soup', 'pastry', 'tofu',
    'sandwich', 'sushi', 'pate', 'olives'],
  cupboard: ['beans', 'baked beans', 'chopped tomatoes', 'tinned', 'tin', 'pasta', 'spaghetti', 'penne', 'rice', 'noodles', 'flour', 'sugar',
    'oil', 'olive oil', 'vinegar', 'stock', 'stock cubes', 'gravy', 'bouillon', 'salt', 'black pepper', 'spices', 'herbs dried', 'seasoning',
    'tuna', 'sweetcorn tin', 'kidney beans', 'chickpeas', 'lentils', 'soup tin', 'corned beef', 'jam', 'honey', 'peanut butter', 'marmite',
    'nutella', 'tea', 'coffee', 'hot chocolate', 'biscuits for cheese', 'crackers', 'baking powder', 'yeast', 'mustard', 'ketchup', 'mayonnaise',
    'mayo', 'brown sauce', 'salad cream', 'pesto', 'pasta sauce', 'chilli con carne mix', 'recipe mix', 'super rice', 'pot noodle'],
  world: ['curry', 'curry paste', 'soy sauce', 'gochujang', 'coconut milk', 'tikka', 'korma', 'fajita', 'taco', 'salsa', 'poppadoms',
    'mango chutney', 'sweet chilli', 'hoisin', 'oyster sauce', 'sriracha'],
  breakfast: ['cereal', 'granola', 'muesli', 'porridge', 'oats', 'weetabix', 'cornflakes', 'shreddies', 'cheerios', 'coco pops', 'oat so simple'],
  snacks: ['crisps', 'chocolate', 'sweets', 'biscuits', 'cookies', 'popcorn', 'nuts', 'cereal bar', 'protein bar', 'wafers', 'flapjack',
    'kinder', 'freddo', 'haribo', 'pringles'],
  drinks: ['water', 'sparkling water', 'juice', 'orange juice', 'apple juice', 'squash', 'cola', 'coke', 'lemonade', 'fizzy', 'pop', 'smoothie',
    'energy drink', 'tonic'],
  alcohol: ['wine', 'beer', 'lager', 'cider', 'gin', 'vodka', 'whisky', 'rum', 'prosecco', 'champagne', 'ale', 'rose wine'],
  baby: ['nappies', 'nappy', 'baby wipes', 'formula', 'baby food', 'pampers', 'calpol'],
  pets: ['cat food', 'dog food', 'cat litter', 'litter', 'whiskas', 'felix', 'pedigree', 'dreamies', 'pet', 'bird seed'],
  health: ['shampoo', 'conditioner', 'shower gel', 'soap', 'toothpaste', 'toothbrush', 'deodorant', 'razor', 'paracetamol', 'ibuprofen',
    'plasters', 'tampons', 'sanitary', 'suncream', 'moisturiser', 'cotton wool', 'vitamins', 'mouthwash'],
  household: ['toilet roll', 'toilet tissue', 'kitchen roll', 'tissues', 'washing up liquid', 'dishwasher tablets', 'washing powder',
    'washing liquid', 'laundry', 'fabric conditioner', 'bin bags', 'bleach', 'cleaner', 'antibacterial wipes', 'sponges', 'foil', 'cling film',
    'baking paper', 'batteries', 'light bulb', 'candles', 'matches', 'zip bags', 'freezer bags'],
};

const ENTRIES: [string, string][] = Object.entries(KEYWORDS)
  .flatMap(([cat, words]) => words.map((w) => [normalize(w), cat] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

/** Best-guess category for a name, or undefined. */
export function guessCategory(name: string): string | undefined {
  const n = ` ${normalize(name)} `;
  for (const [word, cat] of ENTRIES) {
    if (n.includes(` ${word} `) || n.includes(` ${word}s `) || n.includes(` ${word}es `)) return cat;
  }
  return undefined;
}
