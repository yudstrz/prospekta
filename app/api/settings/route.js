import { NextResponse } from 'next/server';
import { sessionFromRequest, isSuperadmin } from '@/lib/auth';
import { getPublicSettings, getSettings, saveSettings, getCronFlags, setCronFlags } from '@/lib/tenant';
import { verifyTenantSmtp, sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

async function resolveTenantId(request) {
  const session = await sessionFromRequest(request);
  if (!session) return null;
  if (isSuperadmin(session)) {
    const url = new URL(request.url);
    const paramTid = url.searchParams.get('tenant_id');
    return paramTid || 'tnt_master';
  }
  if (session.tid) return session.tid;
  if (session.uid) {
    try {
      const { dbWrite } = await import('@/lib/db');
      const { rows } = await dbWrite.execute({
        sql: 'SELECT tenant_id FROM users WHERE id = ? LIMIT 1;',
        args: [session.uid],
      });
      if (rows?.[0]?.tenant_id) return rows[0].tenant_id;
    } catch (_) {}
  }
  return null;
}

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const tid = await resolveTenantId(request);

    if (url.searchParams.get('scope') === 'cron') {
      const cron = await getCronFlags(tid);
      return NextResponse.json({ success: true, cron, isSuperadmin: isSuperadmin(session) });
    }

    if (!tid) {
      return NextResponse.json(
        { success: false, error: 'Pengaturan hanya dapat diakses oleh akun klien atau superadmin.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, settings: await getPublicSettings(tid) });
  } catch (err) {
    console.error('[Settings GET error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await sessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const tid = await resolveTenantId(request);
  const input = await request.json().catch(() => ({}));

  if (url.searchParams.get('scope') === 'cron') {
    try {
      const cron = await setCronFlags(tid, input);
      return NextResponse.json({ success: true, cron });
    } catch (e) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.status || 500 });
    }
  }

  if (!tid) {
    return NextResponse.json(
      { success: false, error: 'Pengaturan hanya dapat disimpan untuk akun klien atau superadmin.' },
      { status: 400 }
    );
  }

  try {
    await saveSettings(tid, input);
    return NextResponse.json({ success: true, settings: await getPublicSettings(tid) });
  } catch (e) {
    if (!e.status) console.error('Save settings error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(request) {
  const session = await sessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const tid = await resolveTenantId(request);
  if (!tid) {
    return NextResponse.json({ success: false, error: 'Tenant tidak ditemukan.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.action === 'test_smtp') {
    try {
      const stored = (await getSettings(tid)) || {};
      const candidate = {
        smtp_host: body.smtp_host || stored.smtp_host,
        smtp_port: body.smtp_port || stored.smtp_port || 465,
        smtp_user: body.smtp_user || stored.smtp_user,
        smtp_from: body.smtp_from || stored.smtp_from,
        smtp_pass: body.smtp_pass || stored.smtp_pass,
      };
      await verifyTenantSmtp(candidate);
      return NextResponse.json({ success: true, message: 'Koneksi SMTP berhasil diverifikasi (TLS aman).' });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: `Koneksi SMTP gagal: ${e.message}` },
        { status: e.status || 400 }
      );
    }
  }

  if (body.action === 'connect_mcp') {
    const accountEmail = (body.email || session.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
      return NextResponse.json({ success: false, error: 'Alamat email tidak valid.' }, { status: 400 });
    }
    await saveSettings(tid, {
      email_provider_mode: 'gmail_mcp',
      gmail_mcp_account: accountEmail,
      gmail_mcp_connected: 1,
    });
    return NextResponse.json({
      success: true,
      message: `Email ${accountEmail} berhasil terhubung. Balasan penerima otomatis diarahkan ke ${accountEmail}.`,
      settings: await getPublicSettings(tid),
    });
  }

  if (body.action === 'disconnect_mcp') {
    await saveSettings(tid, {
      email_provider_mode: 'smtp',
      gmail_mcp_account: '',
      gmail_mcp_connected: 0,
    });
    return NextResponse.json({
      success: true,
      message: 'Koneksi email cepat telah diputus. Mode pengiriman dialihkan kembali ke SMTP.',
      settings: await getPublicSettings(tid),
    });
  }

  if (body.action === 'test_mcp') {
    try {
      const stored = (await getSettings(tid)) || {};
      const targetEmail = (body.target_email || session.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
        return NextResponse.json({ success: false, error: 'Alamat email penerima tujuan belum valid.' }, { status: 400 });
      }
      const isQuickMode = stored.email_provider_mode === 'gmail_mcp' && stored.gmail_mcp_account;
      const senderEmail = isQuickMode
        ? stored.gmail_mcp_account
        : (stored.smtp_from || stored.smtp_user || body.sender_email || process.env.SMTP_FROM || 'admin@prospekta.id');
      const compName = stored.company_name || 'Prospekta';
      const senderName = (body.from_name || '').trim() || `${senderEmail} (${compName})`;
      const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

      const sent = await sendEmail({
        to: targetEmail,
        subject: `[Uji Coba Konektor Email] Dari ${senderEmail}`,
        fromName: senderName,
        fromEmail: senderEmail,
        replyTo: senderEmail,
        tenantId: tid,
        text: `Halo,\n\nIni adalah email uji coba pengiriman dari ${compName}.\nIdentitas Pengirim & Reply-To: ${senderEmail}\nPenerima Tujuan: ${targetEmail}\n\nJika Anda membalas email ini, balasan akan otomatis masuk ke ${senderEmail}.`,
        html: `<div style="font-family:sans-serif;padding:20px;border:1px solid #e2e8f0;border-radius:8px;max-width:540px">
          <h3 style="color:#2563eb;margin-top:0">Konfirmasi Konektor Email Aktif</h3>
          <p>Halo,</p>
          <p>Email ini dikirim untuk memverifikasi konektor email workspace <strong>${esc(compName)}</strong>.</p>
          <div style="background:#f1f5f9;padding:14px;border-radius:6px;font-size:14px;margin:16px 0;line-height:1.6">
            <strong>Nama Tampilan Pengirim:</strong> ${esc(senderName)}<br/>
            <strong>Identitas Email / Reply-To:</strong> ${esc(senderEmail)}<br/>
            <strong>Email Penerima (To):</strong> ${esc(targetEmail)}
          </div>
          <p style="font-size:13px;color:#334155">Balas email ini untuk memastikan balasan langsung masuk ke kotak masuk <strong>${esc(senderEmail)}</strong>.</p>
          <p style="color:#64748b;font-size:12px;margin-bottom:0">${esc(compName)} &bull; Prospekta</p>
        </div>`,
        saveToSent: false,
      });
      return NextResponse.json({
        success: true,
        message: `Email uji coba terkirim ke ${targetEmail} (Identitas & Reply-To: ${sent.replyTo || senderEmail}, Relay: ${sent.fromEmail}).`,
        meta: {
          mode: stored.email_provider_mode || 'smtp',
          displaySender: senderEmail,
          envelopeFrom: sent.fromEmail,
          replyTo: sent.replyTo || senderEmail,
          to: targetEmail,
          provider: sent.provider,
        },
      });
    } catch (err) {
      return NextResponse.json({ success: false, error: `Gagal mengirim email uji coba: ${err.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ success: false, error: 'Aksi tidak dikenali.' }, { status: 400 });
}
