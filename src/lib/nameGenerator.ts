// Генератор случайных забавных имён для игроков

const adjectivesMasculine = [
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

const adjectivesFeminine = [
  'Плюшевая',
  'Весёлая',
  'Сонная',
  'Милая',
  'Хитрая',
  'Танцующая',
  'Летающая',
  'Радужная',
  'Блестящая',
  'Пушистая',
  'Космическая',
  'Загадочная',
  'Быстрая',
  'Умная',
  'Добрая',
];

const nounsMasculine = [
  'Ёж',
  'Гугенот',
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
  'Филин',
];

const nounsFeminine = [
  'Панда',
];

const bannedNames = [
  'Весёлый Гугенот',
  'Хитрый Гугенот',
  'Загадочный Гугенот',
  // Add more if needed
];

export function generateRandomName(): string {
  let name: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    const isMasculine = Math.random() < 0.5;
    const adjectives = isMasculine ? adjectivesMasculine : adjectivesFeminine;
    const nouns = isMasculine ? nounsMasculine : nounsFeminine;

    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    name = `${adjective} ${noun}`;
    attempts++;
  } while (bannedNames.includes(name) && attempts < maxAttempts);

  return name;
}
