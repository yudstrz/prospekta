import nodemailer from 'nodemailer';
import tls from 'tls';
import { getSettings, assertSafeSmtpHost, ALLOWED_SMTP_PORTS } from './tenant';

// Buat transporter reusable dengan pool
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: (process.env.SMTP_PORT || '587') === '465',
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const mimeBuilder = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: 'windows',
});

/**
 * Menyimpan salinan email yang sudah terkirim via SMTP ke folder "Sent" (INBOX.Sent)
 * di Roundcube / cPanel Webmail menggunakan protokol IMAP APPEND (port 993 SSL).
 */
export async function appendToImapSentFolder({
  from,
  to,
  subject,
  text,
  html,
  messageId,
  date,
}) {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) return { synced: false, reason: 'missing_credentials' };

  try {
    const compiled = await mimeBuilder.sendMail({
      from,
      to,
      subject,
      text,
      html,
      messageId,
      date: date ? new Date(date) : new Date(),
    });
    const rawMime = compiled.message.toString('utf8');

    return await new Promise((resolve) => {
      const socket = tls.connect({
        host,
        port: 993,
        rejectUnauthorized: false,
      });

      let buffer = '';
      let step = 'greeting';
      const timeout = setTimeout(() => {
        try { socket.destroy(); } catch (_) {}
        resolve({ synced: false, reason: 'imap_timeout' });
      }, 7000);

      const finish = (result) => {
        clearTimeout(timeout);
        try { socket.end('A99 LOGOUT\r\n'); } catch (_) {}
        resolve(result);
      };

      const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');

        if (step === 'greeting' && buffer.includes('\r\n')) {
          buffer = '';
          step = 'login';
          socket.write(`A01 LOGIN ${quote(user)} ${quote(pass)}\r\n`);
        } else if (step === 'login' && /A01 (OK|NO|BAD)/i.test(buffer)) {
          if (!/A01 OK/i.test(buffer)) {
            return finish({ synced: false, reason: 'imap_login_failed', raw: buffer.trim() });
          }
          buffer = '';
          step = 'append_wait';
          const byteLen = Buffer.byteLength(rawMime, 'utf8');
          socket.write(`A02 APPEND "INBOX.Sent" (\\Seen) {${byteLen}}\r\n`);
        } else if (step === 'append_wait' && buffer.includes('+')) {
          buffer = '';
          step = 'append_done';
          socket.write(rawMime + '\r\n');
        } else if (step === 'append_done' && /A02 (OK|NO|BAD)/i.test(buffer)) {
          const ok = /A02 OK/i.test(buffer);
          return finish({ synced: ok, raw: buffer.trim() });
        }
      });

      socket.on('error', (err) => {
        finish({ synced: false, reason: err.message });
      });
    });
  } catch (err) {
    return { synced: false, reason: err.message };
  }
}

/**
 * Kirim email cold outreach atau email penawaran website preview
 * Mendukung Resend API (Primary jika RESEND_API_KEY ada) dan SMTP (Fallback)
 * 
 * @param {Object} options
 * @param {string} options.to - Alamat email penerima
 * @param {string} options.subject - Subjek email
 * @param {string} [options.text] - Isi email plain text
 * @param {string} [options.html] - Isi email HTML
 * @param {string} [options.fromName] - Nama pengirim
 * @param {string} [options.fromEmail] - Email pengirim
 * @returns {Promise<Object>}
 */
async function createSafeTenantTransporter(s) {
  const safeHost = await assertSafeSmtpHost(s?.smtp_host);
  const port = parseInt(s?.smtp_port || 465, 10);
  if (!ALLOWED_SMTP_PORTS.has(port)) {
    throw Object.assign(new Error('Port SMTP tidak didukung (gunakan 465, 587, 25, atau 2525).'), { status: 400 });
  }
  const user = (s?.smtp_user || s?.smtp_from || '').trim();
  const pass = (s?.smtp_pass || '').trim();
  if (!user || !pass) {
    throw Object.assign(new Error('Username dan Password Aplikasi SMTP wajib diisi.'), { status: 400 });
  }
  return nodemailer.createTransport({
    host: safeHost,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  });
}

export async function verifyTenantSmtp(s) {
  const t = await createSafeTenantTransporter(s);
  await t.verify();
  return true;
}

export async function sendEmail({ 
  to, 
  subject, 
  text, 
  html, 
  fromName,
  fromEmail,
  replyTo,
  saveToSent = true,
  tenantId = null
}) {
  let activeTransporter = transporter;
  let activeFromName = fromName;
  let activeFromEmail = fromEmail;
  let activeReplyTo = replyTo;
  let hasCustomSmtp = false;

  const targetTid = tenantId || 'tnt_master';
  const s = await getSettings(targetTid).catch(() => null);

  if (s) {
    if (!activeFromName || activeFromName === 'Prospekta Team') {
      activeFromName = s.company_name ? `${s.company_name} Team` : 'Prospekta Team';
    }
    if (s.email_provider_mode === 'gmail_mcp' && s.gmail_mcp_account) {
      activeReplyTo = s.gmail_mcp_account;
      if (!activeFromName || activeFromName.includes('via MCP') || activeFromName === 'Prospekta Team') {
        activeFromName = s.company_name ? `${s.company_name}` : 'Prospekta Team';
      }
      activeFromEmail = process.env.SMTP_FROM || 'admin@prospekta.id';
    } else if (s.smtp_host && s.smtp_pass && (s.smtp_user || s.smtp_from)) {
      activeTransporter = await createSafeTenantTransporter(s);
      activeFromEmail = s.smtp_from || s.smtp_user;
      if (!activeReplyTo) activeReplyTo = activeFromEmail;
      hasCustomSmtp = true;
    } else if (tenantId && tenantId !== 'tnt_master') {
      throw Object.assign(
        new Error('Akun email pengirim (SMTP) belum dikonfigurasi. Silakan lengkapi di menu Pengaturan > Email (SMTP).'),
        { status: 400 }
      );
    }
  }

  if (!activeFromName) activeFromName = 'Prospekta Outreach Team';
  if (!activeFromEmail) activeFromEmail = process.env.SMTP_FROM || 'admin@prospekta.id';
  if (!activeReplyTo) activeReplyTo = activeFromEmail;

  const resendApiKey = process.env.RESEND_API_KEY;

  // 1. Coba kirim via Resend API jika API Key tersedia DAN tidak menggunakan custom SMTP tenant
  if (!hasCustomSmtp && resendApiKey) {
    try {
      const fromFormatted = `"${activeFromName}" <${activeFromEmail}>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromFormatted,
          to: Array.isArray(to) ? to : [to],
          subject,
          text: text || '',
          html: html || undefined,
          reply_to: activeReplyTo || activeFromEmail,
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        return {
          provider: 'resend',
          messageId: data.id,
          response: `Resend ID: ${data.id}`
        };
      }

      console.warn(`[Email] Resend API error (${res.status}):`, data?.message || data);
    } catch (resendErr) {
      console.warn('[Email] Resend fetch exception, switching to SMTP fallback:', resendErr.message);
    }
  }

  // 2. Fallback ke SMTP
  const formattedFrom = `"${activeFromName}" <${activeFromEmail}>`;
  const mailPayload = {
    from: formattedFrom,
    to,
    subject,
    text,
    html,
  };
  if (activeReplyTo) {
    mailPayload.replyTo = activeReplyTo;
  }
  const info = await activeTransporter.sendMail(mailPayload);

  // 3. Simpan otomatis salinan email ke folder "Sent" (INBOX.Sent) di IMAP Sent folder
  const imapSync = (!hasCustomSmtp && saveToSent) ? await appendToImapSentFolder({
    from: formattedFrom,
    to,
    subject,
    text,
    html,
    messageId: info.messageId,
  }).catch(() => ({ synced: false })) : { synced: false };

  return {
    provider: hasCustomSmtp ? 'tenant_smtp' : 'smtp',
    messageId: info.messageId,
    response: info.response,
    sentFolderSynced: Boolean(imapSync?.synced)
  };
}

/**
 * Decode RFC 2047 encoded words (e.g. =?UTF-8?B?...?= or =?UTF-8?Q?...?=)
 */
function decodeMimeWords(str = '') {
  if (!str) return '';
  return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf8');
      }
      if (encoding.toUpperCase() === 'Q') {
        const qText = text
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (__, hex) => String.fromCharCode(parseInt(hex, 16)));
        return Buffer.from(qText, 'binary').toString('utf8');
      }
    } catch (_) {}
    return text;
  });
}

function decodeQuotedPrintable(str = '') {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Simple MIME message parser to extract headers, plain text, and HTML body
 */
export function parseRawEmail(raw = '') {
  const splitIdx = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  const rawHeaders = splitIdx !== -1 ? raw.slice(0, splitIdx) : raw;
  const rawBody = splitIdx !== -1 ? raw.slice(splitIdx + (raw[splitIdx] === '\r' ? 4 : 2)) : '';

  const unfolded = rawHeaders.replace(/\r?\n([ \t]+)/g, ' ');
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      headers[key] = decodeMimeWords(val);
    }
  }

  const contentType = headers['content-type'] || 'text/plain';
  const transferEncoding = (headers['content-transfer-encoding'] || '').toLowerCase();

  const decodePartBody = (partText, enc) => {
    const cleanEnc = (enc || '').toLowerCase();
    if (cleanEnc.includes('base64')) {
      try {
        return Buffer.from(partText.replace(/\s+/g, ''), 'base64').toString('utf8');
      } catch (_) {
        return partText;
      }
    }
    if (cleanEnc.includes('quoted-printable')) {
      try {
        const bin = decodeQuotedPrintable(partText);
        return Buffer.from(bin, 'binary').toString('utf8');
      } catch (_) {
        return decodeQuotedPrintable(partText);
      }
    }
    return partText;
  };

  let textBody = '';
  let htmlBody = '';

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (boundaryMatch) {
    const boundary = `--${boundaryMatch[1]}`;
    const parts = rawBody.split(boundary).slice(1);
    for (const part of parts) {
      if (part.startsWith('--')) break;
      const pIdx = part.indexOf('\r\n\r\n') !== -1 ? part.indexOf('\r\n\r\n') : part.indexOf('\n\n');
      if (pIdx === -1) continue;
      const pHeaderStr = part.slice(0, pIdx).replace(/\r?\n([ \t]+)/g, ' ');
      const pContent = part.slice(pIdx + (part[pIdx] === '\r' ? 4 : 2)).trim();
      const pTypeMatch = pHeaderStr.match(/content-type:\s*([^\r\n;]+)/i);
      const pEncMatch = pHeaderStr.match(/content-transfer-encoding:\s*([^\r\n;]+)/i);
      const pType = (pTypeMatch ? pTypeMatch[1] : 'text/plain').toLowerCase();
      const pEnc = pEncMatch ? pEncMatch[1].trim() : '';

      const subBoundaryMatch = pHeaderStr.match(/boundary="?([^";\r\n]+)"?/i);
      if (subBoundaryMatch) {
        const subBoundary = `--${subBoundaryMatch[1]}`;
        const subParts = pContent.split(subBoundary).slice(1);
        for (const sp of subParts) {
          if (sp.startsWith('--')) break;
          const spIdx = sp.indexOf('\r\n\r\n') !== -1 ? sp.indexOf('\r\n\r\n') : sp.indexOf('\n\n');
          if (spIdx === -1) continue;
          const spHdr = sp.slice(0, spIdx);
          const spBody = sp.slice(spIdx + (sp[spIdx] === '\r' ? 4 : 2)).trim();
          const spType = (spHdr.match(/content-type:\s*([^\r\n;]+)/i)?.[1] || '').toLowerCase();
          const spEnc = spHdr.match(/content-transfer-encoding:\s*([^\r\n;]+)/i)?.[1] || '';
          if (spType.includes('text/plain') && !textBody) {
            textBody = decodePartBody(spBody, spEnc);
          } else if (spType.includes('text/html') && !htmlBody) {
            htmlBody = decodePartBody(spBody, spEnc);
          }
        }
        continue;
      }

      if (pType.includes('text/plain') && !textBody) {
        textBody = decodePartBody(pContent, pEnc);
      } else if (pType.includes('text/html') && !htmlBody) {
        htmlBody = decodePartBody(pContent, pEnc);
      }
    }
  } else {
    const decoded = decodePartBody(rawBody.trim(), transferEncoding);
    if (contentType.toLowerCase().includes('text/html')) {
      htmlBody = decoded;
    } else {
      textBody = decoded;
    }
  }

  return {
    from: headers['from'] || '',
    to: headers['to'] || '',
    cc: headers['cc'] || '',
    subject: headers['subject'] || '(Tanpa Subjek)',
    date: headers['date'] || '',
    messageId: headers['message-id'] || '',
    inReplyTo: headers['in-reply-to'] || '',
    text: textBody.trim(),
    html: htmlBody.trim(),
  };
}

/**
 * Mengambil daftar email atau isi pesan tunggal dari server IMAP (Port 993 SSL)
 */
export async function fetchImapMailbox({
  host = process.env.SMTP_HOST || 'smtp.gmail.com',
  user = process.env.SMTP_USERNAME || 'admin@prospekta.id',
  pass = process.env.SMTP_PASSWORD,
  folder = 'INBOX',
  limit = 40,
  page = 1,
  uid = null,
}) {
  if (!user || !pass) {
    return { success: false, error: 'Kredensial IMAP/SMTP belum dikonfigurasi.' };
  }

  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: 993,
      rejectUnauthorized: false,
    });

    let buffer = '';
    let step = 'greeting';
    let totalMessages = 0;

    const timeout = setTimeout(() => {
      try { socket.destroy(); } catch (_) {}
      resolve({ success: false, error: 'Koneksi ke server Webmail IMAP timeout.' });
    }, 8000);

    const finish = (res) => {
      clearTimeout(timeout);
      try { socket.end('A99 LOGOUT\r\n'); } catch (_) {}
      resolve(res);
    };

    const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      if (step === 'greeting' && buffer.includes('\r\n')) {
        buffer = '';
        step = 'login';
        socket.write(`A01 LOGIN ${quote(user)} ${quote(pass)}\r\n`);
      } else if (step === 'login' && /A01 (OK|NO|BAD)/i.test(buffer)) {
        if (!/A01 OK/i.test(buffer)) {
          return finish({ success: false, error: 'Gagal otentikasi ke Webmail IMAP.' });
        }
        buffer = '';
        step = 'select';
        socket.write(`A02 SELECT ${quote(folder)}\r\n`);
      } else if (step === 'select' && /A02 (OK|NO|BAD)/i.test(buffer)) {
        if (!/A02 OK/i.test(buffer)) {
          return finish({ success: false, error: `Folder ${folder} tidak ditemukan di Webmail.` });
        }
        const existsMatch = buffer.match(/\*\s+(\d+)\s+EXISTS/i);
        totalMessages = existsMatch ? parseInt(existsMatch[1], 10) : 0;
        buffer = '';

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 40);
        const totalPages = Math.max(1, Math.ceil(totalMessages / limitNum));

        if (totalMessages === 0) {
          return finish({ success: true, folder, account: user, total: 0, page: pageNum, totalPages: 1, messages: [] });
        }

        if (uid) {
          step = 'fetch_single';
          socket.write(`A03 UID FETCH ${parseInt(uid, 10)} (UID FLAGS INTERNALDATE BODY.PEEK[])\r\n`);
        } else {
          step = 'fetch_list';
          // Urutan pesan IMAP 1..totalMessages (terbaru = totalMessages).
          // Paging terbalik: Halaman 1 mengambil pesan-pesan paling baru.
          const endSeq = Math.max(1, totalMessages - (pageNum - 1) * limitNum);
          const startSeq = Math.max(1, endSeq - limitNum + 1);

          if (endSeq < 1 || (pageNum > 1 && totalMessages - (pageNum - 1) * limitNum < 1)) {
            return finish({
              success: true,
              folder,
              account: user,
              total: totalMessages,
              page: pageNum,
              totalPages,
              messages: [],
            });
          }

          socket.write(`A03 FETCH ${startSeq}:${endSeq} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])\r\n`);
        }
      } else if (step === 'fetch_list' && /A03 (OK|NO|BAD)/i.test(buffer)) {
        const rawBlocks = buffer.split(/^\*\s+\d+\s+FETCH\s+\(/m).slice(1);
        const messages = [];

        for (const block of rawBlocks) {
          const uidMatch = block.match(/UID\s+(\d+)/i);
          const flagsMatch = block.match(/FLAGS\s+\(([^)]*)\)/i);
          const intDateMatch = block.match(/INTERNALDATE\s+"([^"]+)"/i);
          const hdrStart = block.indexOf('\r\n');
          const hdrRaw = hdrStart !== -1 ? block.slice(hdrStart + 2) : block;
          const parsed = parseRawEmail(hdrRaw + '\r\n\r\n');

          if (uidMatch) {
            const flagsStr = flagsMatch ? flagsMatch[1] : '';
            messages.push({
              uid: parseInt(uidMatch[1], 10),
              seen: /\\Seen/i.test(flagsStr),
              answered: /\\Answered/i.test(flagsStr),
              internalDate: intDateMatch ? intDateMatch[1] : parsed.date,
              from: parsed.from,
              to: parsed.to,
              subject: parsed.subject,
              date: parsed.date || (intDateMatch ? intDateMatch[1] : ''),
              messageId: parsed.messageId,
            });
          }
        }

        messages.sort((a, b) => b.uid - a.uid);
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 40);
        const totalPages = Math.max(1, Math.ceil(totalMessages / limitNum));

        return finish({
          success: true,
          folder,
          account: user,
          total: totalMessages,
          page: pageNum,
          totalPages,
          messages,
        });
      } else if (step === 'fetch_single' && /A03 (OK|NO|BAD)/i.test(buffer)) {
        const literalMatch = buffer.match(/\{(\d+)\}\r\n/);
        let rawEmail = '';
        if (literalMatch) {
          const startIdx = buffer.indexOf(literalMatch[0]) + literalMatch[0].length;
          const byteLen = parseInt(literalMatch[1], 10);
          rawEmail = Buffer.from(buffer.slice(startIdx), 'utf8').subarray(0, byteLen).toString('utf8');
        } else {
          const firstNewline = buffer.indexOf('\r\n');
          rawEmail = firstNewline !== -1 ? buffer.slice(firstNewline + 2) : buffer;
        }
        const parsed = parseRawEmail(rawEmail);
        return finish({
          success: true,
          folder,
          account: user,
          uid: parseInt(uid, 10),
          message: parsed,
        });
      }
    });

    socket.on('error', (err) => {
      finish({ success: false, error: err.message });
    });
  });
}

/**
 * Verifikasi koneksi SMTP
 */
export async function verifySmtpConnection() {
  return transporter.verify();
}

/**
 * Menghapus pesan secara permanen dari server Webmail IMAP (Port 993 SSL) berdasarkan array UID.
 * Menggunakan protokol IMAP RFC 3501 (UID STORE +FLAGS (\Deleted) diikuti EXPUNGE).
 */
export async function deleteImapMessages({
  host = process.env.SMTP_HOST || 'smtp.gmail.com',
  user = process.env.SMTP_USERNAME || 'admin@prospekta.id',
  pass = process.env.SMTP_PASSWORD,
  folder = 'INBOX',
  uids = [],
}) {
  if (!user || !pass) {
    return { success: false, error: 'Kredensial IMAP belum dikonfigurasi.' };
  }

  const validUids = (uids || []).map((u) => parseInt(u, 10)).filter((u) => !isNaN(u) && u > 0);
  if (validUids.length === 0) {
    return { success: true, count: 0, deletedUids: [] };
  }

  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: 993,
      rejectUnauthorized: false,
    });

    let buffer = '';
    let step = 'greeting';

    const timeout = setTimeout(() => {
      try { socket.destroy(); } catch (_) {}
      resolve({ success: false, error: 'Koneksi IMAP timeout saat menghapus pesan.' });
    }, 12000);

    const finish = (res) => {
      clearTimeout(timeout);
      try { socket.end('A99 LOGOUT\r\n'); } catch (_) {}
      resolve(res);
    };

    const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

    const chunkSize = 50;
    const uidChunks = [];
    for (let i = 0; i < validUids.length; i += chunkSize) {
      uidChunks.push(validUids.slice(i, i + chunkSize));
    }
    let currentChunkIdx = 0;

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      if (step === 'greeting' && buffer.includes('\r\n')) {
        buffer = '';
        step = 'login';
        socket.write(`A01 LOGIN ${quote(user)} ${quote(pass)}\r\n`);
      } else if (step === 'login' && /A01 (OK|NO|BAD)/i.test(buffer)) {
        if (!/A01 OK/i.test(buffer)) {
          return finish({ success: false, error: 'Gagal otentikasi IMAP.' });
        }
        buffer = '';
        step = 'select';
        socket.write(`A02 SELECT ${quote(folder)}\r\n`);
      } else if (step === 'select' && /A02 (OK|NO|BAD)/i.test(buffer)) {
        if (!/A02 OK/i.test(buffer)) {
          return finish({ success: false, error: `Folder ${folder} tidak ditemukan.` });
        }
        buffer = '';
        step = 'store_flags';
        const chunkStr = uidChunks[currentChunkIdx].join(',');
        socket.write(`A03 UID STORE ${chunkStr} +FLAGS (\\Deleted)\r\n`);
      } else if (step === 'store_flags' && /A03 (OK|NO|BAD)/i.test(buffer)) {
        currentChunkIdx++;
        if (currentChunkIdx < uidChunks.length) {
          buffer = '';
          const chunkStr = uidChunks[currentChunkIdx].join(',');
          socket.write(`A03 UID STORE ${chunkStr} +FLAGS (\\Deleted)\r\n`);
        } else {
          buffer = '';
          step = 'expunge';
          socket.write(`A04 EXPUNGE\r\n`);
        }
      } else if (step === 'expunge' && /A04 (OK|NO|BAD)/i.test(buffer)) {
        const ok = /A04 OK/i.test(buffer);
        return finish({
          success: ok,
          count: validUids.length,
          deletedUids: validUids,
        });
      }
    });

    socket.on('error', (err) => {
      finish({ success: false, error: err.message });
    });
  });
}
