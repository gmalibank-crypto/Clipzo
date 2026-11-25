export interface UserProfileSummary {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  bio: string;
  avatarUrl: string;
  verified: boolean;
  followersCount: number;
  followingCount: number;
  totalLikes: number;
  isFollowing?: boolean;
  isSelf?: boolean;
}

export interface VideoCreator {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  verified: boolean;
  isFollowing: boolean;
}

export interface VideoItem {
  id: string;
  userId: string;
  caption: string;
  hashtags: string[];
  soundtrackId: string | null;
  soundtrackTitle: string;
  sfxTags: string[];
  streamUrl: string;
  posterUrl: string;
  durationSec: number;
  viewsCount: number;
  category: string;
  createdAt: number;
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  isLiked: boolean;
  isSaved: boolean;
  creator: VideoCreator;
}

export interface CommentItem {
  id: string;
  videoId: string;
  body: string;
  likesCount: number;
  isLiked: boolean;
  createdAt: number;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    verified: boolean;
  };
}

export interface SoundtrackItem {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  durationSec: number;
  category: string;
  synthPreset: string;
}

export interface NotificationItem {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention';
  videoId: string | null;
  message: string;
  isRead: boolean;
  createdAt: number;
  posterUrl: string | null;
  actor: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    verified: boolean;
  };
}

export interface DiscoverUser {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  verified: boolean;
  followersCount: number;
  isFollowing: boolean;
}

export interface TrendingHashtag {
  tag: string;
  videosCount: number;
  viewsCount: number;
}

export type NavTab = 'home' | 'discover' | 'inbox' | 'profile';
export type FeedTab = 'foryou' | 'following';
