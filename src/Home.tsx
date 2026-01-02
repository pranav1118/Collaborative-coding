import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Users, AlertTriangle } from 'lucide-react';
import axios from 'axios';

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle error state from location (if redirected from Editor)
  useEffect(() => {
    const state = location.state as any;
    
    if (state?.error) {
      setError(state.error);
      
      // If we have previous values, restore them
      if (state.previousUsername) {
        setUsername(state.previousUsername);
      }
      
      if (state.previousRoomId) {
        setRoomId(state.previousRoomId);
      }
      
      // Clear the location state to prevent showing the error on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const generateRoomId = () => {
    setRoomId(uuidv4());
    // Clear any previous errors
    setError('');
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !roomId.trim()) {
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      console.log(`Checking if username ${username} is available in room ${roomId}`);
      
      // Determine API URL based on environment
      const SERVER_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000' 
        : 'https://collaborative-code-editor-jo24.onrender.com';
      
      // Check if username is available in this room
      const response = await axios.get(`${SERVER_URL}/check-username`, {
        params: {
          username,
          roomId
        }
      });
      
      const { available } = response.data;
      
      if (available) {
        console.log(`Username ${username} is available in room ${roomId}`);
        // Username is available, proceed with joining
        navigate(`/editor/${roomId}`, { 
          state: { 
            username,
            timestamp: Date.now() // Add timestamp to ensure fresh connection
          } 
        });
      } else {
        console.log(`Username ${username} is already taken in room ${roomId}`);
        setError(`Username "${username}" is already taken in room "${roomId}". Please choose a different username.`);
      }
    } catch (error) {
      console.error('Error checking username availability:', error);
      
      // If the server doesn't support the check yet, proceed anyway
      if (error.response && error.response.status === 404) {
        console.log('Username check endpoint not available, proceeding anyway');
        navigate(`/editor/${roomId}`, { 
          state: { 
            username,
            timestamp: Date.now() // Add timestamp to ensure fresh connection
          } 
        });
      } else {
        setError('Failed to check username availability. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1729] text-white relative overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black-500/20 to-gray-500/20" />
        <div className="absolute -top-[40rem] -left-[40rem] w-[80rem] h-[80rem] bg-blue-500/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-[40rem] -right-[40rem] w-[80rem] h-[80rem] bg-gray-500/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md">
          <div className="rounded-lg bg-gray-800 p-6 border border-gray-80 shadow-1g">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              <img src="https://i.pinimg.com/736x/46/97/d5/4697d53c83152a902cb3917d12b77315.jpg" alt="Team F12" className="w-10 h-10 inline-block mr-2" />
              Team F12
              </h1>
              <p className="text-gray-400 mb-8">
                Real-time Collaborative Code Editor
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-400 mr-2 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={joinRoom} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(''); // Clear error when username changes
                  }}
                  placeholder="Enter your username"
                  className="w-full px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm"
                  required
                />
              </div>

              <label className="block text-sm font-medium text-gray-300">
                Room ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    setError(''); // Clear error when room ID changes
                  }}
                  placeholder="Enter room ID"
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm"
                  required
                />
                <button
                  type="button"
                  onClick={generateRoomId}
                  className="px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors backdrop-blur-sm"
                >
                  Generate
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-2 px-4 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-medium transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                  isLoading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {isLoading ? (
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <Users className="w-5 h-5" />
                  )}
                  {isLoading ? 'Checking...' : 'Join Room'}
                </div>
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              Create a new room or join an existing one to start coding together in real-time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;