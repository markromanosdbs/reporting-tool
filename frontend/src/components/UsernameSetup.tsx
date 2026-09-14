import { useState } from 'react';

interface UsernameSetupProps {
  onSetUsername: (username: string) => void;
}

export function UsernameSetup({ onSetUsername }: UsernameSetupProps) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (input.trim()) {
      onSetUsername(input);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Enter Your Name</h2>
        <p className="text-gray-600 mb-4">
          Your name will be used to track comments and notes you add to the report.
        </p>
        <input
          type="text"
          placeholder="Enter your name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <button
          onClick={handleSubmit}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
