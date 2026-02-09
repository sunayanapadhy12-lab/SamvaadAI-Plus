export enum AppMode {
  GENERAL = 'GENERAL',
  CAREER = 'CAREER',
  SCHEME = 'SCHEME'
}

export enum ViewState {
  ONBOARDING = 'ONBOARDING',
  DASHBOARD = 'DASHBOARD',
  VOICE_ASSISTANT = 'VOICE_ASSISTANT',
  CAREER_SNAPSHOT = 'CAREER_SNAPSHOT',
  SAVED = 'SAVED',
  PROFILE = 'PROFILE',
  MORE = 'MORE',
  SCHEME_DETAILS = 'SCHEME_DETAILS',
  RESOURCE_VIDEOS = 'RESOURCE_VIDEOS',
  RESOURCE_EBOOK = 'RESOURCE_EBOOK',
  APPLY_SCHEME = 'APPLY_SCHEME',
  STATIC_PAGE = 'STATIC_PAGE',
  CHAPTER_DETAIL = 'CHAPTER_DETAIL',
  VIDEO_GENERATION = 'VIDEO_GENERATION',
  GLOBAL_MOBILITY = 'GLOBAL_MOBILITY',
  MOBILITY_DETAIL = 'MOBILITY_DETAIL'
}

export enum ExplanationLevel {
  SIMPLE = 'SIMPLE',
  DETAILED = 'DETAILED'
}

export type SupportedLanguage = 
  | 'English' 
  | 'Hindi' 
  | 'Odia' 
  | 'Spanish' 
  | 'French' 
  | 'German' 
  | 'Japanese' 
  | 'Arabic' 
  | 'Portuguese' 
  | 'Mandarin';

export interface TranscriptionEntry {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  confidence?: 'High' | 'Medium' | 'Low';
}

export interface AppNotification {
  id: string;
  type: 'CAREER' | 'SCHEME' | 'SYSTEM';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface UserProfile {
  id: string;
  accountId: string;
  username: string;
  avatar: string;
  country: string;
  phone?: string;
  education?: string;
  interest?: string;
  language: SupportedLanguage;
  role?: string;
  goal?: string;
  onboarded: boolean;
  explanationLevel: ExplanationLevel;
  preferences: {
    careerAlerts: boolean;
    schemeAlerts: boolean;
    generalUpdates: boolean;
  };
}

export interface SavedItem {
  id: string;
  type: 'CAREER' | 'SCHEME';
  title: string;
  content: string;
  timestamp: number;
  bookmarked: boolean;
  reminderSet?: boolean;
}