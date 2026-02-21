// src/components/cinema/ui/SeatSwapNotification.jsx
// 🪑 Interactive seat swap request dialog
// Shows requester info and accept/decline buttons

export default function SeatSwapNotification({ request, onAccept, onDecline }) {
  if (!request) return null;

  return (
    <div className="
      fixed inset-0 z-50 flex items-center justify-center
      bg-black/50 backdrop-blur-sm
      animate-fade-in
    ">
      <div className="
        bg-gradient-to-br from-gray-800 to-gray-900
        border-2 border-blue-500/50
        rounded-2xl shadow-2xl
        p-6 max-w-md w-full mx-4
        animate-scale-in
      ">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">🪑</span>
          <div>
            <h3 className="text-xl font-bold text-white">Seat Swap Request</h3>
            <p className="text-gray-400 text-sm">Someone wants to swap seats with you</p>
          </div>
        </div>

        {/* Request Details */}
        <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
          <p className="text-white mb-2">
            <span className="font-semibold text-blue-400">{request.requesterName}</span>
            {' '}wants to swap seats
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-300">
            <div className="flex items-center gap-2">
              <span className="text-blue-400">Their Seat:</span>
              <span className="font-mono bg-gray-800 px-2 py-1 rounded">{request.requesterSeat}</span>
            </div>
            <span className="text-gray-500">↔️</span>
            <div className="flex items-center gap-2">
              <span className="text-blue-400">Your Seat:</span>
              <span className="font-mono bg-gray-800 px-2 py-1 rounded">{request.targetSeat}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {/* Decline Button */}
          <button
            onClick={onDecline}
            className="
              flex-1 py-3 px-4 rounded-lg
              bg-gray-600 hover:bg-gray-500
              text-white font-medium
              transition-all duration-200
              flex items-center justify-center gap-2
            "
          >
            <span className="text-xl">✖️</span>
            <span>Decline</span>
          </button>

          {/* Accept Button */}
          <button
            onClick={onAccept}
            className="
              flex-1 py-3 px-4 rounded-lg
              bg-green-600 hover:bg-green-500
              text-white font-medium
              transition-all duration-200
              flex items-center justify-center gap-2
              shadow-lg shadow-green-500/30
            "
          >
            <span className="text-xl">✅</span>
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}