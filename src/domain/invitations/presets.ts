/**
 * Ready invitation texts for the wizard step «Шақыру мәтіні» (brief Ф3 §2, decision Д4/12).
 * Source: content/NOTES_KK.md §3 (kk № 1 and № 3 for weddings / қыз ұзату, one text for the other kinds) and
 * content/NOTES_RU.md §5 (ru № 1 and № 2, one for the other kinds). These are data of the event (the owner edits
 * them), not UI strings.
 *
 * `[…]` marks where a name goes; the example name stays inside, and **the owner adds the ending himself** — the
 * product never builds case endings (plan 6.1). The wizard highlights the marked parts.
 */
export type PresetKind = "uilenu_toi" | "kyz_uzatu" | "sundet" | "besik" | "merey" | "other";
export type Preset = { id: string; text: string };

const KK: Record<PresetKind, Preset[]> = {
  uilenu_toi: [
    {
      id: "kk-uilenu-1",
      text: "Құрметті ағайын, құда-жекжат, дос-жаран! Сіздерді ұлымыз [Айбек] пен келініміз [Дана]ның үйлену тойына арналған салтанатты ақ дастарханымыздың қадірлі қонағы болуға шақырамыз.",
    },
    {
      id: "kk-uilenu-3",
      text: "Ұлымыз бен келініміздің үйлену тойына шақырамыз. Келіп, қуанышымызға ортақ болыңыздар!",
    },
  ],
  kyz_uzatu: [
    {
      id: "kk-kyz-1",
      text: "Құрметті ағайын, дос-жаран! Сіздерді қызымыз [Аружан]ның ұзату тойына арналған ақ дастарханымыздың қадірлі қонағы болуға шақырамыз.",
    },
    { id: "kk-kyz-3", text: "Қызымыздың ұзату тойына шақырамыз. Қуанышымызға ортақ болыңыздар!" },
  ],
  sundet: [
    {
      id: "kk-sundet-1",
      text: "Құрметті ағайын, дос-жаран! Сіздерді ұлымыз [Нұрислам]ның сүндет тойына арналған ақ дастарханымыздың қадірлі қонағы болуға шақырамыз.",
    },
  ],
  besik: [
    {
      id: "kk-besik-1",
      text: "Шаңырағымызға келген кішкентай қуанышымыз — [немереміз Айша]ны бесікке салу тойына шақырамыз. Ақ тілектеріңізбен келіңіздер!",
    },
  ],
  merey: [
    {
      id: "kk-merey-1",
      text: "Құрметті ағайын, дос-жаран! Сіздерді [әкеміз Серік Бейсенұлы]ның [60] жасқа толу мерейтойына арналған ақ дастарханымыздың қадірлі қонағы болуға шақырамыз.",
    },
  ],
  other: [],
};

const RU: Record<PresetKind, Preset[]> = {
  uilenu_toi: [
    {
      id: "ru-uilenu-1",
      text: "Дорогие родные и друзья! Приглашаем вас разделить с нами радость: наши дети создают семью. Будем счастливы видеть вас на свадебном тое.",
    },
    {
      id: "ru-uilenu-2",
      text: "С большой радостью приглашаем вас на свадьбу наших детей. Ваше присутствие станет для нас лучшим подарком. Ждём вас, чтобы вместе отпраздновать этот светлый день.",
    },
  ],
  kyz_uzatu: [
    {
      id: "ru-kyz-1",
      text: "Дорогие гости! Наша дочь готовится стать хозяйкой нового дома. Приглашаем вас на қыз ұзату, чтобы вместе проводить её с добрыми пожеланиями.",
    },
    {
      id: "ru-kyz-2",
      text: "С радостью и лёгкой грустью провожаем нашу дочь в новую семью. Будем рады видеть вас на қыз ұзату и услышать ваши тёплые слова.",
    },
  ],
  sundet: [
    {
      id: "ru-sundet-1",
      text: "Наш сын подрастает! Приглашаем вас на сүндет той, чтобы вместе порадоваться за него и пожелать ему доброго пути.",
    },
  ],
  besik: [
    {
      id: "ru-besik-1",
      text: "В нашей семье появился малыш! Приглашаем вас на бесік той: вместе уложим его в первую колыбель и пожелаем ему здоровья и счастья.",
    },
  ],
  merey: [
    {
      id: "ru-merey-1",
      text: "Приглашаем вас на юбилей — [имя и возраст]. Будем рады отметить этот день в кругу родных и друзей, за общим дастарханом.",
    },
  ],
  other: [],
};

export function presets(kind: PresetKind, lang: "kk" | "ru"): Preset[] {
  return (lang === "kk" ? KK : RU)[kind];
}

/** Split a preset into plain and marked parts for highlighting: `[Айбек]` → { mark: "Айбек" }. */
export function presetParts(text: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), mark: false });
    out.push({ text: m[1]!, mark: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: false });
  return out;
}

/** The text as it is saved: brackets removed (the owner then edits the names and endings). */
export function presetPlain(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, "$1");
}
