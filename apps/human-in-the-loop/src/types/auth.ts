import type { IUser } from './index';

export enum AuthMode {
    LOGIN = 'login',
    REGISTER = 'register'
};

export enum AuthStatus {
    LOADING = 'loading',
    AUTHENTICATED = 'authenticated',
    ANONYMOUS = 'anonymous'
};

export interface AuthResponse {
    user: IUser;
    session: {
        token: string;
        expires_at: string;
    };
};

export interface AuthState {
    currentUser: IUser | null;
    token: string | null;
    status: AuthStatus;
    mode: AuthMode;
    error: string | null;
    hydrateSession: () => Promise<void>;
    setMode: (mode: AuthMode) => void;
    clearError: () => void;
    login: (username: string, password: string) => Promise<boolean>;
    register: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
}



export interface AuthSessionSnapshot {
    token: string;
    user: IUser;
};