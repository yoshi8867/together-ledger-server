const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();
const MAX_ACCOUNTS_PER_DEVICE = parseInt(process.env.MAX_ACCOUNTS_PER_DEVICE || '5');

// POST /auth/register — 새 계정 생성
router.post('/register', async (req, res) => {
  const { syncId, password, androidId, deviceName } = req.body;

  if (!syncId || !password || !androidId) {
    return res.status(400).json({ error: 'syncId, password, androidId 는 필수입니다' });
  }
  if (syncId.length < 6 || password.length < 4) {
    return res.status(400).json({ error: 'syncId 최소 6자, password 최소 4자' });
  }

  try {
    const existing = (await pool.query(
      'SELECT sync_id FROM users WHERE sync_id = $1', [syncId]
    )).rows[0];
    if (existing) {
      return res.status(409).json({ error: '이미 사용 중인 syncId입니다' });
    }

    const deviceCount = (await pool.query(
      'SELECT COUNT(DISTINCT sync_id) AS cnt FROM devices WHERE android_id = $1', [androidId]
    )).rows[0];
    if (parseInt(deviceCount.cnt) >= MAX_ACCOUNTS_PER_DEVICE) {
      return res.status(429).json({ error: `한 기기에서 최대 ${MAX_ACCOUNTS_PER_DEVICE}개 계정까지 생성 가능합니다` });
    }

    const now = Date.now();
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (sync_id, password_hash, created_at) VALUES ($1, $2, $3)',
      [syncId, passwordHash, now]
    );
    await pool.query(
      'INSERT INTO devices (sync_id, android_id, device_name, registered_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)',
      [syncId, androidId, deviceName || null, now, now]
    );

    const token = jwt.sign({ syncId, androidId }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /auth/login — 기존 계정 연결 (다른 기기에서)
router.post('/login', async (req, res) => {
  const { syncId, password, androidId, deviceName } = req.body;

  if (!syncId || !password || !androidId) {
    return res.status(400).json({ error: 'syncId, password, androidId 는 필수입니다' });
  }

  try {
    const user = (await pool.query(
      'SELECT * FROM users WHERE sync_id = $1', [syncId]
    )).rows[0];
    if (!user) {
      return res.status(401).json({ error: 'syncId 또는 password가 올바르지 않습니다' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'syncId 또는 password가 올바르지 않습니다' });
    }

    const now = Date.now();

    const device = (await pool.query(
      'SELECT id FROM devices WHERE sync_id = $1 AND android_id = $2', [syncId, androidId]
    )).rows[0];
    if (device) {
      await pool.query('UPDATE devices SET last_seen_at = $1 WHERE id = $2', [now, device.id]);
    } else {
      await pool.query(
        'INSERT INTO devices (sync_id, android_id, device_name, registered_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)',
        [syncId, androidId, deviceName || null, now, now]
      );
    }

    const token = jwt.sign({ syncId, androidId }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
