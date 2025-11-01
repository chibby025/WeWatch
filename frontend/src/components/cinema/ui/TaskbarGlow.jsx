// src/components/cinema/ui/TaskbarGlow.jsx
// 🧡 Reusable taskbar glow indicator
// Shows persistent orange pulse at top of taskbar if notifications pending

export default function TaskbarGlow({ isActive = false }) {
  if (!isActive) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 h-1 bg-transparent pointer-events-none z-40">
      <div className="w-full h-full bg-orange-400 opacity-70 animate-glow-pulse"></div>
    </div>
  );
}