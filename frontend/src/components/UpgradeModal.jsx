import React from 'react';

const UpgradeModal = ({
  show3DUpgradeModal,
  setShow3DUpgradeModal,
  handle3DUpgrade,
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Upgrade to 3D Cinema</h2>
          <button
            onClick={() => setShow3DUpgradeModal(false)}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>
        
        <div className="mb-6">
          <img 
            src="/themes/3d-cinema-preview.jpg" 
            alt="3D Cinema Preview" 
            className="w-full h-48 object-cover rounded-lg mb-4"
          />
          <p className="text-gray-700 mb-4">
            Unlock immersive 3D cinema experience with:
          </p>
          <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
            <li>Seating with spatial audio</li>
            <li>3D reactions floating above avatars</li>
            <li>Immersive environments (cinema, stadium, rave)</li>
            <li>Priority support + early feature access</li>
          </ul>
          <p className="text-sm text-gray-500">
            Only $4.99/month — cancel anytime.
          </p>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setShow3DUpgradeModal(false)}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handle3DUpgrade}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors duration-150"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;