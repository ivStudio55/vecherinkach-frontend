/** Fallback word list in case the draw_words table is empty */
export const FALLBACK_WORDS: string[] = [
  'кот', 'собака', 'рыба', 'слон', 'заяц', 'медведь', 'лошадь', 'птица', 'змея', 'жираф',
  'черепаха', 'бабочка', 'корова', 'обезьяна', 'пингвин', 'крокодил', 'дельфин', 'паук', 'мышь',
  'лягушка', 'акула', 'краб', 'улитка', 'осьминог', 'кит', 'пчела', 'лев', 'волк', 'олень', 'ёж',
  'пицца', 'торт', 'мороженое', 'банан', 'яблоко', 'арбуз', 'сыр', 'бургер', 'попкорн', 'пончик',
  'конфета', 'виноград', 'морковь', 'ананас', 'вишня',
  'дом', 'машина', 'велосипед', 'зонт', 'ключ', 'часы', 'телефон', 'лампа', 'стул', 'очки',
  'книга', 'гитара', 'ножницы', 'самолёт', 'ракета', 'корабль', 'поезд', 'свеча', 'робот', 'меч',
  'дерево', 'цветок', 'солнце', 'луна', 'звезда', 'облако', 'гора', 'радуга', 'снежинка', 'молния',
  'костёр', 'вулкан', 'остров', 'водопад', 'кактус',
  'пират', 'космонавт', 'клоун', 'принцесса', 'дракон', 'привидение', 'снеговик', 'ниндзя',
  'русалка', 'ведьма',
  'мяч', 'корона', 'сердце', 'якорь', 'флаг', 'воздушный шар', 'подарок', 'замок', 'маяк',
  'колесо', 'череп', 'алмаз', 'щит', 'барабан', 'шляпа',
];

/** English fallback words */
export const FALLBACK_WORDS_EN: string[] = [
  'cat', 'dog', 'fish', 'elephant', 'rabbit', 'bear', 'horse', 'bird', 'snake', 'giraffe',
  'turtle', 'butterfly', 'cow', 'monkey', 'penguin', 'crocodile', 'dolphin', 'spider', 'mouse',
  'frog', 'shark', 'crab', 'snail', 'octopus', 'whale', 'bee', 'lion', 'wolf', 'deer', 'hedgehog',
  'pizza', 'cake', 'ice cream', 'banana', 'apple', 'watermelon', 'cheese', 'burger', 'popcorn', 'donut',
  'candy', 'grapes', 'carrot', 'pineapple', 'cherry',
  'house', 'car', 'bicycle', 'umbrella', 'key', 'clock', 'phone', 'lamp', 'chair', 'glasses',
  'book', 'guitar', 'scissors', 'airplane', 'rocket', 'ship', 'train', 'candle', 'robot', 'sword',
  'tree', 'flower', 'sun', 'moon', 'star', 'cloud', 'mountain', 'rainbow', 'snowflake', 'lightning',
  'campfire', 'volcano', 'island', 'waterfall', 'cactus',
  'pirate', 'astronaut', 'clown', 'princess', 'dragon', 'ghost', 'snowman', 'ninja',
  'mermaid', 'witch',
  'ball', 'crown', 'heart', 'anchor', 'flag', 'balloon', 'gift', 'castle', 'lighthouse',
  'wheel', 'skull', 'diamond', 'shield', 'drum', 'hat',
];

/** Pick `count` unique random words from the list */
export function pickRandomWords(list: string[], count: number): string[] {
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
