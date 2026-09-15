import { Router, Request, Response } from 'express';
import { getConnection } from '../db.js';

const router = Router();

// Get comments for a specific cell
router.get('/comments', async (req: Request, res: Response) => {
  try {
    const { table, quoteNo, lineNo, columnName } = req.query;

    if (!table || !quoteNo || lineNo === null || lineNo === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: table, quoteNo, lineNo' });
    }

    const pool = await getConnection();
    let query = `
      SELECT [id], [table_name], [quote_no], [line_no], [column_name], [user], [timestamp], [comment_text]
      FROM [dbo].[comments]
      WHERE [table_name] = @table_name AND [quote_no] = @quote_no AND [line_no] = @line_no
    `;

    const request = pool.request()
      .input('table_name', String(table))
      .input('quote_no', String(quoteNo))
      .input('line_no', Number(lineNo));

    // If columnName is provided, filter by it
    if (columnName) {
      query += ` AND [column_name] = @column_name`;
      request.input('column_name', String(columnName));
    }

    query += ` ORDER BY [timestamp] DESC`;

    const result = await request.query(query);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments', details: (error as any).message });
  }
});

// Add a new comment
router.post('/comments', async (req: Request, res: Response) => {
  try {
    console.log('[COMMENTS POST] Request received. Body:', req.body);

    const { table, quoteNo, lineNo, columnName, user, commentText } = req.body;

    if (!table || !quoteNo || lineNo === null || lineNo === undefined || !columnName || !user || !commentText) {
      const missingFields = [];
      if (!table) missingFields.push('table');
      if (!quoteNo) missingFields.push('quoteNo');
      if (lineNo === null || lineNo === undefined) missingFields.push('lineNo');
      if (!columnName) missingFields.push('columnName');
      if (!user) missingFields.push('user');
      if (!commentText) missingFields.push('commentText');
      console.log('[COMMENTS] Missing fields:', missingFields);
      return res.status(400).json({ error: 'Missing required fields', missingFields });
    }

    const pool = await getConnection();
    await pool.request()
      .input('table_name', String(table))
      .input('quote_no', String(quoteNo))
      .input('line_no', Number(lineNo))
      .input('column_name', String(columnName))
      .input('user_name', String(user))
      .input('comment_text', String(commentText))
      .query(`
        INSERT INTO [dbo].[comments] ([table_name], [quote_no], [line_no], [column_name], [user], [comment_text], [timestamp])
        VALUES (@table_name, @quote_no, @line_no, @column_name, @user_name, @comment_text, GETUTCDATE())
      `);

    console.log('[COMMENTS] Comment added successfully');
    res.status(201).json({ success: true, message: 'Comment added successfully' });
  } catch (error) {
    console.error('[COMMENTS] Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment', details: (error as any).message });
  }
});

// Delete a comment
router.delete('/comments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const pool = await getConnection();
    await pool.request()
      .input('id', Number(id))
      .query(`
        DELETE FROM [dbo].[comments]
        WHERE [id] = @id
      `);

    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment', details: (error as any).message });
  }
});

// Get all comments summary for a table
router.get('/comments/summary/:table', async (req: Request, res: Response) => {
  try {
    const { table } = req.params;

    const pool = await getConnection();
    const result = await pool.request()
      .input('table_name', String(table))
      .query(`
        SELECT
          [id],
          [table_name],
          [quote_no],
          [line_no],
          [column_name],
          [user],
          [timestamp],
          [comment_text]
        FROM [dbo].[comments]
        WHERE [table_name] = @table_name
        ORDER BY [timestamp] DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching comments summary:', error);
    res.status(500).json({ error: 'Failed to fetch comments summary', details: (error as any).message });
  }
});

export default router;
