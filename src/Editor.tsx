import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import { Download, Upload, Mic, MicOff, MessageSquare, X, Users, Copy, LogOut } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Type for media streams
type MediaStreamWithTracks = MediaStream & {
  getTracks: () => MediaStreamTrack[];
};

// Java-specific completions
const javaCompletions = {
  access: ['public', 'private', 'protected'],
  types: ['void', 'int', 'String', 'boolean', 'char', 'double', 'float', 'long'],
  keywords: ['class', 'interface', 'extends', 'implements', 'new', 'return', 'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws'],
  annotations: ['@Override', '@Deprecated', '@SuppressWarnings', '@FunctionalInterface'],
  commonClasses: ['System', 'String', 'Integer', 'Boolean', 'List', 'ArrayList', 'Map', 'HashMap', 'Set', 'HashSet']
};

// C-specific completions
const cCompletions = {
  types: ['void', 'int', 'char', 'float', 'double', 'long', 'short', 'unsigned', 'signed', 'struct', 'enum', 'union', 'const', 'volatile'],
  keywords: ['if', 'else', 'while', 'for', 'do', 'switch', 'case', 'break', 'continue', 'return', 'goto', 'typedef', 'sizeof', 'static', 'extern', 'register', 'auto'],
  preprocessor: ['#include', '#define', '#ifdef', '#ifndef', '#endif', '#if', '#else', '#elif', '#undef', '#pragma', '#error'],
  standardHeaders: ['<stdio.h>', '<stdlib.h>', '<string.h>', '<math.h>', '<time.h>', '<ctype.h>', '<stddef.h>', '<limits.h>', '<assert.h>', '<errno.h>'],
  commonFunctions: ['printf', 'scanf', 'malloc', 'free', 'calloc', 'realloc', 'strlen', 'strcpy', 'strcat', 'strcmp', 'fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'fscanf', 'sprintf', 'sscanf', 'getchar', 'putchar', 'gets', 'puts', 'main']
};

// C++-specific completions
const cppCompletions = {
  types: [...cCompletions.types, 'bool', 'wchar_t', 'auto', 'decltype'],
  keywords: [...cCompletions.keywords, 'class', 'namespace', 'template', 'typename', 'using', 'try', 'catch', 'throw', 'new', 'delete', 'this', 'virtual', 'override', 'final', 'explicit', 'friend', 'mutable', 'public', 'private', 'protected'],
  preprocessor: cCompletions.preprocessor,
  standardHeaders: [...cCompletions.standardHeaders, '<iostream>', '<vector>', '<string>', '<map>', '<set>', '<algorithm>', '<memory>', '<fstream>', '<sstream>', '<stdexcept>', '<chrono>', '<thread>', '<mutex>'],
  commonFunctions: [...cCompletions.commonFunctions, 'cout', 'cin', 'endl', 'push_back', 'begin', 'end', 'size', 'length', 'find', 'insert', 'erase', 'clear']
};

// SQL-specific completions
const sqlCompletions = {
  keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'ORDER BY', 'GROUP BY', 'HAVING', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'OUTER JOIN', 'UNION', 'DISTINCT', 'AS', 'IN', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'AND', 'OR', 'NOT', 'DESC', 'ASC', 'LIMIT'],
  types: ['INT', 'INTEGER', 'SMALLINT', 'TINYINT', 'BIGINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'DOUBLE', 'CHAR', 'VARCHAR', 'TEXT', 'DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'BOOLEAN', 'BLOB', 'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'DEFAULT', 'NOT NULL', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'AUTO_INCREMENT']
};

const createJavaCompletions = () => {
  return autocompletion({
    override: [
      (context) => {
        const word = context.matchBefore(/\w*/);
        if (!word) return null;
        
        let options = [];

        // Combine all Java-specific completions
        const allCompletions = [
          ...javaCompletions.access,
          ...javaCompletions.types,
          ...javaCompletions.keywords,
          ...javaCompletions.annotations,
          ...javaCompletions.commonClasses
        ];
        
        options = allCompletions
          .filter(opt => opt.toLowerCase().startsWith(word.text.toLowerCase()))
          .map(opt => ({
            label: opt,
            type: 'keyword',
            boost: 1
          }));
        
        return {
          from: word.from,
          options,
          validFor: /^\w*$/
        };
      }
    ]
  });
};

const createCCompletions = () => {
  return autocompletion({
    override: [
      (context) => {
        const word = context.matchBefore(/[\w#<>]*/);
        if (!word) return null;
        
        let options = [];
        
        // Combine all C-specific completions
        const allCompletions = [
          ...cCompletions.types,
          ...cCompletions.keywords,
          ...cCompletions.preprocessor,
          ...cCompletions.standardHeaders,
          ...cCompletions.commonFunctions
        ];
        
        options = allCompletions
          .filter(opt => opt.toLowerCase().startsWith(word.text.toLowerCase()))
          .map(opt => ({
            label: opt,
            type: opt.startsWith('#') ? 'preprocessor' : 
                  opt.startsWith('<') ? 'header' :
                  cCompletions.types.includes(opt) ? 'type' :
                  cCompletions.commonFunctions.includes(opt) ? 'function' : 'keyword',
            boost: opt.startsWith('#') ? 2 : 1,
            detail: opt.startsWith('<') ? 'Standard Header' : undefined
          }));
        
        return {
          from: word.from,
          options,
          validFor: /^[\w#<>]*$/
        };
      }
    ]
  });
};

const createCppCompletions = () => {
  return autocompletion({
    override: [
      (context) => {
        const word = context.matchBefore(/[\w#<>:]*/);
        if (!word) return null;
        
        let options = [];
        
        // Combine all C++-specific completions
        const allCompletions = [
          ...cppCompletions.types,
          ...cppCompletions.keywords,
          ...cppCompletions.preprocessor,
          ...cppCompletions.standardHeaders,
          ...cppCompletions.commonFunctions
        ];
        
        options = allCompletions
          .filter(opt => opt.toLowerCase().startsWith(word.text.toLowerCase()))
          .map(opt => ({
            label: opt,
            type: opt.startsWith('#') ? 'preprocessor' : 
                  opt.startsWith('<') ? 'header' :
                  cppCompletions.types.includes(opt) ? 'type' :
                  cppCompletions.commonFunctions.includes(opt) ? 'function' : 'keyword',
            boost: opt.startsWith('#') ? 2 : 1,
            detail: opt.startsWith('<') ? 'Standard Header' : undefined
          }));
        
        return {
          from: word.from,
          options,
          validFor: /^[\w#<>:]*$/
        };
      }
    ]
  });
};

const createSqlCompletions = () => {
  return autocompletion({
    override: [
      (context) => {
        const word = context.matchBefore(/[\w\s]*/);
        if (!word) return null;
        
        let options = [];
        
        // Combine all SQL-specific completions
        const allCompletions = [
          ...sqlCompletions.keywords,
          ...sqlCompletions.types
        ];
        
        options = allCompletions
          .filter(opt => opt.toLowerCase().startsWith(word.text.toLowerCase()))
          .map(opt => ({
            label: opt,
            type: sqlCompletions.types.includes(opt) ? 'type' : 'keyword',
            boost: 1
          }));
        
        return {
          from: word.from,
          options,
          validFor: /^[\w\s]*$/
        };
      }
    ]
  });
};

// Define the languageMap at the top with type safety
const languageMap: Record<string, { name: string; extension: string; lang: any }> = {
  javascript: { name: 'JavaScript', extension: 'js', lang: javascript({ jsx: true }) },
  typescript: { name: 'TypeScript', extension: 'ts', lang: javascript({ typescript: true }) },
  python: { name: 'Python', extension: 'py', lang: python() },
  java: { name: 'Java', extension: 'java', lang: java() },
  cpp: { name: 'C++', extension: 'cpp', lang: cpp() },
  c: { name: 'C', extension: 'c', lang: cpp() },
  html: { name: 'HTML', extension: 'html', lang: html() },
  css: { name: 'CSS', extension: 'css', lang: css() },
  sql: { name: 'SQL', extension: 'sql', lang: sql() },
};

// Function to get the language support based on the selected language
const getLanguageSupport = (language: string) => {
  switch (language) {
    case 'javascript':
      return languageMap.javascript.lang;
    case 'typescript':
      return languageMap.typescript.lang;
    case 'python':
      return languageMap.python.lang;
    case 'cpp':
      return [languageMap.cpp.lang, createCppCompletions()];
    case 'c':
      return [languageMap.c.lang, createCCompletions()];
    case 'java':
      return [languageMap.java.lang, createJavaCompletions()];
    case 'html':
      return languageMap.html.lang;
    case 'css':
      return languageMap.css.lang;
    case 'sql':
      return [languageMap.sql.lang, createSqlCompletions()];
    default:
      return languageMap.javascript.lang; // Fallback to JavaScript
  }
};

// Update the type definition at the top
type ChatMessage = {
  id?: string;
  text: string;
  sender: string;
  timestamp: string;
  username?: string;
};

const Editor = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const username = location.state?.username || 'Anonymous';
  const navigate = useNavigate();
  const [code, setCode] = useState<string>('');
  const [language, setLanguage] = useState<string>('javascript');
  const [isMicOn, setIsMicOn] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [showChat, setShowChat] = useState<boolean>(false);
  const [connectedUsers, setConnectedUsers] = useState<{ id: string; username: string; peerId: string; }[]>([]);
  const [audioStreams] = useState<Map<string, HTMLAudioElement>>(new Map());
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Add loading state
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
  // Add unread messages notification state
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  // Add state for mobile view
  const [isMobileView, setIsMobileView] = useState<boolean>(window.innerWidth < 768);
  
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clientIdRef = useRef<string>('');

  // Add a debug state
  const [showDebug, setShowDebug] = useState(false);
  
  // Add a state for showing room info panel
  const [showRoomInfo, setShowRoomInfo] = useState<boolean>(false);
  
  // Function to toggle debug mode
  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };

  // Add responsive handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!roomId || !username) {
      navigate('/');
      return;
    }

    // Ensure any previous socket is fully disconnected
    if (socketRef.current) {
      console.log("Disconnecting previous socket");
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log(`Creating new connection for room ${roomId} as ${username}`);
    
    // Create socket connection directly to the render server through Netlify's proxy
    // This ensures we're using the same origin for the WebSocket connection
    const SERVER_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:3000' 
      : 'https://collaborative-code-editor-jo24.onrender.com';
      
    console.log(`Connecting to socket server at: ${SERVER_URL}`);
    setIsConnecting(true);
    setConnectionError(null);
    setConnectionAttempts(prev => prev + 1);
    
    // Add a system message about connection status
    setMessages(prev => [
      ...prev, 
      { 
        text: `Connecting to server... This may take a moment if the server is waking up.`, 
        sender: 'system', 
        timestamp: new Date().toISOString() 
      }
    ]);
    
    // Get timestamp from location state if available (to ensure fresh connections)
    const timestamp = location.state?.timestamp || Date.now();
    
    const newSocket = io(SERVER_URL, {
      transports: ['polling', 'websocket'],  // Start with polling, then upgrade to WS
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true,
      withCredentials: false,
      query: {
        roomId,
        username,
        clientId: clientIdRef.current || uuidv4(),
        timestamp // Add timestamp to query to ensure unique connection
      }
    });
    
    // Set up error handling
    newSocket.on('connect_error', (error) => {
      console.error("Socket connection error:", error);
      setConnectionError(`Connection error: ${error.message}`);
      
      // Add error message to chat
      setMessages(prev => [
        ...prev, 
        { 
          text: `Connection error: ${error.message}. Retrying...`, 
          sender: 'system', 
          timestamp: new Date().toISOString() 
        }
      ]);
    });
    
    newSocket.on('connect', () => {
      console.log("Socket connected successfully!");
      setIsConnecting(false);
      setConnectionError(null);
      
      // Add success message to chat
      setMessages(prev => [
        ...prev, 
        { 
          text: `Connected to server successfully!`, 
          sender: 'system', 
          timestamp: new Date().toISOString() 
        }
      ]);
    });
    
    // Handle username rejection event
    newSocket.on('joinRejected', (data) => {
      console.error("Join rejected:", data);
      
      if (data.reason === 'username_taken') {
        // Add system message about username being taken
        setMessages(prev => [
          ...prev, 
          { 
            text: `Error: ${data.message}`, 
            sender: 'system', 
            timestamp: new Date().toISOString() 
          }
        ]);
        
        // After a short delay, navigate back to home with error message
        setTimeout(() => {
          navigate('/', { 
            state: { 
              error: data.message,
              previousUsername: username,
              previousRoomId: roomId
            }
          });
        }, 2000);
      }
    });
    
    newSocket.on('connect_timeout', () => {
      console.error("Socket connection timeout");
      setConnectionError("Connection timed out. Retrying...");
    });
    
    newSocket.on('error', (error) => {
      console.error("Socket error:", error);
      setConnectionError(`Socket error: ${error}`);
    });
    
    // Store socket in ref
    socketRef.current = newSocket;

    // Set up peer connection with debug logging
    const peer = new Peer({
      debug: 3,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
    
    peerRef.current = peer;

    // Handle peer connection open
    peer.on('open', (id) => {
      console.log("PeerJS connection established with ID:", id);
      if (newSocket.connected) {
        newSocket.emit('peer-id', { peerId: id });
      }
    });

    // Handle incoming calls
    peer.on('call', async (call) => {
      console.log('Received incoming call from:', call.peer);
      try {
        // If we don't have a stream yet, get one
        let stream;
        if (!audioRef.current?.srcObject) {
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } 
          });
          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.muted = true;
          }
        } else {
          stream = audioRef.current.srcObject as MediaStream;
        }
        
        // Answer the call with our stream
        console.log('Answering call with stream');
        call.answer(stream);
        
        // Handle the incoming stream
        handleCallEvents(call, call.peer);
      } catch (err) {
        console.error('Error handling incoming call:', err);
      }
    });

    // Handle peer errors
    peer.on('error', (err) => {
      console.error("PeerJS error:", err);
    });

    // Handle peer disconnection
    peer.on('disconnected', () => {
      console.log('Peer disconnected - attempting to reconnect');
      peer.reconnect();
    });

    newSocket.on('userList', (users) => {
      console.log("Received user list:", users);
      console.log(`Number of users in room: ${users.length}`);
      
      // Force a UI update with the new user list
      setConnectedUsers(users);
      
      // Log each user's details
      users.forEach((user: { username: string; id: string; peerId?: string }) => {
        console.log(`User: ${user.username}, ID: ${user.id}`);
      });
    });
    
    newSocket.on('code-change', (newCode) => {
      console.log("Received code change");
      setCode(newCode);
    });
    
    newSocket.on('chat-message', (message) => {
      console.log("Received chat message:", message);
      setMessages(prev => [...prev, message]);
      
      // Increment unread message count if chat is not visible
      if (!showChat) {
        setUnreadMessages(prev => prev + 1);
        
        // Play notification sound
        try {
          const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2356/2356-preview.mp3');
          notificationSound.volume = 0.5;
          notificationSound.play().catch(e => console.log('Error playing notification sound:', e));
        } catch (error) {
          console.log('Error with notification sound:', error);
        }
      }
      
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    });
    
    newSocket.on('userJoined', (joinedUsername) => {
      console.log(`User joined: ${joinedUsername}`);
      const joinMessage = { 
        text: `${joinedUsername} has joined the room.`, 
        sender: 'system', 
        timestamp: new Date().toISOString() 
      };
      setMessages(prev => [...prev, joinMessage]);
      
      // Request updated user list after user joins
      newSocket.emit('requestUserList', { roomId });
    });
    
    newSocket.on('userLeft', (leftUsername) => {
      console.log(`User left: ${leftUsername}`);
      const leaveMessage = { 
        text: `${leftUsername} has left the room.`, 
        sender: 'system', 
        timestamp: new Date().toISOString() 
      };
      setMessages(prev => [...prev, leaveMessage]);
      
      // Request updated user list after user leaves
      newSocket.emit('requestUserList', { roomId });
    });
    
    // Add handler for joinedRoom event
    newSocket.on('joinedRoom', (data) => {
      console.log(`Successfully joined room: ${data.message}`);
      console.log(`Room ${data.roomId} has ${data.userCount} users`);
      
      // Request user list immediately after joining confirmation
      newSocket.emit('requestUserList', { roomId });
    });
    
    // Store socket ID as client ID
    clientIdRef.current = newSocket.id || '';
    
    // Join room
    console.log(`Joining room ${roomId} as ${username} with socket ID ${newSocket.id}`);
    newSocket.emit('joinRoom', {
      username,
      roomId,
      clientId: newSocket.id
    });
    
    // Explicitly request user list after joining
    setTimeout(() => {
      if (newSocket.connected) {
        console.log("Requesting initial user list");
        newSocket.emit('requestUserList', { roomId });
      }
    }, 1000);

    // Clean up
    return () => {
      console.log("Cleaning up component...");
      
      if (socketRef.current) {
        console.log("Disconnecting socket");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      if (peerRef.current) {
        console.log("Destroying peer connection");
        peerRef.current.destroy();
        peerRef.current = null;
      }
      
      audioStreams.forEach(audio => {
        if (audio.srcObject) {
          const stream = audio.srcObject as MediaStreamWithTracks;
          stream.getTracks().forEach(track => track.stop());
        }
      });
      audioStreams.clear();
    };
  }, [roomId, username, navigate]);

  useEffect(() => {
    // This useEffect is only for cleanup of event listeners
    // to prevent memory leaks and duplicate listeners

    return () => {
      if (socketRef.current) {
        // Remove all listeners to prevent duplicates
        socketRef.current.off('code-change');
        socketRef.current.off('userList');
        socketRef.current.off('chat-message');
        socketRef.current.off('userJoined');
        socketRef.current.off('userLeft');
      }
    };
  }, []);

  const handleCodeChange = (value: string) => {
    setCode(value);
    if (socketRef.current) {
      console.log('Emitting code change to server');
      socketRef.current.emit('code-change', value);
    }
  };

  const toggleMic = async () => {
    if (!isMicOn) {
      try {
        console.log('Requesting microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        
        console.log('Microphone access granted');
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          audioRef.current.muted = true;
          console.log('Set audio source (muted locally)');
        }
        setIsMicOn(true);
        
        // Make calls to all other users in the room
        console.log('Starting calls to other users...');
        connectedUsers.forEach((user) => {
          if (user.peerId && peerRef.current && peerRef.current.id) {
            if (user.peerId !== peerRef.current.id) {
              console.log(`Initiating call to peer ${user.peerId}`);
              try {
                const call = peerRef.current.call(user.peerId, stream);
                console.log(`Call initiated to ${user.peerId}`);
                handleCallEvents(call, user.peerId);
              } catch (err) {
                console.error(`Failed to call peer ${user.peerId}:`, err);
              }
            }
          }
        });
      } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Failed to access microphone. Please check your permissions and try again.');
      }
    } else {
      console.log('Turning off microphone...');
      if (audioRef.current?.srcObject) {
        const stream = audioRef.current.srcObject as MediaStreamWithTracks;
        stream.getTracks().forEach((track: MediaStreamTrack) => {
          console.log(`Stopping track: ${track.kind}`);
          track.stop();
        });
        audioRef.current.srcObject = null;
      }
      audioStreams.forEach((audio) => {
        if (audio.srcObject) {
          const stream = audio.srcObject as MediaStreamWithTracks;
          stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        }
      });
      audioStreams.clear();
      setIsMicOn(false);
      console.log('Microphone turned off');
    }
  };

  // Toggle all audio (master mute/unmute)
  const toggleAllAudio = () => {
    const newMutedState = !isAudioMuted;
    setIsAudioMuted(newMutedState);
    
    // Update all audio streams to match the new mute state
    audioStreams.forEach((audio) => {
      audio.muted = newMutedState;
    });
    
    // If muting all, add all peerIds to mutedUsers
    // If unmuting all, clear the mutedUsers set
    if (newMutedState) {
      const allPeerIds = connectedUsers
        .filter(user => user.peerId && user.peerId !== peerRef.current?.id)
        .map(user => user.peerId);
      
      setMutedUsers(new Set(allPeerIds));
    } else {
      setMutedUsers(new Set());
    }
  };

  const handleCallEvents = (call: any, peerId: string) => {
    console.log(`Setting up call events for peer ${peerId}`);
    
    call.on('stream', (remoteStream: MediaStream) => {
      console.log(`Received audio stream from peer ${peerId}`);
      if (!audioStreams.has(peerId)) {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(error => {
          console.error(`Error playing audio from peer ${peerId}:`, error);
          // Try to play again after a short delay
          setTimeout(() => {
            audio.play().catch(e => console.error('Retry failed:', e));
          }, 1000);
        });
        // Set initial muted state based on mutedUsers
        audio.muted = mutedUsers.has(peerId);
        audioStreams.set(peerId, audio);
        console.log(`Audio stream from peer ${peerId} is ${audio.muted ? 'muted' : 'unmuted'}`);
      }
    });

    call.on('error', (error: Error) => {
      console.error(`Error in call with peer ${peerId}:`, error);
    });

    call.on('close', () => {
      console.log(`Call closed with peer ${peerId}`);
      const audio = audioStreams.get(peerId);
      if (audio) {
        if (audio.srcObject) {
          const stream = audio.srcObject as MediaStreamWithTracks;
          stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        }
        audioStreams.delete(peerId);
      }
    });
  };

  const handleExport = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use type assertion to ensure language is a valid key
    const extension = languageMap[language as keyof typeof languageMap]?.extension || 'txt';
    a.download = `code.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && event.target.result) {
          const content = event.target.result as string;
          setCode(content);
          if (socketRef.current) {
            socketRef.current.emit('code-change', content);
          }
        }
      };
      reader.readAsText(file);
    }
  };

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !socketRef.current || !socketRef.current.connected) {
      console.log("Cannot send message: empty message or socket not connected");
      return;
    }

    if (!socketRef.current.id) {
      console.error("Socket ID is undefined, cannot send message");
      return;
    }
    
    console.log("Sending chat message...");
    
    const timestamp = new Date().toISOString();
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create message object with required sender ID
    const message: ChatMessage = {
      id: messageId,
      text: newMessage,
      timestamp: timestamp,
      username: username,
      sender: socketRef.current.id // This is now guaranteed to be a string
    };
    
    console.log("Emitting chat message:", message);
    
    // Send to server
    socketRef.current.emit('chat-message', message);
    
    // Add to local state immediately
    setMessages(prev => [...prev, message]);
    
    // Clear input
    setNewMessage('');
    
    // Scroll to bottom
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Add an effect to periodically request user list updates
  useEffect(() => {
    if (!socketRef.current || !roomId) return;
    
    // Request user list immediately
    if (socketRef.current.connected) {
      socketRef.current.emit('requestUserList', { roomId });
    }
    
    // Set up periodic refresh of user list
    const userListInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        console.log("Requesting updated user list (periodic refresh)");
        socketRef.current.emit('requestUserList', { roomId });
      }
    }, 5000); // Every 5 seconds
    
    return () => {
      clearInterval(userListInterval);
    };
  }, [roomId, socketRef.current && socketRef.current.connected]);

  // Toggle audio for a specific user
  const toggleUserAudio = (peerId: string) => {
    const audio = audioStreams.get(peerId);
    if (audio) {
      audio.muted = !audio.muted;
      setMutedUsers(prev => {
        const newMutedUsers = new Set(prev);
        if (audio.muted) {
          newMutedUsers.add(peerId);
        } else {
          newMutedUsers.delete(peerId);
        }
        return newMutedUsers;
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0f1729] text-white overflow-hidden">
      {/* Hidden audio element for local stream */}
      <audio ref={audioRef} autoPlay muted className="hidden" />
      
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 shadow-md">
        <div className="container mx-auto px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2 md:space-x-4">
              <div className="flex items-center">
                <span className="font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  <img src="https://i.pinimg.com/736x/46/97/d5/4697d53c83152a902cb3917d12b77315.jpg" alt="Team F12" className="w-8 h-8 md:w-10 md:h-10 inline-block mr-2" />
                  <span className="hidden md:inline">Collaborative Coding</span>
                  <span className="inline md:hidden">Code</span>
                </span>
              </div>
              
              <div 
                onClick={() => setShowRoomInfo(!showRoomInfo)} 
                className="flex items-center space-x-2 px-2 py-1 md:px-3 bg-gray-800/50 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700/50 transition-colors"
              >
                <span className="text-xs md:text-sm text-gray-400">Room:</span>
                <span className="text-xs md:text-sm font-mono truncate max-w-[80px] md:max-w-none">{roomId}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyRoomId();
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Copy className="w-3 h-3 md:w-4 md:h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:space-x-4">
              {/* Connection status indicator */}
              {isConnecting && (
                <div className="flex items-center space-x-1 md:space-x-2 px-2 py-1 md:px-3 bg-yellow-500/20 text-yellow-300 rounded-lg animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-yellow-300"></div>
                  <span className="text-xs md:text-sm">Connecting...</span>
                </div>
              )}
              {connectionError && !isConnecting && (
                <div className="flex items-center space-x-1 md:space-x-2 px-2 py-1 md:px-3 bg-red-500/20 text-red-300 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-red-300"></div>
                  <span className="text-xs md:text-sm">Error</span>
                </div>
              )}
              {!isConnecting && !connectionError && (
                <div className="flex items-center space-x-1 md:space-x-2 px-2 py-1 md:px-3 bg-green-500/20 text-green-300 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-green-300"></div>
                  <span className="text-xs md:text-sm">Connected</span>
                </div>
              )}

              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-gray-800/50 text-xs md:text-sm px-2 py-1 md:px-3 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(languageMap).map(([key, value]) => (
                  <option key={key} value={key}>{value.name}</option>
                ))}
              </select>

              <button
                onClick={() => navigate('/')}
                className="flex items-center space-x-1 px-2 py-1 md:px-3 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                <LogOut className="w-3 h-3 md:w-4 md:h-4" />
                <span className="text-xs md:text-sm hidden md:inline">Leave</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Room Info Panel */}
      {showRoomInfo && (
        <div className="fixed top-16 left-0 right-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 shadow-md">
          <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-lg">Room Information</h3>
              <button 
                onClick={() => setShowRoomInfo(false)}
                className="text-gray-400 hover:text-white p-1 hover:bg-gray-800/50 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-gray-800/30 rounded-lg p-4 mb-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Room ID</p>
                  <div className="flex items-center">
                    <p className="font-mono bg-gray-800/50 px-2 py-1 rounded text-sm">{roomId}</p>
                    <button
                      onClick={copyRoomId}
                      className="ml-2 text-gray-400 hover:text-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Your Name</p>
                  <p className="bg-gray-800/50 px-2 py-1 rounded text-sm">{username}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Connected Users</p>
                  <p className="bg-gray-800/50 px-2 py-1 rounded text-sm">{connectedUsers.length}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Current Language</p>
                  <p className="bg-gray-800/50 px-2 py-1 rounded text-sm">{languageMap[language]?.name || language}</p>
                </div>
              </div>
            </div>
            
            <h4 className="font-medium text-md mb-2">Connected Users</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {connectedUsers.map((user) => (
                <div key={user.id} className="flex items-center p-2 bg-gray-800/30 rounded-lg">
                  <div className="w-3 h-3 rounded-full bg-green-400 mr-2"></div>
                  <span className="text-sm mr-1">{user.username}</span>
                  {user.id === clientIdRef.current && (
                    <span className="text-xs bg-blue-500/30 text-blue-300 px-1 rounded">You</span>
                  )}
                  {user.peerId && isMicOn && (
                    <button
                      onClick={() => toggleUserAudio(user.peerId)}
                      className="ml-auto text-xs p-1 rounded-full bg-gray-700/50 hover:bg-gray-700"
                      title={mutedUsers.has(user.peerId) ? "Unmute user" : "Mute user"}
                    >
                      {mutedUsers.has(user.peerId) ? "🔇" : "🔊"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content area with padding for fixed header */}
      <div className="flex flex-col md:flex-row h-full pt-16">
        {/* Editor */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="bg-gray-900/30 p-2 border-b border-gray-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-3 md:space-x-5">
              <label className="cursor-pointer p-1 md:p-2 hover:bg-gray-800/50 rounded-lg transition-colors">
                <input
                  type="file"
                  onChange={handleImport}
                  className="hidden"
                />
                <Upload className="w-4 h-4 md:w-5 md:h-5 text-gray-400 hover:text-white" />
              </label>
              
              <button
                onClick={handleExport}
                className="p-1 md:p-2 hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4 md:w-5 md:h-5 text-gray-400 hover:text-white" />
              </button>
              
              <button
                onClick={toggleMic}
                className={`p-1 md:p-2 rounded-lg transition-colors ${
                  isMicOn ? 'bg-green-500/20 text-green-400' : 'hover:bg-gray-800/50 text-gray-400 hover:text-white'
                }`}
              >
                {isMicOn ? <Mic className="w-4 h-4 md:w-5 md:h-5" /> : <MicOff className="w-4 h-4 md:w-5 md:h-5" />}
              </button>
              
              <button
                onClick={toggleAllAudio}
                className={`p-1 md:p-2 rounded-lg transition-colors flex items-center ${
                  isAudioMuted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                }`}
                title={isAudioMuted ? "Unmute all audio" : "Mute all audio"}
              >
                <span className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center text-base md:text-lg">
                  {isAudioMuted ? "🔇" : "🔊"}
                </span>
              </button>
            </div>
            
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="flex items-center space-x-1 md:space-x-2">
                <Users className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                <span className="text-xs md:text-sm text-gray-400">
                  {connectedUsers.length}
                </span>
              </div>
              
              <button
                onClick={() => {
                  setShowChat(!showChat);
                  if (!showChat) {
                    // Reset unread messages when opening chat
                    setUnreadMessages(0);
                  }
                }}
                className={`p-1 md:p-2 rounded-lg transition-colors relative ${
                  showChat ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-800/50 text-gray-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
                {/* Notification badge */}
                {!showChat && unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 md:w-5 md:h-5 flex items-center justify-center animate-pulse">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* CodeMirror editor - takes remaining height */}
          <div className="flex-1 overflow-hidden">
            <CodeMirror
              value={code}
              height="100%"
              theme={vscodeDark}
              extensions={[
                getLanguageSupport(language), // Use the function to get the correct language support
                closeBrackets()
              ]}
              onChange={handleCodeChange}
              className="h-full"
            />
          </div>
        </div>

        {/* Chat panel - independent scrolling */}
        {showChat && (
          <div 
            className={`${
              isMobileView 
                ? 'fixed inset-x-0 bottom-0 h-1/2 z-10' 
                : 'w-80 h-full'
            } bg-gray-900/30 backdrop-blur-sm border-l border-gray-800 flex flex-col`}
          >
            <div className="p-2 md:p-4 border-b border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-300 text-sm md:text-base">Chat</h3>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-white p-1 hover:bg-gray-800/50 rounded transition-colors"
              >
                <X className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>

            {/* Scrollable messages area - independent scrolling */}
            <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-3 md:space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-2 md:p-3 rounded-lg ${
                    message.sender === clientIdRef.current
                      ? 'bg-blue-500/20 ml-auto'
                      : message.sender === 'system'
                      ? 'bg-gray-700/50 mx-auto text-center'
                      : 'bg-gray-800/50'
                  } max-w-[80%]`}
                >
                  <p className="text-xs md:text-sm">
                    {message.sender === 'system' ? (
                      <span>{message.text}</span>
                    ) : (
                      <>
                        <strong className="text-blue-400">{message.username}:</strong> {message.text}
                      </>
                    )}
                  </p>
                  <span className="text-[10px] md:text-xs text-gray-400 mt-1 block">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input form */}
            <form onSubmit={sendMessage} className="p-2 md:p-4 border-t border-gray-800">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="w-full bg-gray-800/50 text-white px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 text-xs md:text-sm"
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Editor;
