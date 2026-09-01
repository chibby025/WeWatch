import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { X, Clock, Trophy, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import GameRulesButton from './GameRulesButton';

const TOTAL_ROUNDS = 10;
const ROUND_SECONDS = 15;

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const OPTION_BASE = [
  'border-blue-500   bg-blue-500/20   hover:bg-blue-500/35',
  'border-green-500  bg-green-500/20  hover:bg-green-500/35',
  'border-orange-500 bg-orange-500/20 hover:bg-orange-500/35',
  'border-red-500    bg-red-500/20    hover:bg-red-500/35',
];

const CATEGORIES = [
  { id: 9,  label: 'General Knowledge', emoji: '🧠', color: 'from-purple-600 to-indigo-600' },
  { id: 11, label: 'Film',              emoji: '🎬', color: 'from-yellow-600 to-orange-600' },
  { id: 14, label: 'Television',        emoji: '📺', color: 'from-blue-600 to-cyan-600' },
  { id: 12, label: 'Music',             emoji: '🎵', color: 'from-pink-600 to-rose-600' },
  { id: 15, label: 'Video Games',       emoji: '🎮', color: 'from-green-600 to-emerald-600' },
  { id: 31, label: 'Anime & Manga',     emoji: '🌸', color: 'from-fuchsia-600 to-pink-600' },
  { id: 17, label: 'Science',           emoji: '🔬', color: 'from-teal-600 to-cyan-600' },
  { id: 22, label: 'Geography',         emoji: '🌍', color: 'from-sky-600 to-blue-600' },
  { id: 21, label: 'Sports',            emoji: '⚽', color: 'from-lime-600 to-green-600' },
  { id: 26, label: 'Celebrities',       emoji: '⭐', color: 'from-amber-500 to-yellow-600' },
  { id: 32, label: 'Cartoons',          emoji: '🎭', color: 'from-violet-600 to-purple-600' },
  { id: 23, label: 'History',           emoji: '📜', color: 'from-stone-500 to-amber-700' },
  // Sentinel ids, not real OpenTDB categories — OpenTDB has neither an
  // African/indigenous-culture nor a religion category at all (confirmed
  // against its own live category list). handleCategoryConfirm special-cases
  // both ids and pulls from the hand-authored CULTURE_QUESTIONS /
  // RELIGION_QUESTIONS banks below instead of fetching. Two separate tiles,
  // not one combined topic.
  { id: 'culture',  label: 'Culture',  emoji: '🪘', color: 'from-amber-600 to-orange-700' },
  { id: 'religion', label: 'Religion', emoji: '🕊️', color: 'from-indigo-600 to-blue-800' },
];

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   color: 'border-green-500 bg-green-500/20 text-green-300',   active: 'border-green-400 bg-green-500/40 ring-2 ring-green-400' },
  { id: 'medium', label: 'Medium', color: 'border-yellow-500 bg-yellow-500/20 text-yellow-300', active: 'border-yellow-400 bg-yellow-500/40 ring-2 ring-yellow-400' },
  { id: 'hard',   label: 'Hard',   color: 'border-red-500 bg-red-500/20 text-red-300',          active: 'border-red-400 bg-red-500/40 ring-2 ring-red-400' },
];

// A larger, mixed general-knowledge pool used only when OpenTDB is genuinely
// unreachable (network failure, or every retry in fetchQuestions exhausted).
// pickFreshSubset() below randomly samples + shuffles 10 of these per game and
// tracks recently-served ones in sessionStorage, so a real outage doesn't show
// the exact same 10 questions in the exact same order every single time.
const FALLBACK_QUESTIONS = [
  { text: 'What is the largest planet in our solar system?', options: ['Earth','Jupiter','Saturn','Neptune'], correct_index: 1 },
  { text: "Which element has the chemical symbol 'Au'?", options: ['Silver','Copper','Gold','Platinum'], correct_index: 2 },
  { text: 'Who painted the Mona Lisa?', options: ['Michelangelo','Raphael','Van Gogh','Leonardo da Vinci'], correct_index: 3 },
  { text: 'What is the fastest land animal?', options: ['Lion','Cheetah','Horse','Leopard'], correct_index: 1 },
  { text: 'How many strings does a standard guitar have?', options: ['4','5','6','7'], correct_index: 2 },
  { text: 'What year did the Titanic sink?', options: ['1908','1912','1916','1920'], correct_index: 1 },
  { text: 'How many bones are in the adult human body?', options: ['196','206','216','226'], correct_index: 1 },
  { text: 'What is the capital of Japan?', options: ['Beijing','Seoul','Tokyo','Osaka'], correct_index: 2 },
  { text: 'Which planet is known as the Red Planet?', options: ['Venus','Jupiter','Mars','Saturn'], correct_index: 2 },
  { text: 'How many sides does a hexagon have?', options: ['5','6','7','8'], correct_index: 1 },
  { text: 'What is the longest river in the world?', options: ['Amazon','Nile','Yangtze','Mississippi'], correct_index: 1 },
  { text: 'Which country gifted the Statue of Liberty to the United States?', options: ['United Kingdom','Spain','France','Italy'], correct_index: 2 },
  { text: 'What is the smallest prime number?', options: ['0','1','2','3'], correct_index: 2 },
  { text: 'Which gas do plants primarily absorb from the atmosphere for photosynthesis?', options: ['Oxygen','Nitrogen','Carbon dioxide','Hydrogen'], correct_index: 2 },
  { text: 'What is the largest ocean on Earth?', options: ['Atlantic Ocean','Indian Ocean','Arctic Ocean','Pacific Ocean'], correct_index: 3 },
  { text: "Who wrote the play 'Romeo and Juliet'?", options: ['Charles Dickens','William Shakespeare','Jane Austen','Mark Twain'], correct_index: 1 },
  { text: 'What is the currency of Japan?', options: ['Won','Yuan','Yen','Ringgit'], correct_index: 2 },
  { text: 'How many continents are there on Earth?', options: ['5','6','7','8'], correct_index: 2 },
  { text: 'Which vitamin is produced when human skin is exposed to sunlight?', options: ['Vitamin A','Vitamin C','Vitamin D','Vitamin K'], correct_index: 2 },
  { text: 'What is the tallest mountain in the world?', options: ['K2','Mount Kilimanjaro','Mount Everest','Denali'], correct_index: 2 },
  { text: 'Which musical instrument has 88 keys?', options: ['Organ','Piano','Harpsichord','Accordion'], correct_index: 1 },
  { text: 'What is the freezing point of water in Celsius?', options: ['-10°C','0°C','10°C','32°C'], correct_index: 1 },
  { text: 'Which country is home to the kangaroo as a native species?', options: ['New Zealand','South Africa','Australia','Brazil'], correct_index: 2 },
  { text: 'What is the largest mammal in the world?', options: ['African elephant','Blue whale','Giraffe','Sperm whale'], correct_index: 1 },
  { text: 'Which language has the most native speakers worldwide?', options: ['English','Spanish','Mandarin Chinese','Hindi'], correct_index: 2 },
  { text: 'How many players are on a standard soccer team on the field?', options: ['9','10','11','12'], correct_index: 2 },
  { text: 'What is the capital city of Canada?', options: ['Toronto','Vancouver','Ottawa','Montreal'], correct_index: 2 },
  { text: 'Which organ in the human body produces insulin?', options: ['Liver','Pancreas','Kidney','Spleen'], correct_index: 1 },
  { text: 'The speed of light is approximately how many kilometers per second?', options: ['30,000 km/s','300,000 km/s','3,000,000 km/s','300 km/s'], correct_index: 1 },
  { text: 'Which shape has three sides?', options: ['Square','Pentagon','Triangle','Hexagon'], correct_index: 2 },
];

// ─── Culture & Religion question banks ───────────────────────────────────────
// OpenTDB has no African/indigenous-culture or religion category at all
// (verified directly against its live /api_category.php list) — both of these
// bypass OpenTDB entirely and pull from these hand-authored, fact-checked
// banks instead, same as the Custom-quiz path already does for host-authored
// questions. Two separate categories/tiles, not one combined topic: Culture
// (African civilizations + indigenous peoples worldwide) and Religion (world
// faiths). correct_index is always authored as 0 here — shuffleQuestionOptions()
// (below) randomizes the actual on-screen order every time a question is
// served, so the answer position isn't memorizable across repeated plays.
const CULTURE_QUESTIONS = [
  // ── African civilizations & culture ──
  { text: 'Mansa Musa, often cited as history’s richest individual, ruled which West African empire?', options: ['Mali Empire','Songhai Empire','Ashanti Empire','Kingdom of Kush'], correct_index: 0 },
  { text: 'The stone city of Great Zimbabwe, built without mortar, was constructed by the ancestors of which people?', options: ['Shona people','Zulu people','Maasai people','Yoruba people'], correct_index: 0 },
  { text: 'The Ashanti Empire, known for its sacred Golden Stool, was centered in present-day which country?', options: ['Ghana','Nigeria','Senegal','Kenya'], correct_index: 0 },
  { text: 'Which Ethiopian imperial dynasty claimed descent from King Solomon and the Queen of Sheba?', options: ['Solomonic dynasty','Aksumite dynasty','Zagwe dynasty','Fatimid dynasty'], correct_index: 0 },
  { text: 'The rock-hewn churches of Lalibela, carved directly from stone, are found in which country?', options: ['Ethiopia','Sudan','Eritrea','Kenya'], correct_index: 0 },
  { text: 'Timbuktu, a historic center of Islamic scholarship with the Sankore Madrasah, is located in which present-day country?', options: ['Mali','Niger','Chad','Sudan'], correct_index: 0 },
  { text: 'The Zulu Kingdom was famously united and expanded in the early 19th century under which leader?', options: ['Shaka Zulu','Cetshwayo','Moshoeshoe I','Lobengula'], correct_index: 0 },
  { text: 'The Nubian pyramids at Meröe, more numerous than Egypt’s, belong to which ancient African kingdom?', options: ['Kingdom of Kush','Land of Punt','Kingdom of Aksum','Nok culture'], correct_index: 0 },
  { text: 'The Yoruba people, known for a rich oral tradition and the Ifá divination system, are primarily from which present-day country?', options: ['Nigeria','Ghana','Cameroon','Ivory Coast'], correct_index: 0 },
  { text: 'The medieval Ghana Empire, from which modern Ghana later borrowed its name, was actually located in present-day which region?', options: ['Mali and Mauritania','Present-day Ghana','Present-day Nigeria','Present-day Senegal'], correct_index: 0 },
  { text: 'The Maasai people, known for distinctive red shuka clothing, are primarily found in which two countries?', options: ['Kenya and Tanzania','Nigeria and Ghana','South Africa and Namibia','Ethiopia and Somalia'], correct_index: 0 },
  { text: 'The kora, a 21-string gourd-resonated instrument, is a traditional instrument of which region?', options: ['West Africa','East Africa','Southern Africa','North Africa'], correct_index: 0 },
  { text: 'South Africa’s system of institutionalized racial segregation, formally dismantled by 1994, was called what?', options: ['Apartheid','Federation','Partition','Colonialism'], correct_index: 0 },
  { text: 'The djembe, a rope-tuned skin-covered drum, originated in West Africa among which peoples?', options: ['Mandinka people','Zulu people','Maasai people','Amhara people'], correct_index: 0 },
  { text: 'The ancient obelisks (stelae) of Aksum, some over 100 feet tall, are found in which country?', options: ['Ethiopia','Egypt','Sudan','Eritrea'], correct_index: 0 },
  { text: 'The intricate Benin Bronzes originate from the historic Kingdom of Benin, located in present-day which country?', options: ['Nigeria','Republic of Benin','Ghana','Ivory Coast'], correct_index: 0 },
  { text: 'The Southern African philosophy of "Ubuntu" — often summarized as "I am because we are" — comes from which language family?', options: ['Bantu languages','Cushitic languages','Nilotic languages','Berber languages'], correct_index: 0 },
  // ── Indigenous peoples worldwide ──
  { text: 'The Māori are the indigenous people of which country?', options: ['New Zealand','Australia','Fiji','Papua New Guinea'], correct_index: 0 },
  { text: 'The Haka, a ceremonial dance of challenge and unity, is traditionally performed by which indigenous group?', options: ['Māori','Aboriginal Australians','Native Hawaiians','Sámi'], correct_index: 0 },
  { text: 'Aboriginal Australian dot painting traditionally depicts stories from which spiritual concept?', options: ['The Dreamtime','The Underworld','Ancestor Spirits Path','The Sky Road'], correct_index: 0 },
  { text: 'The Inuit people are traditionally native to which region?', options: ['The Arctic','The Amazon','The Sahara','The Andes'], correct_index: 0 },
  { text: 'The Iroquois Confederacy (Haudenosaunee), also called the Six Nations, includes the Mohawk and which other people?', options: ['Seneca','Cherokee','Navajo','Lakota'], correct_index: 0 },
  { text: 'The Sámi people are indigenous to which region of Europe?', options: ['Northern Scandinavia (Lapland)','Southern Italy','Eastern Balkans','Western Ireland'], correct_index: 0 },
  { text: 'Machu Picchu, high in the Andes, was built by which indigenous civilization?', options: ['The Inca','The Maya','The Aztec','The Olmec'], correct_index: 0 },
  { text: 'Uluru (Ayers Rock), a sacred site in central Australia, is traditionally cared for by which Aboriginal people?', options: ['Anangu','Yolŋu','Noongar','Torres Strait Islanders'], correct_index: 0 },
  { text: 'Which indigenous people built the multi-story cliff dwellings at Mesa Verde in present-day Colorado, USA?', options: ['The Ancestral Puebloans','The Aztec','The Maya','The Cherokee'], correct_index: 0 },
  { text: 'Totem poles carved from cedar to represent family lineage and stories are a tradition of indigenous peoples from which region?', options: ['The Pacific Northwest Coast','The Great Plains','The Caribbean','The Andes'], correct_index: 0 },
  { text: 'The Iroquois Confederacy (Haudenosaunee) is governed by a founding oral constitution often called what?', options: ['The Great Law of Peace','The Magna Carta','The Treaty of Tordesillas','The Articles of Confederacy'], correct_index: 0 },
  { text: 'The Aztec capital of Tenochtitlan was built on an island in which lake, in present-day Mexico?', options: ['Lake Texcoco','Lake Titicaca','Lake Nicaragua','Lake Chapala'], correct_index: 0 },
  { text: 'Which indigenous Andean people developed a system of knotted cords called "quipu" for record-keeping?', options: ['The Inca','The Maya','The Aztec','The Olmec'], correct_index: 0 },
  { text: 'The Navajo (Diné) Nation, the largest Native American reservation by land area, spans Arizona, Utah, and which other state?', options: ['New Mexico','Colorado','Texas','Nevada'], correct_index: 0 },
  { text: 'The traditional Polynesian navigation technique of reading stars, waves, and wildlife without modern instruments is called what?', options: ['Wayfinding','Dead reckoning','Triangulation','Celestial mapping'], correct_index: 0 },
];

const RELIGION_QUESTIONS = [
  { text: 'The Quran is the central religious text of which religion?', options: ['Islam','Judaism','Sikhism','Zoroastrianism'], correct_index: 0 },
  { text: 'The Torah is the central text of which religion?', options: ['Judaism','Islam','Christianity','Hinduism'], correct_index: 0 },
  { text: 'Which religion teaches the Four Noble Truths and the Eightfold Path?', options: ['Buddhism','Hinduism','Jainism','Sikhism'], correct_index: 0 },
  { text: 'The Bhagavad Gita is a sacred scripture central to which religion?', options: ['Hinduism','Buddhism','Sikhism','Jainism'], correct_index: 0 },
  { text: 'Sikhism was founded by which guru in the Punjab region of South Asia?', options: ['Guru Nanak','Guru Gobind Singh','Guru Arjan','Guru Amar Das'], correct_index: 0 },
  { text: 'Ramadan, a month of daytime fasting, is observed by followers of which religion?', options: ['Islam','Christianity','Judaism','Hinduism'], correct_index: 0 },
  { text: 'Holi, the festival involving colored powders, celebrates the arrival of spring in which religion?', options: ['Hinduism','Buddhism','Sikhism','Shinto'], correct_index: 0 },
  { text: 'The Star of David is a widely recognized symbol of which religion?', options: ['Judaism','Islam','Christianity','Baha’i'], correct_index: 0 },
  { text: 'Followers of which religion traditionally observe the Sabbath from Friday evening to Saturday evening?', options: ['Judaism','Christianity','Islam','Zoroastrianism'], correct_index: 0 },
  { text: 'Diwali, the "Festival of Lights," is primarily celebrated by followers of which religion?', options: ['Hinduism','Islam','Christianity','Judaism'], correct_index: 0 },
  { text: 'Which of these religions originated in ancient India?', options: ['Hinduism','Islam','Christianity','Judaism'], correct_index: 0 },
  { text: 'Vodou (Voodoo), which blends West African spiritual traditions with Catholicism, is widely practiced in which Caribbean nation?', options: ['Haiti','Jamaica','Cuba','Trinidad and Tobago'], correct_index: 0 },
  { text: 'The Orisha spiritual tradition, centered on deities such as Shango and Oshun, originates with which African people?', options: ['Yoruba people','Zulu people','Maasai people','Amhara people'], correct_index: 0 },
  { text: 'Christianity is centered on the teachings of Jesus of Nazareth, as recorded primarily in which text?', options: ['The New Testament','The Torah','The Quran','The Vedas'], correct_index: 0 },
  { text: 'The Kaaba, considered Islam’s holiest site, is located in which city?', options: ['Mecca','Medina','Jerusalem','Baghdad'], correct_index: 0 },
  { text: 'Traditional African religions commonly hold that a single Supreme Creator (like the Akan’s "Nyame" or Zulu’s "uNkulunkulu") oversees the universe alongside what else?', options: ['Ancestor spirits','Guardian angels','Reincarnated saints','Elemental demigods'], correct_index: 0 },
];

function decodeHtml(str) {
  try { return decodeURIComponent(str); } catch { return str; }
}

function processOpentdbQuestion(q) {
  const correct = decodeHtml(q.correct_answer);
  const all = [correct, ...q.incorrect_answers.map(decodeHtml)].sort(() => Math.random() - 0.5);
  return { text: decodeHtml(q.question), options: all, correct_index: all.indexOf(correct) };
}

// ─── Question freshness ───────────────────────────────────────────────────────
// OpenTDB path: a real session token (verified live against opentdb.com — see
// the response_code handling below, each branch matches a real, confirmed
// server behavior, not a guess) makes OpenTDB exclude every question it has
// already served to this browser tab for the lifetime of the token, so a long
// play session keeps genuinely cycling through new questions instead of
// occasionally re-serving one from a few rounds ago. response_code 4 means
// the token has now seen every question OpenTDB has for this exact
// category+difficulty combo — reset it server-side and retry once rather
// than failing. response_code 3 means the token itself is stale (OpenTDB
// expires an idle token after ~6h) — drop it and retry once without one.
// response_code 5 is OpenTDB's own rate limit (~1 request per 5s per IP) —
// wait it out once. response_code 1 means the chosen category+difficulty
// combo simply doesn't have 10 questions — retry once at any difficulty
// (a much larger pool) before giving up, so a narrow combo still starts a
// real quiz instead of silently falling back to the exact same fixed list.
const OPENTDB_TOKEN_KEY = 'wewatch_trivia_opentdb_token';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOpenTdbToken() {
  try {
    const existing = sessionStorage.getItem(OPENTDB_TOKEN_KEY);
    if (existing) return existing;
  } catch { /* sessionStorage unavailable (private mode) — proceed tokenless */ }
  try {
    const res = await fetch('https://opentdb.com/api_token.php?command=request');
    const data = await res.json();
    if (data.response_code === 0 && data.token) {
      try { sessionStorage.setItem(OPENTDB_TOKEN_KEY, data.token); } catch { /* ignore */ }
      return data.token;
    }
  } catch { /* network failure acquiring a token — degrade to plain random fetch */ }
  return null;
}

async function resetOpenTdbToken(token) {
  try {
    await fetch(`https://opentdb.com/api_token.php?command=reset&token=${token}`);
  } catch { /* best-effort — a failed reset just means the next fetch falls through to fallback */ }
}

async function fetchQuestions(categoryId, difficulty) {
  const token = await getOpenTdbToken();

  const buildUrl = ({ cat = categoryId, diff = difficulty, tok = token } = {}) => {
    let url = 'https://opentdb.com/api.php?amount=10&type=multiple&encode=url3986';
    if (cat) url += `&category=${cat}`;
    if (diff) url += `&difficulty=${diff}`;
    if (tok) url += `&token=${tok}`;
    return url;
  };
  const run = async (opts) => (await fetch(buildUrl(opts))).json();

  let data = await run();

  if (data.response_code === 4 && token) {
    await resetOpenTdbToken(token);
    data = await run();
  }
  if (data.response_code === 3) {
    try { sessionStorage.removeItem(OPENTDB_TOKEN_KEY); } catch { /* ignore */ }
    data = await run({ tok: null });
  }
  if (data.response_code === 5) {
    await sleep(5500);
    data = await run();
  }
  if (data.response_code === 1 && difficulty) {
    data = await run({ diff: null });
  }

  if (data.response_code !== 0 || !data.results?.length) {
    throw new Error(`opentdb response_code ${data.response_code}`);
  }
  return data.results.map(processOpentdbQuestion);
}

// Randomizes a question's option order (and remaps correct_index to match) —
// applied every time a question is pulled from a locally-authored bank
// (Culture & Religion, or the OpenTDB-outage fallback list), matching the
// same shuffle OpenTDB questions already get in processOpentdbQuestion above,
// so the correct answer's on-screen position isn't memorizable across plays.
function shuffleQuestionOptions(q) {
  const correctText = q.options[q.correct_index];
  const shuffled = [...q.options].sort(() => Math.random() - 0.5);
  return { ...q, options: shuffled, correct_index: shuffled.indexOf(correctText) };
}

// Samples `count` questions from a locally-authored `pool`, avoiding whatever
// this browser tab was already served from that same pool (tracked by
// question text in sessionStorage under `storageKey`) until the pool's
// remaining unseen questions run low — at which point tracking resets and the
// full pool becomes available again. This is the local-bank equivalent of
// OpenTDB's own session-token exclusion above: neither the Culture & Religion
// bank nor the outage fallback list should show the identical set every time.
function pickFreshSubset(pool, count, storageKey) {
  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); } catch { seen = []; }
  const seenSet = new Set(seen);
  let available = pool.filter((q) => !seenSet.has(q.text));
  if (available.length < count) {
    seenSet.clear();
    available = pool;
  }
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length)).map(shuffleQuestionOptions);
  try {
    const nextSeen = [...seenSet, ...picked.map((q) => q.text)].slice(-200);
    sessionStorage.setItem(storageKey, JSON.stringify(nextSeen));
  } catch { /* sessionStorage unavailable — freshness degrades to pure per-round randomness */ }
  return picked;
}

// ─── Custom question builder (host only) ─────────────────────────────────────
// Opened when the host taps the "✏️ Custom" tile in CategoryPicker. Lets the host
// author their own questions (min 3, max 20) which are handed straight to the game
// as `questions`, skipping the OpenTDB fetch entirely. The rest of TriviaGame is
// unchanged — it just iterates through whatever `questions` array it's given.
const CUSTOM_MIN_QUESTIONS = 3;
const CUSTOM_MAX_QUESTIONS = 20;

function CustomQuestionBuilder({ onConfirm, onCancel }) {
  const [questions, setQuestions] = useState([]);
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);

  const trimmedOptions = options.map(o => o.trim());
  const canAdd =
    text.trim().length > 0 &&
    trimmedOptions.every(o => o.length > 0) &&
    questions.length < CUSTOM_MAX_QUESTIONS;

  const addQuestion = () => {
    if (!canAdd) return;
    setQuestions(prev => [
      ...prev,
      { text: text.trim(), options: [...trimmedOptions], correct_index: correctIndex },
    ]);
    setText('');
    setOptions(['', '', '', '']);
    setCorrectIndex(0);
  };

  const removeQuestion = (idx) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const setOption = (idx, value) => {
    setOptions(prev => prev.map((o, i) => (i === idx ? value : o)));
  };

  const canStart = questions.length >= CUSTOM_MIN_QUESTIONS;

  return (
    <div className="fixed inset-0 z-[70] bg-gray-950/98 flex flex-col overflow-y-auto">
      <div className="flex items-start justify-between pl-20 pr-5 pt-6 pb-2 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Build Your Quiz ✏️</h2>
          <p className="text-gray-400 text-sm">
            Add {CUSTOM_MIN_QUESTIONS}–{CUSTOM_MAX_QUESTIONS} of your own questions
          </p>
        </div>
        <button
          onClick={onCancel}
          className="mt-1 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
          title="Back to topics"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 px-5 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto">
        {/* Builder form */}
        <div className="bg-gray-800/60 rounded-2xl p-4 space-y-3">
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              Question
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What is the capital of France?"
              rows={2}
              className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block">
              Options (tap the circle to mark the correct one)
            </label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectIndex(i)}
                  title="Mark as correct answer"
                  className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                    correctIndex === i
                      ? 'border-green-400 bg-green-500 text-white'
                      : 'border-gray-600 text-gray-500 hover:border-gray-400'
                  }`}
                >
                  {OPTION_LABELS[i]}
                </button>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${OPTION_LABELS[i]}`}
                  className="flex-1 bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            ))}
          </div>

          <button
            onClick={addQuestion}
            disabled={!canAdd}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition-all"
          >
            {questions.length >= CUSTOM_MAX_QUESTIONS
              ? `Max ${CUSTOM_MAX_QUESTIONS} questions reached`
              : '+ Add Question'}
          </button>
        </div>

        {/* Added questions list */}
        <div className="bg-gray-800/40 rounded-2xl p-4">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Your Questions ({questions.length})
          </p>
          {questions.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm">
              No questions yet — add your first one.
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {questions.map((q, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 bg-gray-900/60 rounded-lg p-3 border border-gray-700"
                >
                  <span className="text-purple-400 text-xs font-bold mt-0.5 flex-shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium leading-snug">{q.text}</p>
                    <p className="text-green-400 text-xs mt-1 truncate">
                      ✓ {q.options[q.correct_index]}
                    </p>
                  </div>
                  <button
                    onClick={() => removeQuestion(idx)}
                    className="text-gray-500 hover:text-red-400 flex-shrink-0"
                    title="Remove question"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-6 pt-3 border-t border-gray-800 flex gap-2 flex-shrink-0">
        <button
          onClick={onCancel}
          className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
        >
          Back
        </button>
        <button
          onClick={() => canStart && onConfirm(questions)}
          disabled={!canStart}
          className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base transition-all"
        >
          {canStart
            ? `Start Game (${questions.length} question${questions.length === 1 ? '' : 's'})`
            : `Add ${CUSTOM_MIN_QUESTIONS - questions.length} more to start`}
        </button>
      </div>
    </div>
  );
}

// ─── Category picker (host only) ─────────────────────────────────────────────
function CategoryPicker({ onConfirm, onConfirmCustom, onEnd }) {
  const [selected, setSelected] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);

  if (showCustomBuilder) {
    return (
      <CustomQuestionBuilder
        onConfirm={onConfirmCustom}
        onCancel={() => setShowCustomBuilder(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col overflow-y-auto">
      <div className="flex items-start justify-between pl-20 pr-5 pt-6 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Pick a Topic 🎯</h2>
          <p className="text-gray-400 text-sm">Choose what you want to be quizzed on</p>
        </div>
        <button
          onClick={onEnd}
          className="mt-1 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
          title="Cancel game"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Category grid */}
      <div className="px-5 py-4 grid grid-cols-3 sm:grid-cols-4 gap-2.5 flex-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelected(cat.id === selected ? null : cat.id)}
            className={`
              relative rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 border-2 transition-all
              ${selected === cat.id
                ? `bg-gradient-to-br ${cat.color} border-white/40 scale-105 shadow-lg`
                : 'border-gray-700 bg-gray-800/60 hover:border-gray-500 hover:bg-gray-700/60'
              }
            `}
          >
            <span className="text-2xl sm:text-3xl">{cat.emoji}</span>
            <span className="text-white text-[11px] font-semibold text-center leading-tight">{cat.label}</span>
            {selected === cat.id && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white rounded-full flex items-center justify-center text-xs text-gray-900 font-bold">✓</span>
            )}
          </button>
        ))}

        {/* Custom tile — opens the question builder instead of fetching from OpenTDB */}
        <button
          onClick={() => setShowCustomBuilder(true)}
          className="relative rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-purple-500/60 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-400 transition-all"
        >
          <span className="text-2xl sm:text-3xl">✏️</span>
          <span className="text-white text-[11px] font-semibold text-center leading-tight">Custom</span>
        </button>
      </div>

      {/* Difficulty + start */}
      <div className="px-5 pb-6 pt-2 space-y-4 border-t border-gray-800">
        {/* Culture/Religion pull from a fixed hand-authored bank with no
            difficulty tagging — the selector doesn't apply to them, so hide
            it rather than show a control that silently does nothing. */}
        {selected !== 'culture' && selected !== 'religion' && (
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Difficulty</p>
            <div className="flex gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                    difficulty === d.id ? d.active : d.color
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onEnd}
            className="px-4 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 hover:text-red-300 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
          >
            End Game
          </button>
          <button
            onClick={() => onConfirm(selected, difficulty)}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-base transition-all disabled:opacity-40"
          >
            {selected
              ? `Start — ${CATEGORIES.find(c => c.id === selected)?.label}`
              : 'Start — Random Mix'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main game component ──────────────────────────────────────────────────────
export default function TriviaGame({ gameState, currentUserId, onMove, onClose }) {
  // 'picking' → host only; 'loading' → fetching from API; 'game' → main UI
  const [localPhase, setLocalPhase] = useState('picking');
  const [questions, setQuestions] = useState([]);
  const [myAnswer, setMyAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [fetchError, setFetchError] = useState(false);
  const [isSendingNext, setIsSendingNext] = useState(false);
  const revealSentRef = useRef(false);
  const nextRoundTimeoutRef = useRef(null);

  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const currentQuestion = gs.current_question || null;
  const answers = gs.answers || {};
  const scores = gs.scores || {};
  const round = Number(gs.round) || 0;

  const players = gameState?.players || [];
  // host_id is now broadcast explicitly (backend) — players[0] kept only as a fallback
  // for the unlikely case it's ever missing. Host no longer has to be one of the
  // players: GameLobbyModal lets the host set up a match between two other members
  // and just spectate/run the show.
  const isHostUser = (gameState?.host_id ?? players[0]?.user_id) === currentUserId;
  const isPlayer = players.some(p => p.user_id === currentUserId);

  // Shadow ref for round — read inside the stuck-detection timeout in sendQuestion
  // below, which otherwise closes over whatever `round` was at click time, not the
  // live value once the timeout actually fires.
  const roundRef = useRef(round);
  useEffect(() => { roundRef.current = round; }, [round]);

  // Non-hosts skip the picker and go straight to game
  useEffect(() => {
    if (!isHostUser) setLocalPhase('game');
  }, [isHostUser]);

  // BUG FIX (2026-06-24): localPhase is local-only state — the host's CategoryPicker
  // ('picking') and loading screen both return early, before ever checking the
  // backend-derived `phase`. Clicking the header X on the picker correctly sends
  // `trivia_end` and the backend correctly ends the game, but with no transition out
  // of 'picking' nothing ever showed for it — it looked exactly like "the X button
  // doesn't work." Force past picking/loading the moment the backend confirms the
  // game ended, so the actual Game Over screen (gated on phase === 'ended', further
  // down in the main render) becomes reachable.
  useEffect(() => {
    if (phase === 'ended' && (localPhase === 'picking' || localPhase === 'loading')) {
      setLocalPhase('game');
    }
  }, [phase, localPhase]);

  // The round only advances once the backend has actually processed a
  // trivia_question move — so seeing it change here is direct confirmation the
  // pending send in sendQuestion succeeded. Clear the stuck-detection timeout
  // immediately rather than waiting for it to fire and find nothing wrong.
  useEffect(() => {
    if (nextRoundTimeoutRef.current) {
      clearTimeout(nextRoundTimeoutRef.current);
      nextRoundTimeoutRef.current = null;
    }
    setIsSendingNext(false);
  }, [round]);

  useEffect(() => () => {
    if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
  }, []);

  // Reset answer when a new question arrives
  useEffect(() => {
    if (phase === 'question') {
      setMyAnswer(null);
      revealSentRef.current = false;
    }
  }, [currentQuestion?.started_at]);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion?.started_at) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - currentQuestion.started_at) / 1000;
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0 && isHostUser && !revealSentRef.current) {
        revealSentRef.current = true;
        onMove({ move_type: 'reveal' });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase, currentQuestion?.started_at, isHostUser, onMove]);

  const handleCategoryConfirm = async (categoryId, difficulty) => {
    // Culture/Religion bypass OpenTDB entirely (it has no such categories —
    // confirmed against its own live category list) and pull straight from
    // the hand-authored banks, same as Custom — no fetch, no loading screen.
    if (categoryId === 'culture' || categoryId === 'religion') {
      const pool = categoryId === 'culture' ? CULTURE_QUESTIONS : RELIGION_QUESTIONS;
      const storageKey = categoryId === 'culture' ? 'wewatch_trivia_culture_seen' : 'wewatch_trivia_religion_seen';
      setFetchError(false);
      setQuestions(pickFreshSubset(pool, 10, storageKey));
      setLocalPhase('game');
      return;
    }
    setLocalPhase('loading');
    setFetchError(false);
    try {
      const qs = await fetchQuestions(categoryId, difficulty);
      setQuestions(qs);
    } catch {
      setFetchError(true);
      setQuestions(pickFreshSubset(FALLBACK_QUESTIONS, 10, 'wewatch_trivia_fallback_seen'));
    }
    setLocalPhase('game');
  };

  // Custom questions authored by the host in CustomQuestionBuilder — no fetch,
  // no loading screen; the array is already in the exact same shape the game
  // iterates over ({ text, options, correct_index }).
  const handleCustomConfirm = (customQuestions) => {
    setFetchError(false);
    setQuestions(customQuestions);
    setLocalPhase('game');
  };

  const sendQuestion = () => {
    if (round >= questions.length) return;
    // Driven by the server-confirmed round, not a locally-incrementing pointer —
    // if the move below never reaches the backend, round stays put and the next
    // click resends this same question instead of silently skipping ahead.
    const sentAtRound = round;
    const q = { ...questions[round], started_at: Date.now() };
    onMove({ move_type: 'trivia_question', question: q });

    setIsSendingNext(true);
    if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
    nextRoundTimeoutRef.current = setTimeout(() => {
      nextRoundTimeoutRef.current = null;
      setIsSendingNext(false);
      // Still on the same round after 5s — the move never reached the backend
      // (dropped WS frame, brief disconnect). Surface it instead of leaving the
      // host stuck on an unresponsive button with zero feedback.
      if (roundRef.current === sentAtRound) {
        toast.error('Failed to start the next round — tap the button to retry.');
      }
    }, 5000);
  };

  const sendAnswer = (index) => {
    if (!isPlayer || myAnswer !== null || phase !== 'question') return;
    setMyAnswer(index);
    onMove({ move_type: 'answer', answer_index: index });
  };

  const sendReveal = () => {
    if (revealSentRef.current) return;
    revealSentRef.current = true;
    onMove({ move_type: 'reveal' });
  };

  // Host ending the game (mid-session "End Game", or "Show Results" after the last
  // round, or cancelling at the category picker) computes a real winner from current
  // scores server-side (trivia_end) — never the old forfeit-style "the other player
  // automatically wins", which doesn't apply once a trivia game can have >2 players
  // and isn't what "show results"/"end early" actually means for a score-based game.
  // A non-host clicking the same X just leaves locally without ending it for everyone.
  const endOrLeave = () => {
    if (isHostUser) onMove({ move_type: 'trivia_end' });
    else onClose();
  };

  const answeredCount = Object.keys(answers).length;
  // Total rounds tracks however many questions were actually loaded (10 from OpenTDB,
  // or 3–20 in Custom mode). Falls back to TOTAL_ROUNDS before questions load so the
  // header doesn't briefly show "/0".
  const totalRounds = questions.length || TOTAL_ROUNDS;
  const isLastRound = round >= totalRounds;
  const sortedPlayers = [...players].sort(
    (a, b) => (Number(scores[String(b.user_id)]) || 0) - (Number(scores[String(a.user_id)]) || 0)
  );
  const scoreOf = (p) => Number(scores[String(p.user_id)]) || 0;
  // A trophy/"winner" only makes sense when exactly one player holds the top score —
  // showing it on sortedPlayers[0] unconditionally (the old behavior) declared a
  // winner even when two players were tied, which is what the user actually hit.
  const topScore = sortedPlayers.length ? scoreOf(sortedPlayers[0]) : 0;
  const hasSoleLeader = topScore > 0 && sortedPlayers.filter(p => scoreOf(p) === topScore).length === 1;
  const finalWinner = gameState?.winner_id != null ? players.find(p => p.user_id === gameState.winner_id) : null;

  // ── Host: category picker ────────────────────────────────────────────────
  if (isHostUser && localPhase === 'picking') {
    return (
      <CategoryPicker
        onConfirm={handleCategoryConfirm}
        onConfirmCustom={handleCustomConfirm}
        onEnd={endOrLeave}
      />
    );
  }

  // ── Host: loading screen ─────────────────────────────────────────────────
  if (isHostUser && localPhase === 'loading') {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950/98 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg font-medium">Fetching questions…</p>
          <p className="text-gray-500 text-sm mt-1">Powered by Open Trivia DB</p>
        </div>
      </div>
    );
  }

  // ── Main game UI ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      {/* Header — left padding clears the sidebar (~64px wide on mobile) */}
      <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <span className="text-white font-bold text-xl">Trivia</span>
          {round > 0 && (
            <span className="text-gray-400 text-sm ml-1">Round {round}/{totalRounds}</span>
          )}
          {fetchError && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Using fallback questions
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <GameRulesButton gameType="trivia" />
          <button
            onClick={endOrLeave}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
          >
            {isHostUser ? 'End Game' : 'Leave'}
          </button>
          <button
            onClick={endOrLeave}
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
            title={isHostUser ? 'End game for everyone' : 'Leave game'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Score strip */}
      {round > 0 && (
        <div className="flex items-center gap-4 px-5 py-2 bg-gray-900 overflow-x-auto flex-shrink-0">
          {sortedPlayers.map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-1.5 flex-shrink-0">
              {i === 0 && hasSoleLeader && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
              <div className="w-5 h-5 rounded-full border border-white/30" style={{ backgroundColor: p.color }} />
              <span className="text-white text-sm">{p.username}</span>
              <span className="text-yellow-400 text-xs font-bold">{scoreOf(p)}pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto">

        {/* Waiting */}
        {phase === 'waiting' && (
          <div className="text-center">
            <div className="text-6xl mb-5">{isHostUser ? '🎯' : '⏳'}</div>
            <h2 className="text-2xl font-bold text-white mb-2">{isHostUser ? 'Ready!' : 'Get Ready!'}</h2>
            <p className="text-gray-400 mb-8 text-sm">
              {isHostUser
                ? 'Questions loaded. Start when everyone is ready.'
                : 'Waiting for the host to start the first round…'}
            </p>
            {isHostUser && (
              <button
                onClick={sendQuestion}
                disabled={isSendingNext}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base transition-all"
              >
                {isSendingNext ? 'Starting…' : 'Start Round 1'}
              </button>
            )}
          </div>
        )}

        {/* Game over — final winner/draw announcement, reachable via End Game,
            Show Results, or the header X (host only); never the old behavior of just
            silently closing the whole overlay with no summary at all. */}
        {phase === 'ended' && (
          <div className="text-center max-w-md w-full">
            <div className="text-6xl mb-4">{finalWinner ? '🏆' : '🤝'}</div>
            <h2 className="text-3xl font-bold text-white mb-1">
              {finalWinner ? `${finalWinner.username} Wins!` : "It's a Draw!"}
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              {finalWinner ? 'Highest score after the game ended' : 'Tied scores — no single winner'}
            </p>
            <div className="bg-gray-800/60 rounded-xl p-4 space-y-2.5">
              {sortedPlayers.map(p => (
                <div key={p.user_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full border border-white/30 flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-white text-sm">{p.username}</span>
                    {finalWinner?.user_id === p.user_id && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                  </div>
                  <span className="text-yellow-400 text-sm font-bold">{scoreOf(p)}pts</span>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="mt-6 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-base transition-all"
            >
              Close
            </button>
          </div>
        )}

        {/* Question / Reveal */}
        {(phase === 'question' || phase === 'reveal') && currentQuestion && (
          <div className="w-full max-w-2xl">
            {/* Timer bar */}
            {phase === 'question' && (
              <div className="flex items-center gap-3 mb-5">
                <Clock className={`w-4 h-4 flex-shrink-0 ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-gray-400'}`} />
                <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${timeLeft <= 5 ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-right tabular-nums ${timeLeft <= 5 ? 'text-red-400' : 'text-gray-300'}`}>
                  {timeLeft}s
                </span>
              </div>
            )}

            {/* Question card */}
            <div className="bg-gray-800 rounded-2xl p-6 mb-4 text-center shadow-lg">
              <p className="text-white text-lg font-semibold leading-relaxed">{currentQuestion.text}</p>
            </div>

            {phase === 'question' && (
              <p className="text-gray-500 text-xs text-center mb-3">
                {answeredCount}/{players.length} answered
              </p>
            )}

            {/* Answer grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentQuestion.options?.map((option, i) => {
                const isCorrect = i === currentQuestion.correct_index;
                const isMyPick = myAnswer === i;
                const revealed = phase === 'reveal';

                let cls = 'w-full p-3.5 rounded-xl border-2 text-left transition-all flex items-center gap-3 ';
                if (revealed) {
                  if (isCorrect)     cls += 'border-green-500 bg-green-600/25 text-white';
                  else if (isMyPick) cls += 'border-red-500 bg-red-600/20 text-gray-300 line-through';
                  else               cls += 'border-gray-700 bg-gray-800/40 text-gray-500';
                } else if (isMyPick) {
                  cls += 'border-purple-400 bg-purple-600/25 text-white';
                } else if (myAnswer !== null) {
                  cls += 'border-gray-700 bg-gray-800/40 text-gray-500 opacity-60';
                } else {
                  cls += `${OPTION_BASE[i]} text-white cursor-pointer`;
                }

                return (
                  <button
                    key={i}
                    onClick={() => sendAnswer(i)}
                    disabled={!isPlayer || revealed || myAnswer !== null}
                    className={cls}
                  >
                    <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {OPTION_LABELS[i]}
                    </span>
                    <span className="flex-1 text-sm font-medium leading-snug">{option}</span>
                    {revealed && isCorrect  && <span className="text-green-400 font-bold text-base">✓</span>}
                    {revealed && isMyPick && !isCorrect && <span className="text-red-400 font-bold text-base">✗</span>}
                  </button>
                );
              })}
            </div>

            {/* Reveal results */}
            {phase === 'reveal' && (
              <div className="mt-5 bg-gray-800/60 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Results</p>
                <div className="flex flex-wrap gap-2">
                  {players.map(p => {
                    const playerAnswer = answers[String(p.user_id)];
                    const correct = Number(playerAnswer) === currentQuestion.correct_index;
                    const answered = playerAnswer !== undefined && playerAnswer !== null;
                    return (
                      <span
                        key={p.user_id}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          !answered
                            ? 'bg-gray-700 text-gray-400'
                            : correct
                              ? 'bg-green-600/25 border border-green-500/40 text-green-400'
                              : 'bg-red-600/20 border border-red-500/40 text-red-400'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        {p.username}
                        {answered ? (correct ? ' +100' : ' ✗') : ' –'}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Host controls */}
            {isHostUser && (
              <div className="flex justify-between items-center mt-5">
                <button
                  onClick={endOrLeave}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 hover:text-red-300 rounded-xl text-sm font-semibold transition-colors"
                >
                  End Game
                </button>
                <div className="flex gap-2">
                  {phase === 'question' && (
                    <button
                      onClick={sendReveal}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm transition-colors"
                    >
                      Reveal Answers
                    </button>
                  )}
                  {phase === 'reveal' && !isLastRound && (
                    <button
                      onClick={sendQuestion}
                      disabled={isSendingNext}
                      className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-all"
                    >
                      {isSendingNext ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
                      ) : (
                        <>Next Round <ChevronRight className="w-4 h-4" /></>
                      )}
                    </button>
                  )}
                  {phase === 'reveal' && isLastRound && (
                    <button
                      onClick={endOrLeave}
                      className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white rounded-xl font-semibold text-sm transition-all"
                    >
                      <Trophy className="w-4 h-4" /> Show Results
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Hint for anyone not actively answering — a spectating host (set up the
                match for two other members) or a room member who isn't one of the
                selected players either. */}
            {!isPlayer && phase === 'question' && (
              <p className="text-center text-gray-500 text-xs mt-4">
                {isHostUser ? "You're hosting — sit back and watch!" : "Watching this round — you're not one of the active players."}
              </p>
            )}
            {isPlayer && !isHostUser && phase === 'question' && (
              <p className="text-center text-gray-500 text-xs mt-4">
                {myAnswer !== null ? 'Locked in! Waiting for answers to be revealed…' : 'Pick an answer before time runs out!'}
              </p>
            )}
            {!isHostUser && phase === 'reveal' && (
              <p className="text-center text-gray-500 text-xs mt-4">
                {isLastRound ? 'Waiting for the host to show final results…' : 'Waiting for the host to start the next round…'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
