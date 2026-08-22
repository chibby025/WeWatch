package games

import (
	"fmt"
	"math/rand"
)

// Would You Rather: host-driven social game.
// State machine: "presenting" → players vote A or B → "reveal" (results shown) →
// host advances to next question → "presenting" again.
// move_types: "vote" (player picks "A" or "B"), "next" (host advances), "end" (host ends).
//
// All state is perfect-information — everyone sees the question and the running tally
// after reveal. No hidden state needed.

var wyrQuestions = []struct {
	A, B string
}{
	{"Watch the same movie on repeat for a year", "Never watch movies again"},
	{"Have no internet for a month", "Have no phone for a month"},
	{"Always speak in rhymes", "Always speak in a different language"},
	{"Know when you're going to die", "Know how you're going to die"},
	{"Be famous but hated", "Be unknown but loved"},
	{"Live without music", "Live without TV/streaming"},
	{"Rewind time 10 years", "Fast-forward time 10 years"},
	{"Never use social media again", "Never watch another film/series"},
	{"Have a photographic memory", "Be able to forget anything instantly"},
	{"Always be 10 minutes late", "Always be 2 hours early"},
	{"Lose your keys every day", "Have your phone die at 10% every day"},
	{"Fight 100 duck-sized horses", "Fight 1 horse-sized duck"},
	{"Travel the world with no money", "Stay home with unlimited money"},
	{"Live in a world without pain", "Live in a world without fear"},
	{"Be able to talk to animals", "Read people's minds"},
	{"Never have to sleep", "Never have to eat"},
	{"Go to space", "Go to the deepest part of the ocean"},
	{"Be the funniest person in the room", "Be the smartest person in the room"},
	{"Know every language", "Play every instrument"},
	{"Have unlimited battery life on all devices", "Never have traffic on your commute"},
	{"Always be underdressed", "Always be overdressed"},
	{"Find true love and be poor", "Be rich and never find love"},
	{"Live in a haunted house", "Live next to a cemetery"},
	{"Give up hot showers", "Give up AC and heating"},
	{"Be invisible for a day", "Fly for a day"},

	// ── Bank expansion (added 2026-08-21) — grown well past the original 25
	// so a group that plays repeatedly doesn't cycle back through the same
	// pool every session. Each game already shuffles the ENTIRE bank into a
	// non-repeating order (see wyrInitialState's rand.Perm) — that part was
	// already correct; the actual gap was just the bank being small enough
	// that two separate sessions in the same room would very plausibly show
	// mostly the same questions. Same rule as the original set: short,
	// generic, no copyrighted names/franchises, no punctuation-heavy prose.

	// Superpowers & fantasy
	{"Have the power of teleportation", "Have the power of time travel"},
	{"Be able to breathe underwater", "Be able to survive in space"},
	{"Control fire", "Control ice"},
	{"Shrink to the size of an ant whenever you want", "Grow to the size of a building whenever you want"},
	{"Have super strength", "Have super speed"},
	{"Be able to fly but only 2 feet off the ground", "Be invisible but only when nobody's looking at you"},
	{"Have the power to heal any injury", "Have the power to never get injured at all"},
	{"Live one year as a dragon", "Live one year as a mermaid/merman"},
	{"Have a dragon as a pet", "Have a unicorn as a pet"},
	{"Be a wizard with unreliable magic", "Be a knight with unbreakable armor"},
	{"Be able to talk to plants", "Be able to talk to insects"},
	{"Control the weather", "Control people's dreams"},

	// Food & drink
	{"Only eat sweet food for the rest of your life", "Only eat savory food for the rest of your life"},
	{"Give up coffee forever", "Give up your phone's camera forever"},
	{"Never eat cheese again", "Never eat chocolate again"},
	{"Eat the same breakfast every day for a year", "Eat a random breakfast every day for a year, some of it terrible"},
	{"Have to eat something spicy with every meal", "Have to eat something cold with every meal"},
	{"Never be able to eat leftovers again", "Never be able to eat outside your own kitchen again"},
	{"Only drink through a straw for the rest of your life", "Only eat with chopsticks for the rest of your life"},
	{"Have unlimited free food but only from one restaurant", "Have unlimited free food but only one meal a day"},
	{"Lose your sense of taste for a month", "Lose your sense of smell for a month"},
	{"Always have to wait 2 hours after eating to swim", "Always have to eat dessert first"},

	// Travel & places
	{"Visit every country but never stay more than a day", "Visit only 3 countries but stay a whole year each"},
	{"Live in a big city with no yard", "Live in the countryside an hour from anything"},
	{"Never be able to fly again", "Never be able to drive again"},
	{"Get stuck in an airport for 24 hours", "Get stuck in an elevator for 2 hours"},
	{"Live somewhere with only summer", "Live somewhere with only winter"},
	{"Have to move to a new city every year", "Never be allowed to move from your current home"},
	{"Explore an abandoned space station", "Explore a sunken ancient city"},
	{"Take a trip with no plan at all", "Take a trip planned minute by minute"},
	{"Live in a treehouse", "Live in a houseboat"},
	{"Vacation somewhere with no phone signal for a week", "Vacation somewhere crowded and touristy"},

	// Money, career & everyday life
	{"Have your dream job for average pay", "Have an average job for triple the pay"},
	{"Work from home forever", "Work in an office forever"},
	{"Never have to do laundry again", "Never have to do dishes again"},
	{"Retire at 30 with a modest amount saved", "Retire at 60 wealthy"},
	{"Have a 4-day work week forever", "Have unlimited vacation days but a normal work week"},
	{"Be your own boss with less income", "Work for someone else with more income"},
	{"Always have to take the first job offer you get", "Always have to wait 6 months before accepting any job"},
	{"Win a small amount of money every week for life", "Win one huge amount of money, once"},
	{"Never have to commute again", "Never have to attend a meeting again"},
	{"Have every email answered instantly", "Have every meeting cut in half"},

	// Relationships & social
	{"Have one best friend for life", "Have a big group of casual friends"},
	{"Always know when someone is lying to you", "Always know what someone is thinking of you"},
	{"Never be able to apologize", "Never be able to accept an apology"},
	{"Meet your soulmate at 60", "Meet 5 great almost-relationships throughout life"},
	{"Have everyone remember your name but forget your face", "Have everyone remember your face but forget your name"},
	{"Be brutally honest all the time", "Be a little dishonest to keep the peace"},
	{"Have your parents choose all your friends", "Have your friends choose all your dates"},
	{"Get along great with in-laws but not siblings", "Get along great with siblings but not in-laws"},
	{"Never be able to text, only call", "Never be able to call, only text"},
	{"Have a friend group that never changes", "Have a friend group that constantly refreshes with new people"},

	// Body & physical quirks
	{"Never age past 30 physically", "Live twice as long but age normally"},
	{"Be 3 inches taller", "Be 3 inches shorter"},
	{"Always have wet socks", "Always have a piece of food stuck in your teeth"},
	{"Sneeze uncontrollably once a day", "Hiccup uncontrollably once a day"},
	{"Never feel cold again", "Never feel hot again"},
	{"Have hair that never needs cutting", "Have nails that never need cutting"},
	{"Always talk really loudly", "Always whisper"},
	{"Have an itch you can never scratch", "Have a song stuck in your head every single day"},
	{"Never need glasses/contacts again", "Never need a dentist again"},
	{"Be double-jointed everywhere", "Never get sore muscles"},

	// Time, history & knowledge
	{"Know exactly how your life ends", "Know exactly how the world ends"},
	{"Live through one week of any historical event as a witness", "Skip forward and witness one week 100 years from now"},
	{"Have all the world's knowledge but explain none of it", "Have one genius-level skill you can actually teach"},
	{"Relive your best day on repeat", "Get to redo your worst day, once, to fix it"},
	{"Time travel but only to the past", "Time travel but only to the future"},
	{"Know the exact date of every future event in your life", "Know nothing and be surprised by everything"},
	{"Live in the past for a year", "Live 50 years in the future for a year"},
	{"Forget one bad memory forever", "Keep every memory but never make new painful ones"},

	// Animals
	{"Be able to understand what your pet is thinking", "Have your pet understand everything you say"},
	{"Own a pet the size of a house", "Own a hundred tiny pets"},
	{"Turn into your favorite animal for a day", "Have your favorite animal follow you everywhere for a day"},
	{"Ride a horse everywhere instead of driving", "Ride a bicycle everywhere instead of driving"},
	{"Live in a house full of cats", "Live in a house full of dogs"},
	{"Have a pet dinosaur (small and friendly)", "Have a pet dragon (small and friendly)"},

	// Technology & internet
	{"Lose all your photos", "Lose all your saved contacts"},
	{"Have your search history made public", "Have your text messages made public"},
	{"Go a year without streaming services", "Go a year without social media"},
	{"Only be able to use one app for a month", "Only be able to browse 5 websites for a month"},
	{"Have autocorrect fix every typo perfectly", "Have autocomplete finish every sentence for you"},
	{"Live with dial-up internet speed forever", "Live with no internet at all, ever again"},
	{"Have unlimited storage but no privacy online", "Have full privacy online but very limited storage"},
	{"Be famous online but not in real life", "Be famous in real life but not online"},

	// Silly & gross
	{"Sneeze glitter", "Cry confetti"},
	{"Have spaghetti for hair", "Have grass for hair"},
	{"Burp the alphabet on command", "Wiggle your ears on command"},
	{"Smell like fresh bread all the time", "Smell like a campfire all the time"},
	{"Have to hop everywhere instead of walking", "Have to crawl everywhere instead of walking"},
	{"Speak only in questions for a week", "Speak only in whispers for a week"},
	{"Wear clown shoes every day", "Wear a full suit/formal dress every day"},
	{"Have a permanent clown honk instead of a laugh", "Have a permanent slow-motion sneeze"},

	// Deep / philosophical
	{"Know the meaning of life but keep it secret", "Never know it but be at peace with that"},
	{"Live a short, deeply meaningful life", "Live a long, comfortable, ordinary life"},
	{"Change one decision from your past", "Change nothing and trust it all led somewhere"},
	{"Be remembered by everyone after you're gone", "Be forgotten but genuinely happy while alive"},
	{"Always choose logic over emotion", "Always choose emotion over logic"},
	{"Have unlimited chances to try again at anything", "Have only one shot but total confidence every time"},
	{"Know all your flaws clearly", "Know all your strengths clearly"},
	{"Live exactly the life you have now, fully aware of it", "Live a life you don't remember choosing, but it's better"},

	// More everyday dilemmas
	{"Always get the middle seat on flights", "Always get stuck in the slowest checkout line"},
	{"Never be able to use an umbrella again", "Never be able to wear a coat again"},
	{"Have an alarm clock that's always 10 minutes fast", "Have a clock that's always 10 minutes slow"},
	{"Always have a low phone battery", "Always have a slow phone"},
	{"Never be able to skip a song", "Never be able to fast-forward a video"},
	{"Have to sing everything you want to say for a day", "Have to say everything in slow motion for a day"},
	{"Always lose the TV remote", "Always lose one sock in the laundry"},
	{"Live without air conditioning", "Live without a microwave"},
	{"Have to wake up at 5am every day", "Have to stay up until 3am every night"},
	{"Never be able to snooze your alarm", "Never be able to hit skip on ads"},
	{"Only be able to whisper when excited", "Only be able to shout when excited"},
	{"Have perfect handwriting but terrible typing speed", "Have perfect typing speed but terrible handwriting"},
	{"Always have to walk backward up stairs", "Always have to walk sideways through doorways"},
	{"Never be able to use headphones again", "Never be able to use speakers again"},
	{"Have a permanently squeaky shoe", "Have a permanently squeaky chair"},

	// ── Second bank expansion (added 2026-08-21) — grown from 140 to 600
	// total, per explicit request. Same rules as the first expansion above:
	// generic scenarios only, no copyrighted names/franchises, no real
	// sensitive topics (politics/religion/tragedy) — kept light, matching
	// the existing tone. This is a large jump specifically so a group that
	// plays this game often has a genuinely deep pool before any question
	// starts to feel repeated across sessions.

	// Sports & competition
	{"Be great at every sport but never win a championship", "Be average at every sport but win one championship"},
	{"Always be picked first for teams", "Always be team captain but picked last"},
	{"Win by luck", "Lose by a fair, close margin"},
	{"Play a sport you love but rarely win", "Play a sport you're indifferent to but always win"},
	{"Compete alone", "Compete as part of a team"},
	{"Have unstoppable focus but average skill", "Have incredible skill but easily lose focus"},
	{"Train for years for one big moment", "Get one shot with no preparation at all"},
	{"Be the underdog everyone roots for", "Be the favorite everyone expects to win"},
	{"Play through a minor injury", "Sit out and watch your team play without you"},
	{"Set a record that gets broken next year", "Set a modest record that stands forever"},
	{"Have a rival who pushes you to improve", "Have no rival and coast comfortably"},
	{"Win ugly", "Lose while playing beautifully"},
	{"Be known for sportsmanship", "Be known for raw talent"},
	{"Choke in the biggest moment once", "Never get a big moment at all"},

	// Music & sound
	{"Only listen to instrumental music forever", "Only listen to music with lyrics forever"},
	{"Be able to play any instrument instantly", "Be able to sing any song perfectly"},
	{"Have a song that plays whenever you enter a room", "Have a laugh track for your funny moments"},
	{"Attend a concert with terrible sound but front row", "Attend a concert with perfect sound but the back row"},
	{"Lose the ability to hum", "Lose the ability to whistle"},
	{"Have perfect rhythm but a bad singing voice", "Have a great singing voice but no rhythm"},
	{"Live somewhere completely silent", "Live somewhere with constant background noise"},
	{"Only be able to listen to music, never make it", "Only be able to make music, never listen to others'"},
	{"Have one song stuck in your head for a week", "Have total silence in your head, no inner voice, for a week"},
	{"Learn an instrument as an adult, slowly", "Have played one as a kid but forgotten it entirely"},
	{"Go to a music festival alone", "Go to a quiet museum with a big group"},
	{"Have every playlist auto-curated for you", "Have to build every playlist by hand"},

	// Sleep & dreams
	{"Remember every dream in vivid detail", "Never remember dreaming at all"},
	{"Need only 4 hours of sleep a night", "Need 10 hours of sleep a night"},
	{"Always fall asleep instantly", "Always wake up instantly, fully alert"},
	{"Have recurring pleasant dreams", "Have varied but forgettable dreams"},
	{"Nap every afternoon", "Sleep in every weekend"},
	{"Sleep in total darkness and silence", "Sleep with a nightlight and white noise"},
	{"Be a morning person", "Be a night owl"},
	{"Have vivid nightmares occasionally", "Have no dreams at all, ever"},
	{"Wake up naturally every day", "Need an alarm every day but always feel rested"},
	{"Sleep talk every night", "Sleepwalk once a month"},
	{"Never be able to oversleep", "Never be able to pull an all-nighter"},
	{"Fall asleep anywhere, anytime", "Only ever sleep well in your own bed"},

	// Weather & seasons
	{"Live through one very long winter", "Live through one very long summer"},
	{"Experience a thunderstorm every week", "Experience total calm weather forever"},
	{"Have four distinct seasons every year", "Have one mild season all year round"},
	{"Walk in the rain without an umbrella", "Wait out every rainstorm indoors"},
	{"Live somewhere it snows often", "Live somewhere it never snows"},
	{"Deal with extreme heat", "Deal with extreme cold"},
	{"Have a white Christmas every year", "Have a warm, sunny holiday season every year"},
	{"Watch a sunrise every day", "Watch a sunset every day"},
	{"Live through a foggy week", "Live through a windy week"},
	{"Predict the weather perfectly, always", "Be surprised by the weather, always"},

	// School & learning
	{"Redo your favorite school year", "Skip straight past your least favorite school year"},
	{"Ace every test but forget the material after", "Struggle on tests but remember everything for life"},
	{"Have unlimited time on every exam", "Have half the normal time but easier questions"},
	{"Learn everything from books", "Learn everything from hands-on experience"},
	{"Be the smartest in your class", "Be the most well-liked in your class"},
	{"Have homework every night", "Have one huge project once a semester"},
	{"Take classes only in subjects you love", "Take a well-rounded mix, including subjects you dislike"},
	{"Present in front of the whole school", "Write a long essay instead"},
	{"Have a strict but excellent teacher", "Have a relaxed but average teacher"},
	{"Graduate early", "Graduate with your original class"},
	{"Study with music playing", "Study in total silence"},
	{"Learn a new language fluently overnight", "Master a new instrument overnight"},

	// Driving & commuting
	{"Never sit in traffic again", "Never have to parallel park again"},
	{"Always get every green light", "Always find a great parking spot"},
	{"Drive a slow, reliable car forever", "Drive a fast car that breaks down often"},
	{"Take public transit everywhere", "Drive everywhere yourself"},
	{"Commute an hour with great music", "Commute 15 minutes in total silence"},
	{"Never have car trouble again", "Never get a parking ticket again"},
	{"Always be the designated driver", "Always be the passenger giving directions"},
	{"Ride a scooter everywhere", "Ride a bicycle everywhere"},
	{"Have a car that drives itself", "Have a car that never needs fuel"},
	{"Walk everywhere within a city", "Bike everywhere within a city"},

	// Shopping & fashion
	{"Only shop once a year for everything you need", "Shop for something small every single week"},
	{"Wear the same outfit style every day", "Wear a completely different style every day"},
	{"Have an unlimited clothing budget but no time to shop", "Have a small budget but all the time in the world to shop"},
	{"Always be overdressed for the occasion", "Always be underdressed for the occasion"},
	{"Only wear one color for a year", "Only wear patterns for a year"},
	{"Buy secondhand exclusively", "Buy only brand-new items"},
	{"Have a closet that organizes itself", "Have a kitchen that cleans itself"},
	{"Never be able to return an item", "Never get free shipping again"},
	{"Follow trends closely", "Never follow trends at all"},
	{"Have great shoes but a plain wardrobe", "Have a great wardrobe but plain shoes"},

	// Hygiene & self-care
	{"Shower in the morning only, forever", "Shower at night only, forever"},
	{"Never need to brush your hair again", "Never need to brush your teeth again (but stay healthy)"},
	{"Have a 10-minute morning routine", "Have a 45-minute morning routine that feels amazing"},
	{"Always smell like your favorite scent", "Always have your favorite song playing softly around you"},
	{"Take cold showers exclusively", "Take lukewarm showers exclusively"},
	{"Never get a bad haircut again", "Never have a bad skin day again"},
	{"Skip skincare entirely and still look great", "Have a long skincare routine and love it"},
	{"Get 8 hours of sleep but skip breakfast", "Get 6 hours of sleep but have a great breakfast"},

	// Chores & home life
	{"Never have to clean your bathroom again", "Never have to clean your kitchen again"},
	{"Have a self-cleaning house", "Have a house that never gets dirty in the first place"},
	{"Do all the cooking, none of the cleaning", "Do all the cleaning, none of the cooking"},
	{"Mow the lawn every week", "Shovel snow every week"},
	{"Live somewhere with a huge yard to maintain", "Live somewhere with no yard at all"},
	{"Have a roommate who's messy but fun", "Have a roommate who's tidy but boring"},
	{"Organize everything perfectly", "Live comfortably in curated chaos"},
	{"Fix things yourself, slowly", "Always call someone else to fix things, quickly"},
	{"Never run out of clean laundry", "Never run out of clean dishes"},

	// Neighbors & community
	{"Have loud neighbors who are kind", "Have quiet neighbors who are distant"},
	{"Know everyone on your street", "Know almost no one on your street"},
	{"Live in a tight-knit community", "Live somewhere completely private and anonymous"},
	{"Host gatherings often", "Attend gatherings often but never host"},
	{"Borrow tools from neighbors regularly", "Own every tool you'd ever need yourself"},
	{"Live next to a park", "Live next to a quiet forest"},
	{"Have a shared garden with neighbors", "Have your own small private garden"},

	// Cooking & baking
	{"Be a great cook but a terrible baker", "Be a great baker but a terrible cook"},
	{"Cook every meal from scratch", "Order every meal but eat healthily"},
	{"Have a signature dish everyone loves", "Be able to cook anything decently, nothing exceptionally"},
	{"Never burn food again", "Never undercook food again"},
	{"Cook for a big family every night", "Cook only for yourself every night"},
	{"Follow recipes exactly", "Improvise every recipe"},
	{"Have an unlimited spice collection", "Have an unlimited fresh produce supply"},
	{"Bake bread from scratch weekly", "Grow your own vegetables year-round"},

	// Outdoors & nature
	{"Go camping with no cell signal for a week", "Glamp with full amenities for a week"},
	{"Hike a mountain slowly over days", "Sprint a short, steep trail in one go"},
	{"Live near the beach", "Live near the mountains"},
	{"Watch wildlife from a distance", "Get close to wildlife but risk startling it"},
	{"Explore a dense forest", "Explore an open desert"},
	{"Sleep in a tent under the stars", "Sleep in a cabin with a fireplace"},
	{"Swim in a cold lake", "Swim in a warm ocean"},
	{"Go stargazing with no light pollution", "Watch a meteor shower from a rooftop in the city"},
	{"Plant a tree that outlives you", "Grow a garden that blooms every single year"},

	// Gaming & board games
	{"Only ever play one video game for life", "Play a new video game every month, never finishing any"},
	{"Be unbeatable at one board game", "Be decent at every board game"},
	{"Play games competitively", "Play games casually, just for fun"},
	{"Win by strategy", "Win by luck"},
	{"Play games solo", "Play games with a big group"},
	{"Have unlimited game time but limited games", "Have unlimited games but limited time"},
	{"Master a puzzle game", "Master a trivia game"},
	{"Play a long campaign over months", "Play short games you finish in one sitting"},

	// Movies, TV & books
	{"Watch a great movie once", "Rewatch a good movie many times"},
	{"Binge an entire series in one weekend", "Watch one episode a week for a year"},
	{"Read the book before the movie, always", "Watch the movie before the book, always"},
	{"Only watch documentaries", "Only watch fiction"},
	{"Have spoilers ruined for everything", "Never be able to discuss anything with friends who've seen it"},
	{"Watch movies in theaters exclusively", "Watch movies at home exclusively"},
	{"Read one long novel a month", "Read many short stories a month"},
	{"Love a show everyone else hates", "Hate a show everyone else loves"},
	{"Watch with subtitles always on", "Watch with subtitles always off"},

	// Public speaking & social situations
	{"Give a speech to a huge crowd", "Have a one-on-one conversation with someone intimidating"},
	{"Freeze up mid-sentence in public", "Trip and fall in public"},
	{"Be great at small talk but bad at deep talks", "Be great at deep talks but bad at small talk"},
	{"Speak first in every meeting", "Speak last in every meeting"},
	{"Be interrupted constantly", "Never get interrupted but rarely get to speak either"},
	{"Tell a joke that flops", "Laugh at a joke that wasn't funny, out loud, alone"},
	{"Be put on the spot to answer a question", "Be asked to volunteer for something"},
	{"Attend a party where you know no one", "Skip the party and stay home alone"},

	// Luck, risk & decisions
	{"Make every decision quickly", "Make every decision slowly and carefully"},
	{"Take a big risk that might pay off huge", "Play it safe and get a small guaranteed reward"},
	{"Be lucky in small everyday things", "Be lucky in one huge, rare thing"},
	{"Always know the odds before deciding", "Never know the odds and just decide anyway"},
	{"Flip a coin for tough decisions", "Agonize over every tough decision"},
	{"Regret a risk you didn't take", "Regret a risk you did take"},
	{"Have great instincts but rarely use them", "Have average instincts but always trust them"},
	{"Win a bet you shouldn't have made", "Lose a bet you were sure about"},

	// Mornings, nights & routines
	{"Start every day with exercise", "End every day with a wind-down routine"},
	{"Have a perfectly planned day", "Have a completely spontaneous day"},
	{"Wake up to sunlight naturally", "Wake up to your favorite song"},
	{"Have a consistent daily routine", "Have a different routine every day"},
	{"Get things done early in the day", "Get things done late at night"},
	{"Start your week on a high note", "End your week on a high note"},
	{"Have a slow, relaxed morning", "Have a fast, productive morning"},

	// Weekends & celebrations
	{"Spend your birthday alone, exactly how you want", "Spend your birthday with everyone you love, planned by them"},
	{"Have a big wedding", "Have a small, intimate wedding"},
	{"Celebrate every small win", "Save celebration for only the big wins"},
	{"Throw surprise parties for others", "Have a surprise party thrown for you"},
	{"Spend weekends adventuring", "Spend weekends relaxing at home"},
	{"Host the holidays every year", "Travel to someone else's home every year"},
	{"Get a gift you didn't want but was thoughtful", "Get cash instead of a gift"},

	// Honesty, privacy & secrets
	{"Know a secret you can never tell", "Never be trusted with secrets at all"},
	{"Have total privacy but few close friends", "Have no privacy but a huge support network"},
	{"Always tell the truth, even when it hurts", "Tell kind lies to protect people's feelings"},
	{"Have your diary read by one person", "Have one embarrassing photo seen by everyone"},
	{"Keep a secret that isn't yours to keep", "Accidentally reveal a secret that wasn't yours"},
	{"Be an open book to everyone", "Be a mystery to almost everyone"},

	// Fame, anonymity & achievement
	{"Be famous for something small and silly", "Be respected for something serious but unknown"},
	{"Achieve something great but get no credit", "Get credit for something you barely contributed to"},
	{"Be recognized everywhere you go", "Never be recognized anywhere, ever"},
	{"Have one viral moment", "Have a slow, steady reputation built over years"},
	{"Be an expert nobody asks for advice", "Be a novice everyone asks for advice"},
	{"Win an award you don't care about", "Miss an award you really wanted"},

	// Adventure, comfort & change
	{"Try something new every week", "Perfect the same few things over and over"},
	{"Move somewhere new every few years", "Stay rooted in one place your whole life"},
	{"Have a life full of small comforts", "Have a life full of big adventures"},
	{"Take the safe, familiar path", "Take the uncertain, exciting path"},
	{"Live spontaneously", "Live according to a long-term plan"},
	{"Change careers every decade", "Master one career for life"},
	{"Explore new hobbies constantly", "Deeply master one hobby"},

	// Body, senses & abilities
	{"Have perfect balance", "Have perfect reflexes"},
	{"Never get motion sick", "Never get seasick"},
	{"Have an amazing sense of direction", "Have an amazing memory for faces and names"},
	{"Be ambidextrous", "Have perfect posture naturally"},
	{"Run fast but tire quickly", "Run slow but never tire"},
	{"Have incredible night vision", "Have incredible hearing"},
	{"Never lose your voice", "Never lose your appetite"},
	{"Have a strong immune system but average energy", "Have tons of energy but get sick easily"},

	// Miscellaneous everyday what-ifs
	{"Have every plan go exactly as expected", "Have every plan surprise you, for better or worse"},
	{"Live in a world with no small talk", "Live in a world with only small talk"},
	{"Always find the perfect gift for others", "Always receive the perfect gift from others"},
	{"Have unlimited patience", "Have unlimited energy"},
	{"Be early to everything, always waiting", "Be on time to everything, always rushing"},
	{"Have a photographic memory for directions", "Have a photographic memory for conversations"},
	{"Never misplace anything again", "Never forget a name again"},
	{"Have one do-over a year", "Have zero do-overs but never need one"},
	{"Be great at giving advice", "Be great at taking advice"},
	{"Have a really good poker face", "Wear your heart on your sleeve"},
	{"Always find the silver lining", "Always plan for the worst case"},
	{"Be the friend who remembers every birthday", "Be the friend who always shows up when it matters most"},
	{"Have unlimited patience for children", "Have unlimited patience for difficult coworkers"},
	{"Live a life full of small joys", "Live a life with one enormous joy"},
	{"Know how to fix almost anything", "Know how to build almost anything from scratch"},
	{"Never have a bad hair day", "Never have a wardrobe malfunction"},
	{"Always get the joke immediately", "Always be the one who makes the joke"},
	{"Be the peacemaker in every argument", "Be the one who always speaks their mind in an argument"},
	{"Have a really steady hand", "Have a really steady voice"},
	{"Be able to nap anywhere for 5 minutes and feel refreshed", "Be able to focus for 5 hours straight without a break"},

	// Family & parenting
	{"Raise one very independent child", "Raise several kids who lean on each other closely"},
	{"Have a big loud family gathering every holiday", "Have a small quiet family dinner every holiday"},
	{"Pass down a family recipe", "Pass down a family heirloom"},
	{"Be the strict parent", "Be the fun parent"},
	{"Have your kids live nearby forever", "Have your kids travel the world freely"},
	{"Inherit your parents' talents", "Discover your own completely different talents"},
	{"Babysit a hyperactive toddler for a day", "Babysit a moody teenager for a day"},
	{"Have one sibling you're extremely close to", "Have many siblings you're all decently close to"},
	{"Be an only child", "Be one of many siblings"},
	{"Take over the family business", "Start something completely new on your own"},
	{"Know your family history in detail", "Discover it slowly, piece by piece, over your life"},
	{"Have a big blended family", "Have a small tight-knit family"},
	{"Host every family holiday at your place", "Always travel to someone else's place for holidays"},

	// Aging & life stages
	{"Feel young at heart forever", "Look young forever but feel your true age"},
	{"Skip your twenties entirely", "Skip your forties entirely"},
	{"Retire early and travel", "Retire late but with a fulfilling career behind you"},
	{"Have a quiet, simple old age", "Have an adventurous, busy old age"},
	{"Know your peak years while living them", "Only realize your peak years were great after they've passed"},
	{"Grow old with a big group of lifelong friends", "Grow old with one deeply loyal partner"},
	{"Pass on wisdom to many people", "Deeply mentor just one person"},
	{"Leave behind a big inheritance", "Leave behind a lasting piece of art or writing"},
	{"Have a milestone birthday every year feel special", "Skip birthday celebrations but have every ordinary day feel special"},
	{"Relive your teenage years with today's wisdom", "Fast-forward straight to your wisest years"},

	// Technology & gadgets
	{"Have a smart home that does everything for you", "Have a simple home with nothing automated"},
	{"Own one device that does everything", "Own many devices, each doing one thing perfectly"},
	{"Have a phone that never needs charging", "Have a laptop that never needs updates"},
	{"Use voice commands for everything", "Use touch and typing for everything"},
	{"Have your devices sync perfectly across everything", "Have one device you never lose or break"},
	{"Live with cutting-edge but buggy technology", "Live with older but rock-solid reliable technology"},
	{"Have a robot do your chores", "Have a robot do your errands"},
	{"Print photos to keep forever", "Keep everything digital and backed up"},
	{"Have unlimited cloud storage", "Have unlimited fast internet speed"},
	{"Video call for every conversation", "Voice call for every conversation"},
	{"Get every notification instantly", "Get a daily digest of notifications once a day"},
	{"Have a smartwatch track everything about your health", "Track nothing and just listen to your body"},

	// Environment & sustainability
	{"Live completely off the grid", "Live fully connected but eco-conscious in a city"},
	{"Grow all your own food", "Buy all your food locally from others"},
	{"Reduce waste perfectly but use more energy", "Use less energy but produce more waste"},
	{"Plant a forest over your lifetime", "Clean up a polluted river over your lifetime"},
	{"Bike everywhere to reduce your footprint", "Carpool everywhere to reduce your footprint"},
	{"Live in a tiny, efficient home", "Live in a large home powered entirely by solar"},
	{"Compost everything", "Recycle everything perfectly"},
	{"Buy only secondhand to reduce waste", "Buy less overall but sometimes new"},

	// Emotions & mindset
	{"Feel emotions intensely", "Feel emotions mildly but consistently"},
	{"Cry easily but recover quickly", "Rarely cry but take longer to process feelings"},
	{"Be an optimist who's sometimes wrong", "Be a realist who's rarely surprised"},
	{"Get excited easily about small things", "Stay calm and only get excited about big things"},
	{"Forgive quickly", "Take time to forgive but never hold a grudge once you do"},
	{"Worry about the future often", "Live entirely in the present, rarely planning ahead"},
	{"Be easily motivated but easily discouraged", "Be hard to motivate but never discouraged once started"},
	{"Feel proud of small daily wins", "Save your pride for rare, big achievements"},
	{"Be patient with others but hard on yourself", "Be patient with yourself but hard on others"},
	{"Have thick skin about criticism", "Have a soft heart that takes feedback personally but grows from it"},
	{"Know exactly how you feel, always", "Take time to figure out how you feel"},
	{"Bounce back from setbacks instantly", "Sit with setbacks fully before moving on"},

	// Memory & creativity
	{"Remember every book you've ever read", "Remember every place you've ever been"},
	{"Have endless creative ideas but poor follow-through", "Have few ideas but always finish what you start"},
	{"Draw beautifully", "Write beautifully"},
	{"Improvise creatively under pressure", "Plan creative projects carefully in advance"},
	{"Have a vivid imagination", "Have a sharp, practical memory"},
	{"Forget embarrassing memories easily", "Remember every lesson learned from embarrassing memories"},
	{"Create something once that lasts forever", "Create something new every year that fades over time"},
	{"Be inspired by nature", "Be inspired by people"},
	{"Daydream often", "Stay focused on the present moment"},

	// Teamwork, leadership & conflict
	{"Lead a team through a crisis", "Support quietly from behind the scenes during a crisis"},
	{"Resolve conflicts immediately, even if awkward", "Let conflicts cool off before addressing them"},
	{"Be the glue that holds a group together", "Be the spark that gets a group moving"},
	{"Delegate everything you can", "Do everything yourself to make sure it's right"},
	{"Take the blame to protect the team", "Give credit to the team even when it was mostly you"},
	{"Follow a great leader", "Be a leader yourself, even an average one"},
	{"Work best under pressure with a deadline", "Work best with no deadline at all"},
	{"Mediate other people's disagreements often", "Avoid getting pulled into other people's disagreements"},
	{"Build consensus slowly", "Make a fast decision and adjust later"},

	// Generosity, kindness & giving
	{"Give generously but sometimes to the wrong people", "Give carefully but sometimes miss chances to help"},
	{"Do a small kind act every day", "Do one huge generous act once a year"},
	{"Volunteer your time regularly", "Donate money regularly instead"},
	{"Help a stranger and never know the outcome", "Help a friend and see the impact firsthand"},
	{"Be known for your generosity", "Be quietly generous with nobody knowing"},
	{"Receive help gracefully", "Give help gracefully"},
	{"Pay it forward to strangers", "Take care of your closest circle deeply"},

	// Minimalism, possessions & memories
	{"Own very few things, all meaningful", "Own lots of things, mostly ordinary"},
	{"Keep every photo you've ever taken", "Keep only your favorite photo from each year"},
	{"Live in a tiny, tidy space", "Live in a big, cluttered space"},
	{"Collect physical souvenirs from every trip", "Collect only memories and photos"},
	{"Declutter constantly", "Hold onto sentimental items forever"},
	{"Own one really nice version of everything", "Own several average versions of everything"},
	{"Keep a journal of your whole life", "Keep no records and rely purely on memory"},

	// Curiosity, learning & wisdom
	{"Know a lot about a little", "Know a little about a lot"},
	{"Have street smarts", "Have book smarts"},
	{"Learn by trial and error", "Learn by careful research first"},
	{"Ask questions constantly", "Figure things out quietly on your own"},
	{"Be endlessly curious but scattered", "Be narrowly focused but deeply expert"},
	{"Read the news every day", "Stay unaware of the news but well-informed on your own interests"},
	{"Have wisdom beyond your years", "Have the energy and optimism of someone younger"},

	// Habits, discipline & routine
	{"Have strong willpower but a rigid schedule", "Have weak willpower but total flexibility"},
	{"Build one great habit slowly", "Try many habits quickly, keeping few"},
	{"Have structure and rules", "Have freedom and spontaneity"},
	{"Delay gratification for a bigger reward later", "Enjoy small rewards along the way"},
	{"Exercise every morning without fail", "Exercise whenever inspiration strikes"},
	{"Follow a strict diet you know works", "Eat intuitively and adjust as you go"},
	{"Plan every day in detail", "Wing every day as it comes"},
	{"Break one bad habit for good", "Build one great new habit from scratch"},

	// Personality & social style
	{"Be an introvert who recharges alone", "Be an extrovert who recharges around people"},
	{"Be the listener in every conversation", "Be the talker in every conversation"},
	{"Have a small circle of very close friends", "Have a wide circle of casual friends"},
	{"Be spontaneous and impulsive", "Be careful and deliberate"},
	{"Be the planner of every group outing", "Be the one who just shows up and goes with the flow"},
	{"Be seen as mysterious", "Be seen as an open book"},
	{"Be the funny one in the group", "Be the wise one in the group"},
	{"Prefer deep one-on-one conversations", "Prefer lively group conversations"},
	{"Be comfortable with silence", "Fill every silence with conversation"},

	// Drinks & cafe habits
	{"Drink coffee every morning", "Drink tea every morning"},
	{"Make your own coffee at home", "Always buy coffee from a cafe"},
	{"Drink your beverages hot", "Drink your beverages iced"},
	{"Have one go-to drink order forever", "Try a different drink every single time"},
	{"Work well fueled by caffeine", "Work well with no caffeine at all"},
	{"Have a fully stocked home bar of drinks", "Never keep any drinks at home, always go out"},

	// Waiting, deadlines & time
	{"Finish everything early, then relax", "Finish everything right at the deadline, under pressure"},
	{"Wait in a short line that moves slowly", "Wait in a long line that moves quickly"},
	{"Have all the time in the world but no urgency", "Have limited time but great focus"},
	{"Be early and wait around often", "Be on time but always rushing to get there"},
	{"Multitask on several things at once", "Single-task, one thing at a time, fully focused"},
	{"Procrastinate but still deliver great work", "Start early but the work stays just average"},
	{"Have a countdown to look forward to", "Have an open-ended timeline with no deadline"},

	// Mistakes, apologies & growth
	{"Make a big mistake everyone remembers", "Make many small mistakes nobody notices"},
	{"Apologize even when you're not fully wrong", "Wait until you're certain before apologizing"},
	{"Learn from your own mistakes", "Learn from watching others' mistakes"},
	{"Get a second chance after a big failure", "Never fail big enough to need one"},
	{"Own up to mistakes immediately", "Take time to process before admitting fault"},
	{"Be forgiven quickly by others", "Take time to forgive yourself"},

	// Thrill, safety & spontaneity
	{"Go skydiving once", "Go deep-sea diving once"},
	{"Ride the tallest roller coaster you can find", "Ride a gentle scenic railway instead"},
	{"Take a spontaneous road trip with no plan", "Take a carefully mapped-out trip with reservations"},
	{"Seek thrills often", "Seek comfort often"},
	{"Try a new extreme sport", "Perfect a sport you already know"},
	{"Live near constant excitement", "Live somewhere calm and predictable"},
	{"Say yes to every spontaneous invite", "Only say yes to plans made well in advance"},

	// Career paths & work style
	{"Be a specialist known for one thing", "Be a generalist good at many things"},
	{"Build something from scratch as a founder", "Join a great team as an early employee"},
	{"Have creative freedom but less stability", "Have stability but less creative freedom"},
	{"Work with your hands", "Work with your mind"},
	{"Have a mentor guiding your career", "Figure your career out entirely on your own"},
	{"Take a pay cut for meaningful work", "Take a higher salary for less meaningful work"},
	{"Change your career path once, dramatically", "Stay in one field but grow deeply within it"},
	{"Work alone most days", "Collaborate with others most days"},
	{"Get feedback constantly", "Get feedback rarely but thoroughly"},

	// Reading, writing & self-expression
	{"Write a journal nobody will ever read", "Write a public blog everyone can read"},
	{"Read audiobooks", "Read physical books"},
	{"Write poetry", "Write short stories"},
	{"Express yourself through art", "Express yourself through words"},
	{"Keep your best ideas to yourself", "Share your ideas openly, even unfinished"},
	{"Have one book that changed your life", "Have many books that each shaped you a little"},

	// Nostalgia & looking forward
	{"Look back fondly on the past", "Look forward eagerly to the future"},
	{"Keep in touch with childhood friends", "Make close new friends at every life stage"},
	{"Revisit your hometown often", "Explore new places instead of revisiting old ones"},
	{"Hold onto old traditions", "Create brand new traditions of your own"},
	{"Remember exactly how things used to be", "Embrace how things are now, without comparing"},

	// Meals, cuisine & dining
	{"Eat a big breakfast and small dinner", "Eat a small breakfast and big dinner"},
	{"Try a new cuisine every month", "Perfect your favorite cuisine for life"},
	{"Cook a whole meal from one recipe book", "Combine recipes from many different sources"},
	{"Eat street food from a local stall", "Eat a tasting menu at a fancy restaurant"},
	{"Have a big Sunday family meal every week", "Have quick, casual meals every day"},
	{"Snack throughout the day", "Eat three solid meals a day"},
	{"Grill everything", "Bake everything"},
	{"Have a pantry stocked for any recipe", "Shop fresh for every single meal"},
	{"Share plates family-style", "Order your own individual dish always"},

	// Holidays & traditions
	{"Celebrate every holiday elaborately", "Skip most holidays but do one big celebration a year"},
	{"Travel during the holidays", "Stay home during the holidays"},
	{"Host a big holiday feast", "Attend someone else's holiday feast as a guest"},
	{"Decorate your home for every season", "Keep your home the same all year round"},
	{"Give handmade gifts", "Give store-bought gifts"},
	{"Start new traditions with your own family", "Continue traditions passed down from your parents"},
	{"Countdown to a big holiday all year", "Let holidays sneak up on you and enjoy the surprise"},

	// Home, decor & renovation
	{"Renovate your home yourself, slowly", "Hire professionals and get it done fast"},
	{"Live somewhere modern and minimal", "Live somewhere cozy and cluttered with character"},
	{"Redecorate your space every year", "Keep the same decor for decades"},
	{"Have a home office", "Have a home gym"},
	{"Have big windows and lots of natural light", "Have a cozy, dim, cave-like space"},
	{"Live in an open floor plan", "Live in a home with lots of separate rooms"},
	{"Have a statement piece of furniture", "Have everything match perfectly"},

	// Packing, moving & logistics
	{"Pack light and buy what you need there", "Pack heavy and have everything ready"},
	{"Move to a new home every few years", "Renovate the same home instead of moving"},
	{"Ship your belongings ahead of you", "Carry everything with you personally"},
	{"Unpack everything the day you arrive", "Live out of boxes for a while after moving"},
	{"Plan your route in detail before a trip", "Figure out the route as you go"},
	{"Travel with a big group", "Travel with just one close companion"},

	// Games nights & social hobbies
	{"Host trivia night regularly", "Host karaoke night regularly"},
	{"Have a weekly board game night", "Have a weekly movie night"},
	{"Learn to dance well", "Learn to sing well"},
	{"Join a local sports league", "Join a local book club"},
	{"Host game nights at your place", "Always be a guest at someone else's game night"},
	{"Be great at party games", "Be great at strategy games"},
	{"Play games to win", "Play games just to laugh and have fun"},

	// Work culture & communication
	{"Have short, frequent meetings", "Have long, infrequent meetings"},
	{"Communicate mostly by email", "Communicate mostly by instant message"},
	{"Have a boss who checks in constantly", "Have a boss who's hands-off completely"},
	{"Work in an open office", "Work in a private office"},
	{"Have coworkers who become close friends", "Keep work and personal life fully separate"},
	{"Get quick feedback on everything you do", "Get a thorough review once a year"},
	{"Take on more responsibility for more pay", "Keep your role simple for a comfortable pay"},
	{"Work best early in the day", "Work best late in the day"},

	// Video games & puzzles
	{"Master a puzzle game", "Master a strategy game"},
	{"Play cooperative games with friends", "Play competitive games against friends"},
	{"Explore an open, sprawling game world", "Complete a short, tightly designed game"},
	{"Play games for the story", "Play games for the challenge"},
	{"Speedrun a game you know well", "Explore every corner of a game slowly"},
	{"Play games on a big screen", "Play games on a handheld device"},

	// Romance & partnership (light-hearted)
	{"Have a partner who's your total opposite", "Have a partner who's just like you"},
	{"Plan the perfect date night", "Have a spontaneous, unplanned date"},
	{"Write love letters", "Send funny memes to show you care"},
	{"Celebrate anniversaries big every year", "Keep it low-key but meaningful every year"},
	{"Have a partner who's your best friend first", "Have a partner who's your biggest adventure partner"},
	{"Grow together through big challenges", "Grow together through quiet, everyday moments"},

	// Exercise & fitness
	{"Do cardio every day", "Do strength training every day"},
	{"Work out at the gym", "Work out at home"},
	{"Take a group fitness class", "Work out solo with headphones in"},
	{"Train for a big physical goal", "Stay generally active with no specific goal"},
	{"Stretch every morning", "Stretch every night"},
	{"Track every workout in detail", "Just show up and move, no tracking at all"},
	{"Prefer high-intensity short workouts", "Prefer long, steady, low-intensity workouts"},

	// Inspiration, creativity & passion projects
	{"Have one big passion project you work on for years", "Have many small creative projects you finish quickly"},
	{"Get inspired by traveling", "Get inspired by staying still and observing"},
	{"Create for an audience", "Create just for yourself"},
	{"Turn your hobby into your job", "Keep your hobby purely for fun, unrelated to work"},
	{"Have a burst of creativity once in a while", "Have a small steady stream of creativity every day"},
	{"Finish every project you start", "Start many projects, finish only the best ones"},

	// More everyday what-ifs
	{"Always find a great parking spot but always hit red lights", "Always hit green lights but never find good parking"},
	{"Have a perfect handshake", "Have a perfect first impression story"},
	{"Remember everyone's birthday without reminders", "Remember everyone's favorite things without being told"},
	{"Have a really comfortable bed but a noisy room", "Have a quiet room but an uncomfortable bed"},
	{"Get the window seat but a long flight", "Get the aisle seat but a short flight"},
	{"Have unlimited snacks but only one flavor", "Have limited snacks but every flavor available"},
	{"Own a really great umbrella you always forget", "Own a mediocre umbrella you never forget"},
	{"Have a phone that never runs out of storage", "Have a phone that never runs out of battery"},
	{"Always guess the ending of a movie correctly", "Never be able to guess it and be surprised every time"},
	{"Have a really good memory for jokes", "Have a really good memory for facts"},
	{"Be great at wrapping gifts", "Be great at picking gifts"},
	{"Always know the right thing to say", "Always know the right thing to do"},
	{"Have one really loyal friend", "Have many friendly acquaintances"},
	{"Be the one who plans the group trip", "Be the one who just shows up and enjoys it"},
	{"Have a really strong handshake grip", "Have a really warm, memorable smile"},
	{"Get a compliment on your work", "Get a compliment on your character"},
	{"Have a lucky number that always seems to show up", "Have a lucky charm you carry everywhere"},
	{"Win a small prize in a raffle", "Find a small amount of money on the ground"},
	{"Have your favorite meal cooked for you", "Cook your favorite meal for someone else"},
}

func wyrInitialState(numPlayers int) map[string]interface{} {
	// Shuffle a copy of the question list so each game gets a different order.
	indices := rand.Perm(len(wyrQuestions))
	order := make([]int, len(wyrQuestions))
	copy(order, indices)

	q := wyrQuestions[order[0]]
	return map[string]interface{}{
		"phase":          "presenting",
		"question_index": 0,
		"question_order": floatSlice(order),
		"option_a":       q.A,
		"option_b":       q.B,
		"votes":          map[string]interface{}{},
		"tally_a":        0,
		"tally_b":        0,
		"round":          1,
		"total_rounds":   len(wyrQuestions),
	}
}

func (gm *GameManager) processWouldYouRatherMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureWyrState(gameState)

	phase, _ := gameState.GameData["phase"].(string)

	switch moveType {
	case "vote":
		if phase != "presenting" {
			return false, nil, fmt.Errorf("not in voting phase")
		}
		choice, _ := moveData["choice"].(string)
		if choice != "A" && choice != "B" {
			return false, nil, fmt.Errorf("choice must be A or B")
		}
		votes := wyrVotes(gameState)
		playerKey := fmt.Sprintf("%d", playerID)
		votes[playerKey] = choice
		gameState.GameData["votes"] = votes

		// Tally
		tallyA, tallyB := 0, 0
		for _, v := range votes {
			if v == "A" {
				tallyA++
			} else {
				tallyB++
			}
		}
		gameState.GameData["tally_a"] = tallyA
		gameState.GameData["tally_b"] = tallyB

		// Auto-reveal once every player has voted
		numPlayers := len(gameState.Players)
		if len(votes) >= numPlayers {
			gameState.GameData["phase"] = "reveal"
		}
		// cancel auto-advance: same player's turn (votes aren't turn-based)
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "next":
		// Only the host can advance. Host is Players[0] by convention.
		if playerID != gameState.Players[0].UserID {
			return false, nil, fmt.Errorf("only the host can advance")
		}

		order := wyrQuestionOrder(gameState)
		idx := wyrIntField(gameState.GameData["question_index"]) + 1
		if idx >= len(order) {
			// No more questions — game over (no winner, just fun).
			return true, nil, nil
		}

		qIdx := int(order[idx])
		q := wyrQuestions[qIdx]
		gameState.GameData["question_index"] = idx
		gameState.GameData["option_a"] = q.A
		gameState.GameData["option_b"] = q.B
		gameState.GameData["phase"] = "presenting"
		gameState.GameData["votes"] = map[string]interface{}{}
		gameState.GameData["tally_a"] = 0
		gameState.GameData["tally_b"] = 0
		gameState.GameData["round"] = idx + 1

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "end":
		if playerID != gameState.Players[0].UserID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		return true, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

func ensureWyrState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range wyrInitialState(len(gameState.Players)) {
			gameState.GameData[k] = v
		}
	}
}

func wyrVotes(gameState *GameSessionState) map[string]string {
	raw := gameState.GameData["votes"]
	if raw == nil {
		return map[string]string{}
	}
	if m, ok := raw.(map[string]string); ok {
		return m
	}
	// Unmarshalled from JSON as map[string]interface{}
	if m, ok := raw.(map[string]interface{}); ok {
		result := make(map[string]string, len(m))
		for k, v := range m {
			if s, ok := v.(string); ok {
				result[k] = s
			}
		}
		return result
	}
	return map[string]string{}
}

func floatSlice(ints []int) []float64 {
	out := make([]float64, len(ints))
	for i, v := range ints {
		out[i] = float64(v)
	}
	return out
}

// wyrIntField safely reads an integer value from GameData that may be stored as
// Go int (set directly in-memory) or float64 (after a JSON round-trip).
func wyrIntField(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case float64:
		return int(n)
	case int64:
		return int(n)
	}
	return 0
}

// wyrQuestionOrder extracts the shuffled question order from GameData, handling
// both the in-memory []float64 form (set directly) and the []interface{} form
// that comes back when GameData is round-tripped through JSON/DB.
func wyrQuestionOrder(gameState *GameSessionState) []float64 {
	switch v := gameState.GameData["question_order"].(type) {
	case []float64:
		return v
	case []interface{}:
		out := make([]float64, len(v))
		for i, elem := range v {
			if f, ok := elem.(float64); ok {
				out[i] = f
			}
		}
		return out
	}
	return nil
}
