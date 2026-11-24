import { NextResponse } from 'next/server';
import { db, cachedExecute, invalidateCache } from '@/lib/db';

export async function GET() {
  try {
    const rulesRes = await cachedExecute('SELECT * FROM category_rules ORDER BY category_key ASC;', 300000);

    // Get list of unique bidang_usaha with 5 min cache
    const bidangRes = await cachedExecute(`
      SELECT DISTINCT bidang_usaha 
      FROM places 
      WHERE bidang_usaha IS NOT NULL 
      ORDER BY bidang_usaha ASC;
    `, 300000);

    return NextResponse.json({
      success: true,
      rules: rulesRes.rows || [],
      bidangOptions: (bidangRes.rows || []).map(r => r.bidang_usaha)
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { category_key, bidang_usaha } = body;

    if (!category_key || !bidang_usaha) {
      return NextResponse.json(
        { success: false, error: 'category_key dan bidang_usaha wajib diisi.' },
        { status: 400 }
      );
    }

    await db.execute({
      sql: `
        INSERT INTO category_rules (category_key, bidang_usaha)
        VALUES (?, ?)
        ON CONFLICT(category_key) DO UPDATE SET bidang_usaha = excluded.bidang_usaha;
      `,
      args: [category_key.trim().toLowerCase(), bidang_usaha.trim()]
    });

    // Optionally update existing places with this category pattern
    await db.execute({
      sql: `
        UPDATE places
        SET bidang_usaha = ?
        WHERE category_raw LIKE ?;
      `,
      args: [bidang_usaha.trim(), `%${category_key.trim()}%`]
    });

    invalidateCache();

    return NextResponse.json({ success: true, message: 'Aturan kategori berhasil disimpan dan diperbarui.' });
  } catch (error) {
    console.error('Error saving category:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib disertakan.' }, { status: 400 });
    }

    await db.execute({
      sql: 'DELETE FROM category_rules WHERE id = ?;',
      args: [id]
    });

    invalidateCache();

    return NextResponse.json({ success: true, message: 'Aturan kategori berhasil dihapus.' });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
