import { useState, useRef, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Send, Paperclip, Circle } from 'lucide-react';
import { toast } from 'sonner';

export default function ChatWindow({ chat, messages, onSendMessage, currentUsername, isConnected }) {
  const [messageText, setMessageText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!messageText.trim() && !selectedFile) return;

    let fileData = null;
    if (selectedFile) {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        fileData = {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          data: e.target.result
        };
        
        await onSendMessage(messageText || `Sent a file: ${selectedFile.name}`, fileData);
        setMessageText('');
        setSelectedFile(null);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      await onSendMessage(messageText);
      setMessageText('');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
      toast.success('File selected: ' + file.name);
    }
  };

  const handleDownloadFile = (fileData) => {
    const link = document.createElement('a');
    link.href = fileData.data;
    link.download = fileData.name;
    link.click();
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Chat Header */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold">
              {chat.username[0].toUpperCase()}
            </div>
            <Circle
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                isConnected ? 'fill-green-500 text-green-500' : 'fill-slate-300 text-slate-300'
              }`}
            />
          </div>
          <div>
            <p className="font-semibold text-slate-800">{chat.username}</p>
            <p className="text-xs text-slate-500">{isConnected ? 'Online' : 'Offline'}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50" data-testid="messages-container">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => {
              const isOwn = message.from === currentUsername;
              return (
                <div
                  key={index}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${index}`}
                >
                  <div
                    className={`max-w-md rounded-2xl px-4 py-2 ${
                      isOwn
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    <p className="break-words">{message.content}</p>
                    {message.fileData && (
                      <div className="mt-2 pt-2 border-t border-white/20">
                        <button
                          onClick={() => handleDownloadFile(message.fileData)}
                          className="text-sm underline hover:no-underline"
                        >
                          📎 {message.fileData.name} ({(message.fileData.size / 1024).toFixed(1)}KB)
                        </button>
                      </div>
                    )}
                    <p className={`text-xs mt-1 ${isOwn ? 'text-white/70' : 'text-slate-400'}`}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        {selectedFile && (
          <div className="mb-2 p-2 bg-indigo-50 rounded-lg flex items-center justify-between">
            <span className="text-sm text-indigo-700">📎 {selectedFile.name}</span>
            <button onClick={() => setSelectedFile(null)} className="text-indigo-600 hover:text-indigo-800">
              ✕
            </button>
          </div>
        )}
        <div className="flex space-x-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            data-testid="file-input"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            data-testid="attach-file-button"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
          <Input
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            className="flex-1"
            data-testid="message-input"
          />
          <Button
            onClick={handleSend}
            disabled={!messageText.trim() && !selectedFile}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
            data-testid="send-message-button"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}