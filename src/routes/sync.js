const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// POST /sync/push — 클라이언트의 PENDING 항목을 서버로 전송
// 충돌 해결: 서버의 updated_at이 클라이언트의 localUpdatedAt보다 최신이면 서버 승
router.post('/push', async (req, res) => {
  const { syncId } = req.user;
  const { categories = [], transactions = [] } = req.body;

  const categoryResults = [];
  const transactionResults = [];
  const now = Date.now();

  try {
    // categories 먼저 처리
    for (const cat of categories) {
      const { localId, serverId, name, isIncome, localUpdatedAt, isDeleted = false } = cat;

      if (!serverId) {
        if (isDeleted) {
          categoryResults.push({ localId, serverId: uuidv4(), status: 'created' });
          continue;
        }
        const newId = uuidv4();
        await pool.query(
          'INSERT INTO categories (id, sync_id, name, is_income, updated_at) VALUES ($1, $2, $3, $4, $5)',
          [newId, syncId, name, isIncome ? 1 : 0, localUpdatedAt || now]
        );
        categoryResults.push({ localId, serverId: newId, status: 'created' });
      } else {
        const serverCat = (await pool.query(
          'SELECT * FROM categories WHERE id = $1 AND sync_id = $2', [serverId, syncId]
        )).rows[0];

        if (!serverCat) {
          if (isDeleted) {
            categoryResults.push({ localId, serverId, status: 'updated' });
          } else {
            await pool.query(
              'INSERT INTO categories (id, sync_id, name, is_income, updated_at) VALUES ($1, $2, $3, $4, $5)',
              [serverId, syncId, name, isIncome ? 1 : 0, localUpdatedAt || now]
            );
            categoryResults.push({ localId, serverId, status: 'created' });
          }
        } else if (serverCat.updated_at > (localUpdatedAt || 0)) {
          categoryResults.push({
            localId,
            serverId,
            status: 'conflict_server_wins',
            serverData: {
              name: serverCat.name,
              isIncome: serverCat.is_income === 1,
              updatedAt: serverCat.updated_at,
            },
          });
        } else if (isDeleted) {
          await pool.query(
            'UPDATE categories SET is_deleted = 1, updated_at = $1 WHERE id = $2',
            [localUpdatedAt || now, serverId]
          );
          categoryResults.push({ localId, serverId, status: 'updated' });
        } else {
          await pool.query(
            'UPDATE categories SET name = $1, is_income = $2, updated_at = $3 WHERE id = $4',
            [name, isIncome ? 1 : 0, localUpdatedAt || now, serverId]
          );
          categoryResults.push({ localId, serverId, status: 'updated' });
        }
      }
    }

    // transactions 처리
    for (const tx of transactions) {
      const { localId, serverId, categoryServerId, content, timeStamp, amount, assetType, isIncome, localUpdatedAt, isDeleted = false } = tx;

      if (!serverId) {
        if (isDeleted) {
          transactionResults.push({ localId, serverId: uuidv4(), status: 'created' });
          continue;
        }
        const newId = uuidv4();
        await pool.query(
          `INSERT INTO transactions (id, sync_id, category_server_id, content, time_stamp, amount, asset_type, is_income, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newId, syncId, categoryServerId || null, content, timeStamp, amount, assetType, isIncome ? 1 : 0, localUpdatedAt || now]
        );
        transactionResults.push({ localId, serverId: newId, status: 'created' });
      } else {
        const serverTx = (await pool.query(
          'SELECT * FROM transactions WHERE id = $1 AND sync_id = $2', [serverId, syncId]
        )).rows[0];

        if (!serverTx) {
          if (isDeleted) {
            transactionResults.push({ localId, serverId, status: 'updated' });
          } else {
            await pool.query(
              `INSERT INTO transactions (id, sync_id, category_server_id, content, time_stamp, amount, asset_type, is_income, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [serverId, syncId, categoryServerId || null, content, timeStamp, amount, assetType, isIncome ? 1 : 0, localUpdatedAt || now]
            );
            transactionResults.push({ localId, serverId, status: 'created' });
          }
        } else if (serverTx.updated_at > (localUpdatedAt || 0)) {
          transactionResults.push({
            localId,
            serverId,
            status: 'conflict_server_wins',
            serverData: {
              categoryServerId: serverTx.category_server_id,
              content: serverTx.content,
              timeStamp: serverTx.time_stamp,
              amount: serverTx.amount,
              assetType: serverTx.asset_type,
              isIncome: serverTx.is_income === 1,
              updatedAt: serverTx.updated_at,
            },
          });
        } else if (isDeleted) {
          await pool.query(
            'UPDATE transactions SET is_deleted = 1, updated_at = $1 WHERE id = $2',
            [localUpdatedAt || now, serverId]
          );
          transactionResults.push({ localId, serverId, status: 'updated' });
        } else {
          await pool.query(
            `UPDATE transactions SET category_server_id = $1, content = $2, time_stamp = $3, amount = $4,
             asset_type = $5, is_income = $6, updated_at = $7 WHERE id = $8`,
            [categoryServerId || null, content, timeStamp, amount, assetType, isIncome ? 1 : 0, localUpdatedAt || now, serverId]
          );
          transactionResults.push({ localId, serverId, status: 'updated' });
        }
      }
    }

    res.json({
      syncedAt: now,
      categories: categoryResults,
      transactions: transactionResults,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 오류' });
  }
});

// GET /sync/pull?since=<timestamp> — 서버의 변경사항 가져오기
router.get('/pull', async (req, res) => {
  const { syncId } = req.user;
  const since = parseInt(req.query.since || '0');

  try {
    const categories = (await pool.query(
      'SELECT * FROM categories WHERE sync_id = $1 AND updated_at > $2',
      [syncId, since]
    )).rows;

    const transactions = (await pool.query(
      'SELECT * FROM transactions WHERE sync_id = $1 AND updated_at > $2',
      [syncId, since]
    )).rows;

    res.json({
      syncedAt: Date.now(),
      categories: categories.map(c => ({
        serverId: c.id,
        name: c.name,
        isIncome: c.is_income === 1,
        updatedAt: c.updated_at,
        isDeleted: c.is_deleted === 1,
      })),
      transactions: transactions.map(t => ({
        serverId: t.id,
        categoryServerId: t.category_server_id,
        content: t.content,
        timeStamp: t.time_stamp,
        amount: t.amount,
        assetType: t.asset_type,
        isIncome: t.is_income === 1,
        updatedAt: t.updated_at,
        isDeleted: t.is_deleted === 1,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
