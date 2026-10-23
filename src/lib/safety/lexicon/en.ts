import type { LexiconEntry } from "./types";

// DRAFT v1: the clinical lead must review this before the pilot. Tuned for recall,
// so hyperbole and negation ("I would never kill myself") still match by design.
export const EN_LEXICON: LexiconEntry[] = [
  // acute
  { id: "en.kill_self", category: "acute", pattern: /\bkill(ing)?\s+my\s*self\b/ },
  { id: "en.end_life", category: "acute", pattern: /\b(end|ending|take|taking)\s+my\s+(own\s+)?life\b/ },
  { id: "en.end_it_all", category: "acute", pattern: /\bend(ing)?\s+it\s+all\b/ },
  // Covers common misspellings: sucide, suiside, suicidal, suicides.
  { id: "en.suicide", category: "acute", pattern: /\bsu+i?[cs]+i?de?s?\b|\bsuicid\w*/ },
  { id: "en.want_to_die", category: "acute", pattern: /\b(want|wanna|plan|planning|ready|decided)\s+(to\s+)?(die|be\s+dead)\b/ },
  { id: "en.hang_self", category: "acute", pattern: /\bhang(ing)?\s+my\s*self\b/ },
  { id: "en.overdose", category: "acute", pattern: /\boverdos(e|ed|ing)\b/ },
  { id: "en.slit_wrists", category: "acute", pattern: /\bslit(ting)?\s+my\s+wrists?\b/ },
  {
    id: "en.jump_off",
    category: "acute",
    pattern: /\bjump(ing)?\s+(off|from)\s+(the\s+|a\s+)?(roof|terrace|building|bridge|hostel|balcony)\b/,
  },
  {
    id: "en.wont_be_alive",
    category: "acute",
    pattern: /\b(wont|will\s+not)\s+be\s+(alive|here|around)\s+(tomorrow|anymore|much\s+longer)\b/,
  },
  // Added 2026-10-24 after a recall probe; pending clinical-lead review like the rest of v1.
  // "kms" alone also means kilometres, so it needs an intent word or to stand alone.
  { id: "en.kms", category: "acute", pattern: /\b(wanna|want\s+to|gonna|going\s+to|will|ill|should|might|about\s+to)\s+kms\b|^kms$/ },
  { id: "en.unalive", category: "acute", pattern: /\bunaliv(e|ing)\b/ },
  { id: "en.end_everything", category: "acute", pattern: /\bend(ing)?\s+everything\b|\bend(ing)?\s+it\s+(tonight|today|now|soon|for\s+good)\b/ },
  // Needs a quantity word: "take my pills" on its own is ordinary medication.
  {
    id: "en.pills_overdose",
    category: "acute",
    pattern:
      /\b(took|take|taking|swallow\w*|ate|eat|pop\w*)\s+(all|a\s+bunch\s+of|a\s+lot\s+of|lots\s+of|too\s+many|a\s+handful\s+of|the\s+whole|the\s+entire|whole|entire)\b(\s+\w+){0,3}?\s+(pills|tablets|meds|medicines?|strip|bottle)\b/,
  },
  {
    id: "en.in_front_of_train",
    category: "acute",
    pattern: /\b(jump\w*|throw\w*\s+my\s*self|lie\s+down|lay\s+down)\s+(in\s+front\s+of|under|before|onto)\s+(a\s+|the\s+)?(train|bus|truck|car|metro)\b/,
  },
  { id: "en.noose", category: "acute", pattern: /\bnoose\b|\brope\b(\s+\w+){0,3}\s+(ready|bought|tied|neck|ceiling|fan)\b/ },
  { id: "en.goodbye_note", category: "acute", pattern: /\b(goodbye|suicide|final)\s+(note|letter)\b/ },

  // self_harm
  {
    id: "en.harm_self",
    category: "self_harm",
    pattern: /\b(cut|cutting|hurt|hurting|harm|harming|burn|burning|punish|punishing)\s+my\s*self\b/,
  },
  { id: "en.self_harm", category: "self_harm", pattern: /\bself\s*harm\w*/ },
  { id: "en.cutting_again", category: "self_harm", pattern: /\bcutting\s+again\b/ },

  // passive
  { id: "en.better_off_dead", category: "passive", pattern: /\bbetter\s+off\s+(dead|without\s+me)\b/ },
  {
    id: "en.no_reason_to_live",
    category: "passive",
    pattern: /\b(no|not\s+any|isnt\s+any)\s+(reason|point)\s+(to|in)\s+(live|living|go\s+on|going\s+on|being\s+alive)\b/,
  },
  { id: "en.wish_dead", category: "passive", pattern: /\bwish\s+i\s+(was|were)\s+(dead|never\s+born|not\s+alive|gone)\b/ },
  { id: "en.wish_could_die", category: "passive", pattern: /\bwish\s+i\s+could\s+(die|disappear)\b/ },
  { id: "en.cant_go_on", category: "passive", pattern: /\bcant\s+go\s+on\b/ },
  {
    id: "en.dont_want_to_live",
    category: "passive",
    pattern: /\b(dont|do\s+not)\s+want\s+to\s+(live|be\s+alive|exist|wake\s+up|be\s+here\s+any\s*more)\b/,
  },
  { id: "en.want_to_disappear", category: "passive", pattern: /\b(want|wish)\s+to\s+(disappear|stop\s+existing|not\s+exist)\b/ },
  {
    id: "en.should_die",
    category: "passive",
    pattern: /\b(should|deserve\s+to|would\s+rather|d\s+rather|id\s+rather)\s+(just\s+)?(die|be\s+dead)\b/,
  },
  { id: "en.nobody_miss_me", category: "passive", pattern: /\b(no\s*one|nobody)\s+(would|will)\s+(even\s+)?(miss|notice)\s+(me|if\s+i)\b/ },
  { id: "en.no_future", category: "passive", pattern: /\b(dont|do\s+not|cant|cannot)\s+see\s+(a|any)\s+future\b/ },
  { id: "en.cant_take_it", category: "passive", pattern: /\bcant\s+(take|handle|bear)\s+(it|this)\s+any\s*more\b/ },
  { id: "en.never_wake_up", category: "passive", pattern: /\bsleep\s+forever\b|\bnever\s+wake\s+up\b/ },
  // "gonna die" is usually hyperbole, so it sits here rather than in acute.
  { id: "en.going_to_die", category: "passive", pattern: /\b(going|gonna)\s+(to\s+)?die\b/ },
  { id: "en.tired_of_living", category: "passive", pattern: /\btired\s+of\s+(living|life|being\s+alive)\b/ },

  // ragging
  { id: "en.ragging", category: "ragging", pattern: /\bragg?(ing|ed)\b/ },
  {
    id: "en.seniors_harass",
    category: "ragging",
    pattern: /\bseniors?\s+(harass|harassed|beat|hit|forced?|torture|tortured|bully|bullied)\b/,
  },
];
