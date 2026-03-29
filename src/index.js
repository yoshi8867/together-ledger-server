require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/sync', require('./routes/sync'));

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Together Ledger 서버 실행 중: http://localhost:${PORT}`);
});
