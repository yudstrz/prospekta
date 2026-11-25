import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { extractText, getDocumentProxy } from 'unpdf';
import { sessionFromRequest, isSuperadmin } from '@/lib/auth';
import { dbWrite } from '@/lib/db';
import { getSettings, getPublicSettings, saveSettings, parseCompanyPdfs } from '@/lib/tenant';
import { getDecryptedActiveKey, resolveLatestModel } from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_PDF_FILES = 6;
const MAX_SINGLE_PDF_CHARS = 6000;
const MAX_TOTAL_PDF_CONTEXT_CHARS = 24000;

async function resolveTenantId(request) {
  const session = await sessionFromRequest(request);
  if (!session) return { session: null, tid: null };
  if (isSuperadmin(session)) {
    const url = new URL(request.url);
    return { session, tid: url.searchParams.get('tenant_id') || 'tnt_master' };
  }
  if (session.tid) return { session, tid: session.tid };
  if (session.uid) {
    try {
      const { rows } = await dbWrite.execute({
        sql: 'SELECT tenant_id FROM users WHERE id = ? LIMIT 1;',
        args: [session.uid],
      });
      if (rows?.[0]?.tenant_id) return { session, tid: rows[0].tenant_id };
    } catch (_) {}
  }
  return { session, tid: null };
}

function buildCombinedPdfContext(pdfs) {
  if (!Array.isArray(pdfs) || pdfs.length === 0) return '';
  let combined = '';
  for (const item of pdfs) {
    const content = (item?.content || item?.excerpt || '').trim();
    if (!content) continue;
    const header = `[Dokumen PDF: ${item.title || item.name}${item.pages ? ` (${item.pages} hal)` : ''}]\n`;
    const block = `${header}${content}\n\n`;
    if (combined.length + block.length > MAX_TOTAL_PDF_CONTEXT_CHARS) {
      const remaining = MAX_TOTAL_PDF_CONTEXT_CHARS - combined.length;
      if (remaining > header.length + 120) combined += block.slice(0, remaining);
      break;
    }
    combined += block;
  }
  return combined.trim();
}

function cleanPdfText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractTextWithGeminiFallback(buffer, session) {
  let geminiKey = null;
  if (session?.uid) {
    try {
      const userKey = await getDecryptedActiveKey(session.uid);
      if (userKey?.provider === 'gemini' && userKey?.apiKey) geminiKey = userKey.apiKey;
    } catch (_) {}
  }
  if (!geminiKey && process.env.GEMINI_API_KEY) geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return '';

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = await resolveLatestModel('gemini', geminiKey);
    const res = await Promise.race([
      ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
          {
            text: 'Ekstrak seluruh informasi produk, layanan, harga/paket, keunggulan, dan kontak perusahaan dari PDF ini dalam teks terstruktur yang ringkas dan jelas.',
          },
        ],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini PDF timeout')), 25000)),
    ]);
    return cleanPdfText(res?.text || '');
  } catch (_) {
    return '';
  }
}

export async function POST(request) {
  try {
    const { session, tid } = await resolveTenantId(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Workspace akun tidak ditemukan.' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const customTitle = String(formData.get('title') || '').trim();
    const applyToOffering = formData.get('applyToOffering') === 'true';

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ success: false, error: 'Pilih file PDF terlebih dahulu.' }, { status: 400 });
    }

    const fileName = String(file.name || 'dokumen-perusahaan.pdf').replace(/[\\/:*?"<>|]/g, '_');
    const isPdfExt = fileName.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdfExt) {
      return NextResponse.json({ success: false, error: 'Hanya file berformat PDF (.pdf) yang didukung.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ success: false, error: 'File PDF kosong.' }, { status: 400 });
    }
    if (buffer.length > MAX_PDF_BYTES) {
      return NextResponse.json({ success: false, error: 'Ukuran PDF maksimal 4 MB agar pemrosesan tetap cepat.' }, { status: 400 });
    }
    if (!buffer.subarray(0, 1024).includes('%PDF-')) {
      return NextResponse.json({ success: false, error: 'File tidak valid atau bukan struktur PDF asli.' }, { status: 400 });
    }

    let pages = 1;
    let extracted = '';
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      pages = Number(result?.totalPages || 1);
      extracted = cleanPdfText(result?.text || '');
    } catch (parseErr) {
      console.warn('[Company PDF] unpdf parse notice:', parseErr.message);
    }

    if (extracted.length < 40) {
      const ocrText = await extractTextWithGeminiFallback(buffer, session);
      if (ocrText.length >= 40) extracted = ocrText;
    }

    if (extracted.length < 20) {
      return NextResponse.json(
        {
          success: false,
          error: 'Teks pada PDF tidak terbaca (kemungkinan hasil scan gambar). Unggah PDF berbasis teks atau hubungkan Google Gemini API Key terlebih dahulu.',
        },
        { status: 422 }
      );
    }

    const existingSettings = (await getSettings(tid)) || {};
    const currentPdfs = parseCompanyPdfs(existingSettings.company_pdfs);
    const cappedContent = extracted.slice(0, MAX_SINGLE_PDF_CHARS);
    const docEntry = {
      id: `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: fileName,
      title: customTitle || fileName.replace(/\.pdf$/i, ''),
      sizeBytes: buffer.length,
      pages,
      chars: extracted.length,
      uploadedAt: new Date().toISOString(),
      excerpt: cappedContent.slice(0, 500),
      content: cappedContent,
    };

    const nextPdfs = [docEntry, ...currentPdfs].slice(0, MAX_PDF_FILES);
    const nextContext = buildCombinedPdfContext(nextPdfs);
    const patch = {
      company_pdfs: JSON.stringify(nextPdfs),
      company_pdf_context: nextContext,
    };

    if (applyToOffering) {
      const summaryLine = `[PDF: ${docEntry.title}] ${docEntry.excerpt.replace(/\n+/g, ' ').slice(0, 320)}`;
      patch.company_offering = existingSettings.company_offering
        ? `${existingSettings.company_offering.trim()}\n\n${summaryLine}`
        : summaryLine;
    }

    await saveSettings(tid, patch);
    const publicSettings = await getPublicSettings(tid);

    return NextResponse.json({
      success: true,
      pdf: { ...docEntry, content: undefined },
      settings: publicSettings,
    });
  } catch (err) {
    console.error('[Company PDF POST error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Gagal memproses file PDF.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { session, tid } = await resolveTenantId(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!tid) {
      return NextResponse.json({ success: false, error: 'Workspace akun tidak ditemukan.' }, { status: 400 });
    }

    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Parameter id PDF diperlukan.' }, { status: 400 });
    }

    const existingSettings = (await getSettings(tid)) || {};
    const currentPdfs = parseCompanyPdfs(existingSettings.company_pdfs);
    const nextPdfs = currentPdfs.filter((item) => item.id !== id);
    const nextContext = buildCombinedPdfContext(nextPdfs);

    await saveSettings(tid, {
      company_pdfs: JSON.stringify(nextPdfs),
      company_pdf_context: nextContext,
    });

    return NextResponse.json({
      success: true,
      settings: await getPublicSettings(tid),
    });
  } catch (err) {
    console.error('[Company PDF DELETE error]:', err);
    return NextResponse.json({ success: false, error: err.message || 'Gagal menghapus file PDF.' }, { status: 500 });
  }
}
