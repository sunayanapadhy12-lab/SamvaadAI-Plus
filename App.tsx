
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { AppMode, ViewState, TranscriptionEntry, UserProfile, SavedItem, ExplanationLevel, SupportedLanguage, AppNotification } from './types';
import { SYSTEM_INSTRUCTION, MODE_CONFIGS, ONBOARDING_ROLES, ONBOARDING_GOALS, COUNTRIES } from './constants';

// --- Audio Utilities ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const AVATARS = ['👤', '🦁', '🦉', '🦊', '🐼', '🤖'];

interface LanguageOption {
  id: SupportedLanguage;
  label: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'English', label: 'English' },
  { id: 'Hindi', label: 'Hindi (हिंदी)' },
  { id: 'Odia', label: 'Odia (ଓଡ଼ିଆ)' },
  { id: 'Spanish', label: 'Spanish (Español)' },
  { id: 'French', label: 'French (Français)' },
  { id: 'German', label: 'German (Deutsch)' },
  { id: 'Japanese', label: 'Japanese (日本語)' },
  { id: 'Arabic', label: 'Arabic (العربية)' },
  { id: 'Portuguese', label: 'Portuguese (Português)' },
  { id: 'Mandarin', label: 'Mandarin (普通话)' },
];

const ONBOARDING_ROLE_ICONS: Record<string, string> = {
  "Student": "🎓",
  "Job Seeker": "💼",
  "Professional": "👔",
  "Parent": "🏠",
  "Farmer": "🚜"
};

const ProfessionalLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <div className="relative shrink-0">
      <div className="w-10 h-10 bg-gradient-to-br from-indigo-700 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg border border-white/20">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
    </div>
    <div className="flex flex-col">
      <h1 className="text-xl font-black text-slate-900 tracking-tighter leading-none flex items-center gap-1.5 uppercase">
        SAMVAAD <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">AI+</span>
      </h1>
      <span className="text-[8px] font-bold text-slate-400 tracking-[0.3em] mt-1 uppercase">SaaS Enterprise Platform</span>
    </div>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('samvaad_saas_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [view, setView] = useState<ViewState>(user?.onboarded ? ViewState.DASHBOARD : ViewState.ONBOARDING);
  const [onboardingStep, setOnboardingStep] = useState(0);
  
  const [onbName, setOnbName] = useState("");
  const [onbLang, setOnbLang] = useState<SupportedLanguage>('English');
  const [onbCountry, setOnbCountry] = useState("India");
  const [onbRole, setOnbRole] = useState("");
  const [onbGoal, setOnbGoal] = useState("");

  const [savedItems, setSavedItems] = useState<SavedItem[]>(() => {
    const saved = localStorage.getItem('samvaad_saas_saved');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem('samvaad_saas_notifs');
    return saved ? JSON.parse(saved) : [
      { id: '1', type: 'SYSTEM', title: 'Welcome to SamvaadAI+', message: 'Your personalized enterprise assistant is ready.', timestamp: Date.now(), read: false }
    ];
  });
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  
  const [vaultSearch, setVaultSearch] = useState("");
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [learningPlan, setLearningPlan] = useState<string | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [staticPageContent, setStaticPageContent] = useState<{title: string, content: string} | null>(null);

  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoPromptInput, setVideoPromptInput] = useState("");

  const [mobilityTopic, setMobilityTopic] = useState<{title: string, query: string} | null>(null);
  const [mobilityAdvice, setMobilityAdvice] = useState<string | null>(null);
  const [loadingMobility, setLoadingMobility] = useState(false);

  const [recommendedSchemes, setRecommendedSchemes] = useState<string | null>(null);
  const [loadingSchemes, setLoadingSchemes] = useState(false);

  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [currentMode, setCurrentMode] = useState<AppMode>(AppMode.GENERAL);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const inputTransRef = useRef("");
  const outputTransRef = useRef("");

  useEffect(() => {
    if (user) localStorage.setItem('samvaad_saas_user', JSON.stringify(user));
    localStorage.setItem('samvaad_saas_saved', JSON.stringify(savedItems));
    localStorage.setItem('samvaad_saas_notifs', JSON.stringify(notifications));
  }, [user, savedItems, notifications]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (user && view === ViewState.DASHBOARD && !recommendedSchemes) {
      fetchRecommendedSchemes();
    }
  }, [user, view]);

  const handlePermissionError = useCallback((err: any) => {
    const errorMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
    if (errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("Requested entity was not found")) {
      setToast({ message: "Access Denied. Paid API Key required.", type: 'error' });
      const aistudio = (window as any).aistudio;
      if (aistudio?.openSelectKey) aistudio.openSelectKey();
      return true;
    }
    return false;
  }, []);

  const stopSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    
    // Safety check to prevent "Cannot close a closed AudioContext"
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (outAudioContextRef.current && outAudioContextRef.current.state !== 'closed') {
      outAudioContextRef.current.close().catch(() => {});
    }
    
    audioContextRef.current = null;
    outAudioContextRef.current = null;

    sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { } });
    sourcesRef.current.clear();
    setIsRecording(false);
    nextStartTimeRef.current = 0;
  }, []);

  const startSession = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION + `\n\nUSER PROFILE:\nName: ${user?.username}\nCountry: ${user?.country}\nAccountID: ${user?.accountId}\nRole: ${user?.role}\nGoal: ${user?.goal}\nLanguage: ${user?.language}\nCognitive Depth: ${user?.explanationLevel}\n\nStrictly prioritize data and advice for ${user?.country} in the ${user?.language} language.`,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsRecording(true);
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const data = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(data.length);
              for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32768;
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) outputTransRef.current += msg.serverContent.outputTranscription.text;
            if (msg.serverContent?.inputTranscription) inputTransRef.current += msg.serverContent.inputTranscription.text;
            if (msg.serverContent?.interrupted) {
              for (const source of sourcesRef.current) { try { source.stop(); } catch (e) {} }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
            if (msg.serverContent?.turnComplete) {
              const uText = inputTransRef.current;
              const mText = outputTransRef.current;
              if (uText || mText) {
                setTranscriptions(p => [...p,
                  ...(uText ? [{ role: 'user' as const, text: uText, timestamp: Date.now() }] : []),
                  ...(mText ? [{ role: 'model' as const, text: mText, timestamp: Date.now(), confidence: 'High' as const }] : [])
                ]);
              }
              inputTransRef.current = "";
              outputTransRef.current = "";
            }
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outAudioContextRef.current) {
              const ctx = outAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const src = ctx.createBufferSource();
              src.buffer = buffer;
              src.connect(ctx.destination);
              src.onended = () => sourcesRef.current.delete(src);
              src.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              // Fix property access on sourcesRef by adding .current before calling .add()
              sourcesRef.current.add(src);
            }
          },
          onerror: (e: any) => { if (!handlePermissionError(e)) setError("Voice communication interrupted."); stopSession(); },
          onclose: () => stopSession()
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) { if (!handlePermissionError(e)) setError("Microphone access failed."); }
  };

  const fetchRecommendedSchemes = async () => {
    if (!user) return;
    setLoadingSchemes(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Identify top 3 specific government schemes or professional support programs strictly available for a ${user.role} living in ${user.country}.
        Provide title and short description for each.
        IMPORTANT: The entire response MUST be written in the ${user.language} language.`,
      });
      setRecommendedSchemes(response.text || "No active schemes found.");
    } catch (e) { console.error(e); } finally { setLoadingSchemes(false); }
  };

  const handleGenerateVideo = async () => {
    setIsGeneratingVideo(true);
    setView(ViewState.VIDEO_GENERATION);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const finalPrompt = videoPromptInput.trim() || `Enterprise tutorial video about professional growth as a ${user?.role} in ${user?.country}. Inspiring visuals.`;
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: finalPrompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
      });
      while (!operation.done) {
        await new Promise(r => setTimeout(r, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
      }
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await videoResponse.blob();
        setGeneratedVideoUrl(URL.createObjectURL(blob));
        setToast({ message: "Tutorial analysis synthesized!", type: 'success' });
      }
    } catch (e: any) { handlePermissionError(e); setView(ViewState.CAREER_SNAPSHOT); } finally { setIsGeneratingVideo(false); }
  };

  const handleStartLearning = async () => {
    setLoadingPlan(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Synthesize a 30-day professional roadmap for a ${user?.role} specifically in ${user?.country}. 
        Prioritize ${user?.country}-specific certifications, local job boards, and regional resources. 
        IMPORTANT: Use only the ${user?.language} language for the entire plan.`,
      });
      setLearningPlan(response.text || "Roadmap generation failed.");
      setView(ViewState.CAREER_SNAPSHOT);
    } catch (e: any) { handlePermissionError(e); } finally { setLoadingPlan(false); }
  };

  const handleMobilityClick = async (topic: {title: string, query: string}) => {
    setMobilityTopic(topic);
    setLoadingMobility(true);
    setView(ViewState.MOBILITY_DETAIL);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `${topic.query} Analyze specifically for a person in ${user?.country}. Provide a detailed analytical breakdown in ${user?.language}.`,
      });
      setMobilityAdvice(response.text || "Consultation results empty.");
    } catch (e) { console.error(e); setView(ViewState.GLOBAL_MOBILITY); } finally { setLoadingMobility(false); }
  };

  const completeOnboarding = () => {
    const newUser: UserProfile = {
      id: Math.random().toString(36).substring(7),
      accountId: `SVD-${Math.floor(100000 + Math.random() * 900000)}`,
      username: onbName || "User", avatar: AVATARS[0], country: onbCountry,
      language: onbLang, role: onbRole, goal: onbGoal || "General Help", onboarded: true,
      explanationLevel: ExplanationLevel.SIMPLE,
      preferences: { careerAlerts: true, schemeAlerts: true, generalUpdates: true }
    };
    setUser(newUser);
    setView(ViewState.DASHBOARD);
  };

  const restartOnboarding = () => {
    localStorage.clear();
    setUser(null);
    setView(ViewState.ONBOARDING);
    setOnboardingStep(0);
  };

  const handleBookmark = (content: string, type: 'CAREER' | 'SCHEME') => {
    const item: SavedItem = {
      id: Date.now().toString(),
      type, title: content.substring(0, 40) + "...", content,
      timestamp: Date.now(), bookmarked: true
    };
    setSavedItems(p => [item, ...p]);
    setToast({ message: "Stored in Strategy Vault.", type: 'success' });
  };

  // Improved Notification Panel logic
  const NotificationPanel = () => {
    if (!showNotifications) return null;
    return (
      <div className="absolute top-full right-0 mt-3 w-80 bg-white border border-slate-200 rounded-[2rem] shadow-2xl z-[500] overflow-hidden animate-in slide-in-from-top-2 duration-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Alert Center</h3>
          <button 
            onClick={() => {
              setNotifications(notifications.map(n => ({...n, read: true})));
              setShowNotifications(false);
            }} 
            className="text-[10px] font-bold text-indigo-600 hover:underline"
          >
            Clear All
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">No new alerts recorded</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className={`p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${n.read ? 'opacity-40' : ''}`}>
                <div className="flex justify-between items-start">
                  <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                  <span className="text-[8px] text-slate-400 font-bold">{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{n.message}</p>
              </div>
            ))
          )}
        </div>
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
           <button onClick={() => setShowNotifications(false)} className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dismiss Panel</button>
        </div>
      </div>
    );
  };

  const Sidebar = () => (
    <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200 h-screen sticky top-0 p-6 z-[160] shadow-sm">
      <ProfessionalLogo className="mb-10 px-2" />
      <nav className="flex-1 space-y-1">
        {[
          { id: ViewState.DASHBOARD, label: "Dashboard", icon: "📊" },
          { id: ViewState.SAVED, label: "Strategy Vault", icon: "🗄️" },
          { id: ViewState.VOICE_ASSISTANT, label: "Live AI Coach", icon: "🎤", voice: true },
          { id: ViewState.PROFILE, label: "Settings", icon: "⚙️" },
          { id: ViewState.MORE, label: "Resources", icon: "📚" }
        ].map(item => (
          <button 
            key={item.id} 
            onClick={() => { 
              if(isRecording) stopSession(); 
              setView(item.id); 
              if(item.voice) startSession(); 
            }}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl font-bold transition-all ${view === item.id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-sm">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="pt-6 border-t border-slate-100 flex items-center gap-3 px-2">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl shadow-inner">{user?.avatar}</div>
        <div className="flex-1 truncate">
          <p className="font-black text-xs text-slate-900 leading-none truncate">{user?.username}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 truncate">{user?.accountId}</p>
        </div>
      </div>
    </aside>
  );

  const BottomNav = () => (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 p-4 pb-10 flex justify-around items-center z-[140] rounded-t-[2.5rem] shadow-2xl">
      {[
        { id: ViewState.DASHBOARD, icon: "📊" },
        { id: ViewState.SAVED, icon: "🗄️" },
        { id: ViewState.VOICE_ASSISTANT, icon: "🎤", voice: true },
        { id: ViewState.PROFILE, icon: "⚙️" },
        { id: ViewState.MORE, icon: "📚" }
      ].map(item => (
        <button 
          key={item.id} 
          onClick={() => { 
            if(isRecording) stopSession(); 
            setView(item.id); 
            if(item.voice) startSession(); 
          }}
          className={`flex flex-col items-center gap-1 transition-all ${view === item.id ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}
        >
          {item.voice ? (
            <div className={`p-4 rounded-2xl text-white -mt-16 shadow-xl ring-8 ring-slate-50 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-indigo-600'}`}>
              <span className="text-2xl">🎤</span>
            </div>
          ) : (
            <span className="text-2xl p-2">{item.icon}</span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 font-['Outfit'] overflow-hidden">
      {view !== ViewState.ONBOARDING && <Sidebar />}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {view !== ViewState.ONBOARDING && view !== ViewState.VOICE_ASSISTANT && (
          <header className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center z-[150] shadow-sm">
             <div className="md:hidden"><ProfessionalLogo /></div>
             <h2 className="hidden md:block text-lg font-black uppercase tracking-widest text-slate-400">
               {view.replace(/_/g, ' ')}
               <span className="ml-2 inline-block w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
             </h2>
             <div className="flex gap-4 relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)} 
                  className={`p-2.5 border rounded-xl transition-all relative ${showNotifications ? 'bg-indigo-100 border-indigo-200' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}
                >
                  <span className="text-lg">🔔</span>
                  {notifications.some(n => !n.read) && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
                </button>
                <NotificationPanel />
             </div>
          </header>
        )}
        <main className={`flex-1 overflow-y-auto ${view === ViewState.ONBOARDING || view === ViewState.VOICE_ASSISTANT ? '' : 'p-6 md:p-12 pb-32'}`}>
          <div className="max-w-7xl mx-auto w-full">
            {view === ViewState.ONBOARDING && <OnboardingView 
              onboardingStep={onboardingStep} 
              setOnboardingStep={setOnboardingStep} 
              onbName={onbName} setOnbName={setOnbName} 
              onbCountry={onbCountry} setOnbCountry={setOnbCountry} 
              onbLang={onbLang} setOnbLang={setOnbLang} 
              onbRole={onbRole} setOnbRole={setOnbRole} 
              onbGoal={onbGoal} setOnbGoal={setOnbGoal} 
              completeOnboarding={completeOnboarding} 
            />}
            {view === ViewState.DASHBOARD && <DashboardView 
              user={user} 
              setView={setView} 
              setCurrentMode={setCurrentMode} 
              recommendedSchemes={recommendedSchemes} 
              loadingSchemes={loadingSchemes} 
            />}
            {view === ViewState.SAVED && <SavedView 
              savedItems={savedItems} 
              setSavedItems={setSavedItems} 
              vaultSearch={vaultSearch} 
              setVaultSearch={setVaultSearch} 
              setLearningPlan={setLearningPlan} 
              setView={setView} 
            />}
            {view === ViewState.CAREER_SNAPSHOT && <CareerSnapshotView 
              user={user}
              setView={setView} 
              loadingPlan={loadingPlan} 
              learningPlan={learningPlan} 
              handleSavePlan={() => handleBookmark(learningPlan!, 'CAREER')} 
              handleGenerateVideo={handleGenerateVideo} 
              handleStartLearning={handleStartLearning} 
              videoPromptInput={videoPromptInput} 
              setVideoPromptInput={setVideoPromptInput} 
            />}
            {view === ViewState.PROFILE && <ProfileView 
              user={user} 
              setUser={setUser} 
              LANGUAGE_OPTIONS={LANGUAGE_OPTIONS} 
              ExplanationLevel={ExplanationLevel} 
              restartOnboarding={restartOnboarding} 
              setToast={setToast} 
            />}
            {view === ViewState.VOICE_ASSISTANT && <VoiceAssistantView 
              transcriptions={transcriptions} 
              setTranscriptions={setTranscriptions} 
              isRecording={isRecording} 
              stopSession={stopSession} 
              startSession={startSession} 
              currentMode={currentMode} 
              setView={setView} 
              handleBookmark={handleBookmark} 
            />}
            {view === ViewState.MORE && <MoreView 
              setView={setView} 
              setStaticPageContent={setStaticPageContent} 
              setShowFeedbackModal={setShowFeedbackModal} 
            />}
            {view === ViewState.STATIC_PAGE && <StaticPageView 
              setView={setView} 
              staticPageContent={staticPageContent} 
            />}
            {view === ViewState.GLOBAL_MOBILITY && <GlobalMobilityView 
              handleMobilityClick={handleMobilityClick} 
              user={user} 
              setView={setView} 
            />}
            {view === ViewState.MOBILITY_DETAIL && <MobilityDetailView 
              mobilityTopic={mobilityTopic} 
              loadingMobility={loadingMobility} 
              mobilityAdvice={mobilityAdvice} 
              setView={setView} 
              handleBookmark={handleBookmark} 
              setToast={setToast} 
            />}
            {view === ViewState.VIDEO_GENERATION && <VideoGenerationView 
              isGeneratingVideo={isGeneratingVideo} 
              generatedVideoUrl={generatedVideoUrl} 
              setView={setView} 
            />}
            {view === ViewState.RESOURCE_VIDEOS && <ResourceVideosView 
              user={user} 
              setActiveVideoId={setActiveVideoId} 
              setView={setView} 
            />}
          </div>
        </main>
        {view !== ViewState.ONBOARDING && view !== ViewState.VOICE_ASSISTANT && <BottomNav />}
      </div>

      <FeedbackModal 
        showFeedbackModal={showFeedbackModal} 
        setShowFeedbackModal={setShowFeedbackModal} 
        feedbackSubmitted={feedbackSubmitted} 
        setFeedbackSubmitted={setFeedbackSubmitted} 
      />

      {toast && (
        <div className="fixed bottom-24 md:bottom-12 right-6 md:right-12 p-5 bg-slate-900 text-white rounded-[1.5rem] shadow-2xl z-[1000] border border-white/10 animate-in slide-in-from-right-10">
          <div className="flex items-center gap-3 font-bold text-sm">
            {toast.type === 'success' ? '✅' : '⚠️'} {toast.message}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed top-20 right-6 w-full max-w-sm bg-red-600 text-white p-5 rounded-[1.5rem] shadow-2xl z-[2000] border-2 border-white/20 animate-bounce">
          <p className="font-black text-xs uppercase tracking-widest">{error}</p>
          <button onClick={() => setError(null)} className="absolute top-2 right-2 p-2">×</button>
        </div>
      )}

      {activeVideoId && (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl aspect-video bg-black rounded-[2rem] overflow-hidden shadow-2xl">
            <button onClick={() => setActiveVideoId(null)} className="absolute top-4 right-4 z-10 p-3 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md">×</button>
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideoId}?autoplay=1`} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-Components ---

const OnboardingView = ({ onboardingStep, setOnboardingStep, onbName, setOnbName, onbCountry, setOnbCountry, onbLang, setOnbLang, onbRole, setOnbRole, completeOnboarding }: any) => {
  if (onboardingStep === 0) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-10 animate-in fade-in">
      <ProfessionalLogo className="scale-150 mb-16" />
      <div className="w-full max-w-md space-y-6">
        <h2 className="text-4xl font-black tracking-tighter text-slate-900">Configure Identity</h2>
        <div className="space-y-4">
          <input value={onbName} onChange={e => setOnbName(e.target.value)} placeholder="Full Name" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
          <select value={onbCountry} onChange={e => setOnbCountry(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={onbLang} onChange={e => setOnbLang(e.target.value as any)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
            {LANGUAGE_OPTIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <button onClick={() => setOnboardingStep(1)} className="w-full p-6 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl shadow-indigo-200 active:scale-95 transition-all">Continue Focus Setup</button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white p-10 animate-in slide-in-from-right">
      <div className="w-full max-w-lg space-y-10">
        <h2 className="text-4xl font-black text-center tracking-tighter">Define Enterprise Role</h2>
        <div className="grid grid-cols-2 gap-4">
          {ONBOARDING_ROLES.map(r => (
            <button key={r} onClick={() => setOnbRole(r)} className={`p-8 border-2 rounded-[2rem] font-black transition-all flex flex-col items-center gap-4 ${onbRole === r ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
              <span className="text-4xl">{ONBOARDING_ROLE_ICONS[r] || '👤'}</span>
              <span className="text-sm uppercase tracking-widest">{r}</span>
            </button>
          ))}
        </div>
        <button onClick={completeOnboarding} className="w-full p-7 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] shadow-2xl active:scale-95 transition-all">Initialize SaaS Profile</button>
      </div>
    </div>
  );
};

const DashboardView = ({ user, setView, setCurrentMode, recommendedSchemes, loadingSchemes }: any) => (
  <div className="space-y-12">
    <div className="bg-gradient-to-br from-indigo-800 to-indigo-600 p-12 md:p-16 rounded-[4rem] text-white shadow-2xl relative overflow-hidden group">
      <div className="relative z-10 space-y-4">
        <span className="text-xs font-black uppercase tracking-[0.4em] opacity-40">Account Dashboard</span>
        <h2 className="text-5xl md:text-6xl font-black tracking-tighter leading-tight">Welcome back, <br/> {user?.username}</h2>
        <div className="flex gap-4 pt-4">
           <span className="px-4 py-1.5 bg-white/10 rounded-full border border-white/20 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">{user?.country} Tier</span>
           <span className="px-4 py-1.5 bg-white/10 rounded-full border border-white/20 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">{user?.role}</span>
        </div>
      </div>
      <div className="absolute -right-20 -top-20 w-80 h-80 bg-white/10 rounded-full blur-[100px] group-hover:bg-white/20 transition-all"></div>
    </div>

    <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      {[
        { id: AppMode.CAREER, title: "Career Coach AI", desc: "Enterprise roadmap synthesis.", icon: "🚀", color: "hover:border-orange-200", view: ViewState.VOICE_ASSISTANT },
        { id: AppMode.SCHEME, title: "Benefit Logic Engine", desc: "Real-time scheme validation.", icon: "🏛️", color: "hover:border-emerald-200", view: ViewState.VOICE_ASSISTANT },
        { id: null, title: "Global Mobility Hub", desc: "Cross-border migration intel.", icon: "🌍", color: "hover:border-indigo-200", view: ViewState.GLOBAL_MOBILITY }
      ].map((card, i) => (
        <button 
          key={i} 
          onClick={() => {
            if(card.id) setCurrentMode(card.id);
            setView(card.view);
          }}
          className={`p-10 bg-white border border-slate-100 rounded-[3rem] text-left hover:shadow-2xl hover:-translate-y-2 transition-all group ${card.color}`}
        >
          <div className="text-5xl mb-6 group-hover:scale-110 transition-transform">{card.icon}</div>
          <h4 className="text-2xl font-black tracking-tight text-slate-900">{card.title}</h4>
          <p className="text-slate-400 font-medium text-sm mt-2">{card.desc}</p>
        </button>
      ))}
    </section>

    <section className="bg-indigo-50/50 p-10 rounded-[4rem] border border-indigo-100 shadow-sm">
       <div className="flex items-center justify-between mb-8 px-2">
          <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest">Regional Compliance & Benefits ({user?.language})</h3>
          {loadingSchemes && <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>}
       </div>
       <div className="bg-white p-10 rounded-[3rem] border border-indigo-100 shadow-sm leading-relaxed">
          {recommendedSchemes ? (
            <div className="whitespace-pre-wrap font-medium text-slate-700 text-sm">{recommendedSchemes}</div>
          ) : (
             <div className="py-12 text-center space-y-4">
                <div className="text-4xl animate-pulse">🏛️</div>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Scanning regional legislative registries in {user?.country}...</p>
             </div>
          )}
       </div>
    </section>
  </div>
);

const CareerSnapshotView = ({ user, setView, loadingPlan, learningPlan, handleSavePlan, handleGenerateVideo, handleStartLearning, videoPromptInput, setVideoPromptInput }: any) => (
  <div className="space-y-10 animate-in slide-in-from-right">
    <div className="flex items-center gap-6">
      <button onClick={() => setView(ViewState.DASHBOARD)} className="p-4 bg-white border rounded-2xl shadow-sm hover:bg-slate-50">←</button>
      <h2 className="text-4xl font-black tracking-tighter">Strategic Career Roadmap for {user?.country}</h2>
    </div>
    {loadingPlan ? (
      <div className="p-32 bg-white border border-slate-100 rounded-[4rem] text-center flex flex-col items-center gap-8 shadow-inner">
        <div className="w-20 h-20 border-[6px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Synthesizing roadmap in {user?.language}...</p>
      </div>
    ) : learningPlan ? (
      <div className="grid lg:grid-cols-3 gap-10 items-start">
        <div className="lg:col-span-2 bg-white p-12 border border-slate-100 rounded-[4rem] whitespace-pre-wrap leading-loose text-slate-700 font-medium text-lg shadow-sm border-l-8 border-indigo-600">
          {learningPlan}
          <button onClick={handleSavePlan} className="mt-12 w-full p-6 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl shadow-indigo-200">Archive Strategy</button>
        </div>
        <div className="bg-white p-10 border border-slate-100 rounded-[3rem] space-y-8 shadow-sm">
          <div className="space-y-2">
            <h3 className="text-lg font-black tracking-tight">AI Tutorial Synthesis</h3>
            <p className="text-xs text-slate-400 font-medium">Render a video summary based on this path.</p>
          </div>
          <textarea 
            value={videoPromptInput} 
            onChange={e => setVideoPromptInput(e.target.value)} 
            placeholder="Customize your video explainer prompt..." 
            className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[2rem] h-48 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium resize-none shadow-inner" 
          />
          <button onClick={handleGenerateVideo} className="w-full p-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all">Render AI Tutorial</button>
          <button onClick={() => setView(ViewState.RESOURCE_VIDEOS)} className="w-full p-5 bg-indigo-50 text-indigo-700 rounded-[2rem] font-black uppercase tracking-widest text-[10px]">Access Video Library</button>
        </div>
      </div>
    ) : (
      <div className="p-24 bg-white border border-slate-100 rounded-[4rem] text-center space-y-8 shadow-sm">
        <div className="text-8xl animate-bounce">🚀</div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black">Build Your Path</h3>
          <p className="text-slate-400 font-medium text-sm">Create a personalized roadmap for your career in {user?.country}.</p>
        </div>
        <button onClick={handleStartLearning} className="px-12 py-6 bg-indigo-600 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs shadow-2xl active:scale-95 transition-all">Synthesize Roadmap</button>
      </div>
    )}
  </div>
);

const SavedView = ({ savedItems, setSavedItems, vaultSearch, setVaultSearch, setLearningPlan, setView }: any) => (
  <div className="space-y-10">
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 px-2">
      <div>
        <h2 className="text-4xl font-black tracking-tighter text-slate-900">Enterprise Vault</h2>
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] mt-2">Private Strategy Repository</p>
      </div>
      <div className="relative w-full md:w-96">
        <input 
          value={vaultSearch} 
          onChange={e => setVaultSearch(e.target.value)} 
          placeholder="Search items..." 
          className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-[2rem] shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium" 
        />
        <span className="absolute left-6 top-6 text-2xl opacity-30">🔍</span>
      </div>
    </div>
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      {savedItems.length === 0 ? (
        <div className="col-span-full py-40 text-center bg-white rounded-[4rem] border border-dashed border-slate-200">
           <div className="text-8xl opacity-10 mb-6">🗄️</div>
           <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Vault is empty</p>
        </div>
      ) : (
        savedItems.filter((i: any) => i.title.toLowerCase().includes(vaultSearch.toLowerCase())).map((item: any) => (
          <div key={item.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col group">
            <span className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full self-start mb-6 ${item.type === 'CAREER' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>{item.type}</span>
            <h4 className="font-bold text-xl mb-4 group-hover:text-indigo-600 transition-colors">{item.title}</h4>
            <p className="text-slate-500 text-sm line-clamp-4 leading-relaxed font-medium mb-8 flex-1">{item.content}</p>
            <div className="flex gap-4 pt-6 border-t border-slate-50">
               <button onClick={() => { setLearningPlan(item.content); setView(ViewState.CAREER_SNAPSHOT); }} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">Inspect</button>
               <button onClick={() => setSavedItems((p: any) => p.filter((i: any) => i.id !== item.id))} className="p-4 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all">🗑️</button>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

const ProfileView = ({ user, setUser, LANGUAGE_OPTIONS, ExplanationLevel, restartOnboarding, setToast }: any) => (
  <div className="space-y-10">
    <div className="bg-white p-12 rounded-[4rem] border border-slate-200 shadow-sm space-y-12 max-w-4xl mx-auto">
      <div className="flex items-center gap-8 pb-12 border-b border-slate-100">
        <div className="w-32 h-32 rounded-[3rem] bg-indigo-100 flex items-center justify-center text-6xl shadow-inner border-4 border-white">{user?.avatar}</div>
        <div>
          <h3 className="text-4xl font-black tracking-tighter">{user?.username}</h3>
          <p className="text-indigo-600 font-black uppercase tracking-[0.4em] text-[10px] mt-2">Enterprise ID: {user?.accountId}</p>
          <p className="text-slate-400 font-bold uppercase text-[10px] mt-1">Country: {user?.country}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-10">
        <div className="space-y-4">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">SaaS Language</label>
          <select value={user?.language} onChange={e => setUser({...user, language: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] outline-none font-medium">
            {LANGUAGE_OPTIONS.map((l: any) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div className="space-y-4">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Explanation Depth</label>
          <div className="flex bg-slate-50 p-1.5 rounded-[1.5rem] border border-slate-200">
            <button onClick={() => setUser({...user, explanationLevel: ExplanationLevel.SIMPLE})} className={`flex-1 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${user?.explanationLevel === ExplanationLevel.SIMPLE ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'}`}>Simple</button>
            <button onClick={() => setUser({...user, explanationLevel: ExplanationLevel.DETAILED})} className={`flex-1 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${user?.explanationLevel === ExplanationLevel.DETAILED ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'}`}>Detailed</button>
          </div>
        </div>
      </div>
      <div className="pt-8 border-t border-slate-100">
        <button onClick={restartOnboarding} className="w-full p-6 border-2 border-red-50 text-red-500 rounded-[2rem] font-black uppercase tracking-[0.3em] text-[11px] hover:bg-red-50 transition-colors">Logout & Clear Profile</button>
      </div>
    </div>
  </div>
);

const VoiceAssistantView = ({ transcriptions, setTranscriptions, isRecording, stopSession, startSession, currentMode, setView, handleBookmark }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcriptions]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white relative">
      <div className="p-8 md:p-12 flex justify-between items-center bg-slate-900/50 backdrop-blur-3xl border-b border-white/5 sticky top-0 z-20">
        <button onClick={() => { stopSession(); setView(ViewState.DASHBOARD); }} className="p-4 bg-white/10 rounded-2xl hover:bg-white/20 transition-all active:scale-90 text-2xl">×</button>
        <div className="text-center">
          <div className="font-black uppercase tracking-[0.5em] text-indigo-400 text-xs">{currentMode} SESSION</div>
        </div>
        <button onClick={() => setTranscriptions([])} className="text-[10px] font-black opacity-30 uppercase hover:opacity-100 transition-opacity">Clear</button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 md:p-20 flex flex-col-reverse space-y-10 custom-scrollbar">
        <div ref={scrollRef} />
        {[...transcriptions].reverse().map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-6 duration-500`}>
            <div className={`p-8 rounded-[3rem] max-w-[85%] md:max-w-[65%] leading-relaxed text-lg shadow-2xl ${t.role === 'user' ? 'bg-indigo-600 rounded-tr-none' : 'bg-slate-900 rounded-tl-none border border-white/10'}`}>
              {t.text}
              {t.role === 'model' && (
                <div className="mt-8 pt-8 border-t border-white/5 flex justify-end items-center">
                  <button onClick={() => handleBookmark(t.text, currentMode === AppMode.SCHEME ? 'SCHEME' : 'CAREER')} className="text-[10px] font-black text-indigo-400 uppercase tracking-widest border border-indigo-400/20 px-4 py-2 rounded-xl hover:bg-indigo-400/10">Vault</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-12 md:p-20 border-t border-white/5 bg-slate-900/80 backdrop-blur-3xl flex flex-col items-center">
        <div className="relative mb-6">
          {isRecording && <div className="absolute inset-0 bg-red-500/20 rounded-full blur-[60px] animate-pulse"></div>}
          <button onClick={isRecording ? stopSession : startSession} className={`w-32 h-32 rounded-[4rem] flex items-center justify-center transition-all shadow-[0_25px_60px_rgba(0,0,0,0.5)] relative z-10 active:scale-90 ${isRecording ? 'bg-red-500 scale-110' : 'bg-indigo-600 hover:scale-105'}`}>
            <span className="text-5xl">{isRecording ? '⏹️' : '🎤'}</span>
          </button>
        </div>
        <div className="text-[12px] font-black opacity-30 uppercase tracking-[0.6em]">{isRecording ? "Listening..." : "Tap to Speak"}</div>
      </div>
    </div>
  );
};

const MoreView = ({ setView, setStaticPageContent, setShowFeedbackModal }: any) => (
  <div className="grid md:grid-cols-2 gap-8">
    {[
      { title: "Technical Support", desc: "Priority assistance.", content: "Enterprise support: support@samvaad-ai.plus." },
      { title: "Legal Terms", desc: "SaaS agreement.", content: "Standard Enterprise EULA applies. Advice provided by AI should be validated with local national portals." },
      { title: "Privacy Policy", desc: "Data standards.", content: "Encryption enabled. No personal data shared with third parties." },
      { title: "System Feedback", desc: "UX performance.", action: () => setShowFeedbackModal(true) }
    ].map((item, i) => (
      <button key={i} onClick={() => { if(item.action) item.action(); else { setStaticPageContent({title: item.title, content: item.content}); setView(ViewState.STATIC_PAGE); } }} className="p-10 bg-white border border-slate-100 rounded-[3.5rem] text-left hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col h-full group">
        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl mb-8 shadow-inner">📄</div>
        <h4 className="text-2xl font-black tracking-tight text-slate-900 flex-1">{item.title}</h4>
        <p className="text-slate-400 font-medium text-sm mt-4">{item.desc}</p>
        <span className="mt-8 text-[10px] font-black text-indigo-600 uppercase tracking-widest">Details →</span>
      </button>
    ))}
  </div>
);

const StaticPageView = ({ setView, staticPageContent }: any) => (
  <div className="bg-white p-12 md:p-20 border border-slate-100 rounded-[4rem] min-h-[60vh] shadow-sm animate-in fade-in">
    <button onClick={() => setView(ViewState.MORE)} className="mb-12 p-5 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-white transition-all shadow-sm">← Back</button>
    <h2 className="text-5xl font-black mb-12 tracking-tighter text-slate-900 border-l-8 border-indigo-600 pl-10">{staticPageContent?.title}</h2>
    <div className="leading-[2] text-xl text-slate-600 font-medium max-w-4xl">{staticPageContent?.content}</div>
  </div>
);

const GlobalMobilityView = ({ handleMobilityClick, user, setView }: any) => (
  <div className="space-y-12">
    <div className="flex items-center gap-6">
      <button onClick={() => setView(ViewState.DASHBOARD)} className="p-4 bg-white border rounded-2xl shadow-sm hover:bg-slate-50">←</button>
      <h2 className="text-4xl font-black tracking-tighter">Global Opportunity Hub</h2>
    </div>
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      {[
        { title: "Academic Validation", icon: "✅", query: `educational credential validation for migration from ${user?.country}` },
        { title: "Skilled Migration Paths", icon: "🛂", query: `specific visa paths for ${user?.role} roles moving from ${user?.country}` },
        { title: "Global Job Markets", icon: "📊", query: `top high-growth markets for ${user?.role} moving from ${user?.country}` }
      ].map((topic, i) => (
        <button key={i} onClick={() => handleMobilityClick(topic)} className="p-10 bg-white border border-slate-100 rounded-[3.5rem] text-left hover:shadow-2xl transition-all flex flex-col gap-6 group">
          <div className="text-6xl group-hover:scale-110 transition-transform shadow-inner bg-slate-50 w-24 h-24 rounded-3xl flex items-center justify-center">{topic.icon}</div>
          <h4 className="font-black text-2xl tracking-tight text-slate-900">{topic.title}</h4>
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-4">Initiate Consultation →</span>
        </button>
      ))}
    </div>
  </div>
);

const MobilityDetailView = ({ mobilityTopic, loadingMobility, mobilityAdvice, setView, handleBookmark, setToast }: any) => (
  <div className="space-y-10 animate-in fade-in">
    <button onClick={() => setView(ViewState.GLOBAL_MOBILITY)} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">← Back</button>
    {loadingMobility ? (
      <div className="p-32 bg-white border border-slate-100 rounded-[4rem] text-center flex flex-col items-center gap-8 min-h-[500px] justify-center">
         <div className="w-24 h-24 border-[6px] border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
         <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Consulting global database...</p>
      </div>
    ) : (
      <div className="bg-white p-12 md:p-20 border border-slate-100 rounded-[4rem] shadow-2xl border-l-[12px] border-indigo-600">
        <h2 className="text-5xl font-black mb-12 tracking-tighter text-slate-900">{mobilityTopic?.title}</h2>
        <div className="whitespace-pre-wrap leading-[2.2] text-slate-700 text-lg font-medium">{mobilityAdvice}</div>
        <button onClick={() => { handleBookmark(mobilityAdvice, 'CAREER'); }} className="mt-12 w-full p-7 bg-indigo-600 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] shadow-2xl active:scale-95 transition-all">Archive Professional Intel</button>
      </div>
    )}
  </div>
);

const VideoGenerationView = ({ isGeneratingVideo, generatedVideoUrl, setView }: any) => (
  <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-12 animate-in fade-in">
    {isGeneratingVideo ? (
      <>
        <div className="w-32 h-32 border-[8px] border-indigo-600/20 border-t-indigo-500 rounded-full animate-spin"></div>
        <h2 className="text-5xl font-black tracking-tighter">Synthesizing Visual Intelligence...</h2>
      </>
    ) : (
      <div className="w-full max-w-5xl space-y-12">
        <h2 className="text-5xl font-black tracking-tighter">Analysis Synthesized</h2>
        <div className="rounded-[4rem] overflow-hidden border-[16px] border-white/10 shadow-2xl bg-slate-900 aspect-video w-full">
          <video src={generatedVideoUrl} controls autoPlay className="w-full h-full object-cover" />
        </div>
        <button onClick={() => setView(ViewState.CAREER_SNAPSHOT)} className="px-16 py-7 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.4em] text-[12px] shadow-2xl hover:scale-105 active:scale-95 transition-all">Back to Hub</button>
      </div>
    )}
  </div>
);

const ResourceVideosView = ({ user, setActiveVideoId, setView }: any) => (
  <div className="space-y-10">
    <button onClick={() => setView(ViewState.CAREER_SNAPSHOT)} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">←</button>
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
      {[
        {title: `Modern Farming in ${user?.country}`, yid: "NidjE1Kx65Y", thumb: "🎥"},
        {title: `Job Trends: ${user?.country} 2025`, yid: "vMiZ9Kz6oYI", thumb: "💻"},
        {title: "Professional Milestones", yid: "pQN-pnXPaVg", thumb: "🛠️"},
        {title: "Global Intelligence Review", yid: "_5u7vFvD6vE", thumb: "📈"}
      ].map((v, i) => (
        <div key={i} onClick={() => setActiveVideoId(v.yid)} className="bg-white p-10 rounded-[3rem] border border-slate-100 cursor-pointer hover:shadow-xl transition-all flex flex-col items-center text-center group">
          <div className="text-7xl mb-6 group-hover:scale-110 transition-transform shadow-inner bg-slate-50 w-24 h-24 rounded-3xl flex items-center justify-center">{v.thumb}</div>
          <h4 className="font-black text-lg tracking-tight text-slate-900 flex-1">{v.title}</h4>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-6">Certified Content</p>
        </div>
      ))}
    </div>
  </div>
);

const FeedbackModal = ({ showFeedbackModal, setShowFeedbackModal, feedbackSubmitted, setFeedbackSubmitted }: any) => {
  if (!showFeedbackModal) return null;
  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-3xl flex items-center justify-center p-10 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-xl rounded-[5rem] p-20 space-y-16 text-center shadow-2xl">
        <h3 className="text-5xl font-black tracking-tighter">System Utility Feedback</h3>
        {feedbackSubmitted ? (
          <div className="animate-in zoom-in duration-500 py-10">
             <div className="text-9xl mb-8">✨</div>
             <p className="text-indigo-600 font-black uppercase tracking-[0.4em] text-sm">Feedback Transmitted</p>
          </div>
        ) : (
          <div className="flex justify-between gap-6">
            {['😞', '😐', '😊', '🤩', '🔥'].map(e => <button key={e} onClick={() => setFeedbackSubmitted(true)} className="text-7xl p-4 hover:scale-125 transition-transform grayscale hover:grayscale-0">{e}</button>)}
          </div>
        )}
        <button onClick={() => { setShowFeedbackModal(false); setFeedbackSubmitted(false); }} className="w-full py-7 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-[12px] shadow-2xl active:scale-95 transition-all">Dismiss Console</button>
      </div>
    </div>
  );
};

export default App;
