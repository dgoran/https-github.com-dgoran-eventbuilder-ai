import React from 'react';
import { EventPlan, SystemConfig } from '../types';
import { Button, Input, Card } from './UIComponents';

interface AdminViewProps {
  isAdminLoggedIn: boolean;
  adminPassword: string;
  setAdminPassword: (p: string) => void;
  handleAdminLogin: (e: React.FormEvent) => void;
  setView: (view: 'dashboard' | 'create' | 'preview' | 'admin') => void;
  activeTab: 'details' | 'registrants';
  setActiveTab: (tab: 'details' | 'registrants') => void;
  setIsAdminLoggedIn: (is: boolean) => void;
  events: EventPlan[];
  selectedEventIds: string[];
  handleBulkDelete: () => void;
  selectAllEvents: () => void;
  toggleEventSelection: (id: string) => void;
  systemConfig: SystemConfig;
  setSystemConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  handleSaveSystemConfig: () => void;
  isSavingConfig: boolean;
  handleTestEmail: () => void;
  isTestingEmail: boolean;
}

export const AdminView: React.FC<AdminViewProps> = ({
  isAdminLoggedIn,
  adminPassword,
  setAdminPassword,
  handleAdminLogin,
  setView,
  activeTab,
  setActiveTab,
  setIsAdminLoggedIn,
  events,
  selectedEventIds,
  handleBulkDelete,
  selectAllEvents,
  toggleEventSelection,
  systemConfig,
  setSystemConfig,
  handleSaveSystemConfig,
  isSavingConfig,
  handleTestEmail,
  isTestingEmail
}) => {
  if (!isAdminLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
         <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">Superadmin Login</h2>
            <form onSubmit={handleAdminLogin} className="space-y-6">
               <Input type="password" label="Password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
               <Button type="submit" className="w-full">Login</Button>
               <div className="text-center"><button type="button" onClick={() => setView('dashboard')} className="text-sm text-gray-500">Back to Dashboard</button></div>
            </form>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
       <aside className="w-full md:w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col p-4">
          <div className="font-bold text-lg mb-6">SuperAdmin</div>
          <div className="space-y-2">
             <button onClick={() => setActiveTab('details')} className={`w-full text-left px-4 py-2 rounded ${activeTab === 'details' ? 'bg-slate-800' : ''}`}>Webinars</button>
             <button onClick={() => setActiveTab('registrants')} className={`w-full text-left px-4 py-2 rounded ${activeTab === 'registrants' ? 'bg-slate-800' : ''}`}>API Settings</button>
          </div>
          <button onClick={() => { setIsAdminLoggedIn(false); setView('dashboard'); }} className="mt-auto pt-4">Logout</button>
       </aside>

       <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'details' ? (
             <div className="space-y-6">
                <div className="flex justify-between">
                   <div>{events.length} Webinars</div>
                   {selectedEventIds.length > 0 && <Button variant="danger" onClick={handleBulkDelete}>Delete Selected ({selectedEventIds.length})</Button>}
                </div>
                <div className="bg-white rounded shadow overflow-hidden">
                   <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                         <tr>
                            <th className="px-6 py-3 text-left"><input type="checkbox" checked={events.length > 0 && selectedEventIds.length === events.length} onChange={selectAllEvents} /></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reg</th>
                         </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                         {events.map((evt) => (
                            <tr key={evt.id}>
                               <td className="px-6 py-4"><input type="checkbox" checked={selectedEventIds.includes(evt.id)} onChange={() => toggleEventSelection(evt.id)} /></td>
                               <td className="px-6 py-4 text-sm font-medium text-gray-900">{evt.title}</td>
                               <td className="px-6 py-4 text-sm text-gray-500">{evt.date}</td>
                               <td className="px-6 py-4 text-sm text-gray-500">{evt.registrants?.length || 0}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          ) : (
             <div className="max-w-2xl">
                <Card title="System Configuration">
                   <div className="space-y-6">
                      <Input label="Gemini AI API Key" type="password" placeholder={systemConfig.geminiApiKey === '********' ? '********' : "Update Key"} value={systemConfig.geminiApiKey} onChange={(e) => setSystemConfig({...systemConfig, geminiApiKey: e.target.value})} />
                      
                      <div className="border-t pt-4 mt-4">
                         <h4 className="font-bold mb-4">Integration Keys</h4>
                         <div className="space-y-4">
                            <Input label="BigMarker API Key" type="password" placeholder={systemConfig.bigMarkerApiKey === '********' ? '********' : "Update Key"} value={systemConfig.bigMarkerApiKey} onChange={(e) => setSystemConfig({...systemConfig, bigMarkerApiKey: e.target.value})} />
                            <Input label="Zoom JWT/OAuth" type="password" placeholder={systemConfig.zoomApiKey === '********' ? '********' : "Update Token"} value={systemConfig.zoomApiKey} onChange={(e) => setSystemConfig({...systemConfig, zoomApiKey: e.target.value})} />
                            <Input label="Vimeo API Key" type="password" placeholder={systemConfig.vimeoApiKey === '********' ? '********' : "Update Key"} value={systemConfig.vimeoApiKey} onChange={(e) => setSystemConfig({...systemConfig, vimeoApiKey: e.target.value})} />
                         </div>
                      </div>

                      <div className="border-t pt-4 mt-4">
                         <h4 className="font-bold mb-4">Email (SMTP) Settings</h4>
                         <p className="text-xs text-gray-500 mb-4">Configure SMTP to send registration confirmation emails for non-integrated events.</p>
                         <div className="grid grid-cols-2 gap-4">
                            <Input label="SMTP Host" placeholder="smtp.example.com" value={systemConfig.smtpHost} onChange={(e) => setSystemConfig({...systemConfig, smtpHost: e.target.value})} />
                            <Input label="SMTP Port" placeholder="587" value={systemConfig.smtpPort} onChange={(e) => setSystemConfig({...systemConfig, smtpPort: e.target.value})} />
                            <Input label="SMTP User" placeholder="user@example.com" value={systemConfig.smtpUser} onChange={(e) => setSystemConfig({...systemConfig, smtpUser: e.target.value})} />
                            <Input label="SMTP Password" type="password" placeholder={systemConfig.smtpPass === '********' ? '********' : "Enter Password"} value={systemConfig.smtpPass} onChange={(e) => setSystemConfig({...systemConfig, smtpPass: e.target.value})} />
                         </div>
                         <div className="mt-2">
                            <Input label="From Address (Optional)" placeholder='"Webinar Host" <noreply@example.com>' value={systemConfig.smtpFrom} onChange={(e) => setSystemConfig({...systemConfig, smtpFrom: e.target.value})} />
                         </div>
                      </div>
                      
                      <div className="pt-4 flex justify-end gap-3">
                         <Button onClick={handleTestEmail} variant="secondary" isLoading={isTestingEmail}>Test Email</Button>
                         <Button onClick={handleSaveSystemConfig} isLoading={isSavingConfig}>Save Configuration</Button>
                      </div>
                   </div>
                </Card>
             </div>
          )}
       </main>
    </div>
  );
};