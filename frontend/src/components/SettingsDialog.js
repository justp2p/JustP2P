import { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Shield, Download, Upload, Key } from 'lucide-react';
import { toast } from 'sonner';
import { exportDatabase, importDatabase, clearAllData } from '../utils/db';
import QRCode from 'react-qr-code';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SettingsDialog({ user, onClose }) {
  const [twoFAData, setTwoFAData] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [backupCodes, setBackupCodes] = useState([]);

  const handleSetup2FA = async () => {
    try {
      const response = await axios.post(`${API}/auth/2fa/setup`);
      setTwoFAData(response.data);
      setBackupCodes(response.data.backup_codes);
      setShowQR(true);
      toast.success('2FA setup initiated. Scan the QR code with your authenticator app.');
    } catch (error) {
      toast.error('Failed to setup 2FA');
    }
  };

  const handleDisable2FA = async () => {
    try {
      await axios.post(`${API}/auth/2fa/disable`);
      toast.success('2FA disabled');
      setTwoFAData(null);
      setShowQR(false);
    } catch (error) {
      toast.error('Failed to disable 2FA');
    }
  };

  const handleExportBackup = async () => {
    try {
      const data = await exportDatabase();
      const encrypted = await encryptBackup(data);
      await uploadToServer(encrypted);
      
      // Also download locally
      const blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `justp2p-backup-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Backup created and downloaded');
    } catch (error) {
      toast.error('Failed to create backup');
    }
  };

  const handleImportBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const encrypted = JSON.parse(text);
      const decrypted = await decryptBackup(encrypted);
      await importDatabase(decrypted);
      toast.success('Backup imported successfully. Please refresh the page.');
    } catch (error) {
      toast.error('Failed to import backup: ' + error.message);
    }
  };

  const encryptBackup = async (data) => {
    // Simple base64 encoding for now
    // In production, use proper encryption
    const jsonStr = JSON.stringify(data);
    return {
      data: btoa(jsonStr),
      timestamp: new Date().toISOString()
    };
  };

  const decryptBackup = async (encrypted) => {
    try {
      const jsonStr = atob(encrypted.data);
      return JSON.parse(jsonStr);
    } catch (error) {
      throw new Error('Invalid backup file');
    }
  };

  const uploadToServer = async (encrypted) => {
    await axios.post(`${API}/backup/upload`, {
      filename: `backup-${new Date().toISOString()}.json`,
      data: encrypted.data,
      provider: 'local'
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="security" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="security">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="backup">
              <Download className="w-4 h-4 mr-2" />
              Backup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Two-Factor Authentication</h3>
              <p className="text-sm text-slate-600 mb-4">
                Add an extra layer of security to your account
              </p>
              
              {user.totp_enabled ? (
                <div className="space-y-4">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 text-sm">2FA is currently enabled</p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleDisable2FA}
                    data-testid="disable-2fa-button"
                  >
                    Disable 2FA
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {!showQR ? (
                    <Button onClick={handleSetup2FA} data-testid="enable-2fa-button">
                      <Key className="w-4 h-4 mr-2" />
                      Enable 2FA
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-white p-4 rounded-lg border border-slate-200">
                        <p className="text-sm mb-2">Scan this QR code with your authenticator app:</p>
                        <div className="flex justify-center p-4">
                          <QRCode value={twoFAData.qr_code.replace('data:image/png;base64,', '')} size={200} />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Or enter this secret manually:</p>
                        <code className="block bg-slate-100 p-2 rounded text-xs mt-1">{twoFAData.secret}</code>
                      </div>
                      
                      <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                        <p className="text-sm font-semibold text-amber-800 mb-2">Backup Codes</p>
                        <p className="text-xs text-amber-700 mb-2">Save these codes in a safe place. Each can be used once if you lose your device:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {backupCodes.map((code, i) => (
                            <code key={i} className="bg-white p-2 rounded text-xs text-center">{code}</code>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="backup" className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Local Backup</h3>
              <p className="text-sm text-slate-600 mb-4">
                Export and import your messages and contacts
              </p>
              
              <div className="space-y-3">
                <Button
                  onClick={handleExportBackup}
                  className="w-full"
                  data-testid="export-backup-button"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Backup
                </Button>
                
                <div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                    id="import-backup"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => document.getElementById('import-backup').click()}
                    data-testid="import-backup-button"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import Backup
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <h3 className="font-semibold text-red-800 mb-2">Danger Zone</h3>
              <p className="text-sm text-red-600 mb-4">
                Clear all local data (messages and contacts)
              </p>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (window.confirm('Are you sure? This cannot be undone!')) {
                    await clearAllData();
                    toast.success('All data cleared');
                    window.location.reload();
                  }
                }}
                data-testid="clear-data-button"
              >
                Clear All Data
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}