import express from 'express';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  attachAuth,
  clearSession,
  createSession,
  requireAuth,
  type AuthedRequest,
} from './src/server/auth.ts';
import { db, hashPassword, initSchema, verifyPassword, VIDEOS_DIR } from './src/server/db.ts';
import { seedDatabase } from './src/server/seed.ts';

const execFileAsync = promisify(execFile);

interface VideoRow {
  id: string;
  user_id: string;
  caption: string;
  hashtags: string;
  soundtrack_id: string | null;
  soundtrack_title: string;
  sfx_tags: string;
  video_filename: string;
  mime_type: string;
  poster_url: string;
  duration_sec: number;
  views_count: number;
  category: string;
  created_at: number;
  username: string;
  display_name: string;
  avatar_url: string;
  verified: number;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  is_liked: number;
  is_saved: number;
  is_following: number;
}

function resolveSafeVideoPath(filename: string): string | null {
  if (!filename || filename.includes('\0')) return null;
  const resolved = path.resolve(VIDEOS_DIR, path.basename(filename));
  if (!resolved.startsWith(VIDEOS_DIR + path.sep)) return null;
  return resolved;
}

function serializeVideo(row: VideoRow) {
  let hashtags: string[] = [];
  let sfxTags: string[] = [];
  try {
    hashtags = JSON.parse(row.hashtags);
  } catch {
    hashtags = [];
  }
  try {
    sfxTags = JSON.parse(row.sfx_tags);
  } catch {
    sfxTags = [];
  }

  return {
    id: row.id,
    userId: row.user_id,
    caption: row.caption,
    hashtags,
    soundtrackId: row.soundtrack_id,
    soundtrackTitle: row.soundtrack_title,
    sfxTags,
    streamUrl: `/api/videos/${row.id}/stream`,
    posterUrl: row.poster_url,
    durationSec: row.duration_sec,
    viewsCount: row.views_count,
    category: row.category,
    createdAt: row.created_at,
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    savesCount: row.saves_count,
    isLiked: row.is_liked > 0,
    isSaved: row.is_saved > 0,
    creator: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      verified: row.verified === 1,
      isFollowing: row.is_following > 0,
    },
  };
}

function queryVideosForViewer(viewerId: string, whereClause = '', params: unknown[] = []): VideoRow[] {
  // Parameterized viewerId via bindings rather than string interpolation
  const sql = `
    SELECT
      v.*,
      u.username,
      u.display_name,
      u.avatar_url,
      u.verified,
      (SELECT COUNT(*) FROM likes l WHERE l.video_id = v.id) AS likes_count,
      (SELECT COUNT(*) FROM comments c WHERE c.video_id = v.id) AS comments_count,
      (SELECT COUNT(*) FROM saves s WHERE s.video_id = v.id) AS saves_count,
      (SELECT COUNT(*) FROM likes l2 WHERE l2.video_id = v.id AND l2.user_id = ?) AS is_liked,
      (SELECT COUNT(*) FROM saves s2 WHERE s2.video_id = v.id AND s2.user_id = ?) AS is_saved,
      (SELECT COUNT(*) FROM follows f WHERE f.follower_id = ? AND f.following_id = v.user_id) AS is_following
    FROM videos v
    JOIN users u ON u.id = v.user_id
    ${whereClause}
  `;
  return db.prepare(sql).all(viewerId, viewerId, viewerId, ...params) as VideoRow[];
}

function getUserStats(userId: string) {
  const followersCount = (
    db.prepare('SELECT COUNT(*) AS c FROM follows WHERE following_id = ?').get(userId) as { c: number }
  ).c;
  const followingCount = (
    db.prepare('SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?').get(userId) as { c: number }
  ).c;
  const totalLikes = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM likes l
         JOIN videos v ON v.id = l.video_id
         WHERE v.user_id = ?`
      )
      .get(userId) as { c: number }
  ).c;
  return { followersCount, followingCount, totalLikes };
}

const ALLOWED_VIDEO_MIMES = new Map<string, string>([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  ['video/x-m4v', '.m4v'],
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VIDEOS_DIR),
    filename: (_req, file, cb) => {
      const baseMime = file.mimetype.split(';')[0].trim().toLowerCase();
      const ext = ALLOWED_VIDEO_MIMES.get(baseMime) || '.webm';
      cb(null, `upload_${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
  },
  fileFilter: (_req, file, cb) => {
    const baseMime = file.mimetype.split(';')[0].trim().toLowerCase();
    if (ALLOWED_VIDEO_MIMES.has(baseMime)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported video format. Use MP4, WebM, or MOV.'));
    }
  },
});

async function startServer(): Promise<void> {
  initSchema();
  await seedDatabase();

  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));
  app.use(attachAuth);

  // --- Health ---
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // --- Auth Routes ---
  app.post('/api/auth/signup', (req: AuthedRequest, res) => {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const rawDisplay = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!/^[a-z0-9_]{3,24}$/.test(rawUsername)) {
      res.status(400).json({ error: 'Username must be 3-24 lowercase letters, numbers, or underscores.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
      .get(rawUsername, rawEmail) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({ error: 'Username or email is already taken.' });
      return;
    }

    const userId = `usr_${crypto.randomUUID().slice(0, 12)}`;
    const displayName = rawDisplay.slice(0, 40) || rawUsername;
    const passwordHash = hashPassword(password);
    const now = Date.now();

    db.prepare(
      `INSERT INTO users (id, username, display_name, email, password_hash, bio, avatar_url, verified, created_at)
       VALUES (?, ?, ?, ?, ?, '', '', 0, ?)`
    ).run(userId, rawUsername, displayName, rawEmail, passwordHash, now);

    // Follow @kael by default so Following tab has rich content immediately
    db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)').run(
      userId,
      'usr_kael',
      now
    );

    const token = createSession(res, userId);
    const stats = getUserStats(userId);
    res.status(201).json({
      token,
      user: {
        id: userId,
        username: rawUsername,
        displayName,
        email: rawEmail,
        bio: '',
        avatarUrl: '',
        verified: false,
        ...stats,
      },
    });
  });

  app.post('/api/auth/login', (req: AuthedRequest, res) => {
    const identifier =
      typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({ error: 'Username/email and password are required.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
      .get(identifier, identifier) as
      | {
          id: string;
          username: string;
          display_name: string;
          email: string;
          password_hash: string;
          bio: string;
          avatar_url: string;
          verified: number;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const token = createSession(res, row.id);
    const stats = getUserStats(row.id);
    res.json({
      token,
      user: {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        verified: row.verified === 1,
        ...stats,
      },
    });
  });

  app.post('/api/auth/demo', (_req: AuthedRequest, res) => {
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get('kael') as
      | {
          id: string;
          username: string;
          display_name: string;
          email: string;
          bio: string;
          avatar_url: string;
          verified: number;
        }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Demo account unavailable.' });
      return;
    }

    const token = createSession(res, row.id);
    const stats = getUserStats(row.id);
    res.json({
      token,
      user: {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        verified: row.verified === 1,
        ...stats,
      },
    });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    clearSession(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: AuthedRequest, res) => {
    if (!req.authUser) {
      res.json({ user: null });
      return;
    }
    const stats = getUserStats(req.authUser.id);
    res.json({ user: { ...req.authUser, ...stats } });
  });

  // --- Personalized Feed ---
  app.get('/api/feed', (req: AuthedRequest, res) => {
    const viewerId = req.authUser?.id || '';
    const tab = typeof req.query.tab === 'string' ? req.query.tab : 'foryou';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const tag = typeof req.query.tag === 'string' ? req.query.tag.toLowerCase().replace(/^#/, '') : '';
    const focusVideoId = typeof req.query.videoId === 'string' ? req.query.videoId : '';

    let rows: VideoRow[];
    if (tab === 'following') {
      if (!viewerId) {
        res.json({ videos: [], requiresAuth: true });
        return;
      }
      rows = queryVideosForViewer(
        viewerId,
        'WHERE v.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?) ORDER BY v.created_at DESC',
        [viewerId]
      );
    } else if (tab === 'saved') {
      if (!viewerId) {
        res.json({ videos: [], requiresAuth: true });
        return;
      }
      rows = queryVideosForViewer(
        viewerId,
        'WHERE v.id IN (SELECT video_id FROM saves WHERE user_id = ?) ORDER BY v.created_at DESC',
        [viewerId]
      );
    } else {
      rows = queryVideosForViewer(viewerId, 'ORDER BY v.created_at DESC');
    }

    if (category && category !== 'All') {
      rows = rows.filter((r) => r.category.toLowerCase() === category.toLowerCase());
    }
    if (tag) {
      rows = rows.filter((r) => {
        try {
          const tags = JSON.parse(r.hashtags) as string[];
          return tags.some((t) => t.toLowerCase() === tag);
        } catch {
          return false;
        }
      });
    }

    // Personalized recommendation ranking for "For You"
    if (tab === 'foryou') {
      const categoryAffinity = new Map<string, number>();
      if (viewerId) {
        const events = db
          .prepare(
            'SELECT category, watch_ms, completed FROM watch_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
          )
          .all(viewerId) as Array<{ category: string; watch_ms: number; completed: number }>;
        for (const ev of events) {
          const prev = categoryAffinity.get(ev.category) || 0;
          categoryAffinity.set(ev.category, prev + Math.min(ev.watch_ms / 1000, 10) + (ev.completed ? 6 : 0));
        }
        const likedCats = db
          .prepare(
            'SELECT v.category FROM likes l JOIN videos v ON v.id = l.video_id WHERE l.user_id = ?'
          )
          .all(viewerId) as Array<{ category: string }>;
        for (const lc of likedCats) {
          categoryAffinity.set(lc.category, (categoryAffinity.get(lc.category) || 0) + 12);
        }
      }

      const now = Date.now();
      rows.sort((a, b) => {
        const ageHoursA = Math.max(1, (now - a.created_at) / 3600000);
        const ageHoursB = Math.max(1, (now - b.created_at) / 3600000);
        const affinityA = categoryAffinity.get(a.category) || 0;
        const affinityB = categoryAffinity.get(b.category) || 0;
        const scoreA =
          (a.likes_count * 4 + a.comments_count * 5 + a.saves_count * 6 + a.views_count * 0.005 + affinityA * 2) /
            Math.pow(ageHoursA, 0.35) +
          (ageHoursA < 0.5 ? 250 : 0); // boost freshly uploaded videos
        const scoreB =
          (b.likes_count * 4 + b.comments_count * 5 + b.saves_count * 6 + b.views_count * 0.005 + affinityB * 2) /
            Math.pow(ageHoursB, 0.35) +
          (ageHoursB < 0.5 ? 250 : 0);
        return scoreB - scoreA;
      });
    }

    if (focusVideoId) {
      const idx = rows.findIndex((r) => r.id === focusVideoId);
      if (idx > 0) {
        const [focused] = rows.splice(idx, 1);
        rows.unshift(focused);
      } else if (idx === -1) {
        const single = queryVideosForViewer(viewerId, 'WHERE v.id = ?', [focusVideoId]);
        if (single.length > 0) {
          rows.unshift(single[0]);
        }
      }
    }

    res.json({
      videos: rows.map(serializeVideo),
    });
  });

  // --- Video Byte-Range Streaming ---
  app.get('/api/videos/:id/stream', (req, res) => {
    const row = db
      .prepare('SELECT video_filename, mime_type FROM videos WHERE id = ?')
      .get(req.params.id) as { video_filename: string; mime_type: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const filePath = resolveSafeVideoPath(row.video_filename);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Video file missing' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = row.mime_type || 'video/mp4';

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(Number.parseInt(match[2], 10), fileSize - 1) : fileSize - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // --- Poster Image Endpoint for Uploaded Videos ---
  app.get('/api/videos/:id/poster', (req, res) => {
    const thumbPath = resolveSafeVideoPath(`thumb_${req.params.id}.jpg`);
    if (!thumbPath || !fs.existsSync(thumbPath)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(thumbPath).pipe(res);
  });

  // --- Upload / Record Video ---
  app.post('/api/videos', requireAuth, upload.single('video'), async (req: AuthedRequest, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Video file is required.' });
      return;
    }

    const user = req.authUser!;
    const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, 300) : '';
    const category =
      typeof req.body?.category === 'string' && req.body.category.trim()
        ? req.body.category.trim().slice(0, 40)
        : 'Trending';
    const soundtrackId =
      typeof req.body?.soundtrackId === 'string' && req.body.soundtrackId.trim()
        ? req.body.soundtrackId.trim()
        : null;
    const rawHashtags: string = typeof req.body?.hashtags === 'string' ? req.body.hashtags : '';
    const rawSfx: string = typeof req.body?.sfxTags === 'string' ? req.body.sfxTags : '';
    const durationSec = Math.max(1, Math.min(180, Number.parseInt(String(req.body?.durationSec || '10'), 10) || 10));

    const parsedTags = rawHashtags
      .split(/[\s,]+/)
      .map((t: string) => t.replace(/^#/, '').trim().toLowerCase())
      .filter((t: string) => /^[a-z0-9_]{1,30}$/.test(t));
    const uniqueTags = Array.from(new Set(parsedTags)).slice(0, 8);

    let sfxTags: string[] = [];
    if (rawSfx) {
      try {
        const parsed = JSON.parse(rawSfx);
        if (Array.isArray(parsed)) {
          sfxTags = parsed.filter((x) => typeof x === 'string').slice(0, 5);
        }
      } catch {
        sfxTags = [];
      }
    }

    let soundtrackTitle = `Original Audio · @${user.username}`;
    if (soundtrackId) {
      const snd = db.prepare('SELECT title, artist FROM soundtracks WHERE id = ?').get(soundtrackId) as
        | { title: string; artist: string }
        | undefined;
      if (snd) {
        soundtrackTitle = `${snd.title} · ${snd.artist}`;
      }
    }

    const videoId = `vid_${crypto.randomUUID().slice(0, 12)}`;
    const baseMime = file.mimetype.split(';')[0].trim().toLowerCase();

    // Generate poster thumbnail cleanly with ffmpeg if possible
    let posterUrl = '';
    const thumbFilename = `thumb_${videoId}.jpg`;
    const thumbPath = path.join(VIDEOS_DIR, thumbFilename);
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        file.path,
        '-ss',
        '00:00:00.200',
        '-vframes',
        '1',
        '-vf',
        'scale=540:-1',
        thumbPath,
      ]);
      if (fs.existsSync(thumbPath)) {
        posterUrl = `/api/videos/${videoId}/poster`;
      }
    } catch {
      posterUrl = '';
    }

    const now = Date.now();
    db.prepare(
      `INSERT INTO videos (id, user_id, caption, hashtags, soundtrack_id, soundtrack_title, sfx_tags, video_filename, mime_type, poster_url, duration_sec, views_count, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      videoId,
      user.id,
      caption || 'Fresh upload on Velo',
      JSON.stringify(uniqueTags),
      soundtrackId,
      soundtrackTitle,
      JSON.stringify(sfxTags),
      file.filename,
      baseMime,
      posterUrl,
      durationSec,
      category,
      now
    );

    const rows = queryVideosForViewer(user.id, 'WHERE v.id = ?', [videoId]);
    res.status(201).json({ video: serializeVideo(rows[0]) });
  });

  app.delete('/api/videos/:id', requireAuth, (req: AuthedRequest, res) => {
    const row = db
      .prepare('SELECT id, user_id, video_filename FROM videos WHERE id = ?')
      .get(req.params.id) as { id: string; user_id: string; video_filename: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }
    if (row.user_id !== req.authUser!.id) {
      res.status(403).json({ error: 'You can only delete your own videos.' });
      return;
    }

    db.prepare('DELETE FROM videos WHERE id = ?').run(row.id);

    const filePath = resolveSafeVideoPath(row.video_filename);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const thumbPath = resolveSafeVideoPath(`thumb_${row.id}.jpg`);
    if (thumbPath && fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    res.json({ ok: true });
  });

  // --- Watch Tracking (Personalization) ---
  app.post('/api/videos/:id/view', (req: AuthedRequest, res) => {
    const video = db.prepare('SELECT id, category FROM videos WHERE id = ?').get(req.params.id) as
      | { id: string; category: string }
      | undefined;
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const watchMs = Math.max(0, Math.min(300000, Number(req.body?.watchMs) || 0));
    const completed = req.body?.completed ? 1 : 0;

    db.prepare('UPDATE videos SET views_count = views_count + 1 WHERE id = ?').run(video.id);
    db.prepare(
      'INSERT INTO watch_events (id, user_id, video_id, category, watch_ms, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      `we_${crypto.randomUUID().slice(0, 12)}`,
      req.authUser?.id || null,
      video.id,
      video.category,
      watchMs,
      completed,
      Date.now()
    );

    res.json({ ok: true });
  });

  // --- Like / Save ---
  app.post('/api/videos/:id/like', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const video = db.prepare('SELECT id, user_id FROM videos WHERE id = ?').get(req.params.id) as
      | { id: string; user_id: string }
      | undefined;
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const existing = db
      .prepare('SELECT 1 FROM likes WHERE user_id = ? AND video_id = ?')
      .get(user.id, video.id);

    let isLiked = false;
    if (existing) {
      db.prepare('DELETE FROM likes WHERE user_id = ? AND video_id = ?').run(user.id, video.id);
      isLiked = false;
    } else {
      db.prepare('INSERT INTO likes (user_id, video_id, created_at) VALUES (?, ?, ?)').run(
        user.id,
        video.id,
        Date.now()
      );
      isLiked = true;
      if (video.user_id !== user.id) {
        db.prepare(
          `INSERT INTO notifications (id, user_id, actor_id, type, video_id, message, is_read, created_at)
           VALUES (?, ?, ?, 'like', ?, 'liked your video', 0, ?)`
        ).run(`ntf_${crypto.randomUUID().slice(0, 10)}`, video.user_id, user.id, video.id, Date.now());
      }
    }

    const likesCount = (
      db.prepare('SELECT COUNT(*) AS c FROM likes WHERE video_id = ?').get(video.id) as { c: number }
    ).c;

    res.json({ isLiked, likesCount });
  });

  app.post('/api/videos/:id/save', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(req.params.id) as { id: string } | undefined;
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const existing = db
      .prepare('SELECT 1 FROM saves WHERE user_id = ? AND video_id = ?')
      .get(user.id, video.id);

    let isSaved = false;
    if (existing) {
      db.prepare('DELETE FROM saves WHERE user_id = ? AND video_id = ?').run(user.id, video.id);
      isSaved = false;
    } else {
      db.prepare('INSERT INTO saves (user_id, video_id, created_at) VALUES (?, ?, ?)').run(
        user.id,
        video.id,
        Date.now()
      );
      isSaved = true;
    }

    const savesCount = (
      db.prepare('SELECT COUNT(*) AS c FROM saves WHERE video_id = ?').get(video.id) as { c: number }
    ).c;

    res.json({ isSaved, savesCount });
  });

  // --- Comments ---
  app.get('/api/videos/:id/comments', (req: AuthedRequest, res) => {
    const viewerId = req.authUser?.id || '';
    const rows = db
      .prepare(
        `SELECT c.id, c.video_id, c.user_id, c.body, c.likes_count, c.created_at,
                u.username, u.display_name, u.avatar_url, u.verified,
                (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = ?) AS is_liked
         FROM comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.video_id = ?
         ORDER BY c.created_at DESC`
      )
      .all(viewerId, req.params.id) as Array<{
      id: string;
      video_id: string;
      user_id: string;
      body: string;
      likes_count: number;
      created_at: number;
      username: string;
      display_name: string;
      avatar_url: string;
      verified: number;
      is_liked: number;
    }>;

    res.json({
      comments: rows.map((r) => ({
        id: r.id,
        videoId: r.video_id,
        body: r.body,
        likesCount: r.likes_count,
        isLiked: r.is_liked > 0,
        createdAt: r.created_at,
        author: {
          id: r.user_id,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          verified: r.verified === 1,
        },
      })),
    });
  });

  app.post('/api/videos/:id/comments', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 300) : '';
    if (!body) {
      res.status(400).json({ error: 'Comment text cannot be empty.' });
      return;
    }

    const video = db.prepare('SELECT id, user_id FROM videos WHERE id = ?').get(req.params.id) as
      | { id: string; user_id: string }
      | undefined;
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const id = `cmt_${crypto.randomUUID().slice(0, 10)}`;
    const now = Date.now();
    db.prepare(
      'INSERT INTO comments (id, video_id, user_id, body, likes_count, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(id, video.id, user.id, body, now);

    if (video.user_id !== user.id) {
      db.prepare(
        `INSERT INTO notifications (id, user_id, actor_id, type, video_id, message, is_read, created_at)
         VALUES (?, ?, ?, 'comment', ?, ?, 0, ?)`
      ).run(
        `ntf_${crypto.randomUUID().slice(0, 10)}`,
        video.user_id,
        user.id,
        video.id,
        `commented: "${body.slice(0, 80)}"`,
        now
      );
    }

    const commentsCount = (
      db.prepare('SELECT COUNT(*) AS c FROM comments WHERE video_id = ?').get(video.id) as { c: number }
    ).c;

    res.status(201).json({
      commentsCount,
      comment: {
        id,
        videoId: video.id,
        body,
        likesCount: 0,
        isLiked: false,
        createdAt: now,
        author: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          verified: user.verified,
        },
      },
    });
  });

  app.post('/api/comments/:id/like', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const comment = db.prepare('SELECT id, likes_count FROM comments WHERE id = ?').get(req.params.id) as
      | { id: string; likes_count: number }
      | undefined;
    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const existing = db
      .prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?')
      .get(user.id, comment.id);

    let isLiked = false;
    if (existing) {
      db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(user.id, comment.id);
      db.prepare('UPDATE comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(comment.id);
      isLiked = false;
    } else {
      db.prepare('INSERT INTO comment_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)').run(
        user.id,
        comment.id,
        Date.now()
      );
      db.prepare('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?').run(comment.id);
      isLiked = true;
    }

    const updated = db.prepare('SELECT likes_count FROM comments WHERE id = ?').get(comment.id) as {
      likes_count: number;
    };
    res.json({ isLiked, likesCount: updated.likes_count });
  });

  // --- Discover & Search ---
  app.get('/api/discover', (req: AuthedRequest, res) => {
    const viewerId = req.authUser?.id || '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim().toLowerCase().replace(/^#/, '') : '';

    const allUsers = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_url, u.verified,
                (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS followers_count,
                (SELECT COUNT(*) FROM follows f2 WHERE f2.follower_id = ? AND f2.following_id = u.id) AS is_following
         FROM users u`
      )
      .all(viewerId) as Array<{
      id: string;
      username: string;
      display_name: string;
      bio: string;
      avatar_url: string;
      verified: number;
      followers_count: number;
      is_following: number;
    }>;

    const users = allUsers
      .filter(
        (u) =>
          !q ||
          u.username.toLowerCase().includes(q) ||
          u.display_name.toLowerCase().includes(q) ||
          u.bio.toLowerCase().includes(q)
      )
      .map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        bio: u.bio,
        avatarUrl: u.avatar_url,
        verified: u.verified === 1,
        followersCount: u.followers_count,
        isFollowing: u.is_following > 0,
      }));

    const allVideos = queryVideosForViewer(viewerId, 'ORDER BY v.views_count DESC');

    // Aggregate hashtags across all videos
    const tagCounts = new Map<string, { tag: string; videosCount: number; viewsCount: number }>();
    for (const v of allVideos) {
      let tags: string[] = [];
      try {
        tags = JSON.parse(v.hashtags);
      } catch {
        tags = [];
      }
      for (const t of tags) {
        const lower = t.toLowerCase();
        const prev = tagCounts.get(lower) || { tag: lower, videosCount: 0, viewsCount: 0 };
        prev.videosCount += 1;
        prev.viewsCount += v.views_count;
        tagCounts.set(lower, prev);
      }
    }

    let hashtags = Array.from(tagCounts.values()).sort((a, b) => b.viewsCount - a.viewsCount);
    if (q) {
      hashtags = hashtags.filter((h) => h.tag.includes(q.replace(/^#/, '')));
    }

    const filteredVideos = allVideos.filter((v) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(v.hashtags);
      } catch {
        tags = [];
      }
      if (tag && !tags.some((t) => t.toLowerCase() === tag)) {
        return false;
      }
      if (!q) return true;
      const cleanQ = q.replace(/^#/, '');
      return (
        v.caption.toLowerCase().includes(q) ||
        v.username.toLowerCase().includes(q) ||
        v.display_name.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        v.soundtrack_title.toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(cleanQ))
      );
    });

    res.json({
      users,
      videos: filteredVideos.map(serializeVideo),
      hashtags: hashtags.slice(0, 16),
    });
  });

  // --- Soundtracks ---
  app.get('/api/soundtracks', (_req, res) => {
    const rows = db.prepare('SELECT * FROM soundtracks ORDER BY title ASC').all() as Array<{
      id: string;
      title: string;
      artist: string;
      bpm: number;
      duration_sec: number;
      category: string;
      synth_preset: string;
    }>;
    res.json({
      soundtracks: rows.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        bpm: r.bpm,
        durationSec: r.duration_sec,
        category: r.category,
        synthPreset: r.synth_preset,
      })),
    });
  });

  // --- User Profiles & Follow ---
  app.get('/api/users/:username', (req: AuthedRequest, res) => {
    const viewerId = req.authUser?.id || '';
    const targetUsername = req.params.username.toLowerCase();

    const userRow = db
      .prepare('SELECT id, username, display_name, bio, avatar_url, verified, created_at FROM users WHERE username = ?')
      .get(targetUsername) as
      | {
          id: string;
          username: string;
          display_name: string;
          bio: string;
          avatar_url: string;
          verified: number;
          created_at: number;
        }
      | undefined;

    if (!userRow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const stats = getUserStats(userRow.id);
    const isFollowing = viewerId
      ? Boolean(
          db
            .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
            .get(viewerId, userRow.id)
        )
      : false;

    const postedVideos = queryVideosForViewer(
      viewerId,
      'WHERE v.user_id = ? ORDER BY v.created_at DESC',
      [userRow.id]
    ).map(serializeVideo);

    const likedVideos = queryVideosForViewer(
      viewerId,
      'WHERE v.id IN (SELECT video_id FROM likes WHERE user_id = ?) ORDER BY v.created_at DESC',
      [userRow.id]
    ).map(serializeVideo);

    const savedVideos =
      viewerId === userRow.id
        ? queryVideosForViewer(
            viewerId,
            'WHERE v.id IN (SELECT video_id FROM saves WHERE user_id = ?) ORDER BY v.created_at DESC',
            [userRow.id]
          ).map(serializeVideo)
        : [];

    res.json({
      profile: {
        id: userRow.id,
        username: userRow.username,
        displayName: userRow.display_name,
        bio: userRow.bio,
        avatarUrl: userRow.avatar_url,
        verified: userRow.verified === 1,
        isFollowing,
        isSelf: viewerId === userRow.id,
        ...stats,
      },
      postedVideos,
      likedVideos,
      savedVideos,
    });
  });

  app.patch('/api/users/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const displayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 40) : user.displayName;
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 160) : user.bio;

    if (!displayName) {
      res.status(400).json({ error: 'Display name cannot be empty.' });
      return;
    }

    db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(displayName, bio, user.id);
    const stats = getUserStats(user.id);
    res.json({
      user: {
        ...user,
        displayName,
        bio,
        ...stats,
      },
    });
  });

  app.post('/api/users/:id/follow', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const targetId = req.params.id;
    if (targetId === user.id) {
      res.status(400).json({ error: 'You cannot follow yourself.' });
      return;
    }

    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId) as { id: string } | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const existing = db
      .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
      .get(user.id, target.id);

    let isFollowing = false;
    if (existing) {
      db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(user.id, target.id);
      isFollowing = false;
    } else {
      db.prepare('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)').run(
        user.id,
        target.id,
        Date.now()
      );
      isFollowing = true;
      db.prepare(
        `INSERT INTO notifications (id, user_id, actor_id, type, video_id, message, is_read, created_at)
         VALUES (?, ?, ?, 'follow', NULL, 'started following you', 0, ?)`
      ).run(`ntf_${crypto.randomUUID().slice(0, 10)}`, target.id, user.id, Date.now());
    }

    const followersCount = (
      db.prepare('SELECT COUNT(*) AS c FROM follows WHERE following_id = ?').get(target.id) as { c: number }
    ).c;

    res.json({ isFollowing, followersCount });
  });

  // --- Notifications ---
  app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const rows = db
      .prepare(
        `SELECT n.id, n.type, n.video_id, n.message, n.is_read, n.created_at,
                u.id AS actor_id, u.username, u.display_name, u.avatar_url, u.verified,
                v.poster_url
         FROM notifications n
         JOIN users u ON u.id = n.actor_id
         LEFT JOIN videos v ON v.id = n.video_id
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC
         LIMIT 50`
      )
      .all(user.id) as Array<{
      id: string;
      type: string;
      video_id: string | null;
      message: string;
      is_read: number;
      created_at: number;
      actor_id: string;
      username: string;
      display_name: string;
      avatar_url: string;
      verified: number;
      poster_url: string | null;
    }>;

    const unreadCount = rows.filter((r) => r.is_read === 0).length;

    res.json({
      unreadCount,
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        videoId: r.video_id,
        message: r.message,
        isRead: r.is_read === 1,
        createdAt: r.created_at,
        posterUrl: r.poster_url,
        actor: {
          id: r.actor_id,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
          verified: r.verified === 1,
        },
      })),
    });
  });

  app.post('/api/notifications/read', requireAuth, (req: AuthedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // --- Vite / Static Frontend ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Velo server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Velo server:', err);
  process.exit(1);
});
