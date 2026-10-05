export type View = 'home' | 'school' | 'hoods' | 'challenges' | 'businesses' | 'events' | 'messages' | 'rewards' | 'profile' | 'settings' | 'elite' | 'notifications' | 'telegram' | 'admin';
export type Role = 'member' | 'moderator' | 'admin' | 'super_admin';
export interface ThemePreferences { mode: 'system' | 'light' | 'dark'; accent: string; }
export interface School { id: string; name: string; city: string; description: string; archived: boolean; }
export type IconName = 'leaf' | 'book' | 'coffee' | 'heart' | 'trophy' | 'music' | 'users' | 'palette';
export interface Hood { id: string; name: string; description: string; category: string; image: string; members: number; color: string; }
export interface Challenge { id: string; title: string; description: string; category: string; image: string; participants: number; points: number; days: number; progress: number; icon: IconName; hood: string; }
export interface Business { id: string; name: string; category: string; image: string; description: string; address: string; rating: number; distance: string; offer: string; code: string; phone: string; hours: string; }
export interface CommunityEvent { id: string; title: string; category: string; image: string; month: string; day: string; date: string; location: string; time: string; attending: number; description: string; }
export interface Post { id: string; author: string; authorId?: string; avatar: string; role: string; hood: string; body: string; image?: string; createdAt: string; likes: number; }
export interface Channel { id: string; name: string; image: string; members: number; preview: string; }
export interface ChatMessage { id: string; author: string; body: string; createdAt: string; own: boolean; }
export interface Profile { id: string; name: string; avatar: string; school: string; hood: string; bio: string; role?: Role; theme?: ThemePreferences; }
export interface UserState { joinedHoods: string[]; joinedChallenges: string[]; savedBusinesses: string[]; attendingEvents: string[]; likedPosts: string[]; claimedOffers: string[]; notifications: boolean; publicProfile: boolean; }
export interface Bootstrap { profile: Profile; state: UserState; hoods: Hood[]; challenges: Challenge[]; businesses: Business[]; events: CommunityEvent[]; posts: Post[]; channels: Channel[]; points: number; schools?: School[]; demoRoleSwitch?: boolean; }
export interface TelegramStatus { connected: boolean; botUsername: string; accountVerified: boolean; notificationsAllowed: boolean; admin: boolean; linkedChats: { hoodId: string; kind: 'group' | 'channel'; title: string; url: string }[]; unread: number; elite: { active: boolean; expiresAt: string | null; stars: number; days: number; checkoutEnabled: boolean; termsUrl: string | null; supportUrl: string | null; termsVersion: string; pollLimit: number }; }
export interface Notification { id: string; title: string; body: string; path: string; readAt: string | null; delivery: 'pending' | 'sending' | 'sent' | 'in_app' | 'failed'; createdAt: string; }
export interface CommunityPoll { id: string; hoodId: string; question: string; options: { text: string; voter_count: number }[]; voters: number; url: string | null; state: 'creating' | 'published' | 'failed'; closed: boolean; createdAt: string; }