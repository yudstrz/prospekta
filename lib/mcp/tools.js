import { db, dbWrite } from '../db.js';
import { askCompanyAgent, getCompanyProfile, updateCompanyProfile } from '../company-agent.js';
import { generateProposalDraft, generatePrebuiltSiteConfig } from '../llm.js';
import { sendEmail, fetchImapMailbox } from '../email.js';

/**
 * Katalog definisi tool MCP User
 */
export const USER_TOOLS = [
  {
    name: 'location_search',
    description: 'Cari bisnis atau lokasi dari database Prospekta berdasarkan kata kunci, anchor, atau bidang usaha.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci nama bisnis atau alamat' },
        category: { type: 'string', description: 'Kategori atau bidang usaha (opsional)' },
        limit: { type: 'integer', description: 'Jumlah hasil maksimal (default: 10)' }
      }
    }
  },
  {
    name: 'location_list_mine',
    description: 'Menampilkan daftar lokasi dan prospek bisnis yang tersimpan untuk akun Anda.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah data (default: 20)' },
        offset: { type: 'integer', description: 'Offset pagination' }
      }
    }
  },
  {
    name: 'location_enrich',
    description: 'Mengambil detail profil bisnis, nomor telepon/whatsapp, website, dan estimasi audit untuk place_id tertentu.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat (overture_id) dari database' }
      },
      required: ['placeId']
    }
  },
  {
    name: 'pdf_generate',
    description: 'Generate draf dokumen proposal resmi / laporan audit bisnis siap cetak atau simpan sebagai PDF.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat yang akan dibuatkan proposal' },
        title: { type: 'string', description: 'Judul proposal/dokumen' },
        lang: { type: 'string', enum: ['id', 'en'], description: 'Bahasa proposal (default: id)' }
      },
      required: ['placeId']
    }
  },
  {
    name: 'pdf_list_mine',
    description: 'Melihat arsip draf proposal dan dokumen PDF yang pernah dibuat oleh akun Anda.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah dokumen (default: 20)' }
      }
    }
  },
  {
    name: 'website_generate',
    description: 'Membuat live prototype landing page modern dinamis (/p/[slug]) untuk bisnis calon klien.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat bisnis yang ingin dibuatkan website' }
      },
      required: ['placeId']
    }
  },
  {
    name: 'website_list_mine',
    description: 'Melihat daftar live prototype website (/p/[slug]) yang telah digenerate oleh akun Anda.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah website (default: 20)' }
      }
    }
  },
  {
    name: 'agent_ask',
    description: 'Bertanya atau meminta analisis mendalam ke Company AI Agent Prospekta (menggunakan Agnes API Flash Unlimited & Knowledge Base Perusahaan).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Pertanyaan atau instruksi operasional untuk AI Agent' },
        contextData: { type: 'string', description: 'Data tambahan atau konteks bisnis (opsional)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'email_mcp_draft',
    description: 'Menyusun draf email penawaran profesional berbasis data lokasi atau prototype website (opsional, draf saja).',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat prospek' },
        purpose: { type: 'string', description: 'Tujuan email (misal: perkenalan solusi digital)' }
      },
      required: ['placeId']
    }
  },
  {
    name: 'email_mcp_send',
    description: 'Mengirim email resmi melalui akun email pribadi yang terhubung di Prospekta via MCP atau Gmail Prospekta.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Alamat email penerima' },
        subject: { type: 'string', description: 'Subjek email' },
        body: { type: 'string', description: 'Isi pesan teks email' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'gmail_send_email',
    description: 'Kirim email melalui Gmail MCP (memakai akun Gmail Prospekta aktif atau akun Gmail pribadi yang terhubung).',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Alamat email penerima' },
        subject: { type: 'string', description: 'Subjek email' },
        body: { type: 'string', description: 'Isi pesan email' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'gmail_create_draft',
    description: 'Membuat draf penawaran email cerdas untuk prospek bisnis via Gmail MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'ID tempat prospek' },
        purpose: { type: 'string', description: 'Tujuan penawaran' }
      },
      required: ['placeId']
    }
  },
  {
    name: 'gmail_read_inbox',
    description: 'Membaca daftar pesan masuk terbaru di Gmail (INBOX) via Gmail MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah pesan terbaru yang dibaca (default: 5)' }
      }
    }
  }
];

/**
 * Katalog definisi tool MCP Admin (Mewarisi tool user + kemampuan administratif)
 */
export const ADMIN_TOOLS = [
  ...USER_TOOLS,
  {
    name: 'admin_users_list',
    description: 'Melihat seluruh daftar pengguna terdaftar beserta peran (admin/user) dan status aktifnya.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah user (default: 50)' }
      }
    }
  },
  {
    name: 'admin_user_upsert',
    description: 'Membuat user baru, mengubah peran (admin <-> user), atau mengaktifkan/menonaktifkan akun.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email pengguna' },
        name: { type: 'string', description: 'Nama lengkap pengguna' },
        role: { type: 'string', enum: ['admin', 'user'], description: 'Peran akun' },
        password: { type: 'string', description: 'Password baru (opsional jika hanya edit)' },
        isActive: { type: 'boolean', description: 'Status aktif akun' }
      },
      required: ['email']
    }
  },
  {
    name: 'admin_mcp_tokens_manage',
    description: 'Melihat atau mencabut (revoke) token MCP pengguna di sistem.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'revoke'], description: 'Aksi yang dilakukan' },
        tokenId: { type: 'string', description: 'ID token yang ingin dicabut (jika action: revoke)' }
      },
      required: ['action']
    }
  },
  {
    name: 'admin_agent_get_config',
    description: 'Melihat konfigurasi aktif Company AI Agent, system prompt, dan knowledge base perusahaan.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'admin_agent_update_knowledge',
    description: 'Melatih atau memperbarui knowledge base perusahaan dan instruksi Company AI Agent.',
    inputSchema: {
      type: 'object',
      properties: {
        systemPrompt: { type: 'string', description: 'Instruksi sistem baru untuk Company AI Agent' },
        knowledgeMarkdown: { type: 'string', description: 'Dokumen markdown knowledge base perusahaan yang baru' },
        modelId: { type: 'string', description: 'Model ID Agnes (default: gemini-2.0-flash-lite)' }
      }
    }
  },
  {
    name: 'admin_locations_list_all',
    description: 'Mengakses seluruh data tempat dan hasil penelusuran lokasi lintas pengguna.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah data (default: 50)' }
      }
    }
  },
  {
    name: 'admin_websites_list_all',
    description: 'Mengakses dan mengelola seluruh prototype website (/p/[slug]) yang ada di sistem.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah website (default: 50)' }
      }
    }
  },
  {
    name: 'admin_audit_logs',
    description: 'Melihat log riwayat pemanggilan tool MCP untuk audit keamanan dan pemantauan aktivitas.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Jumlah baris audit log (default: 50)' }
      }
    }
  }
];

/**
 * Eksekutor Tool MCP
 */
export async function executeMcpTool(toolName, args = {}, context) {
  const { userId, role } = context;
  const isAdminRole = role === 'admin';

  switch (toolName) {
    case 'location_search': {
      const q = `%${(args.query || '').trim()}%`;
      const lim = Math.min(Number(args.limit) || 10, 50);
      const res = await db.execute({
        sql: `
          SELECT overture_id, name, bidang_usaha, address, phone, website, google_rating
          FROM places
          WHERE (name LIKE ? OR address LIKE ? OR bidang_usaha LIKE ?)
          LIMIT ?;
        `,
        args: [q, q, q, lim]
      });
      return { count: res.rows?.length || 0, places: res.rows || [] };
    }

    case 'location_list_mine': {
      const lim = Math.min(Number(args.limit) || 20, 100);
      const offset = Number(args.offset) || 0;
      let sql = `SELECT overture_id, name, bidang_usaha, address, phone, website, reach_status, has_prebuilt_site, prebuilt_slug FROM places`;
      const qArgs = [];
      if (!isAdminRole && userId) {
        sql += ` WHERE owner_user_id = ? OR owner_user_id IS NULL`;
        qArgs.push(userId);
      }
      sql += ` ORDER BY scraped_at DESC LIMIT ? OFFSET ?;`;
      qArgs.push(lim, offset);
      const res = await db.execute({ sql, args: qArgs });
      return { count: res.rows?.length || 0, places: res.rows || [] };
    }

    case 'location_enrich': {
      const res = await db.execute({
        sql: `SELECT * FROM places WHERE overture_id = ? LIMIT 1;`,
        args: [args.placeId]
      });
      const place = res.rows?.[0];
      if (!place) throw new Error(`Tempat dengan ID "${args.placeId}" tidak ditemukan.`);
      return { success: true, place };
    }

    case 'pdf_generate': {
      const res = await db.execute({
        sql: `SELECT * FROM places WHERE overture_id = ? LIMIT 1;`,
        args: [args.placeId]
      });
      const place = res.rows?.[0];
      if (!place) throw new Error(`Tempat dengan ID "${args.placeId}" tidak ditemukan.`);

      const lang = args.lang || 'id';
      const proposalMarkdown = await generateProposalDraft({
        place,
        analysis: {},
        lang,
        companyName: place.name
      });

      const docId = `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const title = args.title || `Proposal Kemitraan Digital - ${place.name}`;

      await db.execute({
        sql: `
          INSERT INTO pdf_documents (id, user_id, place_id, title, storage_key, public_url)
          VALUES (?, ?, ?, ?, ?, ?);
        `,
        args: [docId, userId || 'usr_system', args.placeId, title, `proposals/${docId}.md`, null]
      });

      return {
        success: true,
        documentId: docId,
        title,
        placeName: place.name,
        contentMarkdown: proposalMarkdown,
        downloadHint: 'Buka Pratinjau Proposal di aplikasi web Prospekta untuk mengunduh versi PDF resmi atau gunakan fitur cetak PDF.'
      };
    }

    case 'pdf_list_mine': {
      const lim = Math.min(Number(args.limit) || 20, 50);
      const res = await db.execute({
        sql: `
          SELECT d.*, p.name as place_name
          FROM pdf_documents d
          LEFT JOIN places p ON p.overture_id = d.place_id
          WHERE d.user_id = ?
          ORDER BY d.created_at DESC
          LIMIT ?;
        `,
        args: [userId || 'usr_system', lim]
      });
      return { count: res.rows?.length || 0, documents: res.rows || [] };
    }

    case 'website_generate': {
      const res = await db.execute({
        sql: `SELECT * FROM places WHERE overture_id = ? LIMIT 1;`,
        args: [args.placeId]
      });
      const place = res.rows?.[0];
      if (!place) throw new Error(`Tempat dengan ID "${args.placeId}" tidak ditemukan.`);

      // Cek apakah sudah ada website
      const existing = await db.execute({
        sql: `SELECT slug FROM prebuilt_websites WHERE place_id = ? LIMIT 1;`,
        args: [args.placeId]
      });
      if (existing.rows?.[0]?.slug) {
        return {
          success: true,
          slug: existing.rows[0].slug,
          previewUrl: `/p/${existing.rows[0].slug}`,
          status: 'already_exists'
        };
      }

      const slug = `${place.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}-${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();
      const siteConfig = await generatePrebuiltSiteConfig({ place, analysis: {}, lang: 'id' });

      await db.execute({
        sql: `
          INSERT INTO prebuilt_websites (
            place_id, slug, company_name, industry, phone, email,
            hero_headline, hero_subheadline, services_json, created_at, owner_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        args: [
          args.placeId,
          slug,
          place.name,
          place.bidang_usaha || place.category_raw || 'Business',
          place.phone || '',
          place.email || '',
          siteConfig.heroHeadline || `Transformasi Digital ${place.name}`,
          siteConfig.heroSubheadline || 'Prototype Website Interaktif',
          JSON.stringify(siteConfig),
          nowIso,
          userId || null
        ]
      });

      await db.execute({
        sql: `UPDATE places SET has_prebuilt_site = 1, prebuilt_slug = ? WHERE overture_id = ?;`,
        args: [slug, args.placeId]
      });

      return {
        success: true,
        slug,
        previewUrl: `/p/${slug}`,
        companyName: place.name,
        status: 'created'
      };
    }

    case 'website_list_mine': {
      const lim = Math.min(Number(args.limit) || 20, 50);
      let sql = `SELECT id, place_id, slug, company_name, views_count, created_at FROM prebuilt_websites`;
      const qArgs = [];
      if (!isAdminRole && userId) {
        sql += ` WHERE owner_user_id = ? OR owner_user_id IS NULL`;
        qArgs.push(userId);
      }
      sql += ` ORDER BY created_at DESC LIMIT ?;`;
      qArgs.push(lim);
      const res = await db.execute({ sql, args: qArgs });
      return { count: res.rows?.length || 0, websites: res.rows || [] };
    }

    case 'agent_ask': {
      const reply = await askCompanyAgent({
        prompt: args.prompt,
        contextData: args.contextData || '',
        role: role || 'user'
      });
      return { reply };
    }

    case 'gmail_create_draft':
    case 'email_mcp_draft': {
      const res = await db.execute({
        sql: `SELECT * FROM places WHERE overture_id = ? LIMIT 1;`,
        args: [args.placeId]
      });
      const place = res.rows?.[0];
      if (!place) throw new Error(`Tempat dengan ID "${args.placeId}" tidak ditemukan.`);

      const draft = await askCompanyAgent({
        prompt: `Tulis draf email perkenalan kemitraan yang sangat ringkas (< 60 kata), ramah, dan profesional untuk ${place.name}. Tujuan: ${args.purpose || 'Menawarkan kolaborasi digital'}. Cantumkan link Google Calendar kami untuk diskusi santai 15 menit.`
      });

      return {
        recipient: place.email || '(Isi email tujuan)',
        companyName: place.name,
        subject: `Perkenalan Kolaborasi Kemitraan - ${place.name}`,
        bodyText: draft
      };
    }

    case 'gmail_send_email':
    case 'email_mcp_send': {
      let tenantId = context.tenantId || null;
      if (!tenantId && userId) {
        const uRes = await db.execute({
          sql: `SELECT tenant_id FROM users WHERE id = ? LIMIT 1;`,
          args: [userId]
        }).catch(() => ({ rows: [] }));
        tenantId = uRes.rows?.[0]?.tenant_id || null;
      }
      if (!tenantId && isAdminRole) tenantId = 'tnt_master';

      const sent = await sendEmail({
        to: args.to,
        subject: args.subject,
        text: args.body,
        tenantId,
      });

      return {
        success: true,
        provider: sent.provider,
        from: sent.replyTo || sent.fromEmail,
        relayFrom: sent.fromEmail,
        replyTo: sent.replyTo,
        to: args.to,
        subject: args.subject,
        message: `Email berhasil terkirim ke ${args.to} (Balasan ke: ${sent.replyTo}).`
      };
    }

    case 'gmail_read_inbox': {
      const lim = Math.min(Number(args.limit) || 5, 20);
      const imapRes = await fetchImapMailbox({ limit: lim });
      if (!imapRes.success) {
        return { success: false, error: imapRes.error || 'Gagal membaca inbox Gmail via IMAP.' };
      }
      return {
        success: true,
        account: imapRes.account || process.env.SMTP_USERNAME,
        count: imapRes.messages?.length || 0,
        messages: (imapRes.messages || []).map(m => ({
          uid: m.uid,
          from: m.from,
          subject: m.subject,
          date: m.date,
          snippet: m.snippet || m.text?.slice(0, 150)
        }))
      };
    }

    // ================= ADMIN TOOLS =================
    case 'admin_users_list': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat melihat daftar pengguna.');
      const lim = Math.min(Number(args.limit) || 50, 100);
      const res = await db.execute({
        sql: `SELECT id, email, name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT ?;`,
        args: [lim]
      });
      return { count: res.rows?.length || 0, users: res.rows || [] };
    }

    case 'admin_user_upsert': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat mengelola pengguna.');
      const { email, name, role: newRole = 'user', password, isActive = true } = args;
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = (name || cleanEmail.split('@')[0]).trim();
      const userRole = newRole === 'admin' ? 'admin' : 'user';

      const existing = await db.execute({
        sql: `SELECT id, password_hash FROM users WHERE email = ? LIMIT 1;`,
        args: [cleanEmail]
      });

      let pwHash = existing.rows?.[0]?.password_hash || '';
      if (password) {
        const { hashPassword } = await import('../tenant.js');
        pwHash = await hashPassword(password);
      }

      if (existing.rows?.[0]) {
        await db.execute({
          sql: `
            UPDATE users
            SET name = ?, role = ?, is_active = ?, password_hash = COALESCE(NULLIF(?, ''), password_hash), updated_at = CURRENT_TIMESTAMP
            WHERE email = ?;
          `,
          args: [cleanName, userRole, isActive, pwHash || null, cleanEmail]
        });
        return { success: true, action: 'updated', email: cleanEmail, role: userRole };
      } else {
        const newId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        if (!pwHash) {
          const { hashPassword } = await import('../tenant.js');
          pwHash = await hashPassword('Prospekta2026!');
        }
        await db.execute({
          sql: `
            INSERT INTO users (id, email, name, password_hash, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?);
          `,
          args: [newId, cleanEmail, cleanName, pwHash, userRole, isActive]
        });
        return { success: true, action: 'created', id: newId, email: cleanEmail, role: userRole };
      }
    }

    case 'admin_mcp_tokens_manage': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat mengelola token MCP.');
      if (args.action === 'revoke') {
        if (!args.tokenId) throw new Error('tokenId diperlukan untuk mencabut token.');
        await db.execute({
          sql: `UPDATE mcp_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?;`,
          args: [args.tokenId]
        });
        return { success: true, message: `Token ${args.tokenId} berhasil dicabut.` };
      } else {
        const res = await db.execute(`
          SELECT t.id, t.user_id, u.email, t.label, t.token_prefix, t.scope, t.last_used_at, t.revoked_at, t.created_at
          FROM mcp_tokens t
          JOIN users u ON u.id = t.user_id
          ORDER BY t.created_at DESC
          LIMIT 50;
        `);
        return { count: res.rows?.length || 0, tokens: res.rows || [] };
      }
    }

    case 'admin_agent_get_config': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat melihat konfigurasi AI Agent.');
      return getCompanyProfile();
    }

    case 'admin_agent_update_knowledge': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat memperbarui knowledge base AI Agent.');
      const updated = await updateCompanyProfile({
        systemPrompt: args.systemPrompt,
        knowledgeMarkdown: args.knowledgeMarkdown,
        modelId: args.modelId,
        userId
      });
      return { success: true, profile: updated };
    }

    case 'admin_locations_list_all': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat melihat seluruh lokasi.');
      const lim = Math.min(Number(args.limit) || 50, 200);
      const res = await db.execute({
        sql: `SELECT overture_id, name, bidang_usaha, address, phone, website, reach_status, owner_user_id, scraped_at FROM places ORDER BY scraped_at DESC LIMIT ?;`,
        args: [lim]
      });
      return { count: res.rows?.length || 0, places: res.rows || [] };
    }

    case 'admin_websites_list_all': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat melihat seluruh website.');
      const lim = Math.min(Number(args.limit) || 50, 200);
      const res = await db.execute({
        sql: `SELECT id, place_id, slug, company_name, views_count, owner_user_id, created_at FROM prebuilt_websites ORDER BY created_at DESC LIMIT ?;`,
        args: [lim]
      });
      return { count: res.rows?.length || 0, websites: res.rows || [] };
    }

    case 'admin_audit_logs': {
      if (!isAdminRole) throw new Error('Akses ditolak: Hanya Admin yang dapat membaca audit log.');
      const lim = Math.min(Number(args.limit) || 50, 100);
      const res = await db.execute({
        sql: `SELECT id, user_id, role, endpoint, tool_name, status, duration_ms, created_at FROM mcp_audit_logs ORDER BY created_at DESC LIMIT ?;`,
        args: [lim]
      });
      return { count: res.rows?.length || 0, logs: res.rows || [] };
    }

    default:
      throw new Error(`Tool "${toolName}" tidak dikenal atau tidak tersedia untuk peran ${role}.`);
  }
}
