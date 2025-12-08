'use client';

import { useState, useRef, useEffect } from 'react';
import p2pEngine from '@/lib/p2p-engine';

export default function P2PTestPage() {
  const [roomId, setRoomId] = useState('testroom');
  const [peerId, setPeerId] = useState(`peer_${Math.random().toString(36).slice(2, 8)}`);
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesRef = useRef(messages);
  const engineRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const addMessage = (msg) => {
    setMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleInit = async () => {
    try {
      setStatus('initializing');
      addMessage('Initializing P2P engine...');
      
      const signalingUrl = `/api/p2p-signal?room_id=${encodeURIComponent(roomId)}&self=${encodeURIComponent(peerId)}`;
      
      if (!p2pEngine) {
        addMessage('❌ P2P Engine not available');
        setStatus('error');
        return;
      }

      await p2pEngine.init(signalingUrl);
      engineRef.current = p2pEngine;
      
      addMessage(`✅ Initialized in room: ${roomId}`);
      addMessage(`   Peer ID: ${peerId}`);
      addMessage(`   Signaling URL: ${signalingUrl}`);
      setStatus('connected');
    } catch (error) {
      addMessage(`❌ Init error: ${error.message}`);
      setStatus('error');
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    try {
      if (!engineRef.current) {
        addMessage('❌ Engine not initialized');
        return;
      }

      const response = await fetch('/api/p2p-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          from_peer: peerId,
          to_peer: null, 
          type: 'message',
          payload: { text: inputMessage, timestamp: Date.now() }
        })
      });

      if (response.ok) {
        addMessage(`📤 Message sent: ${inputMessage}`);
        setInputMessage('');
      } else {
        addMessage(`❌ Send failed: ${response.status}`);
      }
    } catch (error) {
      addMessage(`❌ Send error: ${error.message}`);
    }
  };

  const handlePollSignals = async () => {
    try {
      if (!engineRef.current) {
        addMessage('❌ Engine not initialized');
        return;
      }

      const response = await fetch(`/api/p2p-signal?room_id=${encodeURIComponent(roomId)}&peer=${encodeURIComponent(peerId)}`);
      
      if (!response.ok) {
        addMessage(`❌ Poll failed: ${response.status}`);
        return;
      }

      const data = await response.json();
      if (data.data && data.data.length > 0) {
        addMessage(`📥 Received ${data.data.length} signal(s)`);
        data.data.forEach(sig => {
          addMessage(`   From: ${sig.from_peer} | Type: ${sig.type}`);
        });
      } else {
        addMessage('📭 No new signals');
      }
    } catch (error) {
      addMessage(`❌ Poll error: ${error.message}`);
    }
  };

  const handleCleanup = async () => {
    try {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      addMessage('🧹 P2P Engine destroyed');
      setStatus('idle');
    } catch (error) {
      addMessage(`❌ Cleanup error: ${error.message}`);
    }
  };

  const handleClearConsole = () => {
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">🚀 P2P Signaling Test Console</h1>

        <div className="mb-6 p-4 bg-slate-800 rounded-lg">
          <div className="text-lg font-semibold">
            Status: <span className={`${status === 'connected' ? 'text-green-500' : status === 'initializing' ? 'text-yellow-500' : status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
              {status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Room ID</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
              disabled={status === 'connected'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Peer ID</label>
            <input
              type="text"
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
              disabled={status === 'connected'}
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-4 gap-2">
          <button onClick={handleInit} disabled={status === 'connected'} className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded font-semibold">Initialize</button>
          <button onClick={handlePollSignals} disabled={status !== 'connected'} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-semibold">Poll Signals</button>
          <button onClick={handleCleanup} disabled={status !== 'connected'} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded font-semibold">Cleanup</button>
          <button onClick={handleClearConsole} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded font-semibold">Clear Log</button>
        </div>

        <div className="mb-6 flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Enter message to broadcast..."
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white"
            disabled={status !== 'connected'}
          />
          <button onClick={handleSendMessage} disabled={status !== 'connected'} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded font-semibold">Send</button>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">📋 Console Log</h2>
          <div className="bg-black rounded p-4 font-mono text-sm max-h-96 overflow-y-auto space-y-1">
            {messages.length === 0 ? (
              <div className="text-gray-500">No messages yet...</div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className="text-green-400">&gt; {msg}</div>
              ))
            )}
          </div>
        </div>

        <div className="mt-8 p-4 bg-slate-800 rounded-lg text-sm">
          <h3 className="font-semibold mb-2">💡 How to use:</h3>
          <ol className="list-decimal list-inside space-y-1 text-gray-300">
            <li>Set a Room ID and Peer ID</li>
            <li>Click &quot;Initialize&quot; to connect to the signaling server</li>
            <li>Click &quot;Poll Signals&quot; to fetch messages from other peers</li>
            <li>Type a message and press &quot;Send&quot; to broadcast to all peers in the room</li>
            <li>The console will show all signaling events and messages</li>
          </ol>
        </div>
      </div>
    </div>
  );
}