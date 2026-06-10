export interface UserInterface {
  uId: string;
  uName: string;
  uEmail: string;
  uUserImage: string;
  uStatus: boolean;
  uLastReactions: string[];
    /** Time of the last heartbeat for presence detection. */
  uLastSeen?: unknown;
    /** Time up to which the user has read all messages. */
  uLastRead?: unknown;
}

export interface User {
    uId?: string; 
    uName: string; 
    uEmail: string;
    uStatus: boolean; 
    uUserImage: string;
    uLastReactions: string[];
    /** Time of the last heartbeat for presence detection. */
    uLastSeen?: unknown;
    /** Time up to which the user has read all messages. */
    uLastRead?: unknown;
}


