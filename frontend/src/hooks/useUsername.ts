import { useState, useEffect } from 'react';

export function useUsername() {
  const [username, setUsernameState] = useState<string>('');
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('username');
    if (stored) {
      setUsernameState(stored);
    } else {
      setShowSetup(true);
    }
  }, []);

  const setUsername = (name: string) => {
    if (name.trim()) {
      localStorage.setItem('username', name.trim());
      setUsernameState(name.trim());
      setShowSetup(false);
    }
  };

  const changeUsername = () => {
    setShowSetup(true);
  };

  return {
    username,
    setUsername,
    changeUsername,
    showSetup,
    setShowSetup,
  };
}
