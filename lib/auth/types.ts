export interface AuthUser {
  id: string;
  email: string;
}
export interface AuthProfile {
  handle: string;
  fullName: string;
  avatarUrl: string | null;
  onboarded: boolean;
}
export interface AuthState {
  user: AuthUser | null;
  profile: AuthProfile | null;
}
