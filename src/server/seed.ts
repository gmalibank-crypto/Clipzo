import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { db, hashPassword, VIDEOS_DIR } from './db.ts';

const execFileAsync = promisify(execFile);

interface SeedVideoSpec {
  id: string;
  userId: string;
  caption: string;
  hashtags: string[];
  soundtrackId: string;
  soundtrackTitle: string;
  sfxTags: string[];
  videoFilename: string;
  posterUrl: string;
  category: string;
  viewsCount: number;
  createdAtOffsetMs: number;
  motionFilter: string;
  audioExpr: string;
}

async function renderSeedMp4(
  imageRelPath: string,
  outputFilename: string,
  motionFilter: string,
  audioExpr: string
): Promise<void> {
  const outPath = path.join(VIDEOS_DIR, outputFilename);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 10000) {
    return;
  }

  const imageAbsPath = path.resolve(process.cwd(), imageRelPath.replace(/^\//, ''));
  if (!fs.existsSync(imageAbsPath)) {
    throw new Error(`Missing seed artwork at ${imageAbsPath}`);
  }

  // Generate a smooth 6-second 540x960 H.264 + AAC vertical MP4 with faststart
  await execFileAsync('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-i',
    imageAbsPath,
    '-f',
    'lavfi',
    '-i',
    `aevalsrc=${audioExpr}:s=44100:d=6`,
    '-vf',
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${motionFilter},scale=540:960`,
    '-t',
    '6',
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'stillimage',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    '-shortest',
    outPath,
  ]);
}

export async function seedDatabase(): Promise<void> {
  const existingUserCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;

  const soundtracks = [
    {
      id: 'snd_midnight_sub',
      title: 'Shibuya Rain (Sub Mix)',
      artist: 'Mira Vance',
      bpm: 118,
      duration_sec: 15,
      category: 'Electronic',
      synth_preset: 'midnight_sub',
    },
    {
      id: 'snd_amber_arp',
      title: 'Analog Tape Drift',
      artist: 'Mira Vance',
      bpm: 104,
      duration_sec: 20,
      category: 'Ambient',
      synth_preset: 'amber_arp',
    },
    {
      id: 'snd_rooftop_break',
      title: 'Concrete Skyline 808',
      artist: 'Sora Beats',
      bpm: 128,
      duration_sec: 15,
      category: 'Hip-Hop',
      synth_preset: 'rooftop_break',
    },
    {
      id: 'snd_kinetic_pulse',
      title: 'Alpine Wind & Bass',
      artist: 'Kael Sound',
      bpm: 134,
      duration_sec: 30,
      category: 'Action',
      synth_preset: 'kinetic_pulse',
    },
    {
      id: 'snd_wok_rhythm',
      title: 'Late Night Service Groove',
      artist: 'Studio 04',
      bpm: 112,
      duration_sec: 15,
      category: 'Lo-Fi',
      synth_preset: 'neon_chords',
    },
  ];

  const insertSound = db.prepare(
    `INSERT OR IGNORE INTO soundtracks (id, title, artist, bpm, duration_sec, category, synth_preset)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of soundtracks) {
    insertSound.run(s.id, s.title, s.artist, s.bpm, s.duration_sec, s.category, s.synth_preset);
  }

  const seedVideos: SeedVideoSpec[] = [
    {
      id: 'vid_tokyo_drift',
      userId: 'usr_kael',
      caption: 'Midnight rain hits different in Shibuya after 1 AM. Shot handheld on 35mm anamorphic.',
      hashtags: ['tokyo', 'nightdrive', 'cinematic', 'streetfilm'],
      soundtrackId: 'snd_midnight_sub',
      soundtrackTitle: 'Shibuya Rain (Sub Mix) · Mira Vance',
      sfxTags: ['Rain Ambience'],
      videoFilename: 'seed_tokyo_drift.mp4',
      posterUrl: '/src/assets/images/scene_tokyo_drift_1795625850986.jpg',
      category: 'Cars & Night',
      viewsCount: 48200,
      createdAtOffsetMs: 1000 * 60 * 45,
      motionFilter: "zoompan=z='min(zoom+0.0012,1.22)':d=180:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920",
      audioExpr: '0.12*sin(2*PI*110*t)+0.08*sin(2*PI*164.81*t)+0.05*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*2*t))',
    },
    {
      id: 'vid_urban_dance',
      userId: 'usr_sora',
      caption: 'Golden hour rooftop session before the city lights come on. Wait for the mid-air freeze.',
      hashtags: ['dance', 'choreography', 'rooftop', 'freestyle'],
      soundtrackId: 'snd_rooftop_break',
      soundtrackTitle: 'Concrete Skyline 808 · Sora Beats',
      sfxTags: ['Bass Drop'],
      videoFilename: 'seed_urban_dance.mp4',
      posterUrl: '/src/assets/images/scene_urban_dance_1795625850037.jpg',
      category: 'Dance',
      viewsCount: 91400,
      createdAtOffsetMs: 1000 * 60 * 120,
      motionFilter: "zoompan=z='1.18-0.0009*on':d=180:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920",
      audioExpr: '0.14*sin(2*PI*98*t)*(0.6+0.4*sin(2*PI*4*t))+0.07*sin(2*PI*196*t)',
    },
    {
      id: 'vid_synth_studio',
      userId: 'usr_mira',
      caption: 'Patching an analog tape loop at 2 AM. Turning three oscillators into warm rain.',
      hashtags: ['modularsynth', 'sounddesign', 'analog', 'producer'],
      soundtrackId: 'snd_amber_arp',
      soundtrackTitle: 'Analog Tape Drift · Mira Vance',
      sfxTags: ['Tape Hiss'],
      videoFilename: 'seed_synth_studio.mp4',
      posterUrl: '/src/assets/images/scene_synth_studio_1795625851321.jpg',
      category: 'Music & Studio',
      viewsCount: 34700,
      createdAtOffsetMs: 1000 * 60 * 240,
      motionFilter: "zoompan=z='min(zoom+0.001,1.18)':d=180:x='iw/2-(iw/zoom/2)+on*0.2':y='ih/2-(ih/zoom/2)':s=1080x1920",
      audioExpr: '0.1*sin(2*PI*261.63*t)+0.08*sin(2*PI*329.63*t)+0.06*sin(2*PI*392*t)*(0.5+0.5*sin(2*PI*3*t))',
    },
    {
      id: 'vid_culinary_fire',
      userId: 'usr_kael',
      caption: 'High-heat wok hei during Friday dinner rush. 45 seconds from raw prep to sear.',
      hashtags: ['culinary', 'wokhei', 'cheflife', 'fire'],
      soundtrackId: 'snd_wok_rhythm',
      soundtrackTitle: 'Late Night Service Groove · Studio 04',
      sfxTags: ['Flame Sizzle'],
      videoFilename: 'seed_culinary_fire.mp4',
      posterUrl: '/src/assets/images/scene_culinary_fire_1795625852166.jpg',
      category: 'Culinary',
      viewsCount: 62900,
      createdAtOffsetMs: 1000 * 60 * 420,
      motionFilter: "zoompan=z='min(zoom+0.0014,1.24)':d=180:x='iw/2-(iw/zoom/2)-on*0.15':y='ih/2-(ih/zoom/2)':s=1080x1920",
      audioExpr: '0.1*sin(2*PI*146.83*t)+0.08*sin(2*PI*220*t)+0.04*sin(2*PI*293.66*t)',
    },
    {
      id: 'vid_alpine_skate',
      userId: 'usr_sora',
      caption: 'Chasing first light down the Dolomites pass at 60 km/h. Cold air, clean tarmac.',
      hashtags: ['downhill', 'longboard', 'alps', 'sunrise'],
      soundtrackId: 'snd_kinetic_pulse',
      soundtrackTitle: 'Alpine Wind & Bass · Kael Sound',
      sfxTags: ['Wind Rush'],
      videoFilename: 'seed_alpine_skate.mp4',
      posterUrl: '/src/assets/images/scene_alpine_skate_1795625852031.jpg',
      category: 'Action Sports',
      viewsCount: 118500,
      createdAtOffsetMs: 1000 * 60 * 600,
      motionFilter: "zoompan=z='1.20-0.001*on':d=180:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-on*0.2':s=1080x1920",
      audioExpr: '0.11*sin(2*PI*130.81*t)+0.07*sin(2*PI*196*t)*(0.5+0.5*sin(2*PI*2.5*t))',
    },
  ];

  // Ensure video MP4 files exist on disk (runs once, ~2-3s total)
  await Promise.all(
    seedVideos.map((v) =>
      renderSeedMp4(v.posterUrl, v.videoFilename, v.motionFilter, v.audioExpr)
    )
  );

  if (existingUserCount > 0) {
    return;
  }

  const now = Date.now();
  const demoPasswordHash = hashPassword('velo-demo-2026');

  const users = [
    {
      id: 'usr_kael',
      username: 'kael',
      display_name: 'Kael Sato',
      email: 'kael@velo.app',
      bio: 'Night cinematography, urban motion & kitchen stories. Tokyo / SF.',
      avatar_url: '/src/assets/images/avatar_kael_1795625850720.jpg',
      verified: 1,
    },
    {
      id: 'usr_mira',
      username: 'mira',
      display_name: 'Mira Vance',
      email: 'mira@velo.app',
      bio: 'Modular synths, tape loops & late-night soundscapes.',
      avatar_url: '/src/assets/images/avatar_mira_1795625850486.jpg',
      verified: 1,
    },
    {
      id: 'usr_sora',
      username: 'sora',
      display_name: 'Sora Bellamy',
      email: 'sora@velo.app',
      bio: 'Movement director, rooftop choreography & alpine downhill.',
      avatar_url: '/src/assets/images/avatar_sora_1795625851100.jpg',
      verified: 1,
    },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users (id, username, display_name, email, password_hash, bio, avatar_url, verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const u of users) {
    insertUser.run(
      u.id,
      u.username,
      u.display_name,
      u.email,
      demoPasswordHash,
      u.bio,
      u.avatar_url,
      u.verified,
      now - 1000 * 60 * 60 * 24 * 14
    );
  }

  const insertVideo = db.prepare(
    `INSERT INTO videos (id, user_id, caption, hashtags, soundtrack_id, soundtrack_title, sfx_tags, video_filename, mime_type, poster_url, duration_sec, views_count, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'video/mp4', ?, 6, ?, ?, ?)`
  );
  for (const v of seedVideos) {
    insertVideo.run(
      v.id,
      v.userId,
      v.caption,
      JSON.stringify(v.hashtags),
      v.soundtrackId,
      v.soundtrackTitle,
      JSON.stringify(v.sfxTags),
      v.videoFilename,
      v.posterUrl,
      v.viewsCount,
      v.category,
      now - v.createdAtOffsetMs
    );
  }

  // Initial follows
  const insertFollow = db.prepare(
    'INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)'
  );
  insertFollow.run('usr_kael', 'usr_mira', now - 86400000);
  insertFollow.run('usr_kael', 'usr_sora', now - 72000000);
  insertFollow.run('usr_mira', 'usr_kael', now - 64000000);
  insertFollow.run('usr_sora', 'usr_kael', now - 54000000);
  insertFollow.run('usr_mira', 'usr_sora', now - 44000000);

  // Initial likes & saves
  const insertLike = db.prepare(
    'INSERT OR IGNORE INTO likes (user_id, video_id, created_at) VALUES (?, ?, ?)'
  );
  insertLike.run('usr_mira', 'vid_tokyo_drift', now - 3000000);
  insertLike.run('usr_sora', 'vid_tokyo_drift', now - 2500000);
  insertLike.run('usr_kael', 'vid_urban_dance', now - 2000000);
  insertLike.run('usr_mira', 'vid_urban_dance', now - 1800000);
  insertLike.run('usr_kael', 'vid_synth_studio', now - 1500000);
  insertLike.run('usr_sora', 'vid_culinary_fire', now - 1200000);
  insertLike.run('usr_kael', 'vid_alpine_skate', now - 900000);

  const insertSave = db.prepare(
    'INSERT OR IGNORE INTO saves (user_id, video_id, created_at) VALUES (?, ?, ?)'
  );
  insertSave.run('usr_kael', 'vid_synth_studio', now - 1400000);
  insertSave.run('usr_kael', 'vid_alpine_skate', now - 800000);

  // Initial comments
  const seedComments = [
    {
      videoId: 'vid_tokyo_drift',
      userId: 'usr_mira',
      body: 'The wet asphalt reflections with that sub bass sit so clean together.',
      likesCount: 42,
      offset: 1800000,
    },
    {
      videoId: 'vid_tokyo_drift',
      userId: 'usr_sora',
      body: 'Need the exact 35mm lens recipe for my next rooftop shoot.',
      likesCount: 19,
      offset: 1200000,
    },
    {
      videoId: 'vid_urban_dance',
      userId: 'usr_kael',
      body: 'That silhouette against the dusk horizon is unreal.',
      likesCount: 64,
      offset: 1500000,
    },
    {
      videoId: 'vid_synth_studio',
      userId: 'usr_sora',
      body: 'Can we clear this patch for a 30-second choreography piece?',
      likesCount: 28,
      offset: 900000,
    },
    {
      videoId: 'vid_culinary_fire',
      userId: 'usr_mira',
      body: 'You can practically smell the sear through the screen.',
      likesCount: 31,
      offset: 600000,
    },
    {
      videoId: 'vid_alpine_skate',
      userId: 'usr_kael',
      body: 'Morning mist hugging the valley floor makes this look painted.',
      likesCount: 55,
      offset: 400000,
    },
  ];

  const insertComment = db.prepare(
    'INSERT INTO comments (id, video_id, user_id, body, likes_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const c of seedComments) {
    insertComment.run(
      `cmt_${crypto.randomUUID().slice(0, 8)}`,
      c.videoId,
      c.userId,
      c.body,
      c.likesCount,
      now - c.offset
    );
  }

  // Initial notifications for demo user @kael
  const insertNotif = db.prepare(
    `INSERT INTO notifications (id, user_id, actor_id, type, video_id, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertNotif.run(
    'ntf_1',
    'usr_kael',
    'usr_mira',
    'comment',
    'vid_tokyo_drift',
    'commented: "The wet asphalt reflections with that sub bass sit so clean together."',
    0,
    now - 1800000
  );
  insertNotif.run(
    'ntf_2',
    'usr_kael',
    'usr_sora',
    'like',
    'vid_tokyo_drift',
    'liked your video',
    0,
    now - 2500000
  );
  insertNotif.run(
    'ntf_3',
    'usr_kael',
    'usr_sora',
    'follow',
    null,
    'started following you',
    1,
    now - 54000000
  );
}
