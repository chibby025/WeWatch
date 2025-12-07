import React, { useState, useEffect } from 'react';

const ScheduleEventModal = ({
  isOpen,
  roomId,
  onClose,
  onCreate,
  eventToEdit,
}) => {
  if (!isOpen) return null;
  // State for form fields
  const [watchType, setWatchType] = useState('3d_cinema');
  const [mediaFile, setMediaFile] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Populate form if editing
  useEffect(() => {
    if (eventToEdit) {
      setWatchType(eventToEdit.watch_type || '3d_cinema');
      setStartTime(new Date(eventToEdit.start_time).toISOString().slice(0, 16));
      setTitle(eventToEdit.title || '');
      setDescription(eventToEdit.description || '');
    } else {
      // Reset form for new event
      setWatchType('3d_cinema');
      setMediaFile(null);
      setStartTime('');
      setTitle('');
      setDescription('');
    }
  }, [eventToEdit]);

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!watchType || !startTime || !title) return;

    // Convert local time to UTC
    const localTime = new Date(startTime);
    const utcTime = localTime.toISOString();

    const eventData = {
      watch_type: watchType,
      media_file_path: mediaFile?.name || '', // Store filename for reference
      start_time: utcTime,
      title,
      description,
    };

    await onCreate(eventData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {eventToEdit ? 'Edit Event' : 'Schedule Event'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Watch Type</label>
            <select
              value={watchType}
              onChange={(e) => setWatchType(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            >
              <option value="3d_cinema">🎬 3D Cinema</option>
              <option value="video_watch">📺 Video Watch</option>
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Media File (Optional)</label>
            <input
              type="file"
              onChange={(e) => setMediaFile(e.target.files[0])}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              accept="video/*,audio/*"
            />
            <p className="text-xs text-gray-500 mt-1">
              Select a media file from your computer (optional)
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Times are saved in UTC. Your local time: {startTime ? new Date(startTime).toLocaleString() : 'Not set'}
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              rows="3"
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors duration-150"
            >
              {eventToEdit ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduleEventModal;