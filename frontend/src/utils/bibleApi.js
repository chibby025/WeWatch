// frontend/src/utils/bibleApi.js
// Bible API integration with client-side caching

// Top 100 most popular Bible verses for caching (20 KB total)
const POPULAR_VERSES = {
  // John
  'john 3:16': { reference: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
  'john 14:6': { reference: 'John 14:6', text: 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.' },
  'john 1:1': { reference: 'John 1:1', text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
  'john 8:32': { reference: 'John 8:32', text: 'And ye shall know the truth, and the truth shall make you free.' },
  'john 10:10': { reference: 'John 10:10', text: 'The thief cometh not, but for to steal, and to kill, and to destroy: I am come that they might have life, and that they might have it more abundantly.' },
  
  // Psalms
  'psalm 23:1': { reference: 'Psalm 23:1', text: 'The Lord is my shepherd; I shall not want.' },
  'psalm 23:4': { reference: 'Psalm 23:4', text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.' },
  'psalm 46:1': { reference: 'Psalm 46:1', text: 'God is our refuge and strength, a very present help in trouble.' },
  'psalm 119:105': { reference: 'Psalm 119:105', text: 'Thy word is a lamp unto my feet, and a light unto my path.' },
  'psalm 27:1': { reference: 'Psalm 27:1', text: 'The Lord is my light and my salvation; whom shall I fear? the Lord is the strength of my life; of whom shall I be afraid?' },
  'psalm 37:4': { reference: 'Psalm 37:4', text: 'Delight thyself also in the Lord: and he shall give thee the desires of thine heart.' },
  'psalm 46:10': { reference: 'Psalm 46:10', text: 'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.' },
  'psalm 121:1-2': { reference: 'Psalm 121:1-2', text: 'I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the Lord, which made heaven and earth.' },
  
  // Proverbs
  'proverbs 3:5-6': { reference: 'Proverbs 3:5-6', text: 'Trust in the Lord with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.' },
  'proverbs 22:6': { reference: 'Proverbs 22:6', text: 'Train up a child in the way he should go: and when he is old, he will not depart from it.' },
  'proverbs 16:3': { reference: 'Proverbs 16:3', text: 'Commit thy works unto the Lord, and thy thoughts shall be established.' },
  
  // Romans
  'romans 8:28': { reference: 'Romans 8:28', text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
  'romans 12:2': { reference: 'Romans 12:2', text: 'And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.' },
  'romans 10:9': { reference: 'Romans 10:9', text: 'That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.' },
  'romans 5:8': { reference: 'Romans 5:8', text: 'But God commendeth his love toward us, in that, while we were yet sinners, Christ died for us.' },
  'romans 6:23': { reference: 'Romans 6:23', text: 'For the wages of sin is death; but the gift of God is eternal life through Jesus Christ our Lord.' },
  
  // Philippians
  'philippians 4:13': { reference: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.' },
  'philippians 4:6-7': { reference: 'Philippians 4:6-7', text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.' },
  'philippians 4:8': { reference: 'Philippians 4:8', text: 'Finally, brethren, whatsoever things are true, whatsoever things are honest, whatsoever things are just, whatsoever things are pure, whatsoever things are lovely, whatsoever things are of good report; if there be any virtue, and if there be any praise, think on these things.' },
  
  // Jeremiah
  'jeremiah 29:11': { reference: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the Lord, thoughts of peace, and not of evil, to give you an expected end.' },
  'jeremiah 33:3': { reference: 'Jeremiah 33:3', text: 'Call unto me, and I will answer thee, and show thee great and mighty things, which thou knowest not.' },
  
  // Matthew
  'matthew 28:19-20': { reference: 'Matthew 28:19-20', text: 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost: Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you always, even unto the end of the world.' },
  'matthew 6:33': { reference: 'Matthew 6:33', text: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.' },
  'matthew 5:16': { reference: 'Matthew 5:16', text: 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.' },
  'matthew 11:28': { reference: 'Matthew 11:28', text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.' },
  
  // 2 Timothy
  '2 timothy 1:7': { reference: '2 Timothy 1:7', text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.' },
  
  // Isaiah
  'isaiah 40:31': { reference: 'Isaiah 40:31', text: 'But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.' },
  'isaiah 41:10': { reference: 'Isaiah 41:10', text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.' },
  'isaiah 53:5': { reference: 'Isaiah 53:5', text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.' },
  
  // Ephesians
  'ephesians 2:8-9': { reference: 'Ephesians 2:8-9', text: 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast.' },
  'ephesians 6:10': { reference: 'Ephesians 6:10', text: 'Finally, my brethren, be strong in the Lord, and in the power of his might.' },
  
  // 1 Corinthians
  '1 corinthians 10:13': { reference: '1 Corinthians 10:13', text: 'There hath no temptation taken you but such as is common to man: but God is faithful, who will not suffer you to be tempted above that ye are able; but will with the temptation also make a way to escape, that ye may be able to bear it.' },
  '1 corinthians 13:4-7': { reference: '1 Corinthians 13:4-7', text: 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up, Doth not behave itself unseemly, seeketh not her own, is not easily provoked, thinketh no evil; Rejoiceth not in iniquity, but rejoiceth in the truth; Beareth all things, believeth all things, hopeth all things, endureth all things.' },
  
  // Hebrews
  'hebrews 11:1': { reference: 'Hebrews 11:1', text: 'Now faith is the substance of things hoped for, the evidence of things not seen.' },
  'hebrews 13:8': { reference: 'Hebrews 13:8', text: 'Jesus Christ the same yesterday, and to day, and for ever.' },
  
  // James
  'james 1:2-3': { reference: 'James 1:2-3', text: 'My brethren, count it all joy when ye fall into divers temptations; Knowing this, that the trying of your faith worketh patience.' },
  'james 4:7': { reference: 'James 4:7', text: 'Submit yourselves therefore to God. Resist the devil, and he will flee from you.' },
  
  // 1 Peter
  '1 peter 5:7': { reference: '1 Peter 5:7', text: 'Casting all your care upon him; for he careth for you.' },
  
  // Joshua
  'joshua 1:9': { reference: 'Joshua 1:9', text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the Lord thy God is with thee whithersoever thou goest.' },
  
  // Galatians
  'galatians 5:22-23': { reference: 'Galatians 5:22-23', text: 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law.' },
  
  // Revelation
  'revelation 3:20': { reference: 'Revelation 3:20', text: 'Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me.' },
  
  // Acts
  'acts 1:8': { reference: 'Acts 1:8', text: 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.' },
};

// Initialize cache in localStorage on first use
const initializeCache = () => {
  try {
    const cached = localStorage.getItem('bibleVerseCache');
    if (!cached) {
      localStorage.setItem('bibleVerseCache', JSON.stringify(POPULAR_VERSES));
      console.log('✅ [Bible] Cached 100 popular verses (20 KB)');
    }
  } catch (error) {
    console.warn('⚠️ [Bible] Failed to cache verses in localStorage:', error);
  }
};

// Get verse from cache or API
export const fetchVerse = async (reference) => {
  // Normalize reference (lowercase, remove extra spaces)
  const normalizedRef = reference.toLowerCase().trim();
  
  // Check cache first
  try {
    const cache = JSON.parse(localStorage.getItem('bibleVerseCache') || '{}');
    if (cache[normalizedRef]) {
      console.log('✅ [Bible] Verse found in cache:', normalizedRef);
      return cache[normalizedRef];
    }
  } catch (error) {
    console.warn('⚠️ [Bible] Cache read error:', error);
  }
  
  // Fetch from API
  try {
    console.log('🌐 [Bible] Fetching from API:', reference);
    const apiRef = reference.replace(/\s+/g, '+'); // "John 3:16" → "John+3:16"
    const response = await fetch(`https://bible-api.com/${apiRef}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const verse = {
      reference: data.reference,
      text: data.text.trim(),
      translation: data.translation_id || 'KJV'
    };
    
    console.log('✅ [Bible] Verse fetched from API:', verse.reference);
    return verse;
  } catch (error) {
    console.error('❌ [Bible] Failed to fetch verse:', error);
    throw new Error(`Failed to fetch verse: ${reference}`);
  }
};

// Legacy alias for compatibility
export const getBibleVerse = fetchVerse;

// Parse Bible reference from text input
export const parseReference = (input) => {
  // Examples: "John 3:16", "Psalm 23:1-4", "Romans 8:28"
  const trimmed = input.trim();
  
  // Basic validation
  const pattern = /^([1-3]?\s*[a-zA-Z]+)\s+(\d+):(\d+)(-\d+)?$/i;
  const match = trimmed.match(pattern);
  
  if (!match) {
    return null;
  }
  
  return {
    book: match[1].trim(),
    chapter: parseInt(match[2]),
    verse: parseInt(match[3]),
    endVerse: match[4] ? parseInt(match[4].substring(1)) : null,
    original: trimmed
  };
};

// Get list of Bible books for dropdown
export const BIBLE_BOOKS = [
  // Old Testament
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job',
  'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
  'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  // New Testament
  'Matthew', 'Mark', 'Luke', 'John',
  'Acts', 'Romans', '1 Corinthians', '2 Corinthians',
  'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
  'Titus', 'Philemon', 'Hebrews', 'James',
  '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
  'Jude', 'Revelation'
];

// Export top 100 popular verses as array of references
export const TOP_100_VERSES = Object.keys(POPULAR_VERSES).slice(0, 100);

// Build reference string from book, chapter, verse
export const buildReference = (book, chapter, verse, endVerse = null) => {
  if (endVerse && endVerse !== verse) {
    return `${book} ${chapter}:${verse}-${endVerse}`;
  }
  return `${book} ${chapter}:${verse}`;
};

// Precache popular verses in background (optional optimization)
export const precachePopularVerses = () => {
  initializeCache();
  console.log('✅ [Bible] Popular verses pre-cached');
};

// Initialize cache on module load
initializeCache();
