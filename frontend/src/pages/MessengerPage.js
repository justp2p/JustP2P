import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Peer from 'peerjs';
import { toast } from 'sonner';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import { initDB, saveMessage, getMessages, saveContact, getContacts } from '../utils/db';
import { LogOut, Settings } from 'lucide-react';
import { Button } from '../components/ui/button';
import SettingsDialog from '../components/SettingsDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function MessengerPage({ user, onLogout }) {
  const [peer, setPeer] = useState(null);
  const [peerId, setPeerId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [connections, setConnections] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const messagesRef = useRef({});

  useEffect(() => {
    initializeApp();
    return () => cleanup();
  }, []);

  const initializeApp = async () => {
    await initDB();
    await loadContacts();
    await initializePeer();
  };

  const initializePeer = async () => {
    try {
      const newPeer = new Peer(undefined, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      newPeer.on('open', async (id) => {
        console.log('Peer ID:', id);
        setPeerId(id);
        
        // Update peer ID on server
        try {
          await axios.post(`${API}/users/update-peer-id`, { peer_id: id });
          toast.success('Connected to P2P network');
        } catch (error) {
          console.error('Failed to update peer ID:', error);
        }
      });

      newPeer.on('connection', (conn) => {
        console.log('Incoming connection from:', conn.peer);
        setupConnection(conn);
      });

      newPeer.on('error', (error) => {
        console.error('Peer error:', error);
        toast.error('P2P connection error: ' + error.type);
      });

      setPeer(newPeer);
    } catch (error) {
      console.error('Failed to initialize peer:', error);
      toast.error('Failed to connect to P2P network');
    }
  };

  const setupConnection = (conn) => {
    conn.on('open', () => {
      console.log('Connection opened with:', conn.peer);
      setConnections(prev => ({ ...prev, [conn.peer]: conn }));
      
      // Send introduction
      conn.send({
        type: 'introduction',
        username: user.username,
        peerId: peerId
      });
    });

    conn.on('data', async (data) => {
      console.log('Received data:', data);
      
      if (data.type === 'introduction') {
        // Save as contact
        const contact = {
          username: data.username,
          peerId: conn.peer,
          lastSeen: new Date().toISOString()
        };
        await saveContact(contact);
        await loadContacts();
      } else if (data.type === 'message') {
        // Save message
        const message = {
          chatId: data.from,
          from: data.from,
          to: user.username,
          content: data.content,
          timestamp: data.timestamp || new Date().toISOString(),
          fileData: data.fileData
        };
        await saveMessage(message);
        
        // Update UI if chat is active
        if (activeChat && activeChat.username === data.from) {
          const messages = await getMessages(data.from);
          messagesRef.current[data.from] = messages;
          setActiveChat({ ...activeChat });
        }
        
        toast.info(`New message from ${data.from}`);
      }
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      setConnections(prev => {
        const newConns = { ...prev };
        delete newConns[conn.peer];
        return newConns;
      });
    });
  };

  const loadContacts = async () => {
    const loadedContacts = await getContacts();
    setContacts(loadedContacts);
  };

  const connectToPeer = async (username) => {
    try {
      // Lookup username
      const response = await axios.post(`${API}/users/lookup`, { username });
      const targetPeerId = response.data.peer_id;
      
      if (!targetPeerId) {
        toast.error('User is offline');
        return;
      }

      if (connections[targetPeerId]) {
        toast.info('Already connected');
        return;
      }

      const conn = peer.connect(targetPeerId);
      setupConnection(conn);
      
      // Save as contact
      const contact = {
        username: username,
        peerId: targetPeerId,
        lastSeen: new Date().toISOString()
      };
      await saveContact(contact);
      await loadContacts();
      
      toast.success(`Connected to ${username}`);
    } catch (error) {
      console.error('Failed to connect:', error);
      toast.error(error.response?.data?.detail || 'Failed to connect to user');
    }
  };

  const sendMessage = async (content, fileData = null) => {
    if (!activeChat) return;
    
    const message = {
      chatId: activeChat.username,
      from: user.username,
      to: activeChat.username,
      content,
      timestamp: new Date().toISOString(),
      fileData
    };

    // Save locally
    await saveMessage(message);
    
    // Send via P2P
    const conn = connections[activeChat.peerId];
    if (conn && conn.open) {
      conn.send({
        type: 'message',
        from: user.username,
        content,
        timestamp: message.timestamp,
        fileData
      });
    } else {
      toast.warning('User is offline. Message saved locally.');
    }
    
    // Update UI
    const messages = await getMessages(activeChat.username);
    messagesRef.current[activeChat.username] = messages;
    setActiveChat({ ...activeChat });
  };

  const handleSelectChat = async (contact) => {
    const messages = await getMessages(contact.username);
    messagesRef.current[contact.username] = messages;
    setActiveChat(contact);
  };

  const cleanup = async () => {
    if (peer) {
      peer.destroy();
    }
    try {
      await axios.post(`${API}/users/set-offline`);
    } catch (error) {
      console.error('Failed to set offline:', error);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100" data-testid="messenger-page">
      {/* Sidebar */}
      <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="h-16 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <p className="text-white font-semibold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {user.username}
              </p>
              <p className="text-white/70 text-xs">{peerId ? 'Online' : 'Connecting...'}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={() => setShowSettings(true)}
              data-testid="settings-button"
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={onLogout}
              data-testid="logout-button"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Sidebar Content */}
        <Sidebar
          contacts={contacts}
          activeChat={activeChat}
          onSelectChat={handleSelectChat}
          onConnectToPeer={connectToPeer}
          connections={connections}
        />
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <ChatWindow
            chat={activeChat}
            messages={messagesRef.current[activeChat.username] || []}
            onSendMessage={sendMessage}
            currentUsername={user.username}
            isConnected={connections[activeChat.peerId]?.open}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Welcome to JustP2P
              </h2>
              <p className="text-slate-600">
                Select a contact or add a new one to start messaging
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Dialog */}
      {showSettings && (
        <SettingsDialog
          user={user}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}