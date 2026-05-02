// frontend/src/components/liveshare/BibleControl.jsx
// Studio control for displaying Bible verses during church broadcasts

import { useState, useEffect } from 'react';
import { BookOpen, Search, X, Loader2 } from 'lucide-react';
import { fetchVerse, BIBLE_BOOKS, TOP_100_VERSES, parseReference, buildReference } from '../../utils/bibleApi';

export default function BibleControl({ onShowVerse, onHideVerse, currentVerse }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBook, setSelectedBook] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedVerse, setSelectedVerse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [versePreview, setVersePreview] = useState(null);

  // Styling options
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textSize, setTextSize] = useState(32);
  const [textWeight, setTextWeight] = useState(700);
  const [textCase, setTextCase] = useState('none');
  const [backgroundColor, setBackgroundColor] = useState('rgba(0, 0, 0, 0.95)');

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const verse = await fetchVerse(searchQuery);
      setVersePreview(verse);
    } catch (err) {
      setError(err.message);
      setVersePreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDropdownSearch = async () => {
    if (!selectedBook || !selectedChapter || !selectedVerse) {
      setError('Please select book, chapter, and verse');
      return;
    }

    const reference = buildReference(selectedBook, selectedChapter, selectedVerse);
    setSearchQuery(reference);
    setLoading(true);
    setError(null);

    try {
      const verse = await fetchVerse(reference);
      setVersePreview(verse);
    } catch (err) {
      setError(err.message);
      setVersePreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleShowVerse = () => {
    if (!versePreview) return;

    onShowVerse({
      ...versePreview,
      textStyle: {
        color: textColor,
        size: textSize,
        weight: textWeight,
        case: textCase,
      },
      backgroundColor,
    });

    // Close control
    setIsOpen(false);
  };

  const handleQuickVerse = async (ref) => {
    setSearchQuery(ref);
    setLoading(true);
    setError(null);

    try {
      const verse = await fetchVerse(ref);
      setVersePreview(verse);
    } catch (err) {
      setError(err.message);
      setVersePreview(null);
    } finally {
      setLoading(false);
    }
  };

  // Color presets
  const colorPresets = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Yellow', value: '#FBBF24' },
    { name: 'Gold', value: '#D4AF37' },
    { name: 'Blue', value: '#60A5FA' },
    { name: 'Green', value: '#34D399' },
    { name: 'Silver', value: '#C0C0C0' },
  ];

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          currentVerse
            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
        }`}
        title="Bible Verse Display"
      >
        <BookOpen size={18} />
        <span className="text-sm font-medium hidden md:inline">
          {currentVerse ? 'Verse Active' : 'Show Verse'}
        </span>
      </button>

      {/* Control Panel */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-96 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 z-50">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <BookOpen size={18} className="text-yellow-400" />
              Bible Verse
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search Bar */}
          <div className="mb-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="John 3:16"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !searchQuery.trim()}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              </button>
            </div>
          </div>

          {/* Dropdown Selectors */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            <select
              value={selectedBook}
              onChange={(e) => {
                setSelectedBook(e.target.value);
                setSelectedChapter('');
                setSelectedVerse('');
              }}
              className="px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              <option value="">Book</option>
              {BIBLE_BOOKS.map((book) => (
                <option key={book} value={book}>
                  {book}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              max="150"
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              placeholder="Ch"
              className="px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />

            <input
              type="number"
              min="1"
              max="176"
              value={selectedVerse}
              onChange={(e) => setSelectedVerse(e.target.value)}
              placeholder="Vs"
              className="px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>

          {selectedBook && selectedChapter && selectedVerse && (
            <button
              onClick={handleDropdownSearch}
              className="w-full mb-3 px-3 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/50 text-yellow-400 rounded-lg text-sm transition-colors"
            >
              Load {selectedBook} {selectedChapter}:{selectedVerse}
            </button>
          )}

          {/* Quick Access - Popular Verses */}
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-2">Quick Access:</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TOP_100_VERSES.slice(0, 6).map((ref) => (
                <button
                  key={ref}
                  onClick={() => handleQuickVerse(ref)}
                  className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors truncate"
                >
                  {ref}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Verse Preview */}
          {versePreview && (
            <div className="mb-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
              <p className="text-white text-sm mb-2">"{versePreview.text}"</p>
              <p className="text-gray-400 text-xs">— {versePreview.reference}</p>
            </div>
          )}

          {/* Styling Options */}
          {versePreview && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-gray-400">Styling:</p>
              
              {/* Color presets */}
              <div className="flex items-center gap-1.5">
                {colorPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setTextColor(preset.value)}
                    className={`w-6 h-6 rounded border-2 transition-all ${
                      textColor === preset.value ? 'border-white scale-110' : 'border-gray-600'
                    }`}
                    style={{ backgroundColor: preset.value }}
                    title={preset.name}
                  />
                ))}
              </div>

              {/* Text size */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-12">Size:</span>
                <input
                  type="range"
                  min="24"
                  max="64"
                  step="2"
                  value={textSize}
                  onChange={(e) => setTextSize(parseInt(e.target.value))}
                  className="flex-1 accent-yellow-500"
                />
                <span className="text-xs text-gray-300 w-8">{textSize}</span>
              </div>

              {/* Text weight */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-12">Weight:</span>
                <select
                  value={textWeight}
                  onChange={(e) => setTextWeight(parseInt(e.target.value))}
                  className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none"
                >
                  <option value="400">Normal</option>
                  <option value="700">Bold</option>
                  <option value="800">Extra Bold</option>
                </select>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {currentVerse && (
              <button
                onClick={() => {
                  onHideVerse();
                  setIsOpen(false);
                }}
                className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                Hide Verse
              </button>
            )}
            {versePreview && (
              <button
                onClick={handleShowVerse}
                className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Show on Screen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
