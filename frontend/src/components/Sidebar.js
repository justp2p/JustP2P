import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { UserPlus, Search, Circle } from 'lucide-react';
import { toast } from 'sonner';

export default function Sidebar({ contacts, activeChat, onSelectChat, onConnectToPeer, connections }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);

  const filteredContacts = contacts.filter(contact =>
    contact.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddContact = async () => {
    if (!newUsername.trim()) {
      toast.error('Please enter a username');
      return;
    }
    
    await onConnectToPeer(newUsername.trim());
    setNewUsername('');
    setShowAddDialog(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search Bar */}
      <div className="p-3 border-b border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="search-contacts-input"
          />
        </div>
      </div>

      {/* Add Contact Button */}
      <div className="p-3 border-b border-slate-200">
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700" data-testid="add-contact-button">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Contact</DialogTitle>
              <DialogDescription>
                Enter the username of the person you want to connect with
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Enter username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddContact()}
                  data-testid="add-contact-username-input"
                />
              </div>
              <Button onClick={handleAddContact} className="w-full" data-testid="add-contact-submit-button">
                Connect
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto" data-testid="contacts-list">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 text-sm">No contacts yet</p>
            <p className="text-slate-400 text-xs mt-1">Add someone to start chatting</p>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <div
              key={contact.username}
              onClick={() => onSelectChat(contact)}
              className={`p-4 border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50 ${
                activeChat?.username === contact.username ? 'bg-indigo-50' : ''
              }`}
              data-testid={`contact-${contact.username}`}
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold">
                    {contact.username[0].toUpperCase()}
                  </div>
                  <Circle
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                      connections[contact.peerId]?.open ? 'fill-green-500 text-green-500' : 'fill-slate-300 text-slate-300'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{contact.username}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {connections[contact.peerId]?.open ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}