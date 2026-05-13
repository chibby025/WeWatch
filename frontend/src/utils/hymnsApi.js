// frontend/src/utils/hymnsApi.js
// Hymnary.org API integration for Church Mode (via backend proxy)

// Use backend proxy to bypass CORS restrictions
// TODO: Replace with your actual Railway backend URL (e.g., letswatchout.up.railway.app)
const HYMN_PROXY_BASE = import.meta.env.PROD 
  ? 'https://YOUR_RAILWAY_DOMAIN/api/hymns' // ⚠️ UPDATE THIS with your Railway domain
  : 'http://localhost:8080/api/hymns'; // Local development

/**
 * Search for hymns by title, number, or text
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Array of hymn results
 */
export async function searchHymns(query) {
  if (!query || query.trim().length < 2) {
    throw new Error('Query must be at least 2 characters');
  }

  try {
    const response = await fetch(
      `${HYMN_PROXY_BASE}/search?query=${encodeURIComponent(query)}`
    );
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.warn('[HymnsAPI] API unavailable, searching offline hymns:', error.message);
    
    // Fallback: Search in offline popular hymns
    const lowerQuery = query.toLowerCase();
    const matches = POPULAR_HYMNS.filter(hymn => 
      hymn.title.toLowerCase().includes(lowerQuery)
    );
    
    if (matches.length > 0) {
      return matches;
    }
    
    throw new Error('Hymn API unavailable. Try popular hymns below or check internet connection.');
  }
}

/**
 * Get detailed hymn information including all verses
 * @param {string} hymnId - Hymn ID from search results
 * @returns {Promise<Object>} - Detailed hymn data
 */
export async function getHymnDetails(hymnId) {
  if (!hymnId) {
    throw new Error('Hymn ID is required');
  }

  try {
    const response = await fetch(
      `${HYMN_PROXY_BASE}/${hymnId}`
    );
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return parseHymnData(data);
  } catch (error) {
    console.warn('[HymnsAPI] API unavailable, checking offline hymns:', error.message);
    
    // Try fallback data
    const fallback = getFallbackHymn(hymnId);
    if (fallback) {
      return fallback;
    }
    
    throw new Error('Hymn API unavailable and no offline version found. Try another hymn.');
  }
}

/**
 * Parse hymn data into display format
 */
function parseHymnData(rawData) {
  return {
    id: rawData.id,
    title: rawData.title || 'Unknown Hymn',
    author: rawData.author || 'Unknown',
    tune: rawData.tune || null,
    lyrics: rawData.text || '',
    verses: splitIntoVerses(rawData.text || ''),
    copyright: rawData.copyright || 'Public Domain',
    year: rawData.year || null,
  };
}

/**
 * Split hymn text into verses
 */
function splitIntoVerses(text) {
  if (!text) return [];
  
  // Split by common verse separators
  const verses = text
    .split(/\n\n+|Verse \d+:|Chorus:|Refrain:/gi)
    .map(v => v.trim())
    .filter(v => v.length > 0);
  
  return verses.map((verse, index) => ({
    number: index + 1,
    text: verse,
    type: verse.toLowerCase().includes('chorus') ? 'chorus' : 'verse'
  }));
}

/**
 * Popular hymns for quick access (offline fallback)
 */
export const POPULAR_HYMNS = [
  { title: 'Amazing Grace', id: 'amazing_grace' },
  { title: 'How Great Thou Art', id: 'how_great_thou_art' },
  { title: 'Holy, Holy, Holy', id: 'holy_holy_holy' },
  { title: 'Great Is Thy Faithfulness', id: 'great_is_thy_faithfulness' },
  { title: 'It Is Well With My Soul', id: 'it_is_well' },
  { title: 'Just As I Am', id: 'just_as_i_am' },
  { title: 'Rock of Ages', id: 'rock_of_ages' },
  { title: 'Be Thou My Vision', id: 'be_thou_my_vision' },
  { title: 'A Mighty Fortress', id: 'mighty_fortress' },
  { title: 'All Hail the Power', id: 'all_hail_the_power' },
  { title: 'What a Friend We Have in Jesus', id: 'what_a_friend_in_jesus' },
  { title: 'Jesus Loves Me', id: 'jesus_loves_me' },
  { title: 'I Surrender All', id: 'i_surrender_all' },
  { title: 'Blessed Assurance', id: 'blessed_assurance' },
  { title: 'In Christ Alone', id: 'in_christ_alone' },
  { title: 'How Deep the Father\'s Love', id: 'how_deep_fathers_love' },
  { title: 'And Can It Be', id: 'and_can_it_be' },
  { title: 'Crown Him with Many Crowns', id: 'crown_him' },
  { title: 'O Come All Ye Faithful', id: 'o_come_faithful' },
  { title: 'Come Thou Fount', id: 'come_thou_fount' },
];

/**
 * Fallback hymns data (offline support)
 */
export const FALLBACK_HYMNS = {
  'amazing_grace': {
    id: 'amazing_grace',
    title: 'Amazing Grace',
    author: 'John Newton',
    copyright: 'Public Domain',
    verses: [
      {
        number: 1,
        type: 'verse',
        text: 'Amazing grace, how sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found,\nWas blind, but now I see.'
      },
      {
        number: 2,
        type: 'verse',
        text: '\'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!'
      },
      {
        number: 3,
        type: 'verse',
        text: 'Through many dangers, toils and snares,\nI have already come;\n\'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.'
      },
      {
        number: 4,
        type: 'verse',
        text: 'When we\'ve been there ten thousand years,\nBright shining as the sun,\nWe\'ve no less days to sing God\'s praise\nThan when we first begun.'
      }
    ]
  },
  'what_a_friend_in_jesus': {
    id: 'what_a_friend_in_jesus',
    title: 'What a Friend We Have in Jesus',
    author: 'Joseph M. Scriven',
    copyright: 'Public Domain',
    verses: [
      {
        number: 1,
        type: 'verse',
        text: 'What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!\nO what peace we often forfeit,\nO what needless pain we bear,\nAll because we do not carry\nEverything to God in prayer.'
      },
      {
        number: 2,
        type: 'verse',
        text: 'Have we trials and temptations?\nIs there trouble anywhere?\nWe should never be discouraged;\nTake it to the Lord in prayer.\nCan we find a friend so faithful\nWho will all our sorrows share?\nJesus knows our every weakness;\nTake it to the Lord in prayer.'
      },
      {
        number: 3,
        type: 'verse',
        text: 'Are we weak and heavy laden,\nCumbered with a load of care?\nPrecious Savior, still our refuge,\nTake it to the Lord in prayer.\nDo your friends despise, forsake you?\nTake it to the Lord in prayer!\nIn His arms He\'ll take and shield you;\nYou will find a solace there.'
      }
    ]
  },
  'jesus_loves_me': {
    id: 'jesus_loves_me',
    title: 'Jesus Loves Me',
    author: 'Anna B. Warner',
    copyright: 'Public Domain',
    verses: [
      {
        number: 1,
        type: 'verse',
        text: 'Jesus loves me! This I know,\nFor the Bible tells me so.\nLittle ones to Him belong;\nThey are weak, but He is strong.'
      },
      {
        number: 1,
        type: 'chorus',
        text: 'Yes, Jesus loves me!\nYes, Jesus loves me!\nYes, Jesus loves me!\nThe Bible tells me so.'
      },
      {
        number: 2,
        type: 'verse',
        text: 'Jesus loves me! He who died\nHeaven\'s gate to open wide.\nHe will wash away my sin,\nLet His little child come in.'
      },
      {
        number: 3,
        type: 'verse',
        text: 'Jesus loves me! He will stay\nClose beside me all the way.\nIf I love Him, when I die\nHe will take me home on high.'
      }
    ]
  },
  'it_is_well': {
    id: 'it_is_well',
    title: 'It Is Well With My Soul',
    author: 'Horatio G. Spafford',
    copyright: 'Public Domain',
    verses: [
      {
        number: 1,
        type: 'verse',
        text: 'When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.'
      },
      {
        number: 1,
        type: 'chorus',
        text: 'It is well with my soul,\nIt is well, it is well with my soul.'
      },
      {
        number: 2,
        type: 'verse',
        text: 'Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ hath regarded my helpless estate,\nAnd hath shed His own blood for my soul.'
      },
      {
        number: 3,
        type: 'verse',
        text: 'My sin—oh, the bliss of this glorious thought!—\nMy sin, not in part but the whole,\nIs nailed to the cross, and I bear it no more,\nPraise the Lord, praise the Lord, O my soul!'
      },
      {
        number: 4,
        type: 'verse',
        text: 'And Lord, haste the day when the faith shall be sight,\nThe clouds be rolled back as a scroll;\nThe trump shall resound, and the Lord shall descend,\nEven so, it is well with my soul.'
      }
    ]
  },
  'how_great_thou_art': {
    id: 'how_great_thou_art',
    title: 'How Great Thou Art',
    author: 'Carl Boberg',
    copyright: 'Public Domain',
    verses: [
      {
        number: 1,
        type: 'verse',
        text: 'O Lord my God, when I in awesome wonder\nConsider all the worlds Thy hands have made,\nI see the stars, I hear the rolling thunder,\nThy power throughout the universe displayed.'
      },
      {
        number: 1,
        type: 'chorus',
        text: 'Then sings my soul, my Savior God, to Thee,\nHow great Thou art! How great Thou art!\nThen sings my soul, my Savior God, to Thee,\nHow great Thou art! How great Thou art!'
      },
      {
        number: 2,
        type: 'verse',
        text: 'When through the woods and forest glades I wander\nAnd hear the birds sing sweetly in the trees,\nWhen I look down from lofty mountain grandeur\nAnd hear the brook and feel the gentle breeze.'
      },
      {
        number: 3,
        type: 'verse',
        text: 'And when I think that God, His Son not sparing,\nSent Him to die, I scarce can take it in,\nThat on the cross, my burden gladly bearing,\nHe bled and died to take away my sin.'
      },
      {
        number: 4,
        type: 'verse',
        text: 'When Christ shall come with shout of acclamation\nAnd take me home, what joy shall fill my heart!\nThen I shall bow in humble adoration\nAnd there proclaim, my God, how great Thou art!'
      }
    ]
  },
  'blessed_assurance': {
    id: 'blessed_assurance',
    title: 'Blessed Assurance',
    author: 'Fanny Crosby',
    copyright: 'Public Domain',
    verses: [
      {
        number: 1,
        type: 'verse',
        text: 'Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.'
      },
      {
        number: 1,
        type: 'chorus',
        text: 'This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.'
      },
      {
        number: 2,
        type: 'verse',
        text: 'Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels descending bring from above\nEchoes of mercy, whispers of love.'
      },
      {
        number: 3,
        type: 'verse',
        text: 'Perfect submission, all is at rest,\nI in my Savior am happy and blest,\nWatching and waiting, looking above,\nFilled with His goodness, lost in His love.'
      }
    ]
  }
};

/**
 * Get fallback hymn if API fails
 */
export function getFallbackHymn(hymnId) {
  return FALLBACK_HYMNS[hymnId] || null;
}
