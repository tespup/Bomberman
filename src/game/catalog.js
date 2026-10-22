export const TILE_SIZE = 1;
export const ARENA_COLS = 15;
export const ARENA_ROWS = 13;
export const TOTAL_LEVELS = 50;

export const TILE = Object.freeze({
  FLOOR: 0,
  WALL: 1,
  BLOCK: 2,
  PORTAL: 3
});

export const DIRECTIONS = Object.freeze([
  { x: 1, y: 0, key: "right" },
  { x: -1, y: 0, key: "left" },
  { x: 0, y: 1, key: "down" },
  { x: 0, y: -1, key: "up" }
]);

export const THEMES = [
  {
    id: "emerald",
    style: "ruins",
    hue: 154,
    wallHue: 160,
    accentHue: 43,
    floorS: 27,
    floorL: 17,
    wallS: 17,
    wallL: 27,
    bgHue: 165,
    particle: "firefly",
    soft: "crate",
    fog: 0.24,
    names: ["Изумрудные руины", "Забытые сады", "Лозовая цитадель", "Храм Шёпота", "Сердце чащи"],
    descriptions: [
      "Древние камни поросли светящимся мхом. Слизни здесь особенно медлительны.",
      "Сад, который никто не покидал. Тропы переплетаются, а тишина звенит.",
      "Крепость укрыта живыми лозами. Под листвой что-то шевелится.",
      "Камни помнят голоса жрецов. Не все голоса замолчали.",
      "Лес сжался вокруг алтаря. Искры салютуют каждому шагу."
    ]
  },
  {
    id: "volcanic",
    style: "magma",
    hue: 9,
    wallHue: 348,
    accentHue: 24,
    floorS: 35,
    floorL: 13,
    wallS: 24,
    wallL: 22,
    bgHue: 8,
    particle: "ember",
    soft: "obsidian",
    fog: 0.36,
    names: ["Магмовые кузни", "Пепельный престол", "Раскалённые недра", "Кратер Бездны", "Огненный разлом"],
    descriptions: [
      "Кузни не остыли. Каждый взрыв здесь звучит громче.",
      "Трон из пепла ждёт нового правителя. Огнехвосты уже близко.",
      "Подземелье дышит жаром. Осторожно: трещины светятся.",
      "Бездна смотрит снизу. Не задерживайтесь у края.",
      "Разлом расколол арену. Пламя не спит."
    ]
  },
  {
    id: "frozen",
    style: "glacier",
    hue: 196,
    wallHue: 208,
    accentHue: 183,
    floorS: 31,
    floorL: 23,
    wallS: 29,
    wallL: 34,
    bgHue: 216,
    particle: "snow",
    soft: "crystal",
    fog: 0.22,
    names: ["Ледяные чертоги", "Полярная цитадель", "Синий панцирь", "Замок Инея", "Стеклянная вьюга"],
    descriptions: [
      "Чертоги вырезаны из цельного льда. Эхо шагов бежит впереди.",
      "Цитадель хранит холод, который старше времени.",
      "Стены покрыты панцирем льда. Бомбы оставляют трещины.",
      "Замок скован инеем. Правитель не выходит уже сто зим.",
      "Вьюга стучится в стеклянные залы. Не открывайте."
    ]
  },
  {
    id: "cyber",
    style: "circuit",
    hue: 272,
    wallHue: 256,
    accentHue: 172,
    floorS: 31,
    floorL: 14,
    wallS: 34,
    wallL: 23,
    bgHue: 260,
    particle: "data",
    soft: "server",
    fog: 0.2,
    names: ["Неоновый контур", "Серверный некрополь", "Синтетический сад", "Глитч-квартал", "Ядро Оверрайда"],
    descriptions: [
      "Охранные контуры перерисовывают арену каждую секунду.",
      "Мёртвые серверы всё ещё шепчут команды.",
      "Синтетические цветы растут между шинами данных.",
      "Квартал мерцает на грани реальности. Не доверяйте теням.",
      "Ядро перехвачено. Все системы настроены против вас."
    ]
  },
  {
    id: "candy",
    style: "candy",
    hue: 327,
    wallHue: 302,
    accentHue: 48,
    floorS: 37,
    floorL: 27,
    wallS: 41,
    wallL: 27,
    bgHue: 322,
    particle: "sprinkle",
    soft: "gum",
    fog: 0.15,
    names: ["Карамельный дворец", "Мятный лабиринт", "Конфетный бум", "Сахарная осада", "Джемовый кратер"],
    descriptions: [
      "Дворец пахнет карамелью. Полы всё ещё липкие.",
      "Мятный лабиринт освежает и путает следы.",
      "Каждый взрыв здесь звучит как хлопок конфеты.",
      "Осада началась из-за последнего леденца.",
      "Кратер полон джема. Враги уже липнут к стенам."
    ]
  },
  {
    id: "cosmic",
    style: "void",
    hue: 248,
    wallHue: 240,
    accentHue: 285,
    floorS: 33,
    floorL: 12,
    wallS: 30,
    wallL: 20,
    bgHue: 247,
    particle: "star",
    soft: "voidstone",
    fog: 0.34,
    names: ["Космическая арена", "Пояс падающих звёзд", "Лунный трибунал", "Астральный разлом", "Тёмная орбита"],
    descriptions: [
      "Обломки миров собраны в одну арену. Гравитация здесь условна.",
      "Звёзды падают медленно, будто позируют.",
      "Трибунал вынес приговор. Приговор — взрыв.",
      "Разлом дышит фиолетовым светом.",
      "Орбита уводит в темноту. Держитесь центра."
    ]
  },
  {
    id: "ocean",
    style: "abyss",
    hue: 181,
    wallHue: 191,
    accentHue: 14,
    floorS: 32,
    floorL: 15,
    wallS: 27,
    wallL: 24,
    bgHue: 202,
    particle: "bubble",
    soft: "coral",
    fog: 0.4,
    names: ["Затонувший город", "Коралловый трон", "Синяя бездна", "Грот Приливов", "Риф забытых"],
    descriptions: [
      "Город ушёл под воду вместе со своими сокровищами.",
      "Трон оброс кораллом, но всё ещё требует поклонения.",
      "Бездна давит на стены. Свет едва пробивается.",
      "Приливы переставляют коридоры, пока вы отвлекаетесь.",
      "Риф хранит забытые имена. Бомбы их не разбудят."
    ]
  },
  {
    id: "desert",
    style: "sand",
    hue: 36,
    wallHue: 29,
    accentHue: 178,
    floorS: 30,
    floorL: 22,
    wallS: 26,
    wallL: 32,
    bgHue: 32,
    particle: "sand",
    soft: "sandstone",
    fog: 0.18,
    names: ["Песочный лабиринт", "Гробница Сфинкса", "Барханы Хаоса", "Оазис-обманка", "Медный караван"],
    descriptions: [
      "Лабиринт перестраивается под ветром.",
      "Сфинкс загадал загадку. Ответ — бомба.",
      "Барханы скрывают провалы и старые ловушки.",
      "Оазис находится там, где его нет.",
      "Караван не дошёл. Остались только медные стражи."
    ]
  },
  {
    id: "toxic",
    style: "swamp",
    hue: 86,
    wallHue: 104,
    accentHue: 72,
    floorS: 35,
    floorL: 15,
    wallS: 27,
    wallL: 22,
    bgHue: 95,
    particle: "spore",
    soft: "barrel",
    fog: 0.37,
    names: ["Токсичная топь", "Болото Пыльцы", "Эксперимент 09", "Смоляная яма", "Кислотный шёпот"],
    descriptions: [
      "Топь растворяет всё, кроме проблем.",
      "Пыльца светится и вызывает странные видения.",
      "Лаборатория закрыта. Образцы — нет.",
      "Яма дышит вязким дымом.",
      "Шёпот идёт из-под воды. Не отвечайте."
    ]
  },
  {
    id: "royal",
    style: "marble",
    hue: 344,
    wallHue: 328,
    accentHue: 42,
    floorS: 20,
    floorL: 17,
    wallS: 14,
    wallL: 30,
    bgHue: 334,
    particle: "gold",
    soft: "urn",
    fog: 0.2,
    names: ["Багровый тронный зал", "Мраморный суд", "Золотая корона", "Зал последнего бала", "Императорский склеп"],
    descriptions: [
      "Тронный зал встречает гостей взрывами.",
      "Судьи из мрамора не терпят опозданий.",
      "Корона выставлена. Желающих слишком много.",
      "Бал закончился, но музыканты всё ещё играют.",
      "Император спит. Беспокоить его — плохая идея."
    ]
  }
];

export const ENEMIES = {
  crawler: {
    key: "crawler",
    name: "Слизень",
    short: "Медленный хаотик",
    desc: "Просто ползёт по арене в случайную сторону. Первый противник, который учит не стоять на месте.",
    color: "#79efa4",
    glyph: "●",
    unlock: 1,
    speed: 0.78,
    health: 1,
    bounty: 80,
    threat: 1,
    role: "random"
  },
  runner: {
    key: "runner",
    name: "Спринтер",
    short: "Быстрый хаотик",
    desc: "Носится по арене и меняет направление в самый неудобный момент. Быстрее обычного слизня почти втрое.",
    color: "#ffd166",
    glyph: "»",
    unlock: 2,
    speed: 1.75,
    health: 1,
    bounty: 110,
    threat: 2,
    role: "random"
  },
  hunter: {
    key: "hunter",
    name: "Охотник",
    short: "Медленный преследователь",
    desc: "Знает кратчайший путь к игроку и не сворачивает. Его касание смертельно, но он медленно поворачивает.",
    color: "#ff7a66",
    glyph: "◉",
    unlock: 3,
    speed: 0.92,
    health: 1,
    bounty: 140,
    threat: 2,
    role: "chase"
  },
  golem: {
    key: "golem",
    name: "Броненосец",
    short: "Три взрыва",
    desc: "Тяжёлый панцирь выдерживает два взрыва. Третий ломает броню. Пока пластины целы, он светится красным.",
    color: "#c7a27b",
    glyph: "▣",
    unlock: 5,
    speed: 0.68,
    health: 3,
    bounty: 220,
    threat: 3,
    role: "chase"
  },
  hopper: {
    key: "hopper",
    name: "Прыгун",
    short: "Прыгает по клеткам",
    desc: "Не ходит, а прыгает. В полёте перелетает трещины и иногда неожиданно приземляется рядом с игроком.",
    color: "#b790ff",
    glyph: "⌁",
    unlock: 7,
    speed: 0.9,
    health: 1,
    bounty: 150,
    threat: 2,
    role: "hopper"
  },
  firetail: {
    key: "firetail",
    name: "Огнехвост",
    short: "Шлейф из трёх огней",
    desc: "Оставляет за собой три горящих кубика. Огонь живёт недолго, но касание им так же опасно, как взрыв.",
    color: "#ff9457",
    glyph: "≈",
    unlock: 9,
    speed: 0.82,
    health: 1,
    bounty: 170,
    threat: 3,
    role: "trail"
  },
  coward: {
    key: "coward",
    name: "Трус",
    short: "Убегает от игрока",
    desc: "Держится подальше и выбирает коридоры, ведущие от игрока. Загнанный в угол, начинает паниковать.",
    color: "#9fd2ff",
    glyph: "?",
    unlock: 11,
    speed: 0.86,
    health: 1,
    bounty: 130,
    threat: 1,
    role: "flee"
  },
  phantom: {
    key: "phantom",
    name: "Фантом",
    short: "Невидимость 3 секунды",
    desc: "Становится почти невидимым на три секунды. Его выдаёт только мерцание и тихий звон.",
    color: "#d6c7ff",
    glyph: "◌",
    unlock: 13,
    speed: 0.8,
    health: 1,
    bounty: 180,
    threat: 3,
    role: "invisible"
  },
  trickster: {
    key: "trickster",
    name: "Искуситель",
    short: "Умный тактик",
    desc: "Виляет, отступает, выжидает у поворота и атакует рывком. Самый опасный охотник кампании.",
    color: "#ff67aa",
    glyph: "♠",
    unlock: 15,
    speed: 1.02,
    health: 1,
    bounty: 250,
    threat: 4,
    role: "trickster"
  },
  splitter: {
    key: "splitter",
    name: "Деляга",
    short: "Делится на двоих",
    desc: "После взрыва распадается на двух мини-слизней. Каждый из них считает себя полноценным врагом.",
    color: "#76ffcf",
    glyph: "∞",
    unlock: 17,
    speed: 0.74,
    health: 1,
    bounty: 190,
    threat: 2,
    role: "split"
  },
  burrower: {
    key: "burrower",
    name: "Крот",
    short: "Тоннели и засады",
    desc: "Уходит под землю и движется сквозь блоки. Пока он под землёй, взрывы ему не вредят. Следите за земляным следом.",
    color: "#e9a267",
    glyph: "▼",
    unlock: 20,
    speed: 0.85,
    health: 1,
    bounty: 230,
    threat: 3,
    role: "burrow"
  },
  turret: {
    key: "turret",
    name: "Страж",
    short: "Стреляет во все стороны",
    desc: "Не двигается, но каждые несколько секунд выпускает энергетические сгустки по четырём направлениям. Требует бомбы.",
    color: "#ff8fa8",
    glyph: "✦",
    unlock: 24,
    speed: 0,
    health: 2,
    bounty: 260,
    threat: 3,
    role: "turret"
  }
};

export const ENEMY_LIST = Object.values(ENEMIES);

export const POWERUPS = {
  range: {
    key: "range",
    name: "Мега-фитиль",
    short: "Взрыв +1 клетка",
    desc: "Увеличивает радиус взрыва ваших бомб на одну клетку во все стороны.",
    icon: "↔",
    color: "#ffb454",
    rarity: "common",
    max: 8
  },
  detonator: {
    key: "detonator",
    name: "Детонатор",
    short: "Взрывай по команде",
    desc: "Бомбы больше не ждут фитиль. Нажмите кнопку детонатора, чтобы взорвать все свои бомбы сразу.",
    icon: "ϟ",
    color: "#8fb6ff",
    rarity: "rare",
    max: 1
  },
  bomb: {
    key: "bomb",
    name: "Дополнительная бомба",
    short: "+1 к лимиту",
    desc: "Позволяет держать на арене на одну бомбу больше. Складывается с другими такими бонусами.",
    icon: "+",
    color: "#67ffc8",
    rarity: "common",
    max: 6
  },
  wallpass: {
    key: "wallpass",
    name: "Фазовый пояс",
    short: "Сквозь хрупкие блоки",
    desc: "Вы проходите сквозь разрушаемые блоки, будто их нет. Монолитные стены по-прежнему непроходимы.",
    icon: "◌",
    color: "#b9a4ff",
    rarity: "epic",
    max: 1
  },
  throw: {
    key: "throw",
    name: "Бомбомёт",
    short: "Бросок через стены",
    desc: "Подойдите к своей бомбе и нажмите «Действие», чтобы перебросить её через преграды на три клетки вперёд.",
    icon: "➤",
    color: "#ffd66e",
    rarity: "rare",
    max: 1
  },
  proximity: {
    key: "proximity",
    name: "Сенсорный взрыватель",
    short: "Взрыв при приближении",
    desc: "Бомба взрывается сама, когда враг или игрок подходит слишком близко. Отлично работает в узких коридорах.",
    icon: "◎",
    color: "#ff8a8a",
    rarity: "rare",
    max: 1
  },
  kick: {
    key: "kick",
    name: "Пинок",
    short: "Толкай бомбы",
    desc: "Идите в сторону бомбы — и она поедет по коридору, пока не упрётся в преграду или другую бомбу.",
    icon: "↦",
    color: "#7fe4ff",
    rarity: "rare",
    max: 1
  },
  immunity: {
    key: "immunity",
    name: "Огнеупорный костюм",
    short: "Свои бомбы не ранят",
    desc: "Взрывы ваших собственных бомб больше не причиняют вам вреда. Чужие бомбы всё ещё опасны.",
    icon: "✹",
    color: "#ffb18a",
    rarity: "epic",
    max: 1
  },
  armor: {
    key: "armor",
    name: "Доспехи",
    short: "Выдержать одно касание",
    desc: "Металлические пластины визуально надеваются поверх костюма и поглощают одно касание врага.",
    icon: "♜",
    color: "#d4e7ff",
    rarity: "uncommon",
    max: 3
  },
  speed: {
    key: "speed",
    name: "Турбо-боты",
    short: "Скорость +18%",
    desc: "Пружины в ботинках ускоряют бег. Складываются, но имеют предел, чтобы не проскакивать повороты.",
    icon: "»",
    color: "#61f8cf",
    rarity: "common",
    max: 4
  },
  magnet: {
    key: "magnet",
    name: "Магнит",
    short: "Притягивает бонусы",
    desc: "Бонусы в радиусе трёх клеток медленно летят к вам. Не работает сквозь монолитные стены.",
    icon: "U",
    color: "#ff82cf",
    rarity: "epic",
    max: 1
  },
  phoenix: {
    key: "phoenix",
    name: "Перо Феникса",
    short: "+1 сердце",
    desc: "Добавляет одно дополнительное сердце и восстанавливает здоровье. Тёплое перо пахнет побегом.",
    icon: "✦",
    color: "#ffcf6b",
    rarity: "legendary",
    max: 2
  }
};

export const POWERUP_LIST = Object.values(POWERUPS);

export const MOUNTS = {
  roo: {
    key: "roo",
    name: "Кенгуру Ро",
    short: "Скорость и один щит",
    desc: "Быстрый прыгучий зверёк. Ускоряет игрока на 22% и принимает на себя первый удар.",
    color: "#ffb56b",
    accent: "#8d512e",
    ability: "speed",
    abilityName: "Прыжок",
    abilityIcon: "⇧"
  },
  drake: {
    key: "drake",
    name: "Дракончик Пых",
    short: "Огненное дыхание",
    desc: "Маленький дракон. Нажмите «Действие», чтобы выдохнуть поток огня вперёд и сжечь блок или врага.",
    color: "#ff7d8f",
    accent: "#913e55",
    ability: "breath",
    abilityName: "Пламя",
    abilityIcon: "♨"
  },
  gloom: {
    key: "gloom",
    name: "Светляк Люм",
    short: "+1 к радиусу и щит",
    desc: "Светящийся жук усиливает взрыв на одну клетку и принимает первый удар. Освещает тёмные уровни.",
    color: "#8dffdb",
    accent: "#2d846d",
    ability: "aura",
    abilityName: "Свет",
    abilityIcon: "☼"
  }
};

export const MOUNT_LIST = Object.values(MOUNTS);

export const POWERUP_WEIGHTS = {
  range: 12,
  bomb: 11,
  speed: 9,
  armor: 8,
  kick: 7,
  detonator: 6,
  throw: 6,
  proximity: 6,
  wallpass: 5,
  immunity: 5,
  magnet: 4,
  phoenix: 3
};

export const POWERUP_UNLOCK_LEVEL = {
  range: 1,
  bomb: 1,
  speed: 1,
  armor: 3,
  kick: 5,
  detonator: 7,
  throw: 9,
  proximity: 11,
  wallpass: 13,
  immunity: 16,
  magnet: 19,
  phoenix: 22
};

export const ENEMY_INTRO_LEVEL = Object.fromEntries(ENEMY_LIST.map((enemy) => [enemy.key, enemy.unlock]));

export const SPAWN_POINTS = [
  { col: 1, row: 1 },
  { col: ARENA_COLS - 2, row: ARENA_ROWS - 2 },
  { col: 1, row: ARENA_ROWS - 2 },
  { col: ARENA_COLS - 2, row: 1 }
];

export const STAR_THRESHOLDS = {
  par: (level) => 42 + level * 1.5,
  great: (level) => 66 + level * 2.0
};

export const DEFAULT_PLAYER_STATS = {
  speed: 3.55,
  range: 1,
  maxBombs: 1,
  hearts: 3,
  maxHearts: 3
};
