// frontend/src/components/liveshare/HymnsControl.jsx
// Studio control for displaying hymn lyrics during church broadcasts

import { useState, useEffect } from 'react';
import { Music, Search, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { searchHymns, getHymnDetails, POPULAR_HYMNS, getFallbackHymn } from '../../utils/hymnsApi';

export default function HymnsControl({ onShowHymn, onHideHymn, currentHymn, currentVerse = 1 }) {
  const [isOpen, setIsOpen] = useState(true); // ✅ Auto-open when mounted
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedHymn, setSelectedHymn] = useState(null);
  const [localVerse, setLocalVerse] = useState(currentVerse);

  // Styling options
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [titleColor, setTitleColor] = useState('#FFFFFF');
  const [textSize, setTextSize] = useState(32);
  const [textWeight, setTextWeight] = useState(400);
  const [textCase, setTextCase] = useState('none');
  const [backgroundColor, setBackgroundColor] = useState('rgba(0, 0, 0, 0.95)');

  // Sync local verse with parent
  useEffect(() => {
    setLocalVerse(currentVerse);
  }, [currentVerse]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const results = await searchHymns(searchQuery);
      setSearchResults(results);
      
      if (results.length === 0) {
        setError('No hymns found. Try a different search term.');
      }
    } catch (err) {
      setError(err.message);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = async (hymn) => {
    setLoading(true);
    setError(null);

    try {
      // Try API first
      const details = await getHymnDetails(hymn.id);
      setSelectedHymn(details);
    } catch (err) {
      // Fallback to offline data
      const fallback = getFallbackHymn(hymn.id);
      if (fallback) {
        setSelectedHymn(fallback);
      } else {
        setError('Failed to load hymn. Please try searching instead.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFromSearch = async (result) => {
    setLoading(true);
    setError(null);

    try {
      const details = await getHymnDetails(result.id);
      setSelectedHymn(details);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleShowHymn = () => {
    if (!selectedHymn) return;

    onShowHymn({
      ...selectedHymn,
      currentVerse: localVerse,
      textStyle: {
        color: textColor,
        titleColor: titleColor,
        size: textSize,
        weight: textWeight,
        case: textCase,
      },
      backgroundColor,
    });

    setIsOpen(false);
  };

  const handleNextVerse = () => {
    if (!currentHymn || !currentHymn.verses) return;
    
    const nextVerse = currentVerse < currentHymn.verses.length ? currentVerse + 1 : 1;
    setLocalVerse(nextVerse);
    
    // Update displayed hymn with new verse
    onShowHymn({
      ...currentHymn,
      currentVerse: nextVerse,
    });
  };

  const handlePrevVerse = () => {
    if (!currentHymn || !currentHymn.verses) return;
    
    const prevVerse = currentVerse > 1 ? currentVerse - 1 : currentHymn.verses.length;
    setLocalVerse(prevVerse);
    
    // Update displayed hymn with new verse
    onShowHymn({
      ...currentHymn,
      currentVerse: prevVerse,
    });
  };

  // Color presets
  const colorPresets = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Gold', value: '#FFD700' },
    { name: 'Cyan', value: '#00FFFF' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Pink', value: '#FF69B4' },
  ];

  return (
    <>
      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => {
          onHideHymn();
          setIsOpen(false);
        }}>
          <div className="w-full max-w-2xl bg-gray-800 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Music size={18} className="text-blue-400" />
                <h3 className="text-white font-medium text-sm">Hymn Lyrics</h3>
                {currentHymn && (
                  <span className="text-green-400 text-xs">● Active</span>
                )}
              </div>
              <button
                onClick={() => {
                  onHideHymn();
                  setIsOpen(false);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
          {/* Quick Access - Popular Hymns */}
          <div>
            <p className="text-gray-400 text-xs mb-2">Popular Hymns (Quick Access)</p>
            <div className="grid grid-cols-2 gap-2">
              {POPULAR_HYMNS.slice(0, 6).map((hymn) => (
                <button
                  key={hymn.id}
                  onClick={() => handleQuickSelect(hymn)}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors text-left"
                >
                  {hymn.title}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div>
            <p className="text-gray-400 text-xs mb-2">Search Hymns</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by title or number..."
                className="flex-1 px-3 py-2 bg-gray-700 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto custom-sleek-scrollbar">
              <p className="text-gray-400 text-xs mb-2">Results ({searchResults.length})</p>
              <div className="space-y-1">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelectFromSearch(result)}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors text-left"
                  >
                    {result.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          {/* Selected Hymn Preview */}
          {selectedHymn && (
            <div className="bg-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium text-sm">{selectedHymn.title}</p>
                  {selectedHymn.author && (
                    <p className="text-gray-400 text-xs">by {selectedHymn.author}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedHymn(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-gray-400 text-xs">
                {selectedHymn.verses?.length || 0} verses
              </p>
            </div>
          )}

          {/* Styling Options */}
          {selectedHymn && (
            <details className="bg-gray-700/50 rounded-lg">
              <summary className="px-3 py-2 cursor-pointer text-sm text-white hover:bg-gray-700 transition-colors rounded-lg">
                Customize Display
              </summary>
              <div className="px-3 pb-3 pt-2 space-y-3">
                {/* Text Color */}
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Text Color</label>
                  <div className="flex gap-2">
                    {colorPresets.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => setTextColor(preset.value)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          textColor === preset.value ? 'border-white scale-110' : 'border-gray-600'
                        }`}
                        style={{ backgroundColor: preset.value }}
                        title={preset.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Text Size */}
                <div>
                  <label className="text-gray-400 text-xs block mb-1">
                    Text Size: {textSize}px
                  </label>
                  <input
                    type="range"
                    min="24"
                    max="48"
                    value={textSize}
                    onChange={(e) => setTextSize(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </details>
          )}

          {/* Show Hymn Button */}
          {selectedHymn && (
            <button
              onClick={handleShowHymn}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Show on Screen
            </button>
          )}

          {/* Active Hymn Controls */}
          {currentHymn && currentHymn.verses && (
            <div className="bg-gray-700 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-white font-medium text-sm">Now Showing</p>
                <button
                  onClick={onHideHymn}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors"
                >
                  Hide
                </button>
              </div>
              
              <p className="text-gray-300 text-sm">{currentHymn.title}</p>
              
              {/* Verse Navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevVerse}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <div className="flex-1 text-center">
                  <p className="text-white font-medium">
                    Verse {currentVerse} / {currentHymn.verses.length}
                  </p>
                </div>
                
                <button
                  onClick={handleNextVerse}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
          </div>
          </div>
        </div>
      )}
    </>
  );
}
