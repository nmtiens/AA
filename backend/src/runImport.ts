import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { pool } from './db.js';

const CSV_FILE_PATH = './data.csv';
const TABLE_NAME = 'data_production_status';

async function runAutoImport() {
  const client = await pool.connect();
  try {
    const absolutePath = path.resolve(CSV_FILE_PATH);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Không tìm thấy file: ${absolutePath}`);
      return;
    }

    console.log('⏳ Đang đọc cấu trúc file CSV...');
    const rows: any[] = [];
    
    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(absolutePath)
        .pipe(csv())
        .on('data', (data) => rows.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    if (rows.length === 0) {
      console.error('File CSV không có dữ liệu!');
      return;
    }

    const columns = Object.keys(rows[0]).map(c => c.trim()).filter(Boolean);
    console.log(`Đã tìm thấy ${columns.length} cột và ${rows.length} dòng.`);

    // 1. Tạo bảng tự động trong PostgreSQL (SOURCE_APP)
    const columnDefinitions = columns.map(col => `"${col}" TEXT`).join(',\n  ');
    const createTableQuery = `
      DROP TABLE IF EXISTS ${TABLE_NAME};
      CREATE TABLE ${TABLE_NAME} (
        id SERIAL PRIMARY KEY,
        ${columnDefinitions}
      );
    `;

    console.log(`🔨 Đang tạo lại bảng ${TABLE_NAME}...`);
    await client.query(createTableQuery);

    // 2. Chèn dữ liệu theo Batch (mỗi đợt 1000 dòng để đạt tốc độ cao nhất)
    console.log('⚡ Đang đẩy dữ liệu vào Database SOURCE_APP...');
    const BATCH_SIZE = 1000;
    const quotedColumns = columns.map(c => `"${c}"`).join(', ');

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const valueRows: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      batch.forEach(row => {
        const rowParams: string[] = [];
        columns.forEach(col => {
          rowParams.push(`$${paramIndex++}`);
          params.push(row[col] ?? null);
        });
        valueRows.push(`(${rowParams.join(', ')})`);
      });

      const insertQuery = `
        INSERT INTO ${TABLE_NAME} (${quotedColumns})
        VALUES ${valueRows.join(',\n')}
      `;

      await client.query(insertQuery, params);
      console.log(`   ➜ Đã nạp ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} dòng...`);
    }

    console.log(' Import dữ liệu vào PostgreSQL SOURCE_APP thành công 100%!');
  } catch (error) {
    console.error(' Lỗi khi import:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runAutoImport();