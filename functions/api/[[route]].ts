import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

app.get('/get_items', async (c) => {
  const page = parseInt(c.req.query('page') || '1') || 1;
  const pageSize = parseInt(c.req.query('page_size') || '10') || 10;
  const offset = (page - 1) * pageSize;
  
  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as count FROM accounting_items').first<{ count: number }>();
  const total_count = countResult ? countResult.count : 0;
  
  const { results } = await c.env.DB.prepare(
    'SELECT id, item_name, datetime, amount, note FROM accounting_items ORDER BY datetime DESC LIMIT ? OFFSET ?'
  ).bind(pageSize, offset).all();
  
  const items = results.map((row: any) => ({
    id: row.id,
    item_name: row.item_name,
    datetime: row.datetime.replace(' ', 'T'), // Frontend expects T
    amount: (row.amount / 100).toFixed(2), // Parse float logic on frontend expects string or float
    note: row.note
  }));
  
  const total_pages = Math.max(1, Math.ceil(total_count / pageSize));
  
  return c.json({
    items,
    total_count,
    page,
    page_size: pageSize,
    total_pages
  });
});

app.post('/add_item', async (c) => {
  const body = await c.req.json();
  const { item_name, datetime, amount, note } = body;
  
  if (!item_name || !item_name.trim()) {
    return c.json({ message: 'item_name 不可為空' }, 400);
  }
  
  const amountCents = Math.round(parseFloat(amount) * 100);
  if (isNaN(amountCents)) {
    return c.json({ message: 'amount 格式錯誤' }, 400);
  }
  
  let validDatetime = (datetime || '').trim();
  if (!validDatetime) {
     const now = new Date();
     // offset timestamp to create local-like representation if necessary
     validDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
         .toISOString().slice(0, 19).replace('T', ' ');
  } else {
     validDatetime = validDatetime.replace('T', ' ');
  }
  
  await c.env.DB.prepare(
    'INSERT INTO accounting_items (item_name, datetime, amount, note) VALUES (?, ?, ?, ?)'
  ).bind(item_name.trim(), validDatetime, amountCents, note || null).run();
  
  return c.json({ message: 'Item added successfully' });
});

app.put('/update_item/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { item_name, datetime, amount, note } = body;
  
  if (!item_name || !item_name.trim()) {
    return c.json({ message: 'item_name 不可為空' }, 400);
  }
  
  const amountCents = Math.round(parseFloat(amount) * 100);
  if (isNaN(amountCents)) {
    return c.json({ message: 'amount 格式錯誤' }, 400);
  }
  
  let validDatetime = (datetime || '').trim().replace('T', ' ');
  
  const info = await c.env.DB.prepare(
    'UPDATE accounting_items SET item_name = ?, datetime = ?, amount = ?, note = ? WHERE id = ?'
  ).bind(item_name.trim(), validDatetime, amountCents, note || null, id).run();
  
  if (!info.success) {
    return c.json({ message: '更新失敗' }, 500);
  }

  // D1 meta.changes is returned as meta.changes but we can also rely strictly on returning id
  // Note: if row doesn't exist, changes might be 0, but older D1 alpha had issues. It's generally stable now.
  if (info.meta && info.meta.changes === 0) {
      return c.json({ message: '找不到指定的記帳項目' }, 404);
  }
  
  return c.json({ message: 'Item updated successfully' });
});

app.delete('/delete_item/:id', async (c) => {
  const id = c.req.param('id');
  const info = await c.env.DB.prepare('DELETE FROM accounting_items WHERE id = ?').bind(id).run();
  
  if (!info.success) {
    return c.json({ message: '刪除失敗' }, 500);
  }

  if (info.meta && info.meta.changes === 0) {
      return c.json({ message: '找不到指定的記帳項目' }, 404);
  }
  
  return c.json({ message: 'Item deleted successfully' });
});

export const onRequest = handle(app);
