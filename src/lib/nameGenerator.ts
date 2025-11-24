// Генератор случайных забавных имён для игроков

const adjectives = [
  'Плюшевый',
  'Весёлый',
  'Сонный',
  'Милый',
  'Хитрый',
  'Танцующий',
  'Летающий',
  'Радужный',
  'Блестящий',
  'Пушистый',
  'Космический',
  'Загадочный',
  'Быстрый',
  'Умный',
  'Добрый',
];

const nouns = [
  'Ёж',
  'Панда',
  'Лама',
  'Единорог',
  'Кот',
  'Пёс',
  'Хомяк',
  'Енот',
  'Дракон',
  'Пингвин',
  'Лис',
  'Медведь',
  'Заяц',
  'Волк',
  'Сова',
];

export function generateRandomName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective} ${noun}`;
}
